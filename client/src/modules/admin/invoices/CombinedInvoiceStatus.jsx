import React from 'react';

// A combined invoice can be generated before the quotation is fully paid, so every row
// carries a payment status from the API: PAID | PARTIAL | PENDING.
const STATUS_STYLES = {
  PAID: { label: 'Paid', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  PARTIAL: { label: 'Partially paid', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  PENDING: { label: 'Pending', cls: 'bg-slate-50 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

export const CombinedPaymentBadge = ({ status }) => {
  const style = STATUS_STYLES[status] || STATUS_STYLES.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
};

export const isCombinedUnpaid = (inv) => inv?.payment_status !== 'PAID';

export const COMBINED_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'UNPAID', label: 'Pending payment' },
  { id: 'PAID', label: 'Paid' },
];

export const filterCombinedInvoices = (invoices, filter) => {
  if (filter === 'UNPAID') return invoices.filter(isCombinedUnpaid);
  if (filter === 'PAID') return invoices.filter((inv) => !isCombinedUnpaid(inv));
  return invoices;
};

export const CombinedStatusFilter = ({ invoices, value, onChange }) => {
  const counts = {
    ALL: invoices.length,
    UNPAID: invoices.filter(isCombinedUnpaid).length,
    PAID: invoices.filter((inv) => !isCombinedUnpaid(inv)).length,
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {COMBINED_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            value === f.id
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {f.label} <span className="ml-0.5 text-slate-400">{counts[f.id]}</span>
        </button>
      ))}
    </div>
  );
};
