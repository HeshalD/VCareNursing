// Small shared UI pieces for the booking Payments tab (Tailwind slate/blue).
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const PILL = { ok: 'bg-emerald-50 text-emerald-700', bad: 'bg-red-50 text-red-700', warn: 'bg-amber-50 text-amber-700', mute: 'bg-slate-100 text-slate-600', info: 'bg-blue-50 text-blue-700' };
export const Pill = ({ tone = 'mute', children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[tone] || PILL.mute}`}>{children}</span>
);

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60';
const BTN_TONE = {
  neutral: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  ghost: 'border-transparent bg-transparent text-blue-600 hover:bg-blue-50',
};
export const Btn = ({ tone = 'neutral', size = 'md', className = '', ...p }) => (
  <button type="button" className={`${BTN_BASE} ${BTN_TONE[tone]} ${size === 'sm' ? 'h-[30px] px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm'} ${className}`} {...p} />
);

export const FilterChip = ({ on, warn, className = '', ...p }) => (
  <button type="button" aria-pressed={!!on}
    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${on ? (warn ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-blue-300 bg-blue-50 text-blue-700') : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'} ${className}`} {...p} />
);

export const Segmented = ({ items, value, onChange, label }) => (
  <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-[3px]">
    {items.map(it => (
      <button key={it.id} type="button" role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)}
        className={`rounded-md px-3.5 py-1.5 text-[13px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${value === it.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}>{it.label}</button>
    ))}
  </div>
);

export const Cap = ({ children }) => <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;

export const FIELD = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';
export const TEXTAREA = 'w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100';

// Right-hand drawer: scrim, slide-in, Esc/scrim/Close, focus moved in + trapped, restored on close.
export function Drawer({ open, onClose, label, title, subtitle, widthClass = 'max-w-[480px]', children, footer }) {
  const ref = useRef(null);
  const lastFocus = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) { setShown(false); return undefined; }
    lastFocus.current = document.activeElement;
    const raf = requestAnimationFrame(() => setShown(true));
    ref.current?.querySelector('[data-autofocus]')?.focus() || ref.current?.querySelector('[data-close]')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const f = [...ref.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0]; const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      try { lastFocus.current?.focus(); } catch { /* element gone */ }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="fixed inset-0 z-40 bg-slate-900/35" />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label}
        className={`fixed inset-y-0 right-0 z-50 flex w-full ${widthClass} flex-col bg-white shadow-2xl transition duration-200 ease-out ${shown ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><div className="text-base font-semibold text-slate-900">{title}</div>{subtitle && <div className="text-[13px] text-slate-500">{subtitle}</div>}</div>
          <Btn data-close onClick={onClose}><X className="h-4 w-4" aria-hidden="true" />Close</Btn>
        </div>
        {children}
        {footer && <div className="flex gap-2.5 border-t border-slate-200 px-5 py-3.5">{footer}</div>}
      </div>
    </>
  );
}
