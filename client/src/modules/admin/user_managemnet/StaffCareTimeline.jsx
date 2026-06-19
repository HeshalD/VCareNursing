import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

const BOOKING_COLORS = [
  { tint: '#FAEEE7', solid: '#C2603F', border: '#E6C8B9' },
  { tint: '#F2EAF5', solid: '#8C5AA6', border: '#DCC8E3' },
  { tint: '#E8F1F9', solid: '#3F77B5', border: '#C3D8EC' },
  { tint: '#E4F1ED', solid: '#137A6B', border: '#A8D4CC' },
  { tint: '#FBF3E3', solid: '#B07D2A', border: '#E0CDA0' },
];

const STATUS_META = {
  paid:      { bar: '#2F8A5B', label: 'Paid',         pillBg: 'rgba(47,138,91,.22)',  pillColor: '#84D6A4' },
  pending:   { bar: '#C98A2E', label: 'Action needed',pillBg: 'rgba(201,138,46,.24)', pillColor: '#E9C583' },
  skipped:   { bar: '#9A9488', label: 'Skipped',      pillBg: 'rgba(154,148,136,.24)',pillColor: '#C4BFB5' },
  scheduled: { bar: '#D5CFC4', label: 'Scheduled',    pillBg: 'rgba(255,255,255,.12)',pillColor: '#CFC9BE' },
  off:       { bar: 'transparent', label: 'Off',      pillBg: 'rgba(255,255,255,.10)', pillColor: '#BCB6AB' },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtFull  = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const moneyFmt = (n) => `Rs ${Math.round(Number(n || 0)).toLocaleString('en-US')}`;

// Props:
//   assignments       — rows from GET /staff/:id/attendance-calendar (booking_staff_assignments + booking/client/patient joins)
//   attendanceRecords — rows from the same endpoint (staff_daily_attendance)
const StaffCareTimeline = ({ assignments = [], attendanceRecords = [] }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [hoveredKey, setHoveredKey] = useState(null);
  const navigate = useNavigate();

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const visibleMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  // ── Booking colour pool — assigned in service_start_date order ────────────
  const bookingColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...assignments].sort((a, b) => new Date(a.service_start_date) - new Date(b.service_start_date));
    let idx = 0;
    sorted.forEach((a) => {
      if (a.booking_id && !map.has(a.booking_id)) { map.set(a.booking_id, BOOKING_COLORS[idx % BOOKING_COLORS.length]); idx++; }
    });
    return map;
  }, [assignments]);

  // ── Attendance lookup: (assignment_id, dateISO) -> record ────────────────
  const attendanceByKey = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => {
      const dateISO = r.service_date?.slice(0, 10);
      if (!dateISO) return;
      map.set(`${r.assignment_id}__${dateISO}`, r);
    });
    return map;
  }, [attendanceRecords]);

  // Among all assignments covering this date, pick the latest-starting one —
  // mirrors CareTimeline's getNurseForDay so swaps/back-to-back bookings resolve correctly.
  const getAssignmentForDate = (date) => {
    let best = null, bestStart = null;
    for (const a of assignments) {
      if (!a.service_start_date) continue;
      const start = new Date(a.service_start_date); start.setHours(0, 0, 0, 0);
      const end = a.service_end_date ? new Date(a.service_end_date) : null;
      if (end) end.setHours(23, 59, 59, 999);
      if (date >= start && (!end || date <= end)) {
        if (!bestStart || start > bestStart) { bestStart = start; best = a; }
      }
    }
    return best;
  };

  const buildDay = (date) => {
    const dateISO = toLocalISO(date);
    const assignment = getAssignmentForDate(date);
    const isToday = date.getTime() === today.getTime();
    const isFuture = date.getTime() > today.getTime();

    if (!assignment) {
      return { date, dateISO, isToday, isWork: false, status: 'off' };
    }

    const color = bookingColorMap.get(assignment.booking_id) || BOOKING_COLORS[0];
    const record = attendanceByKey.get(`${assignment.assignment_id}__${dateISO}`);

    let status;
    if (isFuture) status = 'scheduled';
    else if (record?.salary_status === 'PAID') status = 'paid';
    else if (record?.salary_status === 'SKIPPED') status = 'skipped';
    else status = 'pending'; // delivered day with no decision yet (or not logged at all)

    return {
      date, dateISO, isToday, isWork: true, status, assignment, record, color,
      clientShort: (assignment.client_name || '').split(' ').slice(-1)[0] || assignment.client_name,
    };
  };

  const monthGrid = useMemo(() => {
    const y = visibleMonth.getFullYear();
    const m = visibleMonth.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-start offset
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ blank: true, key: `lead-${i}` });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ blank: false, key: `d-${d}`, ...buildDay(new Date(y, m, d)) });
    while (cells.length % 7 !== 0) cells.push({ blank: true, key: `trail-${cells.length}` });

    const weeks = [];
    for (let w = 0; w < cells.length / 7; w++) {
      const slice = cells.slice(w * 7, w * 7 + 7);
      const real = slice.filter((c) => !c.blank);
      const range = real.length ? `${fmtShort(real[0].date)} – ${fmtShort(real[real.length - 1].date)}` : '';
      weeks.push({ label: `Week ${w + 1}`, range, days: slice });
    }
    return weeks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleMonth, assignments, attendanceByKey, bookingColorMap, today]);

  const monthAgg = useMemo(() => {
    let paid = 0, pending = 0, skipped = 0, scheduled = 0, earned = 0, potential = 0;
    monthGrid.forEach((week) => week.days.forEach((c) => {
      if (c.blank || !c.isWork) return;
      if (c.status === 'paid') { paid++; earned += Number(c.record?.salary_amount || c.assignment.daily_rate || 0); }
      else if (c.status === 'pending') pending++;
      else if (c.status === 'skipped') skipped++;
      else if (c.status === 'scheduled') { scheduled++; potential += Number(c.assignment.daily_rate || 0); }
    }));
    return { paid, pending, skipped, scheduled, earned, potential, worked: paid + pending + skipped };
  }, [monthGrid]);

  const legend = useMemo(() => {
    const seen = new Set();
    const result = [];
    monthGrid.forEach((week) => week.days.forEach((c) => {
      if (c.blank || !c.isWork) return;
      const id = c.assignment.booking_id;
      if (seen.has(id)) return;
      seen.add(id);
      result.push({ id, name: c.assignment.client_name || 'Client', color: c.color });
    }));
    return result;
  }, [monthGrid]);

  const monthAssigned = monthAgg.paid + monthAgg.pending + monthAgg.skipped + monthAgg.scheduled;
  const pct = (n) => (monthAssigned ? (n / monthAssigned) * 100 : 0);

  return (
    <div className="bg-white border border-[#ECE7DF] rounded-2xl p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#2A2722] tracking-tight">Work & pay calendar</h2>
            <span className="text-xs font-semibold text-[#9A9488] hidden sm:inline">Hover a day for the booking worked</span>
          </div>
          <p className="text-sm text-[#6F6A60] mt-1">Each block is one calendar day. Colour shows the booking; the bar below shows pay status.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              className="px-2.5 h-8 rounded-lg border text-xs font-semibold transition"
              style={{ background: '#FEF9C3', borderColor: '#FDE047', color: '#713F12' }}
            >
              Jump to today
            </button>
          )}
          <span className="text-xs font-semibold text-[#8A8478] min-w-[90px] text-right hidden sm:inline">
            {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setMonthOffset((o) => o - 1)}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >‹</button>
            <button
              onClick={() => setMonthOffset((o) => o + 1)}
              className="w-8 h-8 rounded-lg border border-[#E7E1D6] bg-white text-[#5A554B] hover:bg-slate-50 transition flex items-center justify-center text-lg leading-none"
            >›</button>
          </div>
        </div>
      </div>

      {/* ── Month summary ── */}
      <div className="bg-[#FBF9F4] border border-[#EFEAE0] rounded-xl px-4 py-3 mb-5">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-extrabold text-[#2A2722] tracking-tight">
              {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <span className="text-sm text-[#6F6A60]">
              {monthAgg.worked} days worked · {moneyFmt(monthAgg.earned)} earned
              {monthAgg.scheduled > 0 && ` · ${monthAgg.scheduled} scheduled (${moneyFmt(monthAgg.potential)} forecast)`}
            </span>
          </div>
          <div className="flex gap-4 flex-wrap">
            {[
              { count: monthAgg.paid, color: STATUS_META.paid.bar, label: 'paid' },
              { count: monthAgg.pending, color: STATUS_META.pending.bar, label: 'pending' },
              { count: monthAgg.skipped, color: STATUS_META.skipped.bar, label: 'skipped' },
              { count: monthAgg.scheduled, color: STATUS_META.scheduled.bar, label: 'scheduled' },
            ].map(({ count, color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs font-semibold text-[#5A554B]">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
                {count} {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: '#EAE5DB' }}>
          {monthAgg.paid > 0      && <div style={{ width: `${pct(monthAgg.paid)}%`,      background: STATUS_META.paid.bar }} />}
          {monthAgg.pending > 0   && <div style={{ width: `${pct(monthAgg.pending)}%`,   background: STATUS_META.pending.bar }} />}
          {monthAgg.skipped > 0   && <div style={{ width: `${pct(monthAgg.skipped)}%`,   background: STATUS_META.skipped.bar }} />}
          {monthAgg.scheduled > 0 && <div style={{ width: `${pct(monthAgg.scheduled)}%`, background: STATUS_META.scheduled.bar }} />}
        </div>
      </div>

      {/* ── Weekday header ── */}
      <div className="flex items-stretch gap-4 mb-2">
        <div className="w-20 sm:w-24 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-[11px] font-bold uppercase tracking-wider text-[#A39D91] text-center">{w}</div>
          ))}
        </div>
      </div>

      {/* ── Week rows ── */}
      <div className="flex flex-col gap-3">
        {monthGrid.map((week) => (
          <div key={week.label} className="flex items-stretch gap-4">
            <div className="w-20 sm:w-24 flex-shrink-0 pt-1.5">
              <div className="text-sm font-bold text-[#3A362F]">{week.label}</div>
              <div className="text-xs text-[#A39D91] mt-0.5 hidden sm:block">{week.range}</div>
            </div>
            <div className="flex-1 grid grid-cols-7 gap-1.5 sm:gap-2" style={{ overflow: 'visible' }}>
              {week.days.map((cell) => {
                if (cell.blank) {
                  return <div key={cell.key} style={{ aspectRatio: '1/1', border: '1px dashed #EAE5DB', borderRadius: 12 }} />;
                }

                const isHovered = hoveredKey === cell.dateISO;
                const meta = STATUS_META[cell.status];
                const isClickable = cell.isWork && Boolean(cell.assignment?.booking_id);

                return (
                  <div
                    key={cell.key}
                    className={`relative flex flex-col justify-between rounded-xl p-1.5 sm:p-2 select-none ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                      aspectRatio: '1/1',
                      background: cell.isWork ? cell.color.tint : '#FCFBF8',
                      border: cell.isToday ? '1.5px solid #137A6B' : cell.isWork ? `1px solid ${cell.color.border}` : '1px dashed #DBD5CA',
                      boxShadow: cell.isToday ? '0 0 0 3px rgba(19,122,107,.13)' : isHovered ? '0 12px 26px rgba(40,33,22,.18)' : 'none',
                      transform: isHovered ? 'translateY(-3px)' : 'none',
                      transition: 'transform .15s ease, box-shadow .15s ease',
                      zIndex: isHovered ? 30 : 'auto',
                    }}
                    onMouseEnter={() => setHoveredKey(cell.dateISO)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={isClickable ? () => navigate(`/admin/bookings/${cell.assignment.booking_id}/detail`) : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[11px] font-bold leading-none"
                        style={{ fontFamily: 'monospace', color: cell.isToday ? '#0C5C50' : cell.isWork ? '#5A554B' : '#B4AEA3' }}
                      >
                        {cell.date.getDate()}
                      </span>
                      {cell.isWork && (
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0" style={{ background: cell.color.solid }} />
                      )}
                    </div>

                    {cell.isWork ? (
                      <div>
                        <div className="text-[9px] sm:text-[10px] leading-tight truncate font-medium" style={{ color: cell.isToday ? '#137A6B' : '#8B857A' }}>
                          {cell.clientShort}
                        </div>
                        <div className="rounded-full w-full mt-1" style={{ height: 4, background: meta.bar, opacity: cell.status === 'scheduled' ? 0.75 : 1 }} />
                      </div>
                    ) : (
                      <div className="text-[10px] font-semibold text-[#BCB6AB] mt-auto">Off</div>
                    )}

                    {/* Hover tooltip */}
                    {isHovered && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 200,
                          background: '#23211C', borderRadius: 12, padding: '12px 13px',
                          boxShadow: '0 18px 38px rgba(28,23,15,.36)', border: '1px solid rgba(255,255,255,.08)', zIndex: 50,
                        }}
                      >
                        <div className="text-xs font-bold text-white">{fmtFull(cell.date)}{cell.isToday ? ' · Today' : ''}</div>

                        {cell.isWork ? (
                          <>
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cell.color.solid }} />
                              <span className="text-xs font-semibold text-[#F2EFE8] truncate">{cell.assignment.client_name || 'Client'}</span>
                            </div>
                            {cell.assignment.patient_name && (
                              <div className="text-[11px] text-[#A8A299] ml-3.5">Patient: {cell.assignment.patient_name}</div>
                            )}
                            <div className="text-[11px] text-[#A8A299] ml-3.5">{cell.assignment.service_type || cell.assignment.service_model || ''}</div>
                            {cell.assignment.booking_code && (
                              <div className="font-mono text-[10.5px] text-[#8E887E] ml-3.5 mt-0.5">{cell.assignment.booking_code}</div>
                            )}
                            <div className="h-px my-2" style={{ background: 'rgba(255,255,255,.12)' }} />
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-[#A8A299]">{cell.status === 'scheduled' ? 'Will earn' : 'Daily rate'}</span>
                              <span className="text-xs font-bold text-white">
                                {moneyFmt(cell.record?.salary_amount ?? cell.assignment.daily_rate)}
                              </span>
                            </div>
                            {cell.record?.hours_served != null && (
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[11px] text-[#A8A299]">Hours served</span>
                                <span className="text-xs font-bold text-white">{Number(cell.record.hours_served)}h</span>
                              </div>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.pillBg, color: meta.pillColor }}>
                                {meta.label}
                              </span>
                              {cell.record?.entry_mode === 'AUTO' && (
                                <span className="text-[10px] text-[#8E887E]">Auto</span>
                              )}
                            </div>
                            {cell.record?.decided_by_name && (
                              <div className="text-[10px] text-[#8E887E] mt-1.5">by {cell.record.decided_by_name}</div>
                            )}
                            {isClickable && (
                              <div className="flex items-center gap-1 text-[10px] text-[#A8A299] mt-2">
                                <ArrowUpRight style={{ width: 10, height: 10 }} /> Click to open booking
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-[#A8A299] mt-2">No assignment this day</div>
                        )}

                        <div className="absolute" style={{ top: '100%', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '7px solid #23211C' }} />
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
        {legend.length > 0 && (
          <>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#A39D91]">Worked this month</span>
            {legend.map((b) => (
              <div key={b.id} className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ background: b.color.solid }} />
                {b.name}
              </div>
            ))}
            <div className="w-px h-4 inline-block flex-shrink-0" style={{ background: '#E7E1D6' }} />
          </>
        )}
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: STATUS_META.paid.bar }} />Paid
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: STATUS_META.pending.bar }} />Action needed
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: STATUS_META.skipped.bar }} />Skipped
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: STATUS_META.scheduled.bar }} />Scheduled
        </div>
      </div>
    </div>
  );
};

export default StaffCareTimeline;
