import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Plus,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Download,
  Loader2,
  Check,
  Send,
  BadgeDollarSign,
  Pencil,
  Trash2,
  Save,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import PaymentAllocationModal from './PaymentAllocationModal';
import ReceiptSendPopup from './ReceiptSendPopup';
import InvoiceSendPopup from './InvoiceSendPopup';

const PAYMENT_STATUS_FILTERS = ['ALL', 'FULLY_PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERPAID'];
const INVOICE_STATUS_FILTERS = ['ALL', 'INVOICED', 'NOT_INVOICED'];

const getPaymentStatus = (quote) => {
  const total = parseFloat(quote.total_amount || 0);
  const paid = parseFloat(quote.total_paid || 0);

  if (paid > total) return 'OVERPAID';
  if (paid === 0) return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
};

const PAYMENT_STATUS_CONFIG = {
  FULLY_PAID: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Fully Paid' },
  PARTIALLY_PAID: { dot: 'bg-amber-400', text: 'text-amber-700', label: 'Partially Paid' },
  UNPAID: { dot: 'bg-slate-400', text: 'text-slate-600', label: 'Unpaid' },
  OVERPAID: { dot: 'bg-red-400', text: 'text-red-700', label: 'Overpaid' },
};

const QUOTE_STATUS_CONFIG = {
  ACCEPTED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Accepted' },
  REJECTED: { dot: 'bg-red-400', text: 'text-red-700', label: 'Rejected' },
  SENT: { dot: 'bg-blue-400', text: 'text-blue-700', label: 'Sent' },
};

const PAYMENT_RECORD_STATUS_CONFIG = {
  VERIFIED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Verified' },
  PENDING: { dot: 'bg-amber-400', text: 'text-amber-700', label: 'Pending' },
  REJECTED: { dot: 'bg-red-400', text: 'text-red-700', label: 'Rejected' },
};

