# Graph Report - VCareNursing  (2026-08-28)

## Corpus Check
- Large corpus: 380 files · ~715,728 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3549 nodes · 6874 edges · 211 communities (187 shown, 24 thin omitted)
- Extraction: 95% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 306 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend API Client (Part 1)
- Bulk Data Import
- Client Dashboard & App Shell
- Staff Controller (Backend)
- Booking Controller (Backend)
- Worker Bookings (Staff Portal)
- Quote Preset Manager
- Scheduled Booking Actions
- Client Controller (Backend)
- Express Server & Route Wiring
- Finances / Balance Sheet
- Product Catalog Page
- Quote Controller (Backend)
- Cloudinary Config (Legacy)
- Booking Detail Page V2
- Daily Attendance Controller
- Proxy Service Request
- Staff Detail Page V2
- Staff Wallet Controller
- Payment Tracking Controller
- Staff Schedule / Pipeline Stepper
- Products Admin Page
- Daily Invoicing Cron
- WhatsApp Templates
- S3 Upload Middleware
- Roles & Permissions
- Internal Staff Salary
- Salesperson Controller
- Auth Controller (Backend)
- Service Request Summary
- Client Bookings
- Rental Controller
- Booking Routes
- Invoice Controller
- Transaction Controller
- Service Request Controller
- Staff Leave Controller
- Staff App Controller
- Staff Review Controller
- Statement Controller
- Transaction Routes
- Package
- Client Payment Controller
- Custom Roles Routes
- Activity Log Routes
- Seed Test Staff
- Proxy User Management
- Financial
- Sales By Customer
- Booking Notes Controller
- Client Detail Page
- Vendor Controller
- Package
- Staff Management
- Seed Admin
- S3 Config
- Receipt Controller
- Transactions Page
- Staff Salaries Page
- PAYMENT TRACKING AND STAFF ASSIGNMENT
- Worker Verification Details Page
- Change Requests Page
- Activity Log Page
- Booking Detail Page
- Internal Staff Page
- Handoff Statements Module
- DEPLOYMENT GUIDE
- Bank Account Controller
- Internal Staff Controller
- Product Controller
- MODULAR QUOTE IMPLEMENTATION
- Admin Dashboard
- Bank Accounts
- Care Timeline
- Patients
- Staff Permissions Page
- Quotation Details
- Quotations
- Client Financial
- Staff Assignment Controller
- Staff Change Request Controller
- Package
- Landing Page
- Staff Detail Page
- Device Controller
- PLAN Change Requests And Activity Log
- Admin Layout
- Patient Details
- Vendors Page
- Client Patients
- Migrate
- Package
- Home Nursing
- Home Nursing
- Admin Invoices Page
- Record Payment Drawer
- Upcoming Events
- Client Service Requests
- Admin Actions Reference
- Patient Controller
- Scheduled Actions Controller
- Receipt Service
- Admin Direct Booking Drawer
- Termination Requests
- User Managemnet
- Staff Detail
- Booking Detail Caretimeline Handoff
- ADMIN STAFF DETAIL PAGE BACKEND AUDIT
- COST BREAKDOWN
- Staff Doc Upload Controller
- Walk In Customer Controller
- Email
- Payables Aging
- Receivables Aging
- Service Requests
- Statements
- Staff Change Request Page
- CLIENT PAYMENT RECORDING PLAN
- Zoho Style Redesign
- Package
- Gemini Generated Image 5nmpua5nmpua5nmp
- Internal Staff Salary Page
- Salesperson Detail Page
- Staff Care Timeline
- Client Products
- Staff Profile
- Transactions Export Template
- Dashboard Controller
- Reg Fee Expiry
- Docker Compose
- Statement Template
- Bookings
- Internal Staff Profile Page
- Profit Loss
- Payment Allocation Modal
- Worker Verifications
- Migrate Phone Numbers To E164
- Finance Periods
- Rental Invoicing
- Package
- README
- Staff Change Request Routes
- Staff Working History
- Record Client Payment Modal
- Leave Requests
- Balance Sheet
- Admin Reviews Page
- Salary Sheet Ledger Page
- Salespersons Page
- Current Earnings Breakdown Page
- Whatsapp
- Bulk Import Routes
- VCare Logo
- Internal Staff Salary Builder
- Reg Fee Drawer
- Total Earnings Breakdown Page
- Patient Routes
- Payment Routes
- Receipt Routes
- Rental Routes
- Staff Assignment Routes
- Walk In Customer Routes
- BOOKING ADMIN DETAIL PAGE PLAN
- Create Product Invoice Drawer
- View Staff Page
- Vercel
- Permissions Routes
- Recruiter Routes
- Salesperson Routes
- Scheduled Actions Routes
- Staff Review Routes
- Statement Routes
- Add Care Profile Drawer
- RENDER DEPLOYMENT
- WHATSAPP TEMPLATES
- Healthcheck
- Index
- SHIFT BASED BILLING HANDOFF
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- Package
- README
- Package
- Package
- Package
- Package
- Package
- Package
- Package

## God Nodes (most connected - your core abstractions)
1. `ApiClient` - 413 edges
2. `logActivity()` - 173 edges
3. `AdminLayout()` - 65 edges
4. `useAuth()` - 49 edges
5. `requirePermission()` - 38 edges
6. `protect()` - 38 edges
7. `DateInput()` - 37 edges
8. `sendTemplate()` - 34 edges
9. `toE164()` - 34 edges
10. `sendSms()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Cloudinary to S3 Storage Migration` --semantically_similar_to--> `ffmpeg Hero Image WebP Optimization`  [INFERRED] [semantically similar]
  DEPLOYMENT_GUIDE.md → .claude/skills/restyle-booking-page.md
- `Staff Soft Deactivate/Reactivate Route` --semantically_similar_to--> `Client Deactivate/Reactivate via users.is_active`  [INFERRED] [semantically similar]
  ADMIN_STAFF_DETAIL_PAGE_BACKEND_AUDIT.md → ADMIN_CLIENT_DETAIL_PAGE_BACKEND_AUDIT.md
- `Atomic Staff Payout Workflow` --semantically_similar_to--> `recordClientPayment Atomic Handler`  [INFERRED] [semantically similar]
  ADMIN_STAFF_DETAIL_PAGE_BACKEND_AUDIT.md → CLIENT_PAYMENT_RECORDING_PLAN.md
- `Docker Deployment Guide` --semantically_similar_to--> `Render Deployment Guide`  [INFERRED] [semantically similar]
  DOCKER_DEPLOYMENT.md → RENDER_DEPLOYMENT.md
- `Manual No-Cron Shift Workflow` --semantically_similar_to--> `Assignment-Driven Daily Invoicing Cron`  [INFERRED] [semantically similar]
  SHIFT_BASED_BILLING_HANDOFF.md → PAYMENT_TRACKING_AND_STAFF_ASSIGNMENT.md

## Import Cycles
- 2-file cycle: `backend/services/scheduledActions.js -> backend/services/shiftPatternService.js -> backend/services/scheduledActions.js`

