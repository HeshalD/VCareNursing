import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Loader2, X, Search, Check, AlertCircle, Download, ChevronDown, ChevronLeft, ChevronRight,
  MoreHorizontal, Upload, Tag, ExternalLink, ArrowUp, ArrowDown, RotateCcw, Image as ImageIcon, Trash2, Pencil, Ban,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import { invoicePaymentState, SALE_STATUS, SALE_BUCKET } from '../../../utils/invoiceState';
import { withHonorific } from '../../../utils/clientName';
import { ClientLink } from '../components/EntityLinks';
import useInvoiceAmountEditor from '../user_managemnet/useInvoiceAmountEditor';
import DateInput, { todayISO } from '../../../components/common/DateInput';
import ImageCropModal from '../../../components/common/ImageCropModal';
import CitySelect from '../../../components/common/CitySelect';
import { HONORIFICS } from '../../../constants/honorifics';

// Matches the public CatalogPage product card image box (square slot).
const CATALOG_CARD_IMAGE_ASPECT = 1;
const LOW_STOCK_THRESHOLD = 5;
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE'];

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));
const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const daysRemaining = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};
const DaysRemainingBadge = ({ date }) => {
  const days = daysRemaining(date);
  if (days === null) return null;
  const label = days > 0 ? `${days}d left` : days === 0 ? 'Due today' : `${Math.abs(days)}d overdue`;
  const color = days > 3 ? 'bg-emerald-50 text-emerald-700'
    : days >= 0 ? 'bg-amber-50 text-amber-700'
    : 'bg-red-50 text-red-700';
  return <span className={`ml-1.5 inline-flex rounded-full px-2 py-px text-xs font-semibold ${color}`}>{label}</span>;
};

// ==================== DESIGN TOKENS ====================

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_VARIANT = {
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
  danger: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
  dangerSolid: 'border-red-600 bg-red-600 text-white hover:bg-red-700',
  success: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
};
const BTN_SIZE = { md: 'h-9 px-3.5 text-[13px]', sm: 'h-[30px] px-2.5 text-xs' };
const btn = (variant = 'secondary', size = 'md') => `${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]}`;
const iconBtn = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50';

const inputCls = (invalid) => `h-9 w-full rounded-md border bg-white px-3 text-sm text-slate-800 placeholder-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${invalid ? 'border-red-600' : 'border-slate-300 focus-visible:border-blue-500'}`;
const textareaCls = (invalid) => `w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-500 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${invalid ? 'border-red-600' : 'border-slate-300 focus-visible:border-blue-500'}`;

const MOTION_CSS = `
@keyframes pp-slide{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-pop{from{transform:scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-rise{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
@keyframes pp-fade{from{opacity:0}to{opacity:1}}
.pp-slide{animation:pp-slide 220ms ease-out}.pp-pop{animation:pp-pop 150ms ease-out}
.pp-rise{animation:pp-rise 180ms ease-out}.pp-fade{animation:pp-fade 160ms ease-out}
@media (prefers-reduced-motion:reduce){.pp-slide,.pp-pop,.pp-rise,.pp-fade{animation:none}}
`;

// ==================== SHARED PIECES ====================

const CHIP_TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  blue: 'bg-blue-50 text-blue-700',
  slate: 'bg-slate-100 text-slate-600',
};