const StatusDot = ({ config, status, fallbackLabel }) => {
  const cfg = config[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: fallbackLabel || status || '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// Invoiced/not-invoiced is derived purely from whether the combined invoice
// has been generated yet (quote.invoice_code) — see quoteController.ensureCombinedInvoice.
const InvoiceStatusDot = ({ invoiceCode }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${invoiceCode ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${invoiceCode ? 'bg-emerald-500' : 'bg-slate-300'}`} />
    {invoiceCode ? 'Invoiced' : 'Not Invoiced'}
  </span>
);

const ProgressBar = ({ percent, status }) => {
  const barColor =
    status === 'OVERPAID' ? 'bg-red-500' :
    status === 'FULLY_PAID' ? 'bg-emerald-500' :
    status === 'PARTIALLY_PAID' ? 'bg-amber-400' : 'bg-slate-300';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{percent}%</span>
    </div>
  );
};

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

// Payer name as typed on the booking doesn't carry the client's honorific —
// it lives separately on client_profiles, so it's prefixed for display only
// when the payer wasn't already typed with one (e.g. "Mrs. Jane Silva").
const withHonorific = (honorific, name) => {
  if (!name) return name;
  if (!honorific) return name;
  if (name.trim().toLowerCase().startsWith(honorific.trim().toLowerCase())) return name;
  return `${honorific} ${name}`;
};

const SectionHeader = ({ title }) => (
  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
);

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

// Registration fee is treated as the first "bucket" any payment against the
// SERVICE quote fills (see paymentTrackingController.recordPayment) — the
// same threshold basis as service_paid (payment_tracking sum for this
// quote_id only, not the combined service+product figure).
const getRegFeeInfo = (servicePaid, lineItems) => {
  const regItem = (lineItems || []).find((li) => li.is_registration_fee);
  if (!regItem) return null;
  const amount = parseFloat(regItem.amount) || 0;
  const paid = parseFloat(servicePaid) || 0;
  return {
    amount,
    allocated: Math.min(paid, amount),
    remaining: Math.max(amount - paid, 0),
    settled: paid >= amount,
  };
};

const RegFeeAllocationCard = ({ info }) => {
  if (!info) return null;
  return (
    <div>
      <SectionHeader title="Registration Fee" />
      <div className={`rounded-lg border px-3 py-2.5 ${info.settled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <BadgeDollarSign className="h-3.5 w-3.5" /> Allocated from payments
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-slate-500">{money(info.allocated)} of {money(info.amount)}</span>
          {info.settled ? (
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" /> Settled
            </span>
          ) : (
            <span className="font-medium text-amber-700">{money(info.remaining)} remaining</span>
          )}
        </div>
      </div>
    </div>
  );
};

// Mirrors backend quoteController.expandProductLineItemsForDisplay: a rental
// item's billing cadence (and specific unit, if chosen) is appended to its
// description, and its own deposit is shown as a separate line right after
// it — same shape the merged PDF and ModularQuoteBuilder's preview show.
const expandProductLineItems = (items) => {
  const out = [];
  for (const li of items || []) {
    if (li.rental_billing_type) {
      const billingLabel = li.rental_billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time, fixed period';
      const unitLabel = li.unit_code ? ` — Unit ${li.unit_code}` : '';
      out.push({ ...li, description: `${li.description}${unitLabel} (${billingLabel})`, isProductItem: true });

      const depositAmt = parseFloat(li.deposit_amount) || 0;
      if (depositAmt > 0) {
        out.push({
          line_item_id: `${li.line_item_id}-deposit`,
          description: `Refundable Deposit for ${li.description} (fully refundable on return)`,
          quantity: 1,
          unit_price: depositAmt,
          amount: depositAmt,
          isProductItem: true,
        });
      }
    } else {
      out.push({ ...li, isProductItem: true });
    }
  }
  return out;
};

const QuotationsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [invoiceFilter, setInvoiceFilter] = useState('ALL');
  const [quotations, setQuotations] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [actingPaymentId, setActingPaymentId] = useState(null);
  const [quoteStatusBusy, setQuoteStatusBusy] = useState('');
  const [quotePdfBusy, setQuotePdfBusy] = useState(false);
  const [quoteSendBusy, setQuoteSendBusy] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [showReceiptPopup, setShowReceiptPopup] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState(null); // { clientId, payerName, payerMobile }
  const [showInvoicePopup, setShowInvoicePopup] = useState(false);
  const [invoiceTarget, setInvoiceTarget] = useState(null); // { quoteId, payerName, payerMobile }

  // Line items for the selected quote — the service quote's own charges,
  // plus a companion PRODUCT quote's items (products/rentals/deposits added
  // via ModularQuoteBuilder), if one exists. See expandProductLineItems above.
  const [selectedQuoteItems, setSelectedQuoteItems] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Editing the SERVICE quote's own line items — only allowed before any
  // payment (service or product) has been recorded against this quotation,
  // since payments are applied against the totals computed from these items
  // (see paymentTrackingController.recordPayment's registration-fee-first
  // waterfall). The companion PRODUCT quote's items are edited separately.
  const [editingLineItems, setEditingLineItems] = useState(false);
  const [editRows, setEditRows] = useState([]);
  const [editTerms, setEditTerms] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Lists every quotation for every service request (not just the one
  // service_requests.active_quote_id currently points to — that only gets
  // set when a quote is actually sent via "Generate & Send", so a freshly
  // created or download-only quote would otherwise never appear here, even
  // though client_detail_page.jsx's history view already shows it).
  const fetchQuotations = async () => {
    try {
      setLoading(true);
      setError('');

      const requestsRes = await apiClient.getAllServiceRequests();
      const requests = requestsRes.data || [];

      const perRequestLists = await Promise.all(
        requests.map((request) =>
          apiClient.getServiceRequestQuoteList(request.request_id).catch(() => ({ data: [] }))
        )
      );

      const quoteRows = await Promise.all(
        requests.flatMap((request, idx) => {
          const quotesForRequest = perRequestLists[idx]?.data || [];
          return quotesForRequest.map(async (quote) => {
            const serviceTotal = parseFloat(quote.total_amount || 0);
            let productTotal = 0;
            let productPaid = 0;
            if (quote.product_quote_id) {
              try {
                const productDetail = await apiClient.getProductQuote(quote.product_quote_id);
                productTotal = expandProductLineItems(productDetail?.data?.line_items)
                  .reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
              } catch { /* non-critical */ }
              // quote.total_paid only sums the SERVICE quote's own
              // payment_tracking rows — the linked PRODUCT invoice (paid
              // separately via PaymentAllocationModal) lives in the generic
              // `invoices` table and is never included there.
              try {
                const invRes = await apiClient.getProductInvoices({ quote_id: quote.product_quote_id });
                const invoices = Array.isArray(invRes?.data) ? invRes.data : [];
                productPaid = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
              } catch { /* non-critical */ }
            }
            const total_amount = serviceTotal + productTotal;
            const service_paid = parseFloat(quote.total_paid || 0);
            const total_paid = service_paid + productPaid;
            return {
              request_id: request.request_id,
              quote_id: quote.quote_id,
              client_id: request.client_id || null,
              estimate_number: quote.estimate_number || '-',
              payer_name: quote.payer_name || request.payer_name,
              client_honorific: quote.client_honorific || null,
              payer_mobile: quote.payer_mobile || request.payer_mobile,
              patient_name: quote.patient_name || request.patient_name,
              service_type: quote.service_type || request.service_type,
              quote_status: quote.status,
              product_quote_id: quote.product_quote_id || null,
              invoice_code: quote.invoice_code || null,
              invoice_pdf_url: quote.invoice_pdf_url || null,
              total_amount,
              service_paid,
              total_paid,
              remaining_amount: Math.max(total_amount - total_paid, 0),
              percent_paid: total_amount > 0 ? ((total_paid / total_amount) * 100).toFixed(2) : '0.00',
              payment_count: parseInt(quote.payment_count || 0, 10),
              can_assign_staff: total_paid > 0,
              created_at: quote.created_at
            };
          });
        })
      );

      quoteRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setQuotations(quoteRows);

      if (quoteRows.length > 0) {
        await selectQuote(quoteRows[0]);
      } else {
        setSelectedQuote(null);
      }
      return quoteRows;
    } catch (err) {
      setError(err.message || 'Failed to load quotations');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (quoteId) => {
    try {
      setPaymentsLoading(true);
      const response = await apiClient.getQuotePayments(quoteId);
      setPayments(response.payments || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch quote payments');
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Note: quote.total_amount here is already the combined (service + product)
  // total computed in fetchQuotations, so it's used as-is — not added to
  // product_total again (that would double-count).
  const fetchSelectedQuoteItems = async (quote) => {
    try {
      setItemsLoading(true);
      const detail = await apiClient.getQuoteWithLineItems(quote.quote_id);
      const line_items = Array.isArray(detail?.data?.line_items) ? detail.data.line_items : [];
      let product_line_items = [];
      const productQuoteId = quote.product_quote_id || detail?.data?.product_quote_id;
      if (productQuoteId) {
        try {
          const productDetail = await apiClient.getProductQuote(productQuoteId);
          product_line_items = expandProductLineItems(productDetail?.data?.line_items);
        } catch { /* non-critical */ }
      }
      setSelectedQuoteItems({
        line_items,
        product_line_items,
        combined_total: Number(quote.total_amount || 0),
        product_quote_id: productQuoteId || null,
        terms_conditions: detail?.data?.terms_conditions || '',
      });
    } catch {
      setSelectedQuoteItems({ line_items: [], product_line_items: [], combined_total: Number(quote.total_amount || 0), product_quote_id: null, terms_conditions: '' });
    } finally {
      setItemsLoading(false);
    }
  };

  const selectQuote = async (quote) => {
    setSelectedQuote(quote);
    setShowPaymentModal(false);
    setSelectedQuoteItems(null);
    setInvoiceSent(false);
    setQuoteSent(false);
    setEditingLineItems(false);
    await Promise.all([fetchPayments(quote.quote_id), fetchSelectedQuoteItems(quote)]);
  };

  const canEditQuote = (quote) => Number(quote?.total_paid || 0) === 0;

  const startEditingLineItems = () => {
    setEditRows(
      (selectedQuoteItems?.line_items || []).map((li) => ({
        line_item_id: li.line_item_id,
        item_type: li.item_type,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        is_registration_fee: !!li.is_registration_fee,
        item_subtype: li.item_subtype || null,
      }))
    );
    setEditTerms(selectedQuoteItems?.terms_conditions || '');
    setEditingLineItems(true);
  };

  const cancelEditingLineItems = () => {
    setEditingLineItems(false);
    setEditRows([]);
  };

  const updateEditRow = (index, patch) => {
    setEditRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addEditRow = () => {
    setEditRows((prev) => [...prev, { item_type: 'CHARGE', description: '', quantity: 1, unit_price: 0 }]);
  };

  const removeEditRow = (index) => {
    setEditRows((prev) => prev.filter((_, i) => i !== index));
  };

  const saveEditedLineItems = async () => {
    const cleanedRows = editRows
      .map((row) => ({ ...row, description: (row.description || '').trim() }))
      .filter((row) => row.description);

    if (cleanedRows.length === 0) {
      setError('Add at least one line item before saving.');
      return;
    }

    setEditSaving(true);
    try {
      setError('');
      await apiClient.updateQuoteLineItems(selectedQuote.quote_id, {
        line_items: cleanedRows,
        terms_conditions: editTerms,
      });
      setSuccessMessage('Quotation updated successfully.');
      setEditingLineItems(false);
      const quoteRows = await fetchQuotations();
      const updated = (quoteRows || []).find((q) => q.quote_id === selectedQuote.quote_id);
      if (updated) await selectQuote(updated);
    } catch (err) {
      setError(err.message || 'Failed to update quotation line items');
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const filteredQuotes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return quotations.filter((quote) => {
      const status = getPaymentStatus(quote);
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
      if (!matchesStatus) return false;

      const matchesInvoice =
        invoiceFilter === 'ALL' ||
        (invoiceFilter === 'INVOICED' && quote.invoice_code) ||
        (invoiceFilter === 'NOT_INVOICED' && !quote.invoice_code);
      if (!matchesInvoice) return false;

      if (!q) return true;

      return (
      [
        quote.estimate_number,
        quote.payer_name,
        quote.patient_name,
        quote.payer_mobile,
        quote.service_type
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
      );
    });
  }, [quotations, searchTerm, statusFilter, invoiceFilter]);

  const invoicedCount = useMemo(() => quotations.filter((q) => q.invoice_code).length, [quotations]);

  // Receipt is offered after every payment; the invoice is offered only once
  // nothing is left to pay on this quote (checked against the freshly
  // refetched quoteRows, since `quotations`/`selectedQuote` state won't
  // reflect the new payment until the next render).
  const handlePaymentRecorded = async () => {
    setShowPaymentModal(false);
    setSuccessMessage('Payment recorded successfully.');
    if (selectedQuote) {
      setReceiptTarget({
        clientId: selectedQuote.client_id,
        payerName: selectedQuote.payer_name,
        payerMobile: selectedQuote.payer_mobile,
      });
      const [quoteRows] = await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
      const updated = (quoteRows || []).find((q) => q.quote_id === selectedQuote.quote_id);
      setInvoiceTarget(
        updated && updated.remaining_amount <= 0.01
          ? { quoteId: updated.quote_id, payerName: updated.payer_name, payerMobile: updated.payer_mobile }
          : null
      );
    } else {
      await fetchQuotations();
      setInvoiceTarget(null);
    }
    setShowReceiptPopup(true);
  };

  const verifyPayment = async (paymentId) => {
    try {
      setActingPaymentId(paymentId);
      setError('');
      setSuccessMessage('');
      await apiClient.verifyQuotePayment(paymentId, 'Verified from admin quotations page');
      setSuccessMessage('Payment verified successfully.');
      if (selectedQuote) {
        await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
      }
    } catch (err) {
      setError(err.message || 'Failed to verify payment');
    } finally {
      setActingPaymentId(null);
    }
  };

  const handleQuoteStatusUpdate = async (quoteId, status) => {
    setQuoteStatusBusy(quoteId);
    try {
      setError(''); setSuccessMessage('');
      await apiClient.updateQuoteStatus(quoteId, status);
      setSuccessMessage(`Quotation marked as ${status}.`);
      await fetchQuotations();
    } catch (err) {
      setError(err.message || 'Failed to update quotation status');
    } finally {
      setQuoteStatusBusy('');
    }
  };

  // productQuoteId folds the companion PRODUCT quote's items (products/
  // rentals added via ModularQuoteBuilder's Products & Rentals section) into
  // this same PDF server-side (see quoteController.mergeProductQuoteIntoData)
  // — without it, only the service quote's own charges would be included.
  const handleDownloadPdf = async (quoteId, estimateNumber, productQuoteId) => {
    setQuotePdfBusy(true);
    try {
      setError('');
      const res = await apiClient.generateQuotePdf(quoteId, productQuoteId);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${estimateNumber || 'Quotation'}.pdf`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setQuotePdfBusy(false);
    }
  };

  const handleSendQuotePdf = async (quoteId, productQuoteId) => {
    setQuoteSendBusy(true);
    setQuoteSent(false);
    try {
      setError('');
      await apiClient.sendQuotePDF(quoteId, productQuoteId);
      setQuoteSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send quotation');
    } finally {
      setQuoteSendBusy(false);
    }
  };

  const handleSendInvoice = async (quoteId) => {
    setSendingInvoice(true);
    setInvoiceSent(false);
    try {
      setError('');
      await apiClient.sendCombinedInvoice(quoteId);
      setInvoiceSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send invoice');
    } finally {
      setSendingInvoice(false);
    }
  };

  const rejectPayment = async (paymentId) => {
    const reason = window.prompt('Enter rejection reason');
    if (!reason) return;

    try {
      setActingPaymentId(paymentId);
      setError('');
      setSuccessMessage('');
      await apiClient.rejectQuotePayment(paymentId, reason);
      setSuccessMessage('Payment rejected successfully.');
      if (selectedQuote) {
        await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
      }
    } catch (err) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setActingPaymentId(null);
    }
  };

  return (
    <AdminLayout
      title="Quotations"
      subtitle="View quotation payment progress, record payments, and verify/reject tracked payments."
      actions={
        <button onClick={fetchQuotations} title="Refresh" className={iconBtnCls}>
          <RefreshCw className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}
        {successMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{successMessage}</div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Quotation list ─────────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden lg:col-span-2">
            <div className="border-b border-slate-100 p-4 space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by estimate, payer, care profile, phone, or service"
                  className={`${inputCls} pl-8`}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Payment</span>
                <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 flex-wrap">
                  {PAYMENT_STATUS_FILTERS.map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                        statusFilter === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {status === 'ALL' ? 'All' : status.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Invoice</span>
                <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 flex-wrap">
                  {INVOICE_STATUS_FILTERS.map((status) => (
                    <button
                      key={status}
                      onClick={() => setInvoiceFilter(status)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                        invoiceFilter === status ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {status === 'ALL' ? 'All' : status === 'INVOICED' ? 'Invoiced' : 'Not Invoiced'}
                      {status === 'INVOICED' && <span className="ml-1.5 tabular-nums text-slate-400">{invoicedCount}</span>}
                      {status === 'NOT_INVOICED' && <span className="ml-1.5 tabular-nums text-slate-400">{quotations.length - invoicedCount}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="text-sm text-slate-400">Loading quotations…</div>
              </div>
            ) : filteredQuotes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                <FileText className="h-8 w-8" />
                <p className="text-sm">No quotations found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estimate</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Remaining</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice</th>
                      <th className="sticky right-0 bg-slate-50 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredQuotes.map((quote) => {
                      const status = getPaymentStatus(quote);
                      const isSelected = selectedQuote?.quote_id === quote.quote_id;
                      return (
                        <tr
                          key={quote.quote_id}
                          className={`group cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                          onClick={() => selectQuote(quote)}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">{quote.estimate_number}</td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">{withHonorific(quote.client_honorific, quote.payer_name)}</p>
                            <p className="text-xs text-slate-400">{formatMobileNumber(quote.payer_mobile)}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-700">{money(quote.total_amount)}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">{money(quote.remaining_amount)}</td>
                          <td className="px-4 py-3"><ProgressBar percent={Number(quote.percent_paid)} status={status} /></td>
                          <td className="px-4 py-3 whitespace-nowrap"><StatusDot config={PAYMENT_STATUS_CONFIG} status={status} /></td>
                          <td className="px-4 py-3 whitespace-nowrap"><InvoiceStatusDot invoiceCode={quote.invoice_code} /></td>
                          <td className={`sticky right-0 px-4 py-3 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)] transition-colors ${isSelected ? 'bg-blue-50' : 'bg-white group-hover:bg-slate-50'}`}>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/admin/quotations/${quote.quote_id}`); }}
                              title="View quotation details"
                              className={iconBtnCls}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Selected quote detail ──────────────────────────────────────── */}
          <div className="space-y-4">
            {!selectedQuote ? (
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-400">
                Select a quotation to view payment actions.
              </div>
            ) : (
              <>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {(() => {
                    const hasPaid = Number(selectedQuote.total_paid || 0) > 0;
                    const effectiveStatus = hasPaid ? 'ACCEPTED' : (selectedQuote.quote_status || 'SENT');
                    const isBusy = quoteStatusBusy === selectedQuote.quote_id;
                    const canAction = !hasPaid && !['ACCEPTED', 'REJECTED'].includes(selectedQuote.quote_status);
                    const combinedTotal = selectedQuoteItems ? selectedQuoteItems.combined_total : selectedQuote.total_amount;
                    const remaining = Math.max(combinedTotal - selectedQuote.total_paid, 0);
                    const paymentStatus = getPaymentStatus(selectedQuote);

                    return (
                      <>
                        <div className="flex items-start justify-between gap-2 px-5 py-4 border-b border-slate-100">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">{selectedQuote.estimate_number}</h3>
                            <p className="text-xs text-slate-400 mt-0.5">{withHonorific(selectedQuote.client_honorific, selectedQuote.payer_name)}</p>
                          </div>
                          <button
                            onClick={() => navigate(`/admin/quotations/${selectedQuote.quote_id}`)}
                            title="View full details"
                            className={iconBtnCls}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                          {/* Summary */}
                          <div>
                            <SectionHeader title="Summary" />
                            <div className="grid grid-cols-3 gap-2 mb-3">
                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total</p>
                                <p className="text-sm font-semibold text-slate-900 mt-0.5">{money(combinedTotal)}</p>
                              </div>
                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Paid</p>
                                <p className="text-sm font-semibold text-emerald-700 mt-0.5">{money(selectedQuote.total_paid)}</p>
                              </div>
                              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Remaining</p>
                                <p className="text-sm font-semibold text-amber-700 mt-0.5">{money(remaining)}</p>
                              </div>
                            </div>
                            <ProgressBar percent={Number(selectedQuote.percent_paid)} status={paymentStatus} />
                            <div className="flex items-center gap-4 mt-3">
                              <StatusDot config={PAYMENT_STATUS_CONFIG} status={paymentStatus} />
                              <StatusDot config={QUOTE_STATUS_CONFIG} status={effectiveStatus} />
                              <InvoiceStatusDot invoiceCode={selectedQuote.invoice_code} />
                            </div>
                          </div>

                          <RegFeeAllocationCard
                            info={getRegFeeInfo(selectedQuote.service_paid, [
                              ...(selectedQuoteItems?.line_items || []),
                            ])}
                          />

                          {/* Line items */}
                          {itemsLoading ? (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Loader2 className="h-3 w-3 animate-spin" /> Loading line items…
                            </div>
                          ) : editingLineItems ? (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <SectionHeader title="Edit Line Items" />
                                <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                  {money(editRows.reduce((s, r) => {
                                    const amt = (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0);
                                    return s + (r.item_type === 'DISCOUNT' ? -Math.abs(amt) : amt);
                                  }, 0))}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {editRows.map((row, idx) => (
                                  <div key={idx} className="rounded-lg border border-slate-200 p-2 space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        value={row.description}
                                        onChange={(e) => updateEditRow(idx, { description: e.target.value })}
                                        placeholder="Description"
                                        className={`${inputCls} flex-1 py-1.5 text-xs`}
                                      />
                                      <button
                                        onClick={() => removeEditRow(idx)}
                                        title="Remove line"
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        value={row.item_type}
                                        onChange={(e) => updateEditRow(idx, { item_type: e.target.value })}
                                        className={`${inputCls} py-1.5 text-xs w-28`}
                                      >
                                        <option value="CHARGE">Charge</option>
                                        <option value="DISCOUNT">Discount</option>
                                      </select>
                                      <input
                                        type="number"
                                        value={row.quantity}
                                        onChange={(e) => updateEditRow(idx, { quantity: e.target.value })}
                                        onWheel={(e) => e.target.blur()}
                                        placeholder="Qty"
                                        className={`${inputCls} py-1.5 text-xs w-16`}
                                      />
                                      <input
                                        type="number"
                                        value={row.unit_price}
                                        onChange={(e) => updateEditRow(idx, { unit_price: e.target.value })}
                                        onWheel={(e) => e.target.blur()}
                                        placeholder="Unit Price"
                                        className={`${inputCls} py-1.5 text-xs flex-1`}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <button onClick={addEditRow} className={`${ghostBtnCls} mt-2`}>
                                <Plus className="h-3.5 w-3.5" /> Add Line
                              </button>

                              <div className="mt-3">
                                <SectionHeader title="Terms & Conditions" />
                                <textarea
                                  value={editTerms}
                                  onChange={(e) => setEditTerms(e.target.value)}
                                  rows={2}
                                  className={`${inputCls} text-xs`}
                                />
                              </div>

                              <div className="flex items-center gap-2 mt-3">
                                <button onClick={saveEditedLineItems} disabled={editSaving} className={primaryBtnCls}>
                                  {editSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Save Changes
                                </button>
                                <button onClick={cancelEditingLineItems} disabled={editSaving} className={ghostBtnCls}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : selectedQuoteItems && (selectedQuoteItems.line_items.length > 0 || selectedQuoteItems.product_line_items.length > 0) && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <SectionHeader title="Line Items" />
                                {canEditQuote(selectedQuote) && (
                                  <button onClick={startEditingLineItems} title="Edit quotation" className={iconBtnCls}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                {[...selectedQuoteItems.line_items, ...selectedQuoteItems.product_line_items].map((li) => {
                                  const isDiscount = li.item_type === 'DISCOUNT';
                                  const amount = Math.abs(parseFloat(li.amount) || 0);
                                  return (
                                    <div key={li.line_item_id} className="flex items-start justify-between gap-2 text-xs">
                                      <span className={li.isProductItem ? 'text-violet-700' : 'text-slate-600'}>
                                        {li.description}{isDiscount && <span className="ml-1 text-slate-400">(Discount)</span>}
                                      </span>
                                      <span className={`shrink-0 font-medium tabular-nums ${isDiscount ? 'text-red-600' : li.isProductItem ? 'text-violet-700' : 'text-slate-800'}`}>
                                        {isDiscount ? `(${money(amount)})` : money(amount)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Invoice */}
                          <div>
                            <SectionHeader title="Combined Invoice" />
                            {selectedQuote.invoice_code ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-mono text-slate-600">{selectedQuote.invoice_code}</span>
                                <a href={selectedQuote.invoice_pdf_url} target="_blank" rel="noreferrer" className={ghostBtnCls}>
                                  <Download className="h-3.5 w-3.5" /> Download
                                </a>
                                <button onClick={() => handleSendInvoice(selectedQuote.quote_id)} disabled={sendingInvoice} className={primaryBtnCls}>
                                  {sendingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                  {invoiceSent ? 'Sent!' : 'Send to Client'}
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">
                                Not invoiced yet — the combined invoice is generated automatically once the service or a linked product portion is paid in full.
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          <div>
                            <SectionHeader title="Actions" />
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleDownloadPdf(selectedQuote.quote_id, selectedQuote.estimate_number, selectedQuoteItems?.product_quote_id)}
                                disabled={quotePdfBusy}
                                className={ghostBtnCls}
                              >
                                {quotePdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                {quotePdfBusy ? 'Generating…' : 'Download Quote PDF'}
                              </button>

                              <button
                                onClick={() => handleSendQuotePdf(selectedQuote.quote_id, selectedQuoteItems?.product_quote_id)}
                                disabled={quoteSendBusy}
                                className={ghostBtnCls}
                              >
                                {quoteSendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                {quoteSendBusy ? 'Sending…' : quoteSent ? 'Sent!' : 'Resend via WhatsApp'}
                              </button>

                              {canAction && (
                                <>
                                  <button
                                    onClick={() => handleQuoteStatusUpdate(selectedQuote.quote_id, 'ACCEPTED')}
                                    disabled={isBusy}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                  >
                                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                    Mark Accepted
                                  </button>
                                  <button
                                    onClick={() => handleQuoteStatusUpdate(selectedQuote.quote_id, 'REJECTED')}
                                    disabled={isBusy}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-60"
                                  >
                                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                    Mark Rejected
                                  </button>
                                </>
                              )}

                              {!canAction && selectedQuote.quote_status === 'REJECTED' && (
                                <button
                                  onClick={() => handleQuoteStatusUpdate(selectedQuote.quote_id, 'SENT')}
                                  disabled={isBusy}
                                  className={ghostBtnCls}
                                >
                                  {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                                  Reset to Pending
                                </button>
                              )}
                            </div>
                            {canAction && (
                              <p className="text-xs text-slate-400 mt-2">No payment recorded yet for this quotation.</p>
                            )}
                          </div>

                          {paymentStatus === 'OVERPAID' && (
                            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                              Overpaid detected: paid exceeds quotation amount. Recording more payments is blocked.
                            </div>
                          )}

                          <button
                            onClick={() => setShowPaymentModal(true)}
                            disabled={selectedQuote.total_paid >= selectedQuote.total_amount}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Plus className="h-4 w-4" />
                            {selectedQuote.total_paid >= selectedQuote.total_amount ? 'Payment Locked' : 'Record Payment'}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Payments */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">Payments</h3>
                  </div>

                  <div className="p-4">
                    {paymentsLoading ? (
                      <p className="text-sm text-slate-400">Loading payments…</p>
                    ) : payments.length === 0 ? (
                      <p className="text-sm text-slate-400">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((payment) => (
                          <div key={payment.payment_id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-slate-900">{money(payment.amount)}</p>
                              <StatusDot config={PAYMENT_RECORD_STATUS_CONFIG} status={payment.status} />
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{payment.payment_method} · {new Date(payment.payment_date).toLocaleString()}</p>
                            {payment.reference_number && (
                              <p className="text-xs text-slate-400">Ref: {payment.reference_number}</p>
                            )}
                            {payment.slip_url && (
                              <a href={payment.slip_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:underline">
                                View payment slip
                              </a>
                            )}

                            {payment.status !== 'VERIFIED' && (
                              <div className="mt-2 flex items-center gap-0.5">
                                <button
                                  onClick={() => verifyPayment(payment.payment_id)}
                                  disabled={actingPaymentId === payment.payment_id}
                                  title="Verify payment"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => rejectPayment(payment.payment_id)}
                                  disabled={actingPaymentId === payment.payment_id}
                                  title="Reject payment"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {selectedQuote?.can_assign_staff && (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Staff can be assigned for this quote based on received payments.
              </div>
            )}
          </div>
        </div>
      </div>

      {showPaymentModal && selectedQuote && (
        <PaymentAllocationModal
          quoteId={selectedQuote.quote_id}
          onClose={() => setShowPaymentModal(false)}
          onRecorded={handlePaymentRecorded}
        />
      )}

      <ReceiptSendPopup
        open={showReceiptPopup}
        clientId={receiptTarget?.clientId}
        payerName={receiptTarget?.payerName}
        payerMobile={receiptTarget?.payerMobile}
        onClose={() => {
          setShowReceiptPopup(false);
          if (invoiceTarget) setShowInvoicePopup(true);
        }}
      />

      <InvoiceSendPopup
        open={showInvoicePopup}
        quoteId={invoiceTarget?.quoteId}
        payerName={invoiceTarget?.payerName}
        payerMobile={invoiceTarget?.payerMobile}
        onClose={() => setShowInvoicePopup(false)}
      />
    </AdminLayout>
  );
};

export default QuotationsPage;
