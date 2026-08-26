// Canonical cash-flow classification for transaction categories.
//
// IN      = real cash received by the company
// OUT     = real cash paid out by the company
// NEUTRAL = internal movement or accrual/record (excluded from In/Out totals)
//
// See TRANSACTION_CATEGORIES_GUIDE.md for the plain-language explanation.
// This is the single source of truth the API uses to compute summary totals and
// to filter by direction. The frontend mirrors these lists for display.

const IN_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP', 'OTHER_INCOME', 'PRODUCT_SALE', 'RENTAL_PAYMENT', 'REGISTRATION_FEE', 'SETTLEMENT_FORFEITURE'];
const OUT_CATEGORIES = ['STAFF_SALARY_PAID', 'STAFF_ADVANCE', 'AGENCY_FEE', 'INTERNAL_STAFF_SALARY', 'OTHER_EXPENSE', 'DEPOSIT_REFUND', 'VENDOR_PAYMENT', 'CLIENT_REFUND'];
// Everything else (STAFF_SALARY, SERVICE_INVOICE, WALLET_DEBIT, WALLET_REFUND,
// BOOKING_SETTLEMENT) is NEUTRAL.
//
// SETTLEMENT_FORFEITURE / CLIENT_REFUND are the two money-moving outcomes when a
// booking ends early with unused prepayment (see services/bookingSettlement.js):
// the client either forfeits it — which the company keeps as income — or gets it
// back as a real refund. The third choice, leaving it in the client's wallet,
// moves no money and is recorded as a NEUTRAL WALLET_REFUND audit row instead.
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
// INTERNAL_STAFF_SALARY is for office/back-office salaries paid outside the
// care-worker wallet payout flow — distinct from STAFF_SALARY_PAID, which is
// reserved for wallet payouts (see staffController.js / paymentTrackingController.js).
const MANUAL_CATEGORIES = ['OTHER_INCOME', 'OTHER_EXPENSE', 'AGENCY_FEE', 'INTERNAL_STAFF_SALARY'];

function flowOf(category) {
  if (IN_CATEGORIES.includes(category)) return 'IN';
  if (OUT_CATEGORIES.includes(category)) return 'OUT';
  return 'NEUTRAL';
}

module.exports = { IN_CATEGORIES, OUT_CATEGORIES, MANUAL_CATEGORIES, flowOf };
