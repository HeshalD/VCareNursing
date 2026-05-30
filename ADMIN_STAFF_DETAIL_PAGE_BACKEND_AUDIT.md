# Admin Staff Detail Page - Backend Route Audit

Date: 2026-05-28
Scope: backend route/controller audit for admin staff detail page requirements

## API base paths currently mounted

- `/api/staff` -> `backend/routes/staffRoutes.js`
- `/api/bookings` -> `backend/routes/bookingRoutes.js`
- `/api/staff-reviews` -> `backend/routes/staffReviewRoutes.js`
- `/api/staff-wallet` -> `backend/routes/staffWalletRoutes.js`
- `/api/finances` -> `backend/routes/financesRoutes.js`
- `/api/bank-accounts` -> `backend/routes/bankAccountRoutes.js`
- `/api/assignments` -> `backend/routes/staffAssignmentRoutes.js`

## Requirement-by-requirement audit

## 1) Staff profile details

### Already available

- `GET /api/staff/:staff_id`
  - Source: `staffController.getStaffByID`
  - Returns profile details + linked user info (`email`, `mobile_number`, `role`, `is_active`, etc.)
- `GET /api/staff/user/:user_id`
  - Source: `staffController.getStaffByUserID`
- `PUT /api/staff/:staff_profile_id`
  - Source: `staffController.updateStaffProfile`

### Gap

- No admin-focused "single payload" endpoint that returns profile + earnings + current booking + previous bookings + reviews + payout summary together.

### Recommended new route

- `GET /api/staff/:staff_profile_id/admin-detail`
  - Access: `SUPER_ADMIN`, `COORDINATOR`, `ACCOUNTS`
  - Purpose: one endpoint for the admin staff detail page.

---

## 2) Amount earned

### Already available

- `GET /api/staff/:staff_id` returns `staff_profiles.current_earnings`.
- Daily accrual is handled by cron (`backend/cron/dailyInvoicing.js`):
  - increments `staff_profiles.current_earnings`
  - inserts transaction entries with category `STAFF_SALARY` and `transaction_type='CREDIT'`

### Gap

- No dedicated endpoint for earnings ledger/summary per staff member.
- No endpoint for "earned vs paid out vs outstanding".

### Recommended new routes

- `GET /api/staff/:staff_profile_id/earnings-summary`
  - Return: `current_earnings`, `total_earned`, `total_paid_out`, `outstanding_payable`.
- `GET /api/staff/:staff_profile_id/earnings-transactions`
  - Return paginated transactions for categories `STAFF_SALARY` and `STAFF_SALARY_PAID` (after enum/table update below).

---

## 3) Current booking details

### Already available

- `GET /api/bookings/staff/:staff_id`
  - Source: `bookingController.getStaffBookings`
  - Returns bookings assigned to `bookings.assigned_staff_id` with client/patient/quote/termination data.
- `GET /api/staff/:staff_profile_id/assignments`
  - Source: `staffController.getStaffAssignments`

### Gaps

- Current implementation uses `bookings.assigned_staff_id`; your system also uses `booking_staff_assignments` and swap history, so this may miss some assignment history edge cases.
- No dedicated endpoint for only active/current assignment details with latest status.

### Recommended new route

- `GET /api/staff/:staff_profile_id/current-booking`
  - Query from `booking_staff_assignments` where `status='ACTIVE'` joined with booking/client/patient.

---

## 4) Previous booking details

### Already available

- `GET /api/bookings/staff/:staff_id` (client can filter by booking status in UI).
- `GET /api/staff/:staff_profile_id/assignments` supports optional `status` filtering.

### Gap

- No explicit admin endpoint for paginated booking history with assignment-level details (start/end dates, rates, allocated amount, salary earned/paid per booking).

### Recommended new route

- `GET /api/staff/:staff_profile_id/booking-history?page=&limit=&status=`
  - Return assignment-centric previous bookings from `booking_staff_assignments` + booking summary + client/patient.

---

## 5) Reviews and ratings

### Already available

- `GET /api/staff-reviews/staff/:staff_id`
  - Source: `staffReviewController.getReviewsByStaffId`
  - Includes review list, distribution, and staff rating metadata.
- `GET /api/staff-reviews/statistics`
  - Global review statistics.
- `GET /api/staff/:staff_id` also returns `average_rating` and `total_reviews`.

### Gap

- No direct gap for read operations. Existing endpoints are sufficient for admin page display.

---

## 6) Record company-bank to staff-personal-bank salary payments

Requirement details requested:
- record new payout
- deduct amount from staff profile
- add transaction to `transactions`
- add row to `staff_payments_tracking`
- categorize as `STAFF_SALARY_PAID`

### What exists today

- Company bank account management exists:
  - `GET /api/bank-accounts`
  - `GET /api/bank-accounts/:account_id`
  - `POST /api/bank-accounts`
  - `PUT /api/bank-accounts/:account_id`
  - `DELETE /api/bank-accounts/:account_id`
- Generic transaction table exists (`transactions`).
- Staff earning accrual exists (`STAFF_SALARY` credit entries).