## Hyperedges (group relationships)
- **Consolidated Admin Detail Endpoint Pattern** — admin_client_detail_page_backend_audit_consolidated_client_detail_endpoint, admin_staff_detail_page_backend_audit_staff_admin_detail_endpoint, booking_admin_detail_page_plan_admin_detail_endpoint [INFERRED 0.85]
- **Activity Logging Audit Flow** — _claude_skills_log_activity_logactivity, _claude_skills_log_activity_activity_log_table, _claude_admin_actions_reference_action_type_taxonomy, _claude_skills_log_activity_non_fatal_logging, client_payment_recording_plan_recordclientpayment [INFERRED 0.85]
- **AWS Production Hosting Stack** — deployment_guide_architecture, deployment_guide_s3_migration, deployment_guide_rds_setup, deployment_guide_ec2_elastic_ip, deployment_guide_certbot_ssl, cost_breakdown_hosting_cost_plan [INFERRED 0.85]
- **Quote to Payment to Assignment to Invoice Money Flow** — modular_quote_implementation_quotations, payment_tracking_and_staff_assignment_paymenttracking, payment_tracking_and_staff_assignment_bookingstaffassignments, payment_tracking_and_staff_assignment_dailyinvoicingcron, transaction_categories_guide_serviceinvoice, transaction_categories_guide_staffsalaryaccrued [INFERRED 0.85]
- **VCareNursing Container Deployment Stack** — docker_compose_postgres, docker_compose_backend, docker_compose_frontend, docker_deployment_dockerdeploymentguide, render_vcarenursingbackend, render_vcarenursingdb, render_deployment_renderdeploymentguide [INFERRED 0.85]
- **Staff Change Request Audit Trail** — plan_change_requests_and_activity_log_staffchangerequests, plan_change_requests_and_activity_log_activitylogger, plan_change_requests_and_activity_log_activitylog, plan_change_requests_and_activity_log_changerequestspage, plan_change_requests_and_activity_log_reviewerlocking, staff_detail_dc_changerequesthistory [INFERRED 0.85]

## Communities (211 total, 24 thin omitted)

### Community 2 - "Bulk Data Import"
Cohesion: 0.06
Nodes (60): bcrypt, commitAdditionalStaffAssignmentRow(), commitBookingRow(), commitClientRow(), commitImport(), commitPatientRow(), commitStaffRow(), computeAdditionalStaffFlags() (+52 more)

### Community 3 - "Client Dashboard & App Shell"
Cohesion: 0.05
Nodes (33): App(), VerifyOTPReg(), ScrollToTop(), ActiveSessionsPage(), FILTERS, AdvanceRequests(), STATUS_CONFIG, STATUS_TABS (+25 more)

### Community 4 - "Staff Controller (Backend)"
Cohesion: 0.04
Nodes (30): _actorRole(), bulkStaffPayouts(), _canAccessStaffRecord(), createStaffAdminNote(), createStaffBankAccount(), createStaffPayout(), { creditRecruiterForStaff }, db (+22 more)

### Community 5 - "Booking Controller (Backend)"
Cohesion: 0.04
Nodes (40): adminDirectBooking(), adminTerminateBooking(), applyWaiveDecision(), bcrypt, cancelShiftReschedule(), { closeActivePatternForPause }, completeBooking(), { computeRegFeeSplit, settleRegistrationFee } (+32 more)

### Community 6 - "Worker Bookings (Staff Portal)"
Cohesion: 0.07
Nodes (37): AuthContext, AuthProvider(), useAuth(), LoginPage(), StaffPasswordChangePage(), ClientProfile(), styles, ClientLayout() (+29 more)

### Community 7 - "Quote Preset Manager"
Cohesion: 0.06
Nodes (31): fmt(), LineItemRow(), PresetItemSelector(), EMPTY_PRESET, formatCurrency(), inputStyle, PresetManager(), token (+23 more)

### Community 8 - "Scheduled Booking Actions"
Cohesion: 0.12
Nodes (50): approveTerminationRequest(), finalizeBookingState(), forceStopBooking(), pauseBooking(), swapStaff(), applyPartialAttendanceTime(), assignStaffToSlot(), createOrChangeShiftPattern() (+42 more)

### Community 9 - "Client Controller (Backend)"
Cohesion: 0.06
Nodes (35): adminUploadRegFeeReceipt(), buildDailyInvoiceHtml(), { creditSalespersonForRegistration }, crypto, dailyInvoiceTemplate, db, deactivateClientProfile(), deleteClientProfile() (+27 more)

### Community 10 - "Express Server & Route Wiring"
Cohesion: 0.04
Nodes (49): activityLogRoutes, allowedOrigins, app, authRoutes, bankAccountRoutes, bookingRoutes, bulkImportRoutes, clientPaymentRoutes (+41 more)

### Community 11 - "Finances / Balance Sheet"
Cohesion: 0.08
Nodes (43): bsGroup(), bsLeaf(), computeBalanceSheet(), computeCashAsOf(), computeIncomeExpenseSeries(), computeProfitLoss(), computeSalesByCustomer(), db (+35 more)

### Community 12 - "Product Catalog Page"
Cohesion: 0.10
Nodes (18): Footer(), Navbar(), RELATIONSHIP_OPTIONS, SERVICE_MODELS, CONTACT_NUMBERS, NEXT_STEPS, CatalogPage(), formatMoney() (+10 more)

### Community 13 - "Quote Controller (Backend)"
Cohesion: 0.10
Nodes (32): buildProductQuotePdfData(), createModularQuotation(), createPresetItem(), createQuotation(), { createRentalAgreementCore, RentalAgreementError }, { createVendorBillCore, applyVendorBillPayment }, db, deletePresetItem() (+24 more)

### Community 14 - "Cloudinary Config (Legacy)"
Cohesion: 0.06
Nodes (34): folderMap, multer, multerS3, { s3, BUCKET }, storage, upload, uploadDocuments, uploadProfilePicture (+26 more)

### Community 15 - "Booking Detail Page V2"
Cohesion: 0.08
Nodes (28): addDays(), addHoursToTime(), bigStatSize(), BookingDetailPageV2(), computeWorkedHours(), EditableRate(), formatDate(), formatDT() (+20 more)

### Community 16 - "Daily Attendance Controller"
Cohesion: 0.09
Nodes (28): confirmDailyInvoice(), applyAttendanceAbsent(), applyAttendanceTime(), applySalaryDecision(), ATTENDANCE_HISTORY_ACTION_TYPES, bcrypt, confirmSalary(), { creditStaffSalary, reverseStaffSalary, reverseServiceInvoice } (+20 more)

### Community 17 - "Proxy Service Request"
Cohesion: 0.08
Nodes (29): todayISO(), PhoneInput(), SearchableCountrySelect(), AddRequestDrawer(), BLANK_FORM, CLIENT_TYPE_OPTIONS, formatDate(), formatDateTime() (+21 more)

### Community 18 - "Staff Detail Page V2"
Cohesion: 0.08
Nodes (21): EditAvatarField(), EditFileField(), EXPERIENCE_LEVEL_LABELS, formatDate(), formatDateTime(), formatMoney(), formatRoles(), getInitials() (+13 more)

### Community 19 - "Staff Wallet Controller"
Cohesion: 0.10
Nodes (31): createStaffDeduction(), approveAdvance(), extractActorRole(), getAllAdvances(), getMyAdvances(), getMyCurrentEarningsBreakdown(), getMyWallet(), getPendingAdvances() (+23 more)

### Community 20 - "Payment Tracking Controller"
Cohesion: 0.12
Nodes (27): extendBooking(), { applyInvoicePayment }, bcrypt, { computeRegFeeSplit, settleRegistrationFee }, { createPaymentReceipt }, { creditClientWallet }, { creditSalespersonForRegistration }, db (+19 more)

