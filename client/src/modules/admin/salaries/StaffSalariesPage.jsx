import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Banknote, Users, ChevronDown, ChevronUp, Search, RefreshCcw,
  X, CheckSquare, Square, AlertCircle, CheckCircle2, Loader2,
  CreditCard, Calendar, TrendingUp, Eye, Download, FileSpreadsheet, FileText, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmt = (v) => money.format(Number(v || 0));
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    ACTIVE:     'bg-emerald-100 text-emerald-700',
    ASSIGNED:   'bg-blue-100 text-blue-700',
    UNAVAILABLE:'bg-slate-100 text-slate-600',
    COMPLETED:  'bg-purple-100 text-purple-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status || '—'}
    </span>
  );
};

// ─── Summary card ─────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, tone = 'slate', icon: Icon }) => {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    rose:    'bg-rose-50 border-rose-100 text-rose-700',
    blue:    'bg-blue-50 border-blue-100 text-blue-700',
    slate:   'bg-slate-50 border-slate-200 text-slate-600',
    violet:  'bg-violet-50 border-violet-100 text-violet-700',
  };
  return (
    <div className={`rounded-2xl border p-5 flex items-start gap-4 ${tones[tone]}`}>
      {Icon && <div className="mt-0.5"><Icon className="w-5 h-5" /></div>}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {sub && <p className="text-xs mt-0.5 opacity-60">{sub}</p>}
      </div>
    </div>
  );
};

// ─── Breakdown Modal ──────────────────────────────────────────────────────────
const METHOD_LABELS = { BANK_TRANSFER: 'Bank Transfer', CASH: 'Cash', CHEQUE: 'Cheque' };

