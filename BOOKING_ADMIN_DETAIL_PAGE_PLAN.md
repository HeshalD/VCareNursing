# Admin Booking Detail Page Plan

## Goal
Build a detailed admin booking page that shows one booking in full and lets the admin manage billing, staff, termination, and statements from one screen.

This page needs to cover:
1. booking summary
2. payment history
3. invoice progress / overdue or remaining days
4. client details
5. staff assignment history and allocated amounts
6. staff swap action
7. termination action
8. client termination requests
9. optional auto-complete when invoiced amount reaches paid amount
10. statement generation for custom or preset date ranges

## What Already Exists

### Booking and termination routes
These already exist in the backend and can be reused immediately:

- `GET /api/bookings/:booking_id` from `backend/controllers/bookingController.js`
- `GET /api/bookings` for all bookings
- `GET /api/bookings/active-bookings`
- `GET /api/bookings/:booking_id/invoice-progress` from `paymentTrackingController.getBookingInvoiceProgress`
- `POST /api/bookings/:booking_id/swap-staff`
- `GET /api/bookings/:booking_id/swap-history`
- `POST /api/bookings/terminate/:booking_id` for client-initiated termination requests
- `GET /api/bookings/terminations/pending`
- `POST /api/bookings/terminations/approve/:termination_id`
- `POST /api/bookings/terminations/force-stop/:booking_id`
- `PATCH /api/bookings/:booking_id/extend`

### Staff assignment routes
These are already available and should be reused for the staff section:

- `GET /api/assignments/:booking_id/assignment-form`
- `POST /api/assignments/:booking_id/assign-staff`
- `GET /api/assignments/:booking_id/assignments`

### Payment routes and payment tracking
These can be used for payment history and payment progress:

- `GET /api/quotes/:quote_id/payment-progress`
- `GET /api/quotes/:quote_id/payments`
- `POST /api/quotes/:quote_id/record-payment`
- `POST /api/payments/:payment_id/verify`
- `POST /api/payments/:payment_id/reject`

### Client financial routes
These are useful for client-level payment history and statement lookup:

- `GET /api/client/payment-history/:client_id`
- `GET /api/client/payment-history`
- `GET /api/client/wallet-balance/:client_id`
- `GET /api/client/overdue-payments/:client_id`

### Statement routes
These already exist and can be wired into the admin page:

- `GET /api/statement/:client_id`
- `POST /api/statement/download/:client_id`

### Frontend API wrappers already present
The frontend API client already exposes wrappers for several of these:

- `getBookingById`
- `getBookingAssignments`
- `getPendingTerminationRequests`
- `approveTerminationRequest`
- `downloadClientStatement`
- `getQuotePayments`
- `getQuotePaymentProgress`

## What Needs To Be Created From Scratch

### 1. A booking detail aggregate endpoint
The current page will work better if the backend returns a single consolidated payload instead of making many separate calls from the frontend.

Suggested new route:

- `GET /api/bookings/:booking_id/admin-detail`

Suggested response sections:

- booking summary
- client details
- patient details
- quote details
- payment history
- payment summary
- invoice summary
- staff assignment history
- swap history
- termination requests for this booking
- statement metadata

### 2. Booking-scoped termination history endpoint
The current pending-termination route is global, not booking-specific.

Suggested new route:

- `GET /api/bookings/:booking_id/termination-requests`

This should return all termination requests for the selected booking, not just pending ones.

### 3. Booking invoice breakdown endpoint
`getBookingInvoiceProgress` is close, but the page needs a richer breakdown:

- total paid
- total invoiced by daily cron
- remaining amount to invoice
- remaining days or overdue days
- whether the booking should auto-complete when fully invoiced
- latest invoice date
- latest payment date

Suggested new route:

- `GET /api/bookings/:booking_id/invoice-breakdown`

### 4. Auto-complete toggle on bookings
Requirement 9 needs a stored flag on the booking record.

Suggested database change:

- add `auto_complete_when_paid boolean default false` to `bookings`

Suggested update route:

- `PATCH /api/bookings/:booking_id/settings`

This route can update the auto-complete flag and any future admin-only booking settings.

### 5. Staff allocation history with invoice allocations
The page needs to show how much daily invoicing has been allocated to each staff member.

Suggested new route:

- `GET /api/bookings/:booking_id/staff-allocation-history`

This should pull from booking staff assignments and any related daily invoicing or salary transactions so the page can show:

- staff member name
- assignment dates
- daily rate
- amount allocated through invoicing
- amount already paid to staff
- active/completed status

### 6. A statement range helper for preset ranges
The current statement endpoints accept a custom date range, which is enough, but the admin page should have preset range helpers.

This can be done on the frontend only, but if you want a backend helper later, add:

- `GET /api/statement/preset/:client_id?range=weekly|monthly|all`

That said, this is optional because the existing download route already accepts custom dates.

## Recommended Data Source Map

### Booking summary
Source of truth:

- `GET /api/bookings/:booking_id`

Use this for:

- booking ID
- status
- service type
- service model
- start date
- scheduled end time
- actual end time
- current assigned staff
- client identity
- patient identity

### Payment history
Primary source:

- `GET /api/quotes/:quote_id/payments`

Secondary summary source:

- `GET /api/quotes/:quote_id/payment-progress`

Use this for:

- payment line items
- payment method
- verification status
- payment dates
- total paid
- remaining amount

### Invoice progress and overdue status
Primary source:

- `GET /api/bookings/:booking_id/invoice-progress`

The backend should eventually expand this to return:

- `total_paid`
- `total_invoiced`
- `balance_due`
- `days_remaining`
- `overdue_days`
- `auto_complete_when_paid`

### Client details
Current source:

