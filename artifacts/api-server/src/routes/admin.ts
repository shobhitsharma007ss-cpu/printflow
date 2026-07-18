import { Router, type IRouter } from "express";
import { db, stockInwardTable, materialsTable, materialBatchesTable, stockMovementsTable, jobsTable, jobRoutingTable, jobMaterialsTable, jobInterruptionsTable, wastageLogTable, jobQuotesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/admin/clear-inventory", async (_req, res): Promise<void> => {
  try {
    await db.delete(stockMovementsTable);   // migration-15 ledger references materials — must go first
    await db.delete(materialBatchesTable);
    await db.delete(stockInwardTable);
    // Always reset current_qty (NOT NULL, always exists)
    await db.execute(sql`UPDATE materials SET current_qty = 0, reserved_qty = 0`);
    // current_stock_kg was added in migration 13 — attempt separately so older DBs don't fail
    try {
      await db.execute(sql`UPDATE materials SET current_stock_kg = 0`);
    } catch {
      // column may not exist on older schema — safe to ignore
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/admin/clear-jobs", async (_req, res): Promise<void> => {
  try {
    await db.delete(jobQuotesTable);        // quotes reference jobs — must go first
    await db.delete(jobInterruptionsTable);
    await db.delete(wastageLogTable);
    await db.delete(jobMaterialsTable);
    await db.delete(jobRoutingTable);
    await db.delete(jobsTable);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