### Community 21 - "Staff Schedule / Pipeline Stepper"
Cohesion: 0.09
Nodes (18): PIPELINE_STEPS, RequestPipelineStepper(), conflictsOn(), fmt(), StaffScheduleTimeline(), BookingStaffAssignmentPage(), formatDateForBackend(), formatDateForDisplay() (+10 more)

### Community 22 - "Products Admin Page"
Cohesion: 0.10
Nodes (27): CatalogTab(), CLIENT_TYPES, daysRemaining(), DaysRemainingBadge(), DEPOSIT_STATUS_DOT, DepositsPanel(), emptyDepositLine(), emptyLineItem() (+19 more)

### Community 23 - "Daily Invoicing Cron"
Cohesion: 0.11
Nodes (28): applyInvoiceDecision(), cron, db, { drawWalletForBooking }, flagOverdueBookings(), getActiveBookingBalances(), {
  getBillingCharge,
  creditStaffSalary,
  createServiceInvoice,
  checkAndFlagBookingOverdue
}, TODO: Plug in WhatsApp/SMS admin alert here in Sprint 2 (+20 more)

### Community 24 - "WhatsApp Templates"
Cohesion: 0.11
Nodes (30): requestTermination(), acceptApplication(), axios, NOTE: this template must be created and approved in Meta Business Manager, NOTE: the live template's "View Profile" button is a STATIC URL — it takes no…, sendBookingConfirmed(), sendCandidateProfile(), sendClientBookingStatement() (+22 more)

### Community 25 - "S3 Upload Middleware"
Cohesion: 0.07
Nodes (28): docReportFolderMap, folderMap, multer, multerS3, { s3, BUCKET }, uploadApplicationFiles, uploadDocReportFiles, uploadPaymentReceipt (+20 more)

### Community 26 - "Roles & Permissions"
Cohesion: 0.09
Nodes (21): PERMISSIONS, ROLE_TEMPLATES, VALID_KEYS, create(), db, { invalidateAllPermissionCache }, { logActivity }, remove() (+13 more)

### Community 27 - "Internal Staff Salary"
Cohesion: 0.11
Nodes (20): buildPayslipData(), computeTotals(), createDraftSheet(), db, fetchSheetWithItems(), finalizeSheet(), { generateAndUploadInternalSalaryPdf }, getSalesAttribution() (+12 more)

### Community 28 - "Salesperson Controller"
Cohesion: 0.12
Nodes (21): {
  ClientSalespersonError,
  creditSalespersonForRegistration,
  switchClientSalesperson,
  getClientSalesperson,
}, creditClientHandler(), creditHandler(), db, ERROR_STATUS, extractActorRole(), getBookingSalespersonHandler(), getClientSalespersonHandler() (+13 more)

### Community 29 - "Auth Controller (Backend)"
Cohesion: 0.10
Nodes (19): bcrypt, crypto, db, DEVICE_RESTRICTED_ROLES, jwt, login(), parseRoles(), registerClient() (+11 more)

### Community 30 - "Service Request Summary"
Cohesion: 0.10
Nodes (21): expandProductLineItems(), fmt(), GENDER_OPTIONS, getQuoteStatus(), getRegFeeInfo(), modelLabel(), money(), QUOTE_APPROVAL_CONFIG (+13 more)

### Community 31 - "Client Bookings"
Cohesion: 0.13
Nodes (21): DateInput(), displayToIso(), isoToDisplay(), maskDateInput(), parseDisplayDate(), DateTimeInput(), displayToIso(), isoDateTimeToDisplay() (+13 more)

### Community 32 - "Rental Controller"
Cohesion: 0.13
Nodes (18): acceptProductQuote(), addOneMonth(), createDepositRefundTransaction(), createRentalAgreement(), createRentalAgreementCore(), { createVendorBillCore, applyVendorBillPayment }, db, extractActorRole() (+10 more)

### Community 33 - "Booking Routes"
Cohesion: 0.10
Nodes (23): attachSalesScope(), db, jwt, _parseRoles(), _permCache, requireOwnSalesRecord(), _userHasPermission(), bookingController (+15 more)

### Community 34 - "Invoice Controller"
Cohesion: 0.13
Nodes (21): applyInvoicePayment(), createInvoiceFromQuote(), createLineItemInvoices(), { createPaymentReceipt }, db, { ensureCombinedInvoice }, ensureInvoicePdf(), estimateTemplate (+13 more)

### Community 35 - "Transaction Controller"
Cohesion: 0.12
Nodes (19): buildTransactionFilters(), createManualTransaction(), db, exportTransactionsPdf(), extractActorRole(), { generateTransactionsPdf }, getAllTransactions(), { IN_CATEGORIES, OUT_CATEGORIES, MANUAL_CATEGORIES, flowOf } (+11 more)

### Community 36 - "Service Request Controller"
Cohesion: 0.12
Nodes (14): createServiceRequest(), db, extractActorRole(), formatDate(), formatServiceType(), getActorName(), { logActivity }, sendCandidateProfile() (+6 more)

### Community 37 - "Staff Leave Controller"
Cohesion: 0.15
Nodes (22): approveLeave(), dayCount(), extractActorRole(), fmtDate(), getAllLeaves(), getLeaveConflicts(), getMyLeaves(), getPendingLeaves() (+14 more)

### Community 38 - "Staff App Controller"
Cohesion: 0.13
Nodes (17): bcrypt, { creditRecruiterForStaff }, db, extractActorRole(), getActorName(), jwt, { logActivity }, rejectApplication() (+9 more)

### Community 39 - "Staff Review Controller"
Cohesion: 0.12
Nodes (14): adminCreateReview(), createReview(), db, deleteReview(), fetchReviewableBookingsForClient(), getReviewableBookings(), getReviewableBookingsForClient(), getStaffProfileByClientProfileId() (+6 more)

### Community 40 - "Statement Controller"
Cohesion: 0.15
Nodes (19): buildStatementPayload(), db, deleteStatement(), downloadClientStatement(), { generateStatementPDF }, getActorName(), getClientStatement(), { logActivity } (+11 more)

### Community 41 - "Transaction Routes"
Cohesion: 0.09
Nodes (18): protect(), ctrl, express, { protect, requirePermission }, router, ctrl, express, { protect, requirePermission } (+10 more)

### Community 42 - "Package"
Cohesion: 0.10
Nodes (21): autoprefixer, devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+13 more)

### Community 43 - "Client Payment Controller"
Cohesion: 0.13
Nodes (16): { createPaymentReceipt }, { creditClientWallet }, db, extractActorRole(), { logActivity }, recordClientPayment(), { resolveBankAccountId }, VALID_PAYMENT_METHODS (+8 more)

### Community 44 - "Custom Roles Routes"
Cohesion: 0.10
Nodes (17): requirePermission(), ctrl, express, { protect, requirePermission }, router, express, { getDashboardOverview }, { protect, restrictTo, requirePermission } (+9 more)

### Community 45 - "Activity Log Routes"
Cohesion: 0.10
Nodes (17): restrictTo(), ctrl, express, { protect, restrictTo, requirePermission }, router, authController, express, { protect, restrictTo, requirePermission } (+9 more)

### Community 46 - "Seed Test Staff"
Cohesion: 0.16
Nodes (20): bcrypt, createStaffMember(), db, DESIGNATIONS, EXPERIENCE_LEVELS, FIRST_NAMES, GENDERS, getNextStaffCodeStart() (+12 more)

