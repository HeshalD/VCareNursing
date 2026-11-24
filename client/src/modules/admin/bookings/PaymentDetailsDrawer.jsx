import React from 'react';
import { Btn, Cap, Drawer, Pill } from './PaymentsUi';
import { dd, receiptState, RECEIPT_META, referenceText, rs } from './paymentsFormat';

export default function PaymentDetailsDrawer({ payment, receipt, busy, onClose, onReceiptAction }) {
  const p = payment;
  const isWallet = p?.method === 'WALLET';
  const meta = RECEIPT_META[receiptState(receipt)];
  const partial = receipt && receipt.allocated_amount != null && Math.abs(Number(receipt.total_amount) - Number(receipt.allocated_amount)) > 0.5;
  const facts = p ? [
    ['Date', dd(p.date)],
    ['Method', isWallet ? 'Wallet' : p.methodLabel],
    ['Bank', p.bankName || '—'],
    ['Reference', referenceText(p)],
    ...(p.chequeNumber || p.method === 'CHEQUE' ? [['Cheque no.', p.chequeNumber || '—'], ['Cheque date', p.chequeDate ? dd(p.chequeDate) : '—']] : []),
  ] : [];
  return (
    <Drawer open={!!p} onClose={onClose} label="Payment details" title="Payment details" widthClass="max-w-[440px]"
      subtitle={isWallet ? 'Applied from wallet' : 'Payment received'}>
      {p && (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm text-slate-700">
          <div>
            <Cap>Amount</Cap>
            <div className="mt-0.5 text-[28px] font-bold tabular-nums text-slate-900">{rs(p.amount)}</div>
            {(p.wasEdited || p.productInvoice) && (
              <div className="mt-1.5 flex gap-1.5">{p.wasEdited && <Pill tone="warn">Edited</Pill>}{p.productInvoice && <Pill tone="info">Product invoice</Pill>}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {facts.map(([k, v]) => <div key={k}><Cap>{k}</Cap><div className="mt-0.5 break-words">{v}</div></div>)}
          </div>
          <div><Cap>Notes</Cap><div className="mt-0.5 leading-relaxed">{p.notes && p.notes !== '-' ? p.notes : 'No notes.'}</div></div>
          {p.slipUrl && (
            <div><Cap>Payment slip</Cap>
              <a href={p.slipUrl} target="_blank" rel="noreferrer" className="mt-0.5 inline-block font-semibold text-blue-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">View slip</a>
            </div>
          )}
          {isWallet ? (
            <p className="leading-relaxed text-slate-500">Applied automatically from the client's wallet. This is not a new payment, so there is no receipt.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 p-3.5">
              <div className="flex items-center justify-between"><Cap>Receipt</Cap><Pill tone={meta.tone}>{meta.label}</Pill></div>
              {receipt?.whatsapp_sent && <div className="mt-1.5 text-[13px] text-slate-500">Sent on WhatsApp{receipt.whatsapp_sent_at ? ` on ${dd(receipt.whatsapp_sent_at)}` : ''}</div>}
              {partial && <div className="mt-1.5 text-[13px] text-slate-500">Receipt covers {rs(receipt.total_amount)} (this booking: {rs(receipt.allocated_amount)})</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn size="sm" tone={meta.primary ? 'primary' : 'neutral'} disabled={busy} onClick={() => onReceiptAction(p)}>{busy ? 'Working…' : meta.action}</Btn>
                {receipt?.pdf_url && <a href={receipt.pdf_url} target="_blank" rel="noreferrer" className="inline-flex h-[30px] items-center rounded-md border border-slate-300 bg-white px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Download PDF</a>}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
