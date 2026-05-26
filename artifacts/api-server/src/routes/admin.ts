import { Router, type IRouter } from "express";
import { db, stockInwardTable, materialsTable, materialBatchesTable, jobsTable, jobRoutingTable, jobMaterialsTable, jobInterruptionsTable, wastageLogTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/admin/clear-inventory", async (_req, res): Promise<void> => {
  await db.delete(materialBatchesTable);
  await db.delete(stockInwardTable);
  await db.execute(sql`UPDATE materials SET current_qty = 0, current_stock_kg = 0`);
  res.json({ ok: true });
});

router.post("/admin/clear-jobs", async (_req, res): Promise<void> => {
  await db.delete(jobInterruptionsTable);
  await db.delete(wastageLogTable);
  await db.delete(jobMaterialsTable);
  await db.delete(jobRoutingTable);
  await db.delete(jobsTable);
  res.json({ ok: true });
});

export default router;
