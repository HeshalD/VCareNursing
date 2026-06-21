# Client Payment Recording Feature — Implementation Plan

## Overview

This feature introduces an **independent, admin-side payment recording system** that lets admins/internal staff capture a client payment and immediately allocate it across one or more destinations — existing bookings, a new booking, or the client's wallet — in a **single atomic database transaction**.

This is distinct from the existing payment flows (quote-based payments, booking-specific payments) which are tied to a specific document first.

---

## How the New Flow Differs from Existing Payments

| Aspect | Existing System | New System |
|---|---|---|
| Entry point | Tied to a quote or booking first | Tied to the client profile first |
| Allocation | One payment → one destination | One payment → split across multiple destinations |
| Atomicity | Single insert | Full DB transaction across multiple tables |
| New booking creation | Separate step | Inline, part of the same atomic action |
| Wallet credit | Not supported | Supported as an allocation type |

---

## Step 1 — Database Changes

### 1a. New table: `client_payment_records`

This is the master record for every payment captured under this system.

Add to `migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS client_payment_records (
  record_id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id           UUID NOT NULL REFERENCES client_profiles(client_profile_id) ON DELETE RESTRICT,
  total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount > 0),
  payment_method      VARCHAR(50) NOT NULL,
  bank_account_id     UUID REFERENCES bank_accounts(account_id),
  cheque_number       VARCHAR(50),
  cheque_date         DATE,
  reference_number    VARCHAR(100),
  slip_url            TEXT,
  notes               TEXT,
  recorded_by         UUID NOT NULL REFERENCES users(user_id),
  recorded_by_name    VARCHAR(255) NOT NULL,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1b. New table: `client_payment_allocations`

Tracks how the total was split. One row per allocation destination.

```sql
CREATE TABLE IF NOT EXISTS client_payment_allocations (
  allocation_id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id           UUID NOT NULL REFERENCES client_payment_records(record_id) ON DELETE CASCADE,
  allocation_type     VARCHAR(20) NOT NULL CHECK (allocation_type IN ('BOOKING', 'NEW_BOOKING', 'WALLET')),
  amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  booking_id          UUID REFERENCES bookings(booking_id),
  transaction_id      UUID REFERENCES transactions(transaction_id),
  booking_payment_id  UUID REFERENCES booking_payment_tracking(booking_payment_id),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

> `booking_id` is populated for BOOKING and NEW_BOOKING types.  
> `transaction_id` links to the ledger entry for every allocation.  
> `booking_payment_id` links to `booking_payment_tracking` for booking-type allocations.

### 1c. New enum value: `WALLET_TOPUP`

The existing `transaction_category` enum does not have a value for crediting the client wallet from a payment. Add this in `migrate.js`:

```sql
DO $$ BEGIN
  ALTER TYPE transaction_category ADD VALUE IF NOT EXISTS 'WALLET_TOPUP';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
```

### 1d. Indexes to add

```sql
CREATE INDEX IF NOT EXISTS idx_client_payment_records_client_id
  ON client_payment_records(client_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_records_created_at
  ON client_payment_records(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_payment_allocations_record_id
  ON client_payment_allocations(record_id);

CREATE INDEX IF NOT EXISTS idx_client_payment_allocations_booking_id
  ON client_payment_allocations(booking_id);
```

---

## Step 2 — Backend: New Route File

Create `backend/routes/clientPaymentRoutes.js`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| `POST` | `/api/client-payments/:client_id/record` | SUPER_ADMIN, ACCOUNTS, COORDINATOR | Record payment with allocations (atomic) |
| `GET` | `/api/client-payments/:client_id` | SUPER_ADMIN, ACCOUNTS, COORDINATOR | List all payment records for a client |
| `GET` | `/api/client-payments/record/:record_id` | SUPER_ADMIN, ACCOUNTS, COORDINATOR | Get a single payment record with its allocations |

Mount in `server.js`:
```js
app.use('/api/client-payments', require('./routes/clientPaymentRoutes'));
```

---

## Step 3 — Backend: Controller Logic

Create `backend/controllers/clientPaymentController.js`.

### 3a. `recordClientPayment` — The Atomic Handler

#### Request body shape

```json
{
  "total_amount": 50000,
  "payment_method": "BANK_TRANSFER",
  "bank_account_id": "uuid",
  "cheque_number": null,
  "cheque_date": null,
  "reference_number": "REF-001",
  "slip_url": "https://...",
  "notes": "Monthly payment",
  "allocations": [
    {
      "type": "BOOKING",
      "booking_id": "uuid-of-existing-booking",
      "amount": 30000
    },
    {
      "type": "NEW_BOOKING",
      "amount": 15000,
      "new_booking": {
        "patient_id": "uuid",
        "service_type": "Nursing",
        "service_model": "SHIFT_BASED",
        "start_date": "2026-06-10",
        "daily_rate": 2500,
        "amount_quotated": 15000
      }
    },
    {
      "type": "WALLET",
      "amount": 5000
    }
  ]
}
```

#### Validation rules (before touching the DB)

1. `total_amount` must equal the sum of all allocation `amount` values.
2. At least one allocation must be present.
3. For `BOOKING` type: `booking_id` is required. The booking must belong to the given client and have status `ACTIVE` or `OVERDUE`.
4. For `NEW_BOOKING` type: `new_booking` object is required and must include `patient_id`, `service_type`, `start_date`, and `daily_rate`. The `patient_id` must belong to this client.
5. For `WALLET` type: no extra fields required.
6. `payment_method` must be one of: `BANK_TRANSFER`, `CASH_DEPOSIT`, `CASH`, `CHEQUE`.
7. If `payment_method` is `BANK_TRANSFER` or `CASH_DEPOSIT`, `bank_account_id` is required.
8. If `payment_method` is `CHEQUE`, `cheque_number` and `cheque_date` are required.

#### Atomic transaction steps

Wrap everything in `BEGIN` / `COMMIT` (use a single pg client from the pool):

```
BEGIN

1. INSERT INTO client_payment_records → get record_id

2. For each allocation:

   — If type === 'BOOKING':
       a. INSERT INTO booking_payment_tracking (booking_id, client_id, amount_received, payment_method, ...)
       b. UPDATE bookings SET amount_paid = amount_paid + amount, last_payment_date = NOW() WHERE booking_id = ?
       c. INSERT INTO transactions (client_id, booking_id, category='BOOKING_PAYMENT', transaction_type='CREDIT', amount, ...)
       d. INSERT INTO client_payment_allocations (record_id, type='BOOKING', amount, booking_id, transaction_id, booking_payment_id)

   — If type === 'NEW_BOOKING':
       a. INSERT INTO bookings (client_id, patient_id, service_type, start_date, daily_rate, amount_quotated, amount_paid=amount, status='ACTIVE', ...)
       b. INSERT INTO booking_payment_tracking (booking_id=new_booking_id, client_id, amount_received, ...)
       c. INSERT INTO transactions (client_id, booking_id=new_booking_id, category='BOOKING_PAYMENT', transaction_type='CREDIT', amount, ...)
       d. INSERT INTO client_payment_allocations (record_id, type='NEW_BOOKING', amount, booking_id=new_booking_id, transaction_id, booking_payment_id)

   — If type === 'WALLET':
       a. UPDATE client_profiles SET wallet_balance = wallet_balance + amount WHERE client_profile_id = ?
       b. INSERT INTO transactions (client_id, category='WALLET_TOPUP', transaction_type='CREDIT', amount, ...)
       c. INSERT INTO client_payment_allocations (record_id, type='WALLET', amount, transaction_id)

3. INSERT INTO activity_log (actor_user_id, actor_name, actor_role, action_type='CLIENT_PAYMENT_RECORDED',
     entity_type='client_payment_record', entity_id=record_id,
     details={ client_id, total_amount, payment_method, allocation_count, allocations_summary })

COMMIT
```

On any failure: `ROLLBACK` — nothing is persisted.

#### Response shape

```json
{
  "success": true,
  "record": {
    "record_id": "uuid",
    "client_id": "uuid",
    "total_amount": 50000,
    "payment_method": "BANK_TRANSFER",
    "allocations": [
      { "allocation_id": "uuid", "type": "BOOKING", "amount": 30000, "booking_id": "uuid" },
      { "allocation_id": "uuid", "type": "NEW_BOOKING", "amount": 15000, "booking_id": "new-uuid" },
      { "allocation_id": "uuid", "type": "WALLET", "amount": 5000 }
    ],
    "created_at": "2026-06-09T..."
  }
}
```

### 3b. `getClientPaymentRecords`

Simple `SELECT` from `client_payment_records` + join `client_payment_allocations` filtered by `client_id`, ordered by `created_at DESC`.

### 3c. `getPaymentRecordDetail`

Fetch one record by `record_id` with all its allocations and linked booking info.

---

## Step 4 — File Upload (Optional)

If you want to accept a payment slip file (like the existing payment endpoints), add `multer` middleware to the `POST` route (same pattern as `bookingRoutes.js`). The file would be uploaded to Cloudinary and its URL stored in `client_payment_records.slip_url`.

This is optional for the first pass — the client can supply a `slip_url` directly as a string.

---

## Step 5 — Frontend

### 5a. New modal/page: "Record Client Payment"

Accessible from the client profile page (admin view).

**Fields:**
- Total Amount (number input)
- Payment Method (dropdown: BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE)
- Bank Account (dropdown, shown if BANK_TRANSFER or CASH_DEPOSIT)
- Cheque Number + Date (shown if CHEQUE)
- Reference Number (optional text)
- Payment Slip (file upload or URL)
- Notes (textarea)

**Allocation builder:**
- A list of allocation rows
- Each row has: Type (BOOKING / NEW_BOOKING / WALLET), Amount
- For BOOKING type: booking selector (dropdown of this client's active/overdue bookings, showing outstanding balance)
- For NEW_BOOKING type: sub-form with patient selector, service type, start date, daily rate
- "Add allocation" button to add rows
- Running total showing: `Allocated so far / Total amount`
- Submit is disabled until allocated total equals total amount

### 5b. New API call

```js
POST /api/client-payments/:client_id/record
```

Use the response to refresh the client's booking list, wallet balance, and payment history on screen.

---

## Step 6 — Edge Cases to Handle

| Case | Handling |
|---|---|
| Allocation total > total_amount | Reject with 400 before opening transaction |
| Allocation total < total_amount | Reject with 400 — no partial allocations allowed |
| Booking does not belong to client | Reject with 403 |
| Booking status is COMPLETED or CANCELLED | Reject with 400 |
| Patient does not belong to client (NEW_BOOKING) | Reject with 403 |
| `bank_account_id` not found or inactive | Reject with 400 |
| DB error mid-transaction | Rollback, return 500 |

---

## Summary of Files to Create / Modify

| Action | File |
|---|---|
| **Modify** | `backend/migrate.js` — add 2 new tables + 1 enum value + 4 indexes |
| **Create** | `backend/controllers/clientPaymentController.js` |
| **Create** | `backend/routes/clientPaymentRoutes.js` |
| **Modify** | `backend/server.js` — mount new route |
| **Create** | Frontend modal/form component for the admin client profile page |
| **Modify** | Frontend client profile page — add "Record Payment" button + wallet balance refresh |
