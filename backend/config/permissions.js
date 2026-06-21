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
  VIEW_ACTIVITY_LOG:           { label: 'View Activity Log',                module: 'Activity Log',         category: 'page' },
  VIEW_STAFF_REVIEWS:          { label: 'View Staff Reviews',               module: 'Staff Reviews',        category: 'page' },
  VIEW_SETTINGS:               { label: 'View Settings',                    module: 'Settings',             category: 'page' },

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

  // ── Staff Assignment ──────────────────────────────────────────────────────
  ASSIGNMENT_ASSIGN:           { label: 'Assign Staff to Booking',          module: 'Bookings',             category: 'action' },
  ASSIGNMENT_UPDATE:           { label: 'Update Staff Assignment',          module: 'Bookings',             category: 'action' },
  ASSIGNMENT_COMPLETE:         { label: 'Complete Staff Assignment',        module: 'Bookings',             category: 'action' },

  // ── Service Requests ──────────────────────────────────────────────────────
  SERVICE_REQUEST_CREATE:      { label: 'Create Service Request',           module: 'Service Requests',     category: 'action' },
  SERVICE_REQUEST_EDIT:        { label: 'Edit Service Request',             module: 'Service Requests',     category: 'action' },
  SERVICE_REQUEST_CONVERT:     { label: 'Convert Request to Booking',       module: 'Service Requests',     category: 'action' },

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

  // ── Worker Verifications ──────────────────────────────────────────────────
  APPLICATION_ACCEPT:          { label: 'Accept Staff Application',         module: 'Worker Verifications', category: 'action' },
  APPLICATION_REJECT:          { label: 'Reject Staff Application',         module: 'Worker Verifications', category: 'action' },
  APPLICATION_UPDATE:          { label: 'Update Application Details',       module: 'Worker Verifications', category: 'action' },

  // ── Change Requests ───────────────────────────────────────────────────────
  CHANGE_REQUEST_CLAIM:        { label: 'Claim Change Request',             module: 'Change Requests',      category: 'action' },
  CHANGE_REQUEST_APPROVE:      { label: 'Approve Change Request',           module: 'Change Requests',      category: 'action' },
  CHANGE_REQUEST_REJECT:       { label: 'Reject Change Request',            module: 'Change Requests',      category: 'action' },

  // ── Terminations ──────────────────────────────────────────────────────────
  TERMINATION_APPROVE:         { label: 'Approve Termination Request',      module: 'Terminations',         category: 'action' },

  // ── Transactions ──────────────────────────────────────────────────────────
  TRANSACTION_ADD_MANUAL:      { label: 'Add Manual Transaction',           module: 'Transactions',         category: 'action' },

  // ── Patients / Care Profiles ──────────────────────────────────────────────
  PATIENT_CREATE:              { label: 'Create Care Profile',              module: 'Patients',             category: 'action' },
  PATIENT_EDIT:                { label: 'Edit Care Profile',                module: 'Patients',             category: 'action' },
  PATIENT_DELETE:              { label: 'Delete Care Profile',              module: 'Patients',             category: 'action' },

  // ── Statements ────────────────────────────────────────────────────────────
  STATEMENT_SEND:              { label: 'Send Statement via WhatsApp',      module: 'Statements',           category: 'action' },
  STATEMENT_DELETE:            { label: 'Delete Statement',                 module: 'Statements',           category: 'action' },

  // ── Bank Accounts (Company) ───────────────────────────────────────────────
  BANK_ACCOUNT_CREATE:         { label: 'Create Bank Account',              module: 'Bank Accounts',        category: 'action' },
  BANK_ACCOUNT_EDIT:           { label: 'Edit Bank Account',                module: 'Bank Accounts',        category: 'action' },
  BANK_ACCOUNT_DEACTIVATE:     { label: 'Deactivate Bank Account',          module: 'Bank Accounts',        category: 'action' },

  // ── Staff Reviews ─────────────────────────────────────────────────────────
  REVIEW_TOGGLE_VISIBILITY:    { label: 'Toggle Review Visibility',         module: 'Staff Reviews',        category: 'action' },
  REVIEW_SEND_REQUEST:         { label: 'Send Review Request to Client',    module: 'Staff Reviews',        category: 'action' },

  // ── Settings ──────────────────────────────────────────────────────────────
  SETTINGS_TOGGLE_MAINTENANCE: { label: 'Toggle Public Maintenance Mode',   module: 'Settings',             category: 'action' },
};

