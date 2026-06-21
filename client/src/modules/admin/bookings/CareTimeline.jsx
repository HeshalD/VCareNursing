import React, { useState, useMemo, useEffect } from 'react';
import { Wallet, Receipt } from 'lucide-react';

const NURSE_COLORS = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const BAR_COLOR = { paid: '#2F8A5B', overdue: '#C2483C', upcoming: '#D5CFC4' };
const PILL = {
  paid:     { bg: 'rgba(47,138,91,.22)',  color: '#2F8A5B', label: 'Paid' },
  overdue:  { bg: 'rgba(194,72,60,.24)',  color: '#C2483C', label: 'Overdue' },
  upcoming: { bg: 'rgba(213,207,196,.5)', color: '#8A8478', label: 'Upcoming' },
};

// Colour for the small salary/invoice status icons and their tooltip detail lines.
const META_COLOR = { PENDING: '#C98A2E', PAID: '#2F8A5B', INVOICED: '#2F8A5B', SKIPPED: '#B4AEA3' };
const metaLabel = (meta, doneWord) => {
  if (!meta) return '';
  if (meta.status === 'PENDING') return 'Action needed';
  if (meta.status === 'SKIPPED') return 'Skipped';
  return `${doneWord} Rs ${Number(meta.amount || 0).toLocaleString('en-US')}`;
};

