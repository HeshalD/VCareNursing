# Shift-Based Billing — Handoff

Session summary for continuing this work in a fresh chat. Paste this file's path (or contents) at the start of the new conversation.

## What this project is

VCareNursing has three booking service models: `LIVE_IN`, `VISITING`, `SHIFT_BASED`. Historically all three were billed with a single `daily_rate`, even though `SHIFT_BASED` bookings actually run N shifts/day and should be billed per shift. This work converted `SHIFT_BASED` billing to be fully per-shift, added a manual (no-cron) shift confirm/waive/reschedule workflow, and fixed a long tail of calendar-rendering bugs that fell out of it.

**Governing rule established early and still in force: never associate `daily_rate` with a SHIFT_BASED booking, anywhere.** Every SHIFT_BASED money/date calculation must derive from `shift_rate` × shifts, not `daily_rate` × days. When touching new code, grep for `dailyRate`/`daily_rate` near anything gated on `service_model === 'SHIFT_BASED'` and be suspicious.

## Schema (backend/migrate.js) — already migrated, don't re-add

- `bookings.shift_rate` — client's per-shift charge (separate from staff pay, which stays on `booking_staff_assignments.daily_rate`).
- `quotations.per_shift_rate`, `quotations.qty_shifts` — quote-side equivalents of `daily_rate`/`qty_days`.
- `quote_line_items.item_subtype` — `'RATE_DAILY' | 'RATE_SHIFT' | NULL`. Authoritative signal for which line item is the rate line (replaces fragile description-text matching like `.includes('daily')`/`.includes('shift')`, which is kept only as a fallback for old quotes).
- `shift_reschedules` table — one row per moved shift occurrence: `booking_id, shift_slot_id, original_date, new_date, new_start_time, assignment_id, status (ACTIVE/CANCELLED), reason, created_by`.
- `booking_staff_assignments.reschedule_id` — nullable; set only on a "makeup-only" assignment row created when a reschedule changes staff. The unique index `uniq_active_slot_assignment` was updated to exclude these (`WHERE status='ACTIVE' AND shift_slot_id IS NOT NULL AND reschedule_id IS NULL`) so a makeup assignment doesn't collide with the slot's standing assignment.
- `staff_daily_attendance.reschedule_id`, `booking_daily_invoices.reschedule_id` — nullable; a makeup occurrence's attendance/invoice row is keyed by `reschedule_id` (unique partial index) instead of the normal `(assignment_id/booking_id, service_date, shift_slot_id)` keys, since the makeup lands on a date that may already have its own natural occurrence for the same slot.

## Backend changes

