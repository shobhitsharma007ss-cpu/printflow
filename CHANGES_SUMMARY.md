# PrintFlow — Changes Summary (Last Session)

**Project:** PrintFlow — Plant Management System
**Stack:** pnpm monorepo · React + Vite frontend · Express 5 backend · PostgreSQL + Drizzle ORM
**Feature built:** WhatsApp / Email external alerts for plant events

---

## Overview

The factory owner can now receive WhatsApp messages and/or emails whenever
important plant events happen — low stock, a job completing, a machine going
down, or a job going overdue. All of this is configured from a new "Alerts"
tab inside the Settings page. Every delivery attempt (success or failure) is
recorded in the database so the owner can see what was sent and when.

---

## 1. Database — 5 New Tables

**File:** `lib/db/src/schema/alerts.ts`

### `alert_config`
Controls which events trigger alerts and on which channels.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| event_type | text UNIQUE | `low_stock`, `job_completed`, `machine_issue`, `job_overdue` |
| whatsapp_enabled | boolean | default false |
| email_enabled | boolean | default false |
| updated_at | timestamptz | |

### `alert_providers`
Stores API credentials for WhatsApp (Twilio) and Email (Resend).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| channel | text UNIQUE | `whatsapp` or `email` |
| provider | text | e.g. `twilio`, `resend` |
| api_key | text | stored in plaintext server-side; masked in API responses |
| api_sid | text | Twilio Account SID (WhatsApp only) |
| from_address | text | Twilio WhatsApp number or Resend "from" email |
| enabled | boolean | default false |
| updated_at | timestamptz | |

### `alert_recipients`
Who gets alerted on each channel.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| channel | text | `whatsapp` or `email` |
| address | text | phone number or email address |
| label | text | friendly name (optional) |
| created_at | timestamptz | |

### `alert_log`
Every send attempt — successful or failed — is written here.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| event_type | text | |
| channel | text | |
| recipient | text | actual address, or `(no provider)` / `(no recipients)` |
| status | text | `sent` or `failed` |
| error_message | text | populated on failure |
| message_body | text | the exact text that was sent |
| sent_at | timestamptz | |

### `alert_suppression`
Prevents repeat alerts for the same condition within 24 hours.

| Column | Type | Notes |
|---|---|---|
| key | text PK | `low_stock_{materialId}` or `job_overdue_{jobId}` |
| last_alerted_at | timestamptz | |

The schema is exported from `lib/db/src/schema/index.ts` and all 5 tables
are exported from `@workspace/db` for use in backend routes.

---

## 2. Database Migration

**File:** `artifacts/api-server/src/lib/prod-migration.ts`

**Migration #16** was added at the top of the prod migration list (newest
always goes first). It uses `CREATE TABLE IF NOT EXISTS` and
`ADD COLUMN IF NOT EXISTS` throughout, so it is fully idempotent and safe to
run multiple times. It creates all 5 alert tables.

---

## 3. Alert Engine

**File:** `artifacts/api-server/src/lib/alert-engine.ts`

This is the core dispatcher. It exports two functions:

### `dispatchExternalAlert(notificationType, message, meta?)`

Called fire-and-forget from `createNotification()` whenever a plant event
fires. Flow:

1. Maps the internal notification type string to the alert event type:
   - `"low-stock"` → `low_stock`
   - `"job-completed"` → `job_completed`
   - `"machine-paused"` → `machine_issue`
   - `"job-overdue"` → `job_overdue`
2. Looks up `alert_config` for that event type. If neither channel is
   enabled, returns immediately (no-op).
3. **Duplicate suppression (pre-check):** For `low_stock` events, checks
   `alert_suppression` using key `low_stock_{materialId}`. If the last alert
   was less than 24 hours ago, skips entirely.
4. For each enabled channel (`whatsapp`, `email`):
   - Loads the provider row. If none configured or `api_key` is null, writes
     a `failed` row to `alert_log` with `recipient = "(no provider)"` and
     continues.
   - Loads all recipients for that channel. If none, writes a `failed` row
     with `recipient = "(no recipients)"` and continues.
   - For each recipient, calls the appropriate send function wrapped in
     `withRetryOnce()` (retries once after 2 seconds on any error).
   - On success: writes a `sent` row to `alert_log`, sets `anySent = true`.
   - On failure after retry: writes a `failed` row to `alert_log` with the
     error message.
5. **Suppression write (post-send):** Only writes/updates `alert_suppression`
   if `anySent === true`. This prevents a failed delivery from blocking future
   retry attempts.