### Community 47 - "Proxy User Management"
Cohesion: 0.14
Nodes (11): LanguageMultiSelect(), isLikelyYoutubeUrl(), YoutubeLinksField(), DEFAULT_LANGUAGES, LANGUAGES, EXP_LABELS, formatRoles(), inputCls() (+3 more)

### Community 48 - "Financial"
Cohesion: 0.16
Nodes (16): CATEGORY_CONFIG, categoryBadge(), flowAmountClass(), flowOf(), flowSign(), IN_CATEGORIES, OUT_CATEGORIES, CATEGORY_HEX (+8 more)

### Community 49 - "Sales By Customer"
Cohesion: 0.18
Nodes (18): addDays(), buildPresets(), csvEscape(), endOfMonth(), endOfQuarter(), endOfWeek(), endOfYear(), formatDate() (+10 more)

### Community 50 - "Booking Notes Controller"
Cohesion: 0.20
Nodes (17): addClientNote(), addNote(), db, deleteClientNote(), deleteNote(), extractActorRole(), getActorName(), { logActivity } (+9 more)

### Community 51 - "Client Detail Page"
Cohesion: 0.13
Nodes (11): ForfeitDepositModal(), RefundDepositModal(), addDays(), ClientDetailPage(), expandProductLineItems(), formatDate(), formatDateTime(), formatMoney() (+3 more)

### Community 52 - "Vendor Controller"
Cohesion: 0.16
Nodes (14): createVendor(), createVendorBill(), db, deactivateVendor(), extractActorRole(), { logActivity }, recordVendorBillPayment(), { resolveBankAccountId } (+6 more)

### Community 53 - "Package"
Cohesion: 0.11
Nodes (19): dependencies, framer-motion, i18next, jszip, react, react-dom, react-i18next, react-phone-number-input (+11 more)

### Community 54 - "Staff Management"
Cohesion: 0.16
Nodes (11): useDebouncedValue(), BookingSwitcherSidebar(), STATUS_META, ClientSwitcherSidebar(), formatRoles(), parseRoles(), ROLE_LABELS, StaffManagement() (+3 more)

### Community 55 - "Seed Admin"
Cohesion: 0.11
Nodes (7): { Pool }, db, db, db, ADMIN, bcrypt, db

### Community 56 - "S3 Config"
Cohesion: 0.16
Nodes (13): publicUrl(), s3, { S3Client, PutObjectCommand }, uploadBufferToS3(), ensureRegFeeInvoiceRecord(), generateAndUploadRegFeeInvoice(), html_to_pdf, regFeeInvoiceTemplate (+5 more)

### Community 57 - "Receipt Controller"
Cohesion: 0.15
Nodes (13): db, { ensureCombinedInvoice }, extractActorRole(), fmtAmt(), fmtDate(), { generateReceiptPdf }, getActorName(), { logActivity } (+5 more)

### Community 58 - "Transactions Page"
Cohesion: 0.16
Nodes (15): relatedTo(), AddTransactionModal(), FIXED_OPTIONS, PAYMENT_METHODS, todayStr(), COMPANY_ADDRESS_LINES, DATE_PRESETS, fmt() (+7 more)

### Community 59 - "Staff Salaries Page"
Cohesion: 0.16
Nodes (13): BreakdownModal(), BulkPayModal(), categorize(), fmt(), fmtDate(), METHOD_LABELS, money, MONTH_NAMES (+5 more)

### Community 60 - "PAYMENT TRACKING AND STAFF ASSIGNMENT"
Cohesion: 0.13
Nodes (17): Bookings API (/api/bookings), Daily Invoicing Cron Job, POST /api/bookings/:booking_id/assign-staff, booking_staff_assignments table, Assignment-Driven Daily Invoicing Cron, updateStaffEarnings (current_earnings accrual), Three-Step Quote/Pay/Assign Process, GET /shift-schedule (derived occurrences) (+9 more)

### Community 61 - "Worker Verification Details Page"
Cohesion: 0.16
Nodes (10): createImage(), getCroppedImageFile(), ImageCropModal(), EXPERIENCE_LEVELS, experienceLevelLabel(), formatDate(), GENDERS, parseRoles() (+2 more)

### Community 62 - "Change Requests Page"
Cohesion: 0.16
Nodes (11): AdminAuthContext, AdminAuthProvider(), parseRoles(), useAdminAuth(), AdminLoginPage(), ChangeRequestsPage(), fmt(), LOG_ACTION_CONFIG (+3 more)

### Community 63 - "Activity Log Page"
Cohesion: 0.18
Nodes (12): useAutoRefresh(), ACTION_TYPE_OPTIONS, ActivityLogPage(), dotForAction(), fmt(), ROLE_DOT, ClientPaymentsLedgerPage(), fmt() (+4 more)

### Community 64 - "Booking Detail Page"
Cohesion: 0.16
Nodes (11): addDays(), BookingDetailPage(), formatDate(), formatDateTime(), formatMoney(), initialPaymentForm, moneyFormatter, NURSE_COLOR_PALETTE (+3 more)

### Community 65 - "Internal Staff Page"
Cohesion: 0.16
Nodes (13): deviceStatusColor(), empty, genPassword(), InternalStaffPage(), isSalesRole(), LOGIN_ROLES, money(), needsLoginAccount() (+5 more)

### Community 66 - "Handoff Statements Module"
Cohesion: 0.16
Nodes (16): buildStatementPayload Dual Representation, fetchForClient Lazy Per-Client Fetch, getClientStatement GET Endpoint, txVisible Load-More Pagination, normalizeDateRange All-Time Default, pdfData.ledger Handlebars Shape, statementLines JSON Ledger Shape, Admin Client Detail Backend Audit (+8 more)

### Community 67 - "DEPLOYMENT GUIDE"
Cohesion: 0.16
Nodes (16): saved_statements History Table, Statements Module, add-entity-code Skill, Human-Readable Entity Code Pattern, Idempotent Code-Column Migration, Separate-Step DB Migration Strategy, Post-Deploy Observability and Rollback, Recommended CI/CD Pipeline (+8 more)

### Community 68 - "Bank Account Controller"
Cohesion: 0.19
Nodes (11): createBankAccount(), db, deactivateBankAccount(), extractActorRole(), extractActorUserId(), { logActivity }, { MANUAL_CATEGORIES, flowOf }, recordPettyCashTransaction() (+3 more)

### Community 69 - "Internal Staff Controller"
Cohesion: 0.19
Nodes (13): bcrypt, create(), db, { invalidatePermissionCache }, { logActivity }, LOGIN_ROLES, normalizeRoles(), remove() (+5 more)

### Community 70 - "Product Controller"
Cohesion: 0.19
Nodes (9): createProduct(), db, deactivateProduct(), extractActorRole(), { logActivity }, normalizeProductType(), PRODUCT_TYPES, safeLog() (+1 more)

### Community 71 - "MODULAR QUOTE IMPLEMENTATION"
Cohesion: 0.14
Nodes (16): Quotations API (/api/quotes), Legacy Rate Column Backwards Compatibility, createModularQuotation, Negative-Amount Discount Convention, getPresetItems, getQuoteWithLineItems, Modular Quote Building System, PresetItemSelector component (+8 more)

### Community 72 - "Admin Dashboard"
Cohesion: 0.17
Nodes (13): AdminDashboard(), AgingCard(), BankAccountsCard(), CASH_FLOW_PERIODS, CashFlowCard(), CashFlowStat(), DONUT_COLORS, fmt() (+5 more)

