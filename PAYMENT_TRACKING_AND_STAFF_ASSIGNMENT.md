# Payment Tracking & Staff Assignment System Redesign

## Current System Flow

### 1. Service Request → Quotation → Payment → Booking

The current flow operates as follows:

```
Service Request Created
    ↓
Admin Creates Quotation (calculatees: registration_fee + daily_rate × qty_days + transport_fee)
    ↓
Quotation Sent to Client via WhatsApp (PDF)
    ↓
Service Request Status → PENDING
    ↓
Client Uploads Payment Slip (Full Amount Expected)
    ↓
Admin Converts to Booking
    ├─ Staff assigned (auto or preferred)
    ├─ Payment recorded as transaction
    └─ Booking status → ACTIVE
    ↓
Daily Invoicing Cron (23:59 daily)
    ├─ Generates SERVICE_INVOICE transactions (DEBIT)
    └─ Creates one transaction per ACTIVE booking per day
```

---

## Current Database Schema

### Key Tables

#### `quotations`
```sql
quote_id, estimate_number, request_id, 
registration_fee, daily_rate, qty_days, 
transport_fee, sub_total, total_amount, 
status, created_at
```
**Current Status Values:** `SENT`, `ACCEPTED`, `REJECTED`

#### `payment_slips`
```sql
slip_id, quote_id, slip_url, verified_at, created_at
```
**Current Issue:** Only stores one slip URL per quote; doesn't track partial payments.

#### `transactions`
```sql
transaction_id, client_id, staff_profile_id, 
booking_id, quote_id, category, amount, 
payment_method, receipt_url, reference_number, 
verified_by, status, notes, created_at, 
transaction_type
```
**Categories:** `CLIENT_PAYMENT`, `WALLET_REFUND`, `STAFF_SALARY`, `AGENCY_FEE`, `SERVICE_INVOICE`
**Types:** `CREDIT`, `DEBIT`

#### `bookings`
```sql
booking_id, client_id, patient_id, 
service_type, service_model, start_date, 
assigned_staff_id, status, service_mode, 
scheduled_end_time, actual_end_time, 
ot_rate, daily_rate, created_at
```
**Current Issue:** `daily_rate` is stored here, but staff billing calculations don't update `staff_profiles.current_earnings`.

#### `staff_profiles`
```sql
staff_profile_id, user_id, full_name, 
current_earnings, advance_threshold_amount, ...
```
**Current Issue:** `current_earnings` is never updated by the daily invoicing cron.

#### `staff_wallet`
```sql
wallet_id, staff_profile_id, balance, updated_at
```
**Note:** This is separate from `current_earnings`.

---

## Current Issues

### 1. **No Partial Payment Tracking**
- System assumes full quotation amount must be paid to convert to booking
- No mechanism to track how much has been paid vs. how much remains
- Multiple payment slips for the same quotation cannot be tracked

### 2. **Immediate Full Staff Assignment**
- Staff is assigned as soon as booking is created
- No intermediate step between payment verification and staff assignment
- Admin cannot see remaining balance before assigning staff

### 3. **Staff Earnings Not Updated**
- Daily invoicing creates `SERVICE_INVOICE` transactions (DEBIT to client)
- But `staff_profiles.current_earnings` is never updated
- Staff salary records don't reflect daily invoicing

### 4. **Disconnected Payment and Staff Assignment**
- Payment verification (payment slip upload) and staff assignment happen in same step
- Admin cannot:
  - See how much has been paid
  - Decide to assign multiple staff for partial payment
  - Track billing at the staff assignment level

### 5. **No Relationship Between Assignment and Daily Invoicing**
- When staff is assigned, there's no link to: *which daily rate*, *for how long*, *starting when*
- Daily invoicing uses `booking.daily_rate` but doesn't know which staff earned it

---

## New System Requirements

### **Three-Step Process:**

#### **Step 1: Create Service Request & Quotation**
(Already exists - no change)

#### **Step 2: Record Payment(s)**
After quotation is sent, admin records each payment the client makes:
- Payment can be partial or full
- Multiple payments can be recorded for one quotation
- System tracks: **Amount Paid vs. Amount Quotated**
- Admin specifies **payment method** and **bank account** (if applicable)

#### **Step 3: Assign Staff (New Form)**
After payment(s) received, admin opens a form to assign staff:

**Form Fields:**

