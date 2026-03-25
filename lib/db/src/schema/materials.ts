import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  materialName: text("material_name").notNull(),
  materialType: text("material_type").notNull(), // board/paper/consumable
  subType: text("sub_type").notNull(),
  gsm: integer("gsm"),
  unit: text("unit").notNull(), // reams/kg/litre/sheets
  currentQty: numeric("current_qty", { precision: 10, scale: 2 }).notNull().default("0"),
  minReorderQty: numeric("min_reorder_qty", { precision: 10, scale: 2 }).notNull().default("0"),
  dimensions: text("dimensions"), // e.g. "25x35" in inches
  grain: text("grain"), // "long" or "short"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const materialVendorsTable = pgTable("material_vendors", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  vendorId: integer("vendor_id").notNull(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true, createdAt: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