- **`services/billingService.js`** — `calculateShiftSlotCharge` now reads `booking.shift_rate` (client charge) instead of `slotAssignment.daily_rate` (staff pay) — this was the original bug: client was being charged what the staff earns.
- **`controllers/bookingController.js`** — new endpoints, all under `/api/bookings/:booking_id/...`:
  - `GET /shift-schedule?from&to` — derives every shift occurrence in a range from the active pattern × calendar dates, overlaid with reschedules (moved origins hidden, makeups added), merged with attendance/invoice status. Nothing is pre-seeded; this is the manual, no-cron source of truth.
  - `POST /shift-occurrences/waive` — atomically skips both the client invoice AND staff pay for one occurrence (your definition of "waive": no charge, no pay, client's shift bank not consumed).
  - `POST /shift-occurrences/reschedule` — creates a `shift_reschedules` row; if `new_staff_profile_id` differs from the slot's standing assignment, creates a makeup-only assignment row.
  - `POST /shift-occurrences/:reschedule_id/cancel` — undoes a pending (not-yet-decided) reschedule.
  - `GET /shift-reschedules` — all ACTIVE reschedules for a booking, with a computed `decided` boolean (whether either side has already been invoiced/paid) so the frontend can disable "Cancel move" appropriately.
  - `confirmDailyInvoice` — now defaults the shift amount from `booking.shift_rate`, and threads `reschedule_id` through for makeup occurrences.
- **`controllers/dailyAttendanceController.js`** — `upsertAttendance` accepts `reschedule_id`, upserts keyed by it when present.
- **`cron/dailyInvoicing.js`** — SHIFT_BASED completely removed from the nightly cron (no seeding, no auto-invoicing) per your "forget the cron, keep everything manual" instruction. `getActiveBookingBalances`/`runCreditMonitor` (overdue detection) updated to use `shift_rate` for SHIFT_BASED bookings instead of `daily_rate`.
- **`controllers/quoteController.js`** — `createModularQuotation` and `updateQuoteLineItems` derive `daily_rate`/`per_shift_rate` from `item_subtype`-tagged line items (fallback to text-matching for old quotes). Fixed a real bug found along the way: `updateQuoteLineItems` never recomputed the legacy rate columns on edit — a quote edit's new rate never reached `quotations.daily_rate`/`per_shift_rate`, so a booking created afterward would silently use the stale value.
- **`controllers/staffAssignmentController.js`** — `getAssignmentFormData` now returns `shift_rate`/`qty_shifts`.
- **`controllers/staffController.js`** — `getAttendanceCalendar` now returns `shift_slot_id`/`shift_number`/`shift_label`/`reschedule_id` on assignments and attendance, plus a `reschedules` array — needed for `StaffCareTimeline` to render multi-shift days.
- **`routes/bookingRoutes.js`** — routes for all the new endpoints above.

## Frontend changes

- **`client/src/api/api.js`** — client methods: `getBookingShiftSchedule`, `waiveShiftOccurrence`, `rescheduleShiftOccurrence`, `cancelShiftReschedule`, `getBookingShiftReschedules`.
- **`client/src/modules/admin/service_quotes/RateLineItemRow.jsx`** (new) — dedicated rate line-item row (badge + relabeled qty column "Days"/"Shifts"), tags `item_subtype`. Used by both quote-building surfaces below instead of a generic freeform charge line.
- **`ModularQuoteBuilder.jsx`** + **`CreateQuotationDrawer.jsx`** — "Add Shift Rate" / "Add Care Rate" buttons (singleton per quote, shown based on the service request's/quote's `service_model`), render `RateLineItemRow` for tagged items.
- **`AdminDirectBookingDrawer.jsx`** — added a required "Per-Shift Rate" field shown only for SHIFT_BASED, sent as `shift_rate`.
- **`user_managemnet/StaffCareTimeline.jsx`** — rewritten to support multiple shifts per calendar day (was previously "pick one best assignment per day", which silently hid the 2nd+ shift on multi-shift days). Now shows moved shifts (hollow dot, "Moved" badge) and makeup shifts (ringed dot, "Makeup" badge). Fed by `staffController.getAttendanceCalendar`'s new `reschedules` array.
- **`bookings/CareTimeline.jsx`** — the big one. Multiple fixes layered on top of each other, in order:
  1. Added `shiftRate` prop; all "Billed" math for SHIFT_BASED now uses `shiftRate × shift count`, never `dailyRate`.
  2. Added `reschedules` prop; moved-origin shifts render as hollow "Moved" markers, makeup shifts as ringed "Makeup" markers with their own tooltip badges.
  3. **`maxEventDayNum`** now considers `reschedules[].new_date` — otherwise a makeup shift's date (often past the booking's current plan) falls outside `displayDays` and renders as a plain "outside booking" grey cell.
  4. **`naturalEndDayNum`** — standing shift assignments are open-ended in the DB (`service_end_date` stays NULL until completion cron runs), so without an explicit bound they render as working shifts on *every* day the grid reaches, including days that only exist because a makeup shift extended the grid. This value is the last day-number that gets natural (non-makeup) occurrences.
     - **Important fix**: for SHIFT_BASED bookings with a real paid plan, `naturalEndDayNum` must equal `plannedDays` (the shift-derived plan length) alone — NOT `max(scheduled_end_time, plannedDays)`. `scheduled_end_time` is typed free-hand at booking creation and nothing keeps it in sync with `shift_rate × shifts/day`; trusting it when it overshoots the real paid plan reintroduces the "3 shifts on a makeup day" bug (2 phantom naturals + 1 real makeup). Bookings with no payment/shift_rate yet still fall back to `scheduled_end_time` so they render before any payment exists.
  5. **`plannedDays`** (in `BookingDetailPageV2.jsx`, passed down) — for SHIFT_BASED, changed from `floor(paidShifts / shiftsPerDay)` to `ceil(...)`, so a non-evenly-divisible shift count (e.g. 7 shifts @ 2/day) gets a 4th partial day instead of silently truncating the 7th shift.
  6. **`partialLastDay`** — when the plan's last day is partial (per the ceil above), the natural pattern rendered on that day is trimmed to just the leftover paid shift count (lowest shift numbers first), only for *future* (not-yet-delivered) days.
