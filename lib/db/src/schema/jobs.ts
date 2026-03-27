import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { materialsTable } from "./materials";
import { machinesTable } from "./machines";

export const jobTemplatesTable = pgTable("job_templates", {
  id: serial("id").primaryKey(),
  templateName: text("template_name").notNull(),
  description: text("description"),
  routingSteps: integer("routing_steps").array().notNull().default([]),
});

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  jobCode: text("job_code").notNull(),
  jobName: text("job_name").notNull(),
  clientName: text("client_name").notNull(),
  materialId: integer("material_id").references(() => materialsTable.id),
  materialGsm: integer("material_gsm"),
  qtySheets: integer("qty_sheets").notNull(),
  plannedSheets: integer("planned_sheets"),
  status: text("status").notNull().default("pending"),
  templateId: integer("template_id").references(() => jobTemplatesTable.id),
  scheduledDate: text("scheduled_date"),
  coatingType: text("coating_type"),
  finishRequirements: text("finish_requirements").array().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRoutingTable = pgTable("job_routing", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id),
  stepNumber: integer("step_number").notNull(),
  machineId: integer("machine_id").notNull().references(() => machinesTable.id),
  operatorName: text("operator_name"),
  status: text("status").notNull().default("pending"), // pending/in-progress/completed
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  notes: text("notes"),
});

export const jobMaterialsTable = pgTable("job_materials", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  plannedQty: numeric("planned_qty", { precision: 10, scale: 2 }).notNull(),
  actualQty: numeric("actual_qty", { precision: 10, scale: 2 }),
  unit: text("unit").notNull(),
  costPerUnit: numeric("cost_per_unit", { precision: 10, scale: 2 }),
});

export const wastageLogTable = pgTable("wastage_log", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  plannedQty: numeric("planned_qty", { precision: 10, scale: 2 }).notNull(),
  actualQty: numeric("actual_qty", { precision: 10, scale: 2 }).notNull(),
  wastageQty: numeric("wastage_qty", { precision: 10, scale: 2 }).notNull(),
  wastagePct: numeric("wastage_pct", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason").notNull(), // setup/mis-registration/client-correction/plate-change/other
  notes: text("notes"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
export type JobTemplate = typeof jobTemplatesTable.$inferSelect;
export type JobRouting = typeof jobRoutingTable.$inferSelect;
export type JobMaterial = typeof jobMaterialsTable.$inferSelect;
export type WastageLog = typeof wastageLogTable.$inferSelect;
