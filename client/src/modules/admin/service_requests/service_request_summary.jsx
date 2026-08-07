import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, FileText, CircleDollarSign, ArrowRight,
  ExternalLink, Pencil, X, Save, User, Stethoscope,
  BadgeCheck, MapPin, CheckCircle2, Plus, Phone, Calendar,
  Heart, Loader2, AlertCircle, Download, ThumbsUp, ThumbsDown, Send,
  BadgeDollarSign, Menu, UserCheck, Check,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import DateInput, { todayISO } from '../../../components/common/DateInput';
import PhoneInput from '../../../components/common/PhoneInput';
import PaymentAllocationModal from '../service_quotes/PaymentAllocationModal';
import ReceiptSendPopup from '../service_quotes/ReceiptSendPopup';
import InvoiceSendPopup from '../service_quotes/InvoiceSendPopup';
import ServiceRequestSwitcherSidebar from './ServiceRequestSwitcherSidebar';

// ─── constants ────────────────────────────────────────────────────────────────

const SERVICE_TYPE_OPTIONS = [
  { value: 'CARETAKER',         label: 'Caretaker' },
  { value: 'NURSING_ASSISTANT', label: 'Nursing Assistant' },
  { value: 'NURSE',             label: 'Professional Nurse' },
  { value: 'PHYSIOTHERAPIST',   label: 'Physiotherapist' },
  { value: 'NANNY',             label: 'Nanny' },
  { value: 'COUNSELLOR',        label: 'Counsellor' },
];

const RELATIONSHIP_OPTIONS = [
  'Parent', 'Child', 'Sibling', 'Spouse / Partner',
  'Guardian', 'Caregiver', 'Friend', 'Neighbor', 'Other',
];

const SERVICE_MODEL_OPTIONS = ['LIVE_IN', 'SHIFT_BASED', 'VISITING'];
const GENDER_OPTIONS        = ['ANY', 'MALE', 'FEMALE'];

