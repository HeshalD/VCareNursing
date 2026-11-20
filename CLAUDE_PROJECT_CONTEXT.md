# VCare Nursing — Project Context (for a Claude Project)

Generated 2026-11-20 from the graphify knowledge graph (5,161 nodes · 10,734 edges · 246 communities, 372 files) plus repo inspection and working notes.

## 1. What the product is
VCare Nursing is a Sri Lankan home-care / nursing / caregiver staffing business. This is its full-stack platform:
- **Public website**: marketing pages and booking funnels for home nursing, elderly care, patient care, baby/child care, hospital care and staffing, doctor visits, home lab, ambulance, medicine delivery. Also a product catalogue, success stories, a priority membership, public caregiver profiles, and EN/Sinhala (the toggle is currently hidden).
- **Client portal**: clients manage patients, service requests, quotations, bookings, care team, invoices, receipts, statements, wallet, products and reviews.
- **Staff (caregiver) portal**: attendance, wallet and earnings, leave, advances, change requests, document uploads, history. Login uses OTP and devices.
- **Admin dashboard**: about 32 modules covering bookings, service requests, quotes, invoices, payments, finances, staff, internal staff and payroll, WhatsApp inbox, cash register, ledger health, permissions and more. It is permission-guarded.

## 2. Stack and layout
- **Backend** (`backend/`): Node, Express 5, PostgreSQL (`pg`), node-cron, socket.io, JWT with bcrypt, multer with S3 (Cloudinary was removed in June 2026), puppeteer/html-pdf-node/handlebars for PDFs, Twilio/SendGrid/Resend/nodemailer, a Meta WhatsApp Cloud API webhook and inbox, libphonenumber-js.
  - `controllers/` (~55), `routes/` (~50), `services/` (business logic), `cron/`, `middleware/` (`authMiddleware.js` with `protect()` and `requirePermission()`, `registerSession.js`, `uploadMiddleware.js`), `config/permissions.js` (permission keys), `migrate.js` (idempotent migrations, no migrations folder), `templates/` (invoice, receipt, statement HTML), `realtime/`, `scripts/` (seeders, one-off prod fixes).
- **Frontend** (`client/`): React 19, Vite 7, Tailwind 4, react-router 7, react-i18next, tiptap, framer-motion, lucide-react.
  - `src/modules/{admin,auth,client,public,shared}`, `src/api` (the single `ApiClient` class, the top god node with 529 edges), `src/auth`, `src/context`, `src/components/common` (including the reusable `Popup.jsx`), `src/utils`.
- **Deploy**: Docker (`docker-compose.yml` builds locally, `docker-compose.ghcr.yml` pulls GHCR images), AWS EC2 for prod, Vercel config, `render.yaml`. Branches: `Heshal2` is dev, `main` is production, and the GitHub default branch is `Heshal` (a footgun).

## 3. Core domain model (tables in `backend/migrate.js`)
- **People**: `users` (roles are comma-style and parsed, including SUPER_ADMIN), `client_profiles`, `patient_profiles`, `staff_profiles`, `staff_applications`, `internal_staff*`, `salespersons`, recruiters, `walk_in_customers`, `vendors`.
- **Sales funnel**: `service_requests` → `quotations` / `quote_line_items` (modular quote builder) → `payment_slips` → `bookings`. Also `products` and product invoices, and `client_reg_fee_invoices` (registration fee).
- **Bookings**: `bookings`, `booking_staff_assignments`, `staff_swaps`, `booking_pauses`, `service_terminations`, `booking_shift_patterns/slots`, `booking_hospitalizations`, `scheduled_actions`.
- **Money**:
  - Client side: `invoices`, `booking_daily_invoices`, `booking_day_drafts`, `client_payment_records`, `client_payment_allocations`, `payment_receipts`, `payment_edit_log`, `client_wallet_movements`, `overdue_invoices`, `saved_statements`, `booking_amount_corrections`.
  - Staff side: `staff_wallet(_transactions)`, `staff_advances`, `staff_payments_tracking`, `staff_daily_attendance`.
  - Other: `transactions` with categories, `bank_accounts`, `cash_register_sessions/events`, rentals (`rental_units/agreements`), `vendor_bills`, `ledger_health_runs/findings`, `activity_log`.
- **Access control**: `staff_permissions`, `custom_roles`, `custom_role_permissions`, `internal_staff_roles`.
- **Messaging**: `wa_conversations`, `wa_messages`, `system_settings`.
- **Content**: `managed_documents(_versions)`, `success_stories`.

## 4. Business rules to know
- **Booking types**: LIVE_IN, SHIFT_BASED, and VISITING. Billing groups VISITING with SHIFT_BASED, while staff assignment groups it with LIVE_IN. No `isVisiting` flag exists.
- **Rates**: `bookings.daily_rate` (what the client pays) and `booking_staff_assignments.daily_rate` (what staff are paid) are separate.
- **Invoicing modes**: AUTO or MANUAL.
  - A nightly cron (23:59) auto-invoices and pays.
  - SHIFT_BASED/VISITING use per-day staff in/out attendance, then a manual confirm.
  - The cron processes the whole table, so never call its callback against a populated DB.