- `GET /api/bookings/:booking_id`
- `GET /api/client/:client_id`
- `GET /api/client/payment-history/:client_id`

Use these for:

- client name
- mobile number
- address
- wallet balance
- payment history
- overdue payments

### Staff history
Current source:

- `GET /api/assignments/:booking_id/assignments`
- `GET /api/bookings/:booking_id/swap-history`

Use these for:

- current staff assignment
- previous staff assignments
- swap records
- assignment dates
- staff rates

### Termination requests
Current source:

- `GET /api/bookings/terminations/pending`

Needed addition:

- booking-scoped termination history route

### Statements
Current source:

- `POST /api/statement/download/:client_id`
- `GET /api/statement/:client_id`

Use these for:

- custom date ranges
- weekly preset
- monthly preset
- all-time preset

## Backend Work Order

### Phase 1. Build the booking detail data contract
1. Add the aggregate booking detail endpoint.
2. Include all the data the page needs in one response.
3. Keep the existing endpoints working so the new endpoint can be adopted gradually.

### Phase 2. Add missing booking-specific history routes
1. Add a booking-scoped termination history endpoint.
2. Add a richer invoice breakdown endpoint if `invoice-progress` is not enough.
3. Add staff allocation history if the current assignment route does not expose amounts clearly.

### Phase 3. Deferred for now
1. Skip the auto-complete booking flag and cron changes for now.
2. Keep the existing invoicing behavior unchanged until the frontend flow is ready.

### Phase 4. Reconcile termination and completion behavior on the frontend
1. Graceful end: when the admin presses the complete booking button, the booking should be marked as `COMPLETED`.
2. On graceful completion, the current staff member should be marked as `AVAILABLE`.
3. If the booking ends early and there is remaining balance after invoicing, the admin should choose one of two paths in the frontend:
   - deposit the remaining balance into `client_profiles.wallet_balance`
   - leave a note and do not refund the remaining balance
4. Terminated end: when the admin presses the terminate button, the booking should be marked as `TERMINATED`.
5. Terminated flow should use the same settlement choices as graceful completion for any remaining balance.
6. Make sure the UI captures a settlement note and the refund decision so the action is auditable.
7. Suggested extra guardrail: store a clear completion/termination reason plus the handled-by admin identity, so later statement and wallet reviews stay traceable.

### Phase 5. Statement generation support
1. Reuse the existing statement download route.
2. Add frontend presets for weekly, monthly, and all.
3. Make sure custom date ranges still work.

## Frontend Work Order

### Phase 1. Create the new admin booking detail page
1. Add a route for the detail page.
2. Open it from the bookings list.
3. Fetch the booking summary and related data.

### Phase 2. Build the page sections
1. Booking summary card.
2. Client details panel.
3. Payment history timeline.
4. Invoice progress and remaining/overdue calculation.
5. Staff history and allocated amounts.
6. Swap staff panel.
7. Termination actions.
8. Client termination request history.
9. Statement generator panel.

### Phase 3. Add admin actions
1. Swap staff member.
2. Request or force termination.
3. Complete booking and settle remaining balance.
4. Terminate booking and settle remaining balance.
5. Download or generate statements.

### Phase 4. Add presets for statement ranges
1. Weekly.
2. Monthly.
3. All time.
4. Custom start/end dates.

## Suggested UI Sections For The Page

1. Top summary strip
   - booking ID
   - status
   - service model
   - start date
   - scheduled end
   - client name
   - current staff

2. Financial overview
   - total paid
   - total invoiced
   - remaining balance
   - days remaining or overdue days
   - auto-complete toggle

3. Tabs or side-by-side panels
   - Payments
   - Staff history
   - Termination requests
   - Statements

4. Action bar
   - swap staff
   - terminate booking
   - generate statement

## Key Backend Behavior Notes

1. Daily invoicing currently runs in `backend/cron/dailyInvoicing.js` and creates `SERVICE_INVOICE` transactions.
2. Phase 3 is deferred, so the current backend invoicing behavior should stay unchanged for now.
3. The booking page should use invoice totals from the backend, not calculate them purely in the browser.
4. Staff swap history already exists, so the UI should use it instead of inventing a new history source.
5. Statement generation already supports custom date ranges through the existing backend controller, so the frontend only needs to package the selected dates correctly.
6. The frontend completion and termination actions should still preserve a refund note or wallet-credit decision for the remaining balance, even if the backend settlement logic is introduced later.

## Execution Checklist

- [ ] Add or confirm the booking aggregate endpoint.
- [ ] Add booking-scoped termination history.
- [ ] Add or expand invoice breakdown with remaining and overdue values.
- [ ] Defer the auto-complete booking setting and daily invoicing changes.
- [ ] Reuse existing payment, assignment, swap, and statement routes.
- [ ] Build the admin booking detail page UI.
- [ ] Add frontend controls for complete booking and terminate booking.
- [ ] Wire in statement presets and custom date ranges.
- [ ] Add frontend handling for wallet deposit or no-refund notes when a booking ends early.
- [ ] Test with one active booking, one overdue booking, and one terminated booking.

## Files To Watch Closely

- `backend/controllers/bookingController.js`
- `backend/controllers/paymentTrackingController.js`
- `backend/controllers/staffAssignmentController.js`
- `backend/controllers/statementController.js`
- `backend/cron/dailyInvoicing.js`
- `backend/routes/bookingRoutes.js`
- `backend/routes/staffAssignmentRoutes.js`
- `backend/routes/statementRoutes.js`
- `backend/routes/paymentRoutes.js`
- `backend/routes/clientRoutes.js`
- `client/src/modules/admin/bookings/Bookings.jsx`
- `client/src/modules/admin/statements/statements.jsx`
- `client/src/api/api.js`
