---
name: API codegen drift is destructive
description: Why running full OpenAPI codegen breaks the PrintFlow app, and how to add fields safely instead.
---

# Generated API clients are hand-maintained with drift

The generated packages `lib/api-zod/src/generated/*` and `lib/api-client-react/src/generated/*`
contain endpoints and fields that do NOT exist in `lib/api-spec/openapi.yaml`. Example: the
`useGetMachineDowntime` hook exists in the generated react client but has no corresponding path
in the spec. Consumers (frontend + api-server routes) import these drifted symbols.

**Rule:** Do NOT run full codegen (`pnpm --filter @workspace/api-spec run codegen`) as a way to
add a couple of fields. Codegen regenerates purely from `openapi.yaml`, which DELETES every drifted
endpoint/field, producing runtime errors like:
`The requested module '.../api-client-react/src/index.ts' does not provide an export named 'useGetMachineDowntime'`.

**Why:** The spec is stale/incomplete relative to the generated clients. The clients are the de-facto
source of truth and are edited by hand.

**How to apply:** To add a field for a feature, hand-edit the relevant `generated/api.schemas.ts`
interface (e.g. add fields to `Machine` / `JobWithDetails`), optionally mirror it in `openapi.yaml`
for documentation, then rebuild declarations for the TS project reference with
`pnpm exec tsc --build lib/api-client-react` (printflow's typecheck reads the referenced project's
`dist/*.d.ts`, not its `src`). Numeric Drizzle columns (oeeDefault, hourRate, dieCost) arrive as
strings over the wire → type them as `string | null` and `parseFloat` at use sites.

If a full regeneration is ever truly required, first inventory the drift (grep generated for symbols
absent from the spec) and add those paths/fields to the spec so codegen preserves them.
