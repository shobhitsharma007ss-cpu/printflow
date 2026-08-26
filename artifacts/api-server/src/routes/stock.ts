import { Router, type IRouter } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, stockInwardTable, materialsTable, vendorsTable, stockMovementsTable , materialBatchesTable} from "@workspace/db";
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

    // Every inward becomes a BATCH — a distinct lot with its own brand, rate and
    // remaining quantity. FIFO consumption draws from these oldest-first, which
    // is what lets brand-vs-mileage reporting work later.
    await db.insert(materialBatchesTable).values({
      materialId: parsed.data.materialId,
      vendorId: parsed.data.vendorId ?? null,
      brand: parsed.data.brand ?? null,
      batchCode: parsed.data.batchRef || null,
      qtyKg: parsed.data.unit === "kg" ? String(inwardQty) : null,
      qtySheets: String(sheetsToAdd),
      qtyRemaining: String(sheetsToAdd),
      ratePerKg: parsed.data.ratePerUnit != null ? String(parsed.data.ratePerUnit) : null,
      ratePerSheet: sheetWeightKg && parsed.data.ratePerUnit != null
        ? String(sheetWeightKg * parseFloat(String(parsed.data.ratePerUnit)))
        : null,
      receivedDate: parsed.data.receivedDate,
      notes: parsed.data.notes ?? null,
    });

    await db.insert(stockMovementsTable).values({
      materialId: parsed.data.materialId,
      movementType: "inward",
      qty: String(sheetsToAdd),
      sourceRef: parsed.data.batchRef || parsed.data.brand || null,
      performedBy: (req.session as { user?: { name?: string } } | undefined)?.user?.name ?? "system",
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

/** Lot-level stock for a material — oldest first, i.e. the FIFO consumption order. */
router.get("/materials/:id/batches", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await db
    .select()
    .from(materialBatchesTable)
    .where(eq(materialBatchesTable.materialId, id))
    .orderBy(materialBatchesTable.receivedDate, materialBatchesTable.id);
  res.json(rows);
});

/* ── STORE VIEW: every lot as the Lot view model ───────────────────────────
   full     = largest recorded delivery for that batch (qtySheets)
   ratePerDay = deductions over the last 28 days / 28, from stock_movements
   held     = batch.heldForLabel, set when paper is bought for a job */
router.get("/store/lots", async (_req, res): Promise<void> => {
  const batches = await db.select().from(materialBatchesTable);
  const materials = await db.select().from(materialsTable);
  const matById = new Map(materials.map(m => [m.id, m]));
  const vendors = await db.select().from(vendorsTable);
  const venById = new Map(vendors.map(v => [v.id, v.name]));

  const since = new Date(Date.now() - 28 * 864e5);
  const moves = await db.select().from(stockMovementsTable)
    .where(and(eq(stockMovementsTable.movementType, "deduction"),
               gte(stockMovementsTable.createdAt, since)));
  const usedByMat = new Map<number, number>();
  for (const m of moves) {
    const q = Math.abs(Number(m.qty));
    usedByMat.set(m.materialId, (usedByMat.get(m.materialId) ?? 0) + q);
  }

  /* Same rule the classic inventory page uses. materialType is only
     board/paper/consumable — every consumable is separated by keywords in
     subType and materialName. Guessing from materialType alone dumped inks,
     coatings and glue into the paper tab. */
  const catOf = (m?: { materialType: string; subType?: string | null; materialName?: string | null }) => {
    if (!m) return "paper" as const;
    if (m.materialType === "board" || m.materialType === "paper") return "paper" as const;
    const hay = `${m.subType ?? ""} ${m.materialName ?? ""}`.toLowerCase();
    if (/varnish|aqueous|coating|uv/.test(hay)) return "coatings" as const;
    if (/ink/.test(hay)) return "inks" as const;
    return "chemicals" as const;
  };

  const lots = batches.map(b => {
    const mat = matById.get(b.materialId);
    const remaining = Number(b.qtyRemaining ?? b.qtySheets ?? b.qtyKg ?? 0);
    const delivered = Number(b.qtySheets ?? b.qtyKg ?? 0) || remaining;
    const perDay = usedByMat.get(b.materialId);
    const vendorName = b.vendorId ? (venById.get(b.vendorId) ?? "Unknown vendor") : "Unknown vendor";
    return {
      id: b.batchCode ?? `B-${b.id}`,
      category: catOf(mat),
      vendor: vendorName,
      vendorKey: vendorName.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10) || "unknown",
      brand: b.brand ?? "—",
      product: mat?.materialName ?? "Unknown material",
      size: mat?.dimensions ?? "",
      qty: remaining,
      unit: mat?.unit ?? "units",
      full: delivered,
      ratePerDay: perDay && perDay > 0 ? Math.round((perDay / 28) * 100) / 100 : undefined,
      heldFor: b.heldForLabel ?? undefined,
      receivedDate: b.receivedDate ?? "",
      price: Number(b.ratePerKg ?? b.ratePerSheet ?? 0) || undefined,
      invoice: b.invoiceNumber ?? "",
      jobs: [] as string[],
    };
  });
  res.json(lots);
});

export default router;