function StatusChip({ tone = 'slate', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONES[tone] || CHIP_TONES.slate} ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

const KPI_VALUE_TONES = { amber: 'text-amber-700', green: 'text-emerald-700', red: 'text-red-700' };

function Kpi({ label, value, sub, active, tone, onClick }) {
  const body = (
    <>
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${KPI_VALUE_TONES[tone] || 'text-slate-900'}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </>
  );
  if (!onClick) {
    return <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 text-left">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      {body}
    </button>
  );
}

function Segmented({ options, value, onChange, ariaLabel }) {
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

function Toggle({ checked, onChange, label, disabled }) {
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

function SelectCheckbox({ checked, indeterminate = false, onChange, label }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => { if (el) el.indeterminate = indeterminate && !checked; }}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500"
    />
  );
}

function Field({ label, htmlFor, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function ErrorBanner({ message, onRetry, onDismiss }) {
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

function SkeletonRows({ rows = 6 }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex min-h-[60px] items-center gap-4 px-4">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-3 flex-1 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {body && <p className="max-w-md text-sm text-slate-500">{body}</p>}
      {action}
    </div>
  );
}

// Grid-based table primitives with ARIA table semantics.
function TableShell({ minWidth, children }) {
  return (
    <div className="overflow-x-auto">
      <div role="table" style={{ minWidth }}>{children}</div>
    </div>
  );
}
function HeadRow({ cols, children }) {
  return (
    <div
      role="row"
      className="grid min-h-10 items-center gap-x-3 border-b border-slate-200 bg-slate-50 px-4 text-xs font-bold uppercase tracking-wider text-slate-500"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}
function HCell({ children, right, className = '' }) {
  return <div role="columnheader" className={`${right ? 'text-right' : ''} ${className}`}>{children}</div>;
}
function BodyRow({ cols, children, muted }) {
  return (
    <div
      role="row"
      className={`grid min-h-[60px] items-center gap-x-3 border-b border-slate-100 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 ${muted ? 'opacity-60' : ''}`}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}
function Cell({ children, right, className = '' }) {
  return <div role="cell" className={`min-w-0 ${right ? 'text-right tabular-nums' : ''} ${className}`}>{children}</div>;
}
function ExpandRow({ children }) {
  return (
    <div role="row" className="pp-fade border-b border-slate-200 bg-slate-50">
      <div role="cell" className="px-4 py-4">{children}</div>
    </div>
  );
}

function downloadCsv(filename, header, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SearchBox({ value, onChange, placeholder, label }) {
  return (
    <div className="relative min-w-[220px] max-w-[380px] flex-1 basis-[280px]">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        aria-label={label || placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls(false)} pl-9`}
      />
    </div>
  );
}

// ==================== URL STATE ====================

// Several keys can be patched in one call; '' / null removes a key.
function useUrlParams() {
  const [sp, setSp] = useSearchParams();
  const ref = useRef(sp);
  useEffect(() => { ref.current = sp; }, [sp]);
  const update = useCallback((patch) => {
    const next = new URLSearchParams(ref.current);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') next.delete(k); else next.set(k, String(v));
    });
    ref.current = next;
    setSp(next, { replace: true });
  }, [setSp]);
  return [sp, update];
}

function useEscape(handler) {
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

// Lets the page header's primary button open the active tab's "new" drawer.
function useCreateSignal(tick, fn) {
  const seen = useRef(tick);
  useEffect(() => {
    if (tick !== seen.current) { seen.current = tick; fn(); }
  }, [tick, fn]);
}

// ==================== TOAST + CONFIRM ====================

const UiCtx = createContext({ toast: () => {}, confirm: () => Promise.resolve(false) });
const useUi = () => useContext(UiCtx);

function ConfirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }) {
  useEscape(onCancel);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" aria-label="Cancel" tabIndex={-1} onClick={onCancel} className="pp-fade absolute inset-0 cursor-default bg-slate-900/40" />
      <div role="alertdialog" aria-modal="true" aria-labelledby="pp-confirm-title" className="pp-pop relative w-full max-w-[420px] rounded-xl bg-white p-6 shadow-xl">
        <h2 id="pp-confirm-title" className="text-base font-semibold text-slate-900">{title}</h2>
        {body && <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className={btn('secondary')}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} className={btn(tone === 'danger' ? 'dangerSolid' : tone === 'success' ? 'success' : 'primary')}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, undo, link, onClose }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
      <div role="status" aria-live="polite" className="pp-rise pointer-events-auto inline-flex max-w-full items-center gap-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-slate-50 shadow-lg">
        <span>{message}</span>
        {undo && (
          <button type="button" onClick={() => { undo(); onClose(); }} className="font-bold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            Undo
          </button>
        )}
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer" className="font-bold text-blue-300 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {link.label}
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Dismiss notification" className="rounded p-0.5 text-slate-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function UiProvider({ children }) {
  const [toastState, setToastState] = useState(null);
  const [dialog, setDialog] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const dismissToast = useCallback(() => { clearTimeout(timer.current); setToastState(null); }, []);
  const toast = useCallback((message, opts = {}) => {
    clearTimeout(timer.current);
    setToastState({ message, undo: opts.undo, link: opts.link, key: Date.now() });
    timer.current = setTimeout(() => setToastState(null), 6000);
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);
  const settle = (value) => { dialog?.resolve(value); setDialog(null); };
  const ctx = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UiCtx.Provider value={ctx}>
      <style>{MOTION_CSS}</style>
      {children}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          tone={dialog.tone}
          onCancel={() => settle(false)}
          onConfirm={() => settle(true)}
        />
      )}
      {toastState && <Toast key={toastState.key} message={toastState.message} undo={toastState.undo} link={toastState.link} onClose={dismissToast} />}
    </UiCtx.Provider>
  );
}

// ==================== MODAL + DRAWER ====================

function Modal({ title, subtitle, onClose, footer, children, onSubmit, width = 620 }) {
  useEscape(onClose);
  const Shell = onSubmit ? 'form' : 'div';
  const shellProps = onSubmit ? { onSubmit, noValidate: true } : {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close dialog" tabIndex={-1} onClick={onClose} className="pp-fade absolute inset-0 cursor-default bg-slate-900/40" />
      <Shell
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...shellProps}
        className="pp-pop relative flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={iconBtn}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3.5">{footer}</div>}
      </Shell>
    </div>
  );
}

function Drawer({ title, subtitle, onClose, dirty = false, onSubmit, footer, children, width = 500 }) {
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

function RowMenu({ items, label = 'More actions' }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const open = !!pos;

  const toggle = () => {
    if (open) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const needed = items.length * 36 + 12;
    const right = window.innerWidth - r.right;
    setPos(r.bottom + needed > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={iconBtn}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setPos(null)} className="fixed inset-0 z-40 cursor-default" />
          <div role="menu" className="pp-pop fixed z-50 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg" style={pos}>
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => { setPos(null); it.onClick(); }}
                className={`block w-full rounded px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${it.danger ? 'text-red-700' : 'text-slate-700'}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ==================== RECIPIENT (shared by quote + rental drawers) ====================

const CLIENT_TYPES = ['INDIVIDUAL', 'CORPORATE_PROXY'];

const emptyWalkInClient = () => ({
  honorific: '', full_name: '', gender: '', client_type: 'INDIVIDUAL',
  company_name: '', display_name_source: 'FULL_NAME', email: '', mobile_number: '', primary_address: '', city_id: '',
});

const walkInPayload = (w) => ({
  full_name: w.full_name.trim(),
  email: w.email || undefined,
  mobile_number: w.mobile_number.trim(),
  gender: w.gender,
  primary_address: w.primary_address || undefined,
  city_id: w.city_id || undefined,
  client_type: w.client_type || 'INDIVIDUAL',
  honorific: w.honorific || undefined,
  company_name: w.company_name || undefined,
  display_name_source: w.client_type === 'CORPORATE_PROXY' && w.company_name ? w.display_name_source : 'FULL_NAME',
});

// Validates the recipient block; returns { errors, message } using the same messages as before.
function validateRecipient(recipientType, selectedClientId, walkIn) {
  const errors = {};
  if (recipientType === 'client' && !selectedClientId) errors.client = 'Please select a client';
  if (recipientType === 'walk_in') {
    if (!walkIn.full_name.trim()) errors.full_name = 'Please enter the walk-in customer\'s full name';
    if (!walkIn.gender) errors.gender = 'Please select the walk-in customer\'s gender';
    if (!walkIn.mobile_number.trim()) errors.mobile_number = 'Please enter the walk-in customer\'s mobile number — it registers them as a client';
  }
  return errors;
}

// Collects the same required fields as the normal "Add Client" flow so a
// walk-in customer is registered as a full client.
function WalkInClientFields({ value, onChange, errors = {} }) {
  const set = (patch) => onChange((v) => ({ ...v, ...patch }));
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Honorific" htmlFor="wi-honorific">
          <select id="wi-honorific" value={value.honorific} onChange={(e) => set({ honorific: e.target.value })} className={inputCls(false)}>
            <option value="">None</option>
            {HONORIFICS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Field>
        <Field label="Full name *" htmlFor="wi-name" error={errors.full_name} className="sm:col-span-2">
          <input id="wi-name" type="text" value={value.full_name} onChange={(e) => set({ full_name: e.target.value })} className={inputCls(!!errors.full_name)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Gender *" htmlFor="wi-gender" error={errors.gender}>
          <select id="wi-gender" value={value.gender} onChange={(e) => set({ gender: e.target.value })} className={inputCls(!!errors.gender)}>
            <option value="">Select…</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="Client type" htmlFor="wi-type">
          <select
            id="wi-type"
            value={value.client_type}
            onChange={(e) => set({
              client_type: e.target.value,
              ...(e.target.value !== 'CORPORATE_PROXY' ? { company_name: '', display_name_source: 'FULL_NAME' } : {}),
            })}
            className={inputCls(false)}
          >
            {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </select>
        </Field>
      </div>
      {value.client_type === 'CORPORATE_PROXY' && (
        <Field label="Company name" htmlFor="wi-company">
          <input
            id="wi-company"
            type="text"
            value={value.company_name}
            onChange={(e) => set({ company_name: e.target.value, ...(!e.target.value ? { display_name_source: 'FULL_NAME' } : {}) })}
            className={inputCls(false)}
          />
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email (optional)" htmlFor="wi-email">
          <input id="wi-email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} className={inputCls(false)} />
        </Field>
        <Field label="Mobile number *" htmlFor="wi-mobile" error={errors.mobile_number}>
          <input id="wi-mobile" type="text" value={value.mobile_number} onChange={(e) => set({ mobile_number: e.target.value })} className={inputCls(!!errors.mobile_number)} />
        </Field>
      </div>
      <Field label="City (optional)">
        <CitySelect
          value={value.city_id}
          onChange={(city) => set({ city_id: city ? city.city_id : '' })}
          placeholder="Select a city"
          className={inputCls(false)}
        />
      </Field>
      <Field label="Primary address (optional)" htmlFor="wi-address">
        <input id="wi-address" type="text" value={value.primary_address} onChange={(e) => set({ primary_address: e.target.value })} className={inputCls(false)} />
      </Field>
      <p className="text-xs text-slate-500">
        Registers them as a client (login credentials sent via SMS) with their registration fee left pending — they can rent or purchase now and settle it later.
      </p>
    </div>
  );
}

function useClientsList() {
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await apiClient.getAllClients();
      setError('');
      setClients(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
    } catch (err) {
      setError(err?.message || 'Failed to load clients.');
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { clients, error, reload: load };
}

function RecipientBlock({ recipientType, onTypeChange, clientsState, search, onSearch, selectedId, onSelect, walkIn, onWalkIn, errors = {} }) {
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\s/g, '');
  const filtered = clientsState.clients.filter((c) => (
    (c.full_name || c.client_name || '').toLowerCase().includes(q)
    || (qDigits && String(c.mobile_number || '').replace(/\s/g, '').includes(qDigits))
  ));
  const visible = filtered.slice(0, 50);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">1. Recipient</h3>
      <Segmented
        ariaLabel="Recipient type"
        value={recipientType}
        onChange={onTypeChange}
        options={[{ value: 'client', label: 'Existing client' }, { value: 'walk_in', label: 'Walk-in customer' }]}
      />
      {recipientType === 'client' ? (
        <div className="space-y-2">
          <ErrorBanner message={clientsState.error} onRetry={clientsState.reload} />
          <SearchBox value={search} onChange={onSearch} placeholder="Search clients by name or mobile…" />
          <div role="listbox" aria-label="Clients" className={`max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border ${errors.client ? 'border-red-600' : 'border-slate-200'}`}>
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-slate-500">No clients match your search.</p>
            ) : visible.map((c) => {
              const id = c.client_profile_id || c.client_id;
              const sel = selectedId === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-center justify-between gap-3 border-l-[3px] px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                    sel ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'border-transparent text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{withHonorific(c.honorific, c.full_name || c.client_name)}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-slate-500">
                    {c.mobile_number ? formatMobileNumber(c.mobile_number) : ''}
                    {sel && <Check className="h-4 w-4 text-blue-600" />}
                  </span>
                </button>
              );
            })}
          </div>
          {filtered.length > visible.length && <p className="text-xs text-slate-500">Showing the first {visible.length} of {filtered.length} matches — refine your search to narrow the list.</p>}
          {errors.client && <p role="alert" className="text-xs text-red-700">{errors.client}</p>}
        </div>
      ) : (
        <WalkInClientFields value={walkIn} onChange={onWalkIn} errors={errors} />
      )}
    </section>
  );
}

// ==================== PAGE SHELL ====================

const TABS = [
  { id: 'catalog', label: 'Catalog', primary: 'New product' },
  { id: 'quotes', label: 'Quotes & Invoices', primary: 'New quotation' },
  { id: 'rentals', label: 'Rentals', primary: 'New rental agreement' },
];

const URL_KEYS_TO_RESET = {
  search: '', type: '', category: '', stock: '', quick: '', sort: '', dir: '',
  status: '', page: '', view: '', filter: '', dstatus: '',
};

function ProductsPageInner() {
  const [sp, update] = useUrlParams();
  const tab = TABS.some((t) => t.id === sp.get('tab')) ? sp.get('tab') : 'catalog';
  const [counts, setCounts] = useState({ catalog: null, quotes: null, rentals: null });
  const [ticks, setTicks] = useState({ catalog: 0, quotes: 0, rentals: 0 });

  const reportCount = useCallback((key, n) => setCounts((c) => (c[key] === n ? c : { ...c, [key]: n })), []);

  // Counts for tabs that have not been opened yet (best effort; the tab itself shows load errors).
  useEffect(() => {
    let off = false;
    const run = async (key, fn) => {
      try {
        const res = await fn();
        if (!off && Array.isArray(res?.data)) reportCount(key, res.data.length);
      } catch {
        // Count stays hidden until the tab is opened and shows its own error with Retry.
      }
    };
    if (tab !== 'catalog') run('catalog', () => apiClient.getProducts({ include_unavailable: 'true' }));
    if (tab !== 'quotes') run('quotes', () => apiClient.getProductQuotes());
    if (tab !== 'rentals') run('rentals', () => apiClient.getRentalAgreements());
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTab = (id) => update({ ...URL_KEYS_TO_RESET, tab: id === 'catalog' ? '' : id });
  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="space-y-5 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Catalog, quotations and rentals in one place.</p>
        <button type="button" onClick={() => setTicks((t) => ({ ...t, [tab]: t[tab] + 1 }))} className={btn('primary')}>
          + {active.primary}
        </button>
      </div>

      <div role="tablist" aria-label="Products sections" className="flex gap-6 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="products-panel"
              onClick={() => switchTab(t.id)}
              className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                on ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {counts[t.id] != null && (
                <span className={`rounded-full px-2 py-px text-xs font-semibold tabular-nums ${on ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{counts[t.id]}</span>
              )}
            </button>
          );
        })}
      </div>

      <div id="products-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-4">
        {tab === 'catalog' && <CatalogTab createTick={ticks.catalog} onCount={reportCount} />}
        {tab === 'quotes' && <QuotesTab createTick={ticks.quotes} onCount={reportCount} />}
        {tab === 'rentals' && <RentalsTab createTick={ticks.rentals} onCount={reportCount} />}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <AdminLayout title="Products">
      <UiProvider>
        <ProductsPageInner />
      </UiProvider>
    </AdminLayout>
  );
}

// ==================== CATALOG TAB ====================

const TYPE_PARAM = { rental: 'RENTAL', item: 'ITEM', service: 'ONE_TIME_SERVICE' };
const TYPE_META = {
  RENTAL: { label: 'Rental', tile: 'bg-blue-100 text-blue-700', sub: 'per month' },
  ITEM: { label: 'Item', tile: 'bg-slate-200 text-slate-700', sub: 'each' },
  ONE_TIME_SERVICE: { label: 'Service', tile: 'bg-emerald-100 text-emerald-700', sub: 'per visit / shift' },
};
const STOCK_FILTERS = [
  { value: '', label: 'Any stock status' },
  { value: 'in', label: 'In stock' },
  { value: 'lowout', label: 'Low or out of stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'inactive', label: 'Deactivated' },
];
const CAT_COLS = '28px minmax(240px,2.2fr) minmax(120px,1fr) 140px 170px 110px 150px';

const unitSummary = (units) => units.reduce((a, u) => {
  a.total += 1;
  if (u.status === 'AVAILABLE') a.free += 1;
  else if (u.status === 'RENTED') a.rented += 1;
  else if (u.status === 'MAINTENANCE') a.maint += 1;
  return a;
}, { total: 0, free: 0, rented: 0, maint: 0 });

// 'inactive' | 'na' | 'out' | 'low' | 'in'
function stockState(p, us) {
  if (!p.is_available) return 'inactive';
  if (p.product_type === 'ONE_TIME_SERVICE') return 'na';
  if (p.product_type === 'RENTAL') return us.free === 0 ? 'out' : us.free <= 1 ? 'low' : 'in';
  if (p.stock_quantity === null || p.stock_quantity === undefined) return 'na';
  const q = Number(p.stock_quantity);
  return q <= 0 ? 'out' : q <= LOW_STOCK_THRESHOLD ? 'low' : 'in';
}

// Same fields the product form has always sent.
const payloadFromProduct = (p, patch = {}) => ({
  name: p.name,
  product_type: p.product_type,
  category_id: p.category_id || '',
  description: p.description || '',
  price: p.price,
  cost_price: p.cost_price ?? '',
  stock_quantity: p.stock_quantity ?? 0,
  vendor_id: p.vendor_id || '',
  ...patch,
});

function ProductTile({ p }) {
  const meta = TYPE_META[p.product_type] || TYPE_META.ITEM;
  if (p.image_url) {
    return <img src={p.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />;
  }
  return (
    <div aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold ${meta.tile}`}>
      {(p.name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function StockCell({ p, us, state }) {
  if (p.product_type === 'ONE_TIME_SERVICE') return <span className="text-[13px] text-slate-500">Not tracked</span>;
  if (p.product_type === 'RENTAL') {
    const pct = us.total ? Math.round((us.free / us.total) * 100) : 0;
    const color = us.free === 0 ? 'bg-red-500' : us.free <= 1 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div>
        <span className="text-sm text-slate-700"><b className="font-semibold tabular-nums text-slate-900">{us.free}</b> of {us.total} free</span>
        <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-sm bg-slate-200" role="presentation">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <b className="font-semibold tabular-nums text-slate-900">{p.stock_quantity ?? '—'}</b>
      {state === 'out' && Number(p.stock_quantity) < 0 && <StatusChip tone="red">Back-ordered</StatusChip>}
      {state === 'out' && !(Number(p.stock_quantity) < 0) && <StatusChip tone="red">Out of stock</StatusChip>}
      {state === 'low' && <StatusChip tone="amber">Low</StatusChip>}
    </span>
  );
}

function SortHeader({ label, field, sort, dir, onSort, right }) {
  const on = sort === field;
  return (
    <div role="columnheader" aria-sort={on ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'} className={right ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 rounded text-xs font-bold uppercase tracking-wider hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${on ? 'text-slate-800' : 'text-slate-500'}`}
      >
        {label}
        {on && (dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </div>
  );
}

function CatalogTab({ createTick, onCount }) {
  const { toast, confirm } = useUi();
  const { hasPermission: canDo } = useAdminAuth();
  const canDeleteProduct = canDo('PRODUCT_DELETE');
  const [sp, update] = useUrlParams();
  const search = sp.get('search') || '';
  const typeParam = TYPE_PARAM[sp.get('type')] ? sp.get('type') : '';
  const categoryFilter = sp.get('category') || '';
  const stockFilter = STOCK_FILTERS.some((s) => s.value === sp.get('stock')) ? (sp.get('stock') || '') : '';
  const quick = ['public', 'rented'].includes(sp.get('quick')) ? sp.get('quick') : '';
  const sortField = sp.get('sort') === 'price' ? 'price' : 'name';
  const sortDir = sp.get('dir') === 'desc' ? 'desc' : 'asc';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [drawer, setDrawer] = useState(null); // { mode: 'create'|'edit'|'duplicate', product }
  const [historyProduct, setHistoryProduct] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [bulkProgress, setBulkProgress] = useState(null); // { label, done, total }
  const [categoryModal, setCategoryModal] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [prodRes, unitsRes, catRes, vendRes] = await Promise.all([
        apiClient.getProducts({ include_unavailable: 'true' }),
        apiClient.getRentalUnits({}),
        apiClient.getProductCategories(),
        apiClient.getVendors(),
      ]);
      const list = Array.isArray(prodRes?.data) ? prodRes.data : [];
      setProducts(list);
      setUnits(Array.isArray(unitsRes?.data) ? unitsRes.data : []);
      setCategories(Array.isArray(catRes?.data) ? catRes.data : []);
      setVendors(Array.isArray(vendRes?.data) ? vendRes.data : []);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((p) => p.product_id === id))));
    } catch (err) {
      setLoadError(err?.message || 'Failed to load the catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (!loading && !loadError) onCount('catalog', products.length); }, [loading, loadError, products.length, onCount]);

  const openCreate = useCallback(() => setDrawer({ mode: 'create', product: null }), []);
  useCreateSignal(createTick, openCreate);

  const unitsByProduct = useMemo(() => {
    const map = new Map();
    units.forEach((u) => { if (!map.has(u.product_id)) map.set(u.product_id, []); map.get(u.product_id).push(u); });
    return map;
  }, [units]);
  const unitsOf = useCallback((p) => unitsByProduct.get(p.product_id) || [], [unitsByProduct]);
  const summaryOf = useCallback((p) => unitSummary(unitsOf(p)), [unitsOf]);

  // ----- filtering -----
  const isPublic = (p) => p.is_public !== false;
  const needsRestock = useCallback((p) => ['low', 'out'].includes(stockState(p, summaryOf(p))), [summaryOf]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hay = [p.name, p.category_name, ...unitsOf(p).flatMap((u) => [u.unit_code, u.rented_to_client_name, u.rented_to_walk_in_name])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (categoryFilter && String(p.category_id || '') !== categoryFilter) return false;
      if (stockFilter) {
        const st = stockState(p, summaryOf(p));
        if (stockFilter === 'lowout' && !['low', 'out'].includes(st)) return false;
        if (['in', 'low', 'out', 'inactive'].includes(stockFilter) && st !== stockFilter) return false;
      }
      if (quick === 'public' && !isPublic(p)) return false;
      if (quick === 'rented' && !(p.product_type === 'RENTAL' && summaryOf(p).rented > 0)) return false;
      return true;
    });
  }, [products, search, categoryFilter, stockFilter, quick, unitsOf, summaryOf]);

  const typeCounts = useMemo(() => ({
    all: base.length,
    rental: base.filter((p) => p.product_type === 'RENTAL').length,
    item: base.filter((p) => p.product_type === 'ITEM').length,
    service: base.filter((p) => p.product_type === 'ONE_TIME_SERVICE').length,
  }), [base]);

  const shown = useMemo(() => {
    const list = typeParam ? base.filter((p) => p.product_type === TYPE_PARAM[typeParam]) : base.slice();
    const dir = sortDir === 'desc' ? -1 : 1;
    list.sort((a, b) => (sortField === 'price'
      ? (Number(a.price) - Number(b.price)) * dir
      : String(a.name || '').localeCompare(String(b.name || '')) * dir));
    return list;
  }, [base, typeParam, sortField, sortDir]);

  const activeCount = products.filter((p) => p.is_available).length;
  const publicCount = products.filter((p) => p.is_available && isPublic(p)).length;
  const restockCount = products.filter((p) => needsRestock(p)).length;
  const rentedUnits = units.filter((u) => u.status === 'RENTED').length;
  const hasFilters = !!(search || typeParam || categoryFilter || stockFilter || quick);

  const clearFilters = () => update({ search: '', type: '', category: '', stock: '', quick: '' });
  const onSort = (field) => update(sortField === field
    ? { sort: field === 'name' ? '' : field, dir: sortDir === 'asc' ? 'desc' : '' }
    : { sort: field === 'name' ? '' : field, dir: '' });

  // ----- selection -----
  const shownIds = shown.map((p) => p.product_id);
  const allSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const someSelected = shownIds.some((id) => selected.has(id));
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allSelected) shownIds.forEach((id) => next.delete(id)); else shownIds.forEach((id) => next.add(id));
    return next;
  });
  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleExpanded = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ----- row actions -----
  const withBusy = async (id, fn) => {
    setBusyIds((s) => new Set(s).add(id));
    try { await fn(); } finally { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const toggleVisibility = (p, next) => withBusy(p.product_id, async () => {
    setActionError('');
    try {
      await apiClient.setProductsVisibility([p.product_id], next);
      setProducts((list) => list.map((x) => (x.product_id === p.product_id ? { ...x, is_public: next } : x)));
      toast(`"${p.name}" is now ${next ? 'shown on' : 'hidden from'} the public catalog.`);
    } catch (err) {
      setActionError(err?.message || 'Failed to update catalog visibility');
    }
  });

  const reactivate = async (p, undo = false) => {
    setActionError('');
    try {
      await apiClient.updateProduct(p.product_id, { ...payloadFromProduct(p), is_available: true }, null);
      await fetchAll();
      toast(undo ? `"${p.name}" restored.` : `"${p.name}" reactivated.`);
    } catch (err) {
      setActionError(err?.message || 'Failed to reactivate product');
    }
  };

  const handleDelete = async (p) => {
    const ok = await confirm({
      title: `Delete "${p.name}" permanently?`,
      body: 'This removes the product from the system for good and cannot be undone. It only works for a product that was never quoted, sold, rented or billed; otherwise deactivate it instead.',
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;
    setActionError('');
    try {
      await apiClient.deleteProduct(p.product_id);
      await fetchAll();
      toast(`"${p.name}" deleted.`);
    } catch (err) {
      setActionError(err?.message || 'Failed to delete product');
    }
  };

  const handleDeactivate = async (p) => {
    const ok = await confirm({
      title: `Deactivate "${p.name}"?`,
      body: 'It will no longer appear in the catalog. You can reactivate it later.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    setActionError('');
    try {
      await apiClient.deactivateProduct(p.product_id);
      await fetchAll();
      toast(`"${p.name}" deactivated.`, { undo: () => reactivate(p, true) });
    } catch (err) {
      setActionError(err?.message || 'Failed to deactivate product');
    }
  };

  const handleDuplicate = (p) => setDrawer({
    mode: 'duplicate',
    product: { ...p, product_id: undefined, name: `${p.name} (copy)`, image_url: '', is_public: false },
  });

  // ----- bulk actions -----
  const runBulk = async (label, ids, fn) => {
    setBulkProgress({ label, done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i += 1) {
      try { await fn(ids[i]); } catch { failed += 1; }
      setBulkProgress({ label, done: i + 1, total: ids.length });
    }
    setBulkProgress(null);
    await fetchAll();
    return failed;
  };

  const applyVisibility = async (flag) => {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkProgress({ label: flag ? 'Showing on catalog' : 'Hiding from catalog', done: 0, total: ids.length });
    setActionError('');
    try {
      await apiClient.setProductsVisibility(ids, flag);
      setSelected(new Set());
      await fetchAll();
      toast(`${ids.length} product${ids.length === 1 ? '' : 's'} ${flag ? 'shown on' : 'hidden from'} the public catalog.`);
    } catch (err) {
      setActionError(err?.message || 'Failed to update catalog visibility');
    } finally {
      setBulkProgress(null);
    }
  };

  const bulkDeactivate = async () => {
    const ids = [...selected].filter((id) => products.find((p) => p.product_id === id)?.is_available);
    if (!ids.length) { toast('The selected products are already deactivated.'); return; }
    const ok = await confirm({
      title: `Deactivate ${ids.length} product${ids.length === 1 ? '' : 's'}?`,
      body: 'They will no longer appear in the catalog. You can reactivate them later.',
      confirmLabel: 'Deactivate',
      tone: 'danger',
    });
    if (!ok) return;
    const failed = await runBulk('Deactivating', ids, (id) => apiClient.deactivateProduct(id));
    setSelected(new Set());
    toast(failed ? `Deactivated ${ids.length - failed} of ${ids.length}. ${failed} failed.` : `${ids.length} product${ids.length === 1 ? '' : 's'} deactivated.`);
  };

  const bulkChangeCategory = async (categoryId) => {
    setCategoryModal(false);
    const ids = [...selected];
    const failed = await runBulk('Updating category', ids, (id) => {
      const p = products.find((x) => x.product_id === id);
      return apiClient.updateProduct(id, { ...payloadFromProduct(p, { category_id: categoryId || '' }), is_available: p.is_available }, null);
    });
    setSelected(new Set());
    toast(failed ? `Updated ${ids.length - failed} of ${ids.length}. ${failed} failed.` : `Category updated for ${ids.length} product${ids.length === 1 ? '' : 's'}.`);
  };

  const exportCsv = () => downloadCsv(
    'products.csv',
    ['Name', 'Type', 'Category', 'Price', 'Cost price', 'Stock', 'On public catalog', 'Status'],
    shown.map((p) => {
      const us = summaryOf(p);
      const stock = p.product_type === 'ONE_TIME_SERVICE' ? 'Not tracked'
        : p.product_type === 'RENTAL' ? `${us.free} of ${us.total} free` : (p.stock_quantity ?? '');
      return [p.name, TYPE_META[p.product_type]?.label || p.product_type, p.category_name || '', p.price, p.cost_price ?? '', stock, isPublic(p) ? 'Yes' : 'No', p.is_available ? 'Active' : 'Deactivated'];
    }),
  );

  const busyBulk = !!bulkProgress;
  const initialLoading = loading && products.length === 0;

  return (
    <>
      <ErrorBanner message={loadError} onRetry={fetchAll} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Kpi label="Active products" value={activeCount} sub={`${products.length - activeCount} deactivated`} active={!hasFilters} onClick={clearFilters} />
        <Kpi label="On public catalog" value={publicCount} sub={`${activeCount - publicCount} hidden from customers`} active={quick === 'public'} onClick={() => update({ quick: quick === 'public' ? '' : 'public' })} />
        <Kpi label="Needs restocking" value={restockCount} tone="amber" sub="Low or out of stock" active={stockFilter === 'lowout'} onClick={() => update({ stock: stockFilter === 'lowout' ? '' : 'lowout' })} />
        <Kpi label="Units rented" value={rentedUnits} sub={`of ${units.length} rental units`} active={quick === 'rented'} onClick={() => update({ quick: quick === 'rented' ? '' : 'rented' })} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox value={search} onChange={(v) => update({ search: v })} placeholder="Search products, categories, unit codes…" />
        <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => update({ category: e.target.value })} className={`${inputCls(false)} w-[200px]`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.category_id} value={String(c.category_id)}>{c.name}</option>)}
        </select>
        <select aria-label="Filter by stock status" value={stockFilter} onChange={(e) => update({ stock: e.target.value })} className={`${inputCls(false)} w-[200px]`}>
          {STOCK_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="flex-1" />
        <button type="button" onClick={exportCsv} disabled={shown.length === 0} className={btn('secondary')}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <Segmented
            ariaLabel="Product type"
            value={typeParam}
            onChange={(v) => update({ type: v })}
            options={[
              { value: '', label: 'All', count: typeCounts.all },
              { value: 'rental', label: 'Rentals', count: typeCounts.rental },
              { value: 'item', label: 'Items', count: typeCounts.item },
              { value: 'service', label: 'Services', count: typeCounts.service },
            ]}
          />
          <span className="text-[13px] text-slate-500">Showing {shown.length} of {products.length}</span>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 border-b border-blue-200 bg-blue-50 px-4 py-2.5">
            <b className="text-[13px] text-blue-700">{selected.size} selected</b>
            {busyBulk ? (
              <span role="status" className="inline-flex items-center gap-2 text-[13px] text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" /> {bulkProgress.label}… {bulkProgress.done} of {bulkProgress.total}
              </span>
            ) : (
              <>
                <button type="button" onClick={() => applyVisibility(true)} className={btn('secondary', 'sm')}>Show on public catalog</button>
                <button type="button" onClick={() => applyVisibility(false)} className={btn('secondary', 'sm')}>Hide from catalog</button>
                <button type="button" onClick={() => setCategoryModal(true)} className={btn('secondary', 'sm')}>Change category</button>
                <button type="button" onClick={bulkDeactivate} className={btn('danger', 'sm')}>Deactivate</button>
                <span className="flex-1" />
                <button type="button" onClick={() => setSelected(new Set())} className="rounded text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Clear selection</button>
              </>
            )}
          </div>
        )}

        {initialLoading ? (
          <SkeletonRows rows={6} />
        ) : products.length === 0 && !loadError ? (
          <EmptyState title="No products yet" body="Use New product above to add your first product, rental or service." />
        ) : shown.length === 0 && !loadError ? (
          <EmptyState
            title="No products match your filters"
            action={hasFilters ? <button type="button" onClick={clearFilters} className={btn('secondary')}>Clear filters</button> : null}
          />
        ) : (
          <TableShell minWidth={1000}>
            <HeadRow cols={CAT_COLS}>
              <HCell><SelectCheckbox checked={allSelected} indeterminate={someSelected} onChange={toggleAll} label="Select all shown products" /></HCell>
              <SortHeader label="Product" field="name" sort={sortField} dir={sortDir} onSort={onSort} />
              <HCell>Category</HCell>
              <SortHeader label="Price" field="price" sort={sortField} dir={sortDir} onSort={onSort} right />
              <HCell>Stock</HCell>
              <HCell>On catalog</HCell>
              <HCell right>Actions</HCell>
            </HeadRow>
            {shown.map((p) => {
              const meta = TYPE_META[p.product_type] || TYPE_META.ITEM;
              const us = summaryOf(p);
              const state = stockState(p, us);
              const isRental = p.product_type === 'RENTAL';
              const open = expanded.has(p.product_id);
              const menuItems = [
                { label: 'Edit product', onClick: () => setDrawer({ mode: 'edit', product: p }) },
                { label: 'Purchase history', onClick: () => setHistoryProduct(p) },
                ...(p.system_key ? [] : [{ label: 'Duplicate', onClick: () => handleDuplicate(p) }]),
                // A system product (Transport Charges) is used by the quotation builders: it cannot be deactivated.
                ...(p.system_key ? [] : [p.is_available
                  ? { label: 'Deactivate', danger: true, onClick: () => handleDeactivate(p) }
                  : { label: 'Reactivate', onClick: () => reactivate(p) }]),
                ...(!p.system_key && canDeleteProduct ? [{ label: 'Delete permanently', danger: true, onClick: () => handleDelete(p) }] : []),
              ];
              return (
                <React.Fragment key={p.product_id}>
                  <BodyRow cols={CAT_COLS} muted={!p.is_available}>
                    <Cell><SelectCheckbox checked={selected.has(p.product_id)} onChange={() => toggleOne(p.product_id)} label={`Select ${p.name}`} /></Cell>
                    <Cell>
                      <div className="flex items-center gap-3">
                        <ProductTile p={p} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{p.name}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {meta.label}
                            {p.system_key && <StatusChip tone="blue" className="!py-px">System product</StatusChip>}
                            {!p.is_available && <StatusChip tone="slate" className="!py-px">Deactivated</StatusChip>}
                          </div>
                        </div>
                      </div>
                    </Cell>
                    <Cell className="truncate">{p.category_name || '—'}</Cell>
                    <Cell right>
                      <div className="font-semibold text-slate-900">{formatMoney(p.price)}</div>
                      <div className="text-xs text-slate-500">{meta.sub}</div>
                    </Cell>
                    <Cell><StockCell p={p} us={us} state={state} /></Cell>
                    <Cell>
                      <Toggle
                        checked={isPublic(p)}
                        disabled={busyIds.has(p.product_id)}
                        label={`Show ${p.name} on public catalog`}
                        onChange={(next) => toggleVisibility(p, next)}
                      />
                    </Cell>
                    <Cell right>
                      <div className="flex items-center justify-end gap-1.5">
                        {isRental ? (
                          <button type="button" aria-expanded={open} onClick={() => toggleExpanded(p.product_id)} className={btn('secondary', 'sm')}>
                            Units <ChevronDown className={`h-3 w-3 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
                          </button>
                        ) : (
                          <button type="button" onClick={() => setDrawer({ mode: 'edit', product: p })} className={btn('secondary', 'sm')}>Edit</button>
                        )}
                        <RowMenu label={`More actions for ${p.name}`} items={menuItems} />
                      </div>
                    </Cell>
                  </BodyRow>
                  {isRental && open && (
                    <ExpandRow>
                      <UnitsPanel product={p} units={unitsOf(p)} us={us} onChanged={fetchAll} />
                    </ExpandRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableShell>
        )}
        <div className="border-t border-slate-200 px-4 py-3 text-[13px] text-slate-500">
          {shown.length} product{shown.length === 1 ? '' : 's'}{selected.size > 0 ? ` · ${selected.size} selected` : ''}
        </div>
      </div>

      {drawer && (
        <ProductDrawer
          key={`${drawer.mode}-${drawer.product?.product_id || 'new'}`}
          mode={drawer.mode}
          product={drawer.product}
          categories={categories}
          vendors={vendors}
          onClose={() => setDrawer(null)}
          onSaved={async ({ addAnother, name, created, visibilityFailed }) => {
            await fetchAll();
            toast(`"${name}" ${created ? 'created' : 'saved'}.${visibilityFailed ? ' Its catalog visibility could not be updated.' : ''}`);
            if (!addAnother) setDrawer(null);
          }}
        />
      )}

      {historyProduct && <ProductPurchaseHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />}

      {categoryModal && (
        <ChangeCategoryModal count={selected.size} categories={categories} onClose={() => setCategoryModal(false)} onApply={bulkChangeCategory} />
      )}
    </>
  );
}

function ChangeCategoryModal({ count, categories, onClose, onApply }) {
  const [categoryId, setCategoryId] = useState('');
  return (
    <Modal
      title="Change category"
      subtitle={`Applies to ${count} selected product${count === 1 ? '' : 's'}.`}
      onClose={onClose}
      onSubmit={(e) => { e.preventDefault(); onApply(categoryId); }}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" className={btn('primary')}>Apply category</button>
        </>
      )}
    >
      <Field label="Category" htmlFor="bulk-category">
        <select id="bulk-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls(false)}>
          <option value="">No category</option>
          {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

// ----- Rental units -----

const UNIT_TONE = { AVAILABLE: 'green', RENTED: 'blue', MAINTENANCE: 'amber' };
const UNIT_LABEL = { AVAILABLE: 'Available', RENTED: 'Rented', MAINTENANCE: 'Maintenance' };
const UNIT_COLS = '110px 140px minmax(160px,1.2fr) 190px 170px';

function UnitsPanel({ product, units, us, onChanged }) {
  const { toast } = useUi();
  const [busyUnitId, setBusyUnitId] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'add' | 'bulk'

  const toggleMaintenance = async (u) => {
    const next = u.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
    setBusyUnitId(u.unit_id);
    setError('');
    try {
      await apiClient.updateRentalUnitStatus(u.unit_id, next);
      await onChanged();
      toast(`${u.unit_code || 'Unit'} marked ${next === 'AVAILABLE' ? 'available' : 'as in maintenance'}.`);
    } catch (err) {
      setError(err?.message || 'Failed to update unit');
    } finally {
      setBusyUnitId('');
    }
  };

  const untilOf = (u) => (u.rental_billing_type === 'RECURRING' ? u.rental_next_invoice_date : u.rental_end_date);
  const renterOf = (u) => (u.rented_to_client_name
    ? <ClientLink id={u.rented_to_client_id}>{u.rented_to_client_name}</ClientLink>
    : (u.rented_to_walk_in_name || '—'));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[13px] text-slate-900">Units · {us.free} available, {us.rented} rented, {us.maint} in maintenance</b>
        <span className="flex gap-2">
          <button type="button" onClick={() => setModal('add')} className={btn('secondary', 'sm')}>Add unit</button>
          <button type="button" onClick={() => setModal('bulk')} className={btn('secondary', 'sm')}>Bulk add units</button>
        </span>
      </div>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {units.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">No units yet — add one above.</p>
        ) : (
          <TableShell minWidth={720}>
            <HeadRow cols={UNIT_COLS}>
              <HCell>Unit</HCell><HCell>Status</HCell><HCell>Rented by</HCell><HCell>Until</HCell><HCell right>Action</HCell>
            </HeadRow>
            {units.map((u) => (
              <div key={u.unit_id} role="row" className="grid min-h-12 items-center gap-x-3 border-b border-slate-100 px-4 py-1.5 text-sm text-slate-700 last:border-b-0" style={{ gridTemplateColumns: UNIT_COLS }}>
                <Cell>
                  <div className="font-mono text-[13px] font-semibold text-slate-900">{u.unit_code || u.unit_id.slice(0, 8)}</div>
                  {u.notes && <div className="truncate text-xs text-slate-500" title={u.notes}>{u.notes}</div>}
                </Cell>
                <Cell><StatusChip tone={UNIT_TONE[u.status] || 'slate'}>{UNIT_LABEL[u.status] || u.status}</StatusChip></Cell>
                <Cell>{u.status === 'RENTED' ? renterOf(u) : '—'}</Cell>
                <Cell>
                  {u.status === 'RENTED' ? <>{formatDate(untilOf(u))}<DaysRemainingBadge date={untilOf(u)} /></> : '—'}
                </Cell>
                <Cell right>
                  {u.status !== 'RENTED' && (
                    <button type="button" disabled={busyUnitId === u.unit_id} onClick={() => toggleMaintenance(u)} className={btn('secondary', 'sm')}>
                      {busyUnitId === u.unit_id && <Loader2 className="h-3 w-3 animate-spin" />}
                      {u.status === 'MAINTENANCE' ? 'Mark available' : 'Send to maintenance'}
                    </button>
                  )}
                </Cell>
              </div>
            ))}
          </TableShell>
        )}
      </div>
      {modal === 'add' && (
        <AddUnitModal product={product} onClose={() => setModal(null)} onAdded={async () => { setModal(null); await onChanged(); toast('Unit added.'); }} />
      )}
      {modal === 'bulk' && (
        <BulkAddUnitsModal
          product={product}
          existingCodes={units.map((u) => (u.unit_code || '').toLowerCase())}
          onClose={() => setModal(null)}
          onDone={async (msg) => { setModal(null); await onChanged(); toast(msg); }}
        />
      )}
    </div>
  );
}

function AddUnitModal({ product, onClose, onAdded }) {
  const [unitCode, setUnitCode] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await apiClient.createRentalUnit({ product_id: product.product_id, unit_code: unitCode.trim() || undefined, notes: notes.trim() || undefined });
      await onAdded();
    } catch (err) {
      setError(err?.message || 'Failed to add unit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add unit"
      subtitle={product.name}
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" disabled={saving} className={btn('primary')}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Add unit</button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <Field label="Unit code (optional)" htmlFor="unit-code" hint="Leave blank to generate one automatically.">
        <input id="unit-code" type="text" placeholder="e.g. BED-002" value={unitCode} onChange={(e) => setUnitCode(e.target.value)} className={inputCls(false)} />
      </Field>
      <Field label="Notes" htmlFor="unit-notes">
        <input id="unit-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls(false)} />
      </Field>
    </Modal>
  );
}

function BulkAddUnitsModal({ product, existingCodes, onClose, onDone }) {
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState('5');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const f = parseInt(from, 10);
  const t = parseInt(to, 10);
  const valid = Number.isInteger(f) && Number.isInteger(t) && f >= 0 && t >= f && t - f + 1 <= 50;
  const pad = Math.max(3, String(Number.isInteger(t) ? t : 0).length);
  const codes = valid ? Array.from({ length: t - f + 1 }, (_, i) => `${prefix}${String(f + i).padStart(pad, '0')}`) : [];
  const clashes = codes.filter((c) => existingCodes.includes(c.toLowerCase()));
  const rangeError = !valid ? 'Enter a range of 1 to 50 units (the "to" number must be at least the "from" number).' : '';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!valid) { setError(rangeError); return; }
    if (clashes.length) { setError(`These codes already exist: ${clashes.slice(0, 5).join(', ')}${clashes.length > 5 ? '…' : ''}`); return; }
    let failed = 0;
    for (let i = 0; i < codes.length; i += 1) {
      setProgress({ done: i, total: codes.length });
      try { await apiClient.createRentalUnit({ product_id: product.product_id, unit_code: codes[i] }); } catch { failed += 1; }
    }
    setProgress(null);
    if (failed === codes.length) { setError('No units could be added. Check the codes and try again.'); return; }
    onDone(failed ? `Added ${codes.length - failed} of ${codes.length} units. ${failed} failed.` : `Added ${codes.length} units.`);
  };

  return (
    <Modal
      title="Bulk add units"
      subtitle={product.name}
      onClose={progress ? () => {} : onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" disabled={!!progress} onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" disabled={!!progress || !valid} className={btn('primary')}>
            {progress && <Loader2 className="h-4 w-4 animate-spin" />}
            {progress ? `Adding ${progress.done + 1} of ${progress.total}…` : `Add ${codes.length || ''} units`.replace('  ', ' ')}
          </button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Prefix" htmlFor="bulk-prefix"><input id="bulk-prefix" type="text" placeholder="B-" value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputCls(false)} /></Field>
        <Field label="From" htmlFor="bulk-from"><input id="bulk-from" type="number" min="0" value={from} onChange={(e) => setFrom(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(!valid)} /></Field>
        <Field label="To" htmlFor="bulk-to"><input id="bulk-to" type="number" min="0" value={to} onChange={(e) => setTo(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(!valid)} /></Field>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700" aria-live="polite">
        {valid
          ? <>Adds <b>{codes.length}</b> unit{codes.length === 1 ? '' : 's'} as Available · <span className="font-mono font-semibold">{codes[0]}</span>{codes.length > 1 && <> to <span className="font-mono font-semibold">{codes[codes.length - 1]}</span></>}</>
          : <span className="text-red-700">{rangeError}</span>}
      </div>
    </Modal>
  );
}

// ----- Purchase history -----

// Every quotation line item that referenced this product, plus the invoice
// generated for that quote and its payment status.
function ProductPurchaseHistoryModal({ product, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.getProductPurchaseHistory(product.product_id);
        if (!cancelled) setRows(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load purchase history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [product.product_id, reloadKey]);

  const cols = '110px minmax(150px,1.3fr) 130px 60px 130px minmax(150px,1fr)';
  const invoiceTone = (s) => (s === 'PAID' ? 'green' : s === 'OVERDUE' ? 'red' : s === 'CANCELLED' ? 'slate' : 'amber');

  return (
    <Modal title={`Purchase history — ${product.name}`} subtitle="Every quotation that included this product." onClose={onClose} width={760}
      footer={<button type="button" onClick={onClose} className={btn('secondary')}>Close</button>}>
      <ErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      {loading ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 && !error ? (
        <EmptyState title="No purchases of this product yet" />
      ) : rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <TableShell minWidth={720}>
            <HeadRow cols={cols}>
              <HCell>Date</HCell><HCell>Buyer</HCell><HCell>Quote</HCell><HCell right>Qty</HCell><HCell right>Amount</HCell><HCell>Invoice</HCell>
            </HeadRow>
            {rows.map((r) => (
              <BodyRow key={r.line_item_id} cols={cols}>
                <Cell className="text-[13px] text-slate-500">{formatDate(r.quoted_at)}</Cell>
                <Cell>
                  {r.client_name ? <ClientLink id={r.client_id}>{r.client_name}</ClientLink> : (r.walk_in_name || '—')}
                  {r.walk_in_name && !r.client_name && <div className="text-xs font-semibold text-amber-700">Walk-in</div>}
                </Cell>
                <Cell className="font-mono text-[13px] font-semibold">{r.estimate_number}</Cell>
                <Cell right>{r.quantity}</Cell>
                <Cell right className="font-semibold text-slate-900">{formatMoney(r.amount)}</Cell>
                <Cell>
                  {r.invoice_status ? (
                    <>
                      <StatusChip tone={invoiceTone(r.invoice_status)}>{r.invoice_status.charAt(0) + r.invoice_status.slice(1).toLowerCase()}</StatusChip>
                      <div className="mt-0.5 font-mono text-xs text-slate-500">{r.invoice_code || '—'}{r.paid_at ? ` · paid ${formatDate(r.paid_at)}` : ''}</div>
                    </>
                  ) : <span className="text-xs text-slate-500">Not invoiced</span>}
                </Cell>
              </BodyRow>
            ))}
          </TableShell>
        </div>
      )}
    </Modal>
  );
}

// ----- Category picker + product drawer -----

const CATEGORY_PAGE_SIZE = 6;

// Paginated, searchable list of existing categories plus an inline "add new" row.
function CategoryPicker({ categories, value, onChange, onCreated }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / CATEGORY_PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * CATEGORY_PAGE_SIZE, page * CATEGORY_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  const selected = categories.find((c) => String(c.category_id) === String(value));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiClient.createProductCategory({ name: newName.trim() });
      onCreated(res.data);
      onChange(res.data.category_id);
      setNewName('');
      setAddingNew(false);
    } catch (err) {
      setCreateError(err?.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const optionCls = (on) => `flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${on ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`;

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Category</span>
      {selected && (
        <div className="mb-2 flex w-fit items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          <Tag className="h-3 w-3" /> {selected.name}
          <button type="button" aria-label="Clear category" onClick={() => onChange('')} className="ml-1 rounded text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            aria-label="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full py-1 text-[13px] text-slate-700 placeholder-slate-500 outline-none"
          />
        </div>
        <div className="divide-y divide-slate-100">
          <button type="button" onClick={() => onChange('')} className={optionCls(!value)}>None</button>
          {pageItems.length === 0 ? (
            <p className="px-3 py-3 text-center text-[13px] text-slate-500">No categories found.</p>
          ) : pageItems.map((c) => (
            <button key={c.category_id} type="button" onClick={() => onChange(c.category_id)} className={optionCls(String(value) === String(c.category_id))}>
              {c.name}
              {String(value) === String(c.category_id) && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
            <button type="button" aria-label="Previous categories" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" aria-label="Next categories" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        <div className="border-t border-slate-100 px-3 py-2">
          {addingNew ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  aria-label="New category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                  placeholder="New category name"
                  className={inputCls(false)}
                />
                <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()} className={btn('primary', 'sm')}>{creating ? '…' : 'Add'}</button>
                <button type="button" aria-label="Cancel new category" onClick={() => { setAddingNew(false); setNewName(''); setCreateError(''); }} className={iconBtn}><X className="h-4 w-4" /></button>
              </div>
              {createError && <p role="alert" className="text-xs text-red-700">{createError}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setAddingNew(true)} className="rounded text-[13px] font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              + Add new category
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const blankProductForm = () => ({
  name: '', product_type: 'ITEM', category_id: '', description: '', price: '', cost_price: '', stock_quantity: 0, vendor_id: '',
});
const formFromProduct = (p) => (p ? {
  name: p.name || '',
  product_type: p.product_type || 'ITEM',
  category_id: p.category_id || '',
  description: p.description || '',
  price: p.price || '',
  cost_price: p.cost_price ?? '',
  stock_quantity: p.stock_quantity ?? 0,
  vendor_id: p.vendor_id || '',
} : blankProductForm());

const TYPE_HELP = {
  ITEM: 'Sold per unit with a tracked stock quantity.',
  RENTAL: 'Rented out by the month. Availability comes from its units.',
  ONE_TIME_SERVICE: 'Charged per visit or shift. Stock is not tracked.',
};

function ProductDrawer({ mode, product, categories, vendors, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const isSystem = !!product?.system_key && mode === 'edit';
  const baselinePublic = isEdit ? product?.is_public !== false : true;
  const [form, setForm] = useState(() => formFromProduct(product));
  const [isPublicOn, setIsPublicOn] = useState(() => (product ? product.is_public !== false : true));
  const [localCategories, setLocalCategories] = useState(categories);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image_url || '');
  const [imageToCrop, setImageToCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const baseline = useRef({ form: JSON.stringify(formFromProduct(product)), pub: product ? product.is_public !== false : true, image: product?.image_url || '' });

  const dirty = JSON.stringify(form) !== baseline.current.form || isPublicOn !== baseline.current.pub || imagePreview !== baseline.current.image;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleImageSelect = (file) => { if (file) setImageToCrop(file); };
  const handleImageCropComplete = (croppedFile) => {
    setImageToCrop(null);
    setImageFile(croppedFile);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(croppedFile);
  };

  const priceN = parseFloat(form.price);
  const costN = parseFloat(form.cost_price);
  const showMargin = !Number.isNaN(priceN) && !Number.isNaN(costN) && form.cost_price !== '';
  const margin = priceN - costN;
  const marginPct = priceN > 0 ? Math.round((margin / priceN) * 100) : 0;

  const resetForNext = () => {
    const blank = { ...blankProductForm(), product_type: form.product_type };
    setForm(blank);
    setIsPublicOn(true);
    setImageFile(null);
    setImagePreview('');
    setErrors({});
    baseline.current = { form: JSON.stringify(blank), pub: true, image: '' };
  };

  const submit = async (addAnother) => {
    setServerError('');
    const errs = {};
    if (!form.name) errs.name = 'Enter a product name.';
    if (!form.price) errs.price = 'Enter a price.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payload = { ...form, category_id: form.category_id || '' };
      let id = product?.product_id;
      if (isEdit) {
        await apiClient.updateProduct(product.product_id, { ...payload, is_available: product.is_available }, imageFile);
      } else {
        const res = await apiClient.createProduct(payload, imageFile);
        id = res?.data?.product_id || res?.product_id;
      }
      let visibilityFailed = false;
      if (isPublicOn !== baselinePublic) {
        try {
          if (!id) throw new Error('missing id');
          await apiClient.setProductsVisibility([id], isPublicOn);
        } catch {
          visibilityFailed = true;
        }
      }
      await onSaved({ addAnother, name: form.name, created: !isEdit, visibilityFailed });
      if (addAnother) resetForNext();
    } catch (err) {
      setServerError(err?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        title={isEdit ? 'Edit product' : mode === 'duplicate' ? 'Duplicate product' : 'New product'}
        subtitle={isEdit ? 'Update this product in your catalog.' : 'Add a product, rental or service to your catalog.'}
        dirty={dirty}
        onClose={onClose}
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
        footer={(
          <>
            <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
            <span className="flex-1" />
            {!isEdit && <button type="button" disabled={saving} onClick={() => submit(true)} className={btn('secondary')}>Save and add another</button>}
            <button type="submit" disabled={saving} className={btn('primary')}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create product'}
            </button>
          </>
        )}
      >
        <ErrorBanner message={serverError} />

        {isSystem && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
            This is a system product used by the quotation builders (transport). Its name, type and availability are fixed and it has no stock. You can change its default price, cost and description; the price is also set on each quotation.
          </p>
        )}

        {!isSystem && (
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Type</span>
            <Segmented
              ariaLabel="Product type"
              value={form.product_type}
              onChange={(v) => set({ product_type: v })}
              options={[{ value: 'ITEM', label: 'Item' }, { value: 'RENTAL', label: 'Rental' }, { value: 'ONE_TIME_SERVICE', label: 'Service' }]}
            />
            <p className="mt-1.5 text-xs text-slate-500">{TYPE_HELP[form.product_type]}</p>
          </div>
        )}

        <Field label="Name *" htmlFor="pd-name" error={errors.name}>
          <input id="pd-name" type="text" value={form.name} disabled={isSystem} onChange={(e) => set({ name: e.target.value })} className={inputCls(!!errors.name)} />
        </Field>

        <CategoryPicker
          categories={localCategories}
          value={form.category_id}
          onChange={(id) => set({ category_id: id })}
          onCreated={(cat) => setLocalCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={form.product_type === 'RENTAL' ? 'Rate per month (LKR) *' : 'Price (LKR) *'} htmlFor="pd-price" error={errors.price}>
            <input id="pd-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(!!errors.price)} />
          </Field>
          <Field label="Cost price (LKR)" htmlFor="pd-cost" hint="Used for the Profit & Loss report's COGS.">
            <input id="pd-cost" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => set({ cost_price: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
          </Field>
        </div>
        {showMargin && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
            <span className="text-slate-500">Estimated margin</span>
            <b className={`tabular-nums ${margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(margin)} ({marginPct}%)</b>
          </div>
        )}

        {form.product_type === 'ITEM' && !isSystem && (
          <Field label="Stock quantity" htmlFor="pd-stock" className="max-w-[200px]">
            <input id="pd-stock" type="number" value={form.stock_quantity} onChange={(e) => set({ stock_quantity: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
          </Field>
        )}

        {!isSystem && <Field label="Vendor" htmlFor="pd-vendor" hint="If this is sourced from an outside vendor, selecting it lets you record what's owed to them when it's sold or rented.">
          <select id="pd-vendor" value={form.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })} className={inputCls(false)}>
            <option value="">In-house stock (no vendor)</option>
            {vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
          </select>
        </Field>}

        <Field label="Description" htmlFor="pd-desc">
          <textarea id="pd-desc" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={textareaCls(false)} />
        </Field>

        <div>
          <span className="mb-1 block text-[13px] font-semibold text-slate-700">Image</span>
          <p className="mb-2 text-xs text-slate-500">Crop to match how it appears on the public catalog card.</p>
          {imagePreview ? (
            <div className="flex items-center gap-4">
              <img src={imagePreview} alt="Product preview" className="h-24 rounded-lg border border-slate-200 object-cover" style={{ aspectRatio: CATALOG_CARD_IMAGE_ASPECT }} />
              <div className="flex flex-col gap-2">
                <input type="file" id="product-image-change" className="sr-only" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
                <label htmlFor="product-image-change" className={`${btn('secondary', 'sm')} cursor-pointer`}><Upload className="h-3.5 w-3.5" /> Change</label>
                <button type="button" onClick={() => { setImagePreview(''); setImageFile(null); }} className={btn('danger', 'sm')}>Remove</button>
              </div>
            </div>
          ) : (
            <div>
              <input type="file" id="product-image-upload" className="sr-only" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
              <label htmlFor="product-image-upload" className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-500">
                <Upload className="mb-1 h-5 w-5" />
                <span className="text-[13px] font-semibold">Click to upload</span>
                <span className="text-xs text-slate-500">JPG or PNG</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3.5 py-3">
          <div>
            <b className="text-sm text-slate-900">Show on public catalog</b>
            <p className="text-xs text-slate-500">Customers can see this product on the website.</p>
          </div>
          <Toggle checked={isPublicOn} onChange={setIsPublicOn} label="Show on public catalog" />
        </div>
      </Drawer>

      {imageToCrop && (
        <div className="fixed inset-0 z-[60]">
          <ImageCropModal
            imageFile={imageToCrop}
            aspect={CATALOG_CARD_IMAGE_ASPECT}
            onCancel={() => setImageToCrop(null)}
            onCropComplete={handleImageCropComplete}
          />
        </div>
      )}
    </>
  );
}

// ==================== QUOTES & INVOICES TAB ====================

const QUOTE_PAGE_SIZE = 12;
const QUO_COLS = '90px 150px minmax(190px,1.6fr) 140px 190px 210px 36px';

const invoiceTone = (s) => (s === 'PAID' ? 'green' : s === 'OVERDUE' ? 'red' : s === 'CANCELLED' ? 'slate' : 'amber');
// PENDING is what the database calls an invoice nobody has paid yet; everywhere else it reads Unpaid.
const invoiceLabel = (s) => (s === 'PAID' ? 'Paid' : s === 'OVERDUE' ? 'Overdue' : s === 'CANCELLED' ? 'Cancelled' : 'Unpaid');

function Step({ done, children, sub }) {
  return (
    <div className={`flex items-center gap-2.5 text-[13px] ${done ? 'text-slate-800' : 'text-slate-500'}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${done ? 'bg-emerald-500' : 'border-2 border-slate-300 bg-white'}`} />
      <span>{children}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
      <span className="sr-only">{done ? '(done)' : '(not yet)'}</span>
    </div>
  );
}

function useBankAccounts() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await apiClient.getBankAccounts();
      setError('');
      setBankAccounts(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load bank accounts.');
    }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  return { bankAccounts, error, reload: load };
}

function BankAccountSelect({ id, value, onChange, accounts, invalid }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls(invalid)}>
      <option value="">Select a bank account…</option>
      {accounts.map((b) => <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>)}
    </select>
  );
}

function QuotesTab({ createTick, onCount }) {
  const navigate = useNavigate();
  const { toast, confirm } = useUi();
  const [sp, update] = useUrlParams();
  const statusTab = ['pending', 'awaiting_payment', 'paid'].includes(sp.get('status')) ? sp.get('status') : 'all';
  const search = sp.get('search') || '';

  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [quoteDrawerOpen, setQuoteDrawerOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [previewQuote, setPreviewQuote] = useState(null);
  const [busyQuoteId, setBusyQuoteId] = useState('');
  const [sendingQuoteId, setSendingQuoteId] = useState('');
  const [downloadingQuoteId, setDownloadingQuoteId] = useState('');
  const [sentIds, setSentIds] = useState(() => new Set());
  const [expandedQuoteId, setExpandedQuoteId] = useState(null);
  const [vendorPromptQuote, setVendorPromptQuote] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [qRes, prodInvRes, rentalOneTimeRes, rentalRecurringRes] = await Promise.all([
        apiClient.getProductQuotes(),
        apiClient.getProductInvoices({ category: 'PRODUCT' }),
        apiClient.getProductInvoices({ category: 'RENTAL_ONE_TIME' }),
        apiClient.getProductInvoices({ category: 'RENTAL_RECURRING' }),
      ]);
      // A companion quote of a rejected service quotation was never going to be sold: keep it off this page.
      setQuotes((Array.isArray(qRes?.data) ? qRes.data : []).filter((q) => !(q.linked_quote_id && q.service_status === 'REJECTED')));
      setInvoices([
        ...(Array.isArray(prodInvRes?.data) ? prodInvRes.data : []),
        ...(Array.isArray(rentalOneTimeRes?.data) ? rentalOneTimeRes.data : []),
        ...(Array.isArray(rentalRecurringRes?.data) ? rentalRecurringRes.data : []),
      ]);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load quotations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  // Edit an invoice's amount or cancel an unpaid one (same dialogs as the client's Invoices tab).
  const { hasPermission: can } = useAdminAuth();
  const [openInvoiceEdit, invoiceEditModal] = useInvoiceAmountEditor({ clientId: null, onSaved: fetchAll });
  useEffect(() => { if (!loading && !loadError) onCount('quotes', quotes.length); }, [loading, loadError, quotes.length, onCount]);

  const openCreate = useCallback(() => setQuoteDrawerOpen(true), []);
  useCreateSignal(createTick, openCreate);

  // A quote with several rental items (each getting its own agreement) plus
  // maybe a combined invoice for any non-rental items can spawn more than one
  // invoice on acceptance. Show all of them, oldest first.
  const invoicesForQuote = (quoteId) =>
    invoices.filter((i) => i.quote_id === quoteId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // The status of each sale (Pending acceptance, Partly invoiced, Unpaid, Part paid, Paid, Rejected) and
  // its amounts are worked out on the server, so this page and the client page always agree.
  const enrichedQuotes = quotes.map((q) => {
    const quoteInvoices = invoicesForQuote(q.quote_id);
    return { quote: q, quoteInvoices, bucket: SALE_BUCKET[q.sale_status] || 'pending' };
  });

  const tabCounts = enrichedQuotes.reduce(
    (acc, { bucket }) => ({ ...acc, all: acc.all + 1, ...(acc[bucket] !== undefined ? { [bucket]: acc[bucket] + 1 } : {}) }),
    { all: 0, pending: 0, awaiting_payment: 0, paid: 0 },
  );

  // Money still owing is what is invoiced less what is paid (part payments count), and what is
  // collected is what has actually been paid. A rejected sale carries no invoices, so adds nothing.
  const outstandingTotal = quotes.reduce((sum, q) => sum + (Number(q.amount_owing) || 0), 0);
  const collectedTotal = quotes.reduce((sum, q) => sum + (Number(q.paid_total) || 0), 0);

  const recipientName = (q) => q.client_name || q.walk_in_name || '—';

  const filtered = enrichedQuotes.filter(({ quote: q, quoteInvoices, bucket }) => {
    if (statusTab !== 'all' && bucket !== statusTab) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      (q.estimate_number || '').toLowerCase().includes(query)
      || recipientName(q).toLowerCase().includes(query)
      || quoteInvoices.some((i) => (i.invoice_code || '').toLowerCase().includes(query))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / QUOTE_PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(sp.get('page') || '1', 10) || 1), totalPages);
  const pageItems = filtered.slice((page - 1) * QUOTE_PAGE_SIZE, page * QUOTE_PAGE_SIZE);
  const hasFilters = statusTab !== 'all' || !!search;

  const handleAccept = async (quote) => {
    setError('');
    setBusyQuoteId(quote.quote_id);
    let data;
    try {
      const full = await apiClient.getProductQuote(quote.quote_id);
      data = full?.data || full;
    } catch (err) {
      setError(err?.message || 'Failed to load quotation details');
      setBusyQuoteId('');
      return;
    }
    const lineItems = data?.line_items || [];
    // Vendor-linked line items need a pay-now-or-leave-unpaid decision first.
    if (lineItems.some((li) => li.vendor_id)) {
      setVendorPromptQuote(data);
      setBusyQuoteId('');
      return;
    }
    setBusyQuoteId('');

    // One invoice for every product line still waiting for one, plus an agreement and invoice for
    // each rental. Lines already invoiced on their own are left as they are.
    const waiting = lineItems.filter((li) => li.billed === false);
    const rentals = waiting.filter((li) => li.rental_billing_type).length;
    const otherLines = waiting.filter((li) => !li.rental_billing_type && ['PRODUCT', 'DEPOSIT'].includes(li.item_type)).length;
    const invoiceCount = rentals + otherLines;
    const grand = Number(quote.total_amount || 0) + Number(quote.total_deposit_amount || 0);
    const summary = invoiceCount > 0
      ? `This will create ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}${rentals ? ` and ${rentals} rental agreement${rentals === 1 ? '' : 's'}` : ''} for ${recipientName(quote)}, totalling ${formatMoney(grand)}.`
      : `This will invoice ${recipientName(quote)} for ${formatMoney(grand)}.`;
    const ok = await confirm({
      title: `Accept quotation ${quote.estimate_number}?`,
      body: summary,
      confirmLabel: rentals ? 'Accept and create rental' : 'Accept and invoice',
      tone: 'success',
    });
    if (!ok) return;

    setBusyQuoteId(quote.quote_id);
    try {
      await apiClient.acceptProductQuote(quote.quote_id);
      await fetchAll();
      toast(`Quotation ${quote.estimate_number} accepted.`);
    } catch (err) {
      setError(err?.message || 'Failed to accept quotation');
    } finally {
      setBusyQuoteId('');
    }
  };

  const handleAcceptWithVendorPayments = async (quote, vendorPayments) => {
    setBusyQuoteId(quote.quote_id);
    setError('');
    try {
      await apiClient.acceptProductQuote(quote.quote_id, { vendor_payments: vendorPayments });
      setVendorPromptQuote(null);
      await fetchAll();
      toast(`Quotation ${quote.estimate_number} accepted.`);
    } catch (err) {
      setError(err?.message || 'Failed to accept quotation');
    } finally {
      setBusyQuoteId('');
    }
  };

  const handleSend = async (quote) => {
    setSendingQuoteId(quote.quote_id);
    setError('');
    try {
      const res = await apiClient.sendProductQuotePDF(quote.quote_id);
      setSentIds((s) => new Set(s).add(quote.quote_id));
      await fetchAll();
      toast('Quotation sent via WhatsApp.', res?.pdf_link ? { link: { label: 'View PDF', href: res.pdf_link } } : {});
    } catch (err) {
      setError(err?.message || 'Failed to send quotation');
    } finally {
      setSendingQuoteId('');
    }
  };

  const handleDownload = async (quote) => {
    setDownloadingQuoteId(quote.quote_id);
    setError('');
    try {
      const res = await apiClient.generateProductQuotePdf(quote.quote_id);
      if (res?.pdf_url) window.open(res.pdf_url, '_blank', 'noopener');
    } catch (err) {
      setError(err?.message || 'Failed to generate quotation PDF');
    } finally {
      setDownloadingQuoteId('');
    }
  };

  const exportCsv = () => downloadCsv(
    'quotations.csv',
    ['Date', 'Quote #', 'Recipient', 'Total', 'Deposit', 'Status', 'Invoices'],
    filtered.map(({ quote: q, quoteInvoices, bucket }) => [
      formatDate(q.created_at), q.estimate_number, recipientName(q), q.total_amount, q.total_deposit_amount || 0,
      bucket === 'pending' ? 'Pending acceptance' : bucket === 'paid' ? 'Paid' : 'Awaiting payment',
      quoteInvoices.map((i) => i.invoice_code).join(' '),
    ]),
  );

  const setStatus = (v) => update({ status: v === 'all' ? '' : v, page: '' });

  return (
    <>
      <ErrorBanner message={loadError} onRetry={fetchAll} />
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      {invoiceEditModal}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Kpi label="Total quotes" value={quotes.length} sub="All time" active={statusTab === 'all'} onClick={() => setStatus('all')} />
        <Kpi label="Pending acceptance" value={tabCounts.pending} sub="Waiting for the client" active={statusTab === 'pending'} onClick={() => setStatus('pending')} />
        <Kpi label="Awaiting payment" value={formatMoney(outstandingTotal)} tone="amber" sub={`${tabCounts.awaiting_payment} quote${tabCounts.awaiting_payment === 1 ? '' : 's'}`} active={statusTab === 'awaiting_payment'} onClick={() => setStatus('awaiting_payment')} />
        <Kpi label="Collected" value={formatMoney(collectedTotal)} tone="green" sub={`${tabCounts.paid} fully paid`} active={statusTab === 'paid'} onClick={() => setStatus('paid')} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox value={search} onChange={(v) => update({ search: v, page: '' })} placeholder="Search quote #, recipient or invoice code…" />
        <Segmented
          ariaLabel="Quote status"
          value={statusTab}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All', count: tabCounts.all },
            { value: 'pending', label: 'Pending', count: tabCounts.pending },
            { value: 'awaiting_payment', label: 'Awaiting payment', count: tabCounts.awaiting_payment },
            { value: 'paid', label: 'Paid', count: tabCounts.paid },
          ]}
        />
        <span className="flex-1" />
        <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className={btn('secondary')}>
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && quotes.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : filtered.length === 0 && !loadError ? (
          <EmptyState
            title={quotes.length === 0 ? 'No product quotations yet' : 'No quotes match your filters'}
            body={quotes.length === 0 ? 'Use New quotation above to create the first one.' : undefined}
            action={hasFilters && quotes.length > 0 ? <button type="button" onClick={() => update({ status: '', search: '', page: '' })} className={btn('secondary')}>Clear filters</button> : null}
          />
        ) : (
          <TableShell minWidth={1020}>
            <HeadRow cols={QUO_COLS}>
              <HCell>Date</HCell><HCell>Quote #</HCell><HCell>Recipient</HCell><HCell right>Total</HCell><HCell>Status</HCell><HCell right>Next step</HCell><HCell><span className="sr-only">Details</span></HCell>
            </HeadRow>
            {pageItems.map(({ quote: q, quoteInvoices, bucket }) => {
              const rentalItemCount = Number(q.rental_item_count) || 0;
              const isRentalQuote = rentalItemCount > 0;
              const isExpanded = expandedQuoteId === q.quote_id;
              const firstUnpaid = quoteInvoices.find((i) => i.status !== 'PAID');
              const unpaidCount = quoteInvoices.filter((i) => i.status !== 'PAID').length;
              const busy = busyQuoteId === q.quote_id;
              return (
                <React.Fragment key={q.quote_id}>
                  <BodyRow cols={QUO_COLS}>
                    <Cell className="text-[13px] text-slate-500">{formatDate(q.created_at)}</Cell>
                    <Cell>
                      <div className="font-mono text-[13px] font-semibold text-slate-900">{q.estimate_number}</div>
                      <div className="text-xs text-slate-500">
                        {q.linked_quote_id ? '+ Service request' : 'Product only'}
                        {q.sale_booking_code && <span className="ml-1.5 font-semibold text-blue-700">· {q.sale_booking_code}</span>}
                      </div>
                    </Cell>
                    <Cell>
                      <div className="truncate font-semibold text-slate-900">
                        {q.client_name ? <ClientLink id={q.client_id}>{q.client_name}</ClientLink> : recipientName(q)}
                      </div>
                      {(q.walk_in_name || isRentalQuote) && (
                        <div className="text-xs text-slate-500">
                          {q.walk_in_name && <span className="font-semibold text-amber-700">Walk-in</span>}
                          {q.walk_in_name && isRentalQuote && ' · '}
                          {isRentalQuote && <span className="font-semibold text-blue-700">{rentalItemCount} rental item{rentalItemCount === 1 ? '' : 's'}</span>}
                        </div>
                      )}
                    </Cell>
                    <Cell right>
                      <div className="font-semibold text-slate-900">{formatMoney(q.total_amount)}</div>
                      {Number(q.total_deposit_amount) > 0 && <div className="text-xs text-slate-500">+ {formatMoney(q.total_deposit_amount)} deposit</div>}
                    </Cell>
                    <Cell>
                      <StatusChip tone={(SALE_STATUS[q.sale_status] || SALE_STATUS.PENDING_ACCEPTANCE).tone}>
                        {(SALE_STATUS[q.sale_status] || SALE_STATUS.PENDING_ACCEPTANCE).label}
                        {(q.sale_status === 'UNPAID' || q.sale_status === 'PART_PAID') && quoteInvoices.length > 1 ? ` (${unpaidCount}/${quoteInvoices.length})` : ''}
                      </StatusChip>
                      {Number(q.amount_owing) > 0.005 && <div className="mt-0.5 text-xs text-slate-500">{formatMoney(q.amount_owing)} owing</div>}
                    </Cell>
                    <Cell right>
                      {bucket === 'pending' && q.linked_quote_id && (
                        // Products that belong to a service quotation are invoiced with it (at the first payment or
                        // when the booking is created), never from here, so this page cannot create the client's
                        // account or send them a welcome message.
                        <button type="button" onClick={() => navigate(`/admin/quotations/${q.linked_quote_id}`)} className={btn('secondary', 'sm')}>
                          Part of {q.linked_estimate_number || 'service quotation'} <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                      {bucket === 'pending' && !q.linked_quote_id && (
                        <button type="button" disabled={busy} onClick={() => handleAccept(q)} className={btn('success', 'sm')}>
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          {q.sale_status === 'PARTLY_INVOICED' ? 'Invoice remaining lines' : isRentalQuote ? 'Accept and create rental' : 'Accept and invoice'}
                        </button>
                      )}
                      {q.sale_status === 'REJECTED' && <span className="text-[13px] text-slate-500">Rejected</span>}
                      {bucket === 'awaiting_payment' && firstUnpaid && (
                        <button type="button" onClick={() => setPaymentModalInvoice(firstUnpaid)} className={btn('primary', 'sm')}>Record payment</button>
                      )}
                      {bucket === 'paid' && <span className="text-[13px] text-slate-500">Complete</span>}
                    </Cell>
                    <Cell>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${q.estimate_number}`}
                        onClick={() => setExpandedQuoteId(isExpanded ? null : q.quote_id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180 text-blue-600' : ''}`} />
                      </button>
                    </Cell>
                  </BodyRow>

                  {isExpanded && (
                    <ExpandRow>
                      <div className="flex flex-wrap gap-8">
                        <div className="min-w-[240px] flex-1 basis-[280px]">
                          <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Progress</div>
                          <div className="space-y-2">
                            <Step done sub={formatDate(q.created_at)}>Quotation created</Step>
                            <Step done={!!q.sent_at || sentIds.has(q.quote_id) || quoteInvoices.length > 0}>Sent to client</Step>
                            <Step done={bucket === 'awaiting_payment' || bucket === 'paid'}>Accepted and invoiced</Step>
                            <Step done={q.sale_status === 'PAID'}>Fully paid</Step>
                          </div>
                        </div>
                        <div className="min-w-[280px] flex-1 basis-[320px]">
                          <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Invoices</div>
                          {quoteInvoices.length === 0 ? (
                            <p className="text-[13px] text-slate-500">No invoices yet. Each product line is invoiced when the quotation is accepted.</p>
                          ) : (
                            <div className="space-y-2">
                              {quoteInvoices.map((inv) => {
                                const state = invoicePaymentState(inv.amount, inv.amount_paid, inv.status === 'PAID');
                                return (
                                  <div key={inv.invoice_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <span className="min-w-0">
                                      <span className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-[13px] text-slate-600">{inv.invoice_code}</span>
                                        <StatusChip tone={state.tone}>{state.label}</StatusChip>
                                      </span>
                                      {inv.item_summary && <span className="block truncate text-xs text-slate-500">{inv.item_summary}</span>}
                                    </span>
                                    <span className="flex items-center gap-3">
                                      <span className="text-right">
                                        <b className="block tabular-nums text-slate-900">{formatMoney(inv.amount)}</b>
                                        {!state.settled && state.due !== Number(inv.amount) && <span className="block text-xs text-slate-500">{formatMoney(state.due)} due</span>}
                                      </span>
                                      {!state.settled && can('INVOICE_EDIT_AMOUNT') && (
                                        <button type="button" aria-label={`Edit amount of ${inv.invoice_code}`} title="Edit amount" onClick={() => openInvoiceEdit({ kind: 'PRODUCT', invoiceId: inv.invoice_id, currentAmount: inv.amount, paid: Number(inv.amount_paid || 0), label: inv.item_summary || 'Invoice', code: inv.invoice_code })} className={iconBtn}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {!state.settled && can('INVOICE_CANCEL') && inv.category === 'PRODUCT' && inv.line_item_id && !(Number(inv.amount_paid) > 0.005) && (
                                        <button type="button" aria-label={`Cancel ${inv.invoice_code}`} title="Cancel this unpaid invoice" onClick={() => openInvoiceEdit({ kind: 'CANCEL', invoiceId: inv.invoice_id, currentAmount: inv.amount, label: inv.item_summary || 'Invoice', code: inv.invoice_code })} className={`${iconBtn} hover:text-red-700`}>
                                          <Ban className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {!state.settled && <button type="button" onClick={() => setPaymentModalInvoice(inv)} className={btn('primary', 'sm')}>Pay</button>}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex basis-full flex-wrap gap-2">
                          <button type="button" disabled={downloadingQuoteId === q.quote_id} onClick={() => handleDownload(q)} className={btn('secondary', 'sm')}>
                            {downloadingQuoteId === q.quote_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Download PDF
                          </button>
                          <button type="button" disabled={sendingQuoteId === q.quote_id} onClick={() => handleSend(q)} className={btn('secondary', 'sm')}>
                            {sendingQuoteId === q.quote_id && <Loader2 className="h-3 w-3 animate-spin" />}
                            {quoteInvoices.length === 0 ? 'Send via WhatsApp' : 'Resend via WhatsApp'}
                          </button>
                          {quoteInvoices.length > 0 && (
                            <button type="button" onClick={() => setPreviewQuote(q)} className={btn('secondary', 'sm')}>Preview invoice contents</button>
                          )}
                          {q.linked_quote_id && (
                            <button type="button" onClick={() => navigate(`/admin/quotations/${q.linked_quote_id}`)} className={btn('secondary', 'sm')}>
                              Open linked service quote{q.linked_estimate_number ? ` (${q.linked_estimate_number})` : ''} <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </ExpandRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableShell>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-[13px] text-slate-500">
            <span>Showing {(page - 1) * QUOTE_PAGE_SIZE + 1}–{Math.min(page * QUOTE_PAGE_SIZE, filtered.length)} of {filtered.length} quotation{filtered.length === 1 ? '' : 's'}</span>
            {totalPages > 1 && (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => update({ page: page - 1 <= 1 ? '' : page - 1 })} disabled={page <= 1} className={btn('secondary', 'sm')}>Previous</button>
                <span className="font-semibold text-slate-700">Page {page} of {totalPages}</span>
                <button type="button" onClick={() => update({ page: page + 1 })} disabled={page >= totalPages} className={btn('secondary', 'sm')}>Next</button>
              </span>
            )}
          </div>
        )}
      </div>

      {quoteDrawerOpen && (
        <NewProductQuoteDrawer
          onClose={() => setQuoteDrawerOpen(false)}
          onCreated={() => { setQuoteDrawerOpen(false); fetchAll(); toast('Quotation created.'); }}
        />
      )}

      {paymentModalInvoice && (
        <RecordInvoicePaymentModal
          invoice={paymentModalInvoice}
          onClose={() => setPaymentModalInvoice(null)}
          onRecorded={() => { setPaymentModalInvoice(null); fetchAll(); toast(`Payment recorded for ${paymentModalInvoice.invoice_code}.`); }}
        />
      )}

      {previewQuote && (
        <InvoicePreviewModal quote={previewQuote} invoices={invoicesForQuote(previewQuote.quote_id)} onClose={() => setPreviewQuote(null)} />
      )}

      {vendorPromptQuote && (
        <VendorPaymentPromptModal
          quote={vendorPromptQuote}
          submitting={busyQuoteId === vendorPromptQuote.quote_id}
          onClose={() => setVendorPromptQuote(null)}
          onConfirm={(vendorPayments) => handleAcceptWithVendorPayments(vendorPromptQuote, vendorPayments)}
        />
      )}
    </>
  );
}

// Shown when accepting a PRODUCT quote that has one or more line items backed
// by a vendor-sourced product. For each such item the admin decides whether
// to pay the vendor now or leave it as an unpaid balance owed to the vendor.
function VendorPaymentPromptModal({ quote, submitting, onClose, onConfirm }) {
  const bank = useBankAccounts();
  const vendorItems = (quote.line_items || []).filter((li) => li.vendor_id);

  const [decisions, setDecisions] = useState(() => {
    const initial = {};
    for (const li of vendorItems) {
      const defaultAmount = parseFloat(li.cost_price_snapshot ?? li.product_cost_price ?? 0) * parseFloat(li.quantity || 1);
      initial[li.line_item_id] = { pay_now: false, amount: defaultAmount || 0, payment_method: 'CASH', bank_account_id: '', cheque_number: '', cheque_date: '' };
    }
    return initial;
  });
  const [error, setError] = useState('');

  const updateDecision = (id, patch) => setDecisions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleConfirm = () => {
    setError('');
    for (const li of vendorItems) {
      const d = decisions[li.line_item_id];
      if (!d.pay_now) continue;
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && !d.bank_account_id) {
        setError(`Select a bank account for "${li.description}"`);
        return;
      }
      if (d.payment_method === 'CHEQUE' && (!d.cheque_number || !d.cheque_date)) {
        setError(`Cheque number and date are required for "${li.description}"`);
        return;
      }
    }
    onConfirm(decisions);
  };

  return (
    <Modal
      title="Vendor payment"
      subtitle="This quote includes items sourced from a vendor. Decide how to settle each one."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="button" disabled={submitting} onClick={handleConfirm} className={btn('success')}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Accept quote
          </button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <ErrorBanner message={bank.error} onRetry={bank.reload} />
      {vendorItems.map((li) => {
        const d = decisions[li.line_item_id];
        const fid = `vp-${li.line_item_id}`;
        return (
          <div key={li.line_item_id} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">{li.description}</p>
              <span className="text-xs text-slate-500">Vendor: {li.vendor_name}</span>
            </div>
            <Field label="Amount owed" htmlFor={`${fid}-amt`} className="max-w-[200px]">
              <input id={`${fid}-amt`} type="number" min="0" step="0.01" value={d.amount} onChange={(e) => updateDecision(li.line_item_id, { amount: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
            </Field>
            <Segmented
              ariaLabel={`Settlement for ${li.description}`}
              value={d.pay_now ? 'now' : 'later'}
              onChange={(v) => updateDecision(li.line_item_id, { pay_now: v === 'now' })}
              options={[{ value: 'later', label: 'Leave unpaid' }, { value: 'now', label: 'Pay now' }]}
            />
            {d.pay_now && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <Field label="Payment method" htmlFor={`${fid}-m`}>
                  <select id={`${fid}-m`} value={d.payment_method} onChange={(e) => updateDecision(li.line_item_id, { payment_method: e.target.value })} className={inputCls(false)}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </Field>
                {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && (
                  <Field label="Bank account" htmlFor={`${fid}-b`}>
                    <BankAccountSelect id={`${fid}-b`} value={d.bank_account_id} onChange={(v) => updateDecision(li.line_item_id, { bank_account_id: v })} accounts={bank.bankAccounts} />
                  </Field>
                )}
                {d.payment_method === 'CHEQUE' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Cheque number" htmlFor={`${fid}-cn`}>
                      <input id={`${fid}-cn`} type="text" value={d.cheque_number} onChange={(e) => updateDecision(li.line_item_id, { cheque_number: e.target.value })} className={inputCls(false)} />
                    </Field>
                    <Field label="Cheque date">
                      <DateInput value={d.cheque_date} onChange={(e) => updateDecision(li.line_item_id, { cheque_date: e.target.value })} className={inputCls(false)} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Modal>
  );
}

// Shows which of the quote's line items landed on each of its invoices.
// Non-rental lines (ITEM purchases + standalone deposits) all land on the one
// combined PRODUCT-category invoice. Each RENTAL line item instead gets its own
// agreement and invoice, so the agreement itself is the source of truth.
function InvoicePreviewModal({ quote, invoices, onClose }) {
  const [lineItems, setLineItems] = useState([]);
  const [rentalDetails, setRentalDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const quoteRes = await apiClient.getProductQuote(quote.quote_id);
        const items = Array.isArray(quoteRes?.data?.line_items) ? quoteRes.data.line_items : [];
        if (!cancelled) setLineItems(items);

        const rentalInvoices = invoices.filter((inv) => inv.rental_agreement_id);
        const agreementEntries = await Promise.all(
          rentalInvoices.map(async (inv) => {
            try {
              const res = await apiClient.getRentalAgreement(inv.rental_agreement_id);
              return [inv.rental_agreement_id, res?.data || null];
            } catch {
              return [inv.rental_agreement_id, null];
            }
          }),
        );
        if (!cancelled) setRentalDetails(Object.fromEntries(agreementEntries));
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load invoice items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.quote_id, reloadKey]);

  const nonRentalItems = lineItems.filter((li) => !li.rental_billing_type);

  const itemsForInvoice = (inv) => {
    if (inv.category === 'PRODUCT') return nonRentalItems;
    const agreement = rentalDetails[inv.rental_agreement_id];
    if (!agreement) return [];
    const items = [{
      description: `${agreement.product_name} — Unit ${agreement.unit_code} (${agreement.billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time'})`,
      quantity: 1,
      amount: agreement.rate,
    }];
    if (Number(agreement.deposit_amount) > 0) {
      items.push({
        description: `Refundable Deposit — ${agreement.product_name} (Unit ${agreement.unit_code})`,
        quantity: 1,
        amount: agreement.deposit_amount,
        item_type: 'DEPOSIT',
      });
    }
    return items;
  };

  return (
    <Modal
      title={`Invoice contents — ${quote.estimate_number}`}
      onClose={onClose}
      footer={<button type="button" onClick={onClose} className={btn('secondary')}>Close</button>}
    >
      <ErrorBanner message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      {loading ? (
        <SkeletonRows rows={3} />
      ) : invoices.map((inv) => {
        const items = itemsForInvoice(inv);
        return (
          <div key={inv.invoice_id} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5">
              <span className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-slate-800">{inv.invoice_code}</span>
                <StatusChip tone={invoiceTone(inv.status)}>{invoiceLabel(inv.status)}</StatusChip>
              </span>
              <b className="tabular-nums text-slate-900">{formatMoney(inv.amount)}</b>
            </div>
            <div className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-slate-500">No items resolved for this invoice.</p>
              ) : items.map((li, idx) => {
                const isDeposit = li.item_type === 'DEPOSIT' || /^refundable deposit/i.test(li.description || '');
                return (
                  <div key={idx} className="flex items-start justify-between gap-3 px-4 py-2 text-sm">
                    <span className="text-slate-700">
                      {li.description}{Number(li.quantity) > 1 ? ` × ${li.quantity}` : ''}
                      {isDeposit && <span className="block text-xs text-slate-500">Refundable deposit (held, not income)</span>}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatMoney(li.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

// ----- New quotation drawer -----

const emptyLineItem = () => ({
  description: '', quantity: 1, unit_price: '', product_id: '', unit_id: '',
  rental_billing_type: 'ONE_TIME', rental_start_date: new Date().toISOString().slice(0, 10),
  rental_end_date: '', deposit_amount: '',
});

// A standalone refundable deposit, held by the company independent of any rental item.
const emptyDepositLine = () => ({
  description: 'Refundable Deposit', quantity: 1, unit_price: '', isStandaloneDeposit: true,
});

const LINE_GRID = 'grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_72px_120px_110px_36px]';

function NewProductQuoteDrawer({ onClose, onCreated }) {
  const clientsState = useClientsList();
  const [recipientType, setRecipientType] = useState('client');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [walkInClient, setWalkInClient] = useState(emptyWalkInClient());
  const [products, setProducts] = useState([]);
  const [rentalUnits, setRentalUnits] = useState([]);
  const [refError, setRefError] = useState('');
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  // Which of the client's bookings this sale belongs to ('' = none). Defaults to their latest live booking.
  const [clientBookings, setClientBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingId, setBookingId] = useState('');

  useEffect(() => {
    setBookingId('');
    setClientBookings([]);
    if (recipientType !== 'client' || !selectedClientId) return undefined;
    let cancelled = false;
    setBookingsLoading(true);
    apiClient.getClientBookingsForSale(selectedClientId)
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setClientBookings(rows);
        const latestLive = rows.find((b) => b.is_live);
        if (latestLive) setBookingId(latestLive.booking_id);
      })
      .catch(() => { if (!cancelled) setClientBookings([]); })
      .finally(() => { if (!cancelled) setBookingsLoading(false); });
    return () => { cancelled = true; };
  }, [recipientType, selectedClientId]);

  const snap = () => JSON.stringify({ recipientType, selectedClientId, walkInClient, lineItems });
  const baseline = useRef(null);
  if (baseline.current === null) baseline.current = snap();
  const dirty = snap() !== baseline.current;

  const loadRefs = useCallback(async () => {
    setRefError('');
    try {
      const [pRes, uRes] = await Promise.all([apiClient.getProducts(), apiClient.getRentalUnits({ status: 'AVAILABLE' })]);
      setProducts(Array.isArray(pRes?.data) ? pRes.data : []);
      setRentalUnits(Array.isArray(uRes?.data) ? uRes.data : []);
    } catch (err) {
      setRefError(err?.message || 'Failed to load products.');
    }
  }, []);
  useEffect(() => { loadRefs(); }, [loadRefs]);

  const productOf = (it) => products.find((p) => p.product_id === it.product_id);
  const isRentalLine = (it) => productOf(it)?.product_type === 'RENTAL';

  const updateLineItem = (idx, patch) => setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeLineItem = (idx) => setLineItems((items) => items.filter((_, i) => i !== idx));

  const selectProductForLine = (idx, productId) => {
    const product = products.find((p) => p.product_id === productId);
    updateLineItem(idx, { product_id: productId, description: product ? product.name : '', unit_price: product ? product.price : '', unit_id: '' });
  };

  const lineTotal = (it) => (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0);
  const itemsTotal = lineItems.reduce((s, it) => s + (it.isStandaloneDeposit ? 0 : lineTotal(it)), 0);
  const depositsTotal = lineItems.reduce((s, it) => s + (it.isStandaloneDeposit ? lineTotal(it) : (isRentalLine(it) ? (parseFloat(it.deposit_amount) || 0) : 0)), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const errs = validateRecipient(recipientType, selectedClientId, walkInClient);
    const lineErrs = {};
    const validIdx = [];
    lineItems.forEach((it, idx) => {
      // Everything but a refundable deposit must be a catalogue product (transport is the Transport Charges product).
      if (!it.isStandaloneDeposit && !it.product_id && (it.unit_price !== '' || it.description)) {
        lineErrs[idx] = 'Pick a product from the catalogue.';
        return;
      }
      if (!(it.description && it.unit_price !== '')) return;
      validIdx.push(idx);
      if (isRentalLine(it) && it.rental_billing_type === 'ONE_TIME' && !it.rental_end_date) {
        lineErrs[idx] = 'End date is required for one-time rentals.';
      }
    });
    if (validIdx.length === 0) errs.lines = 'Add at least one line item with a description and price';
    errs.lineErrs = lineErrs;
    setErrors(errs);
    if (Object.keys(errs).some((k) => k !== 'lineErrs') || Object.keys(lineErrs).length) return;

    const validItems = validIdx.map((i) => lineItems[i]);
    setSaving(true);
    try {
      let walkInClientId = null;
      if (recipientType === 'walk_in') {
        const wicRes = await apiClient.createWalkInCustomer(walkInPayload(walkInClient));
        walkInClientId = wicRes.data.client_profile_id;
      }

      await apiClient.createProductQuotation({
        client_id: recipientType === 'client' ? selectedClientId : walkInClientId || undefined,
        booking_id: recipientType === 'client' && bookingId ? bookingId : undefined,
        line_items: validItems.map((it) => {
          if (it.isStandaloneDeposit) {
            return { item_type: 'DEPOSIT', description: it.description, quantity: 1, unit_price: parseFloat(it.unit_price) || 0 };
          }
          const rental = isRentalLine(it);
          return {
            item_type: rental ? 'RENTAL' : 'PRODUCT',
            description: it.description,
            quantity: parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            product_id: it.product_id || undefined,
            ...(rental ? {
              unit_id: it.unit_id || undefined,
              rental_billing_type: it.rental_billing_type,
              rental_start_date: it.rental_start_date,
              rental_end_date: it.rental_billing_type === 'ONE_TIME' ? it.rental_end_date : undefined,
              deposit_amount: it.deposit_amount ? parseFloat(it.deposit_amount) : 0,
            } : {}),
          };
        }),
      });
      onCreated();
    } catch (err) {
      setServerError(err?.message || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      title="New quotation"
      subtitle="Add products and services for a client or a walk-in customer."
      width={700}
      dirty={dirty}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <span className="flex-1" />
          <button type="submit" disabled={saving} className={btn('primary')}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create quotation</button>
        </>
      )}
    >
      <ErrorBanner message={serverError} />
      <ErrorBanner message={refError} onRetry={loadRefs} />

      <RecipientBlock
        recipientType={recipientType}
        onTypeChange={setRecipientType}
        clientsState={clientsState}
        search={clientSearch}
        onSearch={setClientSearch}
        selectedId={selectedClientId}
        onSelect={setSelectedClientId}
        walkIn={walkInClient}
        onWalkIn={setWalkInClient}
        errors={errors}
      />

      {recipientType === 'client' && selectedClientId && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">Booking</h3>
          <Field
            label="Which booking is this for?"
            htmlFor="pq-booking"
            hint={bookingId
              ? 'Its invoices are added to this booking, so they count towards what the booking owes and can use its wallet reservation.'
              : 'Not tied to a booking: the invoices stand on their own on the client\'s account.'}
          >
            <select id="pq-booking" value={bookingId} disabled={bookingsLoading} onChange={(e) => setBookingId(e.target.value)} className={inputCls(false)}>
              <option value="">{bookingsLoading ? 'Loading bookings…' : 'No booking (stand-alone sale)'}</option>
              {clientBookings.map((b) => (
                <option key={b.booking_id} value={b.booking_id}>
                  {b.booking_code} · {String(b.status || '').toLowerCase()}{b.patient_name ? ` · ${b.patient_name}` : ''}{b.is_live ? '' : ' (finished)'}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">2. Line items</h3>
          <span className="flex gap-2">
            <button type="button" onClick={() => setLineItems((items) => [...items, emptyDepositLine()])} className={btn('secondary', 'sm')}>Add refundable deposit</button>
            <button type="button" onClick={() => setLineItems((items) => [...items, emptyLineItem()])} className={btn('secondary', 'sm')}>Add line</button>
          </span>
        </div>
        {errors.lines && <p role="alert" className="text-xs text-red-700">{errors.lines}</p>}

        <div className="space-y-2.5">
          {lineItems.map((it, idx) => {
            const removeBtn = lineItems.length > 1 ? (
              <button type="button" onClick={() => removeLineItem(idx)} aria-label={`Remove line ${idx + 1}`} className={`${iconBtn} hover:text-red-700`}><X className="h-4 w-4" /></button>
            ) : <span />;

            if (it.isStandaloneDeposit) {
              return (
                <div key={idx} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_140px_36px]">
                    <input type="text" aria-label={`Deposit description, line ${idx + 1}`} placeholder="Description" value={it.description} onChange={(e) => updateLineItem(idx, { description: e.target.value })} className={`${inputCls(false)} col-span-2 sm:col-span-1`} />
                    <input type="number" min="0" step="0.01" aria-label={`Deposit amount, line ${idx + 1}`} placeholder="Amount" value={it.unit_price} onChange={(e) => updateLineItem(idx, { unit_price: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
                    {removeBtn}
                  </div>
                  <p className="text-xs text-amber-700">Refundable deposit — held by the company regardless of any rental item. Refund or forfeit it later from the Rentals tab.</p>
                </div>
              );
            }

            const rental = isRentalLine(it);
            const product = productOf(it);
            const overStock = product?.product_type === 'ITEM' && product.stock_quantity != null && Number(it.quantity) > Number(product.stock_quantity);
            const freeUnits = rentalUnits.filter((u) => u.product_id === it.product_id);
            return (
              <div key={idx} className={`space-y-2.5 rounded-lg border p-2.5 ${rental ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}>
                <div className={LINE_GRID}>
                  <select aria-label={`Product, line ${idx + 1}`} value={it.product_id} onChange={(e) => selectProductForLine(idx, e.target.value)} className={`${inputCls(false)} col-span-3 sm:col-span-1`}>
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : p.product_type === 'ONE_TIME_SERVICE' ? ' (Service)' : ''}</option>
                    ))}
                  </select>
                  <input type="number" min="0" step="1" aria-label={`Quantity, line ${idx + 1}`} placeholder="Qty" value={it.quantity} onChange={(e) => updateLineItem(idx, { quantity: e.target.value })} onWheel={(e) => e.target.blur()} className={`${inputCls(false)} tabular-nums`} />
                  <input type="number" min="0" step="0.01" aria-label={`Unit price, line ${idx + 1}`} placeholder="Unit price" value={it.unit_price} onChange={(e) => updateLineItem(idx, { unit_price: e.target.value })} onWheel={(e) => e.target.blur()} className={`${inputCls(false)} tabular-nums`} />
                  <b className="text-right text-sm tabular-nums text-slate-900"><span className="sr-only">Line total </span>{formatMoney(lineTotal(it))}</b>
                  {removeBtn}
                </div>

                {errors.lineErrs?.[idx] && !rental && <p role="alert" className="text-xs text-red-700">{errors.lineErrs[idx]}</p>}
                {overStock && <p role="alert" className="text-xs font-semibold text-amber-700">Only {product.stock_quantity} in stock. You can still quote it: stock will go to {Number(product.stock_quantity) - Number(it.quantity)} once it is invoiced.</p>}

                {rental && (
                  <div className="space-y-3 border-t border-blue-100 pt-3">
                    <b className="text-xs text-blue-700">Rental terms for this item</b>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Unit" htmlFor={`ql-unit-${idx}`} error={it.product_id && freeUnits.length === 0 ? 'No units currently available for this product.' : ''}>
                        <select id={`ql-unit-${idx}`} value={it.unit_id || ''} onChange={(e) => updateLineItem(idx, { unit_id: e.target.value })} className={inputCls(false)}>
                          <option value="">Auto-assign next free unit</option>
                          {freeUnits.map((u) => <option key={u.unit_id} value={u.unit_id}>{u.unit_code || u.unit_id.slice(0, 8)}</option>)}
                        </select>
                      </Field>
                      <Field label="Billing" htmlFor={`ql-bill-${idx}`}>
                        <select id={`ql-bill-${idx}`} value={it.rental_billing_type} onChange={(e) => updateLineItem(idx, { rental_billing_type: e.target.value })} className={inputCls(false)}>
                          <option value="ONE_TIME">One-time (fixed period)</option>
                          <option value="RECURRING">Monthly</option>
                        </select>
                      </Field>
                      <Field label="Start date">
                        <DateInput value={it.rental_start_date} onChange={(e) => updateLineItem(idx, { rental_start_date: e.target.value })} className={inputCls(false)} />
                      </Field>
                      {it.rental_billing_type === 'ONE_TIME' && (
                        <Field label="End date *" error={errors.lineErrs?.[idx]}>
                          <DateInput value={it.rental_end_date} onChange={(e) => updateLineItem(idx, { rental_end_date: e.target.value })} className={inputCls(!!errors.lineErrs?.[idx])} />
                        </Field>
                      )}
                      <Field label="Refundable deposit (optional)" htmlFor={`ql-dep-${idx}`}>
                        <input id={`ql-dep-${idx}`} type="number" min="0" step="0.01" placeholder="0.00" value={it.deposit_amount} onChange={(e) => updateLineItem(idx, { deposit_amount: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
                      </Field>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="ml-auto w-full max-w-[340px] overflow-hidden rounded-lg border border-slate-200 text-[13px]">
          <div className="flex justify-between px-3 py-2 text-slate-600"><span>Items and services</span><b className="tabular-nums text-slate-900">{formatMoney(itemsTotal)}</b></div>
          <div className="flex justify-between px-3 py-2 text-slate-600"><span>Refundable deposits</span><b className="tabular-nums text-slate-900">{formatMoney(depositsTotal)}</b></div>
          <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900"><span>Due once accepted</span><span className="tabular-nums">{formatMoney(itemsTotal + depositsTotal)}</span></div>
        </div>
      </section>
    </Drawer>
  );
}

// The one dialog for paying a product or rental invoice, used by the Products page, the client page and
// the cash register desk. It takes the amount (part payments are fine; it defaults to what is still
// due), shows what the client already owes, and can pay from the client's wallet the same way the
// nightly job does for care days: the invoice's own booking reservation first, then unreserved money,
// never money reserved for another booking (use Pay from wallet on the client page to override that).
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function RecordInvoicePaymentModal({ invoice, onClose, onRecorded }) {
  const bank = useBankAccounts();
  const { hasPermission } = useAdminAuth();
  const paidSoFar = Number(invoice.amount_paid || 0);
  const remaining = Math.max(round2(Number(invoice.amount || 0) - paidSoFar), 0);
  const clientId = invoice.client_id || null;
  const canWallet = Boolean(clientId) && hasPermission('INVOICE_PAY_FROM_WALLET');

  const [amount, setAmount] = useState(String(remaining));
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [slipFile, setSlipFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [context, setContext] = useState({ wallet: null, overdue: null });

  // What the client already owes, and how much wallet money is free for THIS invoice.
  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    (async () => {
      const [walletRes, overdueRes] = await Promise.all([
        canWallet ? apiClient.getWalletPayInfo(clientId).catch(() => null) : Promise.resolve(null),
        apiClient.getClientOverduePayments(clientId).catch(() => null),
      ]);
      if (cancelled) return;
      setContext({
        wallet: walletRes?.data || null,
        overdue: overdueRes?.summary ? Number(overdueRes.summary.total_overdue_amount || 0) : null,
      });
    })();
    return () => { cancelled = true; };
  }, [clientId, canWallet]);

  const ownReserved = context.wallet?.reservations?.find((r) => r.booking_id === invoice.booking_id)?.reserved || 0;
  const walletFree = context.wallet ? round2(Math.min(context.wallet.wallet_balance, Number(ownReserved) + Number(context.wallet.unreserved || 0))) : 0;
  const walletOffered = canWallet && walletFree > 0.005;
  const useWallet = paymentMethod === 'WALLET';
  const amountNum = parseFloat(amount) || 0;
  const maxAmount = useWallet ? Math.min(remaining, walletFree) : remaining;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (!(amountNum > 0)) errs.amount = 'Enter an amount greater than 0';
    else if (amountNum > maxAmount + 0.005) errs.amount = useWallet
      ? `The wallet can cover at most ${formatMoney(maxAmount)} of this invoice`
      : `This invoice has only ${formatMoney(remaining)} left to pay`;
    if (!useWallet) {
      if (!paymentDate) errs.paymentDate = 'Please enter the payment date';
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && !bankAccountId) errs.bank = 'Please select a bank account';
      if (paymentMethod === 'CHEQUE' && !chequeNumber) errs.chequeNumber = 'Cheque number is required';
      if (paymentMethod === 'CHEQUE' && !chequeDate) errs.chequeDate = 'Cheque date is required';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      if (useWallet) {
        await apiClient.walletPay(clientId, {
          targets: [{ type: 'PRODUCT', id: invoice.invoice_id, amount: round2(amountNum) }],
          note: notes || undefined,
        });
      } else {
        await apiClient.recordProductInvoicePayment(
          invoice.invoice_id,
          {
            amount: round2(amountNum),
            payment_method: paymentMethod,
            payment_date: paymentDate,
            bank_account_id: bankAccountId || undefined,
            cheque_number: chequeNumber || undefined,
            cheque_date: chequeDate || undefined,
            reference_number: referenceNumber || undefined,
            notes: notes || undefined,
          },
          slipFile,
        );
      }
      onRecorded();
    } catch (err) {
      setError(err?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Record payment — ${invoice.invoice_code}`}
      subtitle={`Invoice ${formatMoney(invoice.amount)}${paidSoFar > 0.005 ? ` · paid ${formatMoney(paidSoFar)}` : ''} · ${formatMoney(remaining)} left to pay`}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" disabled={saving || remaining <= 0.005} className={btn('success')}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} {useWallet ? 'Pay from wallet' : 'Record payment'}</button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <ErrorBanner message={bank.error} onRetry={bank.reload} />

      {(context.overdue !== null || context.wallet) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
          {context.overdue !== null && (
            <div>This client currently owes <b className={context.overdue > 0 ? 'text-red-700' : 'text-slate-900'}>{formatMoney(context.overdue)}</b> overdue.</div>
          )}
          {context.wallet && (
            <div>
              Wallet <b className="text-slate-900">{formatMoney(context.wallet.wallet_balance)}</b>
              {invoice.booking_id ? `, ${formatMoney(walletFree)} free for this invoice (its booking's reservation and unreserved money).` : `, ${formatMoney(walletFree)} unreserved.`}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Amount to pay" htmlFor="rp-amount" error={errors.amount}
          hint={amountNum > 0 && amountNum < remaining - 0.005 ? `${formatMoney(remaining - amountNum)} will still be due after this payment.` : undefined}>
          <div className="flex gap-2">
            <input id="rp-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={(e) => e.target.blur()} className={`${inputCls(!!errors.amount)} tabular-nums`} />
            <button type="button" onClick={() => setAmount(String(maxAmount))} className={btn('secondary', 'sm')}>All</button>
          </div>
        </Field>
        <Field label="Payment method" htmlFor="rp-method">
          <select id="rp-method" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); if (e.target.value === 'WALLET') setAmount(String(Math.min(remaining, walletFree))); }} className={inputCls(false)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            {walletOffered && <option value="WALLET">WALLET</option>}
          </select>
        </Field>
      </div>

      {useWallet ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-800">
          The amount is taken from the client's wallet, from this invoice's own booking reservation first and then unreserved money. Money reserved for other bookings is never used here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Payment date" error={errors.paymentDate}>
              <DateInput value={paymentDate} max={todayISO()} onChange={(e) => setPaymentDate(e.target.value)} className={inputCls(!!errors.paymentDate)} />
            </Field>
          </div>
          {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && (
            <Field label="Bank account" htmlFor="rp-bank" error={errors.bank}>
              <BankAccountSelect id="rp-bank" value={bankAccountId} onChange={setBankAccountId} accounts={bank.bankAccounts} invalid={!!errors.bank} />
            </Field>
          )}
          {paymentMethod === 'CHEQUE' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Cheque number" htmlFor="rp-chq" error={errors.chequeNumber}>
                <input id="rp-chq" type="text" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className={inputCls(!!errors.chequeNumber)} />
              </Field>
              <Field label="Cheque date" error={errors.chequeDate}>
                <DateInput value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputCls(!!errors.chequeDate)} />
              </Field>
            </div>
          )}
          <Field label="Reference number" htmlFor="rp-ref">
            <input id="rp-ref" type="text" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} className={inputCls(false)} />
          </Field>
          <Field label="Slip / receipt (optional)" htmlFor="rp-slip">
            <input id="rp-slip" type="file" onChange={(e) => setSlipFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-600" />
          </Field>
        </>
      )}
      <Field label="Notes" htmlFor="rp-notes">
        <textarea id="rp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={textareaCls(false)} />
      </Field>
    </Modal>
  );
}

// ==================== RENTALS TAB ====================

const AGREEMENT_STATUS = {
  ACTIVE: { tone: 'green', label: 'Active' },
  COMPLETED: { tone: 'slate', label: 'Completed' },
  CANCELLED: { tone: 'red', label: 'Cancelled' },
};
const DEPOSIT_STATUS = {
  HELD: { tone: 'amber', label: 'Held' },
  REFUNDED: { tone: 'green', label: 'Refunded' },
  PARTIALLY_REFUNDED: { tone: 'blue', label: 'Partially refunded' },
  FORFEITED: { tone: 'red', label: 'Forfeited' },
};
const AGR_COLS = 'minmax(190px,1.5fr) minmax(160px,1.3fr) 110px 120px 190px 120px 170px 36px';
const DEP_COLS = '100px minmax(170px,1.3fr) minmax(190px,1.5fr) 130px 150px 220px';

const dueDateOf = (a) => (a.billing_type === 'RECURRING' ? a.next_invoice_date : a.end_date);
const depositPending = (a) => !a.deposit_id && Number(a.deposit_amount) > 0;

// Shared refund modal — lets the admin pick which company bank account a
// bank-transfer refund is paid from. Full amount is refunded by default; the
// admin can lower it to keep ("forfeit") part of the deposit as a charge.
export function RefundDepositModal({ deposit, onClose, onRefunded }) {
  const totalAmount = parseFloat(deposit.amount) || 0;
  const bank = useBankAccounts();
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [refundAmount, setRefundAmount] = useState(String(totalAmount));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const refundAmt = parseFloat(refundAmount) || 0;
  const retainedAmt = Math.max(0, Math.round((totalAmount - refundAmt) * 100) / 100);
  const isPartial = retainedAmt > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (refundAmt <= 0 || refundAmt > totalAmount) errs.amount = `Refund amount must be greater than 0 and at most ${formatMoney(totalAmount)}`;
    if (paymentMethod === 'BANK_TRANSFER' && !bankAccountId) errs.bank = 'Please select a bank account';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await apiClient.refundDeposit(deposit.deposit_id, {
        payment_method: paymentMethod,
        company_bank_account_id: bankAccountId || undefined,
        notes: notes || undefined,
        refund_amount: refundAmt,
      });
      onRefunded();
    } catch (err) {
      setError(err?.message || 'Failed to refund deposit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Refund deposit"
      subtitle={`${formatMoney(totalAmount)} held`}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" disabled={saving} className={btn('success')}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPartial ? 'Confirm partial refund' : 'Confirm refund'}
          </button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <ErrorBanner message={bank.error} onRetry={bank.reload} />
      <Field
        label="Amount to refund"
        htmlFor="rf-amount"
        error={errors.amount}
        hint={isPartial ? `${formatMoney(retainedAmt)} will be kept by the company as a charge instead of returned.` : undefined}
      >
        <input id="rf-amount" type="number" min="0.01" max={totalAmount} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(!!errors.amount)} />
      </Field>
      <Field label="Refund via" htmlFor="rf-method">
        <select id="rf-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls(false)}>
          <option value="CASH">Cash</option>
          <option value="CHEQUE">Cheque</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
        </select>
      </Field>
      {paymentMethod === 'BANK_TRANSFER' && (
        <Field label="Refund from (company bank account)" htmlFor="rf-bank" error={errors.bank}>
          <BankAccountSelect id="rf-bank" value={bankAccountId} onChange={setBankAccountId} accounts={bank.bankAccounts} invalid={!!errors.bank} />
        </Field>
      )}
      <Field label={`Notes${isPartial ? ' (reason for withheld amount)' : ''}`} htmlFor="rf-notes">
        <textarea id="rf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isPartial ? 'e.g. repair fee, transport fee' : undefined} className={textareaCls(false)} />
      </Field>
    </Modal>
  );
}

// Mirror of RefundDepositModal for the forfeit direction: the full amount is
// kept by default, but the admin can lower it and refund the rest to the client.
export function ForfeitDepositModal({ deposit, onClose, onForfeited }) {
  const totalAmount = parseFloat(deposit.amount) || 0;
  const bank = useBankAccounts();
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [forfeitAmount, setForfeitAmount] = useState(String(totalAmount));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const forfeitAmt = parseFloat(forfeitAmount) || 0;
  const refundAmt = Math.max(0, Math.round((totalAmount - forfeitAmt) * 100) / 100);
  const isPartial = refundAmt > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errs = {};
    if (forfeitAmt <= 0 || forfeitAmt > totalAmount) errs.amount = `Forfeit amount must be greater than 0 and at most ${formatMoney(totalAmount)}`;
    if (isPartial && paymentMethod === 'BANK_TRANSFER' && !bankAccountId) errs.bank = 'Please select a bank account';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      await apiClient.forfeitDeposit(deposit.deposit_id, {
        forfeit_amount: forfeitAmt,
        notes: notes || undefined,
        payment_method: isPartial ? paymentMethod : undefined,
        company_bank_account_id: isPartial ? (bankAccountId || undefined) : undefined,
      });
      onForfeited();
    } catch (err) {
      setError(err?.message || 'Failed to forfeit deposit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Forfeit deposit"
      subtitle={`${formatMoney(totalAmount)} held`}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <button type="submit" disabled={saving} className={btn('dangerSolid')}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPartial ? 'Confirm partial forfeit' : 'Confirm forfeit'}
          </button>
        </>
      )}
    >
      <ErrorBanner message={error} />
      <ErrorBanner message={bank.error} onRetry={bank.reload} />
      <Field
        label="Amount to keep (forfeit)"
        htmlFor="ff-amount"
        error={errors.amount}
        hint={isPartial
          ? `The remaining ${formatMoney(refundAmt)} will be refunded back to the client.`
          : 'The full deposit stays with the company — no refund transaction is created.'}
      >
        <input id="ff-amount" type="number" min="0.01" max={totalAmount} step="0.01" value={forfeitAmount} onChange={(e) => setForfeitAmount(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(!!errors.amount)} />
      </Field>
      {isPartial && (
        <>
          <Field label="Refund remainder via" htmlFor="ff-method">
            <select id="ff-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls(false)}>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
            </select>
          </Field>
          {paymentMethod === 'BANK_TRANSFER' && (
            <Field label="Refund from (company bank account)" htmlFor="ff-bank" error={errors.bank}>
              <BankAccountSelect id="ff-bank" value={bankAccountId} onChange={setBankAccountId} accounts={bank.bankAccounts} invalid={!!errors.bank} />
            </Field>
          )}
        </>
      )}
      <Field label={`Reason${isPartial ? ' (for withheld amount)' : ' (optional)'}`} htmlFor="ff-notes">
        <textarea id="ff-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isPartial ? 'e.g. repair fee, transport fee' : undefined} className={textareaCls(false)} />
      </Field>
    </Modal>
  );
}

function DepositChip({ a }) {
  if (a.deposit_id) {
    const cfg = DEPOSIT_STATUS[a.deposit_status] || { tone: 'slate', label: a.deposit_status || 'Deposit' };
    return <StatusChip tone={cfg.tone}>{cfg.label} · {formatMoney(a.deposit_collected_amount)}</StatusChip>;
  }
  if (Number(a.deposit_amount) > 0) return <StatusChip tone="slate">Pending payment</StatusChip>;
  return <span className="text-[13px] text-slate-500">None</span>;
}

function RentalsTab({ createTick, onCount }) {
  const { toast } = useUi();
  const [sp, update] = useUrlParams();
  const subTab = sp.get('view') === 'deposits' ? 'deposits' : 'agreements';
  const search = sp.get('search') || '';
  const filter = ['ending', 'overdue', 'recurring', 'deposit'].includes(sp.get('filter')) ? sp.get('filter') : '';

  const [rentalProducts, setRentalProducts] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [prodRes, agrRes] = await Promise.all([
        apiClient.getProducts({ product_type: 'RENTAL', include_unavailable: 'true' }),
        apiClient.getRentalAgreements(),
      ]);
      setRentalProducts(Array.isArray(prodRes?.data) ? prodRes.data : []);
      setAgreements(Array.isArray(agrRes?.data) ? agrRes.data : []);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load rentals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (!loading && !loadError) onCount('rentals', agreements.length); }, [loading, loadError, agreements.length, onCount]);

  const openCreate = useCallback(() => {
    if (loading) { toast('Rentals are still loading — try again in a moment.'); return; }
    if (rentalProducts.length === 0) { toast('Create a rental product in the Catalog tab first.'); return; }
    setDrawerOpen(true);
  }, [loading, rentalProducts.length, toast]);
  useCreateSignal(createTick, openCreate);

  const recipientName = (a) => a.client_name || a.walk_in_name || '—';
  const isActive = (a) => a.status === 'ACTIVE';
  const daysOf = (a) => daysRemaining(dueDateOf(a));

  const matchesSearch = (a) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [a.product_name, a.unit_code, a.client_name, a.walk_in_name].filter(Boolean).join(' ').toLowerCase().includes(q);
  };
  const base = agreements.filter(matchesSearch);
  const predicates = {
    ending: (a) => isActive(a) && daysOf(a) !== null && daysOf(a) >= 0 && daysOf(a) <= 7,
    overdue: (a) => isActive(a) && daysOf(a) !== null && daysOf(a) < 0,
    recurring: (a) => isActive(a) && a.billing_type === 'RECURRING',
    deposit: (a) => isActive(a) && depositPending(a),
  };
  const shown = filter ? base.filter(predicates[filter]) : base;
  const chipCount = (key) => base.filter(predicates[key]).length;

  const activeCount = agreements.filter(isActive).length;
  const endingCount = agreements.filter(predicates.ending).length;
  const overdueCount = agreements.filter(predicates.overdue).length;
  const monthlyRecurring = agreements.filter(predicates.recurring).reduce((s, a) => s + (parseFloat(a.rate) || 0), 0);

  const setFilter = (v) => update({ filter: v });

  return (
    <>
      <Segmented
        ariaLabel="Rentals view"
        value={subTab}
        onChange={(v) => update({ view: v === 'deposits' ? 'deposits' : '', search: '', filter: '', dstatus: '' })}
        options={[{ value: 'agreements', label: 'Agreements' }, { value: 'deposits', label: 'Refundable deposits' }]}
      />

      {subTab === 'deposits' ? (
        <DepositsPanel />
      ) : (
        <>
          <ErrorBanner message={loadError} onRetry={fetchAll} />

          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Kpi label="Active agreements" value={activeCount} sub={`${agreements.length - activeCount} completed or cancelled`} active={filter === ''} onClick={() => setFilter('')} />
            <Kpi label="Ending in 7 days" value={endingCount} tone="amber" sub="Plan returns or renewals" active={filter === 'ending'} onClick={() => setFilter(filter === 'ending' ? '' : 'ending')} />
            <Kpi label="Overdue returns" value={overdueCount} tone="red" sub="Past the end date" active={filter === 'overdue'} onClick={() => setFilter(filter === 'overdue' ? '' : 'overdue')} />
            <Kpi label="Monthly recurring" value={formatMoney(monthlyRecurring)} tone="green" sub="From active recurring rentals" active={filter === 'recurring'} onClick={() => setFilter(filter === 'recurring' ? '' : 'recurring')} />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SearchBox value={search} onChange={(v) => update({ search: v })} placeholder="Search product, unit or recipient…" />
            <Segmented
              ariaLabel="Quick filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: '', label: 'All', count: base.length },
                { value: 'ending', label: 'Ending in 7 days', count: chipCount('ending') },
                { value: 'overdue', label: 'Overdue', count: chipCount('overdue') },
                { value: 'recurring', label: 'Recurring', count: chipCount('recurring') },
                { value: 'deposit', label: 'Deposit pending', count: chipCount('deposit') },
              ]}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {loading && agreements.length === 0 ? (
              <SkeletonRows rows={5} />
            ) : !loading && !loadError && rentalProducts.length === 0 ? (
              <EmptyState title="No rental products yet" body="Create a rental product in the Catalog tab first, then come back here to add units and agreements." />
            ) : shown.length === 0 && !loadError ? (
              <EmptyState
                title={agreements.length === 0 ? 'No rental agreements yet' : 'No agreements match your filters'}
                body={agreements.length === 0 ? 'Use New rental agreement above to create the first one.' : undefined}
                action={agreements.length > 0 && (search || filter) ? <button type="button" onClick={() => update({ search: '', filter: '' })} className={btn('secondary')}>Clear filters</button> : null}
              />
            ) : (
              <TableShell minWidth={1060}>
                <HeadRow cols={AGR_COLS}>
                  <HCell>Product / unit</HCell><HCell>Recipient</HCell><HCell>Billing</HCell><HCell right>Rate</HCell><HCell>Deposit</HCell><HCell>Status</HCell><HCell>Next / end</HCell><HCell><span className="sr-only">Details</span></HCell>
                </HeadRow>
                {shown.map((a) => {
                  const open = expandedId === a.rental_agreement_id;
                  const st = AGREEMENT_STATUS[a.status] || { tone: 'slate', label: a.status };
                  const due = dueDateOf(a);
                  return (
                    <React.Fragment key={a.rental_agreement_id}>
                      <BodyRow cols={AGR_COLS}>
                        <Cell>
                          <div className="truncate font-semibold text-slate-900">{a.product_name}</div>
                          <div className="font-mono text-xs text-slate-500">{a.unit_code || '—'}</div>
                        </Cell>
                        <Cell>
                          <div className="truncate">{a.client_name ? <ClientLink id={a.client_id}>{a.client_name}</ClientLink> : recipientName(a)}</div>
                          {a.walk_in_name && <div className="text-xs font-semibold text-amber-700">Walk-in</div>}
                        </Cell>
                        <Cell><StatusChip tone={a.billing_type === 'RECURRING' ? 'blue' : 'slate'}>{a.billing_type === 'RECURRING' ? 'Monthly' : 'One-time'}</StatusChip></Cell>
                        <Cell right className="font-semibold text-slate-900">{formatMoney(a.rate)}</Cell>
                        <Cell><DepositChip a={a} /></Cell>
                        <Cell><StatusChip tone={st.tone}>{st.label}</StatusChip></Cell>
                        <Cell>
                          <div className="text-[13px] text-slate-600">{a.billing_type === 'RECURRING' ? 'Next invoice ' : 'Ends '}{formatDate(due)}</div>
                          {isActive(a) && <DaysRemainingBadge date={due} />}
                        </Cell>
                        <Cell>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={`${open ? 'Hide' : 'Show'} details for ${a.product_name} ${a.unit_code || ''}`}
                            onClick={() => setExpandedId(open ? null : a.rental_agreement_id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180 text-blue-600' : ''}`} />
                          </button>
                        </Cell>
                      </BodyRow>
                      {open && (
                        <ExpandRow>
                          <AgreementDetail agreementId={a.rental_agreement_id} onChanged={fetchAll} />
                        </ExpandRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableShell>
            )}
            {shown.length > 0 && (
              <div className="border-t border-slate-200 px-4 py-3 text-[13px] text-slate-500">
                Showing {shown.length} of {agreements.length} agreement{agreements.length === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </>
      )}

      {drawerOpen && (
        <NewRentalAgreementDrawer
          rentalProducts={rentalProducts}
          onClose={() => setDrawerOpen(false)}
          onCreated={() => { setDrawerOpen(false); fetchAll(); toast('Rental agreement created.'); }}
        />
      )}
    </>
  );
}

// Expanded row content: timeline, invoices and the actions for one agreement.
function AgreementDetail({ agreementId, onChanged }) {
  const { toast, confirm } = useUi();
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [showRefund, setShowRefund] = useState(false);
  const [showForfeit, setShowForfeit] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.getRentalAgreement(agreementId);
      setAgreement(res?.data || null);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load rental agreement.');
    } finally {
      setLoading(false);
    }
  }, [agreementId]);
  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleReturn = async () => {
    const ok = await confirm({
      title: 'Mark this unit as returned?',
      body: 'This ends the rental agreement.',
      confirmLabel: 'Mark as returned',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.returnRentalUnit(agreementId);
      await fetchDetail();
      onChanged();
      toast('Unit marked as returned.');
    } catch (err) {
      setError(err?.message || 'Failed to mark as returned');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorBanner message={loadError} onRetry={fetchDetail} />;
  if (loading && !agreement) return <div className="h-24 animate-pulse rounded-lg bg-slate-100" role="status" aria-label="Loading agreement" />;
  if (!agreement) return null;

  const invoices = Array.isArray(agreement.invoices) ? agreement.invoices : [];
  const firstUnpaid = invoices.find((i) => i.status !== 'PAID');
  const isActive = agreement.status === 'ACTIVE';
  const hasDeposit = !!agreement.deposit_id || Number(agreement.deposit_amount) > 0;
  const due = dueDateOf(agreement);
  const depositDone = !!agreement.deposit_id;
  const depositSettled = ['REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED'].includes(agreement.deposit_status);

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <div className="flex flex-wrap gap-8">
        <div className="min-w-[260px] flex-1 basis-[300px]">
          <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Timeline</div>
          <div className="space-y-2">
            <Step done sub={formatDate(agreement.created_at || agreement.start_date)}>Agreement created</Step>
            {invoices.map((inv) => (
              <Step key={inv.invoice_id} done={inv.status === 'PAID'} sub={inv.paid_at ? formatDate(inv.paid_at) : formatMoney(inv.amount)}>
                Invoice {inv.invoice_code} {inv.status === 'PAID' ? 'paid' : 'awaiting payment'}
              </Step>
            ))}
            {hasDeposit && (
              <Step done={depositDone} sub={formatMoney(depositDone ? agreement.deposit_collected_amount : agreement.deposit_amount)}>
                {depositSettled ? `Deposit ${(DEPOSIT_STATUS[agreement.deposit_status]?.label || '').toLowerCase()}` : depositDone ? 'Deposit held' : 'Deposit not yet collected'}
              </Step>
            )}
            {isActive ? (
              <Step done={false} sub={formatDate(due)}>{agreement.billing_type === 'RECURRING' ? 'Next invoice due' : 'Return due'}</Step>
            ) : (
              <Step done>Rental {agreement.status === 'CANCELLED' ? 'cancelled' : 'completed'}</Step>
            )}
          </div>
        </div>

        <div className="min-w-[280px] flex-1 basis-[320px]">
          <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Invoices</div>
          {invoices.length === 0 ? (
            <p className="text-[13px] text-slate-500">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.invoice_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-slate-600">{inv.invoice_code}</span>
                      <StatusChip tone={invoiceTone(inv.status)}>{invoiceLabel(inv.status)}</StatusChip>
                    </span>
                    <span className="text-xs text-slate-500">{formatDate(inv.billing_period_start)} – {formatDate(inv.billing_period_end)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <b className="tabular-nums text-slate-900">{formatMoney(inv.amount)}</b>
                    {inv.status !== 'PAID' && <button type="button" onClick={() => setPaymentInvoice(inv)} className={btn('primary', 'sm')}>Pay</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {firstUnpaid && <button type="button" onClick={() => setPaymentInvoice(firstUnpaid)} className={btn('primary', 'sm')}>Record payment</button>}
        {isActive && <button type="button" disabled={busy} onClick={handleReturn} className={btn('secondary', 'sm')}>{busy && <Loader2 className="h-3 w-3 animate-spin" />} Mark unit as returned</button>}
        {agreement.deposit_id && agreement.deposit_status === 'HELD' && (
          <>
            <button type="button" onClick={() => setShowRefund(true)} className={btn('success', 'sm')}>Refund deposit</button>
            <button type="button" onClick={() => setShowForfeit(true)} className={btn('danger', 'sm')}>Forfeit deposit</button>
          </>
        )}
      </div>

      {paymentInvoice && (
        <RecordInvoicePaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onRecorded={() => { toast(`Payment recorded for ${paymentInvoice.invoice_code}.`); setPaymentInvoice(null); fetchDetail(); onChanged(); }}
        />
      )}
      {showRefund && agreement.deposit_id && (
        <RefundDepositModal
          deposit={{ deposit_id: agreement.deposit_id, amount: agreement.deposit_collected_amount }}
          onClose={() => setShowRefund(false)}
          onRefunded={() => { setShowRefund(false); fetchDetail(); onChanged(); toast('Deposit refunded.'); }}
        />
      )}
      {showForfeit && agreement.deposit_id && (
        <ForfeitDepositModal
          deposit={{ deposit_id: agreement.deposit_id, amount: agreement.deposit_collected_amount }}
          onClose={() => setShowForfeit(false)}
          onForfeited={() => { setShowForfeit(false); fetchDetail(); onChanged(); toast('Deposit forfeited.'); }}
        />
      )}
    </div>
  );
}

// Flat, global view of every deposit across all rental agreements. Defaults to
// HELD since that's the actionable set; the status filter reveals history.
function DepositsPanel() {
  const { toast } = useUi();
  const [sp, update] = useUrlParams();
  const statusFilter = ['REFUNDED', 'PARTIALLY_REFUNDED', 'FORFEITED', 'ALL'].includes(sp.get('dstatus')) ? sp.get('dstatus') : 'HELD';

  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forfeitTarget, setForfeitTarget] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await apiClient.getDeposits({});
      setDeposits(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load deposits.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchDeposits(); }, [fetchDeposits]);

  const recipientName = (d) => d.client_name || d.walk_in_name || '—';
  const countOf = (s) => deposits.filter((d) => d.status === s).length;
  const held = deposits.filter((d) => d.status === 'HELD');
  const heldTotal = held.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
  const shown = statusFilter === 'ALL' ? deposits : deposits.filter((d) => d.status === statusFilter);

  return (
    <>
      <ErrorBanner message={loadError} onRetry={fetchDeposits} />

      <div className="flex flex-wrap items-stretch gap-3">
        <div className="w-full sm:w-60"><Kpi label="Deposits · Total held" value={formatMoney(heldTotal)} tone="amber" sub={`${held.length} deposit${held.length === 1 ? '' : 's'} held`} /></div>
        <div className="flex items-end">
          <Segmented
            ariaLabel="Deposit status"
            value={statusFilter}
            onChange={(v) => update({ dstatus: v === 'HELD' ? '' : v })}
            options={[
              { value: 'HELD', label: 'Held', count: countOf('HELD') },
              { value: 'REFUNDED', label: 'Refunded', count: countOf('REFUNDED') },
              { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded', count: countOf('PARTIALLY_REFUNDED') },
              { value: 'FORFEITED', label: 'Forfeited', count: countOf('FORFEITED') },
              { value: 'ALL', label: 'All', count: deposits.length },
            ]}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && deposits.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : shown.length === 0 && !loadError ? (
          <EmptyState title={`No ${statusFilter === 'ALL' ? '' : (DEPOSIT_STATUS[statusFilter]?.label || '').toLowerCase() + ' '}deposits`.replace('  ', ' ')} />
        ) : (
          <TableShell minWidth={880}>
            <HeadRow cols={DEP_COLS}>
              <HCell>Held since</HCell><HCell>Recipient</HCell><HCell>Product / unit</HCell><HCell right>Amount</HCell><HCell>Status</HCell><HCell right>Action</HCell>
            </HeadRow>
            {shown.map((d) => {
              const cfg = DEPOSIT_STATUS[d.status] || { tone: 'slate', label: d.status };
              return (
                <BodyRow key={d.deposit_id} cols={DEP_COLS}>
                  <Cell className="text-[13px] text-slate-500">{formatDate(d.held_at)}</Cell>
                  <Cell>
                    <div className="truncate font-semibold text-slate-900">{d.client_name ? <ClientLink id={d.client_id}>{d.client_name}</ClientLink> : recipientName(d)}</div>
                    {d.walk_in_name && <div className="text-xs font-semibold text-amber-700">Walk-in</div>}
                  </Cell>
                  <Cell>
                    {d.product_name ? (
                      <>
                        <div className="font-medium text-slate-900">{d.product_name}</div>
                        <div className="font-mono text-xs text-slate-500">{d.unit_code || '—'}</div>
                      </>
                    ) : (
                      <>
                        <StatusChip tone="amber">General deposit</StatusChip>
                        <div className="mt-0.5 text-xs text-slate-500">{d.description || '—'}{d.estimate_number ? ` · ${d.estimate_number}` : ''}</div>
                      </>
                    )}
                  </Cell>
                  <Cell right className="font-semibold text-slate-900">{formatMoney(d.amount)}</Cell>
                  <Cell><StatusChip tone={cfg.tone}>{cfg.label}</StatusChip></Cell>
                  <Cell right>
                    {d.status === 'HELD' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => setRefundTarget(d)} className={btn('success', 'sm')}>Refund</button>
                        <button type="button" onClick={() => setForfeitTarget(d)} className={btn('danger', 'sm')}>Forfeit</button>
                      </div>
                    ) : d.status === 'REFUNDED' ? (
                      <span className="text-xs text-slate-500">Refunded {formatDate(d.refunded_at)}</span>
                    ) : d.status === 'PARTIALLY_REFUNDED' ? (
                      <span className="text-xs text-slate-500">Refunded {formatMoney(d.refunded_amount)}, kept {formatMoney(d.forfeited_amount)}</span>
                    ) : (
                      <span className="text-xs text-slate-500">Forfeited{d.notes ? ` — ${d.notes}` : ''}</span>
                    )}
                  </Cell>
                </BodyRow>
              );
            })}
          </TableShell>
        )}
      </div>

      {forfeitTarget && (
        <ForfeitDepositModal
          deposit={forfeitTarget}
          onClose={() => setForfeitTarget(null)}
          onForfeited={() => { setForfeitTarget(null); fetchDeposits(); toast('Deposit forfeited.'); }}
        />
      )}
      {refundTarget && (
        <RefundDepositModal
          deposit={refundTarget}
          onClose={() => setRefundTarget(null)}
          onRefunded={() => { setRefundTarget(null); fetchDeposits(); toast('Deposit refunded.'); }}
        />
      )}
    </>
  );
}

function NewRentalAgreementDrawer({ rentalProducts, onClose, onCreated }) {
  const clientsState = useClientsList();
  const bank = useBankAccounts();
  const [units, setUnits] = useState([]);
  const [unitsError, setUnitsError] = useState('');
  const [productId, setProductId] = useState(rentalProducts[0]?.product_id || '');
  const [recipientType, setRecipientType] = useState('client');
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [walkInClient, setWalkInClient] = useState(emptyWalkInClient());
  const [billingType, setBillingType] = useState('ONE_TIME');
  const [rate, setRate] = useState(rentalProducts[0]?.price || '');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [vendorPayNow, setVendorPayNow] = useState(false);
  const [vendorAmount, setVendorAmount] = useState(rentalProducts[0]?.cost_price || '');
  const [vendorPaymentMethod, setVendorPaymentMethod] = useState('CASH');
  const [vendorBankAccountId, setVendorBankAccountId] = useState('');
  const [vendorChequeNumber, setVendorChequeNumber] = useState('');
  const [vendorChequeDate, setVendorChequeDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');

  const snap = () => JSON.stringify([productId, recipientType, selectedClientId, walkInClient, billingType, rate, startDate, endDate, depositAmount, vendorPayNow, vendorAmount, vendorPaymentMethod, vendorBankAccountId, vendorChequeNumber, vendorChequeDate]);
  const baseline = useRef(null);
  if (baseline.current === null) baseline.current = snap();
  const dirty = snap() !== baseline.current;

  const loadUnits = useCallback(async () => {
    setUnitsError('');
    try {
      const res = await apiClient.getRentalUnits({});
      setUnits(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setUnitsError(err?.message || 'Failed to load rental units.');
    }
  }, []);
  useEffect(() => { loadUnits(); }, [loadUnits]);

  const selectedProduct = rentalProducts.find((p) => p.product_id === productId);
  const freeOf = (pid) => units.filter((u) => u.product_id === pid && u.status === 'AVAILABLE').length;
  const totalOf = (pid) => units.filter((u) => u.product_id === pid).length;

  const handleProductChange = (id) => {
    setProductId(id);
    const product = rentalProducts.find((p) => p.product_id === id);
    if (product) setRate(product.price);
    setVendorAmount(product?.cost_price || '');
    setVendorPayNow(false);
  };

  const rateN = parseFloat(rate) || 0;
  const depositN = parseFloat(depositAmount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    const errs = validateRecipient(recipientType, selectedClientId, walkInClient);
    if (!productId) errs.product = 'Please select a rental product';
    if (!rate || parseFloat(rate) <= 0) errs.rate = 'Rate must be greater than zero';
    if (billingType === 'ONE_TIME' && !endDate) errs.endDate = 'End date is required for a one-time rental';
    if (selectedProduct?.vendor_id && vendorPayNow) {
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(vendorPaymentMethod) && !vendorBankAccountId) errs.vendorBank = 'Please select a bank account for the vendor payment';
      if (vendorPaymentMethod === 'CHEQUE' && (!vendorChequeNumber || !vendorChequeDate)) errs.vendorCheque = 'Cheque number and date are required for the vendor payment';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      let walkInClientId = null;
      if (recipientType === 'walk_in') {
        const wicRes = await apiClient.createWalkInCustomer(walkInPayload(walkInClient));
        walkInClientId = wicRes.data.client_profile_id;
      }

      await apiClient.createRentalAgreement({
        product_id: productId,
        client_id: recipientType === 'client' ? selectedClientId : walkInClientId || undefined,
        billing_type: billingType,
        rate: parseFloat(rate),
        start_date: startDate,
        end_date: billingType === 'ONE_TIME' ? endDate : undefined,
        deposit_amount: depositAmount ? parseFloat(depositAmount) : 0,
        vendor_payment: selectedProduct?.vendor_id ? {
          pay_now: vendorPayNow,
          amount: vendorAmount || undefined,
          payment_method: vendorPaymentMethod,
          bank_account_id: vendorBankAccountId || undefined,
          cheque_number: vendorChequeNumber || undefined,
          cheque_date: vendorChequeDate || undefined,
        } : undefined,
      });
      onCreated();
    } catch (err) {
      setServerError(err?.message || 'Failed to create rental agreement');
    } finally {
      setSaving(false);
    }
  };

  const free = productId ? freeOf(productId) : 0;

  return (
    <Drawer
      title="New rental agreement"
      subtitle="Rent a unit to a client or a walk-in customer."
      width={700}
      dirty={dirty}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={(
        <>
          <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
          <span className="flex-1" />
          <button type="submit" disabled={saving} className={btn('primary')}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Create agreement</button>
        </>
      )}
    >
      <ErrorBanner message={serverError} />
      <ErrorBanner message={unitsError} onRetry={loadUnits} />

      <RecipientBlock
        recipientType={recipientType}
        onTypeChange={setRecipientType}
        clientsState={clientsState}
        search={clientSearch}
        onSearch={setClientSearch}
        selectedId={selectedClientId}
        onSelect={setSelectedClientId}
        walkIn={walkInClient}
        onWalkIn={setWalkInClient}
        errors={errors}
      />

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">2. Rental terms</h3>

        <Field
          label="Rental product"
          htmlFor="ra-product"
          error={errors.product}
          hint={productId && units.length > 0 ? 'The next free unit for this product is assigned automatically.' : undefined}
        >
          <select id="ra-product" value={productId} onChange={(e) => handleProductChange(e.target.value)} className={inputCls(!!errors.product)}>
            {rentalProducts.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}{units.length > 0 ? ` — ${freeOf(p.product_id)} of ${totalOf(p.product_id)} units free` : ''}
              </option>
            ))}
          </select>
          {productId && units.length > 0 && free === 0 && (
            <p role="alert" className="mt-1 text-xs font-semibold text-amber-700">No units are free for this product right now.</p>
          )}
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Billing</span>
          <Segmented
            ariaLabel="Billing type"
            value={billingType}
            onChange={setBillingType}
            options={[{ value: 'ONE_TIME', label: 'One-time (fixed period)' }, { value: 'RECURRING', label: 'Monthly (recurring)' }]}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={billingType === 'RECURRING' ? 'Rate per month (LKR) *' : 'Total rate (LKR) *'} htmlFor="ra-rate" error={errors.rate}>
            <input id="ra-rate" type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(!!errors.rate)} />
          </Field>
          <Field label="Refundable deposit (optional)" htmlFor="ra-deposit" hint="Bundled into the first invoice and held once it is paid.">
            <input id="ra-deposit" type="number" min="0" step="0.01" placeholder="0.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
          </Field>
          <Field label="Start date">
            <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls(false)} />
          </Field>
          {billingType === 'ONE_TIME' && (
            <Field label="End date *" error={errors.endDate}>
              <DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls(!!errors.endDate)} />
            </Field>
          )}
        </div>

        {selectedProduct?.vendor_id && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-[13px] text-slate-700">
              This unit is sourced from vendor <b>{selectedProduct.vendor_name}</b>. How will you pay them?
            </p>
            <ErrorBanner message={bank.error} onRetry={bank.reload} />
            <Field label="Amount owed" htmlFor="ra-vamt" className="max-w-[200px]">
              <input id="ra-vamt" type="number" min="0" step="0.01" value={vendorAmount} onChange={(e) => setVendorAmount(e.target.value)} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
            </Field>
            <Segmented
              ariaLabel="Vendor settlement"
              value={vendorPayNow ? 'now' : 'later'}
              onChange={(v) => setVendorPayNow(v === 'now')}
              options={[{ value: 'later', label: 'Leave unpaid' }, { value: 'now', label: 'Pay now' }]}
            />
            {vendorPayNow && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <Field label="Payment method" htmlFor="ra-vm">
                  <select id="ra-vm" value={vendorPaymentMethod} onChange={(e) => setVendorPaymentMethod(e.target.value)} className={inputCls(false)}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </Field>
                {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(vendorPaymentMethod) && (
                  <Field label="Bank account" htmlFor="ra-vb" error={errors.vendorBank}>
                    <BankAccountSelect id="ra-vb" value={vendorBankAccountId} onChange={setVendorBankAccountId} accounts={bank.bankAccounts} invalid={!!errors.vendorBank} />
                  </Field>
                )}
                {vendorPaymentMethod === 'CHEQUE' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Cheque number" htmlFor="ra-vcn" error={errors.vendorCheque}>
                      <input id="ra-vcn" type="text" value={vendorChequeNumber} onChange={(e) => setVendorChequeNumber(e.target.value)} className={inputCls(!!errors.vendorCheque)} />
                    </Field>
                    <Field label="Cheque date">
                      <DateInput value={vendorChequeDate} onChange={(e) => setVendorChequeDate(e.target.value)} className={inputCls(!!errors.vendorCheque)} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto w-full max-w-[340px] overflow-hidden rounded-lg border border-slate-200 text-[13px]">
          <div className="flex justify-between px-3 py-2 text-slate-600"><span>{billingType === 'RECURRING' ? 'Rate per month' : 'Rental rate'}</span><b className="tabular-nums text-slate-900">{formatMoney(rateN)}</b></div>
          <div className="flex justify-between px-3 py-2 text-slate-600"><span>Refundable deposit</span><b className="tabular-nums text-slate-900">{formatMoney(depositN)}</b></div>
          <div className="flex justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900"><span>First invoice</span><span className="tabular-nums">{formatMoney(rateN + depositN)}</span></div>
        </div>
      </section>
    </Drawer>
  );
}
