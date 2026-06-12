# Transactions — Category Guide

This guide explains every type of transaction the system records, what it means in
plain language, and whether it counts as **money coming in**, **money going out**, or
is **neutral** (internal movement or an accounting entry that is not real cash flow).

Use this when explaining the Transactions page to staff or clients.

---

## How to read the money direction

Every transaction is classified into one of three "flows":

| Flow | Meaning | Counts in totals? |
|------|---------|-------------------|
| 🟢 **Money In** | Real cash received by the company | Added to **Money In** |
| 🔴 **Money Out** | Real cash paid out by the company | Added to **Money Out** |
| ⚪ **Neutral** | Internal movement or an accrual/record — no real cash entered or left the company | Ignored in the In/Out totals |

> **Why "neutral" matters:** Some entries exist for bookkeeping — for example, recording
> the salary a staff member has *earned* (a future obligation), or moving a client's own
> money from their wallet to a booking. Counting these as in/out would double-count or
> distort the real cash picture, so they are deliberately excluded from the totals.

---

## 🟢 Money In

### CLIENT_PAYMENT — *Client Payment*
A client pays the company directly — for example a general payment, a top-up while
extending a booking, or a payment for a quotation that isn't tied to a specific booking
yet. This is real money received.

### BOOKING_PAYMENT — *Booking Payment*
A client pays toward a specific booking (verified manual payments, recorded payments, or
a payment applied to a booking). Real money received.

### WALLET_TOPUP — *Wallet Top-up*
A client adds money to their wallet balance. Even though it sits in their wallet for
later use, the cash has been received by the company, so it is money in.

### OTHER_INCOME — *Other Income (manual)*
A manually recorded payment received that happened **outside** the web app — e.g. a
walk-in client, or income from a source the system doesn't otherwise track. Entered by
admin/internal staff via **Add Transaction**.

---

## 🔴 Money Out

### STAFF_SALARY_PAID — *Salary Paid*
An actual salary payout to a staff member — real cash leaving the company.

### STAFF_ADVANCE — *Salary Advance*
An approved salary advance paid early to a staff member against their earnings. This is
real cash leaving the company, so it is money out. (It is also recorded in the staff
wallet history.)

### AGENCY_FEE — *Agency Fee*
A fee the company pays to an agency or partner. Money out.

### OTHER_EXPENSE — *Other Expense (manual)*
A manually recorded payment made that happened **outside** the web app — e.g. rent,
utilities, supplier payments. Entered by admin/internal staff via **Add Transaction**.

---

## ⚪ Neutral (internal / accounting only)

### STAFF_SALARY — *Staff Salary (accrued)*
Created automatically by daily invoicing. It records the salary a staff member has
**earned for the day** — money the company now *owes* them, not money paid. Because no
cash has actually moved yet, it is neutral. (The real cash movement happens later as
**STAFF_SALARY_PAID** or **STAFF_ADVANCE**.)

### SERVICE_INVOICE — *Service Invoice*
Created automatically by daily invoicing. It records the day's service charge against a
client — money that is already in the system (paid in advance) or due to come in. It is
an accounting entry, not a fresh cash receipt, so it is neutral. (The actual cash came in
as a CLIENT_PAYMENT / BOOKING_PAYMENT.)

### REGISTRATION_FEE — *Registration Fee*
A one-time fee charged to the client during booking setup. It is already included within
the client's booking payment, so charging it is an internal allocation, not separate
money in or out. Neutral.

### WALLET_DEBIT — *Wallet Debit*
The client's own wallet balance is drawn down to pay off a booking (for example, settling
an overdue booking from wallet credit). This just moves the client's existing money from
their wallet to the booking — it is paired with a booking payment — so no new cash enters
or leaves the company. Neutral.

### WALLET_REFUND — *Wallet Refund*
When a booking is terminated or completed before the amount allocated to it has been
fully invoiced (used up), the admin/internal staff can refund the unused balance back
into the client's wallet. The money was already inside the system (the client had paid
it), so moving it back to their wallet is neutral — not a new expense.

### BOOKING_SETTLEMENT — *Booking Settlement (legacy)*
Previously used to record the leftover balance deposited into a client's wallet when a
booking ended. This has been replaced by **WALLET_REFUND**. Existing historical entries
remain under this label and are treated as neutral.

---

## Manual transactions

The **Add Transaction** button lets admin/internal staff record money movements that
happen outside the web application. Manual entries are limited to:

- **OTHER_INCOME** (money in)
- **OTHER_EXPENSE** (money out)
- **AGENCY_FEE** (money out)

Every manual transaction is written to the **Activity Log** with the staff member who
recorded it, so there is a full audit trail.

---

## Quick reference

| Category | Label | Flow |
|----------|-------|------|
| `CLIENT_PAYMENT` | Client Payment | 🟢 Money In |
| `BOOKING_PAYMENT` | Booking Payment | 🟢 Money In |
| `WALLET_TOPUP` | Wallet Top-up | 🟢 Money In |
| `OTHER_INCOME` | Other Income | 🟢 Money In |
| `STAFF_SALARY_PAID` | Salary Paid | 🔴 Money Out |
| `STAFF_ADVANCE` | Salary Advance | 🔴 Money Out |
| `AGENCY_FEE` | Agency Fee | 🔴 Money Out |
| `OTHER_EXPENSE` | Other Expense | 🔴 Money Out |
| `STAFF_SALARY` | Staff Salary (accrued) | ⚪ Neutral |
| `SERVICE_INVOICE` | Service Invoice | ⚪ Neutral |
| `REGISTRATION_FEE` | Registration Fee | ⚪ Neutral |
| `WALLET_DEBIT` | Wallet Debit | ⚪ Neutral |
| `WALLET_REFUND` | Wallet Refund | ⚪ Neutral |
| `BOOKING_SETTLEMENT` | Booking Settlement (legacy) | ⚪ Neutral |
