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

    /* Convert kg -> sheets. If the material has no dimensions or GSM we CANNOT
       do this, and silently storing kg as a sheet count corrupts the stock (a
       30,000 kg delivery became "30,000 sheets"). Refuse instead, and say why. */
    let sheetsToAdd = inwardQty;
    const needsConversion = parsed.data.unit === 'kg';
    if (needsConversion) {
      if (!sheetWeightKg || sheetWeightKg <= 0) {
        res.status(422).json({
          error:
            `Cannot convert kg to sheets for "${mat.materialName}" — it has no sheet size ` +
            `or GSM recorded. Add both in Settings → Materials, then record this stock again.`,
          code: "SHEET_WEIGHT_UNKNOWN",
          materialId: mat.id,
        });
        return;
      }
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
    /* Value the lot on whichever rate basis actually exists. Asking only for
       ratePerSheet made stock value read zero for every lot whose material has
       no sheet weight. */
    const isSheets = (mat?.unit ?? "").toLowerCase().includes("sheet");
    const perSheet = Number(b.ratePerSheet ?? 0) || 0;
    const perKg = Number(b.ratePerKg ?? 0) || 0;
    const rate = isSheets ? (perSheet || perKg) : (perKg || perSheet);
    const rateBasis = isSheets ? (perSheet ? "sheet" : "kg") : (perKg ? "kg" : "sheet");
    const ageDays = b.receivedDate
      ? Math.max(0, Math.floor((Date.now() - new Date(b.receivedDate).getTime()) / 864e5))
      : undefined;
    return {
      id: b.batchCode ?? `B-${b.id}`,
      batchId: b.id,
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
      /* Rate is per-sheet for paper and per-kg for everything else, so send the
         unit with it — a bare number gets misread as the wrong basis. */
      price: rate || undefined,
      rateUnit: rateBasis,
      value: rate ? Math.round(rate * remaining) : undefined,
      ageDays,
      invoice: b.invoiceNumber ?? "",
      /* true when the material has no sheet weight, so this quantity may be a
         raw kg figure mislabelled as sheets by an older inward. */
      basisUnknown: isSheets && !perSheet && !!perKg,
      jobs: [] as string[],
    };
  });
  res.json(lots);
});


/* ── Correcting a lot ──────────────────────────────────────────────────────
   Lots recorded before the kg guard may hold a raw kg figure in the sheet
   count. The true kg was saved in qty_kg, so once the material has a sheet
   size and GSM the correct sheet count can be recomputed exactly. */

function sheetWeightKgOf(mat: { dimensions: string | null; gsm: number | null }): number | null {
  if (!mat.dimensions || !mat.gsm) return null;
  const parts = mat.dimensions.trim().split(" ");
  const wh = parts[0].split("x").map(Number);
  if (wh.length !== 2 || !wh[0] || !wh[1]) return null;
  const u = parts[1]?.toLowerCase() ?? "in";
  const toCm = (v: number) => (u === "mm" ? v * 0.1 : u === "cm" ? v : v * 2.54);
  return (toCm(wh[0]) * toCm(wh[1]) * mat.gsm) / 10000000;
}

/** Recompute sheets from the stored kg, using the material's current size/GSM. */
router.post("/store/lots/:id/recompute", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [lot] = await db.select().from(materialBatchesTable).where(eq(materialBatchesTable.id, id));
  if (!lot) { res.status(404).json({ error: "Lot not found" }); return; }
  const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, lot.materialId));
  if (!mat) { res.status(404).json({ error: "Material not found" }); return; }

  const kg = Number(lot.qtyKg ?? 0);
  if (!kg) {
    res.status(422).json({ error: "This lot has no kilogram figure recorded, so it cannot be recomputed. Correct the quantity by hand instead." });
    return;
  }
  const sw = sheetWeightKgOf(mat);
  if (!sw || sw <= 0) {
    res.status(422).json({
      error: `"${mat.materialName}" still has no sheet size or GSM. Add both in Settings → Materials first.`,
      code: "SHEET_WEIGHT_UNKNOWN",
    });
    return;
  }

  const oldSheets = Number(lot.qtyRemaining ?? 0);
  const newSheets = Math.round((kg / sw) * 100) / 100;
  const rateKg = Number(lot.ratePerKg ?? 0);

  await db.update(materialBatchesTable).set({
    qtySheets: String(newSheets),
    qtyRemaining: String(newSheets),
    ratePerSheet: rateKg ? String(sw * rateKg) : lot.ratePerSheet,
  }).where(eq(materialBatchesTable.id, id));

  // keep the material's running total honest
  const delta = newSheets - oldSheets;
  await db.update(materialsTable)
    .set({
      currentQty: String(Number(mat.currentQty) + delta),
      ratePerSheet: rateKg ? String(sw * rateKg) : mat.ratePerSheet,
    })
    .where(eq(materialsTable.id, mat.id));

  res.json({ ok: true, kg, sheetWeightKg: sw, was: oldSheets, now: newSheets });
});

/** Set a lot's remaining quantity by hand. */
router.patch("/store/lots/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const qty = Number((req.body as { qty?: number }).qty);
  if (!isFinite(qty) || qty < 0) { res.status(400).json({ error: "A quantity of zero or more is required" }); return; }

  const [lot] = await db.select().from(materialBatchesTable).where(eq(materialBatchesTable.id, id));
  if (!lot) { res.status(404).json({ error: "Lot not found" }); return; }
  const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, lot.materialId));

  const delta = qty - Number(lot.qtyRemaining ?? 0);
  await db.update(materialBatchesTable)
    .set({ qtyRemaining: String(qty), qtySheets: String(Math.max(qty, Number(lot.qtySheets ?? 0))) })
    .where(eq(materialBatchesTable.id, id));
  if (mat) {
    await db.update(materialsTable)
      .set({ currentQty: String(Math.max(0, Number(mat.currentQty) + delta)) })
      .where(eq(materialsTable.id, mat.id));
  }
  res.json({ ok: true, qty });
});

/** Remove a lot recorded in error. */
router.delete("/store/lots/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [lot] = await db.select().from(materialBatchesTable).where(eq(materialBatchesTable.id, id));
  if (!lot) { res.status(404).json({ error: "Lot not found" }); return; }
  const [mat] = await db.select().from(materialsTable).where(eq(materialsTable.id, lot.materialId));
  if (mat) {
    await db.update(materialsTable)
      .set({ currentQty: String(Math.max(0, Number(mat.currentQty) - Number(lot.qtyRemaining ?? 0))) })
      .where(eq(materialsTable.id, mat.id));
  }
  await db.delete(materialBatchesTable).where(eq(materialBatchesTable.id, id));
  res.json({ ok: true });
});

export default router;