### `checkAndAlertOverdueJobs()`

Runs on a 60-second interval (set up in `index.ts`). Flow:

1. Checks if `job_overdue` is enabled in `alert_config`. If not, exits.
2. Gets today's date as `YYYY-MM-DD` string (UTC).
3. Queries all active jobs (status NOT IN `completed`, `cancelled`) that have
   a non-null `scheduled_date`.
4. Filters in JS for jobs where `scheduledDate < todayStr` (i.e. overdue).
5. For each overdue job:
   - Checks `alert_suppression` with key `job_overdue_{jobId}`. Skips if
     alerted in the last 24 hours.
   - Sends a message like: *"Job JOB-001 (Job Name) for Client Name is
     overdue (was due 2026-07-10)."*
   - Same provider/recipient/retry/log logic as above.
   - Writes suppression only after `anySent === true`.

### Provider implementations

**WhatsApp — Twilio:**
- REST call to `POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json`
- Basic auth: `Base64(AccountSID:AuthToken)`
- Automatically prefixes `whatsapp:` to `To` and `From` numbers if missing.

**Email — Resend:**
- REST call to `POST https://api.resend.com/emails`
- Bearer token auth
- Subject is set to `PrintFlow: {Event Title}` (e.g. "PrintFlow: Low Stock Alert")

### Retry helper
```ts
async function withRetryOnce<T>(fn: () => Promise<T>): Promise<T>
```
Tries `fn()` once, waits 2 seconds on error, tries again. The second attempt
throws naturally (no swallowing).

---

## 4. Backend Routes

**File:** `artifacts/api-server/src/routes/alerts.ts`

