---
name: admin-actions-reference
description: Complete list of all actions/operations available to admin/internal staff in the VCare Nursing admin dashboard
metadata: 
  node_type: memory
  type: reference
  originSessionId: e869b330-ec8f-4b9d-8943-6b9cc6a591f5
---

# Admin Dashboard — All Available Actions

_Captured from `client/src/modules/admin/` as of 2026-06-16 (activity logger reconciled)_

---

## 1. Admin Dashboard Main
`admin_dashboard_main/AdminDashboard.jsx`
- Filter bookings/assignments
- Download dashboard reports
- Switch service type tabs (Overview, Home Nursing, Elderly Care, Child Care)
- View booking details from Live Incoming Bookings table

---

## 2. Activity Log
`activity_log/ActivityLogPage.jsx`
- Filter by action type — filter UI supports: `CHANGE_REQUEST_SUBMITTED`, `CHANGE_REQUEST_CLAIMED`, `CHANGE_REQUEST_APPROVED`, `CHANGE_REQUEST_REJECTED`, `CLIENT_PAYMENT_RECORDED`, `MANUAL_TRANSACTION_ADDED`, `BANK_ACCOUNT_CREATED`, `BANK_ACCOUNT_UPDATED`, `BANK_ACCOUNT_DEACTIVATED`, `STAFF_ASSIGNED`, `ASSIGNMENT_UPDATED`, `ASSIGNMENT_COMPLETED`, `TERMINATION_APPROVED`
- Filter by date range
- Expand log entry to view JSON details
- Paginate results

---

## 3. Advance Requests
`advance_requests/advance_requests.jsx`
- Search by staff name or code
- Filter by status (Pending, All, Approved, Rejected)
- View advance request details (modal)
- **Approve** advance request → debits staff wallet → logs `ADVANCE_APPROVED`
- **Reject** advance request with reason → logs `ADVANCE_REJECTED`
- Navigate to staff history page

_Note: `ADVANCE_THRESHOLD_UPDATED` is also logged when updating the threshold from User Management (Staff tab)._

---

## 4. Bookings List
`bookings/Bookings.jsx`
- Search by client/patient/booking ID
- Filter by status (Active, Expiring Soon, Pending Termination, Terminated, Completed, Cancelled)
- View booking details
- Refresh list

---

## 5. Booking Detail Page
`bookings/BookingDetailPage.jsx`

**Payments:**
- Record booking payment (methods: BANK_TRANSFER, CASH_DEPOSIT, CASH, CHEQUE) → logs `BOOKING_PAYMENT_RECORDED`
- Upload payment slip
- Record wallet payoff payment → logs `WALLET_BOOKING_PAYOFF`
- View payment history
- **Verify** a payment → logs `PAYMENT_VERIFIED`
- **Reject** a payment → logs `PAYMENT_REJECTED`

**Staff Assignment:**
- Swap assigned staff member (with search + reason) → logs `STAFF_SWAPPED`
- View staff assignment history

**Termination:**
- View pending termination requests
- **Approve** termination with final end date and settlement action (WALLET_DEPOSIT, WALLET_REFUND, or notes) → logs `TERMINATION_APPROVED`; booking status change logs `BOOKING_TERMINATED` or `BOOKING_COMPLETED`
- View termination history

**Notes:**
- Add booking note → logs `BOOKING_NOTE_ADDED`
- Edit booking note → logs `BOOKING_NOTE_UPDATED`
- Delete booking note → logs `BOOKING_NOTE_DELETED`

**Statements:**
- Download booking statement as PDF for a date range
- Send statement to client via WhatsApp → logs `STATEMENT_SENT_WHATSAPP`

---

## 6. Service Requests
`service_requests/service_requests.jsx`
- Search by client/patient name or request ID
- Filter by status (New Lead, Pending, Contacted, Confirmed, Cancelled, Booking Created)
- View service request details
- **Create** service request → logs `SERVICE_REQUEST_CREATED`
- Edit service request → logs `SERVICE_REQUEST_UPDATED`
- Toggle proxy mode
- Manage preset items
- **Convert service request to booking** → logs `BOOKING_CREATED`

---

## 7. Service Request Summary
`service_requests/service_request_summary.jsx`
- Edit service request details (edit mode → save)
- Record quote payment with payment slip
- Select from multiple quotes linked to the same request
- Update service request status
- View linked quotes
- **Convert to booking**

---

## 8. Quotations
`service_quotes/quotations.jsx`
- Search and filter quotations (by payment status: FULLY_PAID, PARTIALLY_PAID, UNPAID, OVERPAID)
- **Record quote payment** (amount, method, bank account, cheque details, reference, slip) → logs `QUOTE_PAYMENT_RECORDED`
- **Verify** a payment → logs `PAYMENT_VERIFIED`
- **Reject** a payment → logs `PAYMENT_REJECTED`
- **Create** modular quote with line items → logs `QUOTATION_CREATED`
- **Edit** quote → logs `QUOTATION_UPDATED`
- Send quote PDF to client → logs `QUOTATION_SENT`
- Download quote

---

