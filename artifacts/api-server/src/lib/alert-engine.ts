import { db, alertConfigTable, alertProvidersTable, alertRecipientsTable, alertLogTable, alertSuppressionTable, jobsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "./logger";

const EVENT_TYPE_MAP: Record<string, string> = {
  "low-stock": "low_stock",
  "job-completed": "job_completed",
  "machine-paused": "machine_issue",
  "job-overdue": "job_overdue",
};

const EVENT_TITLES: Record<string, string> = {
  low_stock: "Low Stock Alert",
  job_completed: "Job Completed",
  machine_issue: "Machine Issue",
  job_overdue: "Job Overdue",
};

export async function dispatchExternalAlert(
  notificationType: string,
  message: string,
  meta?: { materialId?: number }
): Promise<void> {
  const eventType = EVENT_TYPE_MAP[notificationType];
  if (!eventType) return;

  const [config] = await db
    .select()
    .from(alertConfigTable)
    .where(eq(alertConfigTable.eventType, eventType));
  if (!config || (!config.whatsappEnabled && !config.emailEnabled)) return;

  if (eventType === "low_stock" && meta?.materialId) {
    const key = `low_stock_${meta.materialId}`;
    const [sup] = await db
      .select()
      .from(alertSuppressionTable)
      .where(eq(alertSuppressionTable.key, key));
    if (sup) {
      const hoursSinceLast = (Date.now() - new Date(sup.lastAlertedAt).getTime()) / 3600000;
      if (hoursSinceLast < 24) return;
    }
    await db
      .insert(alertSuppressionTable)
      .values({ key, lastAlertedAt: new Date() })
      .onConflictDoUpdate({
        target: alertSuppressionTable.key,
        set: { lastAlertedAt: new Date() },
      });
  }

  const channels: string[] = [];
  if (config.whatsappEnabled) channels.push("whatsapp");
  if (config.emailEnabled) channels.push("email");

  for (const channel of channels) {
    const [provider] = await db
      .select()
      .from(alertProvidersTable)
      .where(and(eq(alertProvidersTable.channel, channel), eq(alertProvidersTable.enabled, true)));
    if (!provider?.apiKey) continue;

    const recipients = await db
      .select()
      .from(alertRecipientsTable)
      .where(eq(alertRecipientsTable.channel, channel));
    if (recipients.length === 0) continue;

    for (const recipient of recipients) {
      try {
        if (channel === "whatsapp") {
          await sendWhatsApp(provider, recipient.address, message);
        } else {
          await sendEmail(provider, recipient.address, eventType, message);
        }
        await db.insert(alertLogTable).values({
          eventType,
          channel,
          recipient: recipient.address,
          status: "sent",
          messageBody: message,
        });
        logger.info({ eventType, channel, to: recipient.address }, "External alert sent");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await db.insert(alertLogTable).values({
          eventType,
          channel,
          recipient: recipient.address,
          status: "failed",
          errorMessage,
          messageBody: message,
        });
        logger.warn({ eventType, channel, to: recipient.address, errorMessage }, "External alert failed");
      }
    }
  }
}

async function sendWhatsApp(
  provider: { apiSid: string | null; apiKey: string | null; fromAddress: string | null },
  to: string,
  body: string
): Promise<void> {
  const { apiSid, apiKey: authToken, fromAddress } = provider;
  if (!apiSid || !authToken || !fromAddress) throw new Error("Twilio credentials incomplete (need Account SID, Auth Token, From number)");

  const toFmt = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const fromFmt = fromAddress.startsWith("whatsapp:") ? fromAddress : `whatsapp:${fromAddress}`;
  const credentials = Buffer.from(`${apiSid}:${authToken}`).toString("base64");

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${apiSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: toFmt, From: fromFmt, Body: body }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Twilio ${resp.status}: ${text.slice(0, 200)}`);
  }
}

async function sendEmail(
  provider: { apiKey: string | null; fromAddress: string | null },
  to: string,
  eventType: string,
  body: string
): Promise<void> {
  const { apiKey, fromAddress } = provider;
  if (!apiKey || !fromAddress) throw new Error("Resend credentials incomplete (need API Key and From address)");

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [to],
      subject: `PrintFlow: ${EVENT_TITLES[eventType] ?? eventType}`,
      text: body,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend ${resp.status}: ${text.slice(0, 200)}`);
  }
}

export async function checkAndAlertOverdueJobs(): Promise<void> {
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const overdueJobs = await db
    .select({ id: jobsTable.id, jobCode: jobsTable.jobCode, jobName: jobsTable.jobName, clientName: jobsTable.clientName })
    .from(jobsTable)
    .where(and(eq(jobsTable.status, "pending"), lt(jobsTable.createdAt, twoDaysAgo)));

  const [config] = await db
    .select()
    .from(alertConfigTable)
    .where(eq(alertConfigTable.eventType, "job_overdue"));
  if (!config || (!config.whatsappEnabled && !config.emailEnabled)) return;

  for (const job of overdueJobs) {
    const key = `job_overdue_${job.id}`;
    const [sup] = await db
      .select()
      .from(alertSuppressionTable)
      .where(eq(alertSuppressionTable.key, key));
    if (sup) {
      const hoursSinceLast = (Date.now() - new Date(sup.lastAlertedAt).getTime()) / 3600000;
      if (hoursSinceLast < 24) continue;
    }

    const message = `Job ${job.jobCode} (${job.jobName}) for ${job.clientName} is overdue and still pending.`;
    await dispatchExternalAlert("job-overdue", message);
    await db
      .insert(alertSuppressionTable)
      .values({ key, lastAlertedAt: new Date() })
      .onConflictDoUpdate({ target: alertSuppressionTable.key, set: { lastAlertedAt: new Date() } });
  }
}
