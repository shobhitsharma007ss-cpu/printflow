import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  alertConfigTable,
  alertProvidersTable,
  alertRecipientsTable,
  alertLogTable,
} from "@workspace/db";
import { dispatchExternalAlert } from "../lib/alert-engine";

const router: IRouter = Router();

const EVENT_TYPES = ["low_stock", "job_completed", "machine_issue", "job_overdue"] as const;
type EventType = typeof EVENT_TYPES[number];

async function ensureDefaultConfigs(): Promise<void> {
  for (const eventType of EVENT_TYPES) {
    const existing = await db
      .select({ id: alertConfigTable.id })
      .from(alertConfigTable)
      .where(eq(alertConfigTable.eventType, eventType));
    if (existing.length === 0) {
      await db.insert(alertConfigTable).values({ eventType, whatsappEnabled: false, emailEnabled: false });
    }
  }
}

router.get("/alert-config", async (_req, res): Promise<void> => {
  await ensureDefaultConfigs();
  const configs = await db.select().from(alertConfigTable);
  res.json(configs);
});

router.put("/alert-config/:eventType", async (req, res): Promise<void> => {
  const { eventType } = req.params;
  if (!EVENT_TYPES.includes(eventType as EventType)) {
    res.status(400).json({ error: "Invalid event type" });
    return;
  }
  const { whatsappEnabled, emailEnabled } = req.body;
  const [row] = await db
    .insert(alertConfigTable)
    .values({ eventType, whatsappEnabled: !!whatsappEnabled, emailEnabled: !!emailEnabled })
    .onConflictDoUpdate({
      target: alertConfigTable.eventType,
      set: { whatsappEnabled: !!whatsappEnabled, emailEnabled: !!emailEnabled, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

router.get("/alert-providers", async (_req, res): Promise<void> => {
  const providers = await db.select().from(alertProvidersTable);
  const masked = providers.map(p => ({
    ...p,
    apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}${"•".repeat(Math.max(0, p.apiKey.length - 4))}` : null,
    apiSid: p.apiSid ?? null,
  }));
  res.json(masked);
});

router.put("/alert-providers/:channel", async (req, res): Promise<void> => {
  const { channel } = req.params;
  if (channel !== "whatsapp" && channel !== "email") {
    res.status(400).json({ error: "Channel must be 'whatsapp' or 'email'" });
    return;
  }
  const { provider, apiKey, apiSid, fromAddress, enabled } = req.body;

  const updateData: Record<string, unknown> = {
    channel,
    provider: provider ?? null,
    fromAddress: fromAddress ?? null,
    enabled: !!enabled,
    updatedAt: new Date(),
  };
  if (apiKey && !apiKey.includes("•")) {
    updateData.apiKey = apiKey;
  }
  if (apiSid !== undefined) {
    updateData.apiSid = apiSid ?? null;
  }

  const [row] = await db
    .insert(alertProvidersTable)
    .values({ channel, provider: provider ?? null, apiKey: apiKey ?? null, apiSid: apiSid ?? null, fromAddress: fromAddress ?? null, enabled: !!enabled })
    .onConflictDoUpdate({ target: alertProvidersTable.channel, set: updateData })
    .returning();
  res.json({ ...row, apiKey: row.apiKey ? `${row.apiKey.slice(0, 4)}${"•".repeat(Math.max(0, row.apiKey.length - 4))}` : null });
});

router.get("/alert-recipients", async (_req, res): Promise<void> => {
  const rows = await db.select().from(alertRecipientsTable);
  res.json(rows);
});

router.post("/alert-recipients", async (req, res): Promise<void> => {
  const { channel, address, label } = req.body;
  if (!channel || !address) {
    res.status(400).json({ error: "channel and address are required" });
    return;
  }
  const [row] = await db
    .insert(alertRecipientsTable)
    .values({ channel, address: address.trim(), label: label ?? null })
    .returning();
  res.status(201).json(row);
});

router.delete("/alert-recipients/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(alertRecipientsTable).where(eq(alertRecipientsTable.id, id));
  res.sendStatus(204);
});

router.get("/alert-log", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(alertLogTable)
    .orderBy(desc(alertLogTable.sentAt))
    .limit(80);
  res.json(rows);
});

router.post("/alerts/test", async (req, res): Promise<void> => {
  const { channel, eventType } = req.body;
  if (!channel || !eventType) {
    res.status(400).json({ error: "channel and eventType are required" });
    return;
  }

  const notifTypeMap: Record<string, string> = {
    low_stock: "low-stock",
    job_completed: "job-completed",
    machine_issue: "machine-paused",
    job_overdue: "job-overdue",
  };
  const notifType = notifTypeMap[eventType];
  if (!notifType) { res.status(400).json({ error: "Invalid event type" }); return; }

  const testMessages: Record<string, string> = {
    low_stock: "Test: Grey Back Duplex is at 50 sheets (reorder level: 200). Reorder soon.",
    job_completed: "Test: JOB-001 — Sample Job for Acme Corp completed successfully.",
    machine_issue: "Test: Press Machine paused — breakdown. Please attend.",
    job_overdue: "Test: JOB-002 (Sample Job) for Widget Co is overdue and still pending.",
  };

  const previousConfig = await db
    .select()
    .from(alertConfigTable)
    .where(eq(alertConfigTable.eventType, eventType));

  await db
    .insert(alertConfigTable)
    .values({ eventType, whatsappEnabled: channel === "whatsapp", emailEnabled: channel === "email" })
    .onConflictDoUpdate({
      target: alertConfigTable.eventType,
      set: { whatsappEnabled: channel === "whatsapp", emailEnabled: channel === "email" },
    });

  await dispatchExternalAlert(notifType, testMessages[eventType] ?? "PrintFlow test alert");

  if (previousConfig.length > 0) {
    const prev = previousConfig[0];
    await db
      .update(alertConfigTable)
      .set({ whatsappEnabled: prev.whatsappEnabled, emailEnabled: prev.emailEnabled })
      .where(eq(alertConfigTable.eventType, eventType));
  }

  res.json({ sent: true, message: testMessages[eventType] });
});

export default router;
