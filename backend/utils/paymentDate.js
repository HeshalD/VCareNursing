// Shared parsing for the optional "payment date" admins can enter when recording a
// payment. Mirrors the rules in clientPaymentController.recordClientPayment:
// omitted → received today; a past date backdates the ledger rows; a future date
// is rejected because it would date the ledger ahead of reality.
//
// Returns { error } on bad input, otherwise { paymentDate, ledgerTimestamp }:
//   paymentDate     — 'YYYY-MM-DD' string, or null when no date was supplied
//   ledgerTimestamp — a Date to stamp on ledger rows, or null to keep the DB
//                     default (now). Only a genuinely backdated payment sets it,
//                     so same-day payments keep their real chronological order.
const parsePaymentDate = (raw) => {
  if (!raw) return { paymentDate: null, ledgerTimestamp: null };

  const paidOn = new Date(raw);
  if (isNaN(paidOn.getTime())) {
    return { error: 'payment_date is not a valid date' };
  }
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (paidOn.getTime() > endOfToday.getTime()) {
    return { error: 'payment_date cannot be in the future' };
  }

  const paymentDate = paidOn.toISOString().slice(0, 10);
  const t = new Date();
  const today = [
    t.getFullYear(),
    String(t.getMonth() + 1).padStart(2, '0'),
    String(t.getDate()).padStart(2, '0'),
  ].join('-');

  return { paymentDate, ledgerTimestamp: paymentDate < today ? paidOn : null };
};

module.exports = { parsePaymentDate };
