---
name: Costing compute() architecture
description: How the PrintFlow costing calculator is structured after the costing upgrade — settings flow, setup waste formula, pharma test validation.
---

# Costing Compute Architecture

## Settings flow
- `costing_settings` PostgreSQL table (key TEXT PK, value JSONB) — seeded by Migration 17.
- Frontend hook: `use-costing-settings.ts` → `useCostingSettings()` returns `CostingSettingsMap`, falls back to `COSTING_SETTINGS_DEFAULTS` while loading.
- `compute(form, machine, dieMachine, gluerMachine, settings = COSTING_SETTINGS_DEFAULTS)` — pure/synchronous, settings passed in, never async.
- The costing.tsx useMemo passes `settings ?? COSTING_SETTINGS_DEFAULTS` as the 5th arg.

## planSheets formula (post-upgrade)
```
planSheets = ceil((reqSheets + pressMAkeready + dieSetupWasteSheets + gluerSetupWasteSheets) * (1 + runningWastePct/100))
```
All four terms are inside the running waste %, consistent with how makeready was already handled.
- `dieSetupWasteSheets`: 50 (existing die) or 150 (new die), from settings.
- `gluerSetupWasteSheets`: ceil(gluerSetupWasteCartons / ups), cartons default 100.

## Pharma test validation (must hold after any compute changes)
- 25k cartons, 100×80×40mm straight tuck, 23×36in 300gsm @₹85/kg, 4+1 colours, aqueous inline, existing die, ups=8, 15% profit, no finishing.
- Expected: ₹97k–₹1.09L pre-GST.
- Actual with defaults: planSheets=3799, preGst≈₹98,419. ✅

**Why:** This test case was specified as a mandatory sanity check. Any future change to compute() should re-run this node snippet to confirm the range holds.

## GST default
Changed from 12% to 18% in `DEFAULTS` constant in costing.tsx (scope item #8).

## Slab comparison
`slabs` useMemo reuses compute() with qty 10k/25k/50k, same form otherwise. Active row highlighted when current qty matches.