| Field | Source | Editable | Purpose |
|-------|--------|----------|---------|
| `amount_quotated` | Auto-fetch from quotation `total_amount` | No | Show client's total quote |
| `amount_paid` | Calculate from transactions (sum all `CLIENT_PAYMENT` for this quote) | No | Show verified payments |
| `amount_remaining` | `amount_quotated - amount_paid` | No | Show unpaid balance |
| `assigned_staff_id` | User selection | Yes | Select caregiver |
| `staff_daily_rate` | Auto-fetch from selected staff or allow override | Partial | Staff's standard rate (may override) |
| `paid_days_count` | Calculate: `amount_paid / staff_daily_rate` | No | How many days the payment covers |
| `service_start_date` | User selection or auto-default to today | Yes | When does billing start |
| `service_end_date` | Calculate: `service_start_date + paid_days_count` | No | When does paid period end |
| `remaining_balance_for_next_assignment` | `amount_remaining` | No | Display for reference |

---

## Payment Method & Bank Account Tracking

### Payment Method Options

When recording a payment, admin must select **one** of the following methods:

1. **Bank Transfer** - Direct transfer to company bank account
2. **Cash Deposit** - Cash deposited to company bank account (requires account selection)
3. **Cash** - Physical cash payment (no bank account needed)
4. **Cheque** - Check/Cheque payment (optional: link to bank account if deposited later)

### Bank Account Selection (Conditional)

- **If Payment Method = "Bank Transfer"** → Show dropdown to select receiving account
- **If Payment Method = "Cash Deposit"** → Show dropdown to select account where cash was deposited
- **If Payment Method = "Cash"** → No bank account selection needed
- **If Payment Method = "Cheque"** → Optional bank account selection (for when cheque is deposited)

### Payment Recording Form Fields

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `amount_received` | Currency | Yes | Amount paid |
| `payment_method` | Select | Yes | BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE |
| `bank_account_id` | Select | Conditional* | Selected account (if Bank Transfer or Cash Deposit) |
| `cheque_number` | Text | No | Cheque number (if Payment Method = Cheque) |
| `cheque_date` | Date | No | Cheque date (if Payment Method = Cheque) |
| `reference_number` | Text | No | Transaction reference (bank ref, deposit slip #, etc.) |
| `slip_url` | File | No | Receipt/deposit slip image |
| `notes` | Textarea | No | Additional notes |

**Conditional means: Required only if payment_method is "BANK_TRANSFER" or "CASH_DEPOSIT"

---

## Database Changes Required

### 0. **New Table: `bank_accounts`** (CRITICAL)

Store company bank account details for payment tracking:

```sql
CREATE TABLE bank_accounts (
  account_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_nickname VARCHAR(100) NOT NULL, -- e.g., "Main Operations", "Receivables"
  account_number VARCHAR(50) NOT NULL UNIQUE,
  account_holder_name VARCHAR(255) NOT NULL,
  bank_name VARCHAR(100) NOT NULL, -- e.g., "HBL", "Habib Bank"
  branch_name VARCHAR(100),
  branch_code VARCHAR(20),
  
  -- Status & Tracking
  is_active BOOLEAN DEFAULT true,
  currency VARCHAR(5) DEFAULT 'PKR',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(user_id),
  
  -- Optional: For reconciliation
  opening_balance DECIMAL(15, 2),
  current_balance DECIMAL(15, 2),
  last_reconciled_at TIMESTAMP WITH TIME ZONE
);
```

**Example Data:**
```
| account_id | account_nickname | account_number | account_holder_name | bank_name | branch_name |
|------------|------------------|-----------------|---------------------|-----------|-------------|
| uuid-1 | Main Operations | 12345678901234 | VCare Nursing | HBL | Karachi Downtown |
| uuid-2 | Receivables | 98765432109876 | VCare Nursing | ABL | Lahore Mall |
```

### 1. **Update `transactions` Table** (CRITICAL)

Add bank account tracking to transactions:

```sql
-- Add these columns to transactions table:
ALTER TABLE transactions ADD COLUMN (
  bank_account_id UUID REFERENCES bank_accounts(account_id),
  payment_method VARCHAR(50), -- BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE
  cheque_number VARCHAR(50),
  cheque_date DATE,
  reference_number VARCHAR(100) -- Bank ref, deposit slip #, etc.
);
```

### 2. **Update `payment_tracking` Table**

Add payment method and bank details:

```sql
-- Add to payment_tracking table:
ALTER TABLE payment_tracking ADD COLUMN (
  payment_method VARCHAR(50), -- BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE
  bank_account_id UUID REFERENCES bank_accounts(account_id),
  cheque_number VARCHAR(50),
  cheque_date DATE,
  reference_number VARCHAR(100)
);
```

Or if using extended `payment_slips`:

```sql
ALTER TABLE payment_slips ADD COLUMN (
  payment_method VARCHAR(50),
  bank_account_id UUID REFERENCES bank_accounts(account_id),
  cheque_number VARCHAR(50),
  cheque_date DATE,
  reference_number VARCHAR(100)
);
```

### 3. **Update `payment_slips` Table** (If Still Using)

```sql
ALTER TABLE payment_slips ADD COLUMN (
  amount_received DECIMAL(12,2), 
  payment_method VARCHAR(50),
  bank_account_id UUID REFERENCES bank_accounts(account_id),
  cheque_number VARCHAR(50),
  cheque_date DATE,
  reference_number VARCHAR(100),
  verification_status VARCHAR(20) DEFAULT 'PENDING',
  verified_by UUID REFERENCES users(user_id),
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT
);
```

---

### 4. **New Table: `booking_staff_assignments`**

Track staff assignments at a line-item level, allowing multiple staff for one booking.

```sql
CREATE TABLE booking_staff_assignments (
  assignment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  staff_profile_id UUID NOT NULL REFERENCES staff_profiles(staff_profile_id),
  assigned_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  assigned_by UUID REFERENCES users(user_id),
  
  -- Billing Details
  daily_rate DECIMAL(12, 2) NOT NULL,
  service_start_date DATE NOT NULL,
  service_end_date DATE NOT NULL,
  
  -- For tracking which invoices came from this assignment
  quote_id UUID REFERENCES quotations(quote_id),
  amount_allocated DECIMAL(12, 2), -- How much of the quotation was allocated to this staff
  
  -- Status
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, TERMINATED
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:**
- Allows multiple staff to be assigned to different date ranges within one booking
- Links each assignment to the quotation amount paid
- Tracks which assignments have been invoiced

### 5. **Modify `bookings` Table**

Add column to track payment status:

```sql
-- Add to bookings table:
amount_paid DECIMAL(12, 2) DEFAULT 0,
amount_quotated DECIMAL(12, 2),
last_payment_date TIMESTAMP WITH TIME ZONE,
staff_assignment_status VARCHAR(20) DEFAULT 'PENDING' -- PENDING, ASSIGNED, PARTIALLY_ASSIGNED, COMPLETE
```

### 3. **Extend `payment_slips` Table (Optional)**

Add tracking for partial payments:

```sql
-- Add to payment_slips table:
amount_received DECIMAL(12, 2), -- What amount does this slip represent
verification_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED
verified_by UUID REFERENCES users(user_id),
verification_notes TEXT
```

### 6. **New Table: `payment_tracking`**

Create explicit payment tracking instead of relying on transaction analysis:

```sql
CREATE TABLE payment_tracking (
  payment_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES quotations(quote_id),
  client_id UUID NOT NULL REFERENCES client_profiles(client_profile_id),
  amount_received DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50),
  slip_url TEXT,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES users(user_id),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED
  notes TEXT
);
```

**Purpose:**
- Explicit payment tracking (more readable than transaction analysis)
- Can store multiple payments per quotation
- Separates payment verification from transaction recording

---

## Bank Account Management API

### Get All Bank Accounts

```
GET /api/bank-accounts

