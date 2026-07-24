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
  leave:     { bar: '#8C5AA6', label: 'On leave',     pillBg: 'rgba(140,90,166,.24)', pillColor: '#D2B4E2' },
  moved:     { bar: '#B4AEA3', label: 'Moved',        pillBg: 'rgba(180,174,163,.24)',pillColor: '#CFC9BE' },
  makeup:    { bar: '#3F77B5', label: 'Makeup shift',  pillBg: 'rgba(63,119,181,.24)', pillColor: '#A9C8E6' },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const fmtFull  = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const toLocalISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const moneyFmt = (n) => `Rs ${Math.round(Number(n || 0)).toLocaleString('en-US')}`;

// Props:
//   assignments       — rows from GET /staff/:id/attendance-calendar (booking_staff_assignments + booking/client/patient joins,
//                        including shift_slot_id/shift_number/shift_label/reschedule_id for SHIFT_BASED bookings)
//   attendanceRecords — rows from the same endpoint (staff_daily_attendance, including shift_slot_id/reschedule_id)
//   reschedules       — rows from the same endpoint (shift_reschedules touching this staff's assignments) — moved-away
//                        origins render as "Moved"; makeup occurrences render on their new date
//   pendingResumptions — rows from the same endpoint: bookings currently PAUSED with a fixed target resume date,
//                        where this staff member's assignment closed exactly on the pause date. Mirrors what
//                        CareTimeline shows on the booking side of a pending resume — days between the pause and
//                        the resume date read as available/off, and from the resume date onward this staff reads
//                        as assigned back to that booking (open-ended unless scheduled_end_date caps it), even
//                        though the real booking_staff_assignments row doesn't exist yet.
const StaffCareTimeline = ({ assignments: rawAssignments = [], attendanceRecords = [], reschedules = [], leaveDays = [], pendingResumptions = [], interactive = true }) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [hoveredKey, setHoveredKey] = useState(null);
  const navigate = useNavigate();

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const visibleMonth = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  // Synthesize a placeholder "assignment" for each pending resumption so the rest of
  // this component (colour pool, day lookup, tooltip) treats it exactly like a real
  // future-scheduled one — no separate rendering path needed.
  const assignments = useMemo(() => {
    if (!pendingResumptions.length) return rawAssignments;
    const synthetic = pendingResumptions.map((pr) => ({
      assignment_id: `pending-resume-${pr.booking_id}`,
      booking_id: pr.booking_id,
      service_start_date: pr.resume_date,
      service_end_date: pr.scheduled_end_date || null,
      daily_rate: pr.daily_rate,
      assignment_status: 'ACTIVE',
      shift_slot_id: null,
      reschedule_id: null,
      shift_number: null,
      shift_label: null,
      shift_start_time: null,
      client_name: pr.client_name,
      patient_name: pr.patient_name,
      isProjectedResume: true,
    }));
    return [...rawAssignments, ...synthetic];
  }, [rawAssignments, pendingResumptions]);

  // ── Booking colour pool — assigned in service_start_date order ────────────
  const bookingColorMap = useMemo(() => {
    const map = new Map();
    const sorted = [...assignments]
      .filter((a) => a.assignment_status !== 'CANCELLED')
      .sort((a, b) => new Date(a.service_start_date) - new Date(b.service_start_date));
    let idx = 0;
    sorted.forEach((a) => {
      if (a.booking_id && !map.has(a.booking_id)) { map.set(a.booking_id, BOOKING_COLORS[idx % BOOKING_COLORS.length]); idx++; }
    });
    return map;
  }, [assignments]);

  // ── Attendance lookup: (assignment_id, shift_slot_id|'', dateISO) -> record ─
  const attendanceByKey = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => {
      const dateISO = r.service_date?.slice(0, 10);
      if (!dateISO) return;
      map.set(`${r.assignment_id}__${r.shift_slot_id || ''}__${dateISO}`, r);
    });
    return map;
  }, [attendanceRecords]);

  const attendanceByReschedule = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => { if (r.reschedule_id) map.set(r.reschedule_id, r); });
    return map;
  }, [attendanceRecords]);

  // ── Reschedules touching this staff — moved origins + makeup occurrences ──
  const movedOrigins = useMemo(() => {
    const set = new Set();
    reschedules.forEach((r) => set.add(`${r.shift_slot_id}__${r.original_date?.slice(0, 10)}`));
    return set;
  }, [reschedules]);

  const assignmentById = useMemo(() => new Map(assignments.map((a) => [a.assignment_id, a])), [assignments]);

  // ── Approved leave lookup: set of ISO date strings the staff is off ───────
  const leaveSet = useMemo(() => {
    const set = new Set();
    (leaveDays || []).forEach((lv) => {
      if (!lv.start_date || !lv.end_date) return;
      const start = new Date(lv.start_date); start.setHours(0, 0, 0, 0);
      const end = new Date(lv.end_date); end.setHours(0, 0, 0, 0);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(toLocalISO(d));
      }
    });
    return set;
  }, [leaveDays]);

  // Among assignments sharing the same shift_slot_id (or, for non-shift bookings,
  // no slot at all) covering this date, pick the latest-starting one per slot —
  // mirrors CareTimeline's getNurseForDay so swaps/back-to-back bookings resolve
  // correctly. Returns one entry per distinct shift slot (or one overall for
  // non-shift bookings), since a staff member can work several shifts in one day.
  const getShiftsForDate = (date) => {
    const dateISO = toLocalISO(date);
    const bestBySlot = new Map(); // key: shift_slot_id || booking_id (non-shift) -> { assignment, start }
    for (const a of assignments) {
      if (!a.service_start_date) continue;
      if (a.assignment_status === 'CANCELLED') continue;
      const start = new Date(a.service_start_date); start.setHours(0, 0, 0, 0);
      const endSource = a.service_end_date || a.pending_end_date;
      const end = endSource ? new Date(endSource) : null;
      if (end) end.setHours(23, 59, 59, 999);
      if (date < start || (end && date > end)) continue;

      const key = a.shift_slot_id || `booking:${a.booking_id}`;
      const existing = bestBySlot.get(key);
      if (!existing || start > existing.start) bestBySlot.set(key, { assignment: a, start });
    }

    const shifts = [];
    for (const [key, { assignment }] of bestBySlot.entries()) {
      if (assignment.shift_slot_id && movedOrigins.has(`${assignment.shift_slot_id}__${dateISO}`)) {
        shifts.push({ kind: 'MOVED', assignment, shiftSlotId: assignment.shift_slot_id, key: `moved-${key}` });
        continue;
      }
      shifts.push({ kind: 'NATURAL', assignment, shiftSlotId: assignment.shift_slot_id || null, key });
    }

    // Makeup occurrences landing on this date, where the makeup assignment belongs to this staff
    reschedules.forEach((r) => {
      if (r.new_date?.slice(0, 10) !== dateISO) return;
      const makeupAssignment = assignmentById.get(r.assignment_id);
      if (!makeupAssignment) return;
      shifts.push({ kind: 'MAKEUP', assignment: makeupAssignment, shiftSlotId: r.shift_slot_id, rescheduleId: r.reschedule_id, key: `makeup-${r.reschedule_id}` });
    });

    return shifts;
  };

  const buildDay = (date) => {
    const dateISO = toLocalISO(date);
    const isToday = date.getTime() === today.getTime();
    const isFuture = date.getTime() > today.getTime();

    // Approved leave overrides everything — the staff is off this day.
    if (leaveSet.has(dateISO)) {
      return { date, dateISO, isToday, isWork: false, isLeave: true, status: 'leave' };
    }

    const rawShifts = getShiftsForDate(date);
    if (rawShifts.length === 0) {
      return { date, dateISO, isToday, isWork: false, status: 'off' };
    }

    const shifts = rawShifts.map((s) => {
      const { assignment, kind, shiftSlotId, rescheduleId } = s;
      const color = bookingColorMap.get(assignment.booking_id) || BOOKING_COLORS[0];

      if (kind === 'MOVED') {
        return {
          key: s.key, kind, assignment, color, status: 'moved',
          clientShort: (assignment.client_name || '').split(' ').slice(-1)[0] || assignment.client_name,
          shiftLabel: assignment.shift_label || (assignment.shift_number ? `Shift ${assignment.shift_number}` : null),
        };
      }

      const record = rescheduleId
        ? attendanceByReschedule.get(rescheduleId)
        : attendanceByKey.get(`${assignment.assignment_id}__${shiftSlotId || ''}__${dateISO}`);

      let status;
      if (kind === 'MAKEUP' && !record) status = 'makeup';
      else if (isFuture) status = 'scheduled';
      else if (record?.salary_status === 'PAID') status = 'paid';
      else if (record?.salary_status === 'SKIPPED') status = 'skipped';
      else status = 'pending';

      return {
        key: s.key, kind, assignment, record, color, status,
        clientShort: (assignment.client_name || '').split(' ').slice(-1)[0] || assignment.client_name,
        shiftLabel: assignment.shift_label || (assignment.shift_number ? `Shift ${assignment.shift_number}` : null),
      };
    });

    shifts.sort((a, b) => (a.assignment.shift_number || 0) - (b.assignment.shift_number || 0));

    return { date, dateISO, isToday, isWork: true, shifts, color: shifts[0].color };
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
  }, [visibleMonth, assignments, attendanceByKey, attendanceByReschedule, bookingColorMap, leaveSet, movedOrigins, reschedules, today]);

  const monthAgg = useMemo(() => {
    let paid = 0, pending = 0, skipped = 0, scheduled = 0, earned = 0, potential = 0;
    monthGrid.forEach((week) => week.days.forEach((c) => {
      if (c.blank || !c.isWork) return;
      (c.shifts || []).forEach((s) => {
        if (s.status === 'paid') { paid++; earned += Number(s.record?.salary_amount || s.assignment.daily_rate || 0); }
        else if (s.status === 'pending' || s.status === 'makeup') pending++;
        else if (s.status === 'skipped') skipped++;
        else if (s.status === 'scheduled') { scheduled++; potential += Number(s.assignment.daily_rate || 0); }
      });
    }));
    return { paid, pending, skipped, scheduled, earned, potential, worked: paid + pending + skipped };
  }, [monthGrid]);

  const legend = useMemo(() => {
    const seen = new Set();
    const result = [];
    monthGrid.forEach((week) => week.days.forEach((c) => {
      if (c.blank || !c.isWork) return;
      (c.shifts || []).forEach((s) => {
        const id = s.assignment.booking_id;
        if (seen.has(id)) return;
        seen.add(id);
        result.push({ id, name: s.assignment.client_name || 'Client', color: s.color });
      });
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
            <span className="text-xs font-semibold text-[#9A9488] hidden sm:inline">Hover a day for the shifts worked</span>
          </div>
          <p className="text-sm text-[#6F6A60] mt-1">Each block is one calendar day; multiple shifts on the same day stack as separate bars. Colour shows the booking.</p>
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
              {monthAgg.worked} shift{monthAgg.worked !== 1 ? 's' : ''} worked · {moneyFmt(monthAgg.earned)} earned
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
                const shifts = cell.shifts || [];
                const isClickable = interactive && cell.isWork && shifts.some((s) => s.assignment?.booking_id && s.kind !== 'MOVED');

                return (
                  <div
                    key={cell.key}
                    className={`relative flex flex-col justify-between rounded-xl p-1.5 sm:p-2 select-none ${isClickable ? 'cursor-pointer' : 'cursor-default'}`}
                    style={{
                      aspectRatio: '1/1',
                      background: cell.isLeave ? '#F3ECF7' : cell.isWork ? cell.color.tint : '#FCFBF8',
                      border: cell.isToday ? '1.5px solid #137A6B' : cell.isLeave ? '1px solid #DCC8E3' : cell.isWork ? `1px solid ${cell.color.border}` : '1px dashed #DBD5CA',
                      boxShadow: cell.isToday ? '0 0 0 3px rgba(19,122,107,.13)' : isHovered ? '0 12px 26px rgba(40,33,22,.18)' : 'none',
                      transform: isHovered ? 'translateY(-3px)' : 'none',
                      transition: 'transform .15s ease, box-shadow .15s ease',
                      zIndex: isHovered ? 30 : 'auto',
                    }}
                    onMouseEnter={() => setHoveredKey(cell.dateISO)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={isClickable ? () => {
                      const target = shifts.find((s) => s.kind !== 'MOVED');
                      if (target) navigate(`/admin/bookings/${target.assignment.booking_id}/detail`);
                    } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="text-[11px] font-bold leading-none"
                        style={{ fontFamily: 'monospace', color: cell.isToday ? '#0C5C50' : cell.isWork ? '#5A554B' : '#B4AEA3' }}
                      >
                        {cell.date.getDate()}
                      </span>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {shifts.map((s) => (
                          <span
                            key={s.key}
                            className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                            style={{ background: s.color.solid, opacity: s.kind === 'MOVED' ? 0.35 : 1 }}
                          />
                        ))}
                      </div>
                    </div>

                    {cell.isWork ? (
                      <div>
                        <div className="text-[9px] sm:text-[10px] leading-tight truncate font-medium" style={{ color: cell.isToday ? '#137A6B' : '#8B857A' }}>
                          {shifts.length > 1 ? `${shifts.length} shifts` : shifts[0].clientShort}
                        </div>
                        <div className="flex flex-col gap-[2px] mt-1">
                          {shifts.map((s) => (
                            <div
                              key={s.key}
                              className="rounded-full w-full"
                              style={{ height: 3, background: STATUS_META[s.status]?.bar || '#D5CFC4', opacity: s.status === 'scheduled' || s.kind === 'MOVED' ? 0.55 : 1 }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : cell.isLeave ? (
                      <div className="text-[10px] font-semibold mt-auto" style={{ color: '#8C5AA6' }}>Leave</div>
                    ) : (
                      <div className="text-[10px] font-semibold text-[#BCB6AB] mt-auto">Off</div>
                    )}

                    {/* Hover tooltip */}
                    {isHovered && (
                      <div
                        className="absolute pointer-events-none"
                        style={{
                          bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', width: 220,
                          background: '#23211C', borderRadius: 12, padding: '12px 13px',
                          boxShadow: '0 18px 38px rgba(28,23,15,.36)', border: '1px solid rgba(255,255,255,.08)', zIndex: 50,
                        }}
                      >
                        <div className="text-xs font-bold text-white">{fmtFull(cell.date)}{cell.isToday ? ' · Today' : ''}</div>

                        {cell.isWork ? (
                          shifts.map((s, i) => {
                            const meta = STATUS_META[s.status] || STATUS_META.pending;
                            return (
                              <div key={s.key} style={{ marginTop: 10 }}>
                                {i > 0 && <div className="h-px mb-2" style={{ background: 'rgba(255,255,255,.12)' }} />}
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color.solid }} />
                                  <span className="text-xs font-semibold text-[#F2EFE8] truncate">{s.assignment.client_name || 'Client'}</span>
                                  {s.shiftLabel && <span className="text-[10px] text-[#A8A299]">· {s.shiftLabel}</span>}
                                </div>
                                {s.assignment.patient_name && (
                                  <div className="text-[11px] text-[#A8A299] ml-3.5">Patient: {s.assignment.patient_name}</div>
                                )}
                                {s.kind === 'MOVED' ? (
                                  <div className="mt-1.5">
                                    <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.pillBg, color: meta.pillColor }}>
                                      Moved to another date
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between mt-1.5">
                                      <span className="text-[11px] text-[#A8A299]">{s.status === 'scheduled' ? 'Will earn' : 'Rate'}</span>
                                      <span className="text-xs font-bold text-white">
                                        {moneyFmt(s.record?.salary_amount ?? s.assignment.daily_rate)}
                                      </span>
                                    </div>
                                    {s.record?.hours_served != null && (
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-[11px] text-[#A8A299]">Hours served</span>
                                        <span className="text-xs font-bold text-white">{Number(s.record.hours_served)}h</span>
                                      </div>
                                    )}
                                    <div className="mt-1.5 flex items-center justify-between">
                                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: meta.pillBg, color: meta.pillColor }}>
                                        {s.assignment.isProjectedResume ? 'Pending resume' : s.kind === 'MAKEUP' ? 'Makeup shift' : meta.label}
                                      </span>
                                    </div>
                                    {s.record?.decided_by_name && (
                                      <div className="text-[10px] text-[#8E887E] mt-1">by {s.record.decided_by_name}</div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })
                        ) : cell.isLeave ? (
                          <div className="mt-2">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: STATUS_META.leave.pillBg, color: STATUS_META.leave.pillColor }}>
                              On approved leave
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-[#A8A299] mt-2">No assignment this day</div>
                        )}

                        {isClickable && (
                          <div className="flex items-center gap-1 text-[10px] text-[#A8A299] mt-2">
                            <ArrowUpRight style={{ width: 10, height: 10 }} /> Click to open booking
                          </div>
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
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-4 h-1.5 rounded-full inline-block" style={{ background: STATUS_META.moved.bar }} />Moved
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#4A463E] font-semibold">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: STATUS_META.leave.bar }} />On leave
        </div>
      </div>
    </div>
  );
};

export default StaffCareTimeline;
