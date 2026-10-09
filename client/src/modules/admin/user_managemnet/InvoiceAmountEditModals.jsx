import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Lock, X } from 'lucide-react';
import apiClient from '../../../api/api';

// Edit-amount dialogs for the client Invoices panel (opened through
// useInvoiceAmountEditor). One dialog per shape; each type posts to the endpoint that owns its money:
//   CARE     → bookings/:id/invoices/:date/amount   (services/amountCorrections.js)
//   REG_FEE  → client/:id/reg-fee-amount            (clientController.updateRegFeeAmount)
//   PRODUCT / EXTRA → product-invoices/:id/amount   (services/invoiceAmountEdits.js)
//   COMBINED → quotes/:id/invoice-amounts           (edits the quotation's lines)
// Every edit is recorded with who/when/why and shows as an "Edited" badge.

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmtMoney = (v) => money.format(Number(v || 0));
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const fieldCls = 'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-400';

const EXPLAIN = {
  CARE: 'The day stays billed. Its original invoice entry is updated to the new amount and marked as edited. A higher amount is drawn from the client\'s wallet; a lower one reduces what they owe — any surplus is settled when the booking closes.',
  REG_FEE: 'Updates this registration invoice (and its payment record, if already paid) and regenerates the PDF.',
  PRODUCT: 'Changes what the client owes on this invoice. It can\'t go below what has already been paid. The PDF is regenerated with an adjustment line.',
  EXTRA: 'Changes this charge on its quotation, so the quotation total and its combined invoice update too. It can\'t go below what has already been paid towards it.',
};

function Shell({ title, subtitle, onClose, busy, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex-col overflow-hidden rounded-xl bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function ReasonField({ value, onChange, disabled }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">Reason <span className="text-rose-500">*</span></span>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Why is this amount being changed?"
        className={fieldCls}
      />
      <span className="mt-1 block text-[11px] text-gray-400">Saved with your name and the time, and shown on the invoice's "Edited" marker.</span>
    </label>
  );
}

function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message}
    </div>
  );
}

function SaveButtons({ busy, disabled, onClose, onSave }) {
  return (
    <>
      <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={busy || disabled}
        className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save change
      </button>
    </>
  );
}