const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtFull  = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const shiftDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };
// Local calendar date as YYYY-MM-DD — avoids toISOString()'s UTC conversion, which can
// shift the date by a day depending on the browser's timezone offset.
const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Props:
//   simDate            — YYYY-MM-DD string or null (controlled by parent)
//   onSimDateChange    — (dateStr | null) => void
//   onDayClick         — (dateStr, dayNum) => void — only fires for past/today cells; omit to keep cells non-interactive
//   attendanceRecords  — rows from GET /bookings/:id/attendance (staff_daily_attendance)
//   dailyInvoiceRecords — rows from GET /bookings/:id/daily-invoices (booking_daily_invoices)
//   manualSalaryDay    — true if this booking's staff salary requires a manual per-day decision (i.e. not LIVE_IN)
//   manualInvoiceDay   — true if this booking's client invoicing requires a manual per-day decision
const CareTimeline = ({
  startDate,
  plannedDays,
  dailyRate,
  totalPaid,
  staffAssignments = [],
  simDate = null,
  onSimDateChange,
  onDayClick,
  attendanceRecords = [],
  dailyInvoiceRecords = [],
  manualSalaryDay = false,
  manualInvoiceDay = false,
}) => {
  const [weekOffset,    setWeekOffset]    = useState(null);
  const [hoveredDay,    setHoveredDay]    = useState(null);
  const [showSimPicker, setShowSimPicker] = useState(false);

  // ── Core date references ──────────────────────────────────────────────────

  const start = useMemo(() => {
    if (!startDate) return null;
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [startDate]);

  const effectiveToday = useMemo(() => {
    const d = simDate ? new Date(simDate) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [simDate]);

  // ── Day counts — intentionally NOT capped at plannedDays ─────────────────
  // Bookings can overrun their planned end date; we show those extra days.

  const servedDays = useMemo(() => {
    if (!start) return 0;
    return Math.max(0, Math.floor((effectiveToday - start) / 86400000) + 1);
  }, [start, effectiveToday]);

  const paidDays = useMemo(() => {
    if (!dailyRate || dailyRate <= 0) return 0;
    return Math.floor(Number(totalPaid || 0) / dailyRate);
  }, [totalPaid, dailyRate]);

  // displayDays drives how many cells are rendered; expands when booking overruns.
  const displayDays  = Math.max(plannedDays || 0, servedDays);
  const overrunDays  = Math.max(0, servedDays - (plannedDays || 0));
  const overdueCount  = Math.max(0, servedDays - paidDays);
  const upcomingCount = Math.max(0, (plannedDays || 0) - servedDays);

  // ── Nurse colour pool ─────────────────────────────────────────────────────

  const nurseColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...staffAssignments].sort(
      (a, b) => new Date(a.service_start_date || a.startDate || 0) - new Date(b.service_start_date || b.startDate || 0)
    );
    let idx = 0;
    sorted.forEach((a) => {
      const id = a.staff_profile_id || a.staffId || a.id;
      if (id && !map.has(id)) { map.set(id, NURSE_COLORS[idx % NURSE_COLORS.length]); idx++; }
    });
    return map;
  }, [staffAssignments]);

  // ── Salary / invoice status per day ──────────────────────────────────────

  const attendanceByDate = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => {
      const key = r.service_date?.slice(0, 10);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [attendanceRecords]);

  const invoiceByDate = useMemo(() => {
    const map = new Map();
    dailyInvoiceRecords.forEach((r) => {
      const key = r.service_date?.slice(0, 10);
      if (key) map.set(key, r);
    });
    return map;
  }, [dailyInvoiceRecords]);

  const getDayMeta = (dateISO, delivered) => {
    if (!delivered) return { salary: null, invoice: null };

    const salaryRecs = attendanceByDate.get(dateISO) || [];
    let salary = null;
    if (salaryRecs.length > 0) {
      const anyPending = salaryRecs.some((r) => r.salary_status === 'PENDING');
      const anyPaid    = salaryRecs.some((r) => r.salary_status === 'PAID');
      const status = anyPending ? 'PENDING' : anyPaid ? 'PAID' : 'SKIPPED';
      const decidedBy = [...new Set(salaryRecs.filter((r) => r.decided_by_name).map((r) => r.decided_by_name))].join(', ') || null;
      const amount = salaryRecs.reduce((sum, r) => sum + (r.salary_status === 'PAID' ? Number(r.salary_amount || 0) : 0), 0);
      salary = { status, decidedBy, amount };
    } else if (manualSalaryDay) {
      salary = { status: 'PENDING', decidedBy: null, amount: 0 };
    }

    const invRec = invoiceByDate.get(dateISO);
    let invoice = null;
    if (invRec) {
      invoice = { status: invRec.status, decidedBy: invRec.decided_by_name || null, amount: Number(invRec.amount || 0) };
    } else if (manualInvoiceDay) {
      invoice = { status: 'PENDING', decidedBy: null, amount: 0 };
    }

    return { salary, invoice };
  };

  const getNurseForDay = (dayNum) => {
    if (!start) return null;
    const dayDate = shiftDays(start, dayNum - 1);
    dayDate.setHours(12, 0, 0, 0);

    // Among all assignments whose date range covers this day, pick the one with
    // the latest service_start_date. This ensures swapped-in nurses correctly
    // override the previous nurse even when the old assignment has no end date.
    let bestMatch = null;
    let bestStart = null;

    for (const a of staffAssignments) {
      const aStart = new Date(a.service_start_date || a.startDate);
      aStart.setHours(0, 0, 0, 0);
      const aEnd = (a.service_end_date || a.endDate) ? new Date(a.service_end_date || a.endDate) : null;
      if (aEnd) aEnd.setHours(23, 59, 59, 999);

      if (dayDate >= aStart && (!aEnd || dayDate <= aEnd)) {
        if (!bestStart || aStart > bestStart) {
          bestStart = aStart;
          const id = a.staff_profile_id || a.staffId || a.id;
          bestMatch = {
            name:        a.full_name || a.staff_name || a.name || 'Staff',
            designation: a.designation || '',
            color:       nurseColorMap.get(id) || NURSE_COLORS[0],
          };
        }
      }
    }
    return bestMatch;
  };

  // ── Week grid ─────────────────────────────────────────────────────────────

  const totalWeeks = Math.ceil(displayDays / 7) || 1;
  const maxOffset  = Math.max(0, totalWeeks - 4);
  const curOffset  = weekOffset ?? maxOffset;

  // When simDate changes, jump to the week that contains the simulated "today"
  useEffect(() => {
    if (!start) return;
    if (simDate) {
      const dayNum  = Math.max(1, Math.floor((effectiveToday - start) / 86400000) + 1);
      const simWeek = Math.floor((dayNum - 1) / 7);
      setWeekOffset(Math.max(0, Math.min(simWeek, maxOffset)));
    } else {
      setWeekOffset(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simDate]);

  const weeks = useMemo(() => {
    if (!start || !displayDays) return [];
    const result = [];
    for (let wi = curOffset; wi < curOffset + 4; wi++) {
      const firstDay = wi * 7 + 1;
      const days = [];
      for (let k = 0; k < 7; k++) {
        const dayNum = firstDay + k;
        if (dayNum > displayDays) {
          days.push({ filled: false, dayNum });
        } else {
          const dayDate  = shiftDays(start, dayNum - 1);
          const nurse    = getNurseForDay(dayNum);
          const isToday  = dayNum === servedDays;
          const delivered = dayNum <= servedDays;
          const isOverrun = dayNum > (plannedDays || 0); // beyond original booking end
          const status   = dayNum <= paidDays ? 'paid' : dayNum <= servedDays ? 'overdue' : 'upcoming';
          const dateISO  = toLocalISO(dayDate);
          const { salary: salaryMeta, invoice: invoiceMeta } = getDayMeta(dateISO, delivered);
          days.push({
            filled: true, dayNum, nurse, isToday, delivered, isOverrun, status,
            dateLabel: isToday ? 'Today' : fmtShort(dayDate),
            tipDate:   `${fmtFull(dayDate)} · Day ${dayNum}${isOverrun ? ' · overrun' : ''}`,
            dateISO, salaryMeta, invoiceMeta,
          });
        }
      }
      const lastReal = Math.min(firstDay + 6, displayDays);
      result.push({
        label: `Week ${wi + 1}`,
        range: `${fmtShort(shiftDays(start, firstDay - 1))} – ${fmtShort(shiftDays(start, lastReal - 1))}`,
        days,
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curOffset, displayDays, plannedDays, paidDays, servedDays, start, nurseColorMap, attendanceByDate, invoiceByDate, manualSalaryDay, manualInvoiceDay]);

  const legendNurses = useMemo(() => {
    const seen = new Set();
    return [...staffAssignments]
      .sort((a, b) => new Date(a.service_start_date || a.startDate || 0) - new Date(b.service_start_date || b.startDate || 0))
      .filter((a) => {
        const id = a.staff_profile_id || a.staffId || a.id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((a) => {
        const id = a.staff_profile_id || a.staffId || a.id;
        return { name: a.full_name || a.staff_name || a.name || 'Staff', color: nurseColorMap.get(id) || NURSE_COLORS[0] };
      });
  }, [staffAssignments, nurseColorMap]);

  // ── Early exit ────────────────────────────────────────────────────────────

  if (!startDate || !plannedDays) {
    return (
      <div className="bg-white border border-[#ECE7DF] rounded-2xl p-6">
        <h2 className="text-lg font-bold text-[#2A2722]">Care timeline</h2>
        <p className="text-sm text-[#9A9488] mt-2">Timeline data is not available for this booking.</p>
      </div>
    );
  }

  const firstVisibleDay = curOffset * 7 + 1;
  const lastVisibleDay  = Math.min((curOffset + 4) * 7, displayDays);

  return (
    <div className="bg-white border border-[#ECE7DF] rounded-2xl p-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#2A2722] tracking-tight">Care timeline</h2>
            <span className="text-xs font-semibold text-[#9A9488] hidden sm:inline">Hover a day to see who was on duty</span>
          </div>
          <p className="text-sm text-[#6F6A60] mt-1">Each block is one day of care. Colour shows the assigned nurse; the bar below shows payment.</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-[#8A8478] hidden sm:inline">
            Weeks {curOffset + 1}–{Math.min(curOffset + 4, totalWeeks)} · Days {firstVisibleDay}–{lastVisibleDay}
          </span>

          {/* ── Sim date picker ── */}
          <div className="relative">
            <button
              onClick={() => setShowSimPicker((v) => !v)}
              title="Simulate a different date"
              className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg border text-xs font-semibold transition"
              style={simDate
                ? { background: '#FEF9C3', borderColor: '#FDE047', color: '#713F12' }
                : { background: 'white', borderColor: '#E7E1D6', color: '#8A8478' }
              }
            >
              {simDate ? `Sim: ${simDate}` : 'Test date'}
            </button>
            {showSimPicker && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-xl shadow-xl border border-[#E7E1D6] bg-white p-3"
                style={{ minWidth: 230 }}
              >
                <div className="text-xs font-bold text-[#5A554B] mb-1">Simulate "today" as</div>
                <div className="text-[11px] text-[#9A9488] mb-2">
                  All outstanding, overdue days and staff assignments update to reflect this date.
                </div>
                <input
                  type="date"
                  value={simDate || new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    onSimDateChange?.(e.target.value || null);
                    setShowSimPicker(false);
                  }}
                  className="w-full border border-[#E7E1D6] rounded-lg px-2.5 py-1.5 text-sm text-[#2A2722] focus:outline-none focus:ring-2 focus:ring-[#137A6B]"
                />
                {simDate && (
                  <button
                    onClick={() => { onSimDateChange?.(null); setShowSimPicker(false); }}
                    className="mt-2 w-full text-xs font-semibold text-[#C2483C] hover:underline"
                  >
                    Reset to real today
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-1.5">
            <button
              onClick={() => setWeekOffset(Math.max(0, curOffset - 1))}
              disabled={curOffset === 0}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] disabled:text-[#CFC9BE] disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >‹</button>
            <button
              onClick={() => setWeekOffset(Math.min(maxOffset, curOffset + 1))}
              disabled={curOffset >= maxOffset}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] disabled:text-[#CFC9BE] disabled:cursor-not-allowed hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >›</button>
          </div>
        </div>
      </div>

      {/* ── Sim active banner ── */}
      {simDate && (
        <div
          className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 mb-4 text-sm font-semibold"
          style={{ background: '#FEF9C3', border: '1px solid #FDE047', color: '#713F12' }}
        >
          <span>
            Simulating {effectiveToday.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} as today
            {overrunDays > 0 && ` · booking overrun by ${overrunDays} day${overrunDays !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={() => { onSimDateChange?.(null); setShowSimPicker(false); }}
            className="flex-shrink-0 text-xs underline hover:no-underline"
          >
            Reset
          </button>
        </div>
      )}

      {/* ── Progress summary ── */}
      <div className="bg-[#FBF9F4] border border-[#EFEAE0] rounded-xl px-4 py-3 mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-extrabold text-[#2A2722] tracking-tight">Day {servedDays}</span>
            {overrunDays > 0 ? (
              <span className="text-sm text-[#C2483C] font-semibold">
                {plannedDays} planned · +{overrunDays} overrun
              </span>
            ) : (
              <span className="text-sm text-[#6F6A60]">of {plannedDays}</span>
            )}
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              { count: paidDays,      color: '#2F8A5B', label: 'paid' },
              { count: overdueCount,  color: '#C2483C', label: 'overdue' },
              { count: upcomingCount, color: '#D5CFC4', label: 'upcoming' },
            ].map(({ count, color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs font-semibold text-[#5A554B]">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                {count} {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: '#EAE5DB' }}>
          {paidDays > 0      && <div style={{ width: `${(paidDays / displayDays) * 100}%`,      background: '#2F8A5B', transition: 'width .3s ease' }} />}
          {overdueCount > 0  && <div style={{ width: `${(overdueCount / displayDays) * 100}%`,  background: '#C2483C', transition: 'width .3s ease' }} />}
          {upcomingCount > 0 && <div style={{ width: `${(upcomingCount / displayDays) * 100}%`, background: '#D5CFC4', transition: 'width .3s ease' }} />}
        </div>
      </div>

      {/* ── Week rows ── */}
      <div className="flex flex-col gap-3">
        {weeks.map((week) => (
          <div key={week.label} className="flex items-stretch gap-4">
            <div className="w-20 sm:w-24 flex-shrink-0 pt-1.5">
              <div className="text-sm font-bold text-[#3A362F]">{week.label}</div>
              <div className="text-xs text-[#A39D91] mt-0.5 hidden sm:block">{week.range}</div>
            </div>
            <div className="flex-1 grid grid-cols-7 gap-1.5 sm:gap-2" style={{ overflow: 'visible' }}>
              {week.days.map((cell) => {
                if (!cell.filled) {
                  return (
                    <div
                      key={`e-${cell.dayNum}`}
                      style={{ aspectRatio: '1/1', border: '1px dashed #EAE5DB', borderRadius: 12 }}
                    />
                  );
                }

                const isHovered = hoveredDay === cell.dayNum;
                const nurse = cell.nurse;
                const pill  = PILL[cell.status];
                const isClickable = Boolean(onDayClick) && cell.delivered;

                // Overrun cells get a dashed red border to distinguish them from planned days
                const cellBorder = cell.isToday
                  ? '1.5px solid #137A6B'
                  : cell.isOverrun
                    ? '1.5px dashed #E8A09A'
                    : cell.delivered && nurse
                      ? `1px solid ${nurse.color.border}`
                      : '1px dashed #DBD5CA';

                return (
                  <div
                    key={cell.dayNum}
                    className={`relative flex flex-col justify-between rounded-xl p-1.5 sm:p-2 select-none ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                      aspectRatio: '1/1',
                      background: cell.delivered && nurse ? nurse.color.tint : '#FCFBF8',
                      border: cellBorder,
                      boxShadow: cell.isToday
                        ? '0 0 0 3px rgba(19,122,107,.13)'
                        : isHovered
                          ? '0 12px 26px rgba(40,33,22,.18)'
                          : 'none',
                      transform: isHovered ? 'translateY(-3px)' : 'none',
                      transition: 'transform .15s ease, box-shadow .15s ease',
                      zIndex: isHovered ? 30 : 'auto',
                    }}
                    onMouseEnter={() => setHoveredDay(cell.dayNum)}
                    onMouseLeave={() => setHoveredDay(null)}
                    onClick={isClickable ? () => onDayClick(cell.dateISO, cell.dayNum) : undefined}
                  >
                    {/* Day number + status icons + nurse dot */}
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[11px] font-bold leading-none"
                        style={{
                          fontFamily: 'monospace',
                          color: cell.isToday ? '#0C5C50' : cell.delivered ? '#5A554B' : '#B4AEA3',
                        }}
                      >
                        {cell.dayNum}
                      </span>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {cell.salaryMeta && (
                          <Wallet style={{ width: 8, height: 8, color: META_COLOR[cell.salaryMeta.status] }} />
                        )}
                        {cell.invoiceMeta && (
                          <Receipt style={{ width: 8, height: 8, color: META_COLOR[cell.invoiceMeta.status] }} />
                        )}
                        {nurse && (
                          <span
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                            style={{ background: nurse.color.solid, opacity: cell.delivered ? 1 : 0.4 }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Date label + payment bar */}
                    <div>
                      <div
                        className="text-[9px] sm:text-[10px] leading-tight truncate"
                        style={{
                          fontWeight: cell.isToday ? 700 : 500,
                          color: cell.isToday ? '#137A6B' : cell.delivered ? '#8B857A' : '#B4AEA3',
                        }}
                      >
                        {cell.dateLabel}
                      </div>
                      <div
                        className="rounded-full w-full mt-1"
                        style={{
                          height: 4,
                          background: BAR_COLOR[cell.status],
                          opacity: cell.status === 'upcoming' ? 0.7 : 1,
                        }}
                      />
                    </div>

                    {/* Hover tooltip */}
                    {isHovered && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          bottom: 'calc(100% + 10px)',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 188,
                          background: '#23211C',
                          borderRadius: 12,
                          padding: '12px 13px',
                          boxShadow: '0 18px 38px rgba(28,23,15,.36)',
                          border: '1px solid rgba(255,255,255,.08)',
                          zIndex: 50,
                        }}
                      >
                        <div className="text-xs font-bold text-white">{cell.tipDate}</div>
                        {cell.isOverrun && (
                          <div
                            className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-1"
                            style={{ background: 'rgba(194,72,60,.3)', color: '#E8A09A' }}
                          >
                            Beyond booking end
                          </div>
                        )}
                        {nurse && (
                          <>
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: nurse.color.solid }} />
                              <span className="text-xs font-semibold text-[#F2EFE8] truncate">{nurse.name}</span>
                            </div>
                            {nurse.designation && (
                              <div className="text-[11px] text-[#A8A299] ml-3.5">{nurse.designation}</div>
                            )}
                          </>
                        )}
                        <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#A8A299]">Billed</span>
                          <span className="text-xs font-bold text-white">
                            Rs {Number(dailyRate || 0).toLocaleString('en-US')}
                          </span>
                        </div>
                        <div className="mt-2">
                          <span
                            className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: pill.bg, color: pill.color }}
                          >
                            {pill.label}
                          </span>
                        </div>
                        {(cell.salaryMeta || cell.invoiceMeta) && (
                          <>
                            <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                            {cell.salaryMeta && (
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-[#A8A299] flex items-center gap-1">
                                    <Wallet style={{ width: 10, height: 10 }} /> Salary
                                  </span>
                                  <span className="text-[11px] font-bold" style={{ color: META_COLOR[cell.salaryMeta.status] }}>
                                    {metaLabel(cell.salaryMeta, 'Paid')}
                                  </span>
                                </div>
                                {cell.salaryMeta.decidedBy && (
                                  <div className="text-[10px] text-[#7E786D] ml-4">by {cell.salaryMeta.decidedBy}</div>
                                )}
                              </div>
                            )}
                            {cell.invoiceMeta && (
                              <div className="mt-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-[#A8A299] flex items-center gap-1">
                                    <Receipt style={{ width: 10, height: 10 }} /> Invoice
                                  </span>
                                  <span className="text-[11px] font-bold" style={{ color: META_COLOR[cell.invoiceMeta.status] }}>
                                    {metaLabel(cell.invoiceMeta, 'Charged')}
                                  </span>
                                </div>
                                {cell.invoiceMeta.decidedBy && (
                                  <div className="text-[10px] text-[#7E786D] ml-4">by {cell.invoiceMeta.decidedBy}</div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {isClickable && (
                          <div className="text-[10px] text-[#A8A299] mt-2">Click to log attendance / invoicing</div>
                        )}
                        {/* Caret */}
                        <div
                          className="absolute"
                          style={{
                            top: '100%', left: '50%', transform: 'translateX(-50%)',
                            width: 0, height: 0,
                            borderLeft: '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop: '7px solid #23211C',
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 flex-wrap mt-5 pt-4 border-t border-[#EFEAE0]">
        {legendNurses.length > 0 && (
          <>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A39D91]">Nurse on duty</span>
            {legendNurses.map((n) => (
              <div key={n.name} className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: n.color.solid }} />
                {n.name}
              </div>
            ))}
            <div className="w-px h-4 inline-block flex-shrink-0" style={{ background: '#E7E1D6' }} />
          </>
        )}
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#2F8A5B' }} />Paid
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#C2483C' }} />Overdue
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: '#D5CFC4' }} />Upcoming
        </div>
        {(manualSalaryDay || manualInvoiceDay) && (
          <>
            <div className="w-px h-4 inline-block flex-shrink-0" style={{ background: '#E7E1D6' }} />
            <div className="flex items-center gap-3 text-xs text-[#8A8478]">
              <span className="flex items-center gap-1"><Wallet style={{ width: 11, height: 11 }} /> Salary</span>
              <span className="flex items-center gap-1"><Receipt style={{ width: 11, height: 11 }} /> Invoice</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: META_COLOR.PENDING }} /> Action needed
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CareTimeline;
