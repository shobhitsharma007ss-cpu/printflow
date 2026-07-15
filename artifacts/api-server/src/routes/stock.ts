import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stockInwardTable, materialsTable, vendorsTable, stockMovementsTable } from "@workspace/db";
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
    const mat = currentMaterial[0];

    // Shared helper — parse stored dimension string → sheet weight in kg
    const getSheetWeightKg = (): number | null => {
      if (!mat.dimensions || !mat.gsm) return null;
      const dimParts = mat.dimensions.trim().split(' ');
      const wh = dimParts[0].split('x').map(Number);
      if (wh.length !== 2 || !wh[0] || !wh[1]) return null;
      const dimUnit = dimParts[1]?.toLowerCase() ?? 'in';
      const toCm = (v: number) => dimUnit === 'mm' ? v * 0.1 : dimUnit === 'cm' ? v : v * 2.54;
      return (toCm(wh[0]) * toCm(wh[1]) * mat.gsm) / 10000000;
    };

    const sheetWeightKg = getSheetWeightKg();
    const currentQtyVal = parseFloat(String(mat.currentQty));
    const inwardQty = parseFloat(String(parsed.data.qtyReceived));

    // If inward recorded in kg (board/paper), convert to sheets for currentQty
    let sheetsToAdd = inwardQty;
    if (parsed.data.unit === 'kg' && sheetWeightKg && sheetWeightKg > 0) {
      sheetsToAdd = inwardQty / sheetWeightKg;
    }

    const materialUpdate: Record<string, unknown> = { currentQty: String(currentQtyVal + sheetsToAdd) };

    if (parsed.data.ratePerUnit != null) {
      const rateKg = parseFloat(String(parsed.data.ratePerUnit));
      materialUpdate.ratePerUnit = String(rateKg);
      materialUpdate.rateUpdatedAt = new Date();
      if (sheetWeightKg) {
        materialUpdate.ratePerSheet = String(sheetWeightKg * rateKg);
      }
    }

    await db.update(materialsTable).set(materialUpdate).where(eq(materialsTable.id, parsed.data.materialId));

    await db.insert(stockMovementsTable).values({
      materialId: parsed.data.materialId,
      movementType: "inward",
      qty: String(sheetsToAdd),
      sourceRef: parsed.data.batchRef || parsed.data.brand || null,
    });

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
