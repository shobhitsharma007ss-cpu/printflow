import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const alertConfigTable = pgTable("alert_config", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull().unique(),
  whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertProvidersTable = pgTable("alert_providers", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull().unique(),
  provider: text("provider"),
  apiKey: text("api_key"),
  apiSid: text("api_sid"),
  fromAddress: text("from_address"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertRecipientsTable = pgTable("alert_recipients", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  address: text("address").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertLogTable = pgTable("alert_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  messageBody: text("message_body"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertSuppressionTable = pgTable("alert_suppression", {
  key: text("key").primaryKey(),
  lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AlertConfig = typeof alertConfigTable.$inferSelect;
export type AlertProvider = typeof alertProvidersTable.$inferSelect;
export type AlertRecipient = typeof alertRecipientsTable.$inferSelect;
export type AlertLog = typeof alertLogTable.$inferSelect;
