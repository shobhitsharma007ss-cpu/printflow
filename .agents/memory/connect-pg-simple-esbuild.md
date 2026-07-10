---
name: connect-pg-simple session table under esbuild
description: Why the session store table must be created in a migration, not by connect-pg-simple at runtime, in the esbuild-bundled api-server.
---

# connect-pg-simple + esbuild bundling

`connect-pg-simple`'s `createTableIfMissing: true` creates its session table by
reading a sibling `table.sql` file at runtime via a path relative to its own
module directory. The api-server is bundled with esbuild, and that `.sql` file is
NOT emitted into `dist/`, so the auto-create silently no-ops — the session table
never exists, every session write fails, and logins appear to succeed but the
session is never persisted (subsequent authed requests 401).

**Why:** esbuild bundles JS only; runtime file reads of package data files break.

**How to apply:** Create the session store table (`sid varchar pk`, `sess json`,
`expire timestamp(6)`, index on `expire`) in the idempotent prod migration
(`CREATE TABLE IF NOT EXISTS`) and set `createTableIfMissing: false`. Same trap
applies to any bundled dependency that reads sibling asset files at runtime.
