import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader2, Maximize2, Printer, Send, X } from 'lucide-react';
import apiClient from '../../../api/api';
import DateRangePicker from '../../../components/common/DateRangePicker';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import StatementPreview from './StatementPreview';

// The "Statement" section of the client detail page, kept in its own file so it can be redesigned on
// its own. It owns everything the section needs: the period, the Download / WhatsApp / Print actions and
// the live preview. The client detail page only passes in who the client is and the headline figures.
//
// Props
//   clientId        client_profile_id
//   clientProfile   the client's profile (uses full_name, mobile_number, client_code)
//   billedToName    the name printed on the statement ("To")
//   stats           headline figures, already formatted for display (ALL TIME, not the selected period):
//                     { transactions, paymentsMade, invoiced, overdue, netBalance }
//   overdueTone     tone of the overdue figure ('rose' | 'emerald' | ...)
//   links           where the "View" links lead: { paymentsMade, invoiced, overdue }
//   refreshKey      change this (e.g. after a payment is recorded) to reload the preview
//   onError         (message) => void   called when download / send fails
//
// StatementPreview mirrors the PDF template and is deliberately not touched from here.

// ── dates (local calendar days, YYYY-MM-DD) ──────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (iso, withYear) => {
  const [y, m, d] = iso.split('-');
  return `${d} ${MONTHS[Number(m) - 1]}${withYear ? ` ${y}` : ''}`;
};
const rangeText = (start, end) => {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmtShort(start, !sameYear)} – ${fmtShort(end, true)}`;
};
const dayCount = (start, end) => {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 864e5) + 1;
};

const PRESETS = [
  { key: 'month', label: 'This month', range: (t) => [toISO(new Date(t.getFullYear(), t.getMonth(), 1)), toISO(t)] },
  { key: 'prev', label: 'Previous month', range: (t) => [toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)), toISO(new Date(t.getFullYear(), t.getMonth(), 0))] },
  { key: 'year', label: 'This year', range: (t) => [toISO(new Date(t.getFullYear(), 0, 1)), toISO(t)] },
  { key: 'pyear', label: 'Previous year', range: (t) => [toISO(new Date(t.getFullYear() - 1, 0, 1)), toISO(new Date(t.getFullYear() - 1, 11, 31))] },
  { key: 'd30', label: 'Last 30 days', range: (t) => [toISO(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29)), toISO(t)] },
  { key: 'custom', label: 'Custom' },
];
const presetRange = (key) => PRESETS.find((p) => p.key === key).range(new Date());

// "LKR -1,200.00" / "-LKR 1,200.00" → -1200; null when there is no number.
const parseAmount = (value) => {
  if (value == null) return null;
  const text = String(value);
  const n = Number(text.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(n)) return null;
  return /-|\(/.test(text) ? -n : n;
};

// Printing: show only the preview. The preview scrolls inside a fixed-height box on screen, so the print
// rules also release that height, otherwise only the visible part would print.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #client-statement-print, #client-statement-print * { visibility: visible !important; }
  #client-statement-print { position: absolute; left: 0; top: 0; width: 100%; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #client-statement-print [class*="max-h-"] { max-height: none !important; overflow: visible !important; }
  #client-statement-print thead { position: static !important; }
  #client-statement-print [data-scaled-outer] { height: auto !important; overflow: visible !important; }
  #client-statement-print [data-scaled-inner] { transform: none !important; width: 100% !important; }
}`;

