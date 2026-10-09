import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { backdatedOldAmount, backdatedNewAmount } from './backdatedSwapPay';

// Calendar for a BACKDATED whole-booking swap: the nightly cron already paid the
// outgoing staff for every day from the real swap date up to its last run, so the
// admin decides here, per day, who should actually be paid for it. Each in-range
// day carries two toggles — outgoing and incoming staff — and clicking the date
// itself opens an amount editor for partial days (e.g. the handover day).
//
// `days` is [{ dateISO, oldRecord }] where oldRecord is the outgoing staff's
// attendance row for that date (PAID ones are the only editable kind) or null.
// `decisions` is { [dateISO]: { oldPay, oldAmount, newPay, newAmount } } owned by
// the caller; amounts are '' until the admin overrides them.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const money = (v) => `Rs.${Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 2 })}`;
const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function Toggle({ on, disabled, label, onClick, title }) {
  if (disabled) {
    return <span className="flex items-center justify-between gap-1 rounded-md bg-slate-50 px-1.5 py-1 text-[10px] text-slate-400" title={title}>{label}<span>—</span></span>;
  }
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

export default function BackdatedSwapPayCalendar({ days, decisions, onChange, oldName, newName, newRate }) {
  const [selected, setSelected] = useState(days[0]?.dateISO || null);
  const byDate = useMemo(() => Object.fromEntries(days.map(d => [d.dateISO, d])), [days]);

  // One grid per calendar month the range touches, weeks starting Monday.
  const months = useMemo(() => {
    if (days.length === 0) return [];
    const first = new Date(`${days[0].dateISO}T00:00:00`);
    const last = new Date(`${days[days.length - 1].dateISO}T00:00:00`);
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

  const set = (dateISO, patch) => onChange({ ...decisions, [dateISO]: { ...decisions[dateISO], ...patch } });
  const setAll = (patch) => onChange(Object.fromEntries(days.map(d => [d.dateISO, { ...decisions[d.dateISO], ...patch }])));

  const totals = days.reduce((acc, day) => {
    const dec = decisions[day.dateISO] || {};
    if (day.oldRecord?.salary_status === 'PAID') {
      const paid = Number(day.oldRecord.salary_amount || 0);
      if (!dec.oldPay) { acc.reversedDays += 1; acc.reversed += paid; }
      else { acc.oldKept += 1; acc.oldDelta += backdatedOldAmount(day, dec) - paid; }
    }
    if (dec.newPay) { acc.newDays += 1; acc.newTotal += backdatedNewAmount(dec, newRate); }
    return acc;
  }, { reversedDays: 0, reversed: 0, oldKept: 0, oldDelta: 0, newDays: 0, newTotal: 0 });

  const sel = selected ? byDate[selected] : null;
  const selDec = selected ? decisions[selected] || {} : {};
  const selOldPaid = sel?.oldRecord?.salary_status === 'PAID';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold uppercase tracking-wide text-slate-500">Quick set:</span>
        <button type="button" onClick={() => setAll({ oldPay: false, newPay: true })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Only {newName} paid</button>
        <button type="button" onClick={() => setAll({ oldPay: true, newPay: false })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Only {oldName} paid</button>
        <button type="button" onClick={() => setAll({ oldPay: true, newPay: true })} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-200">Pay both</button>
      </div>

      {months.map(month => (
        <div key={month.label} className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">{month.label}</p>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map(w => <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase text-slate-400">{w}</div>)}
            {month.cells.map((iso, i) => {
              if (!iso) return <div key={`blank-${i}`} />;
              const day = byDate[iso];
              const dayNum = Number(iso.slice(8, 10));
              if (!day) {
                return <div key={iso} className="min-h-[64px] rounded-lg bg-slate-50/60 p-1 text-[11px] text-slate-300">{dayNum}</div>;
              }
              const dec = decisions[iso] || {};
              const oldPaid = day.oldRecord?.salary_status === 'PAID';
              const edited = (dec.oldPay && dec.oldAmount !== '' && dec.oldAmount != null) || (dec.newPay && dec.newAmount !== '' && dec.newAmount != null);
              return (
                <div
                  key={iso}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(iso)}
                  onKeyDown={e => { if (e.key === 'Enter') setSelected(iso); }}
                  className={`min-h-[64px] cursor-pointer space-y-1 rounded-lg border p-1 transition ${selected === iso ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                    <span>{dayNum}</span>
                    {edited && <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-700" title="Custom amount">Rs.</span>}
                  </div>
                  <Toggle
                    on={dec.oldPay}
                    disabled={!oldPaid}
                    label="Old"
                    title={oldPaid ? `${oldName}: ${dec.oldPay ? 'keep paid' : 'reverse'} (${money(day.oldRecord.salary_amount)} paid)` : `${oldName}: nothing paid for this day`}
                    onClick={() => set(iso, { oldPay: !dec.oldPay })}
                  />
                  <Toggle
                    on={dec.newPay}
                    label="New"
                    title={`${newName}: ${dec.newPay ? 'pay' : "don't pay"}`}
                    onClick={() => set(iso, { newPay: !dec.newPay })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {sel && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5">
          <p className="mb-3 text-sm font-semibold text-slate-800">{longDate(sel.dateISO)}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{oldName} (outgoing)</p>
              {selOldPaid ? (
                <>
                  <p className="mt-0.5 text-xs text-slate-500">Already paid {money(sel.oldRecord.salary_amount)} by the nightly run.</p>
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={Boolean(selDec.oldPay)} onChange={e => set(sel.dateISO, { oldPay: e.target.checked })} />
                    Should be paid for this day
                  </label>
                  {selDec.oldPay ? (
                    <input type="number" min="0" step="0.01" value={selDec.oldAmount ?? ''} onChange={e => set(sel.dateISO, { oldAmount: e.target.value })} onWheel={e => e.currentTarget.blur()} placeholder={String(Number(sel.oldRecord.salary_amount || 0))} className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
                  ) : (
                    <p className="mt-2 text-xs font-medium text-rose-700">{money(sel.oldRecord.salary_amount)} will be reversed from their wallet.</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500">{sel.oldRecord ? `This day is ${String(sel.oldRecord.salary_status).toLowerCase()} — nothing to change.` : 'Nothing was paid for this day.'}</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{newName} (replacement)</p>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={Boolean(selDec.newPay)} onChange={e => set(sel.dateISO, { newPay: e.target.checked })} />
                Should be paid for this day
              </label>
              {selDec.newPay ? (
                <input type="number" min="0" step="0.01" value={selDec.newAmount ?? ''} onChange={e => set(sel.dateISO, { newAmount: e.target.value })} onWheel={e => e.currentTarget.blur()} placeholder={newRate ? String(newRate) : 'Amount'} className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500" />
              ) : (
                <p className="mt-2 text-xs text-slate-500">Recorded as not paid.</p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Leave an amount blank to use the full daily rate. Lower it for a partial day such as the handover.</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
        <p><span className="font-semibold">{oldName}:</span> {totals.reversedDays} day{totals.reversedDays === 1 ? '' : 's'} reversed ({money(totals.reversed)} taken back), {totals.oldKept} kept{totals.oldDelta ? `, net adjustment ${totals.oldDelta > 0 ? '+' : '−'}${money(Math.abs(totals.oldDelta))}` : ''}.</p>
        <p><span className="font-semibold">{newName}:</span> {totals.newDays} day{totals.newDays === 1 ? '' : 's'} paid ({money(totals.newTotal)}).</p>
        <p className="text-slate-500">The client's invoices for these days are not changed.</p>
      </div>
    </div>
  );
}
