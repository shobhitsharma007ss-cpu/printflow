import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, materialsTable, materialVendorsTable, vendorsTable, stockInwardTable } from "@workspace/db";
import {
  CreateMaterialBody,
  UpdateMaterialBody,
  GetMaterialParams,
  UpdateMaterialParams,
  DeleteMaterialParams,
  GetMaterialVendorsParams,
  AddMaterialVendorParams,
  AddMaterialVendorBody,
  GetMaterialInwardHistoryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/materials", async (_req, res): Promise<void> => {
  const materials = await db.select().from(materialsTable).orderBy(materialsTable.id);
  res.json(materials);
});

router.post("/materials", async (req, res): Promise<void> => {
  const parsed = CreateMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [material] = await db.insert(materialsTable).values(parsed.data).returning();
  res.status(201).json(material);
});

router.get("/materials/:id", async (req, res): Promise<void> => {
  const params = GetMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [material] = await db.select().from(materialsTable).where(eq(materialsTable.id, params.data.id));
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json(material);
});

router.put("/materials/:id", async (req, res): Promise<void> => {
  const params = UpdateMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMaterialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [material] = await db.update(materialsTable).set(parsed.data).where(eq(materialsTable.id, params.data.id)).returning();
  if (!material) {
    res.status(404).json({ error: "Material not found" });
    return;
  }
  res.json(material);
});

router.delete("/materials/:id", async (req, res): Promise<void> => {
  const params = DeleteMaterialParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(materialsTable).where(eq(materialsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/materials/:id/vendors", async (req, res): Promise<void> => {
  const params = GetMaterialVendorsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: vendorsTable.id,
      vendorName: vendorsTable.vendorName,
      contactPerson: vendorsTable.contactPerson,
      phone: vendorsTable.phone,
      city: vendorsTable.city,
      createdAt: vendorsTable.createdAt,
    })
    .from(materialVendorsTable)
    .innerJoin(vendorsTable, eq(materialVendorsTable.vendorId, vendorsTable.id))
    .where(eq(materialVendorsTable.materialId, params.data.id));
  res.json(rows);
});

router.post("/materials/:id/vendors", async (req, res): Promise<void> => {
  const params = AddMaterialVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddMaterialVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(materialVendorsTable).values({ materialId: params.data.id, vendorId: parsed.data.vendorId });
  res.status(201).json({ success: true });
});

router.get("/materials/:id/inward-history", async (req, res): Promise<void> => {
  const params = GetMaterialInwardHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: stockInwardTable.id,
      materialId: stockInwardTable.materialId,
      vendorId: stockInwardTable.vendorId,
      qtyReceived: stockInwardTable.qtyReceived,
      unit: stockInwardTable.unit,
      batchRef: stockInwardTable.batchRef,
      receivedDate: stockInwardTable.receivedDate,
      notes: stockInwardTable.notes,
      vendorName: vendorsTable.vendorName,
    })
    .from(stockInwardTable)
    .leftJoin(vendorsTable, eq(stockInwardTable.vendorId, vendorsTable.id))
    .where(eq(stockInwardTable.materialId, params.data.id))
    .orderBy(stockInwardTable.id);
  res.json(rows);
});

export default router;
