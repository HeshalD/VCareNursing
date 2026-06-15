# VCare Nursing — WhatsApp Template Specifications

## Summary

| # | Template Name | Category | Variables |
|---|---|---|---|
| 1 | `vcare_client_otp_registration` | Authentication | OTP code |
| 2 | `vcare_client_otp_password_reset` | Authentication | OTP code |
| 3 | `vcare_staff_otp_application` | Authentication | OTP code |
| 4a | `vcare_staff_welcome_new` | Utility | Name, temp password |
| 4b | `vcare_staff_welcome_existing` | Utility | Name |
| 5 | `vcare_staff_application_rejected` | Utility | Name |
| 6 | `vcare_service_request_confirmed` | Utility | Client name, service type, date |
| 7 | `vcare_client_quotation` | Utility | Client name, service type, amount, expiry date |
| 8 | `vcare_booking_confirmed` | Utility | Client name, staff name, date, time, profile link |
| 9 | `vcare_booking_overdue_balance` | Utility | Client name, amount, due date |
| 10 | `vcare_payment_recorded` | Utility | Client name, amount, date, balance |
| 11 | `vcare_monthly_statement` | Utility | Client name, month, statement link |
| 12 | `vcare_salary_statement` | Utility | Staff name, month, net pay, statement PDF |
| 13 | `vcare_rate_staff_member` | Utility | Client name, staff name, booking link |
| 14 | `vcare_staff_new_assignment` | Utility | Staff name, patient name, start date, end date, daily rate |
| 15 | `vcare_staff_assignment_changed` | Utility | Staff name, patient name, booking reference |
| 16 | `vcare_staff_assignment_terminated` | Utility | Staff name, patient name, end date |
| 17 | `vcare_staff_change_request_sent` | Utility | Staff name, request type, reference ID |
| 18a | `vcare_staff_change_request_approved` | Utility | Staff name, request type |
| 18b | `vcare_staff_change_request_rejected` | Utility | Staff name, request type, reason |
| 19 | `vcare_staff_advance_request_sent` | Utility | Staff name, amount requested, reference ID |
| 20a | `vcare_staff_advance_approved` | Utility | Staff name, amount approved, new wallet balance |
| 20b | `vcare_staff_advance_rejected` | Utility | Staff name, amount requested, reason |
| 21 | `vcare_staff_salary_paid` | Utility | Staff name, amount, date |
| 22 | `vcare_client_termination_requested` | Utility | Client name, booking reference, requested end date |
| 23a | `vcare_client_termination_approved` | Utility | Client name, booking reference, end date, refund amount |
| 23b | `vcare_client_termination_rejected` | Utility | Client name, booking reference |
| 24 | `vcare_booking_completed_client` | Utility | Client name, staff name, completion date |
| 25 | `vcare_client_wallet_refund` | Utility | Client name, refund amount, reason |
| 26 | `vcare_staff_salary_sheet` | Utility | Staff name, month, amount paid, date, method + PDF header |

**Total: 29 templates — 3 Authentication, 26 Utility**

> **Template limit:** WhatsApp Business accounts allow up to **250 templates** by default.
> 28 templates is well within this limit. You can always request a higher limit from Meta if needed.

---

## How to Create Templates