// ── One amount (care day, registration fee, product/rental, extra charge) ────
export function SingleAmountModal({ target, clientId, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(target.currentAmount ?? ''));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsed = amount === '' ? NaN : parseFloat(amount);
  const valid = !Number.isNaN(parsed) && parsed >= 0 && (target.kind === 'CARE' || parsed > 0);
  const delta = valid ? round2(parsed - Number(target.currentAmount || 0)) : null;
  const belowPaid = valid && target.paid > 0 && parsed < target.paid - 0.01;

  const save = async () => {
    if (!valid || !reason.trim() || delta === 0) return;
    setBusy(true); setError('');
    try {
      const payload = { new_amount: parsed, reason: reason.trim() };
      if (target.kind === 'CARE') {
        await apiClient.correctInvoiceAmount(target.bookingId, target.serviceDate, { ...payload, daily_invoice_id: target.dailyInvoiceId });
      } else if (target.kind === 'REG_FEE') {
        await apiClient.updateRegFeeAmount(clientId, { amount: parsed, reason: reason.trim(), invoice_id: target.invoiceId });
      } else {
        await apiClient.editInvoiceAmount(target.invoiceId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save the new amount');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      title="Edit invoice amount"
      subtitle={[target.label, target.code].filter(Boolean).join(' · ')}
      onClose={onClose}
      busy={busy}
      footer={<SaveButtons busy={busy} disabled={!valid || !reason.trim() || delta === 0 || belowPaid} onClose={onClose} onSave={save} />}
    >
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">{EXPLAIN[target.kind]}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs font-semibold text-gray-600">Current</span>
          <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm tabular-nums text-gray-700">{fmtMoney(target.currentAmount)}</div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-600">New amount <span className="text-rose-500">*</span></span>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className={`${fieldCls} tabular-nums`} />
        </label>
      </div>

      {target.paid > 0 && (
        <p className={`text-xs ${belowPaid ? 'text-rose-600' : 'text-gray-500'}`}>
          {fmtMoney(target.paid)} has already been paid{belowPaid ? ' — the new amount can\'t be lower than that.' : '.'}
        </p>
      )}
      {delta !== null && delta !== 0 && !belowPaid && (
        <p className={`rounded-md px-3 py-2 text-xs ${delta > 0 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {delta > 0 ? `The client will owe ${fmtMoney(delta)} more.` : `The client will owe ${fmtMoney(-delta)} less.`}
        </p>
      )}

      <ReasonField value={reason} onChange={setReason} disabled={busy} />
      <ErrorNote message={error} />
    </Shell>
  );
}

// ── Combined invoice: the service quotation's own lines ──────────────────────
export function QuotationAmountsModal({ target, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiClient.getQuoteInvoiceLines(target.quoteId)
      .then((res) => {
        if (!alive) return;
        setData(res.data);
        setValues(Object.fromEntries(res.data.lines.map((l) => [l.line_item_id, String(Math.abs(l.amount))])));
      })
      .catch((err) => alive && setLoadError(err?.message || 'Failed to load the quotation'));
    return () => { alive = false; };
  }, [target.quoteId]);

  const signed = (line, raw) => {
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0) return null;
    return line.item_type === 'DISCOUNT' ? -n : n;
  };

  const { changes, invalid, newTotal } = useMemo(() => {
    if (!data) return { changes: [], invalid: false, newTotal: 0 };
    let bad = false;
    let total = 0;
    const out = [];
    data.lines.forEach((l) => {
      const v = l.locked ? l.amount : signed(l, values[l.line_item_id]);
      if (v === null) { bad = true; return; }
      total += v;
      if (!l.locked && round2(v) !== round2(l.amount)) out.push({ line_item_id: l.line_item_id, new_amount: Math.abs(v), below: l.item_type !== 'DISCOUNT' && v < l.allocated - 0.01 });
    });
    return { changes: out, invalid: bad || out.some((c) => c.below), newTotal: round2(total) };
  }, [data, values]);

  const paid = data?.quote.amount_paid || 0;
  const belowPaid = data && newTotal < paid - 0.01;

  const save = async () => {
    if (!changes.length || invalid || belowPaid || !reason.trim()) return;
    setBusy(true); setError('');
    try {
      await apiClient.editQuoteInvoiceAmounts(target.quoteId, {
        items: changes.map(({ line_item_id, new_amount }) => ({ line_item_id, new_amount })),
        reason: reason.trim(),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save the new amounts');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      wide
      title="Edit combined invoice"
      subtitle={[target.code, data?.quote.estimate_number && `Quotation ${data.quote.estimate_number}`].filter(Boolean).join(' · ')}
      onClose={onClose}
      busy={busy}
      footer={<SaveButtons busy={busy} disabled={!changes.length || invalid || belowPaid || !reason.trim()} onClose={onClose} onSave={save} />}
    >
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
        The combined invoice is built from its quotation&apos;s lines. Change the lines below; the quotation total, its balance,
        any extra-charge invoices and the combined PDF (same invoice number) all update. Linked product items are edited from their product invoice.
      </p>

      {!data && !loadError && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      )}
      <ErrorNote message={loadError} />

      {data && (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left">Line</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">New amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.lines.map((l) => {
                  const change = changes.find((c) => c.line_item_id === l.line_item_id);
                  return (
                    <tr key={l.line_item_id}>
                      <td className="px-3 py-2 text-gray-700">
                        <span className="block">{l.description}{l.item_type === 'DISCOUNT' && <span className="ml-1 text-[11px] text-gray-400">(discount)</span>}</span>
                        {l.locked && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Lock className="h-3 w-3" /> {l.locked}</span>}
                        {!l.locked && l.allocated > 0 && (
                          <span className={`block text-[11px] ${change?.below ? 'text-rose-600' : 'text-gray-400'}`}>{fmtMoney(l.allocated)} paid towards it{change?.below ? ' — can\'t go lower' : ''}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-500 whitespace-nowrap">{fmtMoney(l.amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.locked ? String(Math.abs(l.amount)) : (values[l.line_item_id] ?? '')}
                          onChange={(e) => setValues((v) => ({ ...v, [l.line_item_id]: e.target.value }))}
                          disabled={busy || !!l.locked}
                          className={`${fieldCls} w-32 text-right tabular-nums ${change ? 'border-amber-300 bg-amber-50' : ''}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 text-sm">
                <tr>
                  <td className="px-3 py-2 font-semibold text-gray-700">Quotation total</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-500">{fmtMoney(data.quote.total_amount)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${belowPaid ? 'text-rose-600' : 'text-gray-900'}`}>{fmtMoney(newTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={`text-xs ${belowPaid ? 'text-rose-600' : 'text-gray-500'}`}>
            {fmtMoney(paid)} has been paid on this quotation{belowPaid ? ' — the total can\'t go below that.' : '.'}
          </p>
          <ReasonField value={reason} onChange={setReason} disabled={busy} />
        </>
      )}
      <ErrorNote message={error} />
    </Shell>
  );
}
