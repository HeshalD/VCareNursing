import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, History, Info, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';

// Client detail → Registration fee record. One place that answers, without guesswork:
// is the fee invoiced, how was it paid (or why not), and how does it feed Total Invoiced,
// Payments Made and Overdue. Everything comes from GET /client/:id/registration-audit,
// which reads the same ledger rules as the headline figures (services/clientFinancials.js).

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmtMoney = (v) => money.format(Number(v || 0));
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const SOURCE_TONE = {
  CHARGE: 'bg-slate-100 text-slate-700',
  OVERDUE_INVOICE: 'bg-slate-100 text-slate-700',
  WALLET: 'bg-violet-50 text-violet-700',
  PRIORITY_MEMBERSHIP: 'bg-fuchsia-50 text-fuchsia-700',
  QUOTATION: 'bg-sky-50 text-sky-700',
  BACKDATED: 'bg-amber-50 text-amber-700',
  MARK_PAID: 'bg-amber-50 text-amber-700',
  RECEIPT_VERIFIED: 'bg-emerald-50 text-emerald-700',
  DIRECT: 'bg-emerald-50 text-emerald-700',
};

const PROBLEM_HELP = {
  PAID_NO_RECORD: 'Mark it paid with a real payment, or correct the status.',
  PAID_NOT_INVOICED: 'Invoice the fee so it appears in Total Invoiced.',
  PARTIAL: 'Collect the balance or record the remaining payment.',
  OVERPAID: 'Decide whether the extra amount is refunded or held as wallet credit.',
  STATUS_LEDGER_MISMATCH: 'The profile and the ledger disagree — fix whichever is wrong.',
  DUPLICATE_DEBIT: 'Remove the duplicate charge.',
  WAIVED_BUT_PAID: 'A waived fee should have no payment — review it.',
};

function Chip({ label, value, hint, tone = 'text-gray-900' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2" title={hint}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm font-bold ${tone}`}>{value}</div>
    </div>
  );
}