const BreakdownModal = ({ staff, onClose, onPay }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [tab, setTab] = useState('earnings');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getStaffBookingSalaryBreakdown(staff.staff_profile_id);
        setData(res.data);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [staff.staff_profile_id]);

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{staff.full_name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{staff.designation}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">Outstanding</p>
              <p className="text-lg font-bold text-emerald-600">{fmt(staff.current_earnings)}</p>
            </div>
            <button
              onClick={() => onPay([staff])}
              className="bg-[#137A6B] text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-[#0F6559] transition-colors"
            >
              Pay Now
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 flex-shrink-0">
          <button
            onClick={() => setTab('earnings')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === 'earnings' ? 'border-[#137A6B] text-[#137A6B]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Earnings Breakdown
          </button>
          <button
            onClick={() => setTab('payouts')}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${tab === 'payouts' ? 'border-[#137A6B] text-[#137A6B]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            Payout History
            {!loading && data?.payouts?.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                {data.payouts.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {/* ── Earnings tab ── */}
          {!loading && tab === 'earnings' && (
            <div className="space-y-4">
              {(!data || data.breakdown.length === 0) && (
                <div className="text-center py-10 text-slate-400 text-sm">No booking earnings found.</div>
              )}

              {/* Bookings table */}
              {data && data.breakdown.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service Dates</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Daily Rate</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Days Paid</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Total Earned</th>
                        <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.breakdown.map((row) => (
                        <React.Fragment key={row.assignment_id}>
                          <tr className="hover:bg-slate-50/60 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-slate-700 font-semibold">{row.booking_code || '—'}</td>
                            <td className="px-4 py-3 text-slate-700">{row.patient_name || <span className="text-slate-400 italic">Not specified</span>}</td>
                            <td className="px-4 py-3 text-slate-600 text-xs">
                              {fmtDate(row.service_start_date)} → {row.service_end_date ? fmtDate(row.service_end_date) : <span className="text-emerald-600 font-medium">Ongoing</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">{fmt(row.daily_rate)}</td>
                            <td className="px-4 py-3 text-right text-slate-700">{(row.daily_entries || []).length}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(row.total_salary_earned)}</td>
                            <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                            <td className="px-4 py-3">
                              {(row.daily_entries || []).length > 0 && (
                                <button
                                  onClick={() => toggle(row.assignment_id)}
                                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                                  title="Show daily breakdown"
                                >
                                  {expanded[row.assignment_id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              )}
                            </td>
                          </tr>
                          {expanded[row.assignment_id] && (row.daily_entries || []).map((entry, i) => (
                            <tr key={i} className="bg-slate-50/80">
                              <td colSpan={2} className="pl-10 pr-4 py-2 text-xs text-slate-500 italic">Day {i + 1}</td>
                              <td className="px-4 py-2 text-xs text-slate-600">{fmtDate(entry.date)}</td>
                              <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-slate-700">{fmt(entry.amount)}</td>
                              <td colSpan={2}></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-600 uppercase">Gross Earnings (All Time)</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(data.gross_total)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Deductions */}
              {data?.deductions?.length > 0 && (
                <div className="rounded-xl border border-rose-200 overflow-hidden">
                  <div className="bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 uppercase tracking-wide border-b border-rose-200">
                    Deductions (All Time)
                  </div>
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {data.deductions.map((d, i) => (
                        <tr key={i} className="bg-white hover:bg-rose-50/30">
                          <td className="px-4 py-2.5 text-slate-700">{d.reason || 'Deduction'}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtDate(d.created_at)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-rose-600">− {fmt(d.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-rose-200 bg-rose-50">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-rose-700 uppercase">Total Deductions</td>
                        <td className="px-4 py-2.5 text-right font-bold text-rose-700">− {fmt(data.total_deductions)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Advances */}
              {data?.advances?.length > 0 && (
                <div className="rounded-xl border border-blue-200 overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 uppercase tracking-wide border-b border-blue-200">
                    Advances Disbursed (All Time)
                  </div>
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {data.advances.map((a, i) => (
                        <tr key={i} className="bg-white hover:bg-blue-50/30">
                          <td className="px-4 py-2.5 text-slate-700">{a.notes || 'Advance'}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{fmtDate(a.created_at)}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-blue-600">− {fmt(a.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-blue-200 bg-blue-50">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-blue-700 uppercase">Total Advances</td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-700">− {fmt(data.total_advances)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Previous payouts */}
              {data?.payouts?.length > 0 && (
                <div className="rounded-xl border border-amber-200 overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-700 uppercase tracking-wide border-b border-amber-200">
                    Salary Payouts (All Time)
                  </div>
                  <table className="min-w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {[...data.payouts].reverse().map((p) => (
                        <tr key={p.staff_payment_id} className="bg-white hover:bg-amber-50/30">
                          <td className="px-4 py-2.5 text-slate-700 text-xs">{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">
                            {fmtDate(p.paid_at)}{p.reference_number ? ` · Ref: ${p.reference_number}` : ''}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-amber-700">− {fmt(p.amount_paid)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-amber-200 bg-amber-50">
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-amber-700 uppercase">Total Paid Out</td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-700">− {fmt(data.total_paid_out)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Net current earnings summary */}
              {data && (
                <div className="rounded-xl border-2 border-[#137A6B] bg-emerald-50/60 p-4">
                  <div className="flex items-center justify-between mb-2 text-sm text-slate-600">
                    <span>Gross Earnings</span>
                    <span className="font-semibold text-slate-800">{fmt(data.gross_total)}</span>
                  </div>
                  {data.total_deductions > 0 && (
                    <div className="flex items-center justify-between mb-1 text-sm text-rose-600">
                      <span>Less: Deductions</span>
                      <span className="font-semibold">− {fmt(data.total_deductions)}</span>
                    </div>
                  )}
                  {data.total_advances > 0 && (
                    <div className="flex items-center justify-between mb-1 text-sm text-blue-600">
                      <span>Less: Advances</span>
                      <span className="font-semibold">− {fmt(data.total_advances)}</span>
                    </div>
                  )}
                  {data.total_paid_out > 0 && (
                    <div className="flex items-center justify-between mb-1 text-sm text-amber-700">
                      <span>Less: Total Paid Out</span>
                      <span className="font-semibold">− {fmt(data.total_paid_out)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t-2 border-[#137A6B]/30 mt-2">
                    <span className="text-sm font-bold text-[#137A6B] uppercase tracking-wide">Current Earnings (Outstanding)</span>
                    <span className="text-lg font-bold text-[#137A6B]">{fmt(data.net_current_earnings)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payout History tab ── */}
          {!loading && tab === 'payouts' && (
            <>
              {(!data?.payouts || data.payouts.length === 0) && (
                <div className="text-center py-16 text-slate-400 text-sm">No payouts recorded yet.</div>
              )}
              {data?.payouts?.length > 0 && (
                <div className="space-y-3">
                  {data.payouts.map((p) => (
                    <div key={p.staff_payment_id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-slate-900">{fmt(p.amount_paid)}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                              {METHOD_LABELS[p.payment_method] || p.payment_method || 'Payment'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 mt-1">{fmtDate(p.paid_at)}</p>
                          {(p.company_account || p.staff_bank_name) && (
                            <p className="text-xs text-slate-400 mt-1">
                              {p.company_account && <span>{p.company_account}</span>}
                              {p.company_account && p.staff_bank_name && <span className="mx-1">→</span>}
                              {p.staff_bank_name && <span>{p.staff_bank_name}{p.staff_account_number ? ` ···${p.staff_account_number.slice(-4)}` : ''}</span>}
                            </p>
                          )}
                          {p.reference_number && (
                            <p className="text-xs text-slate-400 mt-0.5">Ref: <span className="font-mono">{p.reference_number}</span></p>
                          )}
                          {p.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{p.notes}</p>}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.salary_sheet_url ? (
                            <>
                              <a
                                href={p.salary_sheet_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                                title="Preview salary sheet"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                              </a>
                              <a
                                href={p.salary_sheet_url}
                                download={`Salary_Sheet_${staff.full_name.replace(/\s+/g, '_')}_${fmtDate(p.paid_at)}.pdf`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#137A6B] text-white text-xs font-semibold hover:bg-[#0F6559] transition-colors"
                                title="Download salary sheet"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Download
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic px-2">Sheet pending…</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Month helpers ────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const getMonthOptions = () => {
  const opts = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
};
const MONTH_OPTIONS = getMonthOptions();

// ─── Bulk Pay Modal ───────────────────────────────────────────────────────────
const BulkPayModal = ({ staffList, companyAccounts, onClose, onSuccess }) => {
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(staffList.map(s => [s.staff_profile_id, String(parseFloat(s.current_earnings || 0).toFixed(2))]))
  );
  const [companyAccountId, setCompanyAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const totalToPay = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [amounts]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payouts = staffList.map(s => ({
        staff_profile_id: s.staff_profile_id,
        amount: parseFloat(amounts[s.staff_profile_id]),
        staff_bank_account_id: s.staff_bank_account_id || null,
      }));
      const res = await apiClient.bulkStaffPayouts(
        payouts, companyAccountId || null, paymentMethod, reference || null, notes || null
      );
      const resultMap = Object.fromEntries((res.results || []).map(r => [r.staff_profile_id, r]));
      setResults(staffList.map(s => ({
        ...s,
        status: resultMap[s.staff_profile_id]?.status || 'error',
        message: resultMap[s.staff_profile_id]?.message,
      })));
    } catch (err) {
      setResults(staffList.map(s => ({ ...s, status: 'error', message: err?.response?.data?.message || 'Server error' })));
    } finally {
      setSubmitting(false);
    }
  };

  const allDone = results !== null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {allDone ? 'Payment Results' : `Pay ${staffList.length} Staff Members`}
            </h2>
            {!allDone && <p className="text-sm text-slate-500 mt-0.5">Total: {fmt(totalToPay)}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {allDone ? (
            <div className="space-y-3">
              {results.map(r => (
                <div key={r.staff_profile_id} className={`flex items-center gap-3 p-3 rounded-xl border ${r.status === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                  {r.status === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />}
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.full_name}</p>
                    {r.status === 'error' && <p className="text-xs text-rose-600">{r.message}</p>}
                  </div>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {r.status === 'success' ? 'Paid' : 'Failed'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <form id="bulk-pay-form" onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Staff Members &amp; Amounts</label>
                {staffList.map(s => (
                  <div key={s.staff_profile_id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="flex-1 text-sm font-medium text-slate-700">{s.full_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Outstanding: {fmt(s.current_earnings)}</span>
                      <input
                        type="number" min="0.01" max={parseFloat(s.current_earnings || 0)} step="0.01" required
                        value={amounts[s.staff_profile_id]}
                        onChange={e => setAmounts(p => ({ ...p, [s.staff_profile_id]: e.target.value }))}
                        className="w-36 border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#137A6B] bg-white text-right"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Company Bank Account</label>
                <select value={companyAccountId} onChange={e => setCompanyAccountId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]">
                  <option value="">Select company account (optional)</option>
                  {companyAccounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_nickname || a.bank_name} — {a.account_number}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]">
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Reference Number <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. TXN-20260615" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
              </div>
            </form>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex items-center justify-between flex-shrink-0 gap-3">
          {allDone ? (
            <>
              <span className="text-sm text-slate-500">{results.filter(r => r.status === 'success').length} of {results.length} succeeded</span>
              <button onClick={() => { onSuccess(); onClose(); }} className="bg-[#137A6B] text-white rounded-xl px-6 py-2.5 text-sm font-bold hover:bg-[#0F6559] transition-colors">Done</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="submit" form="bulk-pay-form" disabled={submitting || totalToPay <= 0} className="bg-[#137A6B] text-white rounded-xl px-6 py-2.5 text-sm font-bold hover:bg-[#0F6559] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Processing…' : `Pay ${fmt(totalToPay)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Single Pay Modal (individual, with monthly breakdown preview) ─────────────
const SinglePayModal = ({ staff, companyAccounts, onClose, onSuccess }) => {
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0]);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [amount, setAmount] = useState(String(parseFloat(staff.current_earnings || 0).toFixed(2)));
  const [companyAccountId, setCompanyAccountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreview(null);
    apiClient.getStaffMonthlyEarnings(staff.staff_profile_id, selectedMonth.year, selectedMonth.month)
      .then(res => {
        if (cancelled) return;
        setPreview(res.data);
        setAmount(String(parseFloat(res.data.month_total || 0).toFixed(2)));
      })
      .catch(() => { if (!cancelled) setPreview({ breakdown: [], month_total: 0 }); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [staff.staff_profile_id, selectedMonth]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.createStaffPayout(staff.staff_profile_id, {
        amount: parseFloat(amount),
        company_bank_account_id: companyAccountId || null,
        staff_bank_account_id: staff.staff_bank_account_id || null,
        payment_method: paymentMethod,
        reference_number: reference || null,
        notes: notes || null,
        month_year: { year: selectedMonth.year, month: selectedMonth.month },
      });
      setDone(true);
    } catch (err) {
      setError(err?.response?.data?.message || 'Server error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{done ? 'Payment Recorded' : `Pay ${staff.full_name}`}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{staff.designation}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            <p className="text-lg font-bold text-slate-800">Payment recorded successfully</p>
            <p className="text-sm text-slate-500 text-center">The salary sheet PDF is being generated and will be available in the <strong>Salary Sheets</strong> ledger shortly.</p>
            <button onClick={() => { onSuccess(); onClose(); }} className="mt-2 bg-[#137A6B] text-white rounded-xl px-8 py-2.5 text-sm font-bold hover:bg-[#0F6559] transition-colors">Done</button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <form id="single-pay-form" onSubmit={handleSubmit}>
              {/* Month selector + breakdown preview */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-slate-700">Earnings for Month</p>
                  <select
                    value={`${selectedMonth.year}-${selectedMonth.month}`}
                    onChange={e => {
                      const [y, m] = e.target.value.split('-').map(Number);
                      setSelectedMonth(MONTH_OPTIONS.find(o => o.year === y && o.month === m));
                    }}
                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#137A6B] bg-white"
                  >
                    {MONTH_OPTIONS.map(o => (
                      <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {previewLoading && (
                  <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span>
                  </div>
                )}
                {!previewLoading && preview && preview.previous_leftover === 0 && preview?.breakdown?.length === 0 && !preview?.deductions?.length && !preview?.advances?.length && !preview?.payouts?.length && (
                  <p className="text-center text-sm text-slate-400 italic py-6">No earnings, deductions, advances, or payouts recorded for {selectedMonth.label}.</p>
                )}
                {!previewLoading && preview && (preview.previous_leftover > 0 || preview.breakdown?.length > 0 || preview.deductions?.length > 0 || preview.advances?.length > 0 || preview.payouts?.length > 0) && (
                  <div className="space-y-3">

                    {/* Carried-over balance from previous months */}
                    {preview.previous_leftover > 0 && (
                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Carried Over from Previous Months</p>
                          <p className="text-xs text-violet-500 mt-0.5">Unpaid earnings from before {selectedMonth.label}</p>
                        </div>
                        <span className="text-base font-bold text-violet-700">{fmt(preview.previous_leftover)}</span>
                      </div>
                    )}

                    {/* Earnings table */}
                    {preview.breakdown?.length > 0 && (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-left">
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Days</th>
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Rate/day</th>
                              <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Gross</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {preview.breakdown.map(row => (
                              <tr key={row.assignment_id} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[#137A6B]">{row.booking_code || '—'}</td>
                                <td className="px-3 py-2.5 text-slate-700 text-xs">{row.client_name || <span className="text-slate-400 italic">—</span>}</td>
                                <td className="px-3 py-2.5 text-slate-700 text-xs">{row.patient_name || <span className="text-slate-400 italic">—</span>}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{(row.daily_entries || []).length}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{fmt(row.daily_rate)}</td>
                                <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{fmt(row.total_salary_earned)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 bg-slate-50">
                              <td colSpan={5} className="px-3 py-2 text-xs font-bold text-slate-500 uppercase">Gross Earnings</td>
                              <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(preview.gross_total)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Deductions */}
                    {preview.deductions?.length > 0 && (
                      <div className="rounded-xl border border-rose-200 overflow-hidden">
                        <div className="bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 uppercase tracking-wide border-b border-rose-200">Deductions</div>
                        <table className="min-w-full text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {preview.deductions.map((d, i) => (
                              <tr key={i} className="bg-white">
                                <td className="px-3 py-2 text-slate-700 text-xs">{d.reason || 'Deduction'}</td>
                                <td className="px-3 py-2 text-slate-400 text-xs">{fmtDate(d.created_at)}</td>
                                <td className="px-3 py-2 text-right text-xs font-semibold text-rose-600">− {fmt(d.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-rose-200 bg-rose-50">
                              <td colSpan={2} className="px-3 py-2 text-xs font-bold text-rose-700 uppercase">Total Deductions</td>
                              <td className="px-3 py-2 text-right font-bold text-rose-700">− {fmt(preview.total_deductions)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Advances */}
                    {preview.advances?.length > 0 && (
                      <div className="rounded-xl border border-blue-200 overflow-hidden">
                        <div className="bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 uppercase tracking-wide border-b border-blue-200">Advances Disbursed</div>
                        <table className="min-w-full text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {preview.advances.map((a, i) => (
                              <tr key={i} className="bg-white">
                                <td className="px-3 py-2 text-slate-700 text-xs">{a.notes || 'Advance'}</td>
                                <td className="px-3 py-2 text-slate-400 text-xs">{fmtDate(a.created_at)}</td>
                                <td className="px-3 py-2 text-right text-xs font-semibold text-blue-600">− {fmt(a.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-blue-200 bg-blue-50">
                              <td colSpan={2} className="px-3 py-2 text-xs font-bold text-blue-700 uppercase">Total Advances</td>
                              <td className="px-3 py-2 text-right font-bold text-blue-700">− {fmt(preview.total_advances)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Previous payouts this month */}
                    {preview.payouts?.length > 0 && (
                      <div className="rounded-xl border border-amber-200 overflow-hidden">
                        <div className="bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 uppercase tracking-wide border-b border-amber-200">Already Paid This Month</div>
                        <table className="min-w-full text-sm">
                          <tbody className="divide-y divide-slate-100">
                            {preview.payouts.map((p, i) => (
                              <tr key={i} className="bg-white">
                                <td className="px-3 py-2 text-slate-700 text-xs">{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                                <td className="px-3 py-2 text-slate-400 text-xs">{p.reference_number ? `Ref: ${p.reference_number}` : fmtDate(p.paid_at)}</td>
                                <td className="px-3 py-2 text-right text-xs font-semibold text-amber-700">− {fmt(p.amount_paid)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-amber-200 bg-amber-50">
                              <td colSpan={2} className="px-3 py-2 text-xs font-bold text-amber-700 uppercase">Total Already Paid</td>
                              <td className="px-3 py-2 text-right font-bold text-amber-700">− {fmt(preview.total_payouts)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Net summary */}
                    <div className="rounded-xl border-2 border-[#137A6B] bg-emerald-50/50 px-4 py-3">
                      {preview.previous_leftover > 0 && (
                        <div className="flex items-center justify-between mb-1.5 text-xs text-slate-500">
                          <span>This month net</span>
                          <span className="font-semibold">{fmt(preview.month_net)}</span>
                        </div>
                      )}
                      {preview.previous_leftover > 0 && (
                        <div className="flex items-center justify-between mb-2 text-xs text-violet-600">
                          <span>+ Carried over</span>
                          <span className="font-semibold">{fmt(preview.previous_leftover)}</span>
                        </div>
                      )}
                      <div className={`flex items-center justify-between ${preview.previous_leftover > 0 ? 'border-t border-[#137A6B]/30 pt-2' : ''}`}>
                        <span className="text-sm font-bold text-[#137A6B] uppercase tracking-wide">
                          {preview.previous_leftover > 0 ? 'Total Outstanding' : 'Current Earnings (Net Payable)'}
                        </span>
                        <span className="text-lg font-bold text-[#137A6B]">{fmt(preview.month_total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Payment fields */}
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Amount to Pay (LKR)</label>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-400 flex-1">Total outstanding (all months): {fmt(staff.current_earnings)}</span>
                    <input
                      type="number" min="0.01" max={parseFloat(staff.current_earnings || 0)} step="0.01" required
                      value={amount} onChange={e => setAmount(e.target.value)}
                      className="w-40 border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#137A6B] bg-white text-right"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Company Bank Account</label>
                    <select value={companyAccountId} onChange={e => setCompanyAccountId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]">
                      <option value="">Select (optional)</option>
                      {companyAccounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_nickname || a.bank_name} — {a.account_number}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700">Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]">
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Reference Number <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. TXN-20260615" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8]" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#137A6B] bg-[#FCFBF8] resize-none" />
                </div>
                {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">{error}</p>}
              </div>
            </form>
          </div>
        )}

        {!done && (
          <div className="p-6 border-t border-slate-200 flex items-center justify-between flex-shrink-0 gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" form="single-pay-form" disabled={submitting || parseFloat(amount) <= 0} className="bg-[#137A6B] text-white rounded-xl px-6 py-2.5 text-sm font-bold hover:bg-[#0F6559] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? 'Processing…' : `Confirm Payment — ${fmt(parseFloat(amount) || 0)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Pay Modal dispatcher ─────────────────────────────────────────────────────
const PayModal = ({ staffList, companyAccounts, onClose, onSuccess }) => {
  if (staffList.length === 1) {
    return <SinglePayModal staff={staffList[0]} companyAccounts={companyAccounts} onClose={onClose} onSuccess={onSuccess} />;
  }
  return <BulkPayModal staffList={staffList} companyAccounts={companyAccounts} onClose={onClose} onSuccess={onSuccess} />;
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const StaffSalariesPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [companyAccounts, setCompanyAccounts] = useState([]);

  const [breakdownStaff, setBreakdownStaff] = useState(null);
  const [payStaffList, setPayStaffList] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const [overviewRes, accountsRes] = await Promise.allSettled([
        apiClient.getStaffSalariesOverview(showAll),
        apiClient.getBankAccounts(),
      ]);
      if (overviewRes.status === 'fulfilled') setData(overviewRes.value.data);
      if (accountsRes.status === 'fulfilled') setCompanyAccounts(accountsRes.value?.data || []);
    } catch (err) {
      console.error('StaffSalariesPage load error:', err);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!data?.staff) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.staff;
    return data.staff.filter(s =>
      s.full_name?.toLowerCase().includes(q) ||
      s.designation?.toLowerCase().includes(q) ||
      s.mobile_number?.includes(q)
    );
  }, [data, search]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.staff_profile_id)));
    }
  };

  const selectedStaff = useMemo(
    () => (data?.staff || []).filter(s => selected.has(s.staff_profile_id)),
    [data, selected]
  );

  const openPay = (staffArr) => {
    const eligible = staffArr.filter(s => parseFloat(s.current_earnings || 0) > 0);
    if (eligible.length > 0) setPayStaffList(eligible);
  };

  const allStaffWithBalance = useMemo(
    () => (data?.staff || []).filter(s => parseFloat(s.current_earnings || 0) > 0),
    [data]
  );

  const allChecked = filtered.length > 0 && selected.size === filtered.length;

  const [exporting, setExporting] = useState(false);

  const buildAndDownload = async (monthOnly) => {
    setExporting(true);
    try {
      const res = await apiClient.getStaffSalariesExportData();
      const { staff_overview, salary_transactions, payout_transactions } = res.data;

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const filterByMonth = (rows, dateField) =>
        monthOnly
          ? rows.filter(r => {
              const d = new Date(r[dateField]);
              return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
            })
          : rows;

      const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const fmtDT = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Staff Overview ──────────────────────────────────────────
      const overviewRows = staff_overview.map(s => ({
        'Name': s.full_name,
        'Designation': s.designation || '—',
        'Status': s.current_status || '—',
        'Mobile': s.mobile_number || '—',
        'Outstanding (LKR)': parseFloat(s.current_earnings),
        'Total Earned (LKR)': parseFloat(s.total_earned),
        'Total Paid Out (LKR)': parseFloat(s.total_paid_out),
        'Last Paid': fmtD(s.last_paid_at),
        'Bank': s.bank_name || '—',
        'Account No.': s.account_number || '—',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows.length ? overviewRows : [{ Note: 'No data' }]), 'Staff Overview');

      // ── Sheet 2: Daily Earnings (filtered by month if needed) ────────────
      const filteredSalary = filterByMonth(salary_transactions, 'earned_date');
      const salaryRows = filteredSalary.map(t => ({
        'Date': fmtDT(t.earned_date),
        'Staff Name': t.full_name,
        'Designation': t.designation || '—',
        'Booking': t.booking_code || '—',
        'Care Profile': t.patient_name || '—',
        'Daily Rate (LKR)': t.daily_rate ? parseFloat(t.daily_rate) : '—',
        'Service Start': fmtD(t.service_start_date),
        'Service End': t.service_end_date ? fmtD(t.service_end_date) : 'Ongoing',
        'Amount Earned (LKR)': parseFloat(t.earned_amount),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salaryRows.length ? salaryRows : [{ Note: 'No earnings in this period' }]), 'Daily Earnings');

      // ── Sheet 3: Payouts (filtered by month if needed) ───────────────────
      const filteredPayouts = filterByMonth(payout_transactions, 'paid_at');
      const payoutRows = filteredPayouts.map(p => ({
        'Date': fmtDT(p.paid_at),
        'Staff Name': p.full_name,
        'Amount Paid (LKR)': parseFloat(p.amount_paid),
        'Payment Method': p.payment_method || '—',
        'Reference': p.reference_number || '—',
        'Company Account': p.company_account || '—',
        'Staff Bank': p.staff_bank_name || '—',
        'Staff Account No.': p.staff_account_number || '—',
        'Notes': p.notes || '—',
        'Status': p.status || '—',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payoutRows.length ? payoutRows : [{ Note: 'No payouts in this period' }]), 'Payouts');

      // ── Sheet 4: Monthly Summary per Staff ───────────────────────────────
      const monthMap = {};
      [...salary_transactions].forEach(t => {
        const d = new Date(t.earned_date);
        const key = `${t.staff_profile_id}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        if (!monthMap[key]) monthMap[key] = { name: t.full_name, designation: t.designation || '—', month: monthLabel, earned: 0, days: 0 };
        monthMap[key].earned += parseFloat(t.earned_amount);
        monthMap[key].days += 1;
      });
      [...payout_transactions].forEach(p => {
        const d = new Date(p.paid_at);
        const key = `${p.staff_profile_id}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { name: p.full_name, designation: '—', month: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), earned: 0, days: 0 };
        if (!monthMap[key].paid) monthMap[key].paid = 0;
        monthMap[key].paid = (monthMap[key].paid || 0) + parseFloat(p.amount_paid);
      });
      const monthlyRows = Object.values(monthMap).map(m => ({
        'Staff Name': m.name,
        'Designation': m.designation,
        'Month': m.month,
        'Days Worked': m.days,
        'Total Earned (LKR)': m.earned,
        'Total Paid Out (LKR)': m.paid || 0,
        'Net Movement (LKR)': m.earned - (m.paid || 0),
      }));
      const filteredMonthly = monthOnly
        ? monthlyRows.filter(r => {
            const label = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            return r['Month'] === label;
          })
        : monthlyRows;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filteredMonthly.length ? filteredMonthly : [{ Note: 'No data' }]), 'Monthly Summary');

      const today = now.toISOString().slice(0, 10);
      const label = monthOnly
        ? `${now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace(' ', '-').toLowerCase()}`
        : 'all-time';
      XLSX.writeFile(wb, `staff-salaries-${label}-${today}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title="Staff Salaries" subtitle="Manage outstanding payables and process salary payments">
      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Banknote}
          label="Total Outstanding"
          value={fmt(data?.total_outstanding || 0)}
          sub="Sum of all unpaid earnings"
          tone="rose"
        />
        <StatCard
          icon={Users}
          label="Staff with Balance"
          value={data?.staff_count ?? '—'}
          sub={showAll ? 'All staff shown' : 'Outstanding only'}
          tone="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Selected to Pay"
          value={selected.size}
          sub={selected.size > 0 ? `Total: ${fmt(selectedStaff.reduce((s, r) => s + parseFloat(r.current_earnings || 0), 0))}` : 'None selected'}
          tone={selected.size > 0 ? 'violet' : 'slate'}
        />
        <StatCard
          icon={CreditCard}
          label="Company Accounts"
          value={companyAccounts.length}
          sub="Available for payout"
          tone="emerald"
        />
      </div>

      {/* Action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100 w-60"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
              className="rounded"
            />
            Show all staff
          </label>
          <button onClick={load} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500" title="Refresh">
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/admin/salary-sheets')}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <FileText className="w-4 h-4 text-violet-600" />
            Salary Sheets Ledger
            <ExternalLink className="w-3 h-3 opacity-50" />
          </button>
          <button
            onClick={() => buildAndDownload(true)}
            disabled={exporting}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download current month's data as Excel"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
            Monthly Report
          </button>
          <button
            onClick={() => buildAndDownload(false)}
            disabled={exporting}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download all-time data as Excel"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-blue-600" />}
            Download All
          </button>
          {selected.size > 0 && (
            <button
              onClick={() => openPay(selectedStaff)}
              className="flex items-center gap-2 bg-violet-600 text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-violet-700 transition-colors"
            >
              <Banknote className="w-4 h-4" />
              Pay Selected ({selected.size})
            </button>
          )}
          <button
            onClick={() => openPay(allStaffWithBalance)}
            disabled={allStaffWithBalance.length === 0}
            className="flex items-center gap-2 bg-[#137A6B] text-white rounded-xl px-4 py-2 text-sm font-bold hover:bg-[#0F6559] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            Settle All Payables
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading salaries…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">
            {search ? 'No staff match your search.' : 'No outstanding payables.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 w-10">
                    <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                      {allChecked ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff Member</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Outstanding</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Earned</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Bank Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => {
                  const isSelected = selected.has(s.staff_profile_id);
                  const hasBalance = parseFloat(s.current_earnings || 0) > 0;
                  return (
                    <tr
                      key={s.staff_profile_id}
                      className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button onClick={() => toggleSelect(s.staff_profile_id)} className="text-slate-400 hover:text-blue-600">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{s.full_name}</p>
                        <p className="text-xs text-slate-500">{s.designation} · {s.mobile_number || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold text-base ${hasBalance ? 'text-rose-600' : 'text-slate-400'}`}>
                          {fmt(s.current_earnings)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(s.total_earned)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(s.total_paid_out)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                        {s.last_paid_at ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {fmtDate(s.last_paid_at)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Never paid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {s.bank_name ? (
                          <div>
                            <p className="font-medium text-slate-700">{s.bank_name}</p>
                            <p className="text-slate-400">{s.account_number}</p>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No account</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.current_status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setBreakdownStaff(s)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Breakdown
                          </button>
                          {hasBalance && (
                            <button
                              onClick={() => openPay([s])}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#137A6B] text-white text-xs font-bold hover:bg-[#0F6559] transition-colors"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              Pay
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={2} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">
                    {filtered.length} staff
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-rose-600">
                    {fmt(filtered.reduce((s, r) => s + parseFloat(r.current_earnings || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">
                    {fmt(filtered.reduce((s, r) => s + parseFloat(r.total_earned || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-800">
                    {fmt(filtered.reduce((s, r) => s + parseFloat(r.total_paid_out || 0), 0))}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {breakdownStaff && (
        <BreakdownModal
          staff={breakdownStaff}
          onClose={() => setBreakdownStaff(null)}
          onPay={(list) => { setBreakdownStaff(null); setPayStaffList(list); }}
        />
      )}
      {payStaffList && (
        <PayModal
          staffList={payStaffList}
          companyAccounts={companyAccounts}
          onClose={() => setPayStaffList(null)}
          onSuccess={load}
        />
      )}
    </AdminLayout>
  );
};

export default StaffSalariesPage;
