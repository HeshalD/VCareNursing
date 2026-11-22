// Allocation history tab for the admin booking detail page: coverage timeline, filterable
// assignment list (grouped by shift slot for SHIFT_BASED), a details drawer with per-day staff
// pay, and the staff change log. Purely presentational — data and actions come in through props,
// so it can be restyled or previewed on its own (see SAMPLE_PROPS at the bottom).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, Download, Repeat2, Search, Users, X } from 'lucide-react';
import {
  formatRs, formatTimeHM, formatTimeWithDayOffset, formatWeekdayDMY, localDateISO,
  ATTENDANCE_STATUS_LABELS, SALARY_STATUS_LABELS,
} from './dayDisplay';
import { END_REASON_LABEL, CHANGE_TYPE_LABEL, CHANGE_MODE_LABEL } from './allocationHistoryModel';

// ── small helpers ───────────────────────────────────────────────────────────
const parseISO = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const dayIdx = (iso, startISO) => Math.round((parseISO(iso) - parseISO(startISO)) / 86400000);
const addDaysISO = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return localDateISO(d); };
const fmtShort = (v) => { if (!v) return '—'; const d = typeof v === 'string' && v.length === 10 ? parseISO(v) : new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
const fmtDT = (v) => { if (!v) return '—'; const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
const initials = (name = '') => name.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
const tint = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}22` : '#f1f5f9');

const CHIP_TONES = {
  ok: 'bg-emerald-50 text-emerald-700', bad: 'bg-red-50 text-red-700', warn: 'bg-amber-50 text-amber-700',
  mute: 'bg-slate-100 text-slate-600', info: 'bg-blue-50 text-blue-700',
};
const Chip = ({ tone = 'mute', children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONES[tone] || CHIP_TONES.mute}`}>{children}</span>
);
const BTN = 'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1';
const BTN_TONES = {
  neutral: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  warn: 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
  danger: 'border-red-300 bg-white text-red-700 hover:bg-red-50',
  solid: 'border-red-600 bg-red-600 text-white hover:bg-red-700',
  ghost: 'border-transparent bg-transparent text-blue-600 hover:bg-blue-50',
};
const Btn = ({ tone = 'neutral', className = '', ...p }) => <button type="button" className={`${BTN} ${BTN_TONES[tone]} ${className}`} {...p} />;
const FilterChip = ({ on, attn, children, ...p }) => (
  <button type="button" className={`rounded-full border px-3 py-1 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${on ? (attn ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-blue-300 bg-blue-50 text-blue-700') : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`} aria-pressed={!!on} {...p}>{children}</button>
);
const Label = ({ children }) => <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;
const PlainStaffLink = ({ children }) => <>{children}</>;
const Skeleton = ({ className = '' }) => <div className={`animate-pulse rounded-md bg-slate-100 ${className}`} />;

const ROW_GRID = 'grid items-center gap-x-3.5 px-4 grid-cols-[minmax(210px,1.5fr)_150px_minmax(170px,1fr)_130px_210px]';
const LOG_GRID = 'grid items-center gap-x-3.5 px-4 grid-cols-[100px_190px_minmax(150px,1.2fr)_minmax(150px,1.3fr)_150px_100px_64px]';
const HEAD = 'min-h-[36px] border-y border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500';
const STATUS = { ACTIVE: ['Active', 'ok'], SCHEDULED: ['Scheduled', 'info'], COMPLETED: ['Completed', 'mute'] };
const LOG_TYPE_TONE = (t) => (['LOGGED_OUT', 'RELIEVED', 'ENDED'].includes(t) ? 'warn' : ['ASSIGNED', 'MAKEUP'].includes(t) ? 'ok' : 'mute');
const MODE_TONE = (m) => (m === 'BACKDATED' ? 'warn' : m === 'SCHEDULED' ? 'info' : 'mute');
const PAY_TONE = (s) => (s === 'PAID' ? 'ok' : s === 'PENDING' ? 'warn' : s === 'REVOKED' ? 'bad' : 'mute');

/**
 * @param groups            [{ key, label|null, rows: Row[] }]  from buildAllocationRows()
 * @param totals            { paid, pending, paidDays, staffCount }
 * @param changeLog         normalised staff_change_log events
 * @param expanded          { [assignmentId]: boolean } — the row whose details drawer is open
 * @param onToggleExpand    (assignmentId) => void
 * @param onEditTimes       (row) => void
 * @param onCloseAssignment (row, replacementStartISO|null, mode?: 'settle') => void
 * @param canLogOutLastStaff boolean — may the only remaining staff be logged out (pauses booking)
 * @param StaffLink         optional link component: <StaffLink id={profileId}>name</StaffLink>
 * Optional extras (the tab works without them):
 * @param loading           show skeleton blocks
 * @param bookingCode, bookingStart, bookingEnd   header subtitle + coverage range (ISO dates)
 * @param pausedRanges      [{ start, end|null }] ISO dates — not counted as uncovered in the coverage bar
 */
