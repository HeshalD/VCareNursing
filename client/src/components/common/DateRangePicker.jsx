import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const startOfToday = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  // Jan 31 + 1 month should land on the last day of Feb, not spill into March
  if (t.getDate() !== d.getDate()) return new Date(d.getFullYear(), d.getMonth() + n + 1, 0);
  return t;
};
const fmt = (iso) => {
  const d = fromISO(iso);
  return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : '';
};

// Full class strings so Tailwind can see them; one set per booking-page accent
const THEMES = {
  amber: {
    soft: 'bg-amber-50', stripR: 'to-amber-50', solid: 'bg-amber-600 hover:bg-amber-700', hoverDay: 'hover:bg-amber-100',
    ring: 'ring-amber-400', focus: 'focus:ring-amber-500', icon: 'text-amber-600', label: 'text-amber-700',
    navHover: 'hover:bg-amber-50', chip: 'hover:bg-amber-100 hover:text-amber-800',
  },
  rose: {
    soft: 'bg-rose-50', stripR: 'to-rose-50', solid: 'bg-rose-600 hover:bg-rose-700', hoverDay: 'hover:bg-rose-100',
    ring: 'ring-rose-400', focus: 'focus:ring-rose-500', icon: 'text-rose-600', label: 'text-rose-700',
    navHover: 'hover:bg-rose-50', chip: 'hover:bg-rose-100 hover:text-rose-800',
  },
  emerald: {
    soft: 'bg-emerald-50', stripR: 'to-emerald-50', solid: 'bg-emerald-600 hover:bg-emerald-700', hoverDay: 'hover:bg-emerald-100',
    ring: 'ring-emerald-400', focus: 'focus:ring-emerald-500', icon: 'text-emerald-600', label: 'text-emerald-700',
    navHover: 'hover:bg-emerald-50', chip: 'hover:bg-emerald-100 hover:text-emerald-800',
  },
  violet: {
    soft: 'bg-violet-50', stripR: 'to-violet-50', solid: 'bg-violet-600 hover:bg-violet-700', hoverDay: 'hover:bg-violet-100',
    ring: 'ring-violet-400', focus: 'focus:ring-violet-500', icon: 'text-violet-600', label: 'text-violet-700',
    navHover: 'hover:bg-violet-50', chip: 'hover:bg-violet-100 hover:text-violet-800',
  },
  sky: {
    soft: 'bg-sky-50', stripR: 'to-sky-50', solid: 'bg-sky-600 hover:bg-sky-700', hoverDay: 'hover:bg-sky-100',
    ring: 'ring-sky-400', focus: 'focus:ring-sky-500', icon: 'text-sky-600', label: 'text-sky-700',
    navHover: 'hover:bg-sky-50', chip: 'hover:bg-sky-100 hover:text-sky-800',
  },
};

// Surface/text classes for the light (default) and dark (Home Nursing) pages
const SURFACES = {
  light: {
    panel: 'bg-white border-slate-200', trigger: 'bg-slate-50 border-slate-200', filled: 'text-slate-900', empty: 'text-slate-400',
    title: 'text-slate-800', day: 'text-slate-700', dayOff: 'text-slate-300', todayRing: 'ring-slate-300', nav: 'text-slate-600',
    divider: 'border-slate-100', chipBase: 'bg-slate-100 text-slate-700', hint: 'text-slate-500', summary: 'text-slate-600',
    strong: 'text-slate-900', ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    soft: null, stripR: null, hoverDay: null, navHover: null, chip: null,
  },
  dark: {
    panel: 'bg-[#111827] border-white/10', trigger: 'bg-[#0b1120] border-white/10', filled: 'text-white', empty: 'text-slate-500',
    title: 'text-white', day: 'text-slate-200', dayOff: 'text-slate-600', todayRing: 'ring-white/30', nav: 'text-slate-300',
    divider: 'border-white/10', chipBase: 'bg-white/10 text-slate-200', hint: 'text-slate-400', summary: 'text-slate-400',
    strong: 'text-white', ghost: 'bg-white/10 text-slate-200 hover:bg-white/20',
    soft: 'bg-white/10', stripR: 'to-white/10', hoverDay: 'hover:bg-white/10', navHover: 'hover:bg-white/10', chip: 'hover:bg-white/20 hover:text-white',
  },
};

