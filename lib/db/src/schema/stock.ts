import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { vendorsTable } from "./vendors";

export const stockInwardTable = pgTable("stock_inward", {
  id: serial("id").primaryKey(),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  vendorId: integer("vendor_id").references(() => vendorsTable.id), // now optional
  qtyReceived: numeric("qty_received", { precision: 10, scale: 2 }).notNull(),
  ratePerUnit: numeric("rate_per_unit", { precision: 10, scale: 2 }), // NEW — price paid per unit
  unit: text("unit").notNull(),
  batchRef: text("batch_ref").notNull().default(""),
  brand: text("brand"),
  receivedDate: text("received_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStockInwardSchema = createInsertSchema(stockInwardTable).omit({ id: true, createdAt: true });
export type InsertStockInward = z.infer<typeof insertStockInwardSchema>;
export type StockInward = typeof stockInwardTable.$inferSelect;
```

---

**Commit message:**
```
feat: add ratePerUnit to stock_inward, make vendorId optional
