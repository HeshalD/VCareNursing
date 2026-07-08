import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  Phone,
  MapPin,
  FileText,
  Send,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Plus,
  Eye,
  Edit3,
  Tag,
  Download,
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Percent,
} from 'lucide-react';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import PresetManager from '../service_quotes/PresetManager';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm text-gray-800 font-medium">{value || '—'}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Inline editable line-item row (Zoho-style)
// ---------------------------------------------------------------------------
const LineItemRow = ({ item, index, isFirst, isLast, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  const isDiscount = item.item_type === 'DISCOUNT';
  const qty        = parseFloat(item.quantity)  || 0;
  const rate       = parseFloat(item.unit_price) || 0;
  const amount     = parseFloat(item.amount)     || 0;

  const set = (field, value) => {
    const next = { ...item, [field]: value };
    if (field === 'quantity' || field === 'unit_price') {
      const q = parseFloat(field === 'quantity'  ? value : item.quantity)  || 0;
      const r = parseFloat(field === 'unit_price' ? value : item.unit_price) || 0;
      next.amount = isDiscount ? -(q * r) : q * r;
    }
    onUpdate(next);
  };

  return (
    <tr className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
      {/* # */}
      <td className="py-3 pl-4 w-8 text-[12px] text-gray-300 select-none">{index + 1}</td>

      {/* Item / Description */}
      <td className="py-2 pr-3">
        <input
          value={item.description || ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Type to enter item details"
          className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
        />
        {isDiscount && (
          <span className="text-[11px] text-gray-400 font-medium">Discount</span>
        )}
      </td>

      {/* Qty */}
      <td className="py-2 pr-3 w-24">
        <input
          type="number"
          min="0"
          value={item.quantity ?? 1}
          onChange={(e) => set('quantity', e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
      </td>

      {/* Rate */}
      <td className="py-2 pr-3 w-32">
        <input
          type="number"
          min="0"
          value={item.unit_price ?? 0}
          onChange={(e) => set('unit_price', e.target.value)}
          className="w-full text-sm text-gray-800 bg-transparent border-0 outline-none focus:ring-0 text-right p-0 tabular-nums"
        />
      </td>

      {/* Amount */}
      <td className={`py-2 pr-2 w-32 text-right text-sm tabular-nums font-medium select-none ${isDiscount ? 'text-gray-500' : 'text-gray-900'}`}>
        {isDiscount ? `(${fmt(Math.abs(amount))})` : fmt(amount)}
      </td>

      {/* Actions */}
      <td className="py-2 pr-3 w-20">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Quote Preview Panel
// ---------------------------------------------------------------------------
const QuotePreviewPanel = ({
  serviceRequest,
  validLineItems,
  termsConditions,
  onBack,
  onGenerateDownload,
  onGenerateSend,
  onSend,
  onResend,
  loadingAction,
  deliveryState,
  error,
}) => {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const charges        = validLineItems.filter(i => i.item_type === 'CHARGE');
  const discounts      = validLineItems.filter(i => i.item_type === 'DISCOUNT');
  const totalCharges   = charges.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDiscounts = discounts.reduce((s, i) => s + Math.abs(parseFloat(i.amount) || 0), 0);
  const grandTotal     = totalCharges - totalDiscounts;
  const busy           = !!loadingAction;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
      >
        <Edit3 className="w-3.5 h-3.5" />
        Back to edit
      </button>

      {/* Document */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Header bar */}
        <div className="px-8 py-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h1 className="text-base font-semibold text-gray-900">VCare Nursing</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">Professional Home Care Services</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Quotation — Draft</p>
            <p className="text-[12px] text-gray-500 mt-1">{today}</p>
          </div>
        </div>

        {/* Bill-to grid */}
        <div className="px-8 py-5 border-b border-gray-100 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Billed To</p>
            <p className="text-sm font-semibold text-gray-900">{serviceRequest.payer_name}</p>
            <p className="text-[12px] text-gray-500 mt-0.5">{serviceRequest.payer_mobile}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Care Recipient</p>
            <p className="text-sm font-semibold text-gray-900">{serviceRequest.patient_name}</p>
            {serviceRequest.patient_age && (
              <p className="text-[12px] text-gray-500 mt-0.5">Age {serviceRequest.patient_age}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Service</p>
            <p className="text-[12px] text-gray-700">{serviceRequest.service_type?.replace(/_/g, ' ')}</p>
            {serviceRequest.service_model && (
              <p className="text-[12px] text-gray-500">{serviceRequest.service_model.replace(/_/g, ' ')}</p>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Location</p>
            <p className="text-[12px] text-gray-700">{serviceRequest.location_address || '—'}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="px-8 py-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 w-8">#</th>
                <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400">Item &amp; Description</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-20">Qty</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-28">Rate</th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {validLineItems.map((item, idx) => {
                const isDiscount = item.item_type === 'DISCOUNT';
                const amount     = Math.abs(parseFloat(item.amount) || 0);
                const unitPrice  = parseFloat(item.unit_price) || 0;
                const qty        = parseFloat(item.quantity) || 1;
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-3 text-[12px] text-gray-300">{idx + 1}</td>
                    <td className="py-3">
                      <p className="text-sm font-medium text-gray-800">{item.description}</p>
                      {isDiscount && <p className="text-[11px] text-gray-400 mt-0.5">Discount</p>}
                    </td>
                    <td className="py-3 text-right text-sm text-gray-600 tabular-nums">{qty}</td>
                    <td className="py-3 text-right text-sm text-gray-600 tabular-nums">{fmt(unitPrice)}</td>
                    <td className={`py-3 text-right text-sm tabular-nums font-medium ${isDiscount ? 'text-gray-500' : 'text-gray-900'}`}>
                      {isDiscount ? `(${fmt(amount)})` : fmt(amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-col items-end gap-1.5">
            <div className="flex justify-between w-52 text-[13px] text-gray-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{fmt(totalCharges)}</span>
            </div>
            {totalDiscounts > 0 && (
              <div className="flex justify-between w-52 text-[13px] text-gray-500">
                <span>Discounts</span>
                <span className="tabular-nums">({fmt(totalDiscounts)})</span>
              </div>
            )}
            <div className="flex justify-between w-52 text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
              <span>Total</span>
              <span className="tabular-nums">LKR {fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        {termsConditions && (
          <div className="px-8 pb-6">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">Terms &amp; Conditions</p>
            <p className="text-[12px] text-gray-600 leading-relaxed">{termsConditions}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-[13px] text-red-700">{error}</span>
        </div>
      )}

      {/* Action buttons */}
      {!deliveryState && (
        <div className="flex gap-3">
          <button
            onClick={onGenerateDownload}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'downloading' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500" />Generating…</>
            ) : (
              <><Download className="w-4 h-4" />Generate &amp; Download</>
            )}
          </button>
          <button
            onClick={onGenerateSend}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'sending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Sending…</>
            ) : (
              <><Send className="w-4 h-4" />Generate &amp; Send</>
            )}
          </button>
        </div>
      )}

      {deliveryState === 'downloaded' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
            PDF downloaded successfully.
          </div>
          <button
            onClick={onSend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'sending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Sending…</>
            ) : (
              <><Send className="w-4 h-4" />Send via WhatsApp</>
            )}
          </button>
        </div>
      )}

      {deliveryState === 'sent' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-gray-500 flex-shrink-0" />
            Quote sent to client via WhatsApp.
          </div>
          <button
            onClick={onResend}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingAction === 'resending' ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />Resending…</>
            ) : (
              <><RefreshCw className="w-4 h-4" />Resend via WhatsApp</>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ModularQuoteBuilder = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [serviceRequest, setServiceRequest] = useState(null);
  const [clientProfile, setClientProfile]   = useState(null);
  const [presets, setPresets]               = useState([]);
  const [lineItems, setLineItems]           = useState([]);
  const [termsConditions, setTermsConditions] = useState(
    'The initial estimated amount is non-refundable.'
  );
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);

  // Preview / delivery
  const [showPreview, setShowPreview]     = useState(false);
  const [createdQuote, setCreatedQuote]   = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [deliveryState, setDeliveryState] = useState(null);

  useEffect(() => {
    if (requestId) {
      fetchServiceRequest();
      fetchPresets();
    } else {
      fetchNewLeads();
    }
  }, [requestId]);

  const fetchServiceRequest = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getServiceRequestById(requestId);
      setServiceRequest(res.data);
      if (res.data.client_id) {
        try {
          const cr = await apiClient.getClientProfile(res.data.client_id);
          setClientProfile(cr.data);
        } catch { /* non-critical */ }
      }
    } catch (err) {
      setError(err.message?.includes('404') ? 'Service request not found' : 'Failed to fetch service request');
    } finally {
      setLoading(false);
    }
  };

  const fetchNewLeads = async () => {
    try {
      setLoading(true);
      const res   = await apiClient.getNewLeads();
      const leads = res.data || [];
      if (leads.length === 0) { setError('No new leads found'); return; }
      setServiceRequest(leads[0]);
      navigate(`/admin/modular-quote-builder/${leads[0].request_id}`, { replace: true });
    } catch { setError('Failed to fetch new leads'); }
    finally { setLoading(false); }
  };

  const fetchPresets = async () => {
    try {
      const res  = await fetch('/api/quotes/presets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setPresets(data.data || []);
    } catch { /* non-critical */ }
  };

  // ── Line item helpers ──────────────────────────────────────────────────────
  const addPresetItem = (p) =>
    setLineItems(prev => [...prev, { ...p, sort_order: prev.length }]);

  const addItem = (type) =>
    setLineItems(prev => [
      ...prev,
      { item_type: type, description: '', quantity: 1, unit_price: 0, amount: 0, sort_order: prev.length },
    ]);

  const updateLineItem = (index, updated) => {
    const next = [...lineItems];
    next[index] = updated;
    setLineItems(next);
  };

  const deleteLineItem = (index) =>
    setLineItems(lineItems.filter((_, i) => i !== index).map((it, i) => ({ ...it, sort_order: i })));

  const moveLineItem = (index, dir) => {
    const next   = [...lineItems];
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= lineItems.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLineItems(next.map((it, i) => ({ ...it, sort_order: i })));
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isItemValid = (item) =>
    item.description?.trim() && Math.abs(parseFloat(item.amount) || 0) > 0;

  const validLineItems = lineItems.filter(isItemValid);
  const skippedCount   = lineItems.length - validLineItems.length;

  const charges        = validLineItems.filter(i => i.item_type === 'CHARGE');
  const discounts      = validLineItems.filter(i => i.item_type === 'DISCOUNT');
  const totalCharges   = charges.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const totalDiscounts = discounts.reduce((s, i) => s + Math.abs(parseFloat(i.amount) || 0), 0);
  const grandTotal     = totalCharges - totalDiscounts;

  // ── Preview trigger ────────────────────────────────────────────────────────
  const handlePreviewClick = () => {
    if (validLineItems.length === 0) return;
    if (grandTotal <= 0) { setError('Quote total must be greater than zero'); return; }
    setError(null);
    setShowPreview(true);
  };

  // ── Create quote (once) ────────────────────────────────────────────────────
  const ensureQuoteCreated = async () => {
    if (createdQuote) return createdQuote;
    const res = await fetch('/api/quotes/create-modular', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        request_id: serviceRequest.request_id,
        line_items: validLineItems,
        terms_conditions: termsConditions,
      }),
    });
    if (!res.ok) throw new Error('Failed to create quote');
    const data = await res.json();
    setCreatedQuote(data.data);
    return data.data;
  };

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleGenerateDownload = async () => {
    try {
      setLoadingAction('downloading');
      setError(null);
      const quote = await ensureQuoteCreated();
      const res   = await apiClient.generateQuotePdf(quote.quote_id);
      const url   = res?.pdf_url || res?.data?.pdf_url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      setDeliveryState('downloaded');
    } catch { setError('Failed to generate PDF'); }
    finally { setLoadingAction(null); }
  };

  const handleGenerateSend = async () => {
    try {
      setLoadingAction('sending');
      setError(null);
      const quote = await ensureQuoteCreated();
      await apiClient.sendQuotePDF(quote.quote_id);
      setDeliveryState('sent');
    } catch { setError('Failed to send quote'); }
    finally { setLoadingAction(null); }
  };

  const handleSend = async () => {
    if (!createdQuote) return;
    try {
      setLoadingAction('sending');
      setError(null);
      await apiClient.sendQuotePDF(createdQuote.quote_id);
      setDeliveryState('sent');
    } catch { setError('Failed to send quote'); }
    finally { setLoadingAction(null); }
  };

  const handleResend = async () => {
    if (!createdQuote) return;
    try {
      setLoadingAction('resending');
      setError(null);
      await apiClient.sendQuotePDF(createdQuote.quote_id);
    } catch { setError('Failed to resend quote'); }
    finally { setLoadingAction(null); }
  };

  // ── Loading / error screens ────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !serviceRequest) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="mt-4 flex items-center gap-2 text-[13px] text-blue-600 hover:text-blue-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Quote Builder"
      subtitle={serviceRequest ? `For ${serviceRequest.patient_name}` : 'Create Quote'}
    >
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── LEFT: Service Request Details ── */}
        <div className="xl:col-span-1">
          <div className="rounded-lg border border-gray-200 bg-white sticky top-4 divide-y divide-gray-100">

            {/* Header */}
            <div className="px-5 py-4 flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-gray-400" />
              <h2 className="text-[13px] font-semibold text-gray-900">Service Request</h2>
              {serviceRequest?.service_request_code && (
                <span className="ml-auto text-[11px] font-mono text-gray-400">
                  {serviceRequest.service_request_code}
                </span>
              )}
            </div>

            {/* Payer */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Payer</p>
              <div className="grid grid-cols-1 gap-3">
                <InfoRow label="Name"   value={serviceRequest?.payer_name} />
                <InfoRow label="Mobile" value={serviceRequest?.payer_mobile} />
              </div>
            </div>

            {/* Care recipient */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Care Recipient</p>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Name"      value={serviceRequest?.patient_name} />
                <InfoRow label="Age"       value={serviceRequest?.patient_age ? `${serviceRequest.patient_age} yrs` : null} />
                <InfoRow label="Condition" value={serviceRequest?.patient_condition} />
                <InfoRow label="Gender"    value={serviceRequest?.preferred_gender || 'Any'} />
              </div>
            </div>

            {/* Service */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Service</p>
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Type"  value={serviceRequest?.service_type?.replace(/_/g, ' ')} />
                <InfoRow label="Model" value={serviceRequest?.service_model?.replace(/_/g, ' ')} />
              </div>
            </div>

            {/* Location */}
            <div className="px-5 py-4">
              <InfoRow label="Location" value={serviceRequest?.location_address} />
            </div>

            {/* Registration status */}
            {clientProfile && (
              <div className="px-5 py-4">
                {clientProfile.is_registration_fee_paid ? (
                  <div className="flex items-center gap-2 text-[12px] text-gray-600">
                    <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                    Registration fee paid
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-gray-500">
                    <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                    Registration fee pending
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Builder or Preview ── */}
        <div className="xl:col-span-2 space-y-4">

          {showPreview ? (
            <QuotePreviewPanel
              serviceRequest={serviceRequest}
              validLineItems={validLineItems}
              termsConditions={termsConditions}
              onBack={() => {
                setShowPreview(false);
                setError(null);
                setCreatedQuote(null);
                setDeliveryState(null);
              }}
              onGenerateDownload={handleGenerateDownload}
              onGenerateSend={handleGenerateSend}
              onSend={handleSend}
              onResend={handleResend}
              loadingAction={loadingAction}
              deliveryState={deliveryState}
              error={error}
            />
          ) : (
            <>
              {/* Preset selector */}
              <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
                <PresetItemSelector
                  presets={presets}
                  onSelectPreset={addPresetItem}
                  onManagePresets={() => setShowPresetManager(true)}
                />
              </div>

              {/* Line items table (Zoho-style) */}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">

                {/* Table header row */}
                <div className="border-b border-gray-100">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="py-3 pl-4 w-8" />
                        <th className="py-3 text-left text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3">
                          Item Details
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3 w-24">
                          Quantity
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-3 w-32">
                          Rate
                        </th>
                        <th className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-400 pr-2 w-32">
                          Amount
                        </th>
                        <th className="py-3 pr-3 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[13px] text-gray-400">
                            No items added. Select a preset above or add a custom item below.
                          </td>
                        </tr>
                      ) : (
                        lineItems.map((item, index) => (
                          <LineItemRow
                            key={index}
                            item={item}
                            index={index}
                            isFirst={index === 0}
                            isLast={index === lineItems.length - 1}
                            onUpdate={(updated) => updateLineItem(index, updated)}
                            onDelete={() => deleteLineItem(index)}
                            onMoveUp={() => moveLineItem(index, 'up')}
                            onMoveDown={() => moveLineItem(index, 'down')}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add-item row */}
                <div className="px-4 py-3 flex items-center gap-4 border-b border-gray-100">
                  <button
                    onClick={() => addItem('CHARGE')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Charge
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    onClick={() => addItem('DISCOUNT')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    Add Discount
                  </button>
                  {skippedCount > 0 && (
                    <span className="ml-auto text-[11px] text-gray-400">
                      {skippedCount} item{skippedCount > 1 ? 's' : ''} with Rs. 0 will be excluded
                    </span>
                  )}
                </div>

                {/* Totals + Terms */}
                <div className="px-5 py-5 grid grid-cols-2 gap-6">

                  {/* Terms */}
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">
                      Terms &amp; Conditions
                    </p>
                    <textarea
                      value={termsConditions}
                      onChange={(e) => setTermsConditions(e.target.value)}
                      rows={4}
                      className="w-full text-[13px] text-gray-700 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-300"
                      placeholder="Enter terms and conditions…"
                    />
                  </div>

                  {/* Totals */}
                  <div className="flex flex-col justify-end gap-2">
                    <div className="flex justify-between text-[13px] text-gray-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(totalCharges)}</span>
                    </div>
                    {totalDiscounts > 0 && (
                      <div className="flex justify-between text-[13px] text-gray-500">
                        <span>Discounts</span>
                        <span className="tabular-nums">({fmt(totalDiscounts)})</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="tabular-nums">LKR {fmt(grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <span className="text-[13px] text-red-700">{error}</span>
                </div>
              )}

              {/* Preview button */}
              <button
                onClick={handlePreviewClick}
                disabled={validLineItems.length === 0 || grandTotal <= 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-4 h-4" />
                Preview Quote
              </button>
            </>
          )}
        </div>
      </div>

      {/* Back link */}
      <div className="mt-6">
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="flex items-center gap-2 text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </div>

      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => { setShowPresetManager(false); fetchPresets(); }}
      />
    </AdminLayout>
  );
};

export default ModularQuoteBuilder;