const MonthGrid = ({ year, month, today, start, end, hover, onPick, onHover, t }) => {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // While only a start is chosen, preview the range up to the hovered day
  const previewEnd = !end && start && hover && hover > start ? hover : null;
  const rangeEnd = end || previewEnd;

  return (
    <div className="w-full sm:w-[17rem]">
      <p className={`text-center font-bold ${t.title} mb-3`}>{MONTHS[month]} {year}</p>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(w => (
          <span key={w} className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400 py-1">{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const disabled = d < today;
          const isStart = start && d.getTime() === start.getTime();
          const isEnd = end && d.getTime() === end.getTime();
          const inRange = start && rangeEnd && d > start && d < rangeEnd;
          const isPreviewEnd = previewEnd && d.getTime() === previewEnd.getTime();
          const isToday = d.getTime() === today.getTime();

          // The tinted strip joins start → end; rounded caps on the two ends
          const strip =
            inRange ? t.soft :
            isStart && rangeEnd ? `bg-gradient-to-r from-transparent via-transparent ${t.stripR}` :
            (isEnd || isPreviewEnd) && start ? `bg-gradient-to-l from-transparent via-transparent ${t.stripR}` : '';

          return (
            <div key={d.getTime()} className={`flex items-center justify-center ${strip}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(d)}
                onMouseEnter={() => onHover(d)}
                className={`w-9 h-9 rounded-full text-sm font-medium transition-colors
                  ${disabled ? `${t.dayOff} cursor-not-allowed` : ''}
                  ${isStart || isEnd ? `${t.solid} text-white font-bold shadow-sm` : ''}
                  ${!disabled && !isStart && !isEnd ? `${t.day} ${t.hoverDay}` : ''}
                  ${isPreviewEnd && !isEnd ? `ring-2 ${t.ring}` : ''}
                  ${isToday && !isStart && !isEnd ? `ring-1 ${t.todayRing}` : ''}`}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * One calendar for both dates. Start: any day from today onward. End: optional,
 * any day after the start. Values are ISO (YYYY-MM-DD) strings.
 *
 * Props: startDate, endDate, onChange({ startDate, endDate }), label?, error?
 */
export default function DateRangePicker({ startDate, endDate, onChange, disabled = false, theme = 'amber', dark = false }) {
  const surface = dark ? SURFACES.dark : SURFACES.light;
  const accent = THEMES[theme] || THEMES.amber;
  const t = { ...accent };
  Object.entries(surface).forEach(([k, v]) => { if (v !== null) t[k] = v; });
  const today = useMemo(startOfToday, []);
  const start = fromISO(startDate);
  const end = fromISO(endDate);

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => {
    const base = start || today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const emit = (s, e) => onChange({ startDate: s ? toISO(s) : '', endDate: e ? toISO(e) : '' });

  // First click sets the start; the next click later than the start sets the end.
  // Clicking an earlier day restarts the range; clicking the start again drops the end.
  const pick = (d) => {
    if (!start || (start && end)) {
      emit(d, null);
      setHover(null);
      return;
    }
    if (d.getTime() === start.getTime()) return;
    if (d < start) { emit(d, null); return; }
    emit(start, d);
    setOpen(false);
  };

  const shiftView = (n) => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const canGoBack = view > new Date(today.getFullYear(), today.getMonth(), 1);
  const second = new Date(view.getFullYear(), view.getMonth() + 1, 1);

  const presets = start ? [
    { label: '1 week', date: addDays(start, 7) },
    { label: '2 weeks', date: addDays(start, 14) },
    { label: '1 month', date: addMonths(start, 1) },
    { label: '3 months', date: addMonths(start, 3) },
  ] : [];

  const summary = start
    ? `${fmt(startDate)}  →  ${end ? fmt(endDate) : 'No end date'}`
    : 'Select start date (and end date, optional)';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-3 border rounded-xl ${t.trigger} focus:ring-2 ${t.focus} outline-none text-left flex items-center justify-between gap-3 disabled:opacity-60`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={start ? t.filled : t.empty}>{summary}</span>
        <CalendarIcon className={`w-5 h-5 ${t.icon} flex-shrink-0`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose start and end dates"
          className={`absolute z-40 mt-2 left-0 border rounded-3xl shadow-2xl p-4 sm:p-6 max-w-[calc(100vw-2rem)] ${t.panel}`}
          onMouseLeave={() => setHover(null)}
        >
          <div className="flex items-center justify-between mb-4 gap-4">
            <button
              type="button"
              onClick={() => shiftView(-1)}
              disabled={!canGoBack}
              aria-label="Previous month"
              className={`p-2 rounded-full ${t.navHover} ${t.nav} disabled:opacity-30 disabled:hover:bg-transparent`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <p className={`text-xs font-semibold uppercase tracking-wider ${t.label}`}>
              {!start ? 'Pick a start date' : end ? 'Range selected' : 'Pick an end date (optional)'}
            </p>
            <button
              type="button"
              onClick={() => shiftView(1)}
              aria-label="Next month"
              className={`p-2 rounded-full ${t.navHover} ${t.nav}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-8">
            <MonthGrid year={view.getFullYear()} month={view.getMonth()} today={today} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} t={t} />
            <div className="hidden sm:block">
              <MonthGrid year={second.getFullYear()} month={second.getMonth()} today={today} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} t={t} />
            </div>
          </div>

          {presets.length > 0 && (
            <div className={`mt-4 pt-4 border-t ${t.divider}`}>
              <p className={`text-xs font-semibold ${t.hint} mb-2`}>Quick end date, counted from the start</p>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { emit(start, p.date); setView(new Date(p.date.getFullYear(), p.date.getMonth(), 1)); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${t.chipBase} ${t.chip} transition-colors`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className={`text-sm ${t.summary}`}>
              {start ? <><span className={`font-semibold ${t.strong}`}>{fmt(startDate)}</span>{end ? <> to <span className={`font-semibold ${t.strong}`}>{fmt(endDate)}</span></> : ' · no end date'}</> : 'No dates selected'}
            </div>
            <div className="flex items-center gap-2">
              {start && (
                <button
                  type="button"
                  onClick={() => { emit(null, null); setHover(null); }}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium ${t.ghost}`}
                >
                  Clear dates
                </button>
              )}
              {end && (
                <button
                  type="button"
                  onClick={() => emit(start, null)}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium ${t.ghost}`}
                >
                  <X className="w-4 h-4" /> No end date
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={!start}
                className={`px-5 py-2 rounded-xl text-sm font-bold ${t.solid} text-white disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
