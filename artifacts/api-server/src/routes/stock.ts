import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stockInwardTable, materialsTable, vendorsTable } from "@workspace/db";
import { CreateStockInwardBody } from "@workspace/api-zod";
import { createNotification } from "./notifications";

const router: IRouter = Router();

const stockSelectFields = {
  id: stockInwardTable.id,
  materialId: stockInwardTable.materialId,
  vendorId: stockInwardTable.vendorId,
  qtyReceived: stockInwardTable.qtyReceived,
  unit: stockInwardTable.unit,
  batchRef: stockInwardTable.batchRef,
  brand: stockInwardTable.brand,
  receivedDate: stockInwardTable.receivedDate,
  notes: stockInwardTable.notes,
  vendorName: vendorsTable.vendorName,
  materialName: materialsTable.materialName,
};

router.get("/stock-inward", async (_req, res): Promise<void> => {
  const rows = await db
    .select(stockSelectFields)
    .from(stockInwardTable)
    .leftJoin(vendorsTable, eq(stockInwardTable.vendorId, vendorsTable.id))
    .leftJoin(materialsTable, eq(stockInwardTable.materialId, materialsTable.id))
    .orderBy(stockInwardTable.id);
  res.json(rows);
});

router.post("/stock-inward", async (req, res): Promise<void> => {
  const parsed = CreateStockInwardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db.insert(stockInwardTable).values(parsed.data).returning();

  const currentMaterial = await db.select().from(materialsTable).where(eq(materialsTable.id, parsed.data.materialId));
  if (currentMaterial[0]) {
    const newQty = parseFloat(String(currentMaterial[0].currentQty)) + parseFloat(String(parsed.data.qtyReceived));
    await db.update(materialsTable).set({ currentQty: String(newQty) }).where(eq(materialsTable.id, parsed.data.materialId));

    await createNotification({
      type: "stock-inward",
      title: "Stock Received",
      message: `${parsed.data.qtyReceived} ${parsed.data.unit} of ${currentMaterial[0].materialName} received${parsed.data.brand ? ` (${parsed.data.brand})` : ''}`,
      relatedId: parsed.data.materialId,
    });
  }

  const [withJoins] = await db
    .select(stockSelectFields)
    .from(stockInwardTable)
    .leftJoin(vendorsTable, eq(stockInwardTable.vendorId, vendorsTable.id))
    .leftJoin(materialsTable, eq(stockInwardTable.materialId, materialsTable.id))
    .where(eq(stockInwardTable.id, row.id));

  res.status(201).json(withJoins);
});

export default router;