- **Swaps**: out/in times are captured on swap, assign and reassign (immediate, scheduled or backdated). Gaps are paid Rs.0. Overlaps pay nobody until confirmed. A backdated LIVE_IN swap goes through a step-4 pay calendar. The outgoing staff member can be sent on leave. Swaps once forced bookings to MANUAL, and code now restores AUTO.
- **Pause/resume**: when the last staff member logs out, the booking pauses. It can resume with staff on a past, current or future date. A new SCHEDULED status means "Scheduled to start".
- **Day revoke (LIVE_IN)**: the client side chooses wallet refund, bank refund or write-off. Staff clawback is independent.
- **Amount corrections** update in place with an "Edited" badge (perms BOOKING_CORRECT_AMOUNT, CLIENT_EDIT, INVOICE_EDIT_AMOUNT). Super-admin can edit recorded client payments (void and reissue the receipt, re-open wallet draws).
- **Registration fee**: guard rails, audit, integrity checks and an expiry cron. Duplicates were cleaned from prod on 2026-11-19.
- **Transport charges** are product invoices (`PRODUCT_INVOICE` ledger charge). Custom charges were removed from the quote builders.
- **Ledger health**: a nightly job (01:00) writes findings to `ledger_health_findings`, shown on an admin page.
- **Frontdesk cash register**: a shared daily till with open/close variance. Receipts are stamped through AsyncLocalStorage. There is a FRONTDESK role.
- **Staff reviews**: no `booking_id` linkage. There are rules for rating aggregation and a visibility toggle.
- **Cron schedule**: 23:59 daily invoicing · 00:00 reg-fee expiry · 00:05 staff leave status · 00:15 rental invoicing · 01:00 ledger health · plus scheduled actions.
- **Permissions**: `requirePermission(KEY)` on routes. SUPER_ADMIN bypasses. Custom roles resolve through `custom_role_permissions`, with a cache cleared on edit.
- **Financial breakdown pages** (payments, invoiced, overdue, wallet) must reconcile with the client-page headlines. Shared rules live in `services/clientFinancials.js`.

## 5. Architecture hubs (from the graph)
Most-connected nodes: `ApiClient` (frontend API layer), `formatMobileNumber()`, `AdminLayout()`, `protect()`, `requirePermission()`, `toE164()`, `todayISO()`, `sendTemplate()` (WhatsApp), `DateInput()`, `sendSms()`.

Main clusters:
- Booking conversion and settlement
- Daily invoicing and billing
- Scheduled actions and shift patterns
- Receipts, payment edits and cash register
- Client wallet and ledger
- Staff wallet and payroll
- Quote builder and PDFs
- WhatsApp inbox and webhook
- Permissions
- Booking detail page v2 with the CareTimeline component

## 6. Conventions and gotchas
- Migrations are idempotent code in `migrate.js`, with no migration files. Prod changes are done through reviewed `backend/scripts/` files, and a backup dump is taken first.
- Never run cron callbacks or destructive scripts against prod data casually. Confirm before state-changing prod actions.
- The admin UI is moving to a Zoho-style design. The shared `Popup.jsx` is used for modals, and `DateInput` and `TimeInput` are the standard inputs.
- Phone numbers go through `formatMobileNumber` / `toE164`.
- Sri Lankan context: LKR (Rs.), NIC, honorifics, `sl_cities`.

## 7. Docs to attach alongside this file (highest value first)
1. `graphify-out/GRAPH_REPORT.md`
2. `SHIFT_BASED_BILLING_HANDOFF.md`
3. `PAYMENT_TRACKING_AND_STAFF_ASSIGNMENT.md`
4. `CLIENT_PAYMENT_RECORDING_PLAN.md`
5. `MODULAR_QUOTE_IMPLEMENTATION.md`
6. `PLAN_change_requests_and_activity_log.md`
7. `ADMIN_CLIENT_DETAIL_PAGE_BACKEND_AUDIT.md` and `ADMIN_STAFF_DETAIL_PAGE_BACKEND_AUDIT.md`
8. `BOOKING_ADMIN_DETAIL_PAGE_PLAN.md`
9. `TRANSACTION_CATEGORIES_GUIDE.md`
10. `DEPLOYMENT_GUIDE.md`
11. `VCare_Feature_Guide.pdf`
12. Memory notes from `~/.claude/projects/d--Projects-VCareNursing/memory/`: `admin-actions-reference.md`, `booking-detail-caretimeline-handoff.md`, `care-timeline-design.md`, `daily-attendance-manual-invoicing.md`, `coverage-gap-overlap-handoffs.md`, `booking-rates-client-vs-staff.md`, `frontdesk-cash-register-plan.md`

Skip: `COST_BREAKDOWN.md`, `RENDER_DEPLOYMENT.md`, `CICD_RECOMMENDATIONS.md`, `graph.json` (too large), `sample_documents/`, the CSV backup.
