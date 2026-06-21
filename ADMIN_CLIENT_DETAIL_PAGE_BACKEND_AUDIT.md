# Admin Client Details Page Backend Audit

## Short Verdict

The backend already covers most of the read-only data needed for an admin client details page:

- client profile data
- payment history
- booking history
- quotation history
- staff assignment history
- review history
- patient list
- statement generation

The two main gaps are:

- no admin route to deactivate/reactivate a client profile cleanly
- no single consolidated admin client-details endpoint, so the page must assemble data from many requests unless we add one

There is also one implementation issue to fix in the existing statement flow: `getClientStatement` reads `start_date` and `end_date` from `req.body` even though the route is a `GET` request.

## Schema Check From `backend/migrate.js`

The migration already defines the tables and fields this page needs:

- `users` with `is_active`
- `client_profiles` with `full_name`, `client_type`, `wallet_balance`, `primary_address`, `gender`, `gps_coordinates`
- `bookings`
- `quotations`
- `payment_tracking`
- `booking_payment_tracking`
- `booking_staff_assignments`
- `patient_profiles`
- `staff_reviews`
- `transactions`
- `service_requests`

Important note: there is no `is_active` column on `client_profiles`. Client activation/deactivation must currently target `users.is_active`, since login already blocks inactive users in `authController.login`.

## Existing Routes That Already Help

### Client profile and client history

Defined in `backend/routes/clientRoutes.js` and implemented in `backend/controllers/clientController.js`:

- `GET /profile/user/:user_id` - client profile joined with user email/mobile
- `GET /:client_id` - client profile by client ID
- `GET /payment-history/:client_id` - transaction-ledger payment history with summary and pagination
- `GET /service-history/:client_id` - timeline of service requests, quotes, and payment slips
- `GET /active-bookings/:client_id` - active bookings for a client
- `GET /all-bookings/:client_id` - all bookings for a client
- `GET /` - all clients for `SUPER_ADMIN`
- `PATCH /update-me` - self-service client profile update
- `DELETE /delete-me` - self-service hard delete of the current user

### Bookings and staff allocation

Defined in `backend/routes/bookingRoutes.js` and implemented in `backend/controllers/bookingController.js`:

- `GET /client/:client_id` - client bookings with current staff info
- `GET /:booking_id` - booking detail
- `GET /:booking_id/admin-detail` - consolidated booking admin view with payments, assignments, swaps, terminations, and invoice breakdown
- `GET /:booking_id/staff-allocation-history` - staff assignment/allocation history for a booking
- `GET /:booking_id/assignments` in `backend/routes/staffAssignmentRoutes.js` - active and historical assignment list for a booking

### Quotations

Defined in `backend/routes/quoteRoutes.js` and implemented in `backend/controllers/quoteController.js`:

- `GET /client/:client_id` - all quotes for a client
- `GET /request/:requestId/list` - all quotes for a service request
- `GET /:quote_id/details` - quote detail with line items

### Payments and statements

Defined in `backend/routes/paymentRoutes.js`, `backend/routes/statementRoutes.js`, and related controllers:

- `POST /statements/:client_id/pay` - manual client payment recording
- `GET /:client_id` in `backend/routes/statementRoutes.js` - statement summary and ledger data
- `POST /download/:client_id` in `backend/routes/statementRoutes.js` - downloadable statement PDF
- `POST /:quote_id/record-payment` - quotation payment recording
- `GET /:quote_id/payments` - quotation payment history
- `GET /:booking_id/payments` - booking payment history

### Patients

Defined in `backend/routes/patientRoutes.js` and implemented in `backend/controllers/patientController.js`:

- `GET /client/:client_id` - all patients under a client
- `GET /:patient_id` - single patient profile

### Reviews

Defined in `backend/routes/staffReviewRoutes.js` and implemented in `backend/controllers/staffReviewController.js`:

- `GET /client/:client_id` - all reviews written by a client

## Gaps To Add

### 1. Admin client deactivate/reactivate route

Implemented.

Current endpoints:

- `PATCH /api/clients/:client_id/deactivate`
- `PATCH /api/clients/:client_id/reactivate`

Implementation updates `users.is_active` for the client’s linked user account and returns the updated state.

### 2. Dedicated consolidated admin client detail endpoint

Implemented.

The page can still be built from many existing routes, but the admin UI now has a single endpoint for the full client detail payload.

Current endpoint:

- `GET /api/admin/clients/:client_id/detail`

Response payload includes:

- client profile + user info
- payment summary
- booking summary
- quotation summary
- latest/active booking staff details
- reviews summary
- patient list
- statement summary metadata

### 3. Statement route parameter fix

Status: implemented — now `GET /:client_id` reads `start_date` and `end_date` from query parameters.

Notes:
- If no dates are supplied, the endpoint defaults to a full-range query (from epoch to now).
- The downloadable PDF endpoint (`POST /download/:client_id`) still accepts dates in the request body.

### 4. Better booking history shape for the admin page

The existing booking history routes are useful, but they are split across multiple controllers:

- `clientController.getAllBookingsForClient` returns all bookings but does not include staff, quote, payment, or assignment detail
- `bookingController.getClientBookings` includes current staff info but uses an inner join on `staff_profiles`, so bookings without an assigned staff member can be omitted

Recommended addition: implemented.

- `GET /api/client/:client_id/bookings` (admin-only)

This route returns booking history with left joins and includes:

- booking core fields
- current assigned staff
- previous staff assignments (JSON array)
- quote reference
- payment totals (invoiced/paid/balance)
- booking status

## Suggested Build Order

1. Add admin client activate/deactivate endpoints first, because the page needs a safe way to manage account status.
2. Add a consolidated admin client detail endpoint so the dashboard can load in one request.
3. Keep the existing routes as supporting endpoints for drill-down views and tabs.
4. Fix the statement route so the statement generator accepts parameters in a browser-safe way.
5. Add a richer booking-history endpoint if the page needs a flat list of bookings with staff and payment context.
6. Wire the frontend page to the consolidated endpoint first, then fall back to the supporting routes for drill-down tabs.
7. Add tests for the new admin endpoints and for the statement parameter handling.

## Practical Page Plan

1. Load the client profile and status.
2. Load payment history and statement summary.
3. Load booking history and expand each booking into assignment history if needed.
4. Load quotation history.
5. Load current and previous staff assignments.
6. Load review history.
7. Load patient list.
8. Add statement download/generation actions.
9. Add deactivate/reactivate controls.

## Final Assessment

The backend is sufficient to start building the page, but it is not yet complete for a polished admin experience. The missing pieces are the admin activation controls and a consolidated client-detail API that reduces the number of frontend calls.