## 9. User Management — Clients
`user_managemnet/user_managemnet.jsx` (Clients tab)
- Search clients (name/email/phone)
- Sort by any field
- View client details
- Edit client information
- Deactivate / Activate client account

---

## 10. User Management — Staff/Workers
`user_managemnet/user_managemnet.jsx` (Workers tab)
- Search staff (name/email/phone/designation/status)
- Sort by any field
- View staff details
- Edit staff profile
- **Update advance threshold** (modal + confirmation)
- Deactivate / Activate staff account
- View earnings and payout info

---

## 11. Client Detail Page
`user_managemnet/client_detail_page.jsx`
- View/edit client profile
- View client's care profiles (patients)
- View client's bookings
- View client's quotes
- View client's transaction history
- **Record client payment** with payment allocation (apply to booking, new booking, or wallet) → logs `CLIENT_PAYMENT_RECORDED`
- View wallet balance
- Send statement via WhatsApp → logs `STATEMENT_SENT_WHATSAPP`
- Download statement as PDF
- Add client note → logs `CLIENT_NOTE_ADDED`
- Edit client note → logs `CLIENT_NOTE_UPDATED`
- Delete client note → logs `CLIENT_NOTE_DELETED`

---

## 12. Staff Detail Page
`user_managemnet/staff_detail_page.jsx`
- View/edit staff profile → logs `STAFF_PROFILE_UPDATED`
- View current booking and booking history
- View earnings summary and transactions (filtered)
- View payouts summary and list (filtered)
- **Create staff payout** (amount, method, reference, notes) → logs `STAFF_PAYOUT_CREATED`
- **Apply deduction** to staff wallet → logs `DEDUCTION_APPLIED`
- View earnings breakdown (total and current)
- Add staff bank account → logs `STAFF_BANK_ACCOUNT_CREATED`
- Edit staff bank account → logs `STAFF_BANK_ACCOUNT_UPDATED`
- Delete staff bank account → logs `STAFF_BANK_ACCOUNT_DELETED`
- Deactivate staff account → logs `STAFF_ACCOUNT_DEACTIVATED`
- Reactivate staff account → logs `STAFF_ACCOUNT_REACTIVATED`
- Update staff status
- **Send salary sheet notification** → logs `SALARY_SHEET_NOTIFICATION_SENT`
- **Download salary export** → logs `SALARY_EXPORT_DOWNLOADED`

---

## 13. Worker Verifications (Staff Applications)
`worker_verifications/worker_verifications.jsx`
- View worker application list
- View applicant details and uploaded documents (NIC, qualifications, profile photo)
- **Accept** application (with optional notes) → logs `APPLICATION_ACCEPTED`
- **Reject** application with rejection reason → logs `APPLICATION_REJECTED`
- **Update** application details mid-review → logs `APPLICATION_UPDATED`
- Creating/approving a new staff account → logs `STAFF_PROFILE_CREATED`
- Verify OTP if required

---

## 14. Change Requests
`change_requests/ChangeRequestsPage.jsx`
- Filter by status (PENDING, UNDER_REVIEW, APPROVED, REJECTED)
- View change details in current → requested format
- **Claim** a change request (assign to self)
- **Approve** with review notes
- **Reject** with rejection reason
- View change request action history/logs
- Supports: PROFILE_UPDATE, BANK_ACCOUNT_ADD, BANK_ACCOUNT_EDIT, BANK_ACCOUNT_REMOVE

---

## 15. Termination Requests
`termination_requests/termination_requests.jsx`
- Search by client/patient/staff name or booking ID
- Filter by urgency (Immediate, Today, Future)
- Expand request details
- **Approve** termination with final end date and settlement action
- View termination history

---

## 16. Transactions
`transactions/TransactionsPage.jsx`
- Search by keyword
- Filter by category, cash flow direction (IN/OUT/NEUTRAL), source type, date range
- **Add manual transaction** (date, category, amount, description, source)
- Expand row for transaction details
- Paginate results

---

## 17. Financial Overview
`financial/financial.jsx`
- View revenue, advances, staff wallets, and credit alerts summaries
- Switch revenue chart period (Monthly/Weekly/Daily)
- Download revenue/analytics report
- View transaction categories breakdown chart
- Filter and page through transactions

---

## 18. Patients / Care Profiles
`patients/patients.jsx`
- Search care profiles by name
- Filter by client
- **Create** new care profile (name, age, gender, relationship, medical condition, address, emergency contact)
- **Edit** care profile
- **Delete** care profile (with confirmation)

---

## 19. Statements
`statements/statements.jsx`
- Select booking and date range
- **Download statement as PDF**
- **Send statement to client via WhatsApp** → logs `STATEMENT_SENT_WHATSAPP`
- **Delete** a saved statement → logs `STATEMENT_DELETED`
- View saved statements history

---

## 20. Bank Accounts
`back_accounts/bank_accounts.jsx`
- **Create** bank account (nickname, number, holder, bank, branch, currency)
- **Edit** bank account
- **Deactivate** bank account
- View account transactions (filtered by date range and status)
- View reconciliation report for account

