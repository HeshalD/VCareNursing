import React from 'react';
import { AlertTriangle, CalendarClock, Loader2 } from 'lucide-react';

const fmt = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

// A commitment "conflicts" with referenceDate if that date falls inside the
// commitment's [start, end] window (open-ended if end is null — e.g. LIVE_IN/
// VISITING assignments usually have no fixed end date until terminated).
const conflictsOn = (entry, referenceDate) => {
  if (!referenceDate || !entry.service_start_date) return false;
  const ref = referenceDate.slice(0, 10);
  const start = entry.service_start_date.slice(0, 10);
  const end = entry.service_end_date ? entry.service_end_date.slice(0, 10) : null;
  return start <= ref && (!end || end >= ref);
};

/**
 * Shows a staff member's current + upcoming booking commitments so an admin can
 * spot scheduling conflicts before assigning/swapping them onto a new booking.
 *
 * Props:
 *   schedule      — array of rows from apiClient.getStaffSchedules() for this staff member
 *   loading       — bool, shows a small spinner while the batch fetch is in flight
 *   referenceDate — ISO date string; entries overlapping this date are flagged red
 *   compact       — smaller/denser rendering for use inside lists/table cells
 */
const StaffScheduleTimeline = ({ schedule = [], loading = false, referenceDate = null, compact = false }) => {
  if (loading) {
    return (
      <div className={`flex items-center gap-1.5 text-slate-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <Loader2 className={compact ? 'h-3 w-3 animate-spin' : 'h-3.5 w-3.5 animate-spin'} />
        Checking schedule…
      </div>
    );
  }

  if (!schedule || schedule.length === 0) {
    return (
      <div className={`flex items-center gap-1.5 text-emerald-600 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <CalendarClock className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        No other current or upcoming bookings
      </div>
    );
  }

  return (
    <div className={`space-y-${compact ? '1' : '1.5'}`}>
      {schedule.map((entry, i) => {
        const conflict = conflictsOn(entry, referenceDate);
        const start = fmt(entry.service_start_date);
        const end = fmt(entry.service_end_date);
        const shiftBit = entry.shift_label || (entry.shift_number ? `Shift ${entry.shift_number}` : null);
        return (
          <div
            key={entry.booking_id ? `${entry.booking_id}-${entry.shift_number || 0}` : i}
            className={`flex items-start gap-1.5 rounded-md px-2 py-1 ${
              conflict ? 'bg-rose-50 border border-rose-200' : compact ? '' : 'bg-slate-50 border border-slate-100'
            } ${compact ? 'text-[11px]' : 'text-xs'}`}
          >
            {conflict
              ? <AlertTriangle className={`mt-0.5 shrink-0 text-rose-500 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
              : <CalendarClock className={`mt-0.5 shrink-0 text-slate-400 ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />}
            <div className="min-w-0 flex-1">
              <div className={`truncate font-medium ${conflict ? 'text-rose-700' : 'text-slate-700'}`}>
                {entry.client_name || 'Client'}{entry.patient_name ? ` — ${entry.patient_name}` : ''}
              </div>
              <div className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                {start}{end ? ` → ${end}` : ' → ongoing'}
                {shiftBit ? ` · ${shiftBit}` : ''}
                {' · '}{entry.status === 'ACTIVE' ? 'Active now' : `Starts ${start}`}
                {entry.booking_code ? ` · ${entry.booking_code}` : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StaffScheduleTimeline;