### Community 73 - "Bank Accounts"
Cohesion: 0.17
Nodes (11): BankAccounts(), csvEscape(), formatMoney(), initialFormState, initialPettyCashForm, initialTransferForm, MANUAL_CATEGORIES, monthOptions() (+3 more)

### Community 74 - "Care Timeline"
Cohesion: 0.18
Nodes (15): BAR_COLOR, buildCellBackground(), CareTimeline(), DOW_LABELS, EVENT_CFG, fmtFull(), fmtShort(), META_COLOR (+7 more)

### Community 75 - "Patients"
Cohesion: 0.18
Nodes (11): BulkDeleteModal(), ClientCombobox(), ClientRow(), DeleteModal(), EMPTY_FORM, fmt(), GENDER_OPTIONS, genderLabel() (+3 more)

### Community 76 - "Staff Permissions Page"
Cohesion: 0.17
Nodes (9): CustomRolesPage(), emptyForm, PermissionModuleList(), fixedRoleColor(), fixedRoleLabel(), getUserRoles(), ROLE_LABELS, roleDisplayLabel() (+1 more)

### Community 77 - "Quotation Details"
Cohesion: 0.17
Nodes (10): InvoiceSendPopup(), BUCKET_STYLES, expandProductLineItems(), getRegFeeInfo(), getStatus(), money(), PAYMENT_RECORD_STATUS_CONFIG, PAYMENT_STATUS_CONFIG (+2 more)

### Community 78 - "Quotations"
Cohesion: 0.17
Nodes (11): expandProductLineItems(), getPaymentStatus(), getRegFeeInfo(), INVOICE_STATUS_FILTERS, money(), PAYMENT_RECORD_STATUS_CONFIG, PAYMENT_STATUS_CONFIG, PAYMENT_STATUS_FILTERS (+3 more)

### Community 79 - "Client Financial"
Cohesion: 0.14
Nodes (7): ClientFinancial(), formatCurrency(), formatDate(), METHOD_META, s, STATUS_META, TX_META

### Community 80 - "Staff Assignment Controller"
Cohesion: 0.17
Nodes (12): canAccessStaffRecord(), completeAssignment(), { creditSalespersonForBooking }, db, extractActorRole(), formatTimeLabel(), { getBusinessDate, toDateStr, isFutureDate, enqueueScheduledAction, hasOpenAction }, getStaffAssignmentBookings() (+4 more)

### Community 81 - "Staff Change Request Controller"
Cohesion: 0.20
Nodes (12): ALLOWED_PROFILE_FIELDS, applyChanges(), BANK_EDITABLE_FIELDS, claimChangeRequest(), db, extractActorRole(), getMyChangeRequests(), getReviewerName() (+4 more)

### Community 82 - "Package"
Cohesion: 0.13
Nodes (15): dependencies, bcrypt, bcryptjs, express, node-cron, puppeteer, twilio, xlsx (+7 more)

### Community 83 - "Landing Page"
Cohesion: 0.17
Nodes (7): Popup(), VARIANTS, ReviewSection(), isStaffUser(), LandingPage(), normalizeRoles(), STAFF_ROLES

### Community 84 - "Staff Detail Page"
Cohesion: 0.18
Nodes (8): EXPERIENCE_LEVELS, formatDate(), formatDateTime(), formatMoney(), moneyFormatter, safeArray(), StaffDetailPage(), statusTone()

### Community 85 - "Device Controller"
Cohesion: 0.15
Nodes (9): assign(), bcrypt, crypto, db, DEVICE_RESTRICTED_ROLES, forceLogout(), generateActivationCode(), { logActivity } (+1 more)

### Community 86 - "PLAN Change Requests And Activity Log"
Cohesion: 0.14
Nodes (14): Admin Module, Route Structure, activity_log table, logActivity helper, ActivityLogPage (admin), ChangeRequestsPage (admin), internal_staff tables, JSONB requested_changes Diff Store (+6 more)

### Community 87 - "Admin Layout"
Cohesion: 0.19
Nodes (8): AdminLayout(), EXTRA_ROUTE_PERMISSIONS, findRouteRule(), NAV_SECTIONS, parseToken(), ROLE_LABELS, REPORTS, Settings()

### Community 88 - "Patient Details"
Cohesion: 0.18
Nodes (6): fmt(), fmtMoney(), GENDER_OPTIONS, genderLabel(), money, PatientDetailPage()

### Community 89 - "Vendors Page"
Cohesion: 0.18
Nodes (10): BILL_STATUS_CONFIG, formatDate(), formatMoney(), initialBillForm, initialVendorForm, PAYMENT_METHODS, PayVendorBillModal(), VENDOR_TYPE_BADGE (+2 more)

### Community 90 - "Client Patients"
Cohesion: 0.15
Nodes (6): ClientPatients(), FORM_EMPTY, GENDER_BADGE, RELATIONSHIP_OPTIONS, s, serializeEmergencyContacts()

### Community 91 - "Migrate"
Cohesion: 0.22
Nodes (11): bcrypt, db, migrate(), runMigration(), seedDefaultAdminUser(), seedPettyCashAccount(), seedQuotePresetItems(), wait() (+3 more)

### Community 92 - "Package"
Cohesion: 0.15
Nodes (12): author, bugs, url, description, homepage, license, main, name (+4 more)

### Community 93 - "Home Nursing"
Cohesion: 0.21
Nodes (13): Abstract Seamless Geometric Line Pattern, Low Contrast Section Backdrop, Seamless Tiling Texture, Stock Asset Provenance From ID Filename, Uniformed Nurse Caregiver Persona, Elderly Wheelchair Patient Care, Home Nursing Service, HomeNursing Marketing Photo (+5 more)

### Community 94 - "Home Nursing"
Cohesion: 0.22
Nodes (13): Baby Care Service, Flat Vector Illustration Style (transparent background), Baby Care Illustration (baby_care.webp), Professional Baby Caretaker / Newborn Care, Baby Caretaker Landing Page Photo (baby_caretakers_image_landingpage.webp), Landing Page Hero Marketing Imagery, Elderly Care Service, Elderly Care Illustration (eldery_care.webp) (+5 more)

### Community 95 - "Admin Invoices Page"
Cohesion: 0.18
Nodes (10): AdminInvoicesPage(), formatDate(), formatMoney(), MEMBERSHIP_STATUS_CONFIG, money, PRODUCT_INVOICE_STATUS_CONFIG, REG_FEE_STATUS_CONFIG, STATUS_CONFIG (+2 more)

### Community 96 - "Record Payment Drawer"
Cohesion: 0.23
Nodes (11): ReceiptSendPopup(), AllocationRow(), createRow(), fmt(), getQuoteStatus(), money, PAYMENT_METHODS, QuotationPayRow() (+3 more)

### Community 97 - "Upcoming Events"
Cohesion: 0.18
Nodes (7): ACTION_TYPE_CONFIG, BUCKET_CONFIG, fmt(), formatMoney(), NEEDS_ACTION_SOURCES, UpcomingEvents(), URGENCY_CONFIG

### Community 98 - "Client Service Requests"
Cohesion: 0.21
Nodes (10): ClientServiceRequests(), formatCurrency(), formatDate(), s, STATUS_ICONS, STATUS_META, TimelineItem(), TYPE_DOT (+2 more)

