# Statements Module — Handoff Document
**Date:** 2026-06-16  
**Branch:** Heshal2  
**Author:** Claude (session handoff)

---

## What This Module Does

The Statements module lets admin/accounts/coordinator staff generate, preview, download, and WhatsApp-send financial statements for each client booking. It lives at:

- **Frontend:** `client/src/modules/admin/statements/statements.jsx`
- **Backend controller:** `backend/controllers/statementController.js`
- **Backend routes:** `backend/routes/statementRoutes.js`
- **PDF generator:** `backend/utils/statement.js` (Handlebars + Puppeteer)
- **PDF template:** `backend/templates/statementTemplate.html`
- **API client methods:** `client/src/api/api.js` — `getClientStatement`, `downloadClientStatement`, `sendClientStatementToWhatsApp`, `getSavedStatements`

---

## Architecture: Two Data Representations (Critical)

The backend `buildStatementPayload()` function produces **two different representations** of the same ledger data:

| Field | `statementLines` (JSON API) | `pdfData.ledger` (Handlebars PDF) |
|---|---|---|
| Invoice amount | `amount_invoiced` | `amount` |
| Payment amount | `amount_paid` | `payments` |
| Date | raw ISO timestamp | pre-formatted string (dd Mon yyyy) |
| Balance | `balance` | `balance` |

**The frontend uses `statementLines`** (returned as `res.ledger` from `GET /statement/:client_id`).  
**Do not read `amount` or `payments`** in the frontend — those are PDF-only field names and will always be undefined in the JSON response.

This was a bug that was fixed: the invoice/payment columns were showing `—` because the frontend was accidentally reading the PDF field names.

---

## Backend Routes

All routes require `protect` + `restrictTo('SUPER_ADMIN', 'ACCOUNTS', 'COORDINATOR')`.

| Method | Path | Controller | Notes |
|---|---|---|---|
| GET | `/statement/saved` | `getSavedStatements` | Paginated list of all generated statements |
| GET | `/statement/transactions/:client_id` | `getClientTransactions` | Raw transactions (not used in current UI) |
| GET | `/statement/:client_id` | `getClientStatement` | Returns `account_summary` + `ledger` (statementLines) |
| POST | `/statement/download/:client_id` | `downloadClientStatement` | Generates PDF, returns binary buffer |
| POST | `/statement/whatsapp/:client_id` | `sendClientStatementToWhatsApp` | Generates PDF, uploads to Cloudinary, sends WA |

Date range is passed as query params `start_date` / `end_date` for GET, body for POST. The `normalizeDateRange()` helper reads from both and defaults to epoch → now if omitted (i.e., All Time).

---

## Frontend State Overview

```
bookings[]                   — all bookings loaded on mount via getAllBookings()
globalStartDate/End          — shared date range for all bookings
selectedMonth                — drives the month quick-select dropdown
isAllTime                    — flag that overrides dates (sends empty params → backend defaults to all time)
expandedBookings (Set)       — booking_ids that are currently open
clientTransactions {}        — keyed by client_profile_id: { loading, ledger, summary, error }
txVisible {}                 — keyed by client_profile_id: how many rows to show (load more)
actionLoading {}             — keyed by `${booking_id}-download` or `-whatsapp`
savedStatements[]            — statement history (bottom table)
```

### Key derived values
```js
const hasActivePeriod = isAllTime || (!!globalStartDate && !!globalEndDate);
```
Nothing fetches or expands until `hasActivePeriod` is true.

---

## Data Flow: Expand a Booking

1. User selects a date period (month/custom/all time) → `applyRange()` is called
   - Clears `clientTransactions`, `txVisible`, `expandedBookings` (stale data prevention)
2. User clicks a booking row → `toggleBooking(bookingId, clientProfileId)`
3. If expanding AND `hasActivePeriod` AND no cached data for this `clientProfileId` → calls `fetchForClient(clientProfileId)`
4. `fetchForClient` calls `apiClient.getClientStatement(clientId, params)` → GET `/statement/:client_id?start_date=...&end_date=...`
5. Response shape: `{ account_summary: { opening_balance, invoiced_amount, amount_paid, balance_due }, ledger: [...statementLines] }`
6. Stored in `clientTransactions[clientProfileId]`
7. Transaction table renders `ledger.slice(0, txVisible[clientProfileId] || PAGE_SIZE)`

Note: transactions are keyed by `client_profile_id`, **not** `booking_id`. If the same client has two bookings, expanding the second will reuse the cached fetch from the first. This is intentional — a client only has one financial account across all their bookings.

---

## Load More

`PAGE_SIZE = 10`. The `txVisible` map tracks how many rows each client has visible. Clicking "Load more" increments by `PAGE_SIZE` up to `ledger.length`. This keeps DOM size bounded for clients with many transactions.

---

## Download / WhatsApp Actions

Both require `hasActivePeriod`. If not set, they `alert()` and bail. They call POST endpoints which:
1. Call `buildStatementPayload()` again (server-side)
2. Render PDF via Puppeteer (can take 10–30 seconds in prod)
3. For download: return binary PDF buffer directly
4. For WhatsApp: upload to Cloudinary → `sendWhatsAppMessage()` with document attachment

After either action, `fetchSavedStatements()` is called to refresh the history table at the bottom.

---

## Statement History Table

Bottom of the page. Shows all records from the `saved_statements` DB table. Has a "Refresh" button. The `pdf_url` column links to the Cloudinary-hosted PDF (only populated for WhatsApp-sent statements — direct downloads don't upload to Cloudinary so `pdf_url` is null).

---

## Known Pitfalls

1. **PDF generation is slow** — Puppeteer launches a headless Chrome instance per request. There's a 60-second timeout on the request. Don't add UI that makes multiple PDF requests in parallel.

2. **`getClientStatement` must stay a GET** — The backend route is `router.get(...)`. A previous version of `api.js` accidentally used `method: 'POST'` which caused silent failures. The fixed version uses URLSearchParams query string.

3. **All Time = empty params** — When `isAllTime` is true, the frontend sends `{}` as params. The `normalizeDateRange()` backend helper defaults `start_date` to `1970-01-01T00:00:00Z` and `end_date` to `new Date().toISOString()`, effectively covering all time.

4. **Date fields in `statementLines` are raw ISO timestamps** — Always wrap `tx.date` in `fmtDate()` before rendering. The PDF template receives pre-formatted dates but the JSON API does not.

5. **`amount_invoiced` can be `0` (not null)** — The conditional `{tx.amount_invoiced ? fmt(...) : '—'}` correctly shows `—` for zero values. This is intentional — a zero-amount invoice/payment row shows `—` for that column and the non-zero column shows the amount.

---

## Files Changed in This Session

| File | Change |
|---|---|
| `client/src/api/api.js` | Fixed `getClientStatement` from POST with body → GET with URLSearchParams |
| `client/src/modules/admin/statements/statements.jsx` | Full redesign: global date range, month selector, All Time toggle, lazy fetch per booking, load-more pagination, fixed field names (`amount_invoiced`/`amount_paid`), `fmtDate()` on ISO timestamps |

Backend files were read but not modified.

---

## Next Steps (Not Yet Done)

- No open tasks from this session. All four requests were completed and verified with a clean Vite build.
- Possible future improvements:
  - Filter bookings by client name / status on the statements page
  - Show statement history per-client (currently shows all clients mixed)
  - Persist the selected date range in URL params so the page can be bookmarked/shared