// The statement is laid out at a fixed "paper" width and then scaled down to whatever room the page
// has (the section sits two sidebars deep, so the room beside the controls is small). StatementPreview
// itself is not touched: it renders at its natural size inside the scaled box.
const PAPER_WIDTH = 860;
const ScaledBox = ({ children, onOpen, openLabel = 'View full size' }) => {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      setScale(Math.min(1, outer.clientWidth / PAPER_WIDTH) || 1);
      setHeight(inner.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const thumbnail = scale < 0.85 && onOpen;
  return (
    <div
      ref={outerRef}
      data-scaled-outer
      className="relative w-full overflow-hidden"
      style={height != null ? { height: height * scale } : undefined}
    >
      <div ref={innerRef} data-scaled-inner style={{ width: PAPER_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
      {thumbnail && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          title={openLabel}
          className="absolute inset-0 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        />
      )}
    </div>
  );
};

const btnBase = 'inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const btnPrimary = `${btnBase} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`;
const btnOutline = `${btnBase} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`;

const OverviewRow = ({ label, value, tone = 'text-slate-900', to }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5 border-b border-slate-100 py-2.5 text-[13px] text-slate-700 last:border-b-0 @2xl:text-sm">
    <span>{label}</span>
    <span className="flex items-center gap-2">
      <b className={`font-semibold tabular-nums ${tone}`}>{value}</b>
      {to && (
        <Link
          to={to}
          className="rounded px-1.5 py-0.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          View
        </Link>
      )}
    </span>
  </div>
);

const ClientStatementSection = ({
  clientId,
  clientProfile = {},
  billedToName,
  stats = {},
  overdueTone = 'slate',
  links = {},
  refreshKey,
  onError,
}) => {
  const [preset, setPreset] = useState('month');
  const [startDate, setStartDate] = useState(() => presetRange('month')[0]);
  const [endDate, setEndDate] = useState(() => presetRange('month')[1]);
  const [actionLoading, setActionLoading] = useState(''); // '' | 'download' | 'whatsapp'

  const [preview, setPreview] = useState(null);
  const [shown, setShown] = useState(null); // the period the loaded preview is actually for
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const fullBtnRef = useRef(null);
  const fullCloseRef = useRef(null);
  const fullWasOpen = useRef(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const waButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const wasOpen = useRef(false);
  const titleId = useId();
  const descId = useId();

  const phone = clientProfile.mobile_number ? formatMobileNumber(clientProfile.mobile_number) || clientProfile.mobile_number : '';
  const dateRange = useMemo(() => ({ start_date: startDate, end_date: endDate }), [startDate, endDate]);
  const rangeReversed = Boolean(startDate && endDate && startDate > endDate);
  const invalidRange = !startDate || !endDate || rangeReversed;
  const blocked = invalidRange || previewLoading || actionLoading !== '';
  const emptyPeriod = !invalidRange && !previewLoading && Array.isArray(preview?.ledger) && preview.ledger.length === 0;

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Preview: reloaded whenever the period changes (or refreshKey does). The previous preview stays on
  // screen (dimmed) while the next one loads.
  useEffect(() => {
    if (!clientId) return undefined;
    if (startDate && endDate && startDate > endDate) {
      setPreview(null);
      setShown(null);
      setPreviewError('The start date is after the end date.');
      return undefined;
    }
    // A custom range is picked in two clicks: until both ends are chosen, keep what is on screen.
    if (!startDate || !endDate) return undefined;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    apiClient.getClientStatement(clientId, { start_date: startDate, end_date: endDate })
      .then((res) => { if (!cancelled) { setPreview(res); setShown({ start: startDate, end: endDate }); } })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setShown(null);
        setPreviewError(err.message || 'Failed to load the statement preview');
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [clientId, startDate, endDate, refreshKey]);

  const selectPreset = (key) => {
    setPreset(key);
    if (key !== 'custom') {
      const [s, e] = presetRange(key);
      setStartDate(s);
      setEndDate(e);
    }
  };

  const downloadStatement = async () => {
    try {
      setActionLoading('download');
      const blob = await apiClient.downloadClientStatement(clientId, dateRange);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statement_${(clientProfile.full_name || 'client').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('Statement downloaded');
    } catch (downloadError) {
      console.error('Error downloading statement:', downloadError);
      onError?.(downloadError.message || 'Failed to download statement');
    } finally {
      setActionLoading('');
    }
  };

  const sendStatementToWhatsApp = async () => {
    try {
      setActionLoading('whatsapp');
      await apiClient.sendClientStatementToWhatsApp(clientId, dateRange);
      showToast('Statement sent to WhatsApp');
    } catch (sendError) {
      console.error('Error sending statement to WhatsApp:', sendError);
      onError?.(sendError.message || 'Failed to send statement via WhatsApp');
    } finally {
      setActionLoading('');
    }
  };

  // ── confirm dialog: focus moves in, returns to the trigger on close, Tab stays inside, Esc cancels ──
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  useEffect(() => {
    if (dialogOpen) {
      wasOpen.current = true;
      cancelRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      waButtonRef.current?.focus();
    }
  }, [dialogOpen]);
  const onDialogKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll('button:not([disabled])');
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const confirmSend = () => { closeDialog(); sendStatementToWhatsApp(); };

  // full-size preview dialog (same focus handling: in on open, back to the trigger on close, Esc closes)
  useEffect(() => {
    if (fullOpen) {
      fullWasOpen.current = true;
      fullCloseRef.current?.focus();
    } else if (fullWasOpen.current) {
      fullWasOpen.current = false;
      fullBtnRef.current?.focus();
    }
  }, [fullOpen]);
  const onFullKeyDown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setFullOpen(false); } };

  // ── overview (all-time figures from the parent) ──
  const net = parseAmount(stats.netBalance);
  const netTone = net == null || net === 0 ? 'text-slate-900' : net < 0 ? 'text-rose-700' : 'text-emerald-700';
  const overdueText = ['emerald', 'slate'].includes(overdueTone) ? 'text-slate-900' : 'text-amber-700';


  return (
    <div className="@container space-y-4">
      <style>{PRINT_CSS}</style>

      <div>
        <h2 className="text-[22px] font-semibold leading-tight text-slate-900">Statement</h2>
        <p className="mt-0.5 text-[13px] text-slate-500">
          {[billedToName, clientProfile.client_code].filter(Boolean).join(' · ')}
          {(billedToName || clientProfile.client_code) ? ' · ' : ''}send or download a statement of accounts
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {/* ── top row: billed to / period / actions on the left, client overview on the right ── */}
        <div className="grid items-start gap-3 @sm:grid-cols-2 @2xl:gap-5">
          <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-3 @2xl:p-[18px]">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Billed to</div>
              <div className="mt-0.5 text-[15px] font-semibold text-slate-900">{billedToName || '—'}</div>
              <div className="text-[13px] text-slate-500">{phone || 'No phone number on file'}</div>
            </div>

            <div>
              <div id={`${titleId}-period`} className="mb-2 text-[13px] font-semibold text-slate-600">Period</div>
              <div role="group" aria-labelledby={`${titleId}-period`} className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const on = preset === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => selectPreset(p.key)}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {preset === 'custom' && (
                <div className="mt-3">
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onChange={({ startDate: s, endDate: e }) => { setStartDate(s); setEndDate(e); }}
                    theme="blue"
                    allowPast
                    endRequired
                    quickEnds={false}
                    compact
                  />
                </div>
              )}

              {rangeReversed ? (
                <div role="alert" className="mt-2 text-[13px] text-red-700">The start date is after the end date.</div>
              ) : startDate && endDate ? (
                <div className="mt-3">
                  <div className="font-semibold text-slate-900">{rangeText(startDate, endDate)}</div>
                  <div className="text-[13px] text-slate-500">{dayCount(startDate, endDate)} {dayCount(startDate, endDate) === 1 ? 'day' : 'days'}</div>
                </div>
              ) : null}
            </div>

            {emptyPeriod && (
              <div className="rounded-md bg-amber-50 px-3 py-2.5 text-[13px] text-amber-700">
                <b>No transactions in this period.</b>
                <div className="mt-1.5">
                  <button
                    type="button"
                    onClick={() => selectPreset('year')}
                    className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Use this year
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <button type="button" onClick={downloadStatement} disabled={blocked} className={btnPrimary}>
                {actionLoading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download PDF
              </button>

              <button
                ref={waButtonRef}
                type="button"
                onClick={() => setDialogOpen(true)}
                disabled={blocked || !phone}
                aria-describedby={`${titleId}-wa`}
                className={btnOutline}
              >
                {actionLoading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send via WhatsApp
              </button>
              <div id={`${titleId}-wa`} className="-mt-1 text-[13px] text-slate-500">
                {phone ? `Sends to ${phone}` : 'No phone number on file'}
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                disabled={blocked || !preview}
                className="inline-flex h-8 items-center justify-start gap-2 rounded-md px-1 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-3 pb-2.5 pt-3 @2xl:px-[18px]">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Client overview</div>
              <span className="text-[13px] text-slate-500">All time</span>
            </div>
            <div className="mt-1">
              <OverviewRow label="Transactions" value={stats.transactions} />
              <OverviewRow label="Payments made" value={stats.paymentsMade} to={links.paymentsMade} />
              <OverviewRow label="Invoiced" value={stats.invoiced} to={links.invoiced} />
              <OverviewRow label="Overdue" value={stats.overdue} tone={overdueText} to={links.overdue} />
              <OverviewRow label="Net balance" value={stats.netBalance} tone={netTone} />
            </div>
          </div>
        </div>

        {/* ── preview: the real StatementPreview, scaled to fit the full width ── */}
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <b className="text-[15px] text-slate-900">Preview</b>
              <span className="text-[13px] text-slate-500">Matches the PDF and the WhatsApp message</span>
            </div>
            <div className="flex items-center gap-2">
              {previewLoading && preview && (
                <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating…
                </span>
              )}
              <button
                ref={fullBtnRef}
                type="button"
                onClick={() => setFullOpen(true)}
                disabled={!preview}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Full size
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-slate-200 p-2 @2xl:p-4">
            <div id="client-statement-print" className={`transition-opacity duration-200 ${previewLoading && preview ? 'opacity-50' : ''}`}>
              <ScaledBox onOpen={preview ? () => setFullOpen(true) : undefined}>
                <StatementPreview
                  data={preview}
                  loading={previewLoading}
                  error={previewError}
                  clientName={billedToName}
                  start={shown?.start || startDate}
                  end={shown?.end || endDate}
                />
              </ScaledBox>
            </div>
          </div>
        </div>
      </div>

      {/* ── full-size preview dialog ── */}
      {fullOpen && preview && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close"
            onClick={() => setFullOpen(false)}
            className="fixed inset-0 z-[60] cursor-default border-0 bg-slate-900/50"
          />
          <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-3 @sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Statement preview, full size"
              onKeyDown={onFullKeyDown}
              className="pointer-events-auto flex max-h-full w-full max-w-[940px] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
                <div className="text-[15px] font-semibold text-slate-900">
                  Statement · {rangeText(shown?.start || startDate, shown?.end || endDate)}
                </div>
                <button
                  ref={fullCloseRef}
                  type="button"
                  onClick={() => setFullOpen(false)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-4 w-4" /> Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-200 p-3 @sm:p-4">
                <ScaledBox>
                  <StatementPreview
                    data={preview}
                    loading={false}
                    error=""
                    clientName={billedToName}
                    start={shown?.start || startDate}
                    end={shown?.end || endDate}
                  />
                </ScaledBox>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── WhatsApp confirm dialog ── */}
      {dialogOpen && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cancel"
            onClick={closeDialog}
            className="fixed inset-0 z-[60] cursor-default border-0 bg-slate-900/40"
          />
          <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              onKeyDown={onDialogKeyDown}
              className="pointer-events-auto w-full max-w-[440px] rounded-lg border border-slate-200 bg-white p-[22px] shadow-2xl"
            >
              <div id={titleId} className="text-[17px] font-semibold text-slate-900">Send statement on WhatsApp?</div>
              <p id={descId} className="mb-[18px] mt-2 leading-relaxed text-slate-600">
                The statement for <b>{rangeText(startDate, endDate)}</b> will be sent to {billedToName} at <b>{phone}</b>.
              </p>
              <div className="flex justify-end gap-2">
                <button ref={cancelRef} type="button" onClick={closeDialog} className={btnOutline}>Cancel</button>
                <button type="button" onClick={confirmSend} className={btnPrimary}>Send</button>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
};

export default ClientStatementSection;