- **`bookings/BookingDetailPageV2.jsx`** — the other big one:
  - **Shift Bank panel** (new, above CareTimeline, SHIFT_BASED only) — paid/used/waived/remaining shift counts, derived from `dailyInvoiceRecords` + `shiftRate` + `totalPaid`. This is the *exact* ledger (vs. the calendar's day-level approximation).
  - **Waive / Reschedule buttons** added to the day-modal's per-shift invoice row.
  - **Reschedule modal** (new) — replaced an earlier `window.prompt`-based flow. Date picker (defaults to day after scheduled end), optional time, a "Change the staff member for this shift?" checkbox that reveals a staff picker + `StaffScheduleTimeline` preview (reusing the Swap modal's `availableStaff`/`staffSchedules` state), optional reason. **z-index is `z-[60]`** — it opens from inside the Day Detail Modal (`z-50`, rendered later in the DOM so it would otherwise paint on top and make the reschedule modal unreachable); keep this z-index relationship if either modal is touched again.
  - **Reschedules tab** (new, SHIFT_BASED only) — lists active reschedules with a "Cancel move" button (disabled once `decided`).
  - **`getAssignmentsForDate`** (feeds the day modal's attendance table) now excludes shifts whose `(shift_slot_id, date)` matches an active reschedule's `original_date` — previously a moved-away shift kept showing up in the attendance form on its old date since the standing assignment is open-ended. A blue notice now explains when a shift was moved away from the date being viewed.
  - **Stat cards**: "Days served" → "Shifts served", "Daily rate" → "Shift rate" for SHIFT_BASED (both label and underlying math — `servedShifts = servedDays × shiftsPerDay`, `shiftsPaidCount = floor(totalPaid / shiftRate)`). `simOutstanding` (sim-date overdue projection) also branches on `isShiftBased` now.
  - Financial snapshot: "Daily rate" → "Per-shift rate" row for SHIFT_BASED.
  - Day-modal invoice prefill now uses `shiftRate`, not the staff assignment's `daily_rate` (same root bug as the billingService fix, just on the frontend prefill side).
- **`service_requests/booking_staff_assignment.jsx`**:
  - Booking Summary shows "Shift Rate" + "Shifts Paid" (derived) instead of "Daily Rate" for SHIFT_BASED.
  - Fixed a timezone bug: `formatDateForDisplay` was slicing the raw ISO string (reads the UTC day), which is one day early for UTC+ timezones like Sri Lanka's. Now parses through `new Date()` + `toLocaleDateString`. This was causing the prefilled Service Start Date to show the day *before* the actual booking start date.
  - Added `onWheel={(e) => e.currentTarget.blur()}` to all four number inputs (Daily Rate, OT Rate, shift Duration, shift Rate) so scrolling the page over them doesn't change their value.

## Known follow-ups / not yet done

1. **Settlement tab still uses raw `dailyRate`** for SHIFT_BASED bookings — `projectedRemainingBalanceAt`/`servedDaysAsOf` in `BookingDetailPageV2.jsx` (used for termination/completion payout projections) multiply `servedDays × dailyRate` regardless of service model. This violates the "never associate daily_rate with shift-based bookings" rule and was explicitly flagged as not-yet-fixed. **Do this next if the user asks about Settlement/termination/completion payouts for shift bookings.**
2. The calendar's day-level paid/overdue boundary is an *approximation* (assumes a uniform current-pattern shift count per day); the Shift Bank panel is the authoritative ledger. This is a known, accepted tradeoff, not a bug.
3. `CareTimeline.jsx` is now quite dense with SHIFT_BASED-specific branches (`isBeyondNaturalFuture`, `partialLastDay`, `movedOrigins`, makeup handling) layered incrementally. If asked to make further calendar changes, read the whole file fresh rather than assuming a piece is simpler than it is — several of these interact (e.g. `partialLastDay` trimming happens after moved/makeup matching, order matters).

## How to verify changes in this codebase

- Backend: `node --check <file>` per touched file (fast syntax check), migrations via `node -e "require('dotenv').config(); require('./migrate')(1,1000)..."` pattern used throughout this session.
- Frontend: `npx eslint <file>` — this repo has several pre-existing lint issues (`Icon`/`actionLoading` unused vars in `BookingDetailPageV2.jsx`, a couple of `react-hooks/exhaustive-deps` warnings) that are NOT related to this work — don't try to fix them unless asked, and don't be alarmed if they show up in lint output.
- No automated test suite was run/found for these areas; verification in this session was via direct DB queries (`node -e` scripts querying `db.query(...)`) against the live dev DB to confirm actual booking/reschedule data, then reasoning through the render logic by hand.