### Community 99 - "Admin Actions Reference"
Cohesion: 0.20
Nodes (12): Activity Log Action Type Taxonomy, Admin Dashboard Action Catalog, Change Requests Workflow, Admin Client Detail Page Module, CLIENT_PAYMENT_RECORDED Action, Admin Staff Detail Page Module, Admin Statements Page Module, log-activity Skill (+4 more)

### Community 100 - "Patient Controller"
Cohesion: 0.26
Nodes (7): createPatientProfile(), db, deletePatientProfile(), extractActorRole(), getActorName(), { logActivity }, updatePatientProfile()

### Community 101 - "Scheduled Actions Controller"
Cohesion: 0.23
Nodes (10): bucketForDate(), cancelScheduledAction(), db, { dispatchScheduledAction }, executeScheduledActionNow(), extractActorRole(), getActorName(), getUpcomingEvents() (+2 more)

### Community 102 - "Receipt Service"
Cohesion: 0.24
Nodes (9): buildTemplateData(), createPaymentReceipt(), db, { generateAndUploadReceipt }, generateReceiptPdf(), generateAndUploadReceipt(), html_to_pdf, paymentReceiptTemplate (+1 more)

### Community 103 - "Admin Direct Booking Drawer"
Cohesion: 0.20
Nodes (8): AdminDirectBookingDrawer(), GENDER_PREFS, GENDERS, inputCls(), RELATIONSHIPS, serializeEmergencyContacts(), SERVICE_MODELS, SERVICE_TYPES

### Community 104 - "Termination Requests"
Cohesion: 0.21
Nodes (8): fmt(), fmtDt(), formatMoney(), STATUS_CONFIG, TAB_TO_URGENCY, TerminationRequests(), URGENCY_CONFIG, URGENCY_TABS

### Community 105 - "User Managemnet"
Cohesion: 0.18
Nodes (8): BLANK_FORM, CLIENT_TYPES, ClientManagement(), HONORIFICS, inputCls(), REG_TABS, STATUS_CONFIG, TAB_TO_STATUS

### Community 106 - "Staff Detail"
Cohesion: 0.17
Nodes (12): Bank Account Reconciliation Report, bank_accounts table, Partial Payment Tracking, payment_tracking table, CareTimeline shift rendering, naturalEndDayNum Bounding Rule, Shift Bank Panel (authoritative ledger), Month-by-Month Care Timeline (+4 more)

### Community 107 - "Booking Detail Caretimeline Handoff"
Cohesion: 0.24
Nodes (11): Admin Booking Detail Page Module, Staff Swap Admin Action, Allocation History Colour-Coded Cards, BookingDetailPage Warm-White Redesign, CareTimeline Week Grid Component, getNurseForDay Latest-Start Match, normalizedStaffHistory Colour-Key Normalization, Booking Overrun Day Handling (+3 more)

### Community 108 - "ADMIN STAFF DETAIL PAGE BACKEND AUDIT"
Cohesion: 0.18
Nodes (11): Termination Approval with Settlement Action, assigned_staff_id vs booking_staff_assignments Gap, Admin Staff Detail Backend Route Audit, Staff Earnings Summary Endpoint, staff_bank_accounts Table, Staff Soft Deactivate/Reactivate Route, staff_payments_tracking Table, Atomic Staff Payout Workflow (+3 more)

### Community 109 - "COST BREAKDOWN"
Cohesion: 0.22
Nodes (11): Puppeteer PDF Generation Cost, Phase 1 Free Tier (Months 1-12), AWS Hosting Cost Plan, ap-south-1 Mumbai Region Choice, Phase 2 Paid Production Configuration, 1-Year Reserved Pricing Option, Two-Nginx Production Architecture, Host Nginx + Certbot SSL Termination (+3 more)

### Community 110 - "Staff Doc Upload Controller"
Cohesion: 0.25
Nodes (7): db, extractActorRole(), getActorName(), { logActivity }, sendDocumentRequest(), sendDocumentRequestByStaffId(), { sendDocumentUploadRequest }

### Community 111 - "Walk In Customer Controller"
Cohesion: 0.22
Nodes (9): bcrypt, createWalkInCustomer(), db, extractActorRole(), { logActivity }, safeLog(), { sendClientWelcomeNew }, { sendSms } (+1 more)

### Community 112 - "Email"
Cohesion: 0.22
Nodes (6): nodemailer, sendEmail(), sendResendEmail, sendSendGridEmail, { Resend }, sgMail

### Community 113 - "Payables Aging"
Cohesion: 0.25
Nodes (8): buildBucketDefs(), csvEscape(), formatDate(), formatMoney(), INTERVAL_COUNT_OPTIONS, INTERVAL_DAY_OPTIONS, money, PayablesAging()

### Community 114 - "Receivables Aging"
Cohesion: 0.25
Nodes (8): buildBucketDefs(), csvEscape(), formatDate(), formatMoney(), INTERVAL_COUNT_OPTIONS, INTERVAL_DAY_OPTIONS, money, ReceivablesAging()

### Community 115 - "Service Requests"
Cohesion: 0.24
Nodes (8): BOOKING_STATUS_CONFIG, formatDate(), formatDateTime(), getStageAction(), ServiceRequests(), STATUS_CONFIG, STATUS_TABS, TAB_TO_STATUS

### Community 116 - "Statements"
Cohesion: 0.31
Nodes (10): BOOKING_BULK_CFG, BulkBookingModal(), BulkHistoryModal(), fmt(), fmtDate(), getServiceIcon(), getStatusBadge(), HISTORY_BULK_CFG (+2 more)

### Community 117 - "Staff Change Request Page"
Cohesion: 0.20
Nodes (8): formatFieldValue(), GENDER_OPTIONS, PROFILE_FIELD_LABEL_KEYS, PROFILE_FIELD_META, REQUEST_TYPE_META, RequestDetails(), StaffChangeRequestPage(), STATUS_META

### Community 118 - "CLIENT PAYMENT RECORDING PLAN"
Cohesion: 0.24
Nodes (10): activity_log Table Schema, Automatic Actor Name Resolution, logActivity Utility, Non-Fatal Activity Logging Rule, Allocation Sum Validation Rules, client_payment_allocations Table, client_payment_records Table, Client Payment Recording Plan (+2 more)

### Community 119 - "Zoho Style Redesign"
Cohesion: 0.22
Nodes (10): Fixed Full-Page Background + Overlay Pattern, restyle-booking-page Skill, Service Type / Model Selection Cards, ffmpeg Hero Image WebP Optimization, Zoho Books Design Philosophy, Zoho Design Token Table, Pill-Tab Filters with Inline Counts, Right-Hand Slide-Over Drawer Form (+2 more)

### Community 120 - "Package"
Cohesion: 0.20
Nodes (9): name, private, scripts, build, dev, lint, preview, type (+1 more)

### Community 121 - "Gemini Generated Image 5nmpua5nmpua5nmp"
Cohesion: 0.24
Nodes (10): Baby Care Service, BabyCare.webp - Caregiver and Infant Photo, Service Marketing Imagery, Companionship and Emotional Support, Elderly Care Service, ElderlyCare.webp - Held Hands Close-Up Photo, AI-Generated Image Asset, Bedside Patient Care (+2 more)

### Community 122 - "Internal Staff Salary Page"
Cohesion: 0.24
Nodes (6): InternalStaffSalaryPage(), money(), monthLabel(), SHEET_STATUS_CONFIG, STATUS_LABELS, STATUS_TABS

