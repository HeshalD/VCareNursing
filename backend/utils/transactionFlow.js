// Canonical cash-flow classification for transaction categories.
//
// IN      = real cash received by the company
// OUT     = real cash paid out by the company
// NEUTRAL = internal movement or accrual/record (excluded from In/Out totals)
//
// See TRANSACTION_CATEGORIES_GUIDE.md for the plain-language explanation.
// This is the single source of truth the API uses to compute summary totals and
// to filter by direction. The frontend mirrors these lists for display.

const IN_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP', 'OTHER_INCOME', 'PRODUCT_SALE', 'RENTAL_PAYMENT', 'REGISTRATION_FEE'];
const OUT_CATEGORIES = ['STAFF_SALARY_PAID', 'STAFF_ADVANCE', 'AGENCY_FEE', 'OTHER_EXPENSE', 'DEPOSIT_REFUND'];
// Everything else (STAFF_SALARY, SERVICE_INVOICE, WALLET_DEBIT, WALLET_REFUND,
// BOOKING_SETTLEMENT) is NEUTRAL.
//
// REGISTRATION_FEE is IN-only when transaction_type = 'CREDIT' (actual cash
// collected — see services/registrationFeeSplit.js). It's also used as a
// DEBIT "charge" record (see bookingController.js's convertToBooking) which
// must NOT be counted as money in — callers computing cash flow must filter
// on transaction_type = 'CREDIT' in addition to category, same as every
// other IN category (none of which are ever inserted as DEBIT today).
//
// Note: RENTAL_PAYMENT and PRODUCT_SALE amounts include any bundled refundable
// deposit collected at the same time (see rentalController.createRentalAgreementCore)
// — the deposit isn't a separate transaction until/unless it's refunded (DEPOSIT_REFUND).

// Categories an admin may create by hand via the "Add Transaction" form.
const MANUAL_CATEGORIES = ['OTHER_INCOME', 'OTHER_EXPENSE', 'AGENCY_FEE'];

function flowOf(category) {
  if (IN_CATEGORIES.includes(category)) return 'IN';
  if (OUT_CATEGORIES.includes(category)) return 'OUT';
  return 'NEUTRAL';
}

module.exports = { IN_CATEGORIES, OUT_CATEGORIES, MANUAL_CATEGORIES, flowOf };