Response:
{
  status: 'success',
  data: [
    {
      account_id,
      account_nickname,
      account_number,
      account_holder_name,
      bank_name,
      branch_name,
      is_active,
      currency
    }
  ]
}
```

### Create Bank Account

```
POST /api/bank-accounts

Request Body:
{
  account_nickname,
  account_number,
  account_holder_name,
  bank_name,
  branch_name,
  branch_code,
  currency,
  opening_balance (optional)
}

Response:
{
  status: 'success',
  data: { account_id, ... }
}
```

### Update Bank Account

```
PUT /api/bank-accounts/:account_id

Request Body:
{
  account_nickname,
  account_number,
  account_holder_name,
  bank_name,
  branch_name,
  is_active
}
```

### Deactivate Bank Account

```
DELETE /api/bank-accounts/:account_id

Response:
{
  status: 'success',
  message: 'Bank account deactivated'
}
```

---

## Updated Payment API Endpoints

### Record Payment (with Payment Method)

```
POST /api/quotations/:quote_id/record-payment

Request Body:
{
  amount_received,
  payment_method, -- REQUIRED: BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE
  bank_account_id, -- CONDITIONAL: Required if payment_method is BANK_TRANSFER or CASH_DEPOSIT
  cheque_number, -- OPTIONAL: If payment_method is CHEQUE
  cheque_date, -- OPTIONAL: If payment_method is CHEQUE
  reference_number, -- OPTIONAL: Bank reference, deposit slip #, etc.
  slip_url, -- OPTIONAL: Receipt/deposit slip image
  notes -- OPTIONAL: Additional notes
}

