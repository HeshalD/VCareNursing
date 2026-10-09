import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import {
  WEEK_ORDER, DAY_SHORT, WEEKDAYS, WEEKENDS, isRepeatDay, describeRepeatDays,
} from '../../../utils/repeatDays';

const toISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Asks whether a booking/shift runs every day or only on chosen weekdays, with a
 * month calendar previewing which dates that produces from the start date onward.
 * Clicking a date (or a weekday header) toggles that whole weekday.
 *
 * @param value      null (every day) or an array of weekday numbers
 * @param onChange   receives null or a weekday array
 * @param startDate  YYYY-MM-DD — dates before it are shown as "before start"
 * @param others     optional [{ label, days }] — other shifts, shown as small markers
 *                   on the dates they run so the admin sees overall coverage
 */
const RepeatDaysPicker = ({ value, onChange, startDate, others = [] }) => {
  const isEveryDay = !Array.isArray(value);
  const selected = isEveryDay ? WEEK_ORDER : value;

  const start = useMemo(() => {
    const d = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    return isNaN(d) ? new Date() : d;
  }, [startDate]);

  const [viewMonth, setViewMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  // Jump the calendar to the start date's month when the start date changes.
  const [lastStartKey, setLastStartKey] = useState(toISO(start));
  if (toISO(start) !== lastStartKey) {
    setLastStartKey(toISO(start));
    setViewMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  }

  const toggleDay = (dow) => {
    if (isEveryDay) {
      onChange(WEEK_ORDER.filter((d) => d !== dow));
      return;
    }
    if (value.includes(dow)) {
      if (value.length === 1) return; // at least one day must stay selected
      onChange(value.filter((d) => d !== dow));
    } else {
      onChange([...value, dow]);
    }
  };

  // Monday-first grid covering the whole viewed month.
  const cells = useMemo(() => {
    const first = new Date(viewMonth);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - offset);
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  const startISO = toISO(start);
  const todayISO = toISO(new Date());

  // Service days in the first four weeks from the start date — a quick sanity number.
  const firstFourWeeks = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 28; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (selected.includes(d.getDay())) n++;
    }
    return n;
  }, [start, selected]);

  const shiftMonth = (delta) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="space-y-3">
      {/* Every day vs specific days */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ModeOption
          checked={isEveryDay}
          onSelect={() => onChange(null)}
          title="7 days a week"
          hint="Service runs every day from the start date."
        />
        <ModeOption
          checked={!isEveryDay}
          onSelect={() => { if (isEveryDay) onChange([...WEEKDAYS]); }}
          title="Specific days of the week"
          hint="Repeats weekly on the days you pick."
        />
      </div>

      {!isEveryDay && (
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEK_ORDER.map((dow) => {
            const on = value.includes(dow);
            return (
              <button
                key={dow}
                type="button"
                onClick={() => toggleDay(dow)}
                aria-pressed={on}
                className={`w-12 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                    : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {DAY_SHORT[dow]}
              </button>
            );
          })}
          <span className="mx-1 h-5 w-px bg-gray-200" />
          <button type="button" onClick={() => onChange([...WEEKDAYS])} className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
            Weekdays
          </button>
          <button type="button" onClick={() => onChange([...WEEKENDS])} className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
            Weekends
          </button>
        </div>
      )}

      {/* Calendar preview */}
      <div className="rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-gray-800">
            {viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-100 p-px">
          {WEEK_ORDER.map((dow) => (
            <button
              key={dow}
              type="button"
              onClick={() => toggleDay(dow)}
              title={`Toggle every ${DAY_SHORT[dow]}`}
              className={`bg-gray-50 py-1.5 text-center text-[11px] font-medium uppercase tracking-wider hover:bg-gray-100 ${
                selected.includes(dow) ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              {DAY_SHORT[dow]}
            </button>
          ))}

          {cells.map((d) => {
            const iso = toISO(d);
            const inMonth = d.getMonth() === viewMonth.getMonth();
            const beforeStart = iso < startISO;
            const on = selected.includes(d.getDay());
            const isStart = iso === startISO;
            const othersHere = beforeStart ? [] : others.filter((o) => isRepeatDay(o.days, d));

            let tone = 'bg-white text-gray-300';
            if (inMonth && !beforeStart && on) tone = 'bg-blue-50 text-blue-700 hover:bg-blue-100';
            else if (inMonth && !beforeStart) tone = 'bg-white text-gray-400 hover:bg-gray-50';

            return (
              <button
                key={iso}
                type="button"
                onClick={() => toggleDay(d.getDay())}
                title={
                  beforeStart
                    ? 'Before the service start date'
                    : `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} — ${on ? 'service day' : 'day off'}. Click to toggle every ${DAY_SHORT[d.getDay()]}.`
                }
                className={`relative flex h-12 flex-col items-center justify-start pt-1 text-xs transition-colors ${tone}`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    isStart ? 'bg-blue-600 font-semibold text-white' : iso === todayISO ? 'ring-1 ring-gray-300' : ''
                  } ${inMonth && !beforeStart && !on ? 'line-through' : ''}`}
                >
                  {d.getDate()}
                </span>
                {inMonth && othersHere.length > 0 && (
                  <span className="mt-0.5 flex gap-0.5">
                    {othersHere.map((o) => (
                      <span key={o.label} className="h-1.5 w-1.5 rounded-full bg-gray-400" title={o.label} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5 text-gray-400" />
            {describeRepeatDays(value)}
          </span>
          <span>{firstFourWeeks} service day{firstFourWeeks !== 1 ? 's' : ''} in the first 4 weeks</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-400">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-100" /> Service day</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Start date</span>
          {others.length > 0 && (
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Other shifts running</span>
          )}
          <span>Click a date or weekday to toggle it</span>
        </div>
      </div>
    </div>
  );
};

const ModeOption = ({ checked, onSelect, title, hint }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={checked}
    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors ${
      checked ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-100' : 'border-gray-200 bg-white hover:bg-gray-50'
    }`}
  >
    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${checked ? 'border-blue-600' : 'border-gray-300'}`}>
      {checked && <span className="h-2 w-2 rounded-full bg-blue-600" />}
    </span>
    <span>
      <span className="block text-sm font-medium text-gray-800">{title}</span>
      <span className="block text-xs text-gray-400">{hint}</span>
    </span>
  </button>
);

export default RepeatDaysPicker;