const REQUEST_STATUS_CONFIG = {
  NEW_LEAD:  { dot: 'bg-purple-400', text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', label: 'New Lead' },
  PENDING:   { dot: 'bg-amber-400',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Pending' },
  CONTACTED: { dot: 'bg-blue-400',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   label: 'Contacted' },
  CONFIRMED: { dot: 'bg-emerald-500',text: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200',label: 'Confirmed' },
  ASSIGNED:  { dot: 'bg-indigo-400', text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', label: 'Assigned' },
  COMPLETED: { dot: 'bg-slate-400',  text: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200',  label: 'Completed' },
  CANCELLED: { dot: 'bg-red-400',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Cancelled' },
};

const REQUEST_STATUS_OPTIONS = ['NEW_LEAD', 'PENDING', 'CONTACTED', 'CONFIRMED', 'ASSIGNED', 'COMPLETED', 'CANCELLED'];

const QUOTE_STATUS_CONFIG = {
  FULLY_PAID:     { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Fully Paid' },
  PARTIALLY_PAID: { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   label: 'Partially Paid' },
  UNPAID:         { dot: 'bg-slate-400',   text: 'text-slate-500',   bg: 'bg-slate-100',  border: 'border-slate-200',   label: 'Unpaid' },
  OVERPAID:       { dot: 'bg-red-400',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     label: 'Overpaid' },
};

const QUOTE_APPROVAL_CONFIG = {
  DRAFT:    { dot: 'bg-slate-300',   text: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   label: 'Draft' },
  SENT:     { dot: 'bg-blue-400',    text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    label: 'Sent to Client' },
  ACCEPTED: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Accepted' },
  REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     label: 'Rejected' },
};

const TABS = [
  { key: 'details',    label: 'Details' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'payment',    label: 'Payment' },
];

const PIPELINE_STEPS = [
  { key: 'new_lead',        label: 'New Lead',         icon: FileText,        description: 'Request was received and logged as a new lead.' },
  { key: 'quotation_sent',  label: 'Quotation Sent',   icon: Send,            description: 'A quotation was sent to the client for review.' },
  { key: 'payment_made',    label: 'Payment Made',     icon: CircleDollarSign,description: 'At least one payment has been recorded against a quotation.' },
  { key: 'booking_created', label: 'Booking Created',  icon: BadgeCheck,      description: 'A booking has been created from an accepted quotation.' },
  { key: 'staff_assigned',  label: 'Staff Assigned',   icon: UserCheck,       description: 'Staff have been assigned to fulfil this booking.' },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const money = (v) =>
  `LKR ${parseFloat(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (date) =>
  date ? new Date(date).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const getQuoteStatus = (q) => {
  const total = parseFloat((q?.combined_total ?? q?.total_amount) || 0);
  const paid  = parseFloat(q?.total_paid   || 0);
  if (paid > total) return 'OVERPAID';
  if (paid === 0)   return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
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

// Registration fee is treated as the first "bucket" any payment against the
// SERVICE quote fills (see paymentTrackingController.recordPayment) — the
// threshold basis is the SERVICE-only paid amount (service_paid, i.e.
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

const RegFeeAllocationCard = ({ info }) => {
  if (!info) return null;
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2.5 ${info.settled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <BadgeDollarSign className="h-3.5 w-3.5" /> Registration Fee Allocation
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span className="text-slate-600">Allocated from payments</span>
        <span className="font-medium text-slate-800">{money(info.allocated)} / {money(info.amount)}</span>
      </div>
      {info.settled ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Fully allocated — registration is settled
        </p>
      ) : (
        <p className="mt-1 text-xs font-medium text-amber-700">{money(info.remaining)} remaining before registration is settled</p>
      )}
    </div>
  );
};

const serviceLabel = (v) =>
  SERVICE_TYPE_OPTIONS.find(o => o.value === v)?.label ?? v ?? '—';

const modelLabel = (v) =>
  v?.replace(/_/g, ' ') ?? '—';

// ─── sub-components ───────────────────────────────────────────────────────────

const StatusDot = ({ status, config }) => {
  const cfg = config[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status?.replace(/_/g, ' ') ?? '—' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-400 mb-0.5">{label}</p>
    <p className="text-sm font-medium text-slate-900">{value ?? '—'}</p>
  </div>
);

// Horizontal 5-phase pipeline tracker shown at the top of the page. `completedCount`
// is how many of PIPELINE_STEPS are done (in order) — steps beyond it are upcoming,
// the one right after the last completed step is treated as "current" (in progress).
const PipelineStepper = ({ completedCount }) => (
  <div className="bg-white rounded-xl border border-slate-200 px-5 py-5 mb-4">
    <div className="flex items-start">
      {PIPELINE_STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const done = i < completedCount;
        const isCurrent = i === completedCount;
        const isLast = i === PIPELINE_STEPS.length - 1;
        return (
          <div key={step.key} className="relative flex-1">
            {!isLast && (
              <div className={`absolute top-[18px] left-1/2 h-0.5 w-full ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
            <div className="group relative flex flex-col items-center">
              <div
                className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white transition-colors ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : isCurrent
                    ? 'border-blue-500 bg-blue-50 text-blue-600'
                    : 'border-slate-200 text-slate-300'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </div>
              <p className={`mt-1.5 whitespace-nowrap text-[11px] font-semibold ${
                done ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-slate-400'
              }`}>
                Phase 0{i + 1}
              </p>
              <p className={`whitespace-nowrap text-[11px] ${
                done || isCurrent ? 'text-slate-600' : 'text-slate-400'
              }`}>
                {step.label}
              </p>

              {/* Hover tooltip with description */}
              <div className="pointer-events-none absolute top-full z-10 mt-1.5 w-48 -translate-x-1/2 left-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                {step.description}
                <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const inputCls  = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 bg-white placeholder:text-slate-400';
const labelCls  = 'block text-xs font-medium text-slate-500 mb-1.5';

// ─── page ─────────────────────────────────────────────────────────────────────

const ServiceRequestSummaryPage = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [request, setRequest]           = useState(null);
  const [quotes, setQuotes]             = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [proceeding, setProceeding]     = useState(false);
  const [activeTab, setActiveTab]       = useState('details');
  const [editMode, setEditMode]         = useState(false);
  const [editForm, setEditForm]         = useState({});
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [quoteActionLoading, setQuoteActionLoading] = useState({});
  const [paymentHistory, setPaymentHistory]         = useState([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentSuccess, setPaymentSuccess]         = useState('');
  const [showPaymentModal, setShowPaymentModal]     = useState(false);
  const [showReceiptPopup, setShowReceiptPopup]     = useState(false);
  const [showInvoicePopup, setShowInvoicePopup]     = useState(false);
  const [invoiceTarget, setInvoiceTarget]           = useState(null); // { quoteId, payerName, payerMobile }
  const [sendingInvoiceQuoteId, setSendingInvoiceQuoteId] = useState('');
  const [invoiceSentQuoteId, setInvoiceSentQuoteId] = useState('');
  const [mobileRequestSidebarOpen, setMobileRequestSidebarOpen] = useState(false);

  const selectedQuote = useMemo(
    () => quotes.find(q => q.quote_id === selectedQuoteId) || quotes[0] || null,
    [quotes, selectedQuoteId]
  );
  const selectedQuoteStatus = selectedQuote ? getQuoteStatus(selectedQuote) : 'UNPAID';

  // Determines how many of PIPELINE_STEPS are complete, in order — used to
  // render the phase tracker at the top of the page.
  const pipelineCompletedCount = useMemo(() => {
    if (!request) return 0;
    const quotationSent = quotes.some(q => q.status && q.status !== 'DRAFT');
    const paymentMade = quotes.some(q => (parseFloat(q.total_paid) || 0) > 0);
    const bookingCreated = quotes.some(q => !!q.booking_id) || request.status === 'BOOKING_CREATED';
    const staffAssigned = request.status === 'ASSIGNED' || request.status === 'COMPLETED';
    let count = 1; // New Lead is always true once a request exists
    if (quotationSent) count = 2;
    if (paymentMade) count = 3;
    if (bookingCreated) count = 4;
    if (staffAssigned) count = 5;
    return count;
  }, [request, quotes]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [reqRes, quoteRes] = await Promise.all([
        apiClient.getServiceRequestById(requestId),
        apiClient.getServiceRequestQuoteList(requestId),
      ]);
      setRequest(reqRes.data || null);
      const baseQuotes = (quoteRes.data || []).map(q => ({
        ...q,
        total_paid:       parseFloat(q.total_paid   || 0),
        total_amount:     parseFloat(q.total_amount || 0),
        payment_count:    parseInt(q.payment_count  || 0, 10),
      }));
      // Line items aren't included in the list endpoint — fetch each
      // quotation's own detail (same endpoint the "Open" link uses) so the
      // items can be shown inline without an extra click per quotation.
      // Also pull in the companion PRODUCT quote's items (products/rentals
      // added via ModularQuoteBuilder's Products & Rentals section — linked
      // back via quotations.linked_quote_id, see getQuotesByRequest), since
      // those are a separate quotation record folded into one combined PDF/
      // total when sent (see quoteController.mergeProductQuoteIntoData) —
      // the on-screen total/remaining must match that combined figure, not
      // just the service quote's own total_amount.
      const withLineItems = await Promise.all(
        baseQuotes.map(async (q) => {
          try {
            const detail = await apiClient.getQuoteWithLineItems(q.quote_id);
            const line_items = Array.isArray(detail?.data?.line_items) ? detail.data.line_items : [];
            let product_line_items = [];
            let product_total = 0;
            // total_paid from getServiceRequestQuoteList only sums the SERVICE
            // quote's own payment_tracking rows — the linked PRODUCT quote's
            // invoice (paid separately via PaymentAllocationModal) lives in
            // the generic `invoices` table and is never included there. Fold
            // its paid amount in here so "Paid"/"Remaining" reflect reality.
            let product_paid = 0;
            if (q.product_quote_id) {
              try {
                const productDetail = await apiClient.getProductQuote(q.product_quote_id);
                product_line_items = expandProductLineItems(productDetail?.data?.line_items);
                product_total = product_line_items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0);
              } catch { /* non-critical */ }
              try {
                const invRes = await apiClient.getProductInvoices({ quote_id: q.product_quote_id });
                const invoices = Array.isArray(invRes?.data) ? invRes.data : [];
                product_paid = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
              } catch { /* non-critical */ }
            }
            const combined_total = q.total_amount + product_total;
            const combined_paid = q.total_paid + product_paid;
            return {
              ...q,
              line_items,
              product_line_items,
              product_total,
              combined_total,
              // Registration fee settlement (see paymentTrackingController.
              // recordPayment) is thresholded against the SERVICE-only paid
              // amount — preserve it before total_paid below is overwritten
              // with the combined service+product figure.
              service_paid: q.total_paid,
              total_paid: combined_paid,
              remaining_amount: Math.max(combined_total - combined_paid, 0),
            };
          } catch {
            return { ...q, line_items: [], product_line_items: [], product_total: 0, combined_total: q.total_amount, remaining_amount: Math.max(q.total_amount - q.total_paid, 0) };
          }
        })
      );
      setQuotes(withLineItems);
      return withLineItems;
    } catch (err) {
      setError(err.message || 'Failed to load service request');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (requestId) fetchData(); }, [requestId]);

  useEffect(() => {
    if (quotes.length > 0 && !selectedQuoteId) {
      setSelectedQuoteId(
        quotes.find(q => q.quote_id === request?.active_quote_id)?.quote_id || quotes[0].quote_id
      );
    }
  }, [quotes, request, selectedQuoteId]);

  const fetchPaymentHistory = async (quoteId) => {
    if (!quoteId) return;
    try {
      setPaymentHistoryLoading(true);
      const res = await apiClient.getQuotePayments(quoteId);
      setPaymentHistory(res.payments || []);
    } catch {
      setPaymentHistory([]);
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'payment' && selectedQuote?.quote_id) {
      fetchPaymentHistory(selectedQuote.quote_id);
    }
  }, [activeTab, selectedQuote?.quote_id]);

  const openEdit = () => {
    setEditForm({
      payer_name:             request.payer_name || '',
      payer_mobile:           request.payer_mobile || '',
      patient_name:           request.patient_name || '',
      patient_age:            request.patient_age || '',
      relationship_to_client: request.relationship_to_client || '',
      patient_condition:      request.patient_condition || '',
      service_type:           request.service_type || '',
      service_model:          request.service_model || 'SHIFT_BASED',
      location_address:       request.location_address || '',
      start_date:             request.start_date ? request.start_date.slice(0, 10) : '',
      remarks:                request.remarks || '',
      preferred_gender:       request.preferred_gender || 'ANY',
      status:                 request.status || 'NEW_LEAD',
    });
    setSaveError('');
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError('');
      const res = await apiClient.updateServiceRequest(requestId, editForm);
      setRequest(res.data);
      setEditMode(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // Fires after PaymentAllocationModal records payment against the service
  // portion and/or the linked PRODUCT invoice — mirrors handlePaymentSubmit's
  // post-success steps above. Receipt is offered after every payment; the
  // invoice is offered only once nothing is left to pay on this quote —
  // checked against the freshly refetched quotes (returned by fetchData),
  // since `quotes`/`selectedQuote` state won't reflect the new payment until
  // the next render.
  const handlePaymentAllocated = async () => {
    setShowPaymentModal(false);
    setPaymentSuccess('Payment recorded successfully.');
    const targetQuoteId = selectedQuote?.quote_id;
    const updatedQuotes = await fetchData();
    if (targetQuoteId) await fetchPaymentHistory(targetQuoteId);
    const updated = (updatedQuotes || []).find(q => q.quote_id === targetQuoteId);
    setInvoiceTarget(
      updated && updated.remaining_amount <= 0.01
        ? { quoteId: updated.quote_id, payerName: updated.payer_name || request?.payer_name, payerMobile: updated.payer_mobile || request?.payer_mobile }
        : null
    );
    setShowReceiptPopup(true);
  };

  const handleSendInvoice = async (quoteId) => {
    setSendingInvoiceQuoteId(quoteId);
    setInvoiceSentQuoteId('');
    try {
      setError('');
      await apiClient.sendCombinedInvoice(quoteId);
      setInvoiceSentQuoteId(quoteId);
    } catch (err) {
      setError(err.message || 'Failed to send invoice');
    } finally {
      setSendingInvoiceQuoteId('');
    }
  };

  const handleProceed = async (quote = selectedQuote) => {
    if (!quote || !request) return;
    try {
      setProceeding(true);
      setError('');
      const check = await apiClient.checkQuoteBooking(quote.quote_id);
      const { has_booking, booking_id: existingBookingId } = check?.data || {};
      if (has_booking && existingBookingId) {
        // Fetch the full booking so the roster panel has complete data immediately
        const existingRes = await apiClient.getAdminBookingDetail(existingBookingId);
        navigate(`/admin/bookings/${existingBookingId}/staff-roster`, {
          state: { request, quote, booking: existingRes?.data || null },
        });
        return;
      }
      if (!window.confirm(`Create a booking for ${quote.estimate_number} and proceed to staff selection?`)) return;
      const bookingResult = await apiClient.convertToBooking({
        request_id: request.request_id,
        quote_id: quote.quote_id,
      });
      // Pass the booking object returned by convertToBooking so the roster
      // never needs to cold-fetch it — fetchBookingDetails short-circuits when booking is set
      navigate(`/admin/bookings/${bookingResult?.data?.booking_id}/staff-roster`, {
        state: { request, quote, booking: bookingResult?.data || null },
      });
    } catch (err) {
      setError(err.message || 'Failed to proceed');
    } finally {
      setProceeding(false);
    }
  };

  const setQuoteAction = (quoteId, busy) =>
    setQuoteActionLoading(prev => ({ ...prev, [quoteId]: busy }));

  const updateQuoteInState = (quoteId, patch) =>
    setQuotes(prev => prev.map(q => q.quote_id === quoteId ? { ...q, ...patch } : q));

  const handleAcceptQuote = async (quoteId) => {
    setQuoteAction(quoteId, 'accepting');
    setError('');
    try {
      await apiClient.updateQuoteStatus(quoteId, 'ACCEPTED');
      updateQuoteInState(quoteId, { status: 'ACCEPTED' });
    } catch (err) {
      setError(err.message || 'Failed to accept quotation');
    } finally {
      setQuoteAction(quoteId, null);
    }
  };

  const handleRejectQuote = async (quoteId, estimateNumber) => {
    if (!window.confirm(`Reject quotation ${estimateNumber}? This cannot be undone.`)) return;
    setQuoteAction(quoteId, 'rejecting');
    setError('');
    try {
      await apiClient.updateQuoteStatus(quoteId, 'REJECTED');
      updateQuoteInState(quoteId, { status: 'REJECTED' });
    } catch (err) {
      setError(err.message || 'Failed to reject quotation');
    } finally {
      setQuoteAction(quoteId, null);
    }
  };

  // productQuoteId folds the companion PRODUCT quote's items (products/
  // rentals added via ModularQuoteBuilder's Products & Rentals section) into
  // this same PDF/message server-side (see quoteController.mergeProductQuoteIntoData)
  // — without it, only the service quote's own charges would be included.
  const handleSendQuotePdf = async (quoteId, productQuoteId) => {
    setQuoteAction(quoteId, 'sending');
    setError('');
    try {
      await apiClient.sendQuotePDF(quoteId, productQuoteId);
      updateQuoteInState(quoteId, { status: 'SENT' });
    } catch (err) {
      setError(err.message || 'Failed to send quotation PDF');
    } finally {
      setQuoteAction(quoteId, null);
    }
  };

  const handleDownloadQuotePdf = async (quoteId, productQuoteId) => {
    setQuoteAction(quoteId, 'downloading');
    setError('');
    try {
      const res = await apiClient.generateQuotePdf(quoteId, productQuoteId);
      const url = res?.pdf_url || res?.data?.pdf_url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else setError('PDF URL not returned by server.');
    } catch (err) {
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setQuoteAction(quoteId, null);
    }
  };

  const set = (field) => (v) => setEditForm(f => ({ ...f, [field]: v }));

  // ── loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <AdminLayout title="Service Request" subtitle="Loading…">
        <div className="flex items-start gap-4">
          <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 rounded-xl border border-gray-200 bg-white lg:flex">
            <ServiceRequestSwitcherSidebar activeRequestId={requestId} />
          </aside>
          <div className="flex flex-1 items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!request) {
    return (
      <AdminLayout title="Service Request">
        <div className="flex items-start gap-4">
          <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 rounded-xl border border-gray-200 bg-white lg:flex">
            <ServiceRequestSwitcherSidebar activeRequestId={requestId} />
          </aside>
          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-12 text-center">
            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Service request not found.</p>
            <button onClick={() => navigate('/admin/service-requests')} className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to list
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const reqStatus = editMode ? editForm.status : request.status;
  const reqStatusCfg = REQUEST_STATUS_CONFIG[reqStatus] || REQUEST_STATUS_CONFIG.PENDING;

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <AdminLayout
      title="Service Request"
      subtitle={request.service_request_code || `#${requestId}`}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileRequestSidebarOpen(true)}
            className="lg:hidden inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Menu className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => navigate('/admin/service-requests')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      }
    >

      {error && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-start gap-4">
        <aside className="sticky top-6 hidden h-[calc(100vh-8rem)] w-64 shrink-0 rounded-xl border border-gray-200 bg-white lg:flex">
          <ServiceRequestSwitcherSidebar activeRequestId={requestId} />
        </aside>

        {mobileRequestSidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileRequestSidebarOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 bg-white shadow-xl">
              <ServiceRequestSwitcherSidebar
                activeRequestId={requestId}
                onNavigate={() => setMobileRequestSidebarOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-4">

        <PipelineStepper completedCount={pipelineCompletedCount} />

        {/* ── HERO CARD ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

          {/* Top summary bar */}
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">

            {/* Left: identity */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5 mb-1">
                <h2 className="text-lg font-bold text-slate-900 truncate">
                  {editMode ? editForm.payer_name || '—' : request.payer_name}
                </h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${reqStatusCfg.bg} ${reqStatusCfg.text} ${reqStatusCfg.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${reqStatusCfg.dot}`} />
                  {reqStatusCfg.label}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {request.service_request_code || `Request #${requestId}`} &middot; Created {fmt(request.created_at)}
              </p>
            </div>

            {/* Right: edit controls */}
            <div className="flex shrink-0 items-center gap-2">
              {!editMode ? (
                <button
                  onClick={openEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit Request
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setEditMode(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </div>

          {saveError && (
            <div className="mx-6 mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {saveError}
            </div>
          )}

          {/* At-a-glance chips */}
          {!editMode && (
            <div className="border-t border-slate-100 px-6 py-3 bg-slate-50 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{request.payer_mobile || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Heart className="w-3.5 h-3.5 text-slate-400" />
                <span>{request.patient_name || '—'}</span>
                {request.patient_age && <span className="text-slate-400">· Age {request.patient_age}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{serviceLabel(request.service_type)}</span>
                {request.service_model && <span className="text-slate-400">· {modelLabel(request.service_model)}</span>}
              </div>
              {request.start_date && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Starts {fmt(request.start_date)}</span>
                </div>
              )}
              {request.location_address && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[220px]">{request.location_address}</span>
                </div>
              )}
            </div>
          )}

          {/* Tab strip */}
          <div className="flex items-center gap-1 border-t border-slate-100 px-6">
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative py-3.5 px-1 mr-4 text-sm font-medium transition-colors ${
                  activeTab === tab.key ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {tab.key === 'quotations' && (
                  <span className="ml-1.5 text-xs text-slate-400">({quotes.length})</span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── BODY ──────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Main content — 2/3 */}
          <div className="lg:col-span-2 space-y-4">

            {/* ── DETAILS TAB ── */}
            {activeTab === 'details' && (
              <>
                {editMode ? (
                  /* Edit form */
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Editing Request Details</p>
                    </div>
                    <div className="p-5 space-y-6">

                      {/* Payer */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client / Payer</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Full Name</label>
                            <input type="text" value={editForm.payer_name} onChange={e => set('payer_name')(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Mobile Number</label>
                            <PhoneInput value={editForm.payer_mobile} onChange={e => set('payer_mobile')(e.target.value)} />
                          </div>
                          <div className="sm:col-span-2">
                            <label className={labelCls}>Service Address</label>
                            <textarea value={editForm.location_address} onChange={e => set('location_address')(e.target.value)} rows={2} className={inputCls} />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* Care Profile */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Heart className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Full Name</label>
                            <input type="text" value={editForm.patient_name} onChange={e => set('patient_name')(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className={labelCls}>Age</label>
                            <input type="number" value={editForm.patient_age} onChange={e => set('patient_age')(e.target.value)} className={inputCls} min="1" />
                          </div>
                          <div>
                            <label className={labelCls}>Relationship to Client</label>
                            <select value={editForm.relationship_to_client} onChange={e => set('relationship_to_client')(e.target.value)} className={inputCls}>
                              <option value="">— Select —</option>
                              {RELATIONSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Medical Condition</label>
                            <input type="text" value={editForm.patient_condition} onChange={e => set('patient_condition')(e.target.value)} className={inputCls} placeholder="Condition or care needs" />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* Service */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <BadgeCheck className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Service Configuration</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>Service Role</label>
                            <select value={editForm.service_type} onChange={e => set('service_type')(e.target.value)} className={inputCls}>
                              <option value="">— Select role —</option>
                              {SERVICE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Service Model</label>
                            <select value={editForm.service_model} onChange={e => set('service_model')(e.target.value)} className={inputCls}>
                              {SERVICE_MODEL_OPTIONS.map(o => <option key={o} value={o}>{modelLabel(o)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Preferred Staff Gender</label>
                            <select value={editForm.preferred_gender} onChange={e => set('preferred_gender')(e.target.value)} className={inputCls}>
                              {GENDER_OPTIONS.map(o => <option key={o} value={o}>{o.charAt(0) + o.slice(1).toLowerCase()}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Request Status</label>
                            <select value={editForm.status} onChange={e => set('status')(e.target.value)} className={inputCls}>
                              {REQUEST_STATUS_OPTIONS.map(o => <option key={o} value={o}>{REQUEST_STATUS_CONFIG[o]?.label ?? o}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className={labelCls}>Preferred Start Date</label>
                            <DateInput value={editForm.start_date} onChange={e => set('start_date')(e.target.value)} min={todayISO()} className={inputCls} />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      <div>
                        <label className={labelCls}>Additional Remarks</label>
                        <textarea value={editForm.remarks} onChange={e => set('remarks')(e.target.value)} rows={3} className={inputCls} placeholder="Special requirements or notes" />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="space-y-4">

                    {/* Payer + Care Profile side-by-side */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      {/* Payer card */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client / Payer</p>
                        </div>
                        <div className="p-4 grid grid-cols-1 gap-3">
                          <InfoRow label="Full Name" value={request.payer_name} />
                          <InfoRow label="Mobile" value={request.payer_mobile} />
                          {request.client_code && <InfoRow label="Client Code" value={request.client_code} />}
                          {request.location_address && (
                            <div>
                              <p className="text-xs text-slate-400 mb-0.5">Service Address</p>
                              <p className="text-sm font-medium text-slate-900 leading-relaxed">{request.location_address}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Care profile card */}
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                          <Heart className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</p>
                        </div>
                        <div className="p-4 grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <InfoRow label="Full Name" value={request.patient_name} />
                          </div>
                          <InfoRow label="Age" value={request.patient_age} />
                          <InfoRow label="Relationship" value={request.relationship_to_client} />
                          {request.patient_condition && (
                            <div className="col-span-2">
                              <p className="text-xs text-slate-400 mb-1">Condition / Needs</p>
                              <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                                <p className="text-sm text-slate-700 leading-relaxed">{request.patient_condition}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Service config card */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <BadgeCheck className="w-3.5 h-3.5 text-slate-400" />
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Service Configuration</p>
                      </div>
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <InfoRow label="Role / Type" value={serviceLabel(request.service_type)} />
                        <InfoRow label="Service Model" value={modelLabel(request.service_model)} />
                        <InfoRow label="Preferred Gender" value={request.preferred_gender || 'Any'} />
                        <InfoRow label="Start Date" value={fmt(request.start_date)} />
                      </div>
                    </div>

                    {/* Remarks */}
                    {request.remarks && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">Remarks</p>
                        <p className="text-sm leading-relaxed text-amber-900">{request.remarks}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── QUOTATIONS TAB ── */}
            {activeTab === 'quotations' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Quotation History</p>
                    <p className="text-xs text-slate-400 mt-0.5">{quotes.length} quotation{quotes.length !== 1 ? 's' : ''} for this request</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/modular-quote-builder/${request.request_id}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Quotation
                  </button>
                </div>

                {quotes.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">No quotations yet</p>
                    <p className="text-xs text-slate-400 mt-1">Create the first quotation for this request</p>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/modular-quote-builder/${request.request_id}`)}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="h-4 w-4" /> Build Quotation
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {quotes.map(quote => {
                      const payStatus    = getQuoteStatus(quote);
                      const payCfg       = QUOTE_STATUS_CONFIG[payStatus];
                      const approvalCfg  = QUOTE_APPROVAL_CONFIG[quote.status] || QUOTE_APPROVAL_CONFIG.DRAFT;
                      const isSelected   = selectedQuote?.quote_id === quote.quote_id;
                      const isRejected   = quote.status === 'REJECTED';
                      const actionKey    = quoteActionLoading[quote.quote_id];
                      const canDecide    = !['ACCEPTED', 'REJECTED'].includes(quote.status);

                      return (
                        <li
                          key={quote.quote_id}
                          className={`px-5 py-4 transition-colors ${
                            isRejected
                              ? 'opacity-50 bg-slate-50'
                              : isSelected
                              ? 'bg-blue-50'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Header row */}
                          <div
                            className={`flex flex-wrap items-start justify-between gap-3 ${isRejected ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                            role={isRejected ? undefined : 'button'}
                            tabIndex={isRejected ? -1 : 0}
                            onClick={() => !isRejected && setSelectedQuoteId(quote.quote_id)}
                            onKeyDown={e => !isRejected && e.key === 'Enter' && setSelectedQuoteId(quote.quote_id)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isSelected
                                ? <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                : <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                              }
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold text-slate-900">{quote.estimate_number}</span>
                                  {/* Approval status */}
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${approvalCfg.bg} ${approvalCfg.text} ${approvalCfg.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${approvalCfg.dot}`} />
                                    {approvalCfg.label}
                                  </span>
                                  {/* Payment status */}
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${payCfg.bg} ${payCfg.text} ${payCfg.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${payCfg.dot}`} />
                                    {payCfg.label}
                                  </span>
                                  {quote.booking_id && (
                                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                                      Booking Linked
                                    </span>
                                  )}
                                  {request.active_quote_id === quote.quote_id && (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  Created {new Date(quote.created_at).toLocaleString('en-LK')} &middot; {quote.payment_count} payment{quote.payment_count !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); navigate(`/admin/quotations/${quote.quote_id}`); }}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> Open
                            </button>
                          </div>

                          {/* Money stats */}
                          <div className="mt-3 ml-6 grid grid-cols-3 gap-2">
                            <QuoteStat label="Total"     value={money(quote.combined_total)} />
                            <QuoteStat label="Paid"      value={money(quote.total_paid)}          accent="text-emerald-700" />
                            <QuoteStat label="Remaining" value={money(quote.remaining_amount)}     accent="text-amber-700" />
                          </div>

                          <div className="ml-6">
                            <RegFeeAllocationCard info={getRegFeeInfo(quote.service_paid, quote.line_items)} />
                          </div>

                          {/* Quotation items — the service quote's own charges/discounts,
                              plus a companion PRODUCT quote's items (products/rentals/
                              deposits added via ModularQuoteBuilder), if one exists. These
                              are two separate quotation records that get merged into one
                              PDF/message when sent (see quoteController.mergeProductQuoteIntoData). */}
                          {(quote.line_items?.length > 0 || quote.product_line_items?.length > 0) && (
                            <div className="mt-3 ml-6 rounded-lg border border-slate-100 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-slate-400">
                                  <tr>
                                    <th className="text-left font-medium px-3 py-1.5">Item &amp; Description</th>
                                    <th className="text-right font-medium px-3 py-1.5 w-16">Qty</th>
                                    <th className="text-right font-medium px-3 py-1.5 w-24">Rate</th>
                                    <th className="text-right font-medium px-3 py-1.5 w-28">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {[...quote.line_items, ...(quote.product_line_items || [])].map((li) => {
                                    const isDiscount = li.item_type === 'DISCOUNT';
                                    const amount = Math.abs(parseFloat(li.amount) || 0);
                                    return (
                                      <tr key={li.line_item_id}>
                                        <td className={`px-3 py-1.5 ${li.isProductItem ? 'text-purple-700' : 'text-slate-700'}`}>
                                          {li.description}
                                          {isDiscount && <span className="ml-1.5 text-[10px] text-slate-400">(Discount)</span>}
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{parseFloat(li.quantity) || 1}</td>
                                        <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">{money(li.unit_price)}</td>
                                        <td className={`px-3 py-1.5 text-right font-medium tabular-nums ${isDiscount ? 'text-red-600' : li.isProductItem ? 'text-purple-800' : 'text-slate-800'}`}>
                                          {isDiscount ? `(${money(amount)})` : money(amount)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="mt-3 ml-6 flex items-center gap-2 flex-wrap">
                            {/* Send to client */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleSendQuotePdf(quote.quote_id, quote.product_quote_id); }}
                              disabled={!!actionKey || isRejected}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors"
                            >
                              {actionKey === 'sending'
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Send className="h-3 w-3" />
                              }
                              {actionKey === 'sending' ? 'Sending…' : 'Send to Client'}
                            </button>

                            {/* Download PDF */}
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleDownloadQuotePdf(quote.quote_id, quote.product_quote_id); }}
                              disabled={!!actionKey || isRejected}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors"
                            >
                              {actionKey === 'downloading'
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Download className="h-3 w-3" />
                              }
                              {actionKey === 'downloading' ? 'Generating…' : 'Download PDF'}
                            </button>

                            {/* Accept — only when not yet decided */}
                            {canDecide && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleAcceptQuote(quote.quote_id); }}
                                disabled={!!actionKey}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                              >
                                {actionKey === 'accepting'
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <ThumbsUp className="h-3 w-3" />
                                }
                                {actionKey === 'accepting' ? 'Accepting…' : 'Accept'}
                              </button>
                            )}

                            {/* Reject — only when not yet decided */}
                            {canDecide && (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); handleRejectQuote(quote.quote_id, quote.estimate_number); }}
                                disabled={!!actionKey}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                              >
                                {actionKey === 'rejecting'
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <ThumbsDown className="h-3 w-3" />
                                }
                                {actionKey === 'rejecting' ? 'Rejecting…' : 'Reject'}
                              </button>
                            )}

                            {/* Accepted/Rejected confirmation chip */}
                            {quote.status === 'ACCEPTED' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Client accepted
                              </span>
                            )}
                            {quote.status === 'REJECTED' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                                <ThumbsDown className="h-3.5 w-3.5" /> Client rejected
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {quotes.length > 0 && (
                  <div className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">
                    Click a quotation to select it for payment registration
                  </div>
                )}
              </div>
            )}

            {/* ── PAYMENT TAB ── */}
            {activeTab === 'payment' && (
              <div className="space-y-4">
                {!selectedQuote ? (
                  <div className="bg-white rounded-xl border border-slate-200 px-5 py-12 text-center">
                    <CircleDollarSign className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">No quotation selected</p>
                    <p className="text-xs text-slate-400 mt-1">Go to the Quotations tab and select a quote first</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('quotations')}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <FileText className="h-4 w-4" /> Go to Quotations
                    </button>
                  </div>
                ) : (
                  <>
                    {/* ── Selected quotation summary ── */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Quotation</p>
                        </div>
                        <button
                          onClick={() => navigate(`/admin/quotations/${selectedQuote.quote_id}`)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" /> Open
                        </button>
                      </div>
                      <div className="px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{selectedQuote.estimate_number}</p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Created {new Date(selectedQuote.created_at).toLocaleDateString('en-LK')}
                              &nbsp;&middot;&nbsp;{selectedQuote.payment_count} payment{selectedQuote.payment_count !== 1 ? 's' : ''} recorded
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusDot status={QUOTE_APPROVAL_CONFIG[selectedQuote.status] ? selectedQuote.status : 'DRAFT'} config={QUOTE_APPROVAL_CONFIG} />
                            <StatusDot status={selectedQuoteStatus} config={QUOTE_STATUS_CONFIG} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <QuoteStat label="Total"     value={money(selectedQuote.combined_total)} />
                          <QuoteStat label="Paid"      value={money(selectedQuote.total_paid)}       accent="text-emerald-700" />
                          <QuoteStat label="Remaining" value={money(selectedQuote.remaining_amount)} accent="text-amber-700" />
                        </div>

                        <RegFeeAllocationCard info={getRegFeeInfo(selectedQuote.service_paid, selectedQuote.line_items)} />

                        {/* Combined Invoice — generated the first time either the
                            service or a linked product portion is paid in full
                            (see quoteController.ensureCombinedInvoice). Not
                            present until then. */}
                        {selectedQuote.invoice_code && (
                          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                            <span className="text-xs font-medium text-slate-500">
                              Invoice <span className="font-mono text-slate-700">{selectedQuote.invoice_code}</span>
                            </span>
                            <a
                              href={selectedQuote.invoice_pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Download className="h-3.5 w-3.5" /> Download Invoice
                            </a>
                            <button
                              type="button"
                              onClick={() => handleSendInvoice(selectedQuote.quote_id)}
                              disabled={sendingInvoiceQuoteId === selectedQuote.quote_id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {sendingInvoiceQuoteId === selectedQuote.quote_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                              {invoiceSentQuoteId === selectedQuote.quote_id ? 'Sent!' : 'Send to Client'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Proceed to Booking — always available */}
                      <div className="px-5 pb-5">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800">Proceed to Booking</p>
                            <p className="text-xs text-slate-400 mt-0.5">Create a booking for this service request — payment is not required to proceed.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleProceed()}
                            disabled={proceeding}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {proceeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                            {proceeding ? 'Creating booking…' : 'Proceed to Staff Roster'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── Make Payment ── */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Make Payment</p>
                        <p className="text-xs text-slate-400 mt-0.5">Record a payment against {selectedQuote.estimate_number}</p>
                      </div>

                      {paymentSuccess && (
                        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                          {paymentSuccess}
                        </div>
                      )}

                      <div className="px-5 pb-5 pt-4">
                        <button
                          type="button"
                          onClick={() => { setPaymentSuccess(''); setShowPaymentModal(true); }}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                        >
                          <CircleDollarSign className="h-4 w-4" />
                          Record Payment
                        </button>
                      </div>
                    </div>

                    {/* ── Payment history ── */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment History</p>
                        <p className="text-xs text-slate-400 mt-0.5">All payments recorded against {selectedQuote.estimate_number}</p>
                      </div>

                      {paymentHistoryLoading ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                      ) : paymentHistory.length === 0 ? (
                        <div className="px-5 py-10 text-center">
                          <CircleDollarSign className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No payments recorded yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {paymentHistory.map((p, i) => {
                            const amt = parseFloat(p.amount || 0);
                            const methodLabel = {
                              BANK_TRANSFER: 'Bank Transfer',
                              CASH_DEPOSIT:  'Cash Deposit',
                              CASH:          'Cash',
                              CHEQUE:        'Cheque',
                            }[p.payment_method] || p.payment_method || '—';
                            const statusCfg = {
                              VERIFIED: { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Verified' },
                              REJECTED: { cls: 'bg-red-50 text-red-600 border-red-200',            label: 'Rejected' },
                              PENDING:  { cls: 'bg-slate-50 text-slate-500 border-slate-200',      label: 'Pending' },
                            }[p.status] || { cls: 'bg-slate-50 text-slate-500 border-slate-200', label: p.status || 'Pending' };
                            return (
                              <div key={p.payment_id || i} className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-slate-900">
                                      LKR {amt.toLocaleString('en-LK', { minimumFractionDigits: 2 })}
                                    </p>
                                    <span className="text-xs text-slate-400 font-medium">{methodLabel}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {p.payment_date
                                      ? new Date(p.payment_date).toLocaleString('en-LK', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                                      : '—'}
                                    {p.reference_number && ` · Ref: ${p.reference_number}`}
                                    {p.bank_account?.account_nickname && ` · ${p.bank_account.account_nickname}`}
                                    {p.notes && ` · ${p.notes}`}
                                  </p>
                                </div>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusCfg.cls}`}>
                                  {statusCfg.label}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-4">

            {/* Next step prompt */}
            {quotes.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Next Step</p>
                <p className="text-sm text-slate-800 font-medium">Create a quotation</p>
                <p className="text-xs text-slate-400 mt-0.5 mb-3">No quotations exist yet for this request.</p>
                <button
                  onClick={() => navigate(`/admin/modular-quote-builder/${request.request_id}`)}
                  className="inline-flex items-center gap-1.5 w-full justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Build Quotation
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Actions</p>
                  <p className="text-xs text-slate-400">{selectedQuote?.estimate_number}</p>
                </div>
                <button
                  onClick={() => handleProceed()}
                  disabled={proceeding}
                  className="inline-flex items-center gap-1.5 w-full justify-center rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {proceeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  {proceeding ? 'Creating booking…' : 'Proceed to Booking'}
                </button>
                <button
                  onClick={() => setActiveTab('payment')}
                  className="inline-flex items-center gap-1.5 w-full justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <CircleDollarSign className="h-3.5 w-3.5" /> Record Payment
                </button>
              </div>
            )}

            {/* Selected quotation card */}
            {selectedQuote && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Selected Quote</p>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/quotations/${selectedQuote.quote_id}`)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" /> Open
                  </button>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-slate-900 text-sm">{selectedQuote.estimate_number}</p>
                    <StatusDot status={selectedQuoteStatus} config={QUOTE_STATUS_CONFIG} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <QuoteStat label="Total"     value={money(selectedQuote.combined_total)} />
                    <QuoteStat label="Paid"      value={money(selectedQuote.total_paid)}          accent="text-emerald-700" />
                    <QuoteStat label="Remaining" value={money(selectedQuote.remaining_amount)}     accent="text-amber-700" />
                    <QuoteStat label="Payments"  value={String(selectedQuote.payment_count)} />
                  </div>
                </div>
              </div>
            )}

            {/* Request overview */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quick Overview</p>
              </div>
              <div className="p-4 space-y-2.5">
                <SidebarField label="Status"       value={<StatusDot status={request.status} config={REQUEST_STATUS_CONFIG} />} />
                <SidebarField label="Role"         value={serviceLabel(request.service_type)} />
                <SidebarField label="Model"        value={modelLabel(request.service_model)} />
                <SidebarField label="Gender Pref"  value={request.preferred_gender || 'Any'} />
                <SidebarField label="Start Date"   value={fmt(request.start_date)} />
                <SidebarField label="Quotations"   value={`${quotes.length} total`} />
                <SidebarField label="Created"      value={fmt(request.created_at)} />
              </div>
            </div>

          </div>
        </div>
        </div>
      </div>
      {showPaymentModal && selectedQuote && (
        <PaymentAllocationModal
          quoteId={selectedQuote.quote_id}
          onClose={() => setShowPaymentModal(false)}
          onRecorded={handlePaymentAllocated}
        />
      )}

      <ReceiptSendPopup
        open={showReceiptPopup}
        clientId={request?.client_id}
        payerName={request?.payer_name}
        payerMobile={request?.payer_mobile}
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

// ─── micro-components ─────────────────────────────────────────────────────────

const QuoteStat = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-0.5 text-sm font-semibold ${accent}`}>{value}</p>
  </div>
);

const SidebarField = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
    <dd className="text-right text-sm font-medium text-slate-800 min-w-0">
      {typeof value === 'string' || typeof value === 'number'
        ? (value != null && value !== '' ? String(value) : <span className="font-normal text-slate-400">—</span>)
        : value
      }
    </dd>
  </div>
);

export default ServiceRequestSummaryPage;
