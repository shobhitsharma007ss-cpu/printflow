import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const costingSettingsTable = pgTable("costing_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CostingSetting = typeof costingSettingsTable.$inferSelect;
