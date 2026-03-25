import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { vendorsTable } from "./vendors";

export const stockInwardTable = pgTable("stock_inward", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id),
  qtyReceived: numeric("qty_received", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull(),
  batchRef: text("batch_ref").notNull(),
  receivedDate: text("received_date").notNull(),
  notes: text("notes"),
});

export const insertStockInwardSchema = createInsertSchema(stockInwardTable).omit({ id: true });
export type InsertStockInward = z.infer<typeof insertStockInwardSchema>;
export type StockInward = typeof stockInwardTable.$inferSelect;