### Community 123 - "Salesperson Detail Page"
Cohesion: 0.29
Nodes (6): compactMoney(), formatDate(), formatDateTime(), money(), SalespersonDetailPage(), STATUS_DOT

### Community 124 - "Staff Care Timeline"
Cohesion: 0.31
Nodes (9): BOOKING_COLORS, fmtFull(), fmtShort(), fmtTime(), moneyFmt(), StaffCareTimeline(), STATUS_META, toLocalISO() (+1 more)

### Community 125 - "Client Products"
Cohesion: 0.38
Nodes (9): badgeClass(), ClientProducts(), daysUntil(), formatDate(), formatMoney(), money, PurchaseCard(), RentalCard() (+1 more)

### Community 126 - "Staff Profile"
Cohesion: 0.22
Nodes (4): getYoutubeId(), StaffProfile(), STATUS_STYLE, statusStyle

### Community 127 - "Transactions Export Template"
Cohesion: 0.22
Nodes (3): CATEGORY_LABELS, { COMPANY_NAME, COMPANY_ADDRESS_LINES, COMPANY_LOGO_URL }, FILTER_LABELS

### Community 128 - "Dashboard Controller"
Cohesion: 0.25
Nodes (8): ACTIVE_BOOKING_STATUSES, CATEGORY_LABELS, db, getDashboardOverview(), OPEN_REQUEST_STATUSES_EXCLUDED, pctChange(), REVENUE_CATEGORIES, SERVICE_TYPE_FILTERS

### Community 129 - "Reg Fee Expiry"
Cohesion: 0.25
Nodes (7): cron, db, { logActivity }, runRegFeeExpiry(), startRegFeeExpiry(), db, resolveActorName()

### Community 130 - "Docker Compose"
Cohesion: 0.28
Nodes (9): Backend Technology Stack, backend service (vcarenursing-backend), frontend service (vcarenursing-frontend), postgres service (vcarenursing-db), postgres_data volume, vcarenursing-network bridge, PostgreSQL Volume Backup Procedure, Docker Deployment Guide (+1 more)

### Community 131 - "Statement Template"
Cohesion: 0.22
Nodes (9): Account Summary block, Ledger each-loop (running balance), Statement of Accounts PDF Template, Payment Method Taxonomy (BANK_TRANSFER / CASH_DEPOSIT / CASH / CHEQUE), Payout History & Record a Payout, Money In flow, Money Out flow, Transaction Category Guide (+1 more)

### Community 132 - "Bookings"
Cohesion: 0.25
Nodes (6): BOOKING_TYPE_LABEL, Bookings(), formatTime(), STATUS_CONFIG, STATUS_TABS, TYPE_TABS

### Community 133 - "Internal Staff Profile Page"
Cohesion: 0.31
Nodes (6): currentMonth(), InternalStaffProfilePage(), money(), monthLabel(), SHEET_STATUS_CONFIG, STATUS_CONFIG

### Community 134 - "Profit Loss"
Cohesion: 0.31
Nodes (7): csvEscape(), formatDate(), formatMoney(), MODES, money, ProfitLoss(), ROWS

### Community 135 - "Payment Allocation Modal"
Cohesion: 0.33
Nodes (7): BUCKET_META, BucketRow(), getRegFeeInfo(), money(), PaymentAllocationModal(), paymentMethodOptions, productLineItemsTotal()

### Community 136 - "Worker Verifications"
Cohesion: 0.31
Nodes (6): docStatus(), formatRoles(), parseRoles(), ROLE_LABELS, STATUS_TABS, WorkerVerification()

### Community 137 - "Migrate Phone Numbers To E164"
Cohesion: 0.32
Nodes (7): verifyOtp(), db, main(), migrateTarget(), TARGETS, { toE164 }, toE164()

### Community 138 - "Finance Periods"
Cohesion: 0.32
Nodes (7): getTopExpenses(), buildMonths(), CASH_FLOW_PERIODS, INCOME_EXPENSE_PERIODS, monthLabel(), resolvePeriodRange(), TOP_EXPENSES_PERIODS

### Community 139 - "Rental Invoicing"
Cohesion: 0.39
Nodes (7): addOneMonth(), cron, db, flagOverdueInvoices(), periodEndFor(), runRentalInvoicing(), startRentalInvoicing()

### Community 140 - "Package"
Cohesion: 0.25
Nodes (8): scripts, deploy, dev, migrate, seed:admin, seed:test-staff, start, test

### Community 141 - "README"
Cohesion: 0.29
Nodes (8): Authentication API (/api/auth), VCareNursing Backend API, Statements API (/api/statement), Vite SPA root shell, ApiClient (/api/api.js), AuthContext / AdminAuthContext, VCareNursing Client Application, Migrated Schema Overview & Enums

### Community 142 - "Staff Change Request Routes"
Cohesion: 0.25
Nodes (7): ctrl, express, INTERNAL_ROLES, { protect, restrictTo, requirePermission }, NOTE: resolveChangeRequest handles both approve and reject via body.action — a…, router, STAFF_ROLES

### Community 143 - "Staff Working History"
Cohesion: 0.39
Nodes (5): calcDays(), formatCurrency(), formatDate(), getTenure(), StaffWorkingHistory()

### Community 144 - "Record Client Payment Modal"
Cohesion: 0.36
Nodes (7): AllocationRow(), createRow(), fmt(), money, PAYMENT_METHODS, RecordClientPaymentModal(), SERVICE_MODELS

### Community 145 - "Leave Requests"
Cohesion: 0.32
Nodes (6): dayCount(), fmt(), LeaveRequests(), STATUS_CONFIG, STATUS_TABS, TAB_TO_STATUS

### Community 146 - "Balance Sheet"
Cohesion: 0.39
Nodes (6): BalanceSheet(), csvEscape(), flattenNode(), formatDate(), formatMoney(), money

### Community 147 - "Admin Reviews Page"
Cohesion: 0.32
Nodes (4): AddReviewModal(), AdminReviewsPage(), AllReviewsTab(), fmt()

### Community 148 - "Salary Sheet Ledger Page"
Cohesion: 0.39
Nodes (7): fmt(), fmtDate(), fmtDateTime(), METHOD_LABELS, money, monthLabel(), SalarySheetLedgerPage()

### Community 149 - "Salespersons Page"
Cohesion: 0.32
Nodes (5): compactMoney(), money(), SalespersonsPage(), STATUS_CONFIG, TINTS

### Community 150 - "Current Earnings Breakdown Page"
Cohesion: 0.43
Nodes (6): CurrentEarningsBreakdownPage(), formatDate(), formatDateTime(), formatMoney(), LedgerRow(), moneyFormatter

### Community 151 - "Whatsapp"
Cohesion: 0.29
Nodes (5): createStaffProfile(), client, sendWhatsAppMessage(), { toMessagingDigits }, twilio

### Community 152 - "Bulk Import Routes"
Cohesion: 0.29
Nodes (6): ctrl, express, multer, { protect, restrictTo, requirePermission }, router, upload

### Community 153 - "VCare Logo"
Cohesion: 0.48
Nodes (7): Favicon (VCare Nursing Logo), Vite Logo (SVG), Vite React Scaffold Default Asset, Home-Based Nursing Care (House + Heart Motif), VCare Nursing Brand Identity, VCare Nursing Primary Logo, React Logo (SVG)

