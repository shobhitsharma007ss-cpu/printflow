# PrintFlow — Plant Management System

## Overview

Full-stack Plant Management System for a printing and packaging factory, built as a pnpm monorepo using TypeScript. The system is designed for non-tech factory workers with a highly visual, easy-to-use interface.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/printflow) with Recharts, wouter, TailwindCSS
- **Backend**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server with all PrintFlow routes
│   └── printflow/          # React + Vite frontend (served at /)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seed.ts         # Database seed script
└── ...
```

## Database Schema

- `vendors` — vendor management
- `materials` — all materials (board/paper/consumable), with dimensions/grain fields
- `material_vendors` — many-to-many linking materials to vendors
- `stock_inward` — stock receipt tracking with brand field (nullable)
- `machines` — machine fleet with capabilities/status/description (description: human-readable machine role/capability summary)
- `job_templates` — reusable routing templates with stepEstimatesMinutes[] (per-step time estimates in minutes) and machineNames[]
- `jobs` — production jobs with auto PF-XXX codes
- `job_routing` — per-job machine routing steps (status: pending/in-progress/paused/completed; pausedAt, totalPausedSeconds, pauseReason for pause tracking; estimatedMinutes, etaSeconds, etaFormatted for ETA display)
- `job_materials` — material allocation per job
- `wastage_log` — wastage recording and tracking
- `notifications` — in-app notifications (type, title, message, isRead, relatedId)

## Production Migrations (prod-migration.ts)

Migrations run on server startup (before auto-seed), in numbered order newest-first:
- **Migration 8**: Adds `description TEXT` to `machines`, backfills descriptions for all 10 seeded machines
- **Migration 7**: Adds `step_estimates_minutes INTEGER[]` to `job_templates`, backfills all 5 seeded templates
- **Migration 6**: Adds `estimated_minutes` to `job_routing`
- **Migration 5**: Adds pause columns (pausedAt, totalPausedSeconds, pauseReason) to `job_routing`
- **Migrations 1–4**: Older schema additions (rate/wastage/reserved on materials, stock_inward, ghost cleanup, initial data)

**Critical**: Migrations must run BEFORE `autoSeedIfEmpty()` — ordering guaranteed in `index.ts`.

## Frontend Pages

1. **Dashboard** (`/`) — KPI cards, live machine status row, recent jobs, auto-refreshes every 60s
2. **Floor Monitor** (`/floor-monitor`) — Real-time machine grid grouped by type with status dots; live clock (HH:MM AM/PM) and fullscreen toggle; Pause/Resume machine steps with reason selection (blanket wash, plate change, ink change, paper jam, breakdown, break, other); live elapsed/remaining timer per step with overtime detection; amber glow + amber border on paused machine cards; routing step pipeline chips with paused state (⏸ amber)
3. **Inventory** (`/inventory`) — Visual stacks (boards/paper) + cylinder gauges (consumables), click for detail side panel with vendor list and inward history (includes brand). Two action buttons: "Record Inward Stock" (modal for logging stock arrivals) and "Add New Material" (multi-step wizard: category → paper type → GSM → dimensions → grain → vendor → stock details → review)
4. **Jobs** (`/jobs`) — Job table with status/search filters; clickable rows open detail slide-over panel with routing progress, materials, wastage logs, and quick status actions; Log Wastage modal; 6-step Create Job Wizard (Basics → Board/Paper selection cards → Finish/Coating with auto-recommended machine → Ink/Consumables auto-estimate → Routing with reorderable steps → Review & Confirm); supports coatingType and finishRequirements fields
5. **Reports** (`/reports`) — Wastage chart grouped per job (PF-XXX x-axis), color-coded bars (normal/watch/critical), stock reorder watchlist
6. **Settings** (`/settings`) — 4 tabs: Machines (inline operator edit, status toggle), Materials (inline reorder level edit, 6-step AddMaterialWizard), Vendors (add/delete), Job Templates (routing step visualization)

## API Routes

- `/api/vendors` — CRUD
- `/api/materials` — CRUD + vendor linking + inward history
- `/api/stock-inward` — CRUD (auto-updates material qty)
- `/api/machines` — CRUD + PATCH status
- `/api/job-templates` — CRUD
- `/api/jobs` — CRUD + PATCH status (auto-creates routing from template)
- `/api/job-routing/:id/status` — Update routing step status
- `/api/job-routing/:id/pause` — Pause an in-progress step (records pausedAt, pauseReason)
- `/api/job-routing/:id/resume` — Resume a paused step (accumulates totalPausedSeconds)
- `/api/wastage-log` — CRUD
- `/api/dashboard/metrics` — Aggregate dashboard data
- `/api/reports/wastage` — Wastage report
- `/api/reports/stock-summary` — Stock with reorder status
- `/api/reports/job-cost/:jobId` — Per-job cost breakdown
- `/api/notifications` — List notifications (GET), mark read (PATCH /:id/read), mark all read (POST /mark-all-read)

## Running Locally

```bash
# Seed database
pnpm --filter @workspace/scripts run seed

# Start API server
pnpm --filter @workspace/api-server run dev

# Start frontend
pnpm --filter @workspace/printflow run dev

# Re-run codegen after OpenAPI changes
pnpm --filter @workspace/api-spec run codegen
```

## Status Colors

- Green `#22c55e` — Running / Good stock
- Amber `#f59e0b` — Idle / Medium stock  
- Red `#ef4444` — Maintenance / Low stock
- Blue `#3b82f6` — In-progress