// Role templates — pre-built permission sets shown in the Super Admin UI.
// These are config only; they are NOT enforced server-side.
// The super admin selects one as a starting point, then customises before saving.
const ROLE_TEMPLATES = {
  COORDINATOR: [
    'VIEW_DASHBOARD', 'VIEW_BOOKINGS', 'VIEW_SERVICE_REQUESTS', 'VIEW_TERMINATION_REQUESTS',
    'VIEW_ADVANCE_REQUESTS', 'VIEW_WORKER_VERIFICATIONS', 'VIEW_CHANGE_REQUESTS',
    'VIEW_USER_MANAGEMENT', 'VIEW_PATIENTS', 'VIEW_QUOTATIONS', 'VIEW_STATEMENTS',
    'VIEW_STAFF_REVIEWS',
    'BOOKING_RECORD_PAYMENT', 'BOOKING_VERIFY_PAYMENT', 'BOOKING_REJECT_PAYMENT',
    'BOOKING_WALLET_PAYOFF', 'BOOKING_SWAP_STAFF', 'BOOKING_APPROVE_TERMINATION',
    'BOOKING_ADD_NOTE', 'BOOKING_EDIT_NOTE', 'BOOKING_DELETE_NOTE',
    'BOOKING_SEND_STATEMENT', 'BOOKING_EXTEND', 'BOOKING_COMPLETE', 'BOOKING_TERMINATE',
    'ASSIGNMENT_ASSIGN', 'ASSIGNMENT_UPDATE', 'ASSIGNMENT_COMPLETE',
    'SERVICE_REQUEST_CREATE', 'SERVICE_REQUEST_EDIT', 'SERVICE_REQUEST_CONVERT',
    'QUOTATION_CREATE', 'QUOTATION_EDIT', 'QUOTATION_SEND',
    'QUOTATION_RECORD_PAYMENT', 'QUOTATION_VERIFY_PAYMENT', 'QUOTATION_REJECT_PAYMENT',
    'PRESET_CREATE', 'PRESET_EDIT', 'PRESET_DELETE',
    'ADVANCE_APPROVE', 'ADVANCE_REJECT',
    'CLIENT_EDIT', 'CLIENT_RECORD_PAYMENT', 'CLIENT_SEND_STATEMENT',
    'CLIENT_ADD_NOTE', 'CLIENT_EDIT_NOTE', 'CLIENT_DELETE_NOTE',
    'STAFF_EDIT',
    'APPLICATION_ACCEPT', 'APPLICATION_REJECT', 'APPLICATION_UPDATE',
    'CHANGE_REQUEST_CLAIM', 'CHANGE_REQUEST_APPROVE', 'CHANGE_REQUEST_REJECT',
    'TERMINATION_APPROVE',
    'PATIENT_CREATE', 'PATIENT_EDIT', 'PATIENT_DELETE',
    'STATEMENT_SEND',
    'REVIEW_TOGGLE_VISIBILITY', 'REVIEW_SEND_REQUEST',
  ],
  ACCOUNTS: [
    'VIEW_DASHBOARD', 'VIEW_BOOKINGS', 'VIEW_USER_MANAGEMENT', 'VIEW_QUOTATIONS',
    'VIEW_TRANSACTIONS', 'VIEW_FINANCIAL', 'VIEW_STATEMENTS', 'VIEW_BANK_ACCOUNTS',
    'VIEW_ADVANCE_REQUESTS', 'VIEW_ACTIVITY_LOG',
    'BOOKING_RECORD_PAYMENT', 'BOOKING_VERIFY_PAYMENT', 'BOOKING_REJECT_PAYMENT',
    'BOOKING_WALLET_PAYOFF', 'BOOKING_ADD_NOTE',
    'QUOTATION_RECORD_PAYMENT', 'QUOTATION_VERIFY_PAYMENT', 'QUOTATION_REJECT_PAYMENT',
    'ADVANCE_APPROVE', 'ADVANCE_REJECT', 'ADVANCE_UPDATE_THRESHOLD',
    'CLIENT_RECORD_PAYMENT', 'CLIENT_SEND_STATEMENT',
    'STAFF_CREATE_PAYOUT', 'STAFF_APPLY_DEDUCTION',
    'STAFF_ADD_BANK_ACCOUNT', 'STAFF_EDIT_BANK_ACCOUNT', 'STAFF_DELETE_BANK_ACCOUNT',
    'STAFF_EXPORT_SALARY', 'STAFF_NOTIFY_SALARY',
    'TRANSACTION_ADD_MANUAL',
    'STATEMENT_SEND', 'STATEMENT_DELETE',
    'BANK_ACCOUNT_CREATE', 'BANK_ACCOUNT_EDIT', 'BANK_ACCOUNT_DEACTIVATE',
  ],
};

const VALID_KEYS = new Set(Object.keys(PERMISSIONS));

module.exports = { PERMISSIONS, ROLE_TEMPLATES, VALID_KEYS };
