// Cash-flow classification and display config for transaction categories.
// Mirrors backend/utils/transactionFlow.js — single source of truth for the
// frontend so every ledger view (company-wide Transactions page, per-account
// Bank Account detail) renders categories, direction, and colors identically.

export const IN_CATEGORIES = ['CLIENT_PAYMENT', 'BOOKING_PAYMENT', 'WALLET_TOPUP', 'OTHER_INCOME', 'PRODUCT_SALE', 'RENTAL_PAYMENT', 'REGISTRATION_FEE'];
export const OUT_CATEGORIES = ['STAFF_SALARY_PAID', 'STAFF_ADVANCE', 'AGENCY_FEE', 'INTERNAL_STAFF_SALARY', 'OTHER_EXPENSE', 'DEPOSIT_REFUND', 'VENDOR_PAYMENT'];

// REGISTRATION_FEE is the one category used on both sides of the ledger —
// a DEBIT "charge" record (billed, not yet cash) and a CREDIT record (actual
// cash collected — see backend/services/registrationFeeSplit.js). Every other
// IN/OUT category is CREDIT-only, so transactionType only matters here.
export const flowOf = (category, transactionType) => {
  if (category === 'REGISTRATION_FEE') return transactionType === 'CREDIT' ? 'IN' : 'NEUTRAL';
  if (IN_CATEGORIES.includes(category)) return 'IN';
  if (OUT_CATEGORIES.includes(category)) return 'OUT';
  return 'NEUTRAL';
};

// Visual identity per category — dot + tinted text so each type is recognizable at a glance
export const CATEGORY_CONFIG = {
  CLIENT_PAYMENT:     { label: 'Client Payment',     dot: 'bg-emerald-500', text: 'text-emerald-700' },
  BOOKING_PAYMENT:    { label: 'Booking Payment',    dot: 'bg-blue-400',    text: 'text-blue-700' },
  WALLET_TOPUP:       { label: 'Wallet Top-up',      dot: 'bg-teal-400',    text: 'text-teal-700' },
  OTHER_INCOME:       { label: 'Other Income',       dot: 'bg-green-500',   text: 'text-green-700' },
  STAFF_SALARY_PAID:  { label: 'Salary Paid',        dot: 'bg-violet-400',  text: 'text-violet-700' },
  STAFF_ADVANCE:      { label: 'Salary Advance',     dot: 'bg-fuchsia-400', text: 'text-fuchsia-700' },
  AGENCY_FEE:         { label: 'Agency Fee',         dot: 'bg-indigo-400',  text: 'text-indigo-700' },
  INTERNAL_STAFF_SALARY: { label: 'Internal Staff Salary', dot: 'bg-pink-400', text: 'text-pink-700' },
  OTHER_EXPENSE:      { label: 'Other Expense',      dot: 'bg-rose-400',    text: 'text-rose-700' },
  STAFF_SALARY:       { label: 'Staff Salary',       dot: 'bg-purple-400',  text: 'text-purple-700' },
  SERVICE_INVOICE:    { label: 'Service Invoice',    dot: 'bg-cyan-400',    text: 'text-cyan-700' },
  REGISTRATION_FEE:   { label: 'Registration Fee',   dot: 'bg-lime-500',    text: 'text-lime-700' },
  WALLET_DEBIT:       { label: 'Wallet Debit',       dot: 'bg-orange-400',  text: 'text-orange-700' },
  WALLET_REFUND:      { label: 'Wallet Refund',      dot: 'bg-amber-400',   text: 'text-amber-700' },
  BOOKING_SETTLEMENT: { label: 'Booking Settlement', dot: 'bg-sky-400',     text: 'text-sky-700' },
  PRODUCT_SALE:       { label: 'Product Sale',       dot: 'bg-emerald-400', text: 'text-emerald-700' },
  RENTAL_PAYMENT:     { label: 'Rental Payment',     dot: 'bg-purple-400',  text: 'text-purple-700' },
  DEPOSIT_REFUND:     { label: 'Deposit Refund',     dot: 'bg-rose-400',    text: 'text-rose-700' },
  ACCOUNT_TRANSFER:   { label: 'Account Transfer',   dot: 'bg-slate-400',   text: 'text-slate-600' },
  VENDOR_PAYMENT:     { label: 'Vendor Payment',     dot: 'bg-red-400',     text: 'text-red-700' },
};

export const categoryBadge = (category, customLabel) => {
  const cfg = CATEGORY_CONFIG[category] || {
    label: (category || 'Unknown').replace(/_/g, ' '),
    dot: 'bg-slate-400',
    text: 'text-slate-600',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {customLabel || cfg.label}
    </span>
  );
};

// Who/what the transaction relates to: external party (manual), client + patient, or staff
export const relatedTo = (tx) => {
  if (tx.external_party) {
    return { primary: tx.external_party, secondary: 'External party' };
  }
  if (tx.client_name) {
    const parts = [];
    if (tx.patient_name) parts.push(`Care Profile: ${tx.patient_name}`);
    if (tx.booking_service_type) parts.push(tx.booking_service_type);
    return { primary: tx.client_name, secondary: parts.join(' · ') || 'Client' };
  }
  if (tx.staff_name) {
    return { primary: tx.staff_name, secondary: 'Staff member' };
  }
  return { primary: '—', secondary: '' };
};

// Amount text color by cash-flow direction — used wherever a transaction's
// amount is rendered so IN/OUT/NEUTRAL is visually obvious at a glance.
export const flowAmountClass = (category, transactionType) => {
  const flow = flowOf(category, transactionType);
  if (flow === 'IN') return 'text-emerald-700';
  if (flow === 'OUT') return 'text-rose-600';
  return 'text-slate-800';
};

// Signed amount prefix ("+" / "−") by cash-flow direction, for use next to a formatted amount.
export const flowSign = (category, transactionType) => {
  const flow = flowOf(category, transactionType);
  if (flow === 'IN') return '+ ';
  if (flow === 'OUT') return '− ';
  return '';
};
