import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ChevronDown, ChevronRight, Download, Info, Loader2, MessageCircle, Pencil, RotateCcw, Search, X,
} from 'lucide-react';
import DateInput from '../../../components/common/DateInput';
import EditedAmountBadge from '../components/EditedAmountBadge';
import { PreviewButton } from '../invoices/InvoicePreviewModal';
import { invoicePreview } from '../invoices/invoicePreviewSources';

// Client detail → Invoices. Every invoice type (care service days, registration
// fee, products/rentals, extra charges, combined quotation invoices) is merged
// into one list with the same columns, a plain-language status and the same
// actions, instead of one tab per type. Daily care invoices are grouped per
// booking per month so a long live-in booking doesn't bury everything else.

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const fmtMoney = (v) => money.format(Number(v || 0));
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayKey = (v) => (v ? String(v).slice(0, 10) : '');

const TYPES = {
  CARE: {
    label: 'Care service', cls: 'bg-sky-50 text-sky-700 ring-sky-200',
    hint: "Daily charges for a booking, grouped by month. Each day is approved before it's billed.",
  },
  REG_FEE: {
    label: 'Registration', cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    hint: 'Registration fee invoice.',
  },
  PRODUCT: {
    label: 'Products & rentals', cls: 'bg-teal-50 text-teal-700 ring-teal-200',
    hint: 'Product sales, rentals and deposits. Payments are recorded from the Products page.',
  },
  EXTRA: {
    label: 'Extra charge', cls: 'bg-orange-50 text-orange-700 ring-orange-200',
    hint: "A single custom charge from a service quotation. Paid through the quotation's Record Payment form.",
  },
  COMBINED: {
    label: 'Combined', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    hint: 'The merged invoice for a whole service quotation (registration + care charges + any linked product quote).',
  },
};

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

const DAY_STATUS = {
  PENDING: { label: 'Awaiting approval', tone: 'amber' },
  INVOICED: { label: 'Billed', tone: 'green' },
  SKIPPED: { label: 'Not billed', tone: 'gray' },
  REVOKED: { label: 'Revoked', tone: 'gray' },
};

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'ATTENTION', label: 'Needs attention' },
  { id: 'SETTLED', label: 'Paid / billed' },
];

const PAGE = 25;

