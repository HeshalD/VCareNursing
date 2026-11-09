import React from 'react';
import { ArrowDownLeft, ArrowUpRight, FileText, Pencil, Undo2 } from 'lucide-react';
import { fmt, fmtTime, methodLabel, CASH_OUT_LABELS, SOURCE_LABELS } from './registerUtils';

// One row per desk entry: a payment taken (money in) or cash paid out of the drawer.
// Voided entries stay on the list, struck through, so the day reads as it happened.
export const EntriesTable = ({ entries = [], readOnly = false, canManage, onEdit, onVoid }) => {
  if (entries.length === 0) {
    return <p className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5">Time</th>
            <th className="px-3 py-2.5">Entry</th>
            <th className="px-3 py-2.5">Customer / paid to</th>
            <th className="px-3 py-2.5">Method</th>
            <th className="px-3 py-2.5 text-right">Amount</th>
            <th className="px-3 py-2.5">Cashier</th>
            {!readOnly && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => {
            const isPayment = e.entry_type === 'PAYMENT';
            const strike = e.voided ? 'line-through text-slate-400' : '';
            const mine = canManage ? canManage(e) : false;
            return (
              <tr key={`${e.entry_type}-${e.id}`} className={e.voided ? 'bg-slate-50/60' : 'hover:bg-slate-50'}>
                <td className={`px-4 py-3 text-slate-500 ${strike}`}>{fmtTime(e.created_at)}</td>
                <td className="px-3 py-3">
                  <div className={`flex items-center gap-2 ${strike}`}>
                    {isPayment
                      ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
                      : <ArrowUpRight className="h-4 w-4 text-rose-600" />}
                    <span className="font-semibold text-slate-800">
                      {isPayment ? (SOURCE_LABELS[e.source_type] || 'Payment') : CASH_OUT_LABELS[e.kind] || 'Cash out'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {isPayment ? e.receipt_code : e.transaction_code}
                    {e.is_reissue && !e.voided ? ' · edited' : ''}
                    {e.voided ? ` · VOID${e.void_reason ? `: ${e.void_reason}` : ''}` : ''}
                  </p>
                </td>
                <td className={`px-3 py-3 text-slate-700 ${strike}`}>
                  {e.party || '—'}
                  {!isPayment && e.notes ? <span className="block text-xs text-slate-400">{e.notes}</span> : null}
                </td>
                <td className={`px-3 py-3 text-slate-600 ${strike}`}>{methodLabel(e.payment_method)}</td>
                <td className={`px-3 py-3 text-right font-bold ${e.voided ? 'text-slate-400 line-through' : isPayment ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isPayment ? '+' : '−'} {fmt(e.amount)}
                </td>
                <td className={`px-3 py-3 text-slate-600 ${strike}`}>{e.cashier_name || '—'}</td>
                {!readOnly && (
                  <td className="px-4 py-3 text-right">
                    {!e.voided && (
                      <div className="flex items-center justify-end gap-1">
                        {isPayment && e.pdf_url && (
                          <a href={e.pdf_url} target="_blank" rel="noreferrer" title="Open receipt"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                        {mine && isPayment && (
                          <button type="button" title="Edit payment" onClick={() => onEdit(e)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {mine && (
                          <button type="button" title="Void entry" onClick={() => onVoid(e)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Undo2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EntriesTable;
