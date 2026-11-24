import React from 'react';
import { Download, Search } from 'lucide-react';
import { Btn, FilterChip, Segmented } from './PaymentsUi';
import { METHODS } from './paymentsFormat';

export default function PaymentsToolbar({
  view, onView, receivedCount, walletCount, query, onQuery,
  methodFilter, onMethodFilter, methodCounts, unsentOnly, onUnsentOnly, unsentCount, onExport, canExport,
}) {
  const isRecv = view === 'recv';
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented label="Payment history views" value={view} onChange={onView}
          items={[{ id: 'recv', label: `Payments received · ${receivedCount}` }, { id: 'wal', label: `Applied from wallet · ${walletCount}` }]} />
        <div className="relative min-w-[200px] max-w-[300px] flex-[1_1_220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={e => onQuery(e.target.value)} aria-label="Search payments" placeholder="Search reference, notes, bank…"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </div>
        {isRecv && [['All', 'All'], ...METHODS].map(([k, label]) => (
          <FilterChip key={k} on={methodFilter === k} onClick={() => onMethodFilter(k)}>{label} · {methodCounts[k] ?? 0}</FilterChip>
        ))}
        {isRecv && unsentCount > 0 && <FilterChip warn on={unsentOnly} onClick={onUnsentOnly}>Receipt not sent · {unsentCount}</FilterChip>}
        <Btn className="ml-auto" onClick={onExport} disabled={!canExport}><Download className="h-4 w-4" aria-hidden="true" />Export CSV</Btn>
      </div>
      {!isRecv && <p className="text-[13px] text-slate-500">Money already in the client's wallet that was applied to this booking's invoices automatically. These are not new payments.</p>}
    </div>
  );
}
