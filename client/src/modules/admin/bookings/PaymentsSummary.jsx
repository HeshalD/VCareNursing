import React from 'react';
import { Cap, Pill } from './PaymentsUi';
import { dd, rs } from './paymentsFormat';

// One card: overdue first, then the supporting totals and a paid-share bar.
export default function PaymentsSummary({ overdueAmount, totalInvoiced, paymentsReceived, walletBalance, walletApplied, lastPaymentDate }) {
  const pct = totalInvoiced > 0 ? Math.min(100, Math.round(((paymentsReceived + walletApplied) / totalInvoiced) * 100)) : 0;
  const stat = (label, value, cls = 'text-slate-900') => (
    <div><Cap>{label}</Cap><div className={`mt-1.5 text-xl font-bold tabular-nums ${cls}`}>{value}</div></div>
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-5">
      <div className="flex flex-wrap items-end gap-x-12 gap-y-5">
        <div>
          <Cap>Overdue</Cap>
          <div className="mt-1 flex items-center gap-2.5">
            <span className={`text-[28px] font-bold tabular-nums ${overdueAmount > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{rs(overdueAmount)}</span>
            {overdueAmount <= 0 && <Pill tone="ok">Nothing overdue</Pill>}
          </div>
        </div>
        {stat('Total invoiced', rs(totalInvoiced))}
        {stat('Payments received', rs(paymentsReceived))}
        {stat('Wallet balance', rs(walletBalance), walletBalance > 0 ? 'text-emerald-700' : 'text-slate-900')}
        {stat('Last payment', lastPaymentDate ? dd(lastPaymentDate) : '—')}
      </div>
      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded bg-slate-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the invoiced amount that is paid">
          <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[13px] text-slate-500">
          <span>{totalInvoiced > 0 ? `${pct}% of the invoiced amount is paid` : 'Nothing invoiced yet'}</span>
          <span>{overdueAmount > 0 ? `${rs(overdueAmount)} still to collect` : 'Fully paid'}</span>
        </div>
      </div>
    </div>
  );
}
