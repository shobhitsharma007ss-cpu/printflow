---
name: Migration script pitfalls
description: Lessons from debugging the startup migration runner (prod-migration.ts)
---

- **Rule:** `logger.error("msg:", err)` with pino silently drops the error object — the log shows only "msg:" with no detail. Use `logger.error({ err }, "msg")`.
  **Why:** Migration 4 failed on every boot for months with an empty error line, hiding two distinct root causes.
  **How to apply:** Any pino logging of errors in this repo must pass the error as `{ err }` first arg.

- **Rule:** Migrations that DELETE rows referenced by foreign keys must first repoint or delete the referencing rows in ALL referencing tables (query `pg_constraint` to enumerate them), not just the ones you remember.
  **Why:** Migration 4's duplicate-material cleanup only cleared `material_vendors` and hit FK violations from `job_materials`.
  **How to apply:** Before deleting from `materials` (or similar parent tables), check `pg_constraint` for every table with an FK to it.

- **Rule:** If a migration references a table, verify some migration actually CREATEs it — schema definitions in `lib/db/src/schema/` do not create tables (no drizzle-kit push in this project; tables exist only via `CREATE TABLE IF NOT EXISTS` in prod-migration.ts).
  **Why:** `material_vendors` existed in the Drizzle schema but was never created in the DB, so cleanup referencing it always failed.
