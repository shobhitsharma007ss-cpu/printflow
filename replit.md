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
- `materials` — all materials (board/paper/consumable)
- `material_vendors` — many-to-many linking materials to vendors
- `stock_inward` — stock receipt tracking
- `machines` — machine fleet with capabilities/status
- `job_templates` — reusable routing templates
- `jobs` — production jobs with auto PF-XXX codes
- `job_routing` — per-job machine routing steps
- `job_materials` — material allocation per job
- `wastage_log` — wastage recording and tracking

## Frontend Pages

1. **Dashboard** (`/`) — KPI cards, live machine status row, recent jobs, auto-refreshes every 60s
2. **Floor Monitor** (`/floor-monitor`) — Real-time machine grid grouped by type with status dots
3. **Inventory** (`/inventory`) — Visual stacks (boards/paper) + cylinder gauges (consumables), click for detail side panel, Record Inward Stock modal
4. **Jobs** (`/jobs`) — Job table with status/search filters; Create New Job modal (client, name, material dropdown, qty, template selector with live routing preview, scheduled date, 4% wastage preview)
5. **Reports** (`/reports`) — Wastage chart grouped per job (PF-XXX x-axis), color-coded bars (normal/watch/critical), stock reorder watchlist
6. **Settings** (`/settings`) — 4 tabs: Machines (inline operator edit, status toggle), Materials (inline reorder level edit), Vendors (add/delete), Job Templates (routing step visualization)

## API Routes

- `/api/vendors` — CRUD
- `/api/materials` — CRUD + vendor linking + inward history
- `/api/stock-inward` — CRUD (auto-updates material qty)
- `/api/machines` — CRUD + PATCH status
- `/api/job-templates` — CRUD
- `/api/jobs` — CRUD + PATCH status (auto-creates routing from template)
- `/api/job-routing/:id/status` — Update routing step status
- `/api/wastage-log` — CRUD
- `/api/dashboard/metrics` — Aggregate dashboard data
- `/api/reports/wastage` — Wastage report
- `/api/reports/stock-summary` — Stock with reorder status
- `/api/reports/job-cost/:jobId` — Per-job cost breakdown

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
