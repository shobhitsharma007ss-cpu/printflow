import { pgTable, serial, text, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const machinesTable = pgTable("machines", {
  id: serial("id").primaryKey(),
  machineName: text("machine_name").notNull(),
  machineCode: text("machine_code").notNull(),
  machineType: text("machine_type").notNull(),
  maxPaperWidth: text("max_paper_width"),
  maxPaperLength: text("max_paper_length"),
  speedPerHour: integer("speed_per_hour"),
  capabilities: text("capabilities").array().notNull().default([]),
  status: text("status").notNull().default("idle"),
  operatorName: text("operator_name").notNull(),
  description: text("description"),
  colorUnits: integer("color_units").notNull().default(4),
  notes: text("notes"),
  ratedSph: integer("rated_sph"),
  peakRunningSph: integer("peak_running_sph"),
  ratedSpeedMPerMin: integer("rated_speed_m_per_min"),
  setupMinRepeat: integer("setup_min_repeat"),
  setupMinNew: integer("setup_min_new"),
  oeeDefault: numeric("oee_default", { precision: 3, scale: 2 }),
  hourRate: numeric("hour_rate", { precision: 10, scale: 2 }),
});

export const insertMachineSchema = createInsertSchema(machinesTable).omit({ id: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machinesTable.$inferSelect;
