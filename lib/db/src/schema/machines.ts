import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const machinesTable = pgTable("machines", {
  id: serial("id").primaryKey(),
  machineName: text("machine_name").notNull(),
  machineCode: text("machine_code").notNull(),
  machineType: text("machine_type").notNull(), // printing/cutting/coating/gluing
  maxPaperWidth: text("max_paper_width"),
  maxPaperLength: text("max_paper_length"),
  speedPerHour: integer("speed_per_hour"),
  capabilities: text("capabilities").array().notNull().default([]),
  status: text("status").notNull().default("idle"), // idle/running/maintenance
  operatorName: text("operator_name").notNull(),
  notes: text("notes"),
});

export const insertMachineSchema = createInsertSchema(machinesTable).omit({ id: true });
export type InsertMachine = z.infer<typeof insertMachineSchema>;
export type Machine = typeof machinesTable.$inferSelect;