---

## 21. Booking Staff Assignment
`service_requests/booking_staff_assignment.jsx`
- Select and filter available staff by role/availability
- View staff details before confirming
- **Assign staff to booking** → logs `STAFF_ASSIGNED`
- **Update assignment** (change dates/hours) → logs `ASSIGNMENT_UPDATED`
- **Complete assignment** → logs `ASSIGNMENT_COMPLETED`
- View assignment history

---

## 22. Preset Items Manager
`service_quotes/PresetManager.jsx`
- **Create** preset item (name, unit price, category, quantity) → logs `PRESET_ITEM_CREATED`
- **Edit** preset item → logs `PRESET_ITEM_UPDATED`
- **Delete** preset item → logs `PRESET_ITEM_DELETED`
- Use presets in quote line items

---

## 23. Settings
`settings/settings.jsx`
- Edit own profile (first name, last name, email, photo)
- Toggle Two-Factor Authentication
- Toggle Email Notifications
- Toggle Public Maintenance Mode

---

## 24. Staff Reviews
`staff_reviews/` (backed by `staffReviewController.js`)
- View reviews for a staff member
- **Toggle review visibility** (show/hide from public) → logs `REVIEW_VISIBILITY_TOGGLED`
- **Send review request** to client → logs `REVIEW_REQUEST_SENT`

---

## Quick Reference by Action Type

| Type | Logged Action Types |
|------|-----------|
| **Create** | `BOOKING_CREATED`, `SERVICE_REQUEST_CREATED`, `QUOTATION_CREATED`, `PATIENT_CREATED`, `BANK_ACCOUNT_CREATED`, `PRESET_ITEM_CREATED`, `MANUAL_TRANSACTION_ADDED`, `STAFF_PAYOUT_CREATED`, `STAFF_BANK_ACCOUNT_CREATED`, `STAFF_PROFILE_CREATED` |
| **Update/Edit** | `SERVICE_REQUEST_UPDATED`, `QUOTATION_UPDATED`, `PATIENT_UPDATED`, `BANK_ACCOUNT_UPDATED`, `PRESET_ITEM_UPDATED`, `ASSIGNMENT_UPDATED`, `STAFF_PROFILE_UPDATED`, `STAFF_BANK_ACCOUNT_UPDATED`, `ADVANCE_THRESHOLD_UPDATED`, `APPLICATION_UPDATED` |
| **Record Payment** | `CLIENT_PAYMENT_RECORDED`, `BOOKING_PAYMENT_RECORDED`, `QUOTE_PAYMENT_RECORDED`, `WALLET_BOOKING_PAYOFF` |
| **Approve/Reject** | `ADVANCE_APPROVED`, `ADVANCE_REJECTED`, `TERMINATION_APPROVED`, `CHANGE_REQUEST_APPROVED`, `CHANGE_REQUEST_REJECTED`, `PAYMENT_VERIFIED`, `PAYMENT_REJECTED`, `APPLICATION_ACCEPTED`, `APPLICATION_REJECTED` |
| **Assign/Swap** | `STAFF_ASSIGNED`, `ASSIGNMENT_UPDATED`, `ASSIGNMENT_COMPLETED`, `STAFF_SWAPPED` |
| **Notes** | `BOOKING_NOTE_ADDED`, `BOOKING_NOTE_UPDATED`, `BOOKING_NOTE_DELETED`, `CLIENT_NOTE_ADDED`, `CLIENT_NOTE_UPDATED`, `CLIENT_NOTE_DELETED` |
| **Change Requests** | `CHANGE_REQUEST_SUBMITTED`, `CHANGE_REQUEST_CLAIMED`, `CHANGE_REQUEST_APPROVED`, `CHANGE_REQUEST_REJECTED` |
| **Booking Lifecycle** | `BOOKING_CREATED`, `BOOKING_COMPLETED`, `BOOKING_TERMINATED`, `TERMINATION_APPROVED` |
| **Export/Notify** | `STATEMENT_SENT_WHATSAPP`, `QUOTATION_SENT`, `SALARY_SHEET_NOTIFICATION_SENT`, `SALARY_EXPORT_DOWNLOADED` |
| **Deactivate** | `BANK_ACCOUNT_DEACTIVATED`, `STAFF_ACCOUNT_DEACTIVATED`, `CLIENT_ACCOUNT_DEACTIVATED` |
| **Reactivate** | `STAFF_ACCOUNT_REACTIVATED`, `CLIENT_ACCOUNT_REACTIVATED` |
| **Delete** | `PATIENT_DELETED`, `PRESET_ITEM_DELETED`, `STAFF_BANK_ACCOUNT_DELETED`, `STATEMENT_DELETED` |
| **Finance/Wallet** | `DEDUCTION_APPLIED`, `STAFF_PAYOUT_CREATED`, `WALLET_BOOKING_PAYOFF`, `ADVANCE_APPROVED`, `ADVANCE_REJECTED` |
| **Reviews** | `REVIEW_VISIBILITY_TOGGLED`, `REVIEW_REQUEST_SENT` |