Response:
{
  status: 'success',
  data: {
    payment_id,
    quote_id,
    amount_received,
    payment_method,
    bank_account: { account_id, account_nickname, account_number },
    reference_number,
    status: 'PENDING',
    verified_at: null,
    created_at
  },
  remaining_balance: amount_quotated - total_paid
}
```

### Get Payment Details (Enhanced)

```
GET /api/quotations/:quote_id/payments

Response:
{
  status: 'success',
  quote_id,
  total_amount,
  total_paid,
  remaining_amount,
  payments: [
    {
      payment_id,
      amount,
      payment_method, -- BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE
      bank_account: { -- NULL if cash or cheque
        account_id,
        account_nickname,
        account_number,
        bank_name
      },
      cheque_number, -- NULL if not cheque
      reference_number,
      status, -- PENDING, VERIFIED, REJECTED
      payment_date,
      verified_at,
      verified_by
    }
  ]
}
```

### Get Account Transactions

```
GET /api/bank-accounts/:account_id/transactions

Query Parameters:
- start_date (optional)
- end_date (optional)
- status (optional: COMPLETED, PENDING, REJECTED)

Response:
{
  status: 'success',
  account: {
    account_id,
    account_nickname,
    account_number,
    bank_name
  },
  transactions: [
    {
      transaction_id,
      quote_id,
      client_name,
      amount,
      payment_method,
      reference_number,
      status,
      created_at,
      verified_at
    }
  ],
  total_deposited,
  transaction_count,
  period: { start_date, end_date }
}
```

### Account Reconciliation Report

```
GET /api/bank-accounts/:account_id/reconciliation

Response:
{
  status: 'success',
  account: { ... },
  opening_balance,
  total_deposits, -- sum of all VERIFIED payments
  total_withdrawals, -- if applicable
  expected_closing_balance,
  reconciliation_status, -- BALANCED, NEEDS_REVIEW
  last_reconciled_at,
  discrepancies: [
    {
      transaction_id,
      expected_amount,
      actual_amount,
      issue: 'MISSING', 'DUPLICATE', 'AMOUNT_MISMATCH'
    }
  ]
}
```

---

## Staff Assignment & Booking API Endpoints

### 1. **New Endpoint: Get Payment Progress**

```
GET /api/quotations/:quote_id/payment-progress

Response:
{
  quote_id,
  estimate_number,
  total_amount,
  total_paid,
  remaining_amount,
  percent_paid,
  payments: [
    { payment_id, amount, date, status }
  ],
  can_assign_staff: boolean
}
```

### 2. **New Endpoint: Get Assignment Form Data**

```
GET /api/bookings/:booking_id/assignment-form

Response:
{
  booking_id,
  quote_id,
  request_id,
  service_details: { patient_name, service_type, ... },
  payment_info: {
    amount_quotated,
    amount_paid,
    amount_remaining,
    remaining_balance_for_next
  },
  available_staff: [
    { staff_id, name, email, standard_daily_rate, current_status, ... }
  ]
}
```

### 3. **New Endpoint: Assign Staff**

```
POST /api/bookings/:booking_id/assign-staff

Request Body:
{
  assigned_staff_id,
  staff_daily_rate,
  service_start_date,
  service_end_date, // auto-calculated but can be sent for validation
  notes
}

