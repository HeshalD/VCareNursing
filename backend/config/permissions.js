// Permission registry — single source of truth for all admin permission keys.
// category 'page'   → controls sidebar visibility in the frontend.
// category 'action' → controls individual operations within a page.
// SUPER_ADMIN bypasses all checks and is never stored in staff_permissions.

const PERMISSIONS = {
  // ── Pages ─────────────────────────────────────────────────────────────────
  VIEW_DASHBOARD:              { label: 'View Dashboard Overview',          module: 'Dashboard',            category: 'page' },
  VIEW_BOOKINGS:               { label: 'View Bookings',                    module: 'Bookings',             category: 'page' },
  VIEW_SERVICE_REQUESTS:       { label: 'View Service Requests',            module: 'Service Requests',     category: 'page' },
  VIEW_TERMINATION_REQUESTS:   { label: 'View Termination Requests',        module: 'Terminations',         category: 'page' },
  VIEW_ADVANCE_REQUESTS:       { label: 'View Advance Requests',            module: 'Advance Requests',     category: 'page' },
  VIEW_WORKER_VERIFICATIONS:   { label: 'View Worker Verifications',        module: 'Worker Verifications', category: 'page' },
  VIEW_CHANGE_REQUESTS:        { label: 'View Change Requests',             module: 'Change Requests',      category: 'page' },
  VIEW_USER_MANAGEMENT:        { label: 'View User Management',             module: 'User Management',      category: 'page' },
  VIEW_PATIENTS:               { label: 'View Patients / Care Profiles',    module: 'Patients',             category: 'page' },
  VIEW_QUOTATIONS:             { label: 'View Quotations',                  module: 'Quotations',           category: 'page' },
  VIEW_TRANSACTIONS:           { label: 'View Transactions',                module: 'Transactions',         category: 'page' },
  VIEW_FINANCIAL:              { label: 'View Financial Overview',          module: 'Financial',            category: 'page' },
  VIEW_STATEMENTS:             { label: 'View Statements',                  module: 'Statements',           category: 'page' },
  VIEW_BANK_ACCOUNTS:          { label: 'View Bank Accounts',               module: 'Bank Accounts',        category: 'page' },
  VIEW_VENDORS:                { label: 'View Vendors',                     module: 'Vendors',              category: 'page' },
  VIEW_ACTIVITY_LOG:           { label: 'View Activity Log',                module: 'Activity Log',         category: 'page' },
  VIEW_STAFF_REVIEWS:          { label: 'View Staff Reviews',               module: 'Staff Reviews',        category: 'page' },
  VIEW_SETTINGS:               { label: 'View Settings',                    module: 'Settings',             category: 'page' },
  VIEW_INVOICES:               { label: 'View Invoices',                    module: 'Invoices',             category: 'page' },
  VIEW_RECEIPTS:               { label: 'View Receipts',                    module: 'Receipts',             category: 'page' },
  VIEW_PRODUCTS:               { label: 'View Products',                    module: 'Products',             category: 'page' },
  VIEW_RENTALS:                { label: 'View Rentals',                     module: 'Rentals',              category: 'page' },
  VIEW_RECRUITERS:             { label: 'View Recruiters',                  module: 'Recruiters',           category: 'page' },
  VIEW_SALESPERSONS:           { label: 'View Salespersons',                module: 'Salespersons',         category: 'page' },
  VIEW_STAFF_LEAVES:           { label: 'View Staff Leaves',                module: 'Staff Leaves',         category: 'page' },
  VIEW_BULK_IMPORT:            { label: 'View Bulk Import',                 module: 'Bulk Import',          category: 'page' },
  VIEW_UPCOMING_EVENTS:        { label: 'View Upcoming Events',             module: 'Upcoming Events',      category: 'page' },

  // ── Bookings ──────────────────────────────────────────────────────────────
  BOOKING_RECORD_PAYMENT:      { label: 'Record Booking Payment',           module: 'Bookings',             category: 'action' },
  BOOKING_VERIFY_PAYMENT:      { label: 'Verify Booking Payment',           module: 'Bookings',             category: 'action' },
  BOOKING_REJECT_PAYMENT:      { label: 'Reject Booking Payment',           module: 'Bookings',             category: 'action' },
  BOOKING_WALLET_PAYOFF:       { label: 'Record Wallet Payoff',             module: 'Bookings',             category: 'action' },
  BOOKING_SWAP_STAFF:          { label: 'Swap Assigned Staff',              module: 'Bookings',             category: 'action' },
  BOOKING_APPROVE_TERMINATION: { label: 'Approve Termination Request',      module: 'Bookings',             category: 'action' },
  BOOKING_ADD_NOTE:            { label: 'Add Booking Note',                 module: 'Bookings',             category: 'action' },
  BOOKING_EDIT_NOTE:           { label: 'Edit Booking Note',                module: 'Bookings',             category: 'action' },
  BOOKING_DELETE_NOTE:         { label: 'Delete Booking Note',              module: 'Bookings',             category: 'action' },
  BOOKING_SEND_STATEMENT:      { label: 'Send Booking Statement',           module: 'Bookings',             category: 'action' },
  BOOKING_EXTEND:              { label: 'Extend Booking',                   module: 'Bookings',             category: 'action' },
  BOOKING_COMPLETE:            { label: 'Complete Booking',                 module: 'Bookings',             category: 'action' },
  BOOKING_TERMINATE:           { label: 'Admin-Terminate Booking',          module: 'Bookings',             category: 'action' },
  BOOKING_CREATE_DIRECT:       { label: 'Create Direct Booking',            module: 'Bookings',             category: 'action' },
  BOOKING_CONVERT_FROM_LEAD:   { label: 'Convert Lead to Booking',          module: 'Bookings',             category: 'action' },
  BOOKING_PAUSE:               { label: 'Pause Booking',                    module: 'Bookings',             category: 'action' },
  BOOKING_RESUME:              { label: 'Resume Booking',                   module: 'Bookings',             category: 'action' },
  BOOKING_FORCE_STOP:          { label: 'Force-Stop Booking',               module: 'Bookings',             category: 'action' },
  BOOKING_MANAGE_SHIFT_PATTERN: { label: 'Create/Change Shift Pattern',     module: 'Bookings',             category: 'action' },
  BOOKING_UPDATE_HOSPITALIZATION: { label: 'Update Hospitalization Status', module: 'Bookings',             category: 'action' },

  // ── Staff Assignment ──────────────────────────────────────────────────────
  ASSIGNMENT_ASSIGN:           { label: 'Assign Staff to Booking',          module: 'Bookings',             category: 'action' },
  ASSIGNMENT_UPDATE:           { label: 'Update Staff Assignment',          module: 'Bookings',             category: 'action' },
  ASSIGNMENT_COMPLETE:         { label: 'Complete Staff Assignment',        module: 'Bookings',             category: 'action' },

  // ── Service Requests ──────────────────────────────────────────────────────
  SERVICE_REQUEST_CREATE:      { label: 'Create Service Request',           module: 'Service Requests',     category: 'action' },
  SERVICE_REQUEST_EDIT:        { label: 'Edit Service Request',             module: 'Service Requests',     category: 'action' },
  SERVICE_REQUEST_CONVERT:     { label: 'Convert Request to Booking',       module: 'Service Requests',     category: 'action' },
  SERVICE_REQUEST_SEND_CANDIDATE: { label: 'Send Candidate Profile',        module: 'Service Requests',     category: 'action' },

  // ── Quotations ────────────────────────────────────────────────────────────
  QUOTATION_CREATE:            { label: 'Create Quotation',                 module: 'Quotations',           category: 'action' },
  QUOTATION_EDIT:              { label: 'Edit Quotation',                   module: 'Quotations',           category: 'action' },
  QUOTATION_SEND:              { label: 'Send Quote to Client',             module: 'Quotations',           category: 'action' },
  QUOTATION_RECORD_PAYMENT:    { label: 'Record Quote Payment',             module: 'Quotations',           category: 'action' },
  QUOTATION_VERIFY_PAYMENT:    { label: 'Verify Quote Payment',             module: 'Quotations',           category: 'action' },
  QUOTATION_REJECT_PAYMENT:    { label: 'Reject Quote Payment',             module: 'Quotations',           category: 'action' },
  PRESET_CREATE:               { label: 'Create Preset Item',               module: 'Quotations',           category: 'action' },
  PRESET_EDIT:                 { label: 'Edit Preset Item',                 module: 'Quotations',           category: 'action' },
  PRESET_DELETE:               { label: 'Delete Preset Item',               module: 'Quotations',           category: 'action' },
  QUOTATION_ACCEPT:            { label: 'Accept Quote on Client\'s Behalf', module: 'Quotations',           category: 'action' },

  // ── Advance Requests ──────────────────────────────────────────────────────
  ADVANCE_APPROVE:             { label: 'Approve Advance Request',          module: 'Advance Requests',     category: 'action' },
  ADVANCE_REJECT:              { label: 'Reject Advance Request',           module: 'Advance Requests',     category: 'action' },
  ADVANCE_UPDATE_THRESHOLD:    { label: 'Update Staff Advance Threshold',   module: 'Advance Requests',     category: 'action' },

  // ── Client Management ─────────────────────────────────────────────────────
  CLIENT_EDIT:                 { label: 'Edit Client Profile',              module: 'User Management',      category: 'action' },
  CLIENT_DEACTIVATE:           { label: 'Deactivate / Activate Client',     module: 'User Management',      category: 'action' },
  CLIENT_RECORD_PAYMENT:       { label: 'Record Client Payment',            module: 'User Management',      category: 'action' },
  CLIENT_SEND_STATEMENT:       { label: 'Send Client Statement',            module: 'User Management',      category: 'action' },
  CLIENT_ADD_NOTE:             { label: 'Add Client Note',                  module: 'User Management',      category: 'action' },
  CLIENT_EDIT_NOTE:            { label: 'Edit Client Note',                 module: 'User Management',      category: 'action' },
  CLIENT_DELETE_NOTE:          { label: 'Delete Client Note',               module: 'User Management',      category: 'action' },
  CLIENT_SEND_REG_FEE_INVOICE: { label: 'Send Registration Fee Invoice',    module: 'User Management',      category: 'action' },
  CLIENT_PROXY_CREATE:         { label: 'Proxy-Create Client Account',      module: 'User Management',      category: 'action' },
  WALKIN_CUSTOMER_CREATE:      { label: 'Create Walk-In Customer',          module: 'User Management',      category: 'action' },

  // ── Staff (Nursing) Management ────────────────────────────────────────────
  STAFF_EDIT:                  { label: 'Edit Staff Profile',               module: 'User Management',      category: 'action' },
  STAFF_DEACTIVATE:            { label: 'Deactivate Staff Account',         module: 'User Management',      category: 'action' },
  STAFF_REACTIVATE:            { label: 'Reactivate Staff Account',         module: 'User Management',      category: 'action' },
  STAFF_CREATE_PAYOUT:         { label: 'Create Staff Payout',              module: 'User Management',      category: 'action' },
  STAFF_APPLY_DEDUCTION:       { label: 'Apply Staff Deduction',            module: 'User Management',      category: 'action' },
  STAFF_ADD_BANK_ACCOUNT:      { label: 'Add Staff Bank Account',           module: 'User Management',      category: 'action' },
  STAFF_EDIT_BANK_ACCOUNT:     { label: 'Edit Staff Bank Account',          module: 'User Management',      category: 'action' },
  STAFF_DELETE_BANK_ACCOUNT:   { label: 'Delete Staff Bank Account',        module: 'User Management',      category: 'action' },
  STAFF_EXPORT_SALARY:         { label: 'Export Salary Sheet',              module: 'User Management',      category: 'action' },
  STAFF_NOTIFY_SALARY:         { label: 'Send Salary Sheet Notification',   module: 'User Management',      category: 'action' },
  STAFF_PROXY_CREATE:          { label: 'Proxy-Create Staff Account',       module: 'User Management',      category: 'action' },
  STAFF_ADD_NOTE:              { label: 'Add Staff Note',                   module: 'User Management',      category: 'action' },
  STAFF_EDIT_NOTE:             { label: 'Edit Staff Note',                  module: 'User Management',      category: 'action' },
  STAFF_DELETE_NOTE:           { label: 'Delete Staff Note',                module: 'User Management',      category: 'action' },

  // ── Worker Verifications ──────────────────────────────────────────────────
  APPLICATION_ACCEPT:          { label: 'Accept Staff Application',         module: 'Worker Verifications', category: 'action' },
  APPLICATION_REJECT:          { label: 'Reject Staff Application',         module: 'Worker Verifications', category: 'action' },
  APPLICATION_UPDATE:          { label: 'Update Application Details',       module: 'Worker Verifications', category: 'action' },
  APPLICATION_SEND_AGREEMENT:  { label: 'Send Application Agreement',       module: 'Worker Verifications', category: 'action' },
  STAFF_DOC_SEND_REQUEST:      { label: 'Send Document Request',            module: 'Worker Verifications', category: 'action' },
  STAFF_DOC_ADMIN_UPLOAD:      { label: 'Admin-Upload Staff Documents',     module: 'Worker Verifications', category: 'action' },

  // ── Change Requests ───────────────────────────────────────────────────────
  CHANGE_REQUEST_CLAIM:        { label: 'Claim Change Request',             module: 'Change Requests',      category: 'action' },
  CHANGE_REQUEST_APPROVE:      { label: 'Approve Change Request',           module: 'Change Requests',      category: 'action' },
  CHANGE_REQUEST_REJECT:       { label: 'Reject Change Request',            module: 'Change Requests',      category: 'action' },

  // ── Terminations ──────────────────────────────────────────────────────────
  TERMINATION_APPROVE:         { label: 'Approve Termination Request',      module: 'Terminations',         category: 'action' },
  TERMINATION_REJECT:          { label: 'Reject Termination Request',       module: 'Terminations',         category: 'action' },

  // ── Transactions ──────────────────────────────────────────────────────────
  TRANSACTION_ADD_MANUAL:      { label: 'Add Manual Transaction',           module: 'Transactions',         category: 'action' },

  // ── Patients / Care Profiles ──────────────────────────────────────────────
  PATIENT_CREATE:              { label: 'Create Care Profile',              module: 'Patients',             category: 'action' },
  PATIENT_EDIT:                { label: 'Edit Care Profile',                module: 'Patients',             category: 'action' },
  PATIENT_DELETE:              { label: 'Delete Care Profile',              module: 'Patients',             category: 'action' },

  // ── Statements ────────────────────────────────────────────────────────────
  STATEMENT_SEND:              { label: 'Send Statement via WhatsApp',      module: 'Statements',           category: 'action' },
  STATEMENT_DELETE:            { label: 'Delete Statement',                 module: 'Statements',           category: 'action' },

  // ── Invoices ──────────────────────────────────────────────────────────────
  INVOICE_CREATE_FROM_QUOTE:   { label: 'Create Invoice from Quote',        module: 'Invoices',             category: 'action' },
  INVOICE_RESEND:              { label: 'Resend Invoice',                   module: 'Invoices',             category: 'action' },
  INVOICE_RECORD_PAYMENT:      { label: 'Record Invoice Payment',           module: 'Invoices',             category: 'action' },

  // ── Receipts ──────────────────────────────────────────────────────────────
  RECEIPT_SEND:                { label: 'Send Receipt via WhatsApp',        module: 'Receipts',             category: 'action' },

  // ── Bank Accounts (Company) ───────────────────────────────────────────────
  BANK_ACCOUNT_CREATE:         { label: 'Create Bank Account',              module: 'Bank Accounts',        category: 'action' },
  BANK_ACCOUNT_EDIT:           { label: 'Edit Bank Account',                module: 'Bank Accounts',        category: 'action' },
  BANK_ACCOUNT_DEACTIVATE:     { label: 'Deactivate Bank Account',          module: 'Bank Accounts',        category: 'action' },
  BANK_ACCOUNT_TRANSFER:       { label: 'Transfer Between Bank Accounts',   module: 'Bank Accounts',        category: 'action' },
  BANK_TRANSACTION_VERIFY:     { label: 'Verify Bank Transaction',          module: 'Bank Accounts',        category: 'action' },
  PETTY_CASH_RECORD_TRANSACTION: { label: 'Record Petty Cash Transaction',  module: 'Bank Accounts',        category: 'action' },

  // ── Vendors ───────────────────────────────────────────────────────────────
  VENDOR_CREATE:               { label: 'Create Vendor',                    module: 'Vendors',              category: 'action' },
  VENDOR_EDIT:                 { label: 'Edit Vendor',                      module: 'Vendors',              category: 'action' },
  VENDOR_RECORD_BILL:          { label: 'Record Vendor Bill',               module: 'Vendors',              category: 'action' },
  VENDOR_PAY_BILL:             { label: 'Pay Vendor Bill',                  module: 'Vendors',              category: 'action' },

  // ── Staff Reviews ─────────────────────────────────────────────────────────
  REVIEW_TOGGLE_VISIBILITY:    { label: 'Toggle Review Visibility',         module: 'Staff Reviews',        category: 'action' },
  REVIEW_SEND_REQUEST:         { label: 'Send Review Request to Client',    module: 'Staff Reviews',        category: 'action' },
  REVIEW_ADMIN_CREATE:         { label: 'Admin-Create Staff Review',        module: 'Staff Reviews',        category: 'action' },

  // ── Settings ──────────────────────────────────────────────────────────────
  SETTINGS_TOGGLE_MAINTENANCE: { label: 'Toggle Public Maintenance Mode',   module: 'Settings',             category: 'action' },

  // ── Active Sessions / Devices — SUPER_ADMIN has these by default; nobody else
  //    does unless a Super Admin explicitly grants them via the Permissions page.
  VIEW_ACTIVE_SESSIONS:        { label: 'View Active Sessions',             module: 'Active Sessions',      category: 'page' },
  SESSION_FORCE_LOGOUT:        { label: 'Force Logout Session',             module: 'Active Sessions',      category: 'action' },
  DEVICE_ASSIGN:                { label: 'Assign Device',                   module: 'Active Sessions',      category: 'action' },
  DEVICE_REVOKE:                { label: 'Revoke Device',                   module: 'Active Sessions',      category: 'action' },

  // ── Permissions — SUPER_ADMIN has this by default; granting it to someone else
  //    lets them manage staff permissions too (deputized, not a loophole — it
  //    still requires a Super Admin to grant it in the first place).
  PERMISSIONS_MANAGE:          { label: 'Manage Staff Permissions',         module: 'Permissions',          category: 'action' },

  // ── Internal Staff — SUPER_ADMIN has these by default; nobody else does unless
  //    explicitly granted via the Permissions page.
  VIEW_INTERNAL_STAFF:         { label: 'View Internal Staff',              module: 'Internal Staff',       category: 'page' },
  INTERNAL_STAFF_CREATE:       { label: 'Create Internal Staff',            module: 'Internal Staff',       category: 'action' },
  INTERNAL_STAFF_EDIT:         { label: 'Edit Internal Staff',              module: 'Internal Staff',       category: 'action' },
  INTERNAL_STAFF_REMOVE:       { label: 'Remove Internal Staff',            module: 'Internal Staff',       category: 'action' },

  // ── Bulk Import ───────────────────────────────────────────────────────────
  BULK_IMPORT_COMMIT:          { label: 'Commit Bulk Import',               module: 'Bulk Import',          category: 'action' },

  // ── Upcoming Events / Scheduled Actions ──────────────────────────────────
  SCHEDULED_ACTION_CANCEL:     { label: 'Cancel Scheduled Action',          module: 'Upcoming Events',      category: 'action' },
  SCHEDULED_ACTION_EXECUTE_NOW: { label: 'Execute Scheduled Action Now',    module: 'Upcoming Events',      category: 'action' },

  // ── Products ──────────────────────────────────────────────────────────────
  PRODUCT_CREATE:              { label: 'Create Product',                   module: 'Products',             category: 'action' },
  PRODUCT_EDIT:                { label: 'Edit Product',                     module: 'Products',             category: 'action' },
  PRODUCT_CATEGORY_MANAGE:     { label: 'Manage Product Categories',        module: 'Products',             category: 'action' },

  // ── Rentals ───────────────────────────────────────────────────────────────
  RENTAL_UNIT_CREATE:          { label: 'Create Rental Unit',                module: 'Rentals',              category: 'action' },
  RENTAL_UNIT_EDIT:            { label: 'Edit Rental Unit Status',          module: 'Rentals',              category: 'action' },
  RENTAL_AGREEMENT_CREATE:     { label: 'Create Rental Agreement',          module: 'Rentals',              category: 'action' },
  RENTAL_UNIT_RETURN:          { label: 'Process Rental Unit Return',       module: 'Rentals',              category: 'action' },
  RENTAL_DEPOSIT_REFUND:       { label: 'Refund Rental Deposit',            module: 'Rentals',              category: 'action' },
  RENTAL_DEPOSIT_FORFEIT:      { label: 'Forfeit Rental Deposit',           module: 'Rentals',              category: 'action' },

  // ── Recruiters ────────────────────────────────────────────────────────────
  RECRUITER_CREDIT:            { label: 'Credit / Switch Recruiter',        module: 'Recruiters',           category: 'action' },

  // ── Salespersons ──────────────────────────────────────────────────────────
  SALESPERSON_CREDIT:          { label: 'Credit / Switch Salesperson',      module: 'Salespersons',         category: 'action' },

  // ── Staff Leaves ──────────────────────────────────────────────────────────
  STAFF_LEAVE_APPROVE:         { label: 'Approve Staff Leave',              module: 'Staff Leaves',         category: 'action' },
  STAFF_LEAVE_REJECT:          { label: 'Reject Staff Leave',               module: 'Staff Leaves',         category: 'action' },

  // ── Bookings — day-to-day operations (SHIFT_BASED/VISITING service delivery) ─
  BOOKING_CONFIRM_DAILY_INVOICE: { label: 'Confirm/Skip Daily or Shift Invoice', module: 'Bookings',        category: 'action' },
  BOOKING_WAIVE_SHIFT:         { label: 'Waive Shift Occurrence',           module: 'Bookings',             category: 'action' },
  BOOKING_RESCHEDULE_SHIFT:    { label: 'Reschedule Shift Occurrence',      module: 'Bookings',             category: 'action' },
  BOOKING_CANCEL_RESCHEDULE:   { label: 'Cancel Shift Reschedule',          module: 'Bookings',             category: 'action' },
  BOOKING_MARK_OVERDUE:        { label: 'Mark Booking Overdue',             module: 'Bookings',             category: 'action' },
  BOOKING_RESOLVE_OVERDUE:     { label: 'Resolve Booking Overdue',          module: 'Bookings',             category: 'action' },
  BOOKING_UPDATE_INVOICING_MODE: { label: 'Toggle Invoicing Mode',          module: 'Bookings',             category: 'action' },
  ATTENDANCE_RECORD:           { label: 'Record Staff Attendance',          module: 'Bookings',             category: 'action' },
  ATTENDANCE_MARK_ABSENT:      { label: 'Mark Staff Absent',                module: 'Bookings',             category: 'action' },
  ATTENDANCE_CONFIRM_SALARY:   { label: 'Confirm/Skip Staff Daily Salary',  module: 'Bookings',             category: 'action' },
  ATTENDANCE_REVOKE:           { label: 'Revoke Wrongly Paid/Invoiced Day', module: 'Bookings',             category: 'action' },
};

