import { Router, type IRouter } from "express";
import { eq, desc, sql as dsql } from "drizzle-orm";
import {
  db,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  vendorsTable,
  materialsTable,
} from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

/* Purchase orders.
   A PO is a draft until it's sent. Sending stamps sent_at/sent_via — the
   actual WhatsApp/email hand-off happens client-side via a wa.me link or the
   vendor's email, so no third-party credentials are needed to raise an order. */

const PoItem = z.object({
  materialId: z.number().int().positive().nullable().optional(),
  description: z.string().min(1),
  qty: z.number().positive(),
  unit: z.string().min(1).default("kg"),
  ratePerUnit: z.number().nonnegative(),
});

const CreatePoBody = z.object({
  vendorId: z.number().int().positive(),
  orderDate: z.string().min(1),
  expectedDate: z.string().optional(),
  gstPercent: z.number().nonnegative().default(18),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  items: z.array(PoItem).min(1),
});

async function nextPoNumber(): Promise<string> {
  const rows = await db.select({ poNumber: purchaseOrdersTable.poNumber }).from(purchaseOrdersTable);
  let max = 0;
  for (const r of rows) {
    const m = r.poNumber.match(/PO-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `PO-${String(max + 1).padStart(4, "0")}`;
}

/** List POs with vendor name and item count. */
router.get("/purchase-orders", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: purchaseOrdersTable.id,
      poNumber: purchaseOrdersTable.poNumber,
      vendorId: purchaseOrdersTable.vendorId,
      vendorName: vendorsTable.vendorName,
      status: purchaseOrdersTable.status,
      orderDate: purchaseOrdersTable.orderDate,
      expectedDate: purchaseOrdersTable.expectedDate,
      totalAmount: purchaseOrdersTable.totalAmount,
      sentAt: purchaseOrdersTable.sentAt,
      sentVia: purchaseOrdersTable.sentVia,
      createdAt: purchaseOrdersTable.createdAt,
    })
    .from(purchaseOrdersTable)
    .leftJoin(vendorsTable, eq(purchaseOrdersTable.vendorId, vendorsTable.id))
    .orderBy(desc(purchaseOrdersTable.id));
  res.json(rows);
});

/** One PO with its lines and full vendor detail — used by the printable view. */
router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [po] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, po.vendorId));
  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));

  res.json({ ...po, vendor: vendor ?? null, items });
});

/** Create a PO. Totals are computed server-side so the document can't disagree with itself. */
router.post("/purchase-orders", async (req, res): Promise<void> => {
  const parsed = CreatePoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, d.vendorId));
  if (!vendor) { res.status(400).json({ error: "Vendor not found" }); return; }

  const lines = d.items.map((it) => ({
    ...it,
    lineTotal: Math.round(it.qty * it.ratePerUnit * 100) / 100,
  }));
  const subtotal = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  const gstAmount = Math.round(subtotal * (d.gstPercent / 100) * 100) / 100;
  const totalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

  const poNumber = await nextPoNumber();

  try {
    const created = await db.transaction(async (tx) => {
      const [po] = await tx.insert(purchaseOrdersTable).values({
        poNumber,
        vendorId: d.vendorId,
        status: "draft",
        orderDate: d.orderDate,
        expectedDate: d.expectedDate ?? null,
        subtotal: String(subtotal),
        gstPercent: String(d.gstPercent),
        gstAmount: String(gstAmount),
        totalAmount: String(totalAmount),
        notes: d.notes ?? null,
        createdBy: d.createdBy ?? null,
      }).returning();

      for (const l of lines) {
        await tx.insert(purchaseOrderItemsTable).values({
          poId: po.id,
          materialId: l.materialId ?? null,
          description: l.description,
          qty: String(l.qty),
          unit: l.unit,
          ratePerUnit: String(l.ratePerUnit),
          lineTotal: String(l.lineTotal),
        });
      }
      return po;
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: "Could not create purchase order" });
  }
});

/** Mark a PO as sent (whatsapp | email | manual). */
router.post("/purchase-orders/:id/send", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const via = String((req.body as { via?: string })?.via ?? "manual");

  const [updated] = await db.update(purchaseOrdersTable)
    .set({ status: "sent", sentAt: new Date(), sentVia: via })
    .where(eq(purchaseOrdersTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(updated);
});

/** Record goods received against a PO line; rolls the header status up. */
router.post("/purchase-orders/:id/receive", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    items: z.array(z.object({ itemId: z.number().int(), qtyReceived: z.number().nonnegative() })).min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  await db.transaction(async (tx) => {
    for (const it of body.data.items) {
      await tx.update(purchaseOrderItemsTable)
        .set({ qtyReceived: String(it.qtyReceived) })
        .where(eq(purchaseOrderItemsTable.id, it.itemId));
    }
    const lines = await tx.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
    const allIn = lines.every((l) => Number(l.qtyReceived) >= Number(l.qty));
    const anyIn = lines.some((l) => Number(l.qtyReceived) > 0);
    await tx.update(purchaseOrdersTable)
      .set({ status: allIn ? "received" : anyIn ? "partial" : "sent" })
      .where(eq(purchaseOrdersTable.id, id));
  });

  res.json({ ok: true });
});

/** Cancel a PO. */
router.post("/purchase-orders/:id/cancel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [updated] = await db.update(purchaseOrdersTable)
    .set({ status: "cancelled" })
    .where(eq(purchaseOrdersTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Purchase order not found" }); return; }
  res.json(updated);
});

/** Materials sitting at or below reorder level — the "what should I order" list. */
router.get("/purchase-orders-suggestions", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: materialsTable.id,
      materialName: materialsTable.materialName,
      currentQty: materialsTable.currentQty,
      reorderLevel: materialsTable.minReorderQty,
      unit: materialsTable.unit,
      ratePerUnit: materialsTable.ratePerUnit,
    })
    .from(materialsTable)
    .where(dsql`${materialsTable.minReorderQty} > 0 AND ${materialsTable.currentQty} <= ${materialsTable.minReorderQty}`);
  res.json(rows);
});

export default router;
