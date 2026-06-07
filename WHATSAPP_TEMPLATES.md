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
| 12 | `vcare_salary_statement` | Utility | Staff name, month, amount, statement link |
| 13 | `vcare_rate_staff_member` | Utility | Client name, staff name, rating link |

**Total: 13 templates — 3 Authentication, 10 Utility**

> **Template limit:** WhatsApp Business accounts allow up to **250 templates** by default.
> 13 templates is well within this limit. You can always request a higher limit from Meta if needed.

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
| Template Name | `vcare_service_request_confirmed` |
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

Here is your quotation for *{{2}}*:

💰 Total: ${{3}}

This quotation is valid until *{{4}}*. Please log in to your account to accept or enquire further.
```

**Footer:** `VCare Nursing`

**Buttons:** Visit Website — `https://vcarenursing.com/client/quotes`

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

**Buttons:** Visit Website — `https://vcarenursing.com/rate/{{3}}`

> **Note on the rating link button:** WhatsApp allows a static base URL with a dynamic suffix. Set the button URL to `https://vcarenursing.com/rate/` and pass `{{3}}` as the dynamic part (the booking or staff ID) at send time.

**Sample values:** `{{1}}` = `Emily`, `{{2}}` = `Sarah Johnson`, `{{3}}` = `BK-10045`

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