const Pill = ({ tone = 'gray', children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>
    {children}
  </span>
);

const TypeTag = ({ type }) => (
  <span title={TYPES[type].hint} className={`inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${TYPES[type].cls}`}>
    {TYPES[type].label}
  </span>
);

// Paid / part paid / unpaid from amount vs. what has been paid so far.
const paymentState = (amount, paid, storedPaid) => {
  const due = Math.max(Number(amount || 0) - Number(paid || 0), 0);
  if (storedPaid || due <= 0.01) return { label: 'Paid', tone: 'green', due: 0, settled: true };
  if (Number(paid) > 0.01) return { label: 'Part paid', tone: 'blue', due, settled: false };
  return { label: 'Unpaid', tone: 'amber', due, settled: false };
};

const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40';
const resendBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-md bg-green-600 text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50';
const fieldCls = 'rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function Actions({ busy, onPreview, previewDisabled, download, onResend, onEdit }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {onEdit && (
        <button type="button" disabled={busy} onClick={onEdit} title="Edit amount" className={iconBtn}>
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <PreviewButton onClick={onPreview} disabled={previewDisabled} className={iconBtn} />
      {download.href !== undefined ? (
        <a
          href={download.href || undefined}
          target="_blank"
          rel="noreferrer"
          title="Download PDF"
          aria-disabled={!download.href}
          className={`${iconBtn} ${!download.href ? 'pointer-events-none opacity-40' : ''}`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      ) : (
        <button type="button" disabled={busy} onClick={download.onClick} title="Download PDF" className={iconBtn}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        </button>
      )}
      <button type="button" disabled={busy} onClick={onResend} title="Resend to client on WhatsApp" className={resendBtn}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export default function ClientInvoicesPanel({
  regFeeInvoices = [],
  dailyInvoices = [],
  productInvoices = [],
  lineItemInvoices = [],
  combinedInvoices = [],
  overdueInvoices = [],
  loading,
  onRefresh,
  busyId,
  error,
  actions,
  openPreview,
  // Which invoice types this admin may edit ({ CARE, REG_FEE, PRODUCT, EXTRA,
  // COMBINED }) and the opener from useInvoiceAmountEditor.
  canEdit = {},
  onEdit,
}) {
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [visible, setVisible] = useState(PAGE);

  const inRange = (d) => {
    const k = dayKey(d);
    return (!dateFrom || k >= dateFrom) && (!dateTo || k <= dateTo);
  };

  const overdueByCode = useMemo(() => {
    const m = new Map();
    overdueInvoices.filter((o) => o.status === 'OVERDUE' && o.invoice_code).forEach((o) => m.set(o.invoice_code, o));
    return m;
  }, [overdueInvoices]);

  // ── Normalise every source into one row shape ───────────────────────────────
  const rows = useMemo(() => {
    const out = [];
    const edit = (type, target) => (canEdit[type] && onEdit ? () => onEdit({ kind: type, ...target }) : null);

    // Only the client's current registration invoice is editable (the server's rule too).
    const currentRegFee = regFeeInvoices
      .filter((i) => i.status === 'SENT' || i.status === 'PAID')
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];

    regFeeInvoices.forEach((inv) => {
      const overdue = overdueByCode.has(inv.invoice_code);
      const isPaid = inv.status === 'PAID';
      const state = overdue
        ? { label: 'Overdue', tone: 'red', settled: false }
        : isPaid ? { label: 'Paid', tone: 'green', settled: true }
          : inv.status === 'SENT' ? { label: 'Unpaid', tone: 'amber', settled: false }
            : { label: inv.status, tone: 'gray', settled: false };
      out.push({
        id: `reg-${inv.invoice_id}`, type: 'REG_FEE', date: inv.created_at, code: inv.invoice_code,
        title: 'Registration fee',
        sub: inv.period_start && inv.period_end ? `Covers ${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}` : null,
        amount: inv.amount, state,
        busyKey: inv.invoice_id,
        preview: () => openPreview(invoicePreview.url(inv.pdf_url, { title: `Registration fee invoice ${inv.invoice_code || ''}`.trim(), filename: `${inv.invoice_code || 'Invoice'}.pdf` })),
        previewDisabled: !inv.pdf_url,
        download: { href: inv.pdf_url || '' },
        resend: () => actions.resendRegFee(inv.invoice_id),
        editRecord: inv,
        edit: inv.invoice_id === currentRegFee?.invoice_id
          ? edit('REG_FEE', { invoiceId: inv.invoice_id, currentAmount: inv.amount, label: 'Registration fee', code: inv.invoice_code })
          : null,
      });
    });

    [...productInvoices.map((i) => ['PRODUCT', i]), ...lineItemInvoices.map((i) => ['EXTRA', i])].forEach(([type, inv]) => {
      const state = paymentState(inv.amount, inv.amount_paid, inv.status === 'PAID');
      out.push({
        id: `inv-${inv.invoice_id}`, type, date: inv.created_at, code: inv.invoice_code,
        title: inv.item_summary || (type === 'EXTRA' ? 'Custom charge' : 'Products'),
        sub: [inv.estimate_number && `Quotation ${inv.estimate_number}`, inv.paid_at && `Paid ${fmtDate(inv.paid_at)}`].filter(Boolean).join(' · ') || null,
        duplicate: inv.is_duplicate,
        amount: inv.amount, paid: inv.amount_paid, state,
        busyKey: inv.invoice_id,
        preview: () => openPreview(invoicePreview.product(inv)),
        download: { onClick: () => actions.downloadProduct(inv) },
        resend: () => actions.resendProduct(inv),
        editRecord: inv,
        // A duplicate only mirrors another invoice's payment — edit that one instead.
        edit: inv.is_duplicate ? null : edit(type, {
          invoiceId: inv.invoice_id, currentAmount: inv.amount, paid: Number(inv.amount_paid || 0),
          label: inv.item_summary || TYPES[type].label, code: inv.invoice_code,
        }),
      });
    });

    combinedInvoices.forEach((inv) => {
      const state = paymentState(inv.total_amount, inv.amount_paid, inv.payment_status === 'PAID');
      out.push({
        id: `cmb-${inv.quote_id}`, type: 'COMBINED', date: inv.invoice_generated_at, code: inv.invoice_code,
        title: 'Full quotation invoice',
        sub: inv.estimate_number ? `Quotation ${inv.estimate_number}` : null,
        amount: inv.total_amount, paid: inv.amount_paid, state: { ...state, due: Number(inv.balance ?? state.due) },
        busyKey: inv.quote_id,
        preview: () => openPreview(invoicePreview.url(inv.invoice_pdf_url, { title: 'Combined invoice', subtitle: inv.payer_name || '' })),
        previewDisabled: !inv.invoice_pdf_url,
        download: { href: inv.invoice_pdf_url || '' },
        resend: () => actions.resendCombined(inv),
        editRecord: inv,
        edit: edit('COMBINED', { quoteId: inv.quote_id, code: inv.invoice_code }),
      });
    });

    // Care service days → one row per booking per month.
    const groups = new Map();
    dailyInvoices.filter((d) => inRange(d.service_date)).forEach((d) => {
      const key = `${d.booking_id}|${dayKey(d.service_date).slice(0, 7)}`;
      if (!groups.has(key)) groups.set(key, { key, booking_id: d.booking_id, booking_code: d.booking_code, service_type: d.service_type, month: dayKey(d.service_date).slice(0, 7), days: [] });
      groups.get(key).days.push(d);
    });
    groups.forEach((g) => {
      g.days.sort((a, b) => dayKey(b.service_date).localeCompare(dayKey(a.service_date)));
      const billed = g.days.filter((d) => d.status === 'INVOICED');
      const pending = g.days.filter((d) => d.status === 'PENDING').length;
      out.push({
        id: `care-${g.key}`, type: 'CARE', date: g.days[0].service_date, code: g.booking_code || g.booking_id?.slice(0, 8),
        title: monthLabel(g.month),
        booking: g,
        sub: `${billed.length} of ${g.days.length} day${g.days.length === 1 ? '' : 's'} billed`,
        amount: billed.reduce((s, d) => s + Number(d.amount || 0), 0),
        state: pending
          ? { label: `${pending} awaiting approval`, tone: 'amber', settled: false }
          : { label: 'Billed', tone: 'green', settled: true },
        days: g.days,
      });
    });

    return out.sort((a, b) => dayKey(b.date).localeCompare(dayKey(a.date)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regFeeInvoices, productInvoices, lineItemInvoices, combinedInvoices, dailyInvoices, overdueByCode, dateFrom, dateTo, canEdit, onEdit]);

  const q = search.trim().toLowerCase();
  const matchesSearch = (r) => !q || [r.code, r.title, r.sub, TYPES[r.type].label, r.state.label, r.booking?.service_type]
    .some((v) => String(v || '').toLowerCase().includes(q));
  const matchesStatus = (r) => statusFilter === 'ALL' || (statusFilter === 'SETTLED' ? r.state.settled : !r.state.settled);
  const dateOk = (r) => r.type === 'CARE' || inRange(r.date);

  const baseRows = rows.filter((r) => dateOk(r) && matchesSearch(r) && matchesStatus(r));
  const filtered = typeFilter === 'ALL' ? baseRows : baseRows.filter((r) => r.type === typeFilter);
  const typeCounts = baseRows.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] || 0) + 1 }), {});

  // ── Summary (always over everything, not the current filter) ────────────────
  const summary = useMemo(() => {
    const attention = rows.filter((r) => !r.state.settled).length;
    const overdueOpen = overdueInvoices.filter((o) => o.status === 'OVERDUE');
    const awaitingDays = dailyInvoices.filter((d) => d.status === 'PENDING').length;
    const careBilled = dailyInvoices.filter((d) => d.status === 'INVOICED').reduce((s, d) => s + Number(d.amount || 0), 0);
    return {
      attention,
      overdueCount: overdueOpen.length,
      overdueAmount: overdueOpen.reduce((s, o) => s + Number(o.amount || 0), 0),
      awaitingDays,
      careBilled,
    };
  }, [rows, overdueInvoices, dailyInvoices]);

  const hasFilters = typeFilter !== 'ALL' || statusFilter !== 'ALL' || q || dateFrom || dateTo;
  const clearFilters = () => {
    setTypeFilter('ALL'); setStatusFilter('ALL'); setSearch(''); setDateFrom(''); setDateTo(''); setVisible(PAGE);
  };
  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const cards = [
    { label: 'Needs attention', value: summary.attention, note: 'Unpaid, overdue or awaiting approval', tone: summary.attention ? 'text-amber-700' : 'text-gray-900', onClick: () => { setStatusFilter('ATTENTION'); setTypeFilter('ALL'); } },
    { label: 'Overdue', value: fmtMoney(summary.overdueAmount), note: `${summary.overdueCount} invoice${summary.overdueCount === 1 ? '' : 's'} past due`, tone: summary.overdueCount ? 'text-rose-700' : 'text-gray-900' },
    { label: 'Care days to approve', value: summary.awaitingDays, note: 'Not billed until approved', tone: summary.awaitingDays ? 'text-amber-700' : 'text-gray-900', onClick: () => { setTypeFilter('CARE'); setStatusFilter('ATTENTION'); } },
    { label: 'Care service billed', value: fmtMoney(summary.careBilled), note: 'All approved care days', tone: 'text-gray-900' },
  ];

  const showLoading = loading && rows.length === 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const Tag = c.onClick ? 'button' : 'div';
          return (
            <Tag
              key={c.label}
              type={c.onClick ? 'button' : undefined}
              onClick={c.onClick}
              className={`rounded-lg border border-gray-200 bg-white p-3 text-left ${c.onClick ? 'transition-colors hover:border-gray-300 hover:bg-gray-50' : ''}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{c.label}</p>
              <p className={`mt-0.5 text-lg font-semibold ${c.tone}`}>{c.value}</p>
              <p className="text-[11px] text-gray-400">{c.note}</p>
            </Tag>
          );
        })}
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[['ALL', 'All types'], ...Object.entries(TYPES).map(([k, t]) => [k, t.label])].map(([id, label]) => {
              const count = id === 'ALL' ? baseRows.length : (typeCounts[id] || 0);
              const active = typeFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  title={TYPES[id]?.hint}
                  onClick={() => { setTypeFilter(id); setVisible(PAGE); }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label} <span className={active ? 'text-blue-400' : 'text-gray-400'}>{count}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setStatusFilter(f.id); setVisible(PAGE); }}
                className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                  statusFilter === f.id ? 'bg-white text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisible(PAGE); }}
              placeholder="Search invoice no., booking, item…"
              className={`${fieldCls} w-full pl-8`}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={fieldCls} />
            <span className="text-xs text-gray-400">to</span>
            <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={fieldCls} />
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700">
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* List */}
      {showLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-12 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-semibold text-gray-700">{hasFilters ? 'No invoices match these filters' : 'No invoices for this client yet'}</p>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="mt-2 text-xs font-medium text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">For</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.slice(0, visible).map((r) => {
                if (r.type === 'CARE') {
                  const open = expanded.has(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="cursor-pointer hover:bg-gray-50" onClick={() => toggle(r.id)}>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          <span className="inline-flex items-center gap-1.5">
                            {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                            {r.title}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col items-start gap-1">
                            <Link
                              to={`/admin/bookings/${r.booking.booking_id}/detail`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {r.code}
                            </Link>
                            <TypeTag type="CARE" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {r.booking.service_type ? `${r.booking.service_type} care` : 'Care service'}
                          <span className="block text-[11px] text-gray-400">{r.sub} · click to {open ? 'hide' : 'see'} days</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtMoney(r.amount)}</td>
                        <td className="px-4 py-3"><Pill tone={r.state.tone}>{r.state.label}</Pill></td>
                        <td className="px-4 py-3 text-right text-xs text-gray-400 whitespace-nowrap">{r.days.length} day{r.days.length === 1 ? '' : 's'}</td>
                      </tr>
                      {open && r.days.map((d) => {
                        const st = DAY_STATUS[d.status] || { label: d.status, tone: 'gray' };
                        const decided = [d.decided_by_name && `by ${d.decided_by_name}`, d.decided_at && `on ${fmtDate(d.decided_at)}`].filter(Boolean).join(' ');
                        return (
                          <tr key={d.daily_invoice_id} className="bg-gray-50/60">
                            <td className="py-2 pl-10 pr-4 whitespace-nowrap text-gray-600">{fmtDate(d.service_date)}</td>
                            <td className="px-4 py-2 font-mono text-[11px] text-gray-400 whitespace-nowrap">DINV-{String(d.daily_invoice_id).slice(0, 8).toUpperCase()}</td>
                            <td className="px-4 py-2 text-gray-600">
                              {d.shift_label || (d.shift_number ? `Shift ${d.shift_number}` : 'Full day')}
                              {d.notes && <span className="block max-w-[260px] truncate text-[11px] text-gray-400" title={d.notes}>{d.notes}</span>}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-700 whitespace-nowrap">
                              {d.amount != null ? fmtMoney(d.amount) : '—'}
                              <EditedAmountBadge record={d} className="ml-1.5" />
                            </td>
                            <td className="px-4 py-2">
                              <Pill tone={st.tone} title={decided ? `Decided ${decided}` : undefined}>{st.label}</Pill>
                            </td>
                            <td className="px-4 py-2">
                              <Actions
                                busy={busyId === d.daily_invoice_id}
                                onPreview={() => openPreview(invoicePreview.daily(d))}
                                download={{ onClick: () => actions.downloadDaily(d) }}
                                onResend={() => actions.resendDaily(d)}
                                // Billed whole-day / per-staff rows; shift occurrences are corrected from the booking.
                                onEdit={canEdit.CARE && onEdit && d.status === 'INVOICED' && !d.shift_slot_id
                                  ? () => onEdit({
                                    kind: 'CARE', bookingId: r.booking.booking_id, serviceDate: dayKey(d.service_date),
                                    dailyInvoiceId: d.daily_invoice_id, currentAmount: d.amount,
                                    label: `Care day ${fmtDate(d.service_date)}`, code: r.code,
                                  })
                                  : null}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                }

                const overdue = r.state.label === 'Overdue';
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono text-xs text-gray-700">{r.code || '—'}</span>
                        <span className="flex items-center gap-1">
                          <TypeTag type={r.type} />
                          {r.duplicate && (
                            <span
                              title="This item is also billed on another invoice for the same quotation. It only mirrors that invoice's payment status."
                              className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500"
                            >
                              <Info className="h-2.5 w-2.5" /> Duplicate
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="block max-w-[320px] truncate" title={r.title}>{r.title}</span>
                      {r.sub && <span className="block text-[11px] text-gray-400">{r.sub}</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="font-semibold text-gray-800">{fmtMoney(r.amount)}</span>
                      <EditedAmountBadge record={r.editRecord} className="ml-1.5" />
                      {!r.state.settled && r.state.due > 0 && Number(r.paid) > 0 && (
                        <span className="block text-[11px] text-gray-400">{fmtMoney(r.state.due)} due</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={r.state.tone}>
                        {overdue && <AlertTriangle className="h-3 w-3" />}
                        {r.state.label}
                      </Pill>
                    </td>
                    <td className="px-4 py-3">
                      <Actions
                        busy={busyId === r.busyKey}
                        onPreview={r.preview}
                        previewDisabled={r.previewDisabled}
                        download={r.download}
                        onResend={r.resend}
                        onEdit={r.edit}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > visible && (
            <div className="border-t border-gray-100 px-4 py-3 text-center">
              <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="text-xs font-medium text-blue-600 hover:underline">
                Show more ({filtered.length - visible} more)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
