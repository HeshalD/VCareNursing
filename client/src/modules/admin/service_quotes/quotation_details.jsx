import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, RefreshCw, Receipt, CheckCircle2, Clock3, ClipboardList, Plus, Download, Send, Loader2, BadgeDollarSign, Pencil, Trash2, Save } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import PaymentAllocationModal from './PaymentAllocationModal';
import ReceiptSendPopup from './ReceiptSendPopup';
import InvoiceSendPopup from './InvoiceSendPopup';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const getStatus = (totalAmount, totalPaid) => {
  const total = parseFloat(totalAmount || 0);
  const paid = parseFloat(totalPaid || 0);
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

const SectionHeader = ({ title }) => (
  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
);

const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors';
const iconBtnCls = 'inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors';

// Buckets shown on the segmented progress bar — each is a distinct "pool" a
// payment fills, in the same waterfall order the backend applies payments in
// (registration fee first, see paymentTrackingController.recordPayment).
const BUCKET_STYLES = {
  reg_fee: { solid: 'bg-violet-500', light: 'bg-violet-100', dot: 'bg-violet-500', label: 'Registration Fee' },
  service: { solid: 'bg-blue-500', light: 'bg-blue-100', dot: 'bg-blue-500', label: 'Service Charges' },
  products: { solid: 'bg-amber-500', light: 'bg-amber-100', dot: 'bg-amber-500', label: 'Products & Rentals' },
};

const SegmentedProgressBar = ({ buckets }) => {
  const total = buckets.reduce((s, b) => s + b.amount, 0);
  if (total <= 0) {
    return <div className="h-2.5 w-full rounded-full bg-slate-100" />;
  }
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {buckets.map((b) => {
          const widthPct = (b.amount / total) * 100;
          const paidPct = b.amount > 0 ? Math.min((b.paid / b.amount) * 100, 100) : 0;
          const style = BUCKET_STYLES[b.key];
          return (
            <div
              key={b.key}
              className="group relative h-full border-r-2 border-white last:border-r-0"
              style={{ width: `${widthPct}%` }}
            >
              <div className={`h-full w-full ${style.light}`}>
                <div className={`h-full ${style.solid} transition-all`} style={{ width: `${paidPct}%` }} />
              </div>

              {/* Hover tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-48 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                <p className="font-semibold">{b.label}</p>
                <p className="mt-0.5 text-slate-300">{money(b.paid)} of {money(b.amount)} paid</p>
                <p className="text-slate-400">{b.amount > 0 ? Math.round((b.paid / b.amount) * 100) : 0}% complete</p>
                <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-900" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {buckets.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${BUCKET_STYLES[b.key].dot}`} />
            {b.label}
            <span className="font-medium text-slate-700">{money(b.paid)}</span>
            <span className="text-slate-300">/</span>
            {money(b.amount)}
          </div>
        ))}
      </div>
    </div>
  );
};

// Registration fee is treated as the first "bucket" any payment against the
// SERVICE quote fills (see paymentTrackingController.recordPayment) — the
// threshold basis is the SERVICE-only paid amount (summary.total_paid, i.e.
// payment_tracking for this quote_id), not the combined service+product figure.
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

const QuotationDetailsPage = () => {
  const { quoteId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [productLineItems, setProductLineItems] = useState([]);
  const [productPaid, setProductPaid] = useState(0);
  const [productInvoice, setProductInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [quotePdfBusy, setQuotePdfBusy] = useState(false);
  const [quoteSendBusy, setQuoteSendBusy] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState(false);
  const [showReceiptPopup, setShowReceiptPopup] = useState(false);
  const [showInvoicePopup, setShowInvoicePopup] = useState(false);
  const [invoiceReady, setInvoiceReady] = useState(false);

  // Editing the SERVICE quote's own line items — only allowed before any
  // payment (service or product) has been recorded, same rule as
  // quotations.jsx (see paymentTrackingController.recordPayment).
  const [editingLineItems, setEditingLineItems] = useState(false);
  const [editRows, setEditRows] = useState([]);
  const [editTerms, setEditTerms] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Returns the freshly computed remaining balance (rather than relying on
  // this render's now-stale state) so callers like handlePaymentRecorded can
  // reliably tell whether this payment just fully settled the quotation.
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [quoteRes, progressRes, paymentsRes] = await Promise.all([
        apiClient.getQuoteDetails(quoteId),
        apiClient.getQuotePaymentProgress(quoteId),
        apiClient.getQuotePayments(quoteId)
      ]);

      const quoteData = quoteRes.data || null;
      setQuote(quoteData);
      setSummary(progressRes || null);
      setPayments(paymentsRes.payments || []);

      let freshProductTotal = 0;
      let freshProductPaid = 0;

      // The companion PRODUCT quote (products/rentals added via
      // ModularQuoteBuilder's Products & Rentals section) is a separate
      // quotation record, linked back via quotations.linked_quote_id — its
      // items only get folded into one PDF/message at send time (see
      // quoteController.mergeProductQuoteIntoData), so fetch them here too.
      // Its own payment status also lives entirely outside
      // getQuotePaymentProgress (that endpoint only sums payment_tracking,
      // i.e. the SERVICE quote's own payments) — pull it separately so the
      // combined total/remaining/progress bar reflect a paid product portion.
      if (quoteData?.product_quote_id) {
        try {
          const productRes = await apiClient.getProductQuote(quoteData.product_quote_id);
          const expanded = expandProductLineItems(productRes?.data?.line_items);
          setProductLineItems(expanded);
          freshProductTotal = expanded.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
        } catch {
          setProductLineItems([]);
        }
        try {
          const invRes = await apiClient.getProductInvoices({ quote_id: quoteData.product_quote_id });
          const invoices = Array.isArray(invRes?.data) ? invRes.data : [];
          const paidInvoices = invoices.filter((i) => i.status === 'PAID');
          freshProductPaid = paidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
          setProductPaid(freshProductPaid);
          setProductInvoice(paidInvoices[0] || null);
        } catch {
          setProductPaid(0);
          setProductInvoice(null);
        }
      } else {
        setProductLineItems([]);
        setProductPaid(0);
        setProductInvoice(null);
      }

      const freshServiceTotal = parseFloat(progressRes?.total_amount ?? quoteData?.total_amount) || 0;
      const freshServicePaid = parseFloat(progressRes?.total_paid) || 0;
      const freshRemaining = Math.max((freshServiceTotal + freshProductTotal) - (freshServicePaid + freshProductPaid), 0);

      return {
        remaining: freshRemaining,
        payerName: quoteData?.payer_name,
        payerMobile: quoteData?.payer_mobile,
      };
    } catch (err) {
      setError(err.message || 'Failed to load quotation details');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) {
      loadData();
    }
  }, [quoteId]);

  const handleDownloadQuotePdf = async () => {
    setQuotePdfBusy(true);
    try {
      setError('');
      const res = await apiClient.generateQuotePdf(quoteId, quote?.product_quote_id);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `${quote?.estimate_number || 'Quotation'}.pdf`;
        link.target = '_blank';
        link.rel = 'noreferrer';
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      setError(err.message || 'Failed to generate quotation PDF');
    } finally {
      setQuotePdfBusy(false);
    }
  };

  const handleSendQuotePdf = async () => {
    setQuoteSendBusy(true);
    setQuoteSent(false);
    try {
      setError('');
      await apiClient.sendQuotePDF(quoteId, quote?.product_quote_id);
      setQuoteSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send quotation');
    } finally {
      setQuoteSendBusy(false);
    }
  };

  const handleSendInvoice = async () => {
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

  const startEditingLineItems = () => {
    setEditRows(
      (quote?.line_items || []).map((li) => ({
        line_item_id: li.line_item_id,
        item_type: li.item_type,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        is_registration_fee: !!li.is_registration_fee,
        item_subtype: li.item_subtype || null,
      }))
    );
    setEditTerms(quote?.terms_conditions || '');
    setEditError('');
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
      setEditError('Add at least one line item before saving.');
      return;
    }

    setEditSaving(true);
    try {
      setEditError('');
      await apiClient.updateQuoteLineItems(quoteId, {
        line_items: cleanedRows,
        terms_conditions: editTerms,
      });
      setEditingLineItems(false);
      await loadData();
    } catch (err) {
      setEditError(err.message || 'Failed to update quotation line items');
    } finally {
      setEditSaving(false);
    }
  };

  const productTotal = useMemo(
    () => productLineItems.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0),
    [productLineItems]
  );
  const combinedTotal = (parseFloat(summary?.total_amount ?? quote?.total_amount) || 0) + productTotal;
  const combinedPaid = (parseFloat(summary?.total_paid) || 0) + productPaid;
  const combinedRemaining = Math.max(combinedTotal - combinedPaid, 0);
  const combinedPercentPaid = combinedTotal > 0 ? ((combinedPaid / combinedTotal) * 100).toFixed(2) : '0.00';

  const status = useMemo(() => getStatus(combinedTotal, combinedPaid), [combinedTotal, combinedPaid]);

  const regFeeInfo = useMemo(
    () => getRegFeeInfo(summary?.total_paid, quote?.line_items),
    [summary, quote]
  );

  // Waterfall: a payment against the service quote fills the registration
  // fee bucket first, then whatever's left covers the remaining service
  // charges — same order paymentTrackingController.recordPayment applies.
  const progressBuckets = useMemo(() => {
    const regFeeAmount = regFeeInfo?.amount || 0;
    const serviceTotal = parseFloat(summary?.total_amount ?? quote?.total_amount) || 0;
    const serviceOnlyAmount = Math.max(serviceTotal - regFeeAmount, 0);
    const servicePaidTotal = parseFloat(summary?.total_paid) || 0;
    const regFeePaid = Math.min(servicePaidTotal, regFeeAmount);
    const serviceOnlyPaid = Math.min(Math.max(servicePaidTotal - regFeeAmount, 0), serviceOnlyAmount);

    const buckets = [];
    if (regFeeAmount > 0) buckets.push({ key: 'reg_fee', label: BUCKET_STYLES.reg_fee.label, amount: regFeeAmount, paid: regFeePaid });
    if (serviceOnlyAmount > 0) buckets.push({ key: 'service', label: BUCKET_STYLES.service.label, amount: serviceOnlyAmount, paid: serviceOnlyPaid });
    if (productTotal > 0) buckets.push({ key: 'products', label: BUCKET_STYLES.products.label, amount: productTotal, paid: productPaid });
    return buckets;
  }, [regFeeInfo, summary, quote, productTotal, productPaid]);

  return (
    <AdminLayout
      title="Quotation Details"
      subtitle="Summary of the selected quotation and all payments recorded against it."
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin/quotations')} className={ghostBtnCls}>
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={loadData} title="Refresh" className={iconBtnCls}>
            <RefreshCw className="h-4 w-4" />
          </button>
          {quote && combinedRemaining > 0 && (
            <button onClick={() => setShowPaymentModal(true)} className={primaryBtnCls}>
              <Plus className="h-4 w-4" /> Record Payment
            </button>
          )}
        </div>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-400">Loading quotation…</div>
      ) : !quote ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-400">Quotation not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {/* ── Summary panel ─────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <FileText className="h-3.5 w-3.5" />
                    <span className="text-xs">{quote.estimate_number}</span>
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{quote.payer_name}</h2>
                  <p className="text-sm text-slate-500">{quote.patient_name} · {quote.service_type}</p>
                </div>
                <StatusDot config={PAYMENT_STATUS_CONFIG} status={status} />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <SummaryCard label="Total" value={money(combinedTotal)} icon={Receipt} />
                <SummaryCard label="Paid" value={money(combinedPaid)} icon={CheckCircle2} valueClassName="text-emerald-700" />
                <SummaryCard label="Remaining" value={money(combinedRemaining)} icon={Clock3} valueClassName="text-amber-700" />
                <SummaryCard label="Payments" value={String(payments.length ?? 0)} icon={ClipboardList} />
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Payment Progress</span>
                  <span className="text-slate-400">{combinedPercentPaid}%</span>
                </div>
                <SegmentedProgressBar buckets={progressBuckets} />
              </div>

              {regFeeInfo && (
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <SectionHeader title="Registration Fee" />
                  <div className={`rounded-lg border px-3 py-2.5 ${regFeeInfo.settled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                      <BadgeDollarSign className="h-3.5 w-3.5" /> Allocated from payments
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{money(regFeeInfo.allocated)} of {money(regFeeInfo.amount)}</span>
                      {regFeeInfo.settled ? (
                        <span className="flex items-center gap-1 font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Settled
                        </span>
                      ) : (
                        <span className="font-medium text-amber-700">{money(regFeeInfo.remaining)} remaining</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5 pt-5 border-t border-slate-100">
                <SectionHeader title="Quotation Document" />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={handleDownloadQuotePdf} disabled={quotePdfBusy} className={ghostBtnCls}>
                    {quotePdfBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {quotePdfBusy ? 'Generating…' : 'Download Quote PDF'}
                  </button>
                  <button onClick={handleSendQuotePdf} disabled={quoteSendBusy} className={ghostBtnCls}>
                    {quoteSendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {quoteSendBusy ? 'Sending…' : quoteSent ? 'Sent!' : 'Resend via WhatsApp'}
                  </button>
                </div>
              </div>

              {/* Combined Invoice — generated the first time either the service
                  or a linked product portion is paid in full (see
                  quoteController.ensureCombinedInvoice). Not present until then. */}
              <div className="mt-5 pt-5 border-t border-slate-100">
                <SectionHeader title="Combined Invoice" />
                {quote.invoice_code ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-slate-600">{quote.invoice_code}</span>
                    <a href={quote.invoice_pdf_url} target="_blank" rel="noreferrer" className={ghostBtnCls}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                    <button onClick={handleSendInvoice} disabled={sendingInvoice} className={primaryBtnCls}>
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
            </div>

            {/* ── Line items ────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Line Items</h3>
                {!editingLineItems && combinedPaid === 0 && (
                  <button onClick={startEditingLineItems} title="Edit quotation" className={iconBtnCls}>
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {editError && <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{editError}</div>}

              {editingLineItems ? (
                <div className="p-5 space-y-3">
                  <div className="space-y-2">
                    {editRows.map((row, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2">
                        <input
                          value={row.description}
                          onChange={(e) => updateEditRow(idx, { description: e.target.value })}
                          placeholder="Description"
                          className="flex-1 min-w-[160px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <select
                          value={row.item_type}
                          onChange={(e) => updateEditRow(idx, { item_type: e.target.value })}
                          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-28"
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
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <input
                          type="number"
                          value={row.unit_price}
                          onChange={(e) => updateEditRow(idx, { unit_price: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          placeholder="Unit Price"
                          className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <button
                          onClick={() => removeEditRow(idx)}
                          title="Remove line"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button onClick={addEditRow} className={ghostBtnCls}>
                    <Plus className="h-4 w-4" /> Add Line
                  </button>

                  <div>
                    <SectionHeader title="Terms & Conditions" />
                    <textarea
                      value={editTerms}
                      onChange={(e) => setEditTerms(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      Total: {money(editRows.reduce((s, r) => {
                        const amt = (parseFloat(r.quantity) || 0) * (parseFloat(r.unit_price) || 0);
                        return s + (r.item_type === 'DISCOUNT' ? -Math.abs(amt) : amt);
                      }, 0))}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={saveEditedLineItems} disabled={editSaving} className={primaryBtnCls}>
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save Changes
                      </button>
                      <button onClick={cancelEditingLineItems} disabled={editSaving} className={ghostBtnCls}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
              /* The service quote's own charges/discounts, plus a companion
                  PRODUCT quote's items (products/rentals/deposits added via
                  ModularQuoteBuilder), if one exists — two separate quotation
                  records merged into one PDF/message when sent (see
                  quoteController.mergeProductQuoteIntoData). */
              (Array.isArray(quote.line_items) && quote.line_items.length > 0) || productLineItems.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qty</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit Price</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...(quote.line_items || []), ...productLineItems].map((item) => (
                        <tr key={item.line_item_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{item.item_type || (item.isProductItem ? 'PRODUCT' : '')}</td>
                          <td className={`px-4 py-2.5 ${item.isProductItem ? 'text-violet-700' : 'text-slate-700'}`}>{item.description}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{money(item.unit_price)}</td>
                          <td className={`px-4 py-2.5 text-right font-medium ${item.isProductItem ? 'text-violet-700' : 'text-slate-800'}`}>{money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-slate-400">No quotation line items available.</p>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            {/* ── Details ───────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Details</h3>
              </div>
              <div className="p-5 space-y-2 text-sm">
                <Row label="Payer" value={quote.payer_name} />
                <Row label="Mobile" value={quote.payer_mobile} />
                <Row label="Service" value={quote.service_type} />
                <Row label="Request Status" value={quote.request_status || 'N/A'} />
              </div>
            </div>

            {/* ── Payments made ─────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Payments Made</h3>
              </div>
              <div className="p-4">
                {payments.length === 0 && !productInvoice ? (
                  <p className="text-sm text-slate-400">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {productInvoice && (
                      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-violet-900">{money(productInvoice.amount)}</p>
                            <p className="text-xs text-violet-600 mt-0.5">
                              Products &amp; Rentals ({productInvoice.invoice_code})
                              {productInvoice.paid_at ? ` · ${new Date(productInvoice.paid_at).toLocaleString()}` : ''}
                            </p>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Paid
                          </span>
                        </div>
                      </div>
                    )}
                    {payments.map((payment) => (
                      <div key={payment.payment_id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{money(payment.amount)}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{payment.payment_method} · {new Date(payment.payment_date).toLocaleString()}</p>
                          </div>
                          <StatusDot config={PAYMENT_RECORD_STATUS_CONFIG} status={payment.status} />
                        </div>
                        {(payment.reference_number || payment.cheque_number || payment.slip_url) && (
                          <div className="mt-2 space-y-0.5 text-xs text-slate-400">
                            {payment.reference_number && <p>Reference: {payment.reference_number}</p>}
                            {payment.cheque_number && <p>Cheque: {payment.cheque_number}</p>}
                            {payment.slip_url && (
                              <a href={payment.slip_url} target="_blank" rel="noreferrer" className="font-medium text-blue-600 hover:underline">
                                View slip
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && quote && (
        <PaymentAllocationModal
          quoteId={quote.quote_id}
          onClose={() => setShowPaymentModal(false)}
          onRecorded={async () => {
            setShowPaymentModal(false);
            const result = await loadData();
            setInvoiceReady(!!result && result.remaining <= 0.01);
            setShowReceiptPopup(true);
          }}
        />
      )}

      {/* Receipt is offered after every payment; the invoice is offered only
          once nothing is left to pay — see handlePaymentAllocated. */}
      <ReceiptSendPopup
        open={showReceiptPopup}
        clientId={quote?.request_client_id}
        payerName={quote?.payer_name}
        payerMobile={quote?.payer_mobile}
        onClose={() => {
          setShowReceiptPopup(false);
          if (invoiceReady) setShowInvoicePopup(true);
        }}
      />

      <InvoiceSendPopup
        open={showInvoicePopup}
        quoteId={quote?.quote_id}
        payerName={quote?.payer_name}
        payerMobile={quote?.payer_mobile}
        onClose={() => setShowInvoicePopup(false)}
      />
    </AdminLayout>
  );
};

const SummaryCard = ({ label, value, icon: Icon, valueClassName = 'text-slate-900' }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
    <div className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900">{value || '—'}</span>
  </div>
);

export default QuotationDetailsPage;