All templates are created in the same place:
**[business.facebook.com](https://business.facebook.com) → Account tools → Message Templates → Create template**

---

## Authentication Templates

> Authentication templates have a fixed format enforced by Meta. You do not write the full body — Meta generates it. You only supply the OTP code as `{{1}}` at send time.
> The generated body looks like: *"[code] is your verification code."*
> You can optionally enable a **Copy Code** button.

---

### 1. `vcare_client_otp_registration`

| Field | Value |
|---|---|
| Category | **Authentication** |
| Template Name | `vcare_client_otp_registration` |
| Language | English (US) |

**Steps:**
1. Select category: **Authentication**
2. Template name: `vcare_client_otp_registration`
3. Under "Add security recommendation": **Enable** ("For your security, do not share this code.")
4. Code expiration time: **10 minutes**
5. Button: **Copy code**
6. Submit

**At send time, pass:**
- `{{1}}` = the 6-digit OTP (e.g. `482910`)

---

### 2. `vcare_client_otp_password_reset`

| Field | Value |
|---|---|
| Category | **Authentication** |
| Template Name | `vcare_client_otp_password_reset` |
| Language | English (US) |

**Steps:** Same as template #1 above.

**At send time, pass:**
- `{{1}}` = the 6-digit OTP

---

### 3. `vcare_staff_otp_application`

| Field | Value |
|---|---|
| Category | **Authentication** |
| Template Name | `vcare_staff_otp_application` |
| Language | English (US) |

**Steps:** Same as template #1 above.

**At send time, pass:**
- `{{1}}` = the 6-digit OTP

---

## Utility Templates

> Utility templates are for transactional messages tied to a customer action or account event.
> Variables are numbered `{{1}}`, `{{2}}`, etc. in the order you define them.
> When creating, Meta will ask you for a **sample value** for each variable — provide a realistic example.

---

### 4a. `vcare_staff_welcome_new`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_welcome_new` |
| Language | English (US) |

**Header:** (Text) `Welcome to VCare Nursing`

**Body:**
```
Hi {{1}}, welcome to the VCare Nursing team! 🎉

Your application has been accepted. Here are your login credentials to get started:

Temporary Password: {{2}}

Please log in at your earliest convenience and set a new password. This temporary password expires in 24 hours.

If you have any questions, don't hesitate to reach out to us.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/login` (static URL)

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `TempP@ss123`

---

### 4b. `vcare_staff_welcome_existing`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_welcome_existing` |
| Language | English (US) |

**Header:** (Text) `Welcome Back to VCare Nursing`

**Body:**
```
Hi {{1}}, great news — your application has been accepted!

Since you already have an account with us, you can log in using your existing credentials.

We look forward to working with you again.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/login`

**Sample values:** `{{1}}` = `James`

---

### 5. `vcare_staff_application_rejected`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_application_rejected` |
| Language | English (US) |

**Header:** (Text) `Application Update`

**Body:**
```
Hi {{1}},

Thank you for your interest in joining VCare Nursing.

After careful consideration, we are unable to move forward with your application at this time.

We appreciate the time you took to apply and wish you all the best in your job search.
```

**Footer:** `VCare Nursing`

**Sample values:** `{{1}}` = `Michael`

---

### 6. `vcare_service_request_confirmed`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `Service Request Received` |
| Language | English (US) |

**Header:** (Text) `Service Request Received`

**Body:**
```
Hi {{1}},

We have received your service request for *{{2}}* on *{{3}}*.

Our team is reviewing your request and will get back to you with a quote shortly.

Thank you for choosing VCare Nursing.
```

**Footer:** `VCare Nursing`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Home Nursing`, `{{3}}` = `15 June 2026`

---

### 7. `vcare_client_quotation`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_client_quotation` |
| Language | English (US) |

**Header:** (Text) `Your Quotation from VCare Nursing`

**Body:**
```
Hi {{1}},

Please find attached your quotation for {{2}}:


Please make sure to complete this payment and send us the receipt to move on with the booking. 

Thank you.
```

**Footer:** `VCare Nursing`

**Media:** Document (PDF) - *Dynamic URL*

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Home Nursing – 4 hours`, `{{3}}` = `320.00`, `{{4}}` = `20 June 2026`

---

### 8. `vcare_booking_confirmed`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_booking_confirmed` |
| Language | English (US) |

**Header:** (Text) `Booking Confirmed ✅`

**Body:**
```
Hi {{1}},

Your booking has been confirmed! Here are the details:

👤 Staff Member: {{2}}
📅 Date: {{3}}
🕐 Time: {{4}}

You can view your assigned staff member's profile here:
{{5}}

If you need to make any changes, please contact us as soon as possible.
```

**Footer:** `VCare Nursing`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Sarah Johnson`, `{{3}}` = `18 June 2026`, `{{4}}` = `9:00 AM`, `{{5}}` = `https://vcarenursing.com/staff/sarah-johnson`

> **Note:** `{{5}}` is the full staff profile URL. Generate this dynamically in your backend when sending.

---

### 9. `vcare_booking_overdue_balance`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_booking_overdue_balance` |
| Language | English (US) |

**Header:** (Text) `Payment Reminder`

**Body:**
```
Hi {{1}},

This is a reminder that your account has an overdue balance of *${{2}}* that was due on *{{3}}*.

Please log in to your account to make a payment at your earliest convenience to avoid any disruption to your services.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/payments`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `150.00`, `{{3}}` = `1 June 2026`

---

### 10. `vcare_payment_recorded`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_payment_recorded` |
| Language | English (US) |

**Header:** (Text) `Payment Received ✅`

**Body:**
```
Hi {{1}},

We have received your payment of *${{2}}* on *{{3}}*.

Your current account balance is: *${{4}}*

Thank you for your prompt payment.
```

**Footer:** `VCare Nursing`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `200.00`, `{{3}}` = `6 June 2026`, `{{4}}` = `0.00`

---

### 11. `vcare_monthly_statement`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_monthly_statement` |
| Language | English (US) |

**Header:** (Text) `Your Monthly Statement`

**Body:**
```
Hi {{1}},

Your statement for *{{2}}* is now available.

Please log in to your account or click below to view and download your statement.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/statements`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `May 2026`

---

### 12. `vcare_salary_statement`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_salary_statement` |
| Language | English (US) |

**Header:** (Text) `Your Salary Statement`

**Body:**
```
Hi {{1}},

Your salary statement for *{{2}}* is now available.

💰 Net Pay: *${{3}}*

Please log in to your staff portal or click below to view your full statement.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/statements`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `May 2026`, `{{3}}` = `2,850.00`

---

### 13. `vcare_rate_staff_member`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_rate_staff_member` |
| Language | English (US) |

**Header:** (Text) `How Was Your Experience?`

**Body:**
```
Hi {{1}},

We hope you were happy with the care provided by *{{2}}*!

Your feedback helps us maintain the highest standard of service. It only takes 30 seconds — we'd love to hear from you.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/bookings/{{3}}`

> **Note on the rating link button:** WhatsApp allows a static base URL with a dynamic suffix. Set the button URL to `https://vcarenursing.com/client/bookings/` and pass `{{3}}` as the dynamic part (the booking ID) at send time. This takes the client directly to the relevant booking in their profile where they can leave a review.

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Sarah Johnson`, `{{3}}` = `BK-10045`

---

---

## Staff Assignment Templates

---

### 14. `vcare_staff_new_assignment`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_new_assignment` |
| Language | English (US) |

**Header:** (Text) `New Assignment`

**Body:**
```
Hi {{1}},

You have been assigned to a new booking. Here are the details:

Patient: {{2}}
Location: {{3}}
Conditions: {{4}}
Start Date: ${{5}}

Please log in to the staff portal for the full assignment details.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/assignments`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `patient_name`
- `{{3}}` = `location`
- `{{4}}` = `conditions`
- `{{5}}` = `service_start_date` (formatted, e.g. `18/06/2026`)


**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `John Perera`, `{{3}}` = `3rd Street, Colombo`, `{{4}}` = `High Blood Pressure, Diebetics`, `{{5}}` = `25/06/2026`

---

### 15. `vcare_staff_assignment_changed`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_assignment_changed` |
| Language | English (US) |

**Header:** (Text) `Assignment Update`

**Body:**
```
Hi {{1}},

Please note that you have been removed from the following booking:

👤 Patient: {{2}}
🔖 Booking Reference: {{3}}

If you have any questions, please contact the VCare Nursing office.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `patient_name`
- `{{3}}` = `booking_id`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `John Perera`, `{{3}}` = `BK-10045`

---

### 16. `vcare_staff_assignment_terminated`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_assignment_terminated` |
| Language | English (US) |

**Header:** (Text) `Assignment Ended`

**Body:**
```
Hi {{1}},

Your assignment has come to an end. Thank you for your dedication and service.

👤 Patient: {{2}}
📅 End Date: {{3}}

Please log in to the staff portal to view your final assignment summary.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/assignments`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `patient_name`
- `{{3}}` = `official_end_date` (formatted)

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `John Perera`, `{{3}}` = `25 June 2026`

---

## Staff Administrative Templates

---

### 17. `vcare_staff_change_request_sent`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_change_request_sent` |
| Language | English (US) |

**Header:** (Text) `Change Request Received`

**Body:**
```
Hi {{1}},

Your change request has been received and is now under review by the admin team.

📋 Request Type: {{2}}
🔖 Reference: #{{3}}

You will be notified once a decision has been made. Please allow 1–2 business days for review.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `request_type` (formatted for display, e.g. `"Profile Update"`, `"Bank Account Change"`)
- `{{3}}` = `request_id`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `Profile Update`, `{{3}}` = `CR-0021`

---

### 18a. `vcare_staff_change_request_approved`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_change_request_approved` |
| Language | English (US) |

**Header:** (Text) `Change Request Approved ✅`

**Body:**
```
Hi {{1}},

Good news — your change request has been approved.

📋 Request Type: {{2}}

Your profile has been updated accordingly. Please log in to the staff portal to verify the changes.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/profile`

**At send time, pass:**
- `{{1}}` = `staff.full_name` (looked up via `changeReq.staff_profile_id`)
- `{{2}}` = `changeReq.request_type` (formatted)

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `Bank Account Change`

---

### 18b. `vcare_staff_change_request_rejected`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_change_request_rejected` |
| Language | English (US) |

**Header:** (Text) `Change Request Update`

**Body:**
```
Hi {{1}},

Your change request has been reviewed and could not be approved at this time.

📋 Request Type: {{2}}
📝 Reason: {{3}}

If you have any questions, please contact the VCare Nursing office.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `changeReq.request_type` (formatted)
- `{{3}}` = `review_notes`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `Bank Account Change`, `{{3}}` = `Account details could not be verified`

---

### 19. `vcare_staff_advance_request_sent`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_advance_request_sent` |
| Language | English (US) |

**Header:** (Text) `Advance Request Received`

**Body:**
```
Hi {{1}},

Your advance request has been received and is pending admin approval.

💰 Amount Requested: ${{2}}
🔖 Reference: #{{3}}

You will be notified once a decision has been made.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `staff.full_name` (looked up via `staff_profile_id`)
- `{{2}}` = `amount_requested`
- `{{3}}` = `advance_id`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `500.00`, `{{3}}` = `ADV-0034`

---

### 20a. `vcare_staff_advance_approved`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_advance_approved` |
| Language | English (US) |

**Header:** (Text) `Advance Approved ✅`

**Body:**
```
Hi {{1}},

Your advance request has been approved and credited to your wallet.

💰 Amount Approved: ${{2}}
👜 New Wallet Balance: ${{3}}

Please log in to the staff portal to view your updated wallet.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/wallet`

**At send time, pass:**
- `{{1}}` = `staff.full_name` (looked up via `advance.staff_profile_id`)
- `{{2}}` = `advance.amount_requested`
- `{{3}}` = `walletResult.balance`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `500.00`, `{{3}}` = `1,250.00`

---

### 20b. `vcare_staff_advance_rejected`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_advance_rejected` |
| Language | English (US) |

**Header:** (Text) `Advance Request Update`

**Body:**
```
Hi {{1}},

Your advance request of ${{2}} could not be approved at this time.

📝 Reason: {{3}}

If you have any questions, please contact the VCare Nursing office.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `staff.full_name`
- `{{2}}` = `result.amount_requested`
- `{{3}}` = `reason`

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `500.00`, `{{3}}` = `Insufficient wallet balance to support this advance`

---

### 21. `vcare_staff_salary_paid`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_salary_paid` |
| Language | English (US) |

**Header:** (Text) `Salary Processed`

**Body:**
```
Hi {{1}},

Your daily salary has been processed and credited to your wallet.

💰 Amount: ${{2}}
📅 Date: {{3}}

Please log in to the staff portal to view your updated wallet balance.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/staff/wallet`

**At send time, pass:**
- `{{1}}` = `assignment.staff_name`
- `{{2}}` = `salaryAmount`
- `{{3}}` = `today` (formatted business date, e.g. `13 June 2026`)

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `85.00`, `{{3}}` = `13 June 2026`

> **Note:** This is triggered by the nightly `dailyInvoicing` job at 23:59. For the salary sheet/PDF, see template 12 (`vcare_salary_statement`).

---

## Client Booking Lifecycle Templates

---

### 22. `vcare_client_termination_requested`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_client_termination_requested` |
| Language | English (US) |

**Header:** (Text) `Termination Request Received`

**Body:**
```
Hi {{1}},

We have received your request to terminate your booking.

Booking Reference: {{2}}
Requested End Date: {{3}}

Our team is reviewing your request and will get back to you shortly. If this is urgent, please contact us directly.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `client_name`
- `{{2}}` = `booking_id`
- `{{3}}` = `requested_end_date` (formatted; or `"Immediately"` if urgency is `IMMEDIATE`)

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `BK-10045`, `{{3}}` = `20 June 2026`

---

### 23a. `vcare_client_termination_approved`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_client_termination_approved` |
| Language | English (US) |

**Header:** (Text) `Termination Approved`

**Body:**
```
Hi {{1}},

Your termination request for booking {{2}} has been approved.

Official End Date: {{3}}

Please contact our staff regarding any eligible refund. 
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/bookings`

**At send time, pass:**
- `{{1}}` = `client_name`
- `{{2}}` = `request.booking_id`
- `{{3}}` = `official_end_date` (formatted)
- `{{4}}` = `refundAmount` (pass `"0.00"` if no refund applies)

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `BK-10045`, `{{3}}` = `20 June 2026`, `{{4}}` = `120.00`

---

### 23b. `vcare_client_termination_rejected`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_client_termination_rejected` |
| Language | English (US) |

**Header:** (Text) `Termination Request Update`

**Body:**
```
Hi {{1}},

Your termination request for booking {{2}} could not be processed at this time.

Please contact our team directly for further assistance and to discuss your options.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- `{{1}}` = `client_name`
- `{{2}}` = `request.booking_id`

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `BK-10045`

---

### 24. `vcare_booking_completed_client`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_booking_completed_client` |
| Language | English (US) |

**Header:** (Text) `Booking Completed`

**Body:**
```
Hi {{1}},

Your booking with {{2}} has been successfully completed.

📅 Completion Date: {{3}}

Thank you for choosing VCare Nursing. Please log in to your account to view your booking summary.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/bookings`

**At send time, pass:**
- `{{1}}` = `client_name`
- `{{2}}` = `staff_name` (looked up via `booking.assigned_staff_id`)
- `{{3}}` = `actual_end_time` (formatted date)

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Sarah Johnson`, `{{3}}` = `25 June 2026`

---

### 25. `vcare_client_wallet_refund`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_client_wallet_refund` |
| Language | English (US) |

**Header:** (Text) `Wallet Refund Credited ✅`

**Body:**
```
Hi {{1}},

A refund of ${{2}} has been credited to your VCare wallet.

💼 Reason: {{3}}

Please log in to your account to view your updated wallet balance.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/wallet`

**At send time, pass:**
- `{{1}}` = `client_name`
- `{{2}}` = `refundAmount` (calculated as `unusedDays × daily_rate`)
- `{{3}}` = `settlement_notes` (e.g. `"Unused booking days refunded"`)

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `120.00`, `{{3}}` = `Unused booking days refunded`

---

---

### 26. `vcare_staff_salary_sheet`

| Field | Value |
|---|---|
| Category | **Utility** |
| Template Name | `vcare_staff_salary_sheet` |
| Language | English (US) |

**Header:** Document (PDF) — *Dynamic URL* (the generated salary sheet PDF)

**Body:**
```
Hi {{1}},

Your salary for *{{2}}* has been processed! 

Amount Paid: *{{3}}*
Payment Date: {{4}}
Method: {{5}}

Your detailed salary sheet is attached above. 

Thank you for your hard work and dedication.
```

**Footer:** `VCare Nursing`

**At send time, pass:**
- Header: `{ type: 'document', document: { link: pdfUrl, filename: 'Salary_Sheet_June_2026.pdf' } }`
- `{{1}}` = `staff.full_name` (e.g. `Sarah`)
- `{{2}}` = `monthLabel` (e.g. `June 2026`)
- `{{3}}` = formatted amount with currency (e.g. `LKR 15,000.00`)
- `{{4}}` = `paymentDate` (e.g. `15 Jun 2026`)
- `{{5}}` = payment method label (e.g. `Bank Transfer`)

**Sample values:** `{{1}}` = `Sarah`, `{{2}}` = `June 2026`, `{{3}}` = `LKR 15,000.00`, `{{4}}` = `15 Jun 2026`, `{{5}}` = `Bank Transfer`

> **Note:** Triggered automatically when admin processes a salary payout (individual or bulk) from the Staff Salaries page. The PDF is generated server-side, uploaded to Cloudinary, and the URL is passed as the document header. An SMS is also sent concurrently (no PDF — just a short text summary). See `backend/utils/salaryPdf.js` and `backend/templates/salarySheetTemplate.js`.

---

## Template Naming Rules (Meta Requirements)

- Lowercase letters, numbers, and underscores only
- No spaces, hyphens, or special characters
- Must be unique within your WhatsApp Business Account

## Approval Tips

- **Authentication** templates are auto-approved almost instantly
- **Utility** templates are usually approved within a few minutes to a few hours
- Avoid anything that looks promotional in a Utility template — Meta may reject it or downgrade it to Marketing
- Always provide realistic sample values when submitting