// Role templates — pre-built permission sets shown in the Super Admin UI.
// These are config only; they are NOT enforced server-side.
// The super admin selects one as a starting point, then customises before saving.
const ROLE_TEMPLATES = {
  COORDINATOR: [
    'VIEW_DASHBOARD', 'VIEW_BOOKINGS', 'VIEW_SERVICE_REQUESTS', 'VIEW_TERMINATION_REQUESTS',
    'VIEW_ADVANCE_REQUESTS', 'VIEW_WORKER_VERIFICATIONS', 'VIEW_CHANGE_REQUESTS',
    'VIEW_USER_MANAGEMENT', 'VIEW_PATIENTS', 'VIEW_QUOTATIONS', 'VIEW_STATEMENTS',
    'VIEW_STAFF_REVIEWS', 'VIEW_ACTIVITY_LOG',
    'VIEW_INVOICES', 'VIEW_RECEIPTS', 'VIEW_PRODUCTS', 'VIEW_RENTALS', 'VIEW_BANK_ACCOUNTS',
    'VIEW_RECRUITERS', 'VIEW_SALESPERSONS', 'VIEW_STAFF_LEAVES',
    'VIEW_BULK_IMPORT', 'VIEW_UPCOMING_EVENTS', 'VIEW_TRANSACTIONS',
    'BOOKING_RECORD_PAYMENT', 'BOOKING_VERIFY_PAYMENT', 'BOOKING_REJECT_PAYMENT',
    'BOOKING_WALLET_PAYOFF', 'BOOKING_SWAP_STAFF', 'BOOKING_APPROVE_TERMINATION',
    'BOOKING_ADD_NOTE', 'BOOKING_EDIT_NOTE', 'BOOKING_DELETE_NOTE',
    'BOOKING_SEND_STATEMENT', 'BOOKING_EXTEND', 'BOOKING_COMPLETE', 'BOOKING_TERMINATE',
    'BOOKING_CREATE_DIRECT', 'BOOKING_CONVERT_FROM_LEAD', 'BOOKING_PAUSE', 'BOOKING_RESUME',
    'BOOKING_FORCE_STOP', 'BOOKING_MANAGE_SHIFT_PATTERN', 'BOOKING_UPDATE_HOSPITALIZATION',
    'ASSIGNMENT_ASSIGN', 'ASSIGNMENT_UPDATE', 'ASSIGNMENT_COMPLETE',
    'SERVICE_REQUEST_CREATE', 'SERVICE_REQUEST_EDIT', 'SERVICE_REQUEST_CONVERT',
    'SERVICE_REQUEST_SEND_CANDIDATE',
    'QUOTATION_CREATE', 'QUOTATION_EDIT', 'QUOTATION_SEND', 'QUOTATION_ACCEPT',
    'QUOTATION_RECORD_PAYMENT', 'QUOTATION_VERIFY_PAYMENT', 'QUOTATION_REJECT_PAYMENT',
    'PRESET_CREATE', 'PRESET_EDIT', 'PRESET_DELETE',
    'ADVANCE_APPROVE', 'ADVANCE_REJECT',
    'CLIENT_EDIT', 'CLIENT_RECORD_PAYMENT', 'CLIENT_SEND_STATEMENT',
    'CLIENT_ADD_NOTE', 'CLIENT_EDIT_NOTE', 'CLIENT_DELETE_NOTE',
    'CLIENT_SEND_REG_FEE_INVOICE', 'CLIENT_PROXY_CREATE', 'WALKIN_CUSTOMER_CREATE',
    'STAFF_EDIT', 'STAFF_DEACTIVATE', 'STAFF_REACTIVATE',
    'STAFF_PROXY_CREATE', 'STAFF_ADD_NOTE', 'STAFF_EDIT_NOTE', 'STAFF_DELETE_NOTE',
    'APPLICATION_ACCEPT', 'APPLICATION_REJECT', 'APPLICATION_UPDATE',
    'CHANGE_REQUEST_CLAIM', 'CHANGE_REQUEST_APPROVE', 'CHANGE_REQUEST_REJECT',
    'TERMINATION_APPROVE', 'TERMINATION_REJECT',
    'PATIENT_CREATE', 'PATIENT_EDIT', 'PATIENT_DELETE',
    'STATEMENT_SEND', 'STATEMENT_DELETE', 'TRANSACTION_ADD_MANUAL',
    'INVOICE_CREATE_FROM_QUOTE', 'INVOICE_RESEND', 'INVOICE_RECORD_PAYMENT',
    'RECEIPT_SEND',
    'REVIEW_TOGGLE_VISIBILITY', 'REVIEW_SEND_REQUEST',
    'BULK_IMPORT_COMMIT', 'SCHEDULED_ACTION_CANCEL', 'SCHEDULED_ACTION_EXECUTE_NOW',
    'BOOKING_CONFIRM_DAILY_INVOICE', 'BOOKING_WAIVE_SHIFT', 'BOOKING_RESCHEDULE_SHIFT',
    'BOOKING_CANCEL_RESCHEDULE', 'BOOKING_MARK_OVERDUE', 'BOOKING_RESOLVE_OVERDUE',
    'BOOKING_UPDATE_INVOICING_MODE',
    'ATTENDANCE_RECORD', 'ATTENDANCE_MARK_ABSENT', 'ATTENDANCE_CONFIRM_SALARY',
    'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_CATEGORY_MANAGE',
    'RENTAL_UNIT_CREATE', 'RENTAL_UNIT_EDIT', 'RENTAL_AGREEMENT_CREATE', 'RENTAL_UNIT_RETURN',
    'RENTAL_DEPOSIT_REFUND', 'RENTAL_DEPOSIT_FORFEIT',
    'RECRUITER_CREDIT', 'SALESPERSON_CREDIT',
    'STAFF_LEAVE_APPROVE', 'STAFF_LEAVE_REJECT',
  ],
  ACCOUNTS: [
    'VIEW_DASHBOARD', 'VIEW_BOOKINGS', 'VIEW_USER_MANAGEMENT', 'VIEW_QUOTATIONS',
    'VIEW_TRANSACTIONS', 'VIEW_FINANCIAL', 'VIEW_STATEMENTS', 'VIEW_BANK_ACCOUNTS',
    'VIEW_ADVANCE_REQUESTS', 'VIEW_ACTIVITY_LOG', 'VIEW_VENDORS', 'VIEW_CHANGE_REQUESTS',
    'VIEW_TERMINATION_REQUESTS',
    'CHANGE_REQUEST_CLAIM', 'CHANGE_REQUEST_APPROVE', 'CHANGE_REQUEST_REJECT',
    'VIEW_INVOICES', 'VIEW_RECEIPTS', 'VIEW_PRODUCTS', 'VIEW_RENTALS', 'VIEW_UPCOMING_EVENTS',
    'VIEW_PATIENTS', 'PATIENT_DELETE',
    'BOOKING_RECORD_PAYMENT', 'BOOKING_VERIFY_PAYMENT', 'BOOKING_REJECT_PAYMENT',
    'BOOKING_WALLET_PAYOFF', 'BOOKING_ADD_NOTE', 'BOOKING_EDIT_NOTE',
    'BOOKING_UPDATE_HOSPITALIZATION', 'BOOKING_EXTEND',
    'QUOTATION_EDIT', 'QUOTATION_SEND',
    'QUOTATION_RECORD_PAYMENT', 'QUOTATION_VERIFY_PAYMENT', 'QUOTATION_REJECT_PAYMENT',
    'QUOTATION_ACCEPT',
    'ADVANCE_APPROVE', 'ADVANCE_REJECT', 'ADVANCE_UPDATE_THRESHOLD',
    'CLIENT_EDIT', 'CLIENT_RECORD_PAYMENT', 'CLIENT_SEND_STATEMENT', 'CLIENT_SEND_REG_FEE_INVOICE',
    'CLIENT_ADD_NOTE', 'CLIENT_EDIT_NOTE', 'WALKIN_CUSTOMER_CREATE',
    'STAFF_CREATE_PAYOUT', 'STAFF_APPLY_DEDUCTION', 'STAFF_DEACTIVATE', 'STAFF_REACTIVATE',
    'STAFF_ADD_BANK_ACCOUNT', 'STAFF_EDIT_BANK_ACCOUNT', 'STAFF_DELETE_BANK_ACCOUNT',
    'STAFF_EXPORT_SALARY', 'STAFF_NOTIFY_SALARY',
    'TRANSACTION_ADD_MANUAL',
    'STATEMENT_SEND', 'STATEMENT_DELETE',
    'INVOICE_CREATE_FROM_QUOTE', 'INVOICE_RESEND', 'INVOICE_RECORD_PAYMENT',
    'RECEIPT_SEND',
    'BANK_ACCOUNT_CREATE', 'BANK_ACCOUNT_EDIT', 'BANK_ACCOUNT_DEACTIVATE', 'BANK_ACCOUNT_TRANSFER',
    'PETTY_CASH_RECORD_TRANSACTION',
    'VENDOR_CREATE', 'VENDOR_EDIT', 'VENDOR_RECORD_BILL', 'VENDOR_PAY_BILL',
    'BOOKING_CONFIRM_DAILY_INVOICE', 'BOOKING_WAIVE_SHIFT', 'BOOKING_RESCHEDULE_SHIFT',
    'BOOKING_CANCEL_RESCHEDULE', 'BOOKING_MARK_OVERDUE', 'BOOKING_RESOLVE_OVERDUE',
    'BOOKING_UPDATE_INVOICING_MODE',
    'ATTENDANCE_RECORD', 'ATTENDANCE_MARK_ABSENT', 'ATTENDANCE_CONFIRM_SALARY',
    'PRODUCT_CREATE', 'PRODUCT_EDIT', 'PRODUCT_CATEGORY_MANAGE',
    'RENTAL_UNIT_CREATE', 'RENTAL_UNIT_EDIT', 'RENTAL_AGREEMENT_CREATE', 'RENTAL_UNIT_RETURN',
    'RENTAL_DEPOSIT_REFUND', 'RENTAL_DEPOSIT_FORFEIT',
  ],
  SALES: [
    'VIEW_DASHBOARD', 'VIEW_BOOKINGS', 'VIEW_QUOTATIONS', 'VIEW_USER_MANAGEMENT',
    'QUOTATION_CREATE', 'QUOTATION_EDIT', 'QUOTATION_SEND',
    'CLIENT_ADD_NOTE',
  ],
};

const VALID_KEYS = new Set(Object.keys(PERMISSIONS));

module.exports = { PERMISSIONS, ROLE_TEMPLATES, VALID_KEYS };