### Community 154 - "Internal Staff Salary Builder"
Cohesion: 0.43
Nodes (4): InternalStaffSalaryBuilder(), LineItemRow(), money(), monthLabel()

### Community 155 - "Reg Fee Drawer"
Cohesion: 0.38
Nodes (5): fmt(), fmtDate(), money, RegFeeDrawer(), STATUS_META

### Community 156 - "Total Earnings Breakdown Page"
Cohesion: 0.43
Nodes (5): BookingRow(), formatDate(), formatMoney(), moneyFormatter, TotalEarningsBreakdownPage()

### Community 157 - "Patient Routes"
Cohesion: 0.33
Nodes (5): express, patientController, { protect, restrictTo, requirePermission }, NOTE: shared with CLIENT self-service — deliberately NOT gated by…, router

### Community 158 - "Payment Routes"
Cohesion: 0.33
Nodes (5): express, paymentController, paymentTrackingController, { protect, restrictTo, requirePermission }, router

### Community 159 - "Receipt Routes"
Cohesion: 0.33
Nodes (5): adminRoles, express, { protect, restrictTo, requirePermission }, receiptController, router

### Community 160 - "Rental Routes"
Cohesion: 0.33
Nodes (5): ADMIN_ROLES, express, { protect, restrictTo, requirePermission }, rentalController, router

### Community 161 - "Staff Assignment Routes"
Cohesion: 0.33
Nodes (5): express, { protect, restrictTo, requirePermission }, NOTE: shared with staff self-service (a nurse/caretaker viewing their own…, router, staffAssignmentController

### Community 162 - "Walk In Customer Routes"
Cohesion: 0.33
Nodes (5): ADMIN_ROLES, express, { protect, restrictTo, requirePermission }, router, walkInCustomerController

### Community 163 - "BOOKING ADMIN DETAIL PAGE PLAN"
Cohesion: 0.47
Nodes (6): auto_complete_when_paid Flag (Deferred), dailyInvoicing Cron SERVICE_INVOICE Flow, Booking Invoice Breakdown Endpoint, Admin Booking Detail Page Plan, Staff Allocation History Endpoint, Booking-Scoped Termination History Endpoint

### Community 164 - "Create Product Invoice Drawer"
Cohesion: 0.53
Nodes (5): CreateProductInvoiceDrawer(), emptyDepositLine(), emptyLine(), formatMoney(), PAYMENT_METHODS

### Community 165 - "View Staff Page"
Cohesion: 0.33
Nodes (4): SPECIALTIES, StaffDirectory(), STATUSES, statusStyle

### Community 166 - "Vercel"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, outputDirectory, rewrites

### Community 167 - "Permissions Routes"
Cohesion: 0.40
Nodes (4): express, permissionsController, { protect, requirePermission }, router

### Community 168 - "Recruiter Routes"
Cohesion: 0.40
Nodes (4): ctrl, express, { protect, restrictTo, requirePermission }, router

### Community 169 - "Salesperson Routes"
Cohesion: 0.40
Nodes (4): ctrl, express, { protect, restrictTo, requirePermission }, router

### Community 170 - "Scheduled Actions Routes"
Cohesion: 0.40
Nodes (4): express, { protect, restrictTo, requirePermission }, router, scheduledActionsController

### Community 171 - "Staff Review Routes"
Cohesion: 0.40
Nodes (4): express, { protect, restrictTo, requirePermission }, router, staffReviewController

### Community 172 - "Statement Routes"
Cohesion: 0.40
Nodes (4): express, { protect, restrictTo, requirePermission }, router, statementController

### Community 173 - "Add Care Profile Drawer"
Cohesion: 0.50
Nodes (4): AddCareProfileDrawer(), emptyForm, PATIENT_RELATIONSHIP_OPTIONS, serializeEmergencyContacts()

### Community 174 - "RENDER DEPLOYMENT"
Cohesion: 0.50
Nodes (5): Backend Health Check (GET /api/auth), Render Health Check Path, Render Deployment Guide, Render web service vcarenursing-backend, Render database vcarenursing-db

### Community 175 - "WHATSAPP TEMPLATES"
Cohesion: 0.40
Nodes (5): Authentication (OTP) Templates, Meta Template Naming & Approval Rules, Utility Templates, vcare_client_welcome_new template, WhatsApp Template Specifications

### Community 176 - "Healthcheck"
Cohesion: 0.50
Nodes (3): http, options, request

### Community 178 - "SHIFT BASED BILLING HANDOFF"
Cohesion: 0.50
Nodes (4): calculateShiftSlotCharge, Never Associate daily_rate With SHIFT_BASED, Settlement Tab daily_rate Follow-Up, bookings.shift_rate

## Ambiguous Edges - Review These
- `Vite React Scaffold Default Asset` → `VCare Nursing Brand Identity`  [AMBIGUOUS]
  client/public/vite.svg · relation: conceptually_related_to
- `Service Marketing Imagery` → `Gemini-Generated Nurse and Bedridden Patient Photo`  [AMBIGUOUS]
  client/src/assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png · relation: conceptually_related_to
- `Service Marketing Imagery` → `Decorative Background Asset`  [AMBIGUOUS]
  client/src/assets/images/HomeNursing.webp · relation: conceptually_related_to
- `Navy Blue Brand Palette` → `Low Contrast Section Backdrop`  [AMBIGUOUS]
  client/src/assets/images/ProfileBackground.jpg · relation: conceptually_related_to
- `Elderly Care Illustration (eldery_care.webp)` → `Elderly Care Service`  [AMBIGUOUS]
  client/src/assets/images/eldery_care.webp · relation: references

## Knowledge Gaps
- **991 isolated node(s):** `multer`, `multerS3`, `{ s3, BUCKET }`, `folderMap`, `storage` (+986 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Vite React Scaffold Default Asset` and `VCare Nursing Brand Identity`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Service Marketing Imagery` and `Gemini-Generated Nurse and Bedridden Patient Photo`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Service Marketing Imagery` and `Decorative Background Asset`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Navy Blue Brand Palette` and `Low Contrast Section Backdrop`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Elderly Care Illustration (eldery_care.webp)` and `Elderly Care Service`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `ApiClient` connect `Frontend API Client (Part 1)` to `Frontend API Client (Part 2)`, `Client Dashboard & App Shell`, `Worker Bookings (Staff Portal)`, `Api`, `Api`, `Api`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Why does `logActivity()` connect `Booking Notes Controller` to `Reg Fee Expiry`, `Bulk Data Import`, `Staff Controller (Backend)`, `Booking Controller (Backend)`, `Scheduled Booking Actions`, `Client Controller (Backend)`, `Quote Controller (Backend)`, `Daily Attendance Controller`, `Staff Wallet Controller`, `Payment Tracking Controller`, `Whatsapp`, `WhatsApp Templates`, `Roles & Permissions`, `Internal Staff Salary`, `Salesperson Controller`, `Rental Controller`, `Invoice Controller`, `Transaction Controller`, `Service Request Controller`, `Staff Leave Controller`, `Staff App Controller`, `Staff Review Controller`, `Statement Controller`, `Client Payment Controller`, `Vendor Controller`, `Receipt Controller`, `Bank Account Controller`, `Internal Staff Controller`, `Product Controller`, `Staff Assignment Controller`, `Staff Change Request Controller`, `Device Controller`, `Patient Controller`, `Scheduled Actions Controller`, `Staff Doc Upload Controller`, `Walk In Customer Controller`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._