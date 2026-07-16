import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, costingSettingsTable } from "@workspace/db";

const router: IRouter = Router();

const ALLOWED_KEYS = [
  "ink_coverage",
  "makeready_bases",
  "die_setup_waste_sheets",
  "gluer_setup_waste_cartons",
  "glue_grams",
  "glue_rate_per_kg",
  "finishing_rates",
  "freight_packing_default",
] as const;

router.get("/costing-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(costingSettingsTable);
  const obj: Record<string, unknown> = {};
  for (const row of rows) {
    obj[row.key] = row.value;
  }
  res.json(obj);
});

router.put("/costing-settings/:key", async (req, res): Promise<void> => {
  const { key } = req.params;
  if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
    res.status(400).json({ error: "Unknown settings key" });
    return;
  }
  const value = req.body;
  if (value === undefined || value === null) {
    res.status(400).json({ error: "value is required" });
    return;
  }
  const [row] = await db
    .insert(costingSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: costingSettingsTable.key,
      set: { value, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

export default router;