### Gaps blocking this requirement

- No `staff_payments_tracking` table in migration.
- `transaction_category` enum currently does not include `STAFF_SALARY_PAID`.
- No staff personal bank account table/fields.
- No payout API route that performs atomic payout workflow:
  - validate outstanding amount
  - deduct from `staff_profiles.current_earnings`
  - insert into `transactions`
  - insert into `staff_payments_tracking`

### Recommended new schema

- Add enum value: `STAFF_SALARY_PAID` to `transaction_category`.
- Add table: `staff_payments_tracking` (example columns)
  - `staff_payment_id` UUID PK
  - `staff_profile_id` UUID FK
  - `company_bank_account_id` UUID FK -> `bank_accounts`
  - `staff_bank_account_id` UUID FK -> `staff_bank_accounts`
  - `amount_paid` DECIMAL
  - `payment_method` VARCHAR / enum
  - `reference_number`, `notes`, `paid_at`, `paid_by`
  - `status` (`COMPLETED`/`REVERSED`)
- Add table: `staff_bank_accounts`
  - per-staff personal bank account records

### Recommended new routes

- `POST /api/staff/:staff_profile_id/payouts`
  - Access: `SUPER_ADMIN`, `ACCOUNTS`
  - Transactional flow:
    1. lock staff record
    2. validate `current_earnings >= amount_paid`
    3. decrement `staff_profiles.current_earnings`
    4. insert `transactions` row with:
       - `category='STAFF_SALARY_PAID'`
       - `transaction_type='DEBIT'`
       - `staff_profile_id`, `bank_account_id` (company bank), refs
    5. insert `staff_payments_tracking` row
    6. commit
- `GET /api/staff/:staff_profile_id/payouts`
  - paginated payout history for staff detail page
- `GET /api/staff/:staff_profile_id/payouts/summary`
  - totals (paid this month, all-time paid, outstanding)

Optional if you want reusable staff bank account management:
- `GET /api/staff/:staff_profile_id/bank-accounts`
- `POST /api/staff/:staff_profile_id/bank-accounts`
- `PUT /api/staff/:staff_profile_id/bank-accounts/:staff_bank_account_id`
- `DELETE /api/staff/:staff_profile_id/bank-accounts/:staff_bank_account_id`

---

## 7) Deactivate account

### Already available

- `PUT /api/staff/:staff_profile_id/status` (updates `staff_profiles.current_status`).
- `PUT /api/staff/:staff_profile_id/unavailable`.
- `DELETE /api/staff/:staff_profile_id` (hard delete of staff profile + linked user).

### Gap

- No soft account deactivation/reactivation route that toggles `users.is_active` for staff (equivalent to client deactivate flow).
- `current_status` is operational availability, not authentication/account lock.

### Recommended new routes

- `PATCH /api/staff/:staff_profile_id/deactivate`
  - set linked `users.is_active=false`
  - optionally set `staff_profiles.current_status='UNAVAILABLE'`
- `PATCH /api/staff/:staff_profile_id/reactivate`
  - set linked `users.is_active=true`
  - optionally restore `current_status='AVAILABLE'`

---

## Existing route list most relevant to this page

### Staff routes

- `GET /api/staff/:staff_id`
- `GET /api/staff/user/:user_id`
- `GET /api/staff/:staff_profile_id/assignments`
- `PUT /api/staff/:staff_profile_id/status`
- `PUT /api/staff/:staff_profile_id/unavailable`
- `PUT /api/staff/:staff_profile_id`
- `DELETE /api/staff/:staff_profile_id`

### Booking routes

- `GET /api/bookings/staff/:staff_id`
- `GET /api/bookings/:booking_id`
- `GET /api/bookings/:booking_id/admin-detail`
- `GET /api/bookings/:booking_id/staff-allocation-history`

### Review routes

- `GET /api/staff-reviews/staff/:staff_id`
- `GET /api/staff-reviews/statistics`

### Wallet/finance routes (related but not full salary payout)

- `GET /api/staff-wallet/advances`
- `POST /api/staff-wallet/approve-advance/:advanceId`
- `POST /api/staff-wallet/reject-advance/:advanceId`
- `GET /api/finances/transactions`

### Company bank account routes

- `GET /api/bank-accounts`
- `GET /api/bank-accounts/:account_id`
- `POST /api/bank-accounts`
- `PUT /api/bank-accounts/:account_id`
- `DELETE /api/bank-accounts/:account_id`
- `GET /api/bank-accounts/:account_id/transactions`

## Minimum backend additions to fully satisfy your requirements

1. Add staff admin aggregate endpoint (`/api/staff/:id/admin-detail`) for page load.
2. Add staff payout workflow endpoint (`POST /api/staff/:id/payouts`) with DB transaction.
3. Add payout history/summary endpoints.
4. Add schema for `staff_payments_tracking` and `staff_bank_accounts`.
5. Add `STAFF_SALARY_PAID` enum value in `transaction_category`.
6. Add soft deactivate/reactivate staff account routes using `users.is_active`.