Response:
{
  assignment_id,
  booking_id,
  assigned_staff: { staff_id, name, daily_rate },
  billing_period: { start_date, end_date, days_covered },
  remaining_balance,
  message: "Staff assigned. Remaining balance: Rs.X"
}
```

### 4. **Modify Endpoint: Convert to Booking (Phase 2)**

**New Workflow:**
1. **Phase 2A:** Record payment (new step)
   ```
   POST /api/bookings/record-payment
   Body: { quote_id, amount_received, payment_method, slip_url }
   ```

2. **Phase 2B:** (OLD) Convert to booking - now only converts request to booking record, doesn't assign staff yet
   ```
   POST /api/bookings/convert-to-booking
   Body: { request_id, quote_id }
   Response: { booking_id } - booking created but staff NOT assigned yet
   ```

3. **Phase 2C:** Assign staff (new step)
   ```
   POST /api/bookings/:booking_id/assign-staff
   (See above)
   ```

---

## Daily Invoicing Cron Changes

### Current Logic
```javascript
for (const booking of activeBookings) {
  const { amount, notes } = getBillingCharge(booking); // Uses booking.daily_rate
  
  await createTransaction({
    category: 'SERVICE_INVOICE',
    type: 'DEBIT',
    amount: amount,
    notes: notes
  });
}
```

**Problem:** Creates client invoice but doesn't update staff earnings.

### New Logic

```javascript
for (const booking of activeBookings) {
  // Find all ACTIVE assignments for this booking
  const assignments = await getActiveAssignments(booking_id);
  
  for (const assignment of assignments) {
    // Check if today falls within service_start_date to service_end_date
    if (todayIsBetween(assignment.service_start_date, assignment.service_end_date)) {
      const { amount, notes } = getBillingCharge({
        ...booking,
        daily_rate: assignment.daily_rate
      });
      
      // 1. Create CLIENT_PAYMENT transaction (DEBIT)
      await createTransaction({
        booking_id,
        assignment_id,
        category: 'SERVICE_INVOICE',
        type: 'DEBIT',
        amount,
        notes
      });
      
      // 2. UPDATE staff.current_earnings (NEW!)
      await updateStaffEarnings({
        staff_profile_id: assignment.staff_profile_id,
        amount_to_add: amount,
        notes: notes
      });
      
      // 3. Create STAFF_SALARY transaction (CREDIT to staff)
      await createTransaction({
        staff_profile_id: assignment.staff_profile_id,
        category: 'STAFF_SALARY',
        type: 'CREDIT',
        amount,
        notes: `Earned from booking ${booking_id} — ${notes}`
      });
    }
  }
}
```

**Key Changes:**
1. Loop through `booking_staff_assignments` instead of bookings
2. Check if today falls in assignment's date range
3. Update `staff_profiles.current_earnings` column
4. Create STAFF_SALARY transaction for staff wallet balance tracking

---

## Implementation Roadmap

### **Phase 1: Database Changes**

- [ ] Create `booking_staff_assignments` table
- [ ] Extend `bookings` table with payment tracking fields
- [ ] Create `payment_tracking` table (or use extended `payment_slips`)
- [ ] Add migration script

### **Phase 2: Backend API Changes**

#### 2.1 Payment Tracking
- [ ] `POST /api/quotations/:quote_id/record-payment` - Record client payment
- [ ] `GET /api/quotations/:quote_id/payment-progress` - Get payment status
- [ ] `GET /api/bookings/:booking_id/assignment-form` - Fetch form data

#### 2.2 Staff Assignment
- [ ] `POST /api/bookings/:booking_id/assign-staff` - New assignment endpoint
- [ ] Update `bookingController.convertToBooking` - Only creates booking, doesn't assign staff
- [ ] Add `staffAssignmentController.js` - New controller for assignments

#### 2.3 Daily Invoicing
- [ ] Modify `cron/dailyInvoicing.js` - Update staff earnings
- [ ] Add helper function `getActiveAssignmentsByBooking()`
- [ ] Add `updateStaffEarnings()` function
- [ ] Create STAFF_SALARY transactions

### **Phase 3: Frontend Changes**

#### 3.1 Admin Dashboard
- [ ] Payment Tracking Section
  - [ ] View payment progress for each quotation
  - [ ] Record new payments
  - [ ] Verify payment slips
  
- [ ] Staff Assignment Form (NEW)
  - [ ] Auto-populate quotation details
  - [ ] Show payment progress
  - [ ] Dropdown to select available staff
  - [ ] Auto-calculate dates based on daily rate
  - [ ] Submit and confirm assignment

- [ ] Assignment History
  - [ ] View all assignments for a booking
  - [ ] See which staff was assigned for which dates
  - [ ] See partial amounts allocated

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ SERVICE REQUEST CREATED                                         │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ QUOTATION GENERATED & SENT                                      │
│ (registration_fee + daily_rate×qty_days + transport_fee)       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN WAITS FOR PAYMENT(S)                                      │
│ Quotation Status: SENT                                          │
│ Service Request Status: PENDING                                 │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────────────────────┐
          │ PAYMENT RECEIVED                       │
          │ Admin records payment (can be partial) │
          │ - Amount                               │
          │ - Payment Method                       │
          │   (Bank Transfer / Cash Deposit /      │
          │    Cash / Cheque)                      │
          │ - Bank Account (if applicable)         │
          │ - Reference Number                     │
          └────────────┬───────────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │                             │
        ▼                             │
  ┌─────────────────────┐             │
  │ FULL PAYMENT?       │─── NO ──────┤
  └─────────┬───────────┘             │
            │ YES                     │
            ▼                         │
  ┌─────────────────────┐             │
  │ CREATE BOOKING      │◄────────────┘
  │ Status: PENDING     │  (when ready to assign)
  └──────┬──────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│ STAFF ASSIGNMENT FORM                                            │
│ Admin selects: Staff + Daily Rate + Start/End Date              │
│ Form auto-calculates: How many days payment covers              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ BOOKING STAFF ASSIGNMENT CREATED                                │
│ booking_staff_assignments row inserted                          │
│ Booking Status: ACTIVE                                          │
│ Assignment Status: ACTIVE                                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ DAILY INVOICING CRON (23:59)                                    │
│                                                                   │
│ For each ACTIVE booking_staff_assignment:                        │
│   IF today is within service_start_date to service_end_date:    │
│     1. Create SERVICE_INVOICE transaction (DEBIT to client)     │
│     2. UPDATE staff_profiles.current_earnings (+amount)         │
│     3. Create STAFF_SALARY transaction (CREDIT to staff)        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ STAFF EARNINGS UPDATED                                           │
│ staff_profiles.current_earnings increased                        │
│ staff_wallet_transactions created for tracking                  │
│ Client sees daily charges in their account                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Business Logic Changes

### **1. Payment Verification Before Assignment**
- ✅ Admin records payment
- ✅ Payment is verified/tracked in `payment_tracking` table
- ✅ Admin can see remaining balance before assigning staff
- ✅ Admin can assign staff for partial payment (e.g., 2 staff for 2 separate portions)

### **2. Flexible Staff Assignment**
- ✅ Assign multiple staff for same booking (on different date ranges)
- ✅ Each assignment has its own daily rate and date range
- ✅ System tracks which staff earns what portion

### **3. Staff Earnings Calculation**
- ✅ Daily invoicing now updates `staff_profiles.current_earnings`
- ✅ Staff salary is tracked separately in `transactions` table
- ✅ Staff wallet balance and current_earnings both updated

### **4. Remaining Balance Tracking**
- ✅ After one staff assignment, remaining balance available for next assignment
- ✅ Can track partial invoice scenarios
- ✅ Admin knows exactly how much is unpaid

---

## Validation Rules

### **Payment Recording**
```
✓ Quote must exist and be in status 'SENT' or 'PENDING'
✓ Amount received ≤ quotation.total_amount
✓ Multiple partial payments allowed per quotation
✓ Total paid must not exceed total_amount (cumulative check)
✓ Payment must be verified before used for assignment
✓ Payment method must be one of: BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE
✓ IF payment_method = BANK_TRANSFER or CASH_DEPOSIT → bank_account_id is REQUIRED
✓ IF payment_method = CASH → bank_account_id must be NULL
✓ IF payment_method = CHEQUE → bank_account_id is OPTIONAL (for later deposit)
✓ IF payment_method = CHEQUE → cheque_number and cheque_date are REQUIRED
✓ Bank account must be active (is_active = true)
✓ Reference number should be unique where applicable (bank ref, cheque #)
```

### **Staff Assignment**
```
✓ Booking must exist and be in status 'PENDING' or 'ACTIVE'
✓ Staff must exist and be AVAILABLE (current_status = 'AVAILABLE')
✓ Staff daily rate must be > 0
✓ service_start_date must be >= booking.start_date
✓ service_end_date must be calculated based on: 
     amount_paid ÷ staff_daily_rate = number of days
✓ Can only assign up to remaining balance
✓ Total of all assignments cannot exceed total_amount
```

### **Daily Invoicing**
```
✓ Only process ACTIVE assignments
✓ Only process if today is within assignment date range
✓ Calculate charge based on service_model (LIVE_IN, SHIFT_BASED, VISITING)
✓ Update staff.current_earnings (cannot go negative)
✓ Create matching transaction records (client DEBIT + staff CREDIT)
✓ Handle overdue bookings appropriately
```

---

## Implementation Checklist

### Backend
- [x] Database migration for new tables
  - [x] Create `bank_accounts` table
  - [x] Create `booking_staff_assignments` table
  - [x] Create `payment_tracking` table
  - [x] Update `transactions` table with bank details
  - [x] Update `bookings` table with payment tracking
  - [x] Update `payment_slips` table with payment method
- [x] Create `BankAccountController.js`
- [ ] Create `PaymentTrackingController.js`
- [ ] Create `StaffAssignmentController.js`
- [ ] Update `bookingController.js` - separate payment from assignment
- [ ] Update `dailyInvoicing.js` cron
- [ ] Create validation middleware
- [ ] Create helper functions for calculations and validations
- [ ] Add new routes to `bankAccountRoutes.js`
- [ ] Add new routes to `bookingRoutes.js`
- [ ] Add new routes to `paymentRoutes.js` or `quoteRoutes.js`

### Frontend (Admin Dashboard)
- [ ] Bank Account Management
  - [ ] View all bank accounts
  - [ ] Create/Edit bank account form
  - [ ] Deactivate bank account UI
  - [ ] View transactions per account
  - [ ] Account reconciliation report
- [ ] Payment Tracking Section
  - [ ] View payment progress for each quotation
  - [ ] Record new payment form (with payment method selection)
  - [ ] Conditional bank account dropdown
  - [ ] Cheque number/date fields (conditional)
  - [ ] Verify payment slips
- [ ] Staff Assignment Form (with auto-calculations)
  - [ ] Select available staff
  - [ ] Auto-calculate dates based on daily rate and payment
  - [ ] Submit and confirm assignment
- [ ] Assignment History View
- [ ] Remaining Balance Display
- [ ] Transaction History (filtered by payment method, account, etc.)

### Testing
- [ ] Unit tests for payment calculations
- [ ] Integration tests for assignment workflow
- [ ] End-to-end tests for daily invoicing
- [ ] Edge cases: multiple staff, partial payments, cancellations

---

## Example Scenario

**Client Quote:** Rs. 21,000 (5 days @ Rs. 4,000/day + Rs. 1,000 registration fee)

**Timeline:**
- **Day 1:** Client pays Rs. 15,000 (partial)
  - System tracks: Paid 15,000 / 21,000
  
- **Day 2:** Admin assigns Staff A for 3 days @ Rs. 4,000/day
  - Assignment covers: 12,000 (3 × 4,000)
  - Remaining for next assignment: 3,000

- **Day 3:** Cron runs (23:59)
  - Staff A earns: Rs. 4,000
  - staff_profiles.current_earnings += 4,000
  - Client invoiced: Rs. 4,000

- **Day 4:** Admin assigns Staff B for 0.75 days @ Rs. 4,000/day
  - Assignment covers: 3,000 (remaining balance)

- **Day 5:** Cron runs (23:59)
  - Staff A earns: Rs. 4,000
  - staff_profiles.current_earnings (Staff A) += 4,000

- **Day 6:** Cron runs (23:59)
  - Staff A earns: Rs. 4,000
  - Staff B earns: Rs. 3,000 (partial day)
  - Both staff earnings updated
  - Total invoiced = 15,000 (matches paid amount)

---

## Notes & Considerations

1. **Backward Compatibility**: Current `convertToBooking` endpoint will need refactoring. Consider creating version 2 (v2) or deprecating the old flow.

2. **Staff Rate Override**: The form allows overriding staff's standard daily rate. This is useful for:
   - Promotional rates
   - Different rates for different service types
   - Negotiated rates per client

3. **Partial Days**: The system should handle fractional days:
   - If amount_paid = Rs. 2,000 and daily_rate = Rs. 4,000
   - Staff is assigned for 0.5 days
   - Cron should handle prorated charges

4. **Multiple Assignments**: A booking can have:
   - Staff A: Days 1-3 @ Rs. 4,000/day
   - Staff B: Days 4-5 @ Rs. 3,500/day
   - Each assignment invoiced separately

5. **Cancellation/Termination**: When an assignment is cancelled:
   - Remove from invoicing consideration
   - Refund unpaid portion if booking is cancelled
   - Update remaining balance for other assignments

6. **Overtime Handling**: Current OT logic uses `booking.ot_rate`. This should work the same, but calculated per assignment:
   - `booking_staff_assignments.ot_rate` (if different from daily_rate calculation)
   - Or inherit from booking level

---

## Payment Method Workflow

### Step-by-Step Process

**1. Admin Receives Payment from Client**
```
Client sends payment through various channels:
- Bank transfer to company account
- Cash deposited to company account
- Physical cash payment
- Cheque payment
```

**2. Admin Records Payment in System**

**For Bank Transfer:**
- Selects "Bank Transfer" from dropdown
- System shows: "Which account did the transfer go to?"
- Admin selects from list of active bank accounts
- Reference number (optional): Bank transaction ID/reference

**For Cash Deposit:**
- Selects "Cash Deposit" from dropdown
- System shows: "Which account was the cash deposited to?"
- Admin selects from list of active bank accounts
- Reference number (optional): Deposit slip number

**For Cash:**
- Selects "Cash" from dropdown
- Bank account dropdown is hidden/disabled
- Reference number (optional): Receipt number or notes

**For Cheque:**
- Selects "Cheque" from dropdown
- Bank account dropdown is optional (for future deposit)
- Cheque number field appears (REQUIRED)
- Cheque date field appears (REQUIRED)
- Once cheque is deposited, admin can update the record with bank account

**3. System Tracks Payment Method**

All payment information is stored:
- In `payment_tracking` or `payment_slips` table
- In `transactions` table (with bank_account_id link)
- Associated with quotation and client

**4. Generate Reports by Payment Method or Bank Account**

Admin can filter transactions by:
- Bank account (for reconciliation)
- Payment method (for audit)
- Date range
- Status (Pending, Verified, Rejected)

### Sample Bank Account Setup

```
Bank: HBL (Habib Bank Limited)
├─ Account: Main Operations
│  ├─ Account #: 12345-67890-123
│  ├─ Branch: Karachi Downtown
│  └─ Currency: PKR
│
├─ Account: Receivables (Customer Deposits)
│  ├─ Account #: 12345-67890-456
│  ├─ Branch: Lahore Mall
│  └─ Currency: PKR
│
└─ Account: Operational Expenses
   ├─ Account #: 12345-67890-789
   ├─ Branch: Islamabad Centaurus
   └─ Currency: PKR
```

### Sample Reconciliation Scenario

```
Bank Account: "Main Operations" 
Period: May 1 - May 23, 2026

Opening Balance: 500,000 PKR
Deposits Recorded:
├─ Payment 1: Bank Transfer - 15,000 PKR (Quote: EST-1234)
├─ Payment 2: Bank Transfer - 25,000 PKR (Quote: EST-1235)
├─ Payment 3: Cash Deposit - 10,000 PKR (Quote: EST-1236)
└─ Payment 4: Bank Transfer - 5,000 PKR (Quote: EST-1237)

Total Deposits: 55,000 PKR
Expected Closing Balance: 555,000 PKR

Actual Bank Balance (from bank statement): 555,000 PKR
Status: ✅ BALANCED
```

---

| Component | Current | New | Reason |
|-----------|---------|-----|--------|
| Payment Tracking | Implicit (via transactions) | Explicit `payment_tracking` table | Clear audit trail, multiple payments |
| Payment Methods | Not tracked | BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE | Audit trail for regulatory compliance |
| Bank Accounts | Not tracked | `bank_accounts` table with full details | Reconciliation and account-based reporting |
| Bank Account Selection | N/A | Conditional dropdown (required for transfers/deposits) | Route payments to correct accounts |
| Staff Assignment | Single + Immediate | Multiple + Deferred via form | Flexibility, payment verification |
| Booking Status | Direct to ACTIVE | PENDING until staff assigned | Intermediate state needed |
| Daily Invoicing | Client invoicing only | Client invoicing + Staff earnings | Staff salary tracking |
| Staff Earnings | Never updated | Updated daily by cron | Accurate earning records |
| Form Data | Hardcoded in controller | Retrieved from DB | Dynamic, flexible |
| Assignment Tracking | Via booking.assigned_staff_id | Via `booking_staff_assignments` | Multiple assignments support |
| Transaction Records | Minimal bank info | Full bank account + payment method details | Complete financial audit trail |

---

## Bank Account & Payment Method Tracking Notes

### Key Features

1. **Multiple Bank Accounts Support**
   - Company can have multiple bank accounts with different purposes
   - Each account tracked separately in `bank_accounts` table
   - Transactions linked to specific accounts for clear reconciliation

2. **Payment Method Flexibility**
   - **Bank Transfer**: Direct A2A transfer with reference number tracking
   - **Cash Deposit**: Physical cash deposited to account with deposit slip tracking
   - **Cash**: Walk-in physical cash (no bank account association)
   - **Cheque**: Cheque payment with number tracking, can link to account later

3. **Conditional Bank Account Selection**
   - Frontend logic determines if bank account selection is required
   - BANK_TRANSFER and CASH_DEPOSIT require account selection
   - CASH payment hides account selection
   - CHEQUE payment makes account selection optional

4. **Audit Trail**
   - Every payment method choice is recorded
   - All transactions linked to bank account (when applicable)
   - Reference numbers stored for bank reconciliation
   - Verification status tracked (PENDING, VERIFIED, REJECTED)

5. **Reconciliation Capabilities**
   - View all transactions per bank account
   - Compare recorded deposits vs. bank statement
   - Identify discrepancies (missing, duplicate, amount mismatches)
   - Generate reconciliation reports

6. **Reporting & Analytics**
   - Transaction history filtered by payment method
   - Payment method distribution analysis
   - Bank account transaction volume reports
   - Late payment identification (pending vs. verified)

### Implementation Notes

- Bank accounts should be managed by Finance/Admin users only
- Account deactivation shouldn't delete historical records (soft delete via is_active flag)
- Payment verification workflow should be separate and auditable
- Reference numbers should be checked for duplicates to prevent fraud
- Consider implementing batch verification for multiple payments
- Archive old bank accounts after a certain period (e.g., annual)
- Store bank details securely - consider encryption for sensitive fields
- Generate reconciliation reports daily/weekly for finance team