// Canonical cash-flow classification for transaction categories.
//
// IN      = real cash received by the company
// OUT     = real cash paid out by the company
// NEUTRAL = internal movement or accrual/record (excluded from In/Out totals)
//
// See TRANSACTION_CATEGORIES_GUIDE.md for the plain-language explanation.
// This is the single source of truth the API uses to compute summary totals and
// to filter by direction. The frontend mirrors these lists for display.

const IN_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP', 'OTHER_INCOME'];
const OUT_CATEGORIES = ['STAFF_SALARY_PAID', 'STAFF_ADVANCE', 'AGENCY_FEE', 'OTHER_EXPENSE'];
// Everything else (STAFF_SALARY, SERVICE_INVOICE, REGISTRATION_FEE, WALLET_DEBIT,
// WALLET_REFUND, BOOKING_SETTLEMENT) is NEUTRAL.

// Categories an admin may create by hand via the "Add Transaction" form.
const MANUAL_CATEGORIES = ['OTHER_INCOME', 'OTHER_EXPENSE', 'AGENCY_FEE'];

function flowOf(category) {
  if (IN_CATEGORIES.includes(category)) return 'IN';
  if (OUT_CATEGORIES.includes(category)) return 'OUT';
  return 'NEUTRAL';
}

module.exports = { IN_CATEGORIES, OUT_CATEGORIES, MANUAL_CATEGORIES, flowOf };
