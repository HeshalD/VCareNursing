import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Wallet, X } from 'lucide-react';
import apiClient from '../../../api/api';

// Pay unpaid invoices out of the client's wallet. The server decides which money is used and
// rolls the same calculation back for the preview, so what is shown here is what will happen:
//   1. the invoice's own booking's reserved money, then unreserved money;
//   2. money reserved for OTHER bookings only when the admin switches the override on and gives a
//      reason (those bookings are left with less prepaid cover).

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));
const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const keyOf = (t) => `${t.type}:${t.id || ''}`;
const TYPE_LABEL = { DAY: 'Care day', PRODUCT: 'Product / rental', REG_FEE: 'Registration fee' };
const fieldCls = 'rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

export default function WalletPayModal({ open, onClose, clientId, targets = [], onPaid }) {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [amounts, setAmounts] = useState({});
  const [allowOther, setAllowOther] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState({ loading: false, data: null, error: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(null);
  const previewSeq = useRef(0);

  // Load wallet + dues whenever the modal opens.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setInfo(null); setInfoError(''); setAmounts({}); setAllowOther(false); setReason(''); setNote('');
    setPreview({ loading: false, data: null, error: '' }); setSubmitError(''); setDone(null);
    apiClient.getWalletPayInfo(clientId)
      .then((res) => { if (!cancelled) setInfo(res?.data || null); })
      .catch((err) => { if (!cancelled) setInfoError(err?.message || 'Could not load the wallet'); });
    return () => { cancelled = true; };
  }, [open, clientId]);

  // Each requested target, joined with what is actually due now.
  const lines = useMemo(() => {
    if (!info) return [];
    const p = info.payable || {};
    return targets.map((t) => {
      if (t.type === 'DAY') {
        const d = (p.days || []).find((x) => x.id === t.id);
        return { ...t, key: keyOf(t), due: d?.due || 0, label: d ? `${d.booking_code} · ${fmtDate(d.service_date)}` : 'Care day' };
      }
      if (t.type === 'PRODUCT') {
        const d = (p.products || []).find((x) => x.id === t.id);
        return { ...t, key: keyOf(t), due: d?.due || 0, label: d?.code || 'Invoice' };
      }
      return { ...t, key: keyOf(t), due: p.reg_fee_due || 0, label: 'Registration fee' };
    });
  }, [info, targets]);

  const payableLines = lines.filter((l) => l.due > 0.005);
  const amountFor = (l) => {
    const raw = amounts[l.key];
    if (raw === undefined || raw === '') return l.due;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? 0 : n;
  };
  const total = payableLines.reduce((s, l) => s + amountFor(l), 0);
  const invalidLine = payableLines.find((l) => amountFor(l) <= 0 || amountFor(l) > l.due + 0.005);

  const payload = useMemo(() => ({
    targets: payableLines.map((l) => ({ type: l.type, id: l.id || null, amount: Math.round(amountFor(l) * 100) / 100 })),
    allow_other_earmarks: allowOther,
    override_reason: allowOther ? reason.trim() : undefined,
    note: note.trim() || undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [payableLines.map((l) => `${l.key}=${amountFor(l)}`).join('|'), allowOther, reason, note]);

  // Live preview (the server runs the real payment and rolls it back).
  useEffect(() => {
    if (!open || !info || payableLines.length === 0 || invalidLine) { setPreview({ loading: false, data: null, error: '' }); return undefined; }
    const seq = ++previewSeq.current;
    setPreview((p) => ({ ...p, loading: true, error: '' }));
    const timer = setTimeout(() => {
      apiClient.previewWalletPay(clientId, payload)
        .then((res) => { if (seq === previewSeq.current) setPreview({ loading: false, data: res?.data || null, error: '' }); })
        .catch((err) => { if (seq === previewSeq.current) setPreview({ loading: false, data: null, error: err?.message || 'Could not preview this payment' }); });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, info, payload, invalidLine]);

  if (!open) return null;

  const needsOverride = /override/i.test(preview.error) && !allowOther;
  const reasonMissing = allowOther && reason.trim().length < 3;
  const canConfirm = !submitting && !preview.loading && preview.data && !preview.error && !invalidLine && !reasonMissing && payableLines.length > 0;
  const bd = preview.data?.breakdown;

  const submit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const res = await apiClient.walletPay(clientId, payload);
      setDone(res?.data || {});
      onPaid?.(res?.data);
    } catch (err) {
      setSubmitError(err?.message || 'The payment could not be completed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-gray-900">Pay from client wallet</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {infoError && <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5" /> {infoError}</div>}
          {!info && !infoError && <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading wallet…</div>}

          {done ? (
            <div className="space-y-3 py-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="text-sm font-semibold text-gray-900">{fmt(done.total)} paid from the wallet</p>
              <p className="text-xs text-gray-500">Wallet balance is now {fmt(done.wallet_after)}.</p>
              <button type="button" onClick={onClose} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">Done</button>
            </div>
          ) : info && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Wallet</p>
                  <p className="text-base font-semibold text-gray-900">{fmt(info.wallet_balance)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Reserved for bookings</p>
                  <p className="text-base font-semibold text-gray-900">{fmt(info.reserved_total)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Unreserved</p>
                  <p className="text-base font-semibold text-gray-900">{fmt(info.unreserved)}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Invoice</th>
                      <th className="px-3 py-2 text-right">Due</th>
                      <th className="px-3 py-2 text-right">Pay now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l) => (
                      <tr key={l.key}>
                        <td className="px-3 py-2 text-gray-700">
                          {l.label}
                          <span className="block text-[11px] text-gray-400">{TYPE_LABEL[l.type]}{l.due <= 0.005 ? ' · nothing due' : ''}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(l.due)}</td>
                        <td className="px-3 py-2 text-right">
                          {l.due > 0.005 ? (
                            <input
                              type="number" min="0" step="0.01" max={l.due}
                              value={amounts[l.key] === undefined ? l.due : amounts[l.key]}
                              onChange={(e) => setAmounts((a) => ({ ...a, [l.key]: e.target.value }))}
                              className={`${fieldCls} w-32 text-right`}
                            />
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm font-semibold text-gray-900">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>Total</td>
                      <td className={`px-3 py-2 text-right ${total > info.wallet_balance + 0.005 ? 'text-rose-600' : ''}`}>{fmt(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {invalidLine && <p className="text-xs text-rose-600">Each amount must be more than 0 and no more than what is due.</p>}
              {total > info.wallet_balance + 0.005 && <p className="text-xs text-rose-600">The total is more than the wallet balance ({fmt(info.wallet_balance)}). Lower an amount.</p>}

              {/* What money will be used — straight from the server's dry run. */}
              {preview.loading && <p className="flex items-center gap-1.5 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking which money will be used…</p>}
              {bd && !preview.loading && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="font-semibold">Money used for this payment</p>
                  <ul className="mt-1 space-y-0.5">
                    {bd.fromOwn > 0 && <li>{fmt(bd.fromOwn)} reserved for the invoice’s own booking</li>}
                    {bd.fromUnreserved > 0 && <li>{fmt(bd.fromUnreserved)} unreserved wallet money</li>}
                    {bd.fromOthers > 0 && <li className="font-semibold text-amber-800">{fmt(bd.fromOthers)} reserved for other bookings ({bd.others.map((o) => `${o.booking_code} ${fmt(o.amount)}`).join(', ')})</li>}
                  </ul>
                  <p className="mt-1 text-emerald-700">Wallet after: {fmt(preview.data.wallet_after)}</p>
                </div>
              )}
              {preview.error && !needsOverride && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {preview.error}</div>
              )}

              {/* Explicit override: the client's money is one pool, but reserved money has a purpose. */}
              {(needsOverride || allowOther || info.reservations.length > 0) && (
                <div className={`rounded-lg border p-3 ${needsOverride ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                  <label className="flex items-start gap-2 text-sm text-gray-800">
                    <input type="checkbox" checked={allowOther} onChange={(e) => setAllowOther(e.target.checked)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">Also use money reserved for other bookings</span>
                      <span className="block text-xs text-gray-500">Those bookings will have less prepaid cover and may go overdue sooner. This is logged with your reason.</span>
                    </span>
                  </label>
                  {needsOverride && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {preview.error}</p>
                  )}
                  {allowOther && (
                    <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className={`${fieldCls} mt-2 w-full`} />
                  )}
                  {info.reservations.length > 0 && (
                    <p className="mt-2 text-[11px] text-gray-400">Reserved: {info.reservations.map((r) => `${r.booking_code} ${fmt(r.reserved)}`).join(' · ')}</p>
                  )}
                </div>
              )}

              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={`${fieldCls} w-full`} />
              {submitError && <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {submitError}</div>}
            </>
          )}
        </div>

        {!done && info && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button type="button" onClick={onClose} className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            <button
              type="button" onClick={submit} disabled={!canConfirm}
              className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Pay {fmt(total)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
