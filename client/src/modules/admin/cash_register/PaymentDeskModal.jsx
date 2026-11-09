import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search, X, UserPlus, Wallet, FileText, Receipt, CreditCard, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../api/api';
import RecordPaymentDrawer from '../user_managemnet/RecordPaymentDrawer';
import { RecordInvoicePaymentModal } from '../products/ProductsPage';
import { fmt, inputCls } from './registerUtils';

// "Take a payment": find the client (or send a new walk-in through the normal client form),
// see what they owe, then hand over to the app's existing payment forms. Those forms post to
// the usual payment endpoints; because apiClient.registerSessionId is set while the register
// is open, every payment recorded here lands in today's till.
const PaymentDeskModal = ({ initialClientId = null, onClose, onPaymentRecorded }) => {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState(initialClientId);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="relative my-6 w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <CreditCard className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Take a payment</h2>
              <p className="text-xs text-slate-500">
                {clientId ? 'Choose what the customer is paying for' : 'Find the customer, or register a new one'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {clientId ? (
          <ClientDesk
            clientId={clientId}
            onBack={() => setClientId(null)}
            onPaymentRecorded={onPaymentRecorded}
          />
        ) : (
          <ClientSearch
            onPick={setClientId}
            onNew={() => navigate('/admin/users?add=1&returnTo=/admin/cash-register')}
          />
        )}
      </div>
    </div>
  );
};

// ─── Step 1: find the client ─────────────────────────────────────────────────────────
export const ClientSearch = ({ onPick, onNew, compact = false }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await apiClient.adminSearch(term, controller.signal);
        const group = (res.groups || []).find((g) => g.key === 'clients');
        setResults(group?.items || []);
        setSearched(true);
      } catch (err) {
        if (err.name !== 'AbortError') setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4 px-6 py-5'}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, mobile number or client code…"
          className={`${inputCls} pl-9`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>

      {results.length > 0 && (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id, c)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
              >
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{c.title}</span>
                  <span className="block text-xs text-slate-500">{c.subtitle}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !loading && results.length === 0 && (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No client found for &ldquo;{q.trim()}&rdquo;.</p>
      )}

      {onNew && (
        <button
          type="button"
          onClick={onNew}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
        >
          <UserPlus className="h-4 w-4" /> New customer &mdash; register them first
        </button>
      )}
    </div>
  );
};

// ─── Step 2: what are they paying for ────────────────────────────────────────────────
const ClientDesk = ({ clientId, onBack, onPaymentRecorded }) => {
  const [detail, setDetail] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [d, inv] = await Promise.all([
        apiClient.getAdminClientDetail(clientId),
        apiClient.getProductInvoices({ client_id: clientId, status: 'PENDING' }).catch(() => ({ data: [] })),
      ]);
      setDetail(d.data || null);
      setInvoices(Array.isArray(inv?.data) ? inv.data : []);
    } catch (err) {
      setError(err.message || 'Could not load this client.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const handleRecorded = (...args) => {
    onPaymentRecorded?.(...args);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading client…</div>;
  }
  if (error || !detail) {
    return (
      <div className="space-y-3 px-6 py-8">
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error || 'Client not found.'}</p>
        <button type="button" onClick={onBack} className="text-sm font-semibold text-blue-600 hover:underline">← Back to search</button>
      </div>
    );
  }

  const profile = detail.client_profile || {};
  const patients = Array.isArray(detail.patient_summary?.data) ? detail.patient_summary.data : [];
  const bookings = detail.recent_activity?.bookings || [];
  const name = [profile.honorific, profile.full_name].filter(Boolean).join(' ') || profile.company_name || 'Client';
  const unpaid = invoices.filter((i) => parseFloat(i.amount) - parseFloat(i.amount_paid || 0) > 0.009);

  return (
    <div className="space-y-5 px-6 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">{[profile.client_code, profile.mobile_number].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={onBack} className="text-xs font-semibold text-blue-600 hover:underline">Change customer</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wallet balance</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{fmt(profile.wallet_balance)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unpaid invoices</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{unpaid.length}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowPaymentDrawer(true)}
        className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left hover:bg-emerald-100"
      >
        <span className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <span>
            <span className="block text-sm font-bold text-emerald-900">Booking advance, wallet top-up or quotation</span>
            <span className="block text-xs text-emerald-700">Includes the registration fee, service charges and products on a quotation</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-emerald-500" />
      </button>

      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          <FileText className="h-3.5 w-3.5" /> Product &amp; rental invoices
        </p>
        {unpaid.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Nothing outstanding on invoices.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {unpaid.map((inv) => {
              const due = parseFloat(inv.amount) - parseFloat(inv.amount_paid || 0);
              return (
                <li key={inv.invoice_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{inv.invoice_code}</span>
                    <span className="block text-xs text-slate-500">{inv.items_summary || String(inv.category || '').replace(/_/g, ' ')} · due {fmt(due)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPayingInvoice(inv)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Pay
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RecordPaymentDrawer
        open={showPaymentDrawer}
        clientId={clientId}
        bookings={bookings}
        patients={patients}
        onClose={() => setShowPaymentDrawer(false)}
        onSuccess={(...args) => { setShowPaymentDrawer(false); handleRecorded(...args); }}
      />

      {payingInvoice && (
        <RecordInvoicePaymentModal
          invoice={{ ...payingInvoice, amount: parseFloat(payingInvoice.amount) - parseFloat(payingInvoice.amount_paid || 0) }}
          onClose={() => setPayingInvoice(null)}
          onRecorded={() => { setPayingInvoice(null); handleRecorded(); }}
        />
      )}
    </div>
  );
};

export default PaymentDeskModal;
