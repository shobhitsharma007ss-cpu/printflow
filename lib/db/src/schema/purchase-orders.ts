import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { vendorsTable } from "./vendors";
import { materialsTable } from "./materials";

/* Purchase orders — what the plant buys, from whom, at what rate.
   Header + line items, so one PO can cover several materials from one vendor
   (which is how paper is actually bought: three boards, one order, one truck). */

export const purchaseOrdersTable = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id),
  status: text("status").notNull().default("draft"),
  // draft → sent → partial → received → cancelled
  orderDate: text("order_date").notNull(),
  expectedDate: text("expected_date"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull().default("18"),
  gstAmount: numeric("gst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentVia: text("sent_via"),           // whatsapp | email | manual
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull().references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id),
  description: text("description").notNull(),   // snapshot — survives material rename
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull(),
  unit: text("unit").notNull().default("kg"),
  ratePerUnit: numeric("rate_per_unit", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  qtyReceived: numeric("qty_received", { precision: 12, scale: 3 }).notNull().default("0"),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, createdAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
