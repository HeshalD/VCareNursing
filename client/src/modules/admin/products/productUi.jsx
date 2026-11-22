/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useCallback, createContext, useContext } from 'react';
import { X, AlertCircle, RotateCcw } from 'lucide-react';

// Shared presentation primitives for the Products page and the product drawer, which is also opened
// from the invoice / quotation builders (see ProductDrawer.jsx's AddProductDrawer).

export const CATALOG_CARD_IMAGE_ASPECT = 1;

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
export const formatMoney = (v) => money.format(Number(v || 0));

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_VARIANT = {
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
  danger: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
  dangerSolid: 'border-red-600 bg-red-600 text-white hover:bg-red-700',
  success: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
};
const BTN_SIZE = { md: 'h-9 px-3.5 text-[13px]', sm: 'h-[30px] px-2.5 text-xs' };
export const btn = (variant = 'secondary', size = 'md') => `${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]}`;
export const iconBtn = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';

export const inputCls = (invalid) => `h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-800 placeholder-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${invalid ? 'border-red-600' : 'border-slate-300 focus-visible:border-blue-500'}`;
export const textareaCls = (invalid) => `w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${invalid ? 'border-red-600' : 'border-slate-300 focus-visible:border-blue-500'}`;

export const MOTION_CSS = `
@keyframes pp-slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-pop{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-rise{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-fade{from{opacity:0}to{opacity:1}}
.pp-slide{animation:pp-slide 220ms ease-out}.pp-pop{animation:pp-pop 150ms ease-out}
.pp-rise{animation:pp-rise 180ms ease-out}.pp-fade{animation:pp-fade 160ms ease-out}
@media (prefers-reduced-motion:reduce){.pp-slide,.pp-pop,.pp-rise,.pp-fade{animation:none}}
`;

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-slate-100 p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {o.label}
            {o.count != null && <span className="ml-1.5 font-medium tabular-nums text-slate-500">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export function Field({ label, htmlFor, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry, onDismiss }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btn('danger', 'sm')}>
          <RotateCcw className="h-3 w-3" /> Retry
        </button>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error" className="rounded p-1 text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function useEscape(handler) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // A confirm dialog on top handles Escape itself.
      if (document.querySelector('[role="alertdialog"]') && !e.target.closest?.('[role="alertdialog"]')) return;
      handler();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler]);
}

// Outside the Products page there is no UiProvider, so a dirty-form close falls back to the browser prompt.
export const UiCtx = createContext({ toast: () => {}, confirm: (o) => Promise.resolve(window.confirm(`${o?.title || 'Are you sure?'}${o?.body ? `
${o.body}` : ''}`)) });
export const useUi = () => useContext(UiCtx);

export function Drawer({ title, subtitle, onClose, dirty = false, onSubmit, footer, children, width = 500 }) {
  const { confirm } = useUi();
  const requestClose = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        body: 'You have edits in this form that have not been saved.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }, [dirty, confirm, onClose]);
  useEscape(requestClose);
  const Shell = onSubmit ? 'form' : 'div';
  const shellProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close panel" tabIndex={-1} onClick={requestClose} className="pp-fade absolute inset-0 cursor-default bg-slate-900/40" />
      <Shell
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...shellProps}
        className="pp-slide relative flex h-full w-full flex-col bg-white shadow-xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={requestClose} aria-label="Close panel" className={iconBtn}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">{footer}</div>}
      </Shell>
    </div>
  );
}