export default function AllocationHistoryTab({
  groups = [], totals = { paid: 0, pending: 0, paidDays: 0, staffCount: 0 }, changeLog = [],
  expanded, onToggleExpand, onEditTimes = () => {}, onCloseAssignment = () => {},
  canLogOutLastStaff = false,
  // eslint-disable-next-line no-unused-vars -- used as a JSX component below
  StaffLink = PlainStaffLink, loading = false,
  bookingCode = null, bookingStart = null, bookingEnd = null, pausedRanges = [],
}) {
  const rows = useMemo(() => groups.flatMap(g => g.rows), [groups]);
  const today = localDateISO();

  // Drawer open-state lives in the parent's `expanded` map when supplied; otherwise locally.
  const [localExp, setLocalExp] = useState({});
  const expMap = onToggleExpand ? (expanded || {}) : localExp;
  const toggleExp = (id) => (onToggleExpand ? onToggleExpand(id) : setLocalExp(m => ({ ...m, [id]: !m[id] })));
  const selId = Object.keys(expMap).find(k => expMap[k]) || null;
  const selRow = rows.find(r => r.id === selId) || null;
  const openDetails = (id) => { if (selId === id) return; if (selId) toggleExp(selId); toggleExp(id); };
  const closeDetails = () => { if (selId) toggleExp(selId); };

  const [view, setView] = useState('alloc');
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [logFilter, setLogFilter] = useState('All');
  const [hideCancelled, setHideCancelled] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  const [toast, setToast] = useState('');
  const drawerRef = useRef(null);
  const lastFocus = useRef(null);
  const toastTimer = useRef(null);
  const flash = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 2600); };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Focus into the drawer when it opens, back to the trigger when it closes; Esc closes.
  useEffect(() => {
    if (selId) {
      lastFocus.current = document.activeElement;
      drawerRef.current?.querySelector('[data-close]')?.focus();
    } else if (lastFocus.current) {
      try { lastFocus.current.focus(); } catch { /* element gone */ }
      lastFocus.current = null;
    }
  }, [selId]);
  useEffect(() => {
    if (!selId && !confirmRow) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { if (confirmRow) setConfirmRow(null); else closeDetails(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // ── business rules (unchanged from the previous version) ─────────────────
  const ongoingCount = rows.filter(r => r.isOngoing && !r.shiftSlotId).length;
  const replacementStartFor = (row) => {
    const start = localDateISO(row.startDate);
    const assignedAfter = (r) => r.assignedOn && row.assignedOn && new Date(r.assignedOn) > new Date(row.assignedOn);
    const later = rows
      .filter(r => r.id !== row.id && r.isOngoing && !r.shiftSlotId && (localDateISO(r.startDate) > start || (localDateISO(r.startDate) === start && assignedAfter(r))))
      .map(r => localDateISO(r.startDate)).sort();
    return later[0] || null;
  };
  const canLogOut = (row) => row.isOngoing && !row.shiftSlotId
    && (ongoingCount > 1 ? replacementStartFor(row) : canLogOutLastStaff)
    && localDateISO(row.startDate) <= today;
  const attn = (r) => !!(r.needsTimeAction || r.needsPaySettlement);

  // ONE primary action per row, by priority.
  const primaryAction = (r) => {
    if (r.needsTimeAction) return { label: 'Enter times', tone: 'warn', run: () => onEditTimes(r) };
    if (r.needsPaySettlement) return { label: 'Settle pay', tone: 'warn', run: () => onCloseAssignment(r, null, 'settle') };
    if (canLogOut(r)) return { label: 'Log out & close', tone: 'danger', run: () => setConfirmRow(r) };
    if (r.trackTimes) return { label: 'Edit times', tone: 'neutral', run: () => onEditTimes(r) };
    return null;
  };

  // ── filters ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const matches = (r) => (
    (filter === 'All' || (filter === 'Attention' ? attn(r) : filter === 'Ongoing' ? r.statusKey === 'ACTIVE' : filter === 'Scheduled' ? r.statusKey === 'SCHEDULED' : r.statusKey === 'COMPLETED'))
    && (!q || `${r.name} ${r.staffId}`.toLowerCase().includes(q))
  );
  const filtering = filter !== 'All' || !!q;
  const counts = {
    All: rows.length, Ongoing: rows.filter(r => r.statusKey === 'ACTIVE').length, Scheduled: rows.filter(r => r.statusKey === 'SCHEDULED').length,
    Completed: rows.filter(r => r.statusKey === 'COMPLETED').length, Attention: rows.filter(attn).length,
  };
  const nTimes = rows.filter(r => r.needsTimeAction).length;
  const nSettle = rows.filter(r => r.needsPaySettlement).length;
  const showAttention = () => { setView('alloc'); setFilter('Attention'); setQuery(''); };

  // ── coverage timeline ─────────────────────────────────────────────────────
  const coverage = useMemo(() => {
    const flat = rows.filter(r => !r.shiftSlotId && !r.isMakeup && r.startISO);
    if (!flat.length) return null;
    const starts = flat.map(r => r.startISO).sort();
    const rangeStart = bookingStart ? String(bookingStart).slice(0, 10) : starts[0];
    const latest = [...flat.map(r => r.lastDayISO || r.startISO), today].sort().pop();
    const rangeEnd = bookingEnd ? [String(bookingEnd).slice(0, 10), latest].sort().pop() : latest;
    const total = Math.max(1, dayIdx(rangeEnd, rangeStart) + 1);
    const segs = flat.map(r => {
      let end = r.lastDayISO;
      if (!end) {
        const next = flat.filter(o => o.id !== r.id && o.startISO >= r.startISO && !(o.startISO === r.startISO && new Date(o.assignedOn || 0) <= new Date(r.assignedOn || 0)) && o.statusKey !== 'COMPLETED')
          .map(o => o.startISO).sort()[0];
        end = next ? addDaysISO(next, -1) : (r.statusKey === 'SCHEDULED' ? rangeEnd : [today, rangeEnd].sort()[0]);
      }
      if (end < r.startISO) end = r.startISO;
      return { id: r.id, name: r.name, color: r.color?.solid || '#94a3b8', scheduled: r.statusKey === 'SCHEDULED', s: Math.max(0, dayIdx(r.startISO, rangeStart)), e: Math.min(total - 1, dayIdx(end, rangeStart)) };
    }).filter(x => x.e >= x.s);
    const hasOpen = flat.some(r => r.statusKey !== 'COMPLETED');
    const windowEnd = hasOpen ? Math.max(...segs.map(x => x.e)) : Math.min(dayIdx(today, rangeStart), total - 1);
    const covered = new Set();
    segs.forEach(x => { for (let i = x.s; i <= x.e; i++) covered.add(i); });
    pausedRanges.forEach(p => {
      if (!p?.start) return;
      const a = Math.max(0, dayIdx(p.start, rangeStart));
      const b = Math.min(total - 1, p.end ? dayIdx(p.end, rangeStart) : dayIdx(today, rangeStart));
      for (let i = a; i <= b; i++) covered.add(i);
    });
    const gaps = [];
    for (let i = 0, run = null; i <= windowEnd; i++) {
      if (!covered.has(i)) { if (!run) run = [i, i]; else run[1] = i; }
      if ((covered.has(i) || i === windowEnd) && run) { gaps.push(run); run = null; }
    }
    return { rangeStart, rangeEnd, total, segs, gaps, todayIdx: dayIdx(today, rangeStart), legend: flat };
  }, [rows, bookingStart, bookingEnd, pausedRanges, today]);

  // ── CSV export of the visible rows ────────────────────────────────────────
  const exportCsv = () => {
    const vis = rows.filter(matches);
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Staff', 'Staff ID', 'Designation', 'Start', 'End', 'Status', 'Service days', 'Paid', 'Pending', 'Revoked days', 'Assigned by', 'Closed by'];
    const lines = vis.map(r => [r.name, r.staffId, r.designation, r.startISO, r.lastDayISO || '', STATUS[r.statusKey][0], r.dayCount ?? '', r.pay?.paid_total || 0, r.pay?.pending_total || 0, r.pay?.revoked_days || 0, r.assignedByName || '', r.closedByName || ''].map(esc).join(','));
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `allocation-history${bookingCode ? `-${bookingCode}` : ''}.csv`; a.click();
    URL.revokeObjectURL(url);
    flash(`Exported ${vis.length} row${vis.length !== 1 ? 's' : ''} to CSV`);
  };

  // ── row pieces ────────────────────────────────────────────────────────────
  const flagChips = (r) => (
    <>
      {r.missingOutTime && <Chip tone="warn">Out time missing</Chip>}
      {r.missingInTime && <Chip tone="warn">In time missing</Chip>}
      {r.needsPaySettlement && <Chip tone="warn">Pay not settled</Chip>}
    </>
  );
  const Avatar = ({ r, size = 36 }) => (
    <span className="flex flex-none items-center justify-center rounded-full text-[13px] font-bold" style={{ width: size, height: size, background: tint(r.color?.solid), color: r.color?.solid || '#475569' }}>{initials(r.name)}</span>
  );
  const periodText = (r) => (r.isScheduled ? `From ${fmtShort(r.startISO)}` : `${fmtShort(r.startISO)} → ${r.lastDayISO ? fmtShort(r.lastDayISO) : 'ongoing'}`);

  const renderRow = (r) => {
    const act = primaryAction(r);
    const [stLabel, stTone] = STATUS[r.statusKey];
    return (
      <div key={r.id} className={`${ROW_GRID} min-h-[68px] border-b border-slate-100 bg-white py-2.5 hover:bg-slate-50`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar r={r} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
              <StaffLink id={r.profileId}>{r.name}</StaffLink>{r.isMakeup && <Chip tone="warn">Makeup</Chip>}
            </div>
            <div className="text-[13px] text-slate-500">{[r.staffId !== '-' ? r.staffId : null, r.designation !== '-' ? r.designation : null].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">{periodText(r)}</div>
          {r.dayCount != null && <div className="text-[13px] text-slate-500">{r.dayCount} service day{r.dayCount !== 1 ? 's' : ''}</div>}
        </div>
        <div>
          <div className="flex flex-wrap gap-1.5"><Chip tone={stTone}>{stLabel}</Chip>{flagChips(r)}</div>
          {r.endReason && <div className="mt-1 text-[13px] text-slate-500">{END_REASON_LABEL[r.endReason] || r.endReason}</div>}
          {r.historicNoRecords && !r.needsPaySettlement && <div className="mt-1 text-[13px] text-slate-400">No attendance records (historic)</div>}
        </div>
        <div className="text-right tabular-nums">
          <div className="text-sm font-bold text-emerald-700">{formatRs(r.pay?.paid_total || 0)}</div>
          {(r.pay?.pending_total || 0) > 0 && <div className="text-[13px] text-amber-700">{formatRs(r.pay.pending_total)} pending</div>}
          {(r.pay?.revoked_days || 0) > 0 && <div className="text-[13px] text-red-700">{r.pay.revoked_days} revoked</div>}
        </div>
        <div className="flex justify-end gap-1.5">
          {act && <Btn tone={act.tone} onClick={act.run}>{act.label}</Btn>}
          <Btn tone="ghost" onClick={() => openDetails(r.id)} aria-label={`Details for ${r.name}`}>Details</Btn>
        </div>
      </div>
    );
  };

  const renderGroups = (pick) => groups.map(g => {
    const list = g.rows.filter(pick);
    if (!list.length) return null;
    return (
      <React.Fragment key={g.key}>
        {g.label && (
          <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[13px] font-bold text-slate-600">
            <span>{g.label}</span>
            <span className="tabular-nums font-semibold text-emerald-700">{formatRs(g.rows.reduce((t, r) => t + (r.pay?.paid_total || 0), 0))} paid</span>
          </div>
        )}
        {list.map(renderRow)}
      </React.Fragment>
    );
  });

  // ── change log helpers ────────────────────────────────────────────────────
  const matchRow = (ev) => {
    const asTarget = ['LOGGED_OUT', 'RELIEVED', 'ENDED'].includes(ev.type) ? ev.fromStaff : (ev.toStaff || ev.fromStaff);
    if (!asTarget) return null;
    const cand = rows.filter(r => r.name === asTarget);
    return cand.find(r => r.startISO === ev.effectiveDate || r.lastDayISO === ev.effectiveDate) || cand[cand.length - 1] || null;
  };
  const logTypes = useMemo(() => ['All', ...Array.from(new Set(changeLog.map(e => e.type)))], [changeLog]);
  const visibleLog = changeLog.filter(e => (logFilter === 'All' || e.type === logFilter) && !(hideCancelled && e.actionStatus === 'CANCELLED'));

  // ── render ────────────────────────────────────────────────────────────────
  const pending = totals.pending || 0;
  const stat = (label, value, cls = 'text-slate-900', extra = null) => (
    <div><Label>{label}</Label><div className={`mt-0.5 text-[22px] font-bold tabular-nums ${cls}`}>{value}</div>{extra}</div>
  );
  const subtitle = [bookingCode, bookingStart && `${fmtShort(String(bookingStart).slice(0, 10))} – ${bookingEnd ? fmtShort(String(bookingEnd).slice(0, 10)) : 'ongoing'}`].filter(Boolean).join(' · ');
  const pastRows = rows.filter(r => r.statusKey === 'COMPLETED');
  const gapText = coverage && coverage.gaps.length
    ? coverage.gaps.slice(0, 2).map(([a, b]) => `${b - a + 1} uncovered day${b > a ? 's' : ''} · ${fmtShort(addDaysISO(coverage.rangeStart, a))}${b > a ? `–${fmtShort(addDaysISO(coverage.rangeStart, b))}` : ''}`).join(', ') + (coverage.gaps.length > 2 ? ` +${coverage.gaps.length - 2} more` : '')
    : '';

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-8 w-60" /><Skeleton className="h-28" /><Skeleton className="h-10 w-72" /><Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold">Allocation history</h2>
          {subtitle && <div className="mt-0.5 text-[13px] text-slate-500">{subtitle}</div>}
        </div>
        <Btn onClick={exportCsv} disabled={!rows.length}><Download className="mr-1.5 h-4 w-4" aria-hidden="true" />Export CSV</Btn>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          <Users className="mx-auto mb-2 h-6 w-6 text-slate-400" aria-hidden="true" />No allocation history available.
        </div>
      ) : (
        <>
          {(nTimes > 0 || nSettle > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800" role="status">
              <span className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {[nTimes > 0 && `${nTimes} need${nTimes > 1 ? '' : 's'} times entered`, nSettle > 0 && `${nSettle} need${nSettle > 1 ? '' : 's'} pay settled`].filter(Boolean).join(' · ')}
              </span>
              <Btn tone="warn" onClick={showAttention}>Show them</Btn>
            </div>
          )}

          <div className="flex flex-wrap items-stretch gap-4">
            <div className="grid flex-[1_1_380px] grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-slate-200 bg-white p-4">
              {stat('Staff paid overall', formatRs(totals.paid || 0), 'text-emerald-700')}
              {stat('Pending pay', formatRs(pending), pending > 0 ? 'text-amber-700' : 'text-slate-900',
                pending > 0 && <button type="button" onClick={showAttention} className="-ml-1.5 mt-0.5 rounded px-1.5 text-[13px] font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">View pending</button>)}
              {stat('Days paid', totals.paidDays ?? 0)}
              {stat('Staff who worked it', totals.staffCount ?? 0)}
            </div>

            {coverage && (
              <div className="flex flex-[2_1_480px] flex-col gap-2.5 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <Label>Coverage timeline</Label>
                  <Chip tone={coverage.gaps.length ? 'bad' : 'ok'}>{coverage.gaps.length ? gapText : 'Every day covered'}</Chip>
                </div>
                <div className="relative mt-1.5 h-[30px]" role="img" aria-label={coverage.gaps.length ? gapText : 'Every day covered'}>
                  <div className="absolute inset-0 rounded-md bg-slate-100" />
                  {coverage.gaps.map(([a, b]) => (
                    <div key={`g${a}`} className="absolute inset-y-0 rounded border border-red-400" style={{ left: `${a / coverage.total * 100}%`, width: `${(b - a + 1) / coverage.total * 100}%`, background: 'repeating-linear-gradient(45deg,#fecaca,#fecaca 4px,#fff 4px,#fff 8px)' }} />
                  ))}
                  {coverage.segs.map(s => (
                    <div key={s.id} title={s.name} className="absolute inset-y-0 rounded border border-white" style={{ left: `${s.s / coverage.total * 100}%`, width: `${(s.e - s.s + 1) / coverage.total * 100}%`, background: s.color, opacity: s.scheduled ? 0.45 : 1 }} />
                  ))}
                  {coverage.todayIdx >= 0 && coverage.todayIdx < coverage.total && (
                    <div className="absolute -inset-y-1 w-0.5 bg-slate-900" style={{ left: `${(coverage.todayIdx + 0.5) / coverage.total * 100}%` }} />
                  )}
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{fmtShort(coverage.rangeStart)}</span>
                  {coverage.todayIdx >= 0 && coverage.todayIdx < coverage.total && <span>Today · {fmtShort(today)}</span>}
                  <span>{fmtShort(coverage.rangeEnd)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-600">
                  {coverage.legend.map(r => (
                    <span key={r.id} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: r.color?.solid || '#94a3b8' }} />{r.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="inline-flex w-fit gap-0.5 rounded-lg bg-slate-100 p-[3px]" role="tablist" aria-label="Allocation history views">
            {[['alloc', 'Assignments'], ['log', `Change log · ${changeLog.length}`]].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${view === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>
            ))}
          </div>

          {view === 'alloc' ? (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative max-w-xs flex-[1_1_240px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input value={query} onChange={e => setQuery(e.target.value)} aria-label="Search staff" placeholder="Search staff name or ID…"
                    className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
                </div>
                {['All', 'Ongoing', 'Scheduled', 'Completed', 'Attention'].map(k => (
                  <FilterChip key={k} on={filter === k} attn={k === 'Attention'} onClick={() => setFilter(k)}>{k === 'Attention' ? 'Needs attention' : k} · {counts[k]}</FilterChip>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <div className="min-w-[900px]">
                    <div className={`${ROW_GRID} ${HEAD}`}>
                      <div>Staff</div><div>Period</div><div>Status</div><div className="text-right">Staff pay</div><div className="text-right">Action</div>
                    </div>
                    {renderGroups(r => r.statusKey !== 'COMPLETED' && matches(r))}
                    {!filtering && pastRows.length > 0 && (
                      <button type="button" onClick={() => setPastOpen(o => !o)} aria-expanded={pastOpen}
                        className="flex w-full items-center gap-2 border-y border-slate-200 bg-slate-50 px-4 py-3 text-left text-[13px] font-bold text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
                        <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${pastOpen ? 'rotate-90' : ''}`} aria-hidden="true" />Past assignments ({pastRows.length})
                      </button>
                    )}
                    {(filtering || pastOpen) && renderGroups(r => r.statusKey === 'COMPLETED' && matches(r))}
                    {!rows.some(matches) && (
                      <div className="p-9 text-center text-sm text-slate-500">No assignments match.
                        <Btn className="ml-2" onClick={() => { setFilter('All'); setQuery(''); }}>Clear filters</Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <p className="text-[13px] text-slate-500">Every swap, shift reassignment, log-out, leave relief, makeup and scheduled change, by the date it takes effect. Out/in times live on the assignments — use "Edit times" there to add or correct them.</p>
              <div className="flex flex-wrap gap-2.5">
                {logTypes.map(k => <FilterChip key={k} on={logFilter === k} onClick={() => setLogFilter(k)}>{k === 'All' ? 'All' : (CHANGE_TYPE_LABEL[k] || k)}</FilterChip>)}
                <FilterChip on={hideCancelled} onClick={() => setHideCancelled(h => !h)}>Hide cancelled</FilterChip>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <div className="min-w-[900px]">
                    <div className={`${LOG_GRID} ${HEAD}`}>
                      <div>Effective</div><div>Change</div><div>Staff</div><div>Reason</div><div>Initiated by</div><div>Out → In</div><div />
                    </div>
                    {visibleLog.map(ev => {
                      const target = matchRow(ev);
                      return (
                        <div key={ev.id} className={`${LOG_GRID} min-h-[64px] border-b border-slate-100 py-2.5 text-sm text-slate-700 ${ev.actionStatus === 'CANCELLED' ? 'opacity-60' : ''}`}>
                          <div className="font-semibold text-slate-900">{ev.effectiveDate ? fmtShort(ev.effectiveDate) : '—'}</div>
                          <div>
                            <div className="flex flex-wrap gap-1.5"><Chip tone={LOG_TYPE_TONE(ev.type)}>{CHANGE_TYPE_LABEL[ev.type] || ev.type}</Chip>{ev.mode && <Chip tone={MODE_TONE(ev.mode)}>{CHANGE_MODE_LABEL[ev.mode] || ev.mode}</Chip>}</div>
                            {ev.actionStatus && <div className={`mt-1 text-[13px] ${ev.actionStatus === 'SCHEDULED' ? 'text-blue-700' : 'text-red-700'}`}>{ev.actionStatus === 'SCHEDULED' ? 'Not yet executed' : ev.actionStatus === 'CANCELLED' ? 'Cancelled' : 'Failed'}</div>}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{[ev.fromStaff, ev.toStaff].filter(Boolean).join(' → ') || '—'}</div>
                            {ev.shiftLabel && <div className="text-[13px] text-slate-500">{ev.shiftLabel}</div>}
                          </div>
                          <div className={ev.reason ? '' : 'text-slate-500'}>{ev.reason || 'No reason provided'}</div>
                          <div>{ev.initiatedBy || '—'}{ev.recordedAt && <div className="text-[13px] text-slate-500">recorded {fmtShort(ev.recordedAt)}</div>}</div>
                          <div className="tabular-nums">{ev.outTime || ev.inTime ? `${ev.outTime ? formatTimeHM(ev.outTime) : '—'} → ${ev.inTime ? formatTimeHM(ev.inTime) : '—'}` : '—'}</div>
                          <div className="text-right">{target && <Btn tone="ghost" className="px-2" onClick={() => { setView('alloc'); openDetails(target.id); }}>View</Btn>}</div>
                        </div>
                      );
                    })}
                    {!visibleLog.length && <div className="p-9 text-center text-sm text-slate-500"><Repeat2 className="mx-auto mb-2 h-5 w-5 text-slate-400" aria-hidden="true" />No staff changes match.</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── details drawer ─────────────────────────────────────────────── */}
      {selRow && (() => {
        const r = selRow;
        const act = primaryAction(r);
        const [stLabel, stTone] = STATUS[r.statusKey];
        const days = r.pay?.days || [];
        const timeCell = (rec, field, missing) => (rec?.[field] ? fmtDT(rec[field]) : missing ? <span className="font-semibold text-amber-700">Missing</span> : '—');
        return (
          <>
            <button type="button" aria-label="Close details" className="fixed inset-0 z-40 bg-slate-900/35" onClick={closeDetails} tabIndex={-1} />
            <div ref={drawerRef} role="dialog" aria-modal="true" aria-label={`Assignment details for ${r.name}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-3"><Avatar r={r} size={42} /><div><div className="text-base font-semibold">{r.name}</div><div className="text-[13px] text-slate-500">{[r.staffId !== '-' ? r.staffId : null, r.designation !== '-' ? r.designation : null].filter(Boolean).join(' · ')}</div></div></div>
                <Btn data-close onClick={closeDetails}><X className="mr-1 h-4 w-4" aria-hidden="true" />Close</Btn>
              </div>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 text-sm">
                <div className="flex flex-wrap gap-1.5"><Chip tone={stTone}>{stLabel}</Chip>{flagChips(r)}{r.isMakeup && <Chip tone="warn">Makeup</Chip>}{r.endReason && <Chip>{END_REASON_LABEL[r.endReason] || r.endReason}</Chip>}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Period</Label><div className="font-semibold">{periodText(r)}</div>{r.dayCount != null && <div className="text-[13px] text-slate-500">{r.dayCount} service day{r.dayCount !== 1 ? 's' : ''}</div>}</div>
                  <div><Label>Rate</Label><div className="font-semibold">{formatRs(r.dailyRate)} {r.shiftSlotId ? 'per shift' : 'per day'}</div></div>
                  <div><Label>In time</Label>{r.trackTimes ? timeCell(r.inRecord, 'in_time', r.missingInTime) : <span className="text-slate-500">Per shift</span>}</div>
                  <div><Label>Out time</Label>{r.trackTimes ? (r.outRecord?.out_time ? fmtDT(r.outRecord.out_time) : r.missingOutTime ? <span className="font-semibold text-amber-700">Missing</span> : (r.isOngoing ? 'Ongoing' : '—')) : <span className="text-slate-500">Per shift</span>}</div>
                  <div><Label>Assigned by</Label>{r.assignedByName || '—'}{r.assignedOn && <div className="text-[13px] text-slate-500">{fmtDT(r.assignedOn)}</div>}</div>
                  <div><Label>Closed by</Label>{r.closedByName || '—'}</div>
                </div>
                <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div><Label>Paid</Label><b className="tabular-nums text-emerald-700">{formatRs(r.pay?.paid_total || 0)}</b></div>
                  <div><Label>Pending</Label><b className="tabular-nums text-amber-700">{formatRs(r.pay?.pending_total || 0)}</b></div>
                  <div><Label>Revoked</Label><b className="tabular-nums text-red-700">{r.pay?.revoked_days ? `${r.pay.revoked_days} day${r.pay.revoked_days > 1 ? 's' : ''}` : 'None'}</b></div>
                </div>
                <div>
                  <div className="mb-2"><Label>Pay by day</Label></div>
                  {days.length ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      {days.map(d => (
                        <div key={d.service_date + (d.is_makeup ? 'm' : '')} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0">
                          <b>{formatWeekdayDMY(d.service_date)}</b><b className="text-right tabular-nums">{d.salary_amount != null ? formatRs(d.salary_amount) : '—'}</b>
                          <div className="text-[13px] text-slate-500">
                            {ATTENDANCE_STATUS_LABELS[d.attendance_status] || (d.in_time || d.out_time ? `${formatTimeHM(d.in_time)} – ${formatTimeWithDayOffset(d.out_time, d.service_date)}` : '—')}
                            {d.hours_served != null && d.hours_served !== '' ? ` · ${Number(d.hours_served).toFixed(1)}h` : ''}{d.decided_by_name ? ` · ${d.decided_by_name}` : ''}
                          </div>
                          <div className="text-right"><Chip tone={PAY_TONE(d.salary_status)}>{SALARY_STATUS_LABELS[d.salary_status] || d.salary_status}</Chip></div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-[13px] text-slate-500">No days yet. This assignment has not started.</div>}
                </div>
              </div>
              {act && (
                <div className="flex justify-end border-t border-slate-200 px-5 py-3.5">
                  <Btn tone={act.tone} onClick={() => { closeDetails(); act.run(); }}>{act.label}</Btn>
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── log out & close confirm ────────────────────────────────────── */}
      {confirmRow && (() => {
        const rs = replacementStartFor(confirmRow);
        const repl = rs ? rows.find(o => o.id !== confirmRow.id && o.isOngoing && !o.shiftSlotId && localDateISO(o.startDate) === rs) : null;
        return (
          <>
            <button type="button" aria-label="Cancel" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={() => setConfirmRow(null)} tabIndex={-1} />
            <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
              <div role="dialog" aria-modal="true" aria-label="Log out and close" className="pointer-events-auto w-full max-w-[440px] rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="text-[17px] font-semibold">Log out {confirmRow.name}?</div>
                <p className="mb-4 mt-2 text-sm leading-relaxed text-slate-600">
                  {repl
                    ? `Their assignment ends the day before ${repl.name} starts on ${fmtShort(rs)}.`
                    : 'They are the last staff on this booking, so the booking will be paused from that day.'}
                  {' '}You will choose the out time and settle their final days next.
                </p>
                <div className="flex justify-end gap-2">
                  <Btn onClick={() => setConfirmRow(null)}>Cancel</Btn>
                  <Btn tone="solid" onClick={() => { const row = confirmRow; setConfirmRow(null); onCloseAssignment(row, replacementStartFor(row)); }}>Log out &amp; close</Btn>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50">{toast}</div>}
    </div>
  );
}

// Minimal props for previewing the component on its own: <AllocationHistoryTab {...SAMPLE_PROPS} />
const _pay = (paid, pending, days = []) => ({ paid_total: paid, pending_total: pending, revoked_days: 0, record_count: days.length, days });
const _row = (o) => ({ profileId: o.id, staffId: `ST-${o.id}`, designation: 'Nurse', dailyRate: 4500, trackTimes: true, isMakeup: false, shiftSlotId: null, assignedOn: o.startISO, ...o });
// eslint-disable-next-line react-refresh/only-export-components
export const SAMPLE_PROPS = {
  bookingCode: 'BK-1042', bookingStart: '2026-10-10', bookingEnd: '2026-11-30',
  totals: { paid: 121500, pending: 4500, paidDays: 37, staffCount: 3 },
  groups: [{ key: '__line__', label: null, rows: [
    _row({ id: 'a', name: 'Kamani Silva', color: { solid: '#2563eb' }, startISO: '2026-11-12', startDate: '2026-11-12', lastDayISO: null, endDate: null, statusKey: 'ACTIVE', isOngoing: true, isScheduled: false, dayCount: 11, pay: _pay(45000, 4500), assignedByName: 'Admin' }),
    _row({ id: 'b', name: 'Ruwan Jayasuriya', color: { solid: '#0d9488' }, startISO: '2026-11-01', startDate: '2026-11-01', lastDayISO: '2026-11-11', endDate: '2026-11-11', statusKey: 'COMPLETED', isOngoing: false, isScheduled: false, dayCount: 11, needsPaySettlement: true, endReason: 'SWAPPED', pay: _pay(45000, 4500) }),
  ] }],
  changeLog: [{ id: 'e1', type: 'SWAP', effectiveDate: '2026-11-12', recordedAt: '2026-11-11T10:00:00Z', fromStaff: 'Ruwan Jayasuriya', toStaff: 'Kamani Silva', reason: 'Contract ended', initiatedBy: 'Admin', mode: 'IMMEDIATE', outTime: null, inTime: null }],
};