All routes are registered under `requireRole("owner")` — only the owner
account can access them. Registered in `artifacts/api-server/src/routes/index.ts`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alert-config` | Returns all 4 event configs (auto-creates defaults if missing) |
| PUT | `/api/alert-config/:eventType` | Toggles whatsapp/email on or off for an event |
| GET | `/api/alert-providers` | Returns provider credentials (API key masked after first 4 chars) |
| PUT | `/api/alert-providers/:channel` | Saves provider credentials. If `apiKey` contains `•` it means the masked value was sent back unchanged — the server skips overwriting in that case. |
| GET | `/api/alert-recipients` | Lists all recipients |
| POST | `/api/alert-recipients` | Adds a recipient `{ channel, address, label? }` |
| DELETE | `/api/alert-recipients/:id` | Removes a recipient |
| GET | `/api/alert-log` | Returns last 80 delivery log entries (newest first) |
| POST | `/api/alerts/test` | Sends a test alert for a given `{ channel, eventType }`. Temporarily sets config to enable just that channel, fires dispatch, then restores prior config. |

---

## 5. Notification Hook (event trigger)

**File:** `artifacts/api-server/src/routes/notifications.ts`

The existing `createNotification()` function was modified. After inserting
a notification row, it checks whether the `data.type` is one of the four
known alert event types (`low-stock`, `job-completed`, `machine-paused`,
`job-overdue`). If it is:

- Dynamically imports `alert-engine` (to avoid circular import issues, since
  notifications.ts is imported by routes that alert-engine also uses).
- Calls `dispatchExternalAlert()` fire-and-forget.
- **Non-silent error handling:** If the dynamic import or dispatch throws
  before it can write its own log entries (e.g. a DB error querying config),
  the `.catch()` handler writes a `failed` row to `alert_log` with:
  - `channel: "engine"`, `recipient: "(dispatch-error)"`, and the error
    message — so engine-level failures are always visible in Settings.

Non-alert notification types (e.g. a general status update) bypass the
engine entirely.

---

## 6. Overdue Job Interval

**File:** `artifacts/api-server/src/index.ts`

```ts
setInterval(() => {
  checkAndAlertOverdueJobs().catch(err =>
    logger.warn({ err }, "Overdue job alert check failed")
  );
}, 60 * 1000); // every 60 seconds
```

Runs immediately after the server starts listening. Errors are caught and
logged — they never crash the server.

---

## 7. Event Trigger Points

**File:** `artifacts/api-server/src/routes/jobs.ts`

Two call-sites were updated to pass the correct notification type and metadata:

- **Low stock:** When material is deducted and falls below reorder level,
  `createNotification()` is called with `type: "low-stock"` and
  `meta: { materialId }`. The `materialId` is needed for per-material
  suppression.
- **Machine paused:** When a job step is paused (breakdown/maintenance),
  notification type is `"machine-paused"` (was previously a different string
  that didn't match the engine's event map).
- **Job completed:** When all routing steps for a job are finished,
  `createNotification()` is called with `type: "job-completed"`.

---

## 8. Frontend — Settings "Alerts" Tab

**File:** `artifacts/printflow/src/pages/settings.tsx`

A new "Alerts" tab was added as the last tab in the Settings page. It has
four sections:

### Event × Channel Toggle Grid
A table showing all 4 events as rows and the 2 channels (WhatsApp, Email) as
columns. Each cell is a toggle switch. Toggling calls
`PUT /api/alert-config/:eventType` immediately.

### Provider Configuration Cards
Two collapsible cards — one for WhatsApp (Twilio) and one for Email (Resend):

**WhatsApp card fields:**
- Account SID (Twilio)
- Auth Token (masked)
- From WhatsApp number (e.g. `+14155238886`)
- Enable/disable toggle
- Save button

**Email card fields:**
- Resend API Key (masked)
- From email address
- Enable/disable toggle
- Save button

API keys are displayed masked (`sk••••••••`) after saving and the UI is
careful not to send the masked value back on save.

### Recipient Management
Two sections (WhatsApp / Email). Each shows existing recipients as a list
with a delete button, plus an "Add recipient" form with address and optional
label fields.

### Test Send
A row of test buttons — one per event type per channel — that call
`POST /api/alerts/test` and show a success/error toast.

### Delivery Log
A table showing the last 80 entries from `alert_log`:
- Timestamp, event type, channel, recipient, status (green = sent,
  red = failed), error message if any, and the message body that was sent.

---

## 9. Frontend Hooks

**File:** `artifacts/printflow/src/hooks/use-alerts.ts`

React Query hooks for all alert API endpoints:

| Hook | Purpose |
|---|---|
| `useAlertConfig()` | Fetches all 4 event configs |
| `useUpdateAlertConfig()` | Mutation to toggle whatsapp/email for an event |
| `useAlertProviders()` | Fetches provider credentials (masked) |
| `useUpdateAlertProvider()` | Mutation to save provider credentials |
| `useAlertRecipients()` | Fetches all recipients |
| `useAddAlertRecipient()` | Mutation to add a recipient |
| `useDeleteAlertRecipient()` | Mutation to delete a recipient by id |
| `useAlertLog()` | Fetches last 80 delivery log entries |
| `useSendTestAlert()` | Mutation to fire a test alert, invalidates log on success |

TypeScript interfaces are exported for all four entity types:
`AlertConfig`, `AlertProvider`, `AlertRecipient`, `AlertLogEntry`.

---

## 10. Key Design Decisions

| Decision | Reason |
|---|---|
| Suppression written **after** successful send | Prevents a failed attempt from blocking future retries |
| Retry-once with 2s delay | Handles transient network/provider blips without long delays |
| Dynamic import for alert-engine in notifications.ts | Avoids circular module dependency |
| `scheduledDate` (YYYY-MM-DD text) for overdue check | Matches the DB column type; compared as strings which works correctly |
| 60-second overdue poll interval | Meets the <1 minute delivery SLA for overdue events |
| All no-op paths write to `alert_log` | "Never silent" requirement — missing provider, no recipients, and engine errors are all visible |
| API key masked in GET responses | Credential safety — partial reveal (first 4 chars) lets UI confirm a key is saved without exposing it |
| Owner-only routes | External alert config is sensitive; only the owner account can read/write it |

---

## File Index

| File | What changed |
|---|---|
| `lib/db/src/schema/alerts.ts` | New — 5 table definitions |
| `lib/db/src/schema/index.ts` | Added exports for all 5 alert tables |
| `artifacts/api-server/src/lib/prod-migration.ts` | Migration #16 added at top |
| `artifacts/api-server/src/lib/alert-engine.ts` | New — full dispatch engine |
| `artifacts/api-server/src/routes/alerts.ts` | New — 9 REST endpoints |
| `artifacts/api-server/src/routes/index.ts` | Registered `alertsRouter` |
| `artifacts/api-server/src/routes/notifications.ts` | Added external alert trigger + error logging in `createNotification()` |
| `artifacts/api-server/src/routes/jobs.ts` | Fixed notification types and added `meta.materialId` |
| `artifacts/api-server/src/index.ts` | Added 60-second overdue check interval |
| `artifacts/printflow/src/pages/settings.tsx` | Added "Alerts" tab |
| `artifacts/printflow/src/hooks/use-alerts.ts` | New — 9 React Query hooks |
