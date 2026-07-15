import {
  db,
  alertConfigTable,
  alertProvidersTable,
  alertRecipientsTable,
  alertLogTable,
  alertSuppressionTable,
  jobsTable,
} from "@workspace/db";
import { eq, and, isNotNull, notInArray } from "drizzle-orm";
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

// ─── Retry helper ─────────────────────────────────────────────────────────────
// Retries `fn` once after a 2-second delay on any error.
async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await new Promise(r => setTimeout(r, 2000));
    return fn(); // let the second attempt throw naturally
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

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

  // ── Duplicate suppression check (for low_stock only — read before send) ────
  let suppressionKey: string | null = null;
  if (eventType === "low_stock" && meta?.materialId) {
    suppressionKey = `low_stock_${meta.materialId}`;
    const [sup] = await db
      .select()
      .from(alertSuppressionTable)
      .where(eq(alertSuppressionTable.key, suppressionKey));
    if (sup) {
      const hoursSinceLast = (Date.now() - new Date(sup.lastAlertedAt).getTime()) / 3600000;
      if (hoursSinceLast < 24) return;
    }
  }

  const channels: string[] = [];
  if (config.whatsappEnabled) channels.push("whatsapp");
  if (config.emailEnabled) channels.push("email");

  let anySent = false;

  for (const channel of channels) {
    const [provider] = await db
      .select()
      .from(alertProvidersTable)
      .where(and(eq(alertProvidersTable.channel, channel), eq(alertProvidersTable.enabled, true)));

    if (!provider?.apiKey) {
      // Log missing/disabled provider so failures are never silent
      await db.insert(alertLogTable).values({
        eventType,
        channel,
        recipient: "(no provider)",
        status: "failed",
        errorMessage: provider
          ? "Provider is disabled or missing API key"
          : "No provider configured for this channel",
        messageBody: message,
      });
      continue;
    }

    const recipients = await db
      .select()
      .from(alertRecipientsTable)
      .where(eq(alertRecipientsTable.channel, channel));

    if (recipients.length === 0) {
      await db.insert(alertLogTable).values({
        eventType,
        channel,
        recipient: "(no recipients)",
        status: "failed",
        errorMessage: "No recipients configured for this channel",
        messageBody: message,
      });
      continue;
    }

    for (const recipient of recipients) {
      try {
        if (channel === "whatsapp") {
          await withRetryOnce(() => sendWhatsApp(provider, recipient.address, message));
        } else {
          await withRetryOnce(() => sendEmail(provider, recipient.address, eventType, message));
        }
        await db.insert(alertLogTable).values({
          eventType,
          channel,
          recipient: recipient.address,
          status: "sent",
          messageBody: message,
        });
        logger.info({ eventType, channel, to: recipient.address }, "External alert sent");
        anySent = true;
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

  // ── Only update suppression AFTER at least one alert was successfully sent ──
  if (anySent && suppressionKey) {
    await db
      .insert(alertSuppressionTable)
      .values({ key: suppressionKey, lastAlertedAt: new Date() })
      .onConflictDoUpdate({
        target: alertSuppressionTable.key,
        set: { lastAlertedAt: new Date() },
      });
  }
}

// ─── Provider send functions ───────────────────────────────────────────────────

async function sendWhatsApp(
  provider: { apiSid: string | null; apiKey: string | null; fromAddress: string | null },
  to: string,
  body: string
): Promise<void> {
  const { apiSid, apiKey: authToken, fromAddress } = provider;
  if (!apiSid || !authToken || !fromAddress)
    throw new Error("Twilio credentials incomplete (need Account SID, Auth Token, From number)");

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
  if (!apiKey || !fromAddress)
    throw new Error("Resend credentials incomplete (need API Key and From address)");

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

// ─── Overdue job alert checker ────────────────────────────────────────────────
// Runs on a periodic interval. Uses scheduledDate (text "YYYY-MM-DD") to
// determine overdue status. Alerts only for jobs that have a scheduled date
// that is in the past and are not yet completed or cancelled.
// Suppression: only alerts once per 24 h per job, and only written after
// a successful send (mirrors dispatchExternalAlert behaviour).

export async function checkAndAlertOverdueJobs(): Promise<void> {
  const [config] = await db
    .select()
    .from(alertConfigTable)
    .where(eq(alertConfigTable.eventType, "job_overdue"));
  if (!config || (!config.whatsappEnabled && !config.emailEnabled)) return;

  // Today as "YYYY-MM-DD" in UTC — matches the text column format.
  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch jobs with a past scheduled date that are still active.
  const activeJobs = await db
    .select({
      id: jobsTable.id,
      jobCode: jobsTable.jobCode,
      jobName: jobsTable.jobName,
      clientName: jobsTable.clientName,
      scheduledDate: jobsTable.scheduledDate,
    })
    .from(jobsTable)
    .where(
      and(
        isNotNull(jobsTable.scheduledDate),
        notInArray(jobsTable.status, ["completed", "cancelled"])
      )
    );

  // Filter in JS: scheduledDate < today and is a valid date string.
  const overdueJobs = activeJobs.filter(j => {
    const sd = j.scheduledDate;
    return typeof sd === "string" && sd.length === 10 && sd < todayStr;
  });

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

    const message = `Job ${job.jobCode} (${job.jobName}) for ${job.clientName} is overdue (was due ${job.scheduledDate}).`;

    // Track whether any delivery succeeded so we can write suppression.
    let anySent = false;
    const channels: string[] = [];
    if (config.whatsappEnabled) channels.push("whatsapp");
    if (config.emailEnabled) channels.push("email");

    for (const channel of channels) {
      const [provider] = await db
        .select()
        .from(alertProvidersTable)
        .where(and(eq(alertProvidersTable.channel, channel), eq(alertProvidersTable.enabled, true)));

      if (!provider?.apiKey) {
        await db.insert(alertLogTable).values({
          eventType: "job_overdue",
          channel,
          recipient: "(no provider)",
          status: "failed",
          errorMessage: provider ? "Provider is disabled or missing API key" : "No provider configured",
          messageBody: message,
        });
        continue;
      }

      const recipients = await db
        .select()
        .from(alertRecipientsTable)
        .where(eq(alertRecipientsTable.channel, channel));

      if (recipients.length === 0) {
        await db.insert(alertLogTable).values({
          eventType: "job_overdue",
          channel,
          recipient: "(no recipients)",
          status: "failed",
          errorMessage: "No recipients configured",
          messageBody: message,
        });
        continue;
      }

      for (const recipient of recipients) {
        try {
          if (channel === "whatsapp") {
            await withRetryOnce(() => sendWhatsApp(provider, recipient.address, message));
          } else {
            await withRetryOnce(() => sendEmail(provider, recipient.address, "job_overdue", message));
          }
          await db.insert(alertLogTable).values({
            eventType: "job_overdue",
            channel,
            recipient: recipient.address,
            status: "sent",
            messageBody: message,
          });
          logger.info({ jobId: job.id, channel, to: recipient.address }, "Overdue job alert sent");
          anySent = true;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          await db.insert(alertLogTable).values({
            eventType: "job_overdue",
            channel,
            recipient: recipient.address,
            status: "failed",
            errorMessage,
            messageBody: message,
          });
          logger.warn({ jobId: job.id, channel, errorMessage }, "Overdue job alert failed");
        }
      }
    }

    // Only suppress after a successful send to avoid hiding future retries.
    if (anySent) {
      await db
        .insert(alertSuppressionTable)
        .values({ key, lastAlertedAt: new Date() })
        .onConflictDoUpdate({
          target: alertSuppressionTable.key,
          set: { lastAlertedAt: new Date() },
        });
    }
  }
}
