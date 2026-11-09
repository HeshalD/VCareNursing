export const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
export const fmt = (v) => money.format(Number(v || 0));

export const fmtTime = (d) => (d
  ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  : '—');

export const fmtDate = (d) => {
  if (!d) return '—';
  // business_date arrives as YYYY-MM-DD; parse as a local date so it never shifts a day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (d) => (d
  ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

export const METHOD_LABELS = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CASH_DEPOSIT: 'Cash deposit',
  CHEQUE: 'Cheque',
  ONLINE_GATEWAY: 'Online',
  OTHER: 'Other',
};
export const methodLabel = (m) => METHOD_LABELS[m] || String(m || '').replace(/_/g, ' ');

export const CASH_OUT_LABELS = {
  PETTY_CASH: 'Petty cash',
  CLIENT_REFUND: 'Client refund',
  BANKING: 'Cash banked',
};

export const SOURCE_LABELS = {
  CLIENT_PAYMENT: 'Booking / wallet',
  QUOTE_PAYMENT: 'Quotation',
  BOOKING_PAYMENT: 'Booking',
  PRODUCT_INVOICE: 'Product / rental invoice',
};

export const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1';
export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100';

// The user id carried in the admin JWT (the context only exposes the raw token).
export const userIdFromToken = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1])).user_id || null;
  } catch {
    return null;
  }
};
