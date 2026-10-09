import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';

// Calendar for resuming a paused LIVE_IN booking from a date in the PAST. The
// booking was paused on those days, so the nightly run neither paid the staff
// member nor invoiced the client — the admin decides both here, per day. Each day
// has two toggles (Staff pay / Client invoice); clicking the date opens an amount
// editor for partial days such as the first one.
//
// `days` is ['YYYY-MM-DD', ...]. `decisions` is
// { [dateISO]: { pay, amount, invoice, invoiceAmount } } owned by the caller;
// amounts are '' until overridden (blank = the full staff / client daily rate).

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (v) => `Rs.${Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const effective = (override, fallback) => (override !== '' && override != null ? Number(override) : Number(fallback || 0));

function Toggle({ on, label, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold transition ${on ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}
    >
      <span className="truncate">{label}</span>
      {on ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
    </button>
  );
}

export default function ResumePastDaysCalendar({ days, decisions, onChange, staffName, staffRate, clientRate }) {
  const [selected, setSelected] = useState(days[0] || null);
  const inRange = useMemo(() => new Set(days), [days]);

  const months = useMemo(() => {
    if (days.length === 0) return [];
    const first = new Date(`${days[0]}T00:00:00`);
    const last = new Date(`${days[days.length - 1]}T00:00:00`);
    const out = [];
    for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const lead = (m.getDay() + 6) % 7;
      const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const cells = Array.from({ length: lead }, () => null)
        .concat(Array.from({ length: daysInMonth }, (_, i) => isoOf(new Date(m.getFullYear(), m.getMonth(), i + 1))));
      out.push({ label: m.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), cells });
    }
    return out;
  }, [days]);

  const set = (iso, patch) => onChange({ ...decisions, [iso]: { ...decisions[iso], ...patch } });
  const setAll = (patch) => onChange(Object.fromEntries(days.map(d => [d, { ...decisions[d], ...patch }])));

  const totals = days.reduce((acc, d) => {
    const dec = decisions[d] || {};
    if (dec.pay) { acc.paidDays += 1; acc.pay += effective(dec.amount, staffRate); }
    if (dec.invoice) { acc.invoicedDays += 1; acc.invoice += effective(dec.invoiceAmount, clientRate); }
    return acc;
  }, { paidDays: 0, pay: 0, invoicedDays: 0, invoice: 0 });

  const sel = selected && inRange.has(selected) ? selected : null;
  const selDec = sel ? decisions[sel] || {} : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Quick set:</span>
        <button type="button" onClick={() => setAll({ pay: true, invoice: true })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Pay &amp; invoice every day</button>
        <button type="button" onClick={() => setAll({ pay: true, invoice: false })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Pay staff only</button>
        <button type="button" onClick={() => setAll({ pay: false, invoice: false })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Neither</button>
      </div>

      {months.map(month => (
        <div key={month.label} className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">{month.label}</p>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map(w => <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase text-slate-400">{w}</div>)}
            {month.cells.map((iso, i) => {
              if (!iso) return <div key={`blank-${i}`} />;
              const dayNum = Number(iso.slice(8, 10));
              if (!inRange.has(iso)) {
                return <div key={iso} className="min-h-[64px] rounded-lg bg-slate-50/60 p-1 text-[11px] text-slate-300">{dayNum}</div>;
              }
              const dec = decisions[iso] || {};
              const edited = (dec.pay && dec.amount !== '' && dec.amount != null) || (dec.invoice && dec.invoiceAmount !== '' && dec.invoiceAmount != null);
              return (
                <div
                  key={iso}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(iso)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelected(iso); }}
                  className={`min-h-[64px] cursor-pointer space-y-1 rounded-lg border p-1 transition ${sel === iso ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                    <span>{dayNum}</span>
                    {edited && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700" title="Custom amount">Rs.</span>}
                  </div>
                  <Toggle on={dec.pay} label="Staff" title={`${staffName}: ${dec.pay ? 'pay' : "don't pay"}`} onClick={() => set(iso, { pay: !dec.pay })} />
                  <Toggle on={dec.invoice} label="Client" title={`Client: ${dec.invoice ? 'invoice' : "don't invoice"}`} onClick={() => set(iso, { invoice: !dec.invoice })} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {sel && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5">
          <p className="mb-3 text-sm font-semibold text-slate-800">{longDate(sel)}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{staffName}</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={Boolean(selDec.pay)} onChange={e => set(sel, { pay: e.target.checked })} />
                Pay for this day
              </label>
              {selDec.pay && (
                <input type="number" min="0" step="0.01" value={selDec.amount ?? ''} onChange={e => set(sel, { amount: e.target.value })} onWheel={e => e.currentTarget.blur()} placeholder={staffRate ? String(staffRate) : 'Amount'} className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client invoice</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={Boolean(selDec.invoice)} onChange={e => set(sel, { invoice: e.target.checked })} />
                Invoice the client for this day
              </label>
              {selDec.invoice && (
                <input type="number" min="0" step="0.01" value={selDec.invoiceAmount ?? ''} onChange={e => set(sel, { invoiceAmount: e.target.value })} onWheel={e => e.currentTarget.blur()} placeholder={clientRate ? String(clientRate) : 'Amount'} className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Leave an amount blank to use the full daily rate. Lower it for a partial day, such as the day they arrived.</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
        <p><span className="font-semibold">{staffName}:</span> paid for {totals.paidDays} of {days.length} day{days.length === 1 ? '' : 's'} ({money(totals.pay)}).</p>
        <p><span className="font-semibold">Client:</span> invoiced for {totals.invoicedDays} day{totals.invoicedDays === 1 ? '' : 's'} ({money(totals.invoice)}), drawn from their wallet.</p>
        <p className="text-slate-500">Today onwards is handled by the nightly run as usual.</p>
      </div>
    </div>
  );
}
