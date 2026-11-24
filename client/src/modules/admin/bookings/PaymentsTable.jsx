import React from 'react';
import { Btn, Pill } from './PaymentsUi';
import { dd, num, receiptState, RECEIPT_META, referenceText, rs } from './paymentsFormat';

const GRID = 'grid items-center gap-x-4 px-5 grid-cols-[130px_160px_minmax(140px,1fr)_160px_260px]';

// Receipt status pill + ONE primary action (+ PDF link when a PDF exists).
export function ReceiptCell({ payment, receipt, busy, onAction }) {
  if (payment.method === 'WALLET') return <span className="text-[13px] text-slate-500">No receipt</span>;
  const meta = RECEIPT_META[receiptState(receipt)];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={meta.tone}>{meta.label}</Pill>
      <Btn size="sm" tone={meta.primary ? 'primary' : 'neutral'} disabled={busy} onClick={() => onAction(payment)}>{busy ? 'Working…' : meta.action}</Btn>
      {receipt?.pdf_url && <a href={receipt.pdf_url} target="_blank" rel="noreferrer" className="rounded-md px-2.5 py-1 text-[13px] font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">PDF</a>}
    </div>
  );
}

export default function PaymentsTable({
  rows, isWallet, limit, onMore, highlightId, receiptByPayment, receiptBusy, onOpen, onReceiptAction, onClear,
}) {
  const shown = rows.slice(0, limit);
  const more = rows.length - limit;
  const sum = rows.reduce((t, p) => t + Number(p.amount || 0), 0);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className={`${GRID} min-h-[38px] border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500`}>
            <div>Date</div><div>Method</div><div>Reference</div><div className="text-right">Amount (LKR)</div><div>Receipt</div>
          </div>
          {shown.map(p => {
            const rcpt = receiptByPayment[p.id];
            const busy = (!!rcpt && receiptBusy === rcpt.receipt_id) || receiptBusy === `gen-${p.id}`;
            return (
              <div key={p.id} className={`${GRID} min-h-[60px] border-b border-slate-100 py-2 text-sm text-slate-700 transition-colors duration-500 hover:bg-slate-50 ${highlightId === p.id ? 'bg-blue-50' : 'bg-white'}`}>
                <div><button type="button" onClick={() => onOpen(p)} className="text-left font-semibold text-slate-900 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">{dd(p.date)}</button></div>
                <div>
                  <div>{isWallet ? 'Wallet' : p.methodLabel}</div>
                  {p.bankName && <div className="text-[13px] text-slate-500">{p.bankName}</div>}
                </div>
                <div className="truncate" title={referenceText(p)}>{referenceText(p)}</div>
                <div className="flex items-center justify-end gap-2">
                  {p.wasEdited && <Pill tone="warn">Edited</Pill>}
                  <b className="tabular-nums text-slate-900">{num(p.amount)}</b>
                </div>
                <ReceiptCell payment={p} receipt={rcpt} busy={busy} onAction={onReceiptAction} />
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-500">Nothing matches. <Btn className="ml-2" onClick={onClear}>Clear filters</Btn></div>
          )}
          {more > 0 && <div className="border-t border-slate-100 p-3.5 text-center"><Btn onClick={onMore}>Show {Math.min(5, more)} more</Btn></div>}
          <div className={`${GRID} min-h-[48px] border-t border-slate-200 bg-slate-50 text-sm font-semibold`}>
            <div className="col-span-3 text-slate-600">{rows.length} {isWallet ? 'wallet application' : 'payment'}{rows.length === 1 ? '' : 's'}</div>
            <div className="text-right tabular-nums text-slate-900">{rs(sum)}</div>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
}