export default function RegistrationAuditPanel({ clientId, refreshKey }) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clientId) return;
      try {
        setLoading(true);
        setError('');
        const res = await apiClient.getClientRegistrationAudit(clientId);
        if (!cancelled) setAudit(res?.data || null);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not load the registration fee record.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, refreshKey]);

  if (loading && !audit) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading registration fee record…
      </div>
    );
  }
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>;
  if (!audit) return null;

  const { status, ledger, legacy, totals, contribution, check, history, pdf_invoices: pdfs } = audit;
  const nothingYet = ledger.length === 0 && !legacy && !totals.waived;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Registration fee record</h3>
          <p className="text-xs text-gray-500">Every charge and payment for the registration fee, and how it feeds the figures above.</p>
        </div>
        {check.balanced ? (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Balanced
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
          </span>
        )}
      </header>

      <div className="space-y-4 p-4">
        {/* Status line */}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-gray-500">Status</dt><dd className="font-semibold text-gray-900">{status.state}</dd></div>
          <div><dt className="text-xs text-gray-500">Fee amount</dt><dd className="font-semibold text-gray-900">{fmtMoney(status.amount)}</dd></div>
          <div><dt className="text-xs text-gray-500">Paid / waived on</dt><dd className="font-semibold text-gray-900">{fmtDate(status.paid_at)}</dd></div>
          <div><dt className="text-xs text-gray-500">Membership expires</dt><dd className="font-semibold text-gray-900">{fmtDate(status.expires_at)}</dd></div>
        </dl>

        {/* How it feeds the headline numbers */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Chip label="Invoiced" value={fmtMoney(totals.invoiced)} hint="Counts in Total Invoiced" />
          <Chip label="Paid" value={fmtMoney(totals.paid)} hint={`Cash ${fmtMoney(totals.paid_cash)} · wallet ${fmtMoney(totals.paid_wallet)}`} tone="text-emerald-700" />
          <Chip
            label={totals.waived ? 'Waived' : 'Still owed'}
            value={totals.waived ? 'Waived' : fmtMoney(totals.owed)}
            hint="Invoiced − paid. A waived fee owes nothing."
            tone={!totals.waived && totals.owed > 0 ? 'text-rose-700' : 'text-gray-900'}
          />
          <Chip label="In Payments Made" value={fmtMoney(contribution.payments_made)} hint="Only payments recorded with a real method. Wallet draws and legacy fees are not counted." />
          <Chip label="In Overdue" value={fmtMoney(contribution.overdue)} hint="Unpaid fee that is not on a booking. A fee charged on a booking sits in that booking’s balance." tone={contribution.overdue > 0 ? 'text-rose-700' : 'text-gray-900'} />
        </div>
        {contribution.note && (
          <p className="flex items-start gap-1.5 text-xs text-gray-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{contribution.note}</p>
        )}
        {totals.paid_wallet > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-gray-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {fmtMoney(totals.paid_wallet)} was drawn from the client’s wallet. It settles the fee but is not added to Payments Made, because that money was counted when it was paid into the wallet.
          </p>
        )}

        {/* Legacy / no-record notice */}
        {legacy && (
          <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${legacy.kind === 'PAID_BEFORE_SYSTEM' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            {legacy.kind === 'PAID_BEFORE_SYSTEM' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <div className="font-semibold">
                {legacy.kind === 'PAID_BEFORE_SYSTEM' ? 'Paid before the system' : 'Marked paid — no payment recorded'}
                {legacy.date ? ` · ${fmtDate(legacy.date)}` : ''}
                {` · ${fmtMoney(legacy.amount)}`}
              </div>
              <div className="text-xs opacity-90">{legacy.label}</div>
            </div>
          </div>
        )}
        {totals.waived && (
          <div className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>The registration fee was waived{status.paid_at ? ` on ${fmtDate(status.paid_at)}` : ''}. Nothing is invoiced or owed for it.</div>
          </div>
        )}

        {/* Problems */}
        {!check.balanced && (
          <ul className="space-y-1.5">
            {check.problems.map((p) => (
              <li key={p.code} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold">{p.text}</span>{PROBLEM_HELP[p.code] ? ` ${PROBLEM_HELP[p.code]}` : ''}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Mini ledger */}
        {nothingYet ? (
          <p className="rounded border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500">
            No registration fee has been invoiced or paid for this client yet.
          </p>
        ) : ledger.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Entry</th>
                  <th className="px-3 py-2">Where it came from</th>
                  <th className="px-3 py-2">Method / reference</th>
                  <th className="px-3 py-2 text-right">Charged</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ledger.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">{fmtDate(l.date)}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{l.kind === 'INVOICE' ? 'Invoice' : 'Payment'}</div>
                      <div className="font-mono text-[11px] text-gray-500">{l.code}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${SOURCE_TONE[l.source] || 'bg-gray-100 text-gray-700'}`}>{l.source_label}</span>
                      {(l.quote || l.booking_code) && (
                        <div className="mt-0.5 text-[11px] text-gray-500">{[l.quote && `Quotation ${l.quote}`, l.booking_code && `Booking ${l.booking_code}`].filter(Boolean).join(' · ')}</div>
                      )}
                      {l.why && <div className="mt-0.5 text-[11px] text-gray-500">{l.why}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {l.kind === 'PAYMENT' ? (
                        <>
                          <div>{l.method ? String(l.method).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : <span className="text-amber-700">No method recorded</span>}{l.bank_account ? ` · ${l.bank_account}` : ''}</div>
                          <div className="text-[11px] text-gray-500">{[l.reference, l.recorded_by && `by ${l.recorded_by}`, l.has_receipt && 'receipt on file'].filter(Boolean).join(' · ') || '—'}</div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900">{l.kind === 'INVOICE' ? fmtMoney(l.amount) : ''}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{l.kind === 'PAYMENT' ? fmtMoney(l.amount) : ''}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{l.running_balance == null ? '—' : fmtMoney(l.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PDF invoices on file */}
        {pdfs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="font-semibold">Invoice documents:</span>
            {pdfs.map((p) => (
              <a key={p.id} href={p.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-gray-200 px-2 py-0.5 hover:bg-gray-50">
                {p.code} · {p.status === 'SENT' ? 'Unpaid' : p.status === 'PAID' ? 'Paid' : p.status} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}

        {/* History */}
        <div>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
            <History className="h-3.5 w-3.5" /> {showHistory ? 'Hide' : 'Show'} status history ({history.length})
          </button>
          {showHistory && (
            history.length === 0 ? (
              <p className="mt-2 text-xs text-gray-500">No registration changes were logged for this client. Changes made before 31 Oct 2026 were not logged.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-100 rounded border border-gray-200 text-xs">
                {history.map((h, i) => (
                  <li key={`${h.date}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                    <span className="font-semibold text-gray-800">{String(h.action).replace(/^REG_FEE_/, '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                    <span className="text-gray-500">{h.by || 'System'}{h.role ? ` (${String(h.role).toLowerCase().replace(/_/g, ' ')})` : ''} · {fmtDate(h.date)}</span>
                    {h.details?.reason && <span className="basis-full text-gray-600">{h.details.reason}</span>}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </section>
  );
}
