import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  MapPin,
  FileText,
  Calculator,
  Send,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Plus,
  Minus,
  Tag,
  Stethoscope,
  BadgeCheck,
  Layers
} from 'lucide-react';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import QuoteLineItem from '../service_quotes/QuoteLineItem';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import QuoteSummary from '../service_quotes/QuoteSummary';
import PresetManager from '../service_quotes/PresetManager';

const InfoRow = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
    <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
  </div>
);

const SectionCard = ({ children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ icon: Icon, title, iconColor = 'text-slate-500', children }) => (
  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 rounded-t-xl flex items-center justify-between">
    <div className="flex items-center gap-2.5">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</h3>
    </div>
    {children}
  </div>
);

const QuoteBuilder = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [serviceRequest, setServiceRequest] = useState(null);
  const [clientProfile, setClientProfile] = useState(null);
  const [presets, setPresets] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [termsConditions, setTermsConditions] = useState('The initial estimated amount is non-refundable.');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [createdQuote, setCreatedQuote] = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);

  useEffect(() => {
    if (requestId) {
      fetchServiceRequest();
      fetchPresets();
    } else {
      fetchNewLeads();
    }
  }, [requestId]);

  const fetchServiceRequest = async () => {
    if (!requestId) {
      setError('No service request ID provided');
      return;
    }
    try {
      setLoading(true);
      const response = await apiClient.getServiceRequestById(requestId);
      setServiceRequest(response.data);
      if (response.data.client_id) {
        try {
          const clientResponse = await apiClient.getClientProfile(response.data.client_id);
          setClientProfile(clientResponse.data);
        } catch (clientErr) {
          console.warn('Failed to fetch client profile:', clientErr);
        }
      }
    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        setError('Service request not found');
      } else {
        setError('Failed to fetch service request');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchNewLeads = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getNewLeads();
      const leads = response.data || [];
      if (leads.length === 0) {
        setError('No new leads found');
      } else {
        setServiceRequest(leads[0]);
        navigate(`/admin/quote-builder/${leads[0].request_id}`, { replace: true });
      }
    } catch (err) {
      setError('Failed to fetch new leads');
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const response = await fetch('/api/quotes/presets', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();
      setPresets(data.data || []);
    } catch (err) {
      console.warn('Failed to fetch presets:', err);
    }
  };

  const addPresetItem = (presetItem) => {
    setLineItems([...lineItems, { ...presetItem, sort_order: lineItems.length }]);
  };

  const addCustomItem = (type) => {
    setLineItems([...lineItems, {
      item_type: type,
      description: '',
      quantity: 1,
      unit_price: 0,
      sort_order: lineItems.length,
    }]);
  };

  const updateLineItem = (index, updatedItem) => {
    const newItems = [...lineItems];
    newItems[index] = updatedItem;
    setLineItems(newItems);
  };

  const deleteLineItem = (index) => {
    setLineItems(
      lineItems.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i }))
    );
  };

  const moveLineItem = (index, direction) => {
    const newItems = [...lineItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lineItems.length) return;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setLineItems(newItems.map((item, i) => ({ ...item, sort_order: i })));
  };

  const calculateTotals = () => {
    let totalCharges = 0;
    let totalDiscounts = 0;
    lineItems.forEach(item => {
      if (item.item_type === 'CHARGE') totalCharges += parseFloat(item.amount) || 0;
      else if (item.item_type === 'DISCOUNT') totalDiscounts += Math.abs(parseFloat(item.amount) || 0);
    });
    return { totalCharges, totalDiscounts, subtotal: totalCharges - totalDiscounts };
  };

  const isItemValid = (item) =>
    item.description?.trim() && Math.abs(parseFloat(item.amount) || 0) > 0;

  const validLineItems = lineItems.filter(isItemValid);
  const skippedCount   = lineItems.length - validLineItems.length;

  const handleCreateQuote = async (e) => {
    e.preventDefault();
    if (!serviceRequest || validLineItems.length === 0) return;
    const totals = calculateTotals();
    if (totals.subtotal <= 0) {
      setError('Quote total must be greater than zero');
      return;
    }
    try {
      setCreatingQuote(true);
      setError('');
      const response = await fetch('/api/quotes/create-modular', {
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
      if (!response.ok) throw new Error('Failed to create quote');
      const data = await response.json();
      setCreatedQuote(data.data);
    } catch (err) {
      setError('Failed to create quotation');
      console.error('Error:', err);
    } finally {
      setCreatingQuote(false);
    }
  };

  const handleSendPDF = async () => {
    if (!createdQuote) return;
    try {
      setSendingPDF(true);
      await apiClient.sendQuotePDF(createdQuote.quote_id);
      alert('Quote sent successfully via WhatsApp!');
      navigate('/admin/service-requests');
    } catch (err) {
      setError('Failed to send PDF');
      console.error('Error:', err);
    } finally {
      setSendingPDF(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error && !serviceRequest) {
    return (
      <AdminLayout title="Quote Builder" subtitle="Error">
        <div className="max-w-md mx-auto mt-10">
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-red-800 font-medium">{error}</span>
            </div>
            <button
              onClick={() => navigate('/admin/service-requests')}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Service Requests
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const totals = calculateTotals();
  // Use the full reg_fee_status enum when available; fall back to the boolean for
  // legacy profiles that pre-date the status column.
  const regFeeStatus = clientProfile
    ? (clientProfile.reg_fee_status || (clientProfile.is_registration_fee_paid ? 'PAID' : 'PENDING'))
    : 'PENDING';
  const registrationFeePaid = regFeeStatus === 'PAID' || regFeeStatus === 'WAIVED';

  const REG_FEE_BADGE = {
    PENDING:          { label: 'Reg. Fee Pending',          cls: 'bg-amber-500/20  text-amber-100  border-amber-400/30'  },
    INVOICED:         { label: 'Reg. Fee Invoiced',         cls: 'bg-blue-500/20   text-blue-100   border-blue-400/30'   },
    RECEIPT_UPLOADED: { label: 'Receipt Submitted',         cls: 'bg-violet-500/20 text-violet-100 border-violet-400/30' },
    PAID:             { label: '✓ Reg. Fee Paid',           cls: 'bg-green-500/20  text-green-100  border-green-400/30'  },
    WAIVED:           { label: '✓ Reg. Fee Waived',         cls: 'bg-slate-500/20  text-slate-200  border-slate-400/30'  },
    EXPIRED:          { label: 'Membership Expired',        cls: 'bg-rose-500/20   text-rose-100   border-rose-400/30'   },
  };
  const feeBadge = REG_FEE_BADGE[regFeeStatus] || REG_FEE_BADGE.PENDING;

  return (
    <AdminLayout
      title="Quote Builder"
      subtitle={serviceRequest ? `Service Request for ${serviceRequest.patient_name}` : 'Create Quote'}
    >
      {/* Back navigation */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/admin/service-requests')}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Service Requests
        </button>
      </div>

      {/* Context banner */}
      {serviceRequest && (
        <div className="mb-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-5 shadow-md shadow-blue-100">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-1">Creating Quote For</p>
              <h2 className="text-xl font-bold text-white leading-tight">{serviceRequest.patient_name}</h2>
              <p className="text-blue-200 text-sm mt-1">
                Payer: <span className="text-white font-medium">{serviceRequest.payer_name}</span>
                <span className="mx-2 opacity-50">·</span>
                {formatMobileNumber(serviceRequest.payer_mobile)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="bg-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-full border border-white/20">
                {serviceRequest.service_type}
              </span>
              <span className="bg-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-full border border-white/20">
                {serviceRequest.service_model?.replace('_', ' ') || 'Standard'}
              </span>
              <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${feeBadge.cls}`}>
                {feeBadge.label}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">

        {/* Left: sticky details panel */}
        <div className="xl:col-span-1 xl:sticky xl:top-6">
          <SectionCard>
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 rounded-t-xl">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Request Details</h3>
            </div>

            {serviceRequest && (
              <div className="p-5 space-y-4">

                {/* Payer */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-md bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payer</span>
                  </div>
                  <div className="pl-8 divide-y divide-slate-100">
                    <InfoRow label="Name" value={serviceRequest.payer_name} />
                    <InfoRow label="Mobile" value={formatMobileNumber(serviceRequest.payer_mobile)} />
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Care Profile */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-md bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Stethoscope className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</span>
                  </div>
                  <div className="pl-8 divide-y divide-slate-100">
                    <InfoRow label="Name" value={serviceRequest.patient_name} />
                    <InfoRow label="Age" value={`${serviceRequest.patient_age} years`} />
                    <InfoRow label="Condition" value={serviceRequest.patient_condition} />
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Service */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-md bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</span>
                  </div>
                  <div className="pl-8 divide-y divide-slate-100">
                    <InfoRow label="Type" value={serviceRequest.service_type} />
                    <InfoRow label="Model" value={serviceRequest.service_model?.replace('_', ' ') || 'Not specified'} />
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Location */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-3.5 h-3.5 text-orange-600" />
                    </div>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed pl-8">{serviceRequest.location_address}</p>
                </div>

                {/* Client Status */}
                <>
                  <div className="h-px bg-slate-100" />
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <BadgeCheck className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Client Status</span>
                    </div>
                    {(() => {
                      const SIDEBAR_CFG = {
                        PENDING:          { icon: AlertCircle,  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100',  label: 'Registration fee pending'   },
                        INVOICED:         { icon: AlertCircle,  text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100',   label: 'Invoice sent — awaiting payment' },
                        RECEIPT_UPLOADED: { icon: AlertCircle,  text: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100', label: 'Receipt submitted — pending verification' },
                        PAID:             { icon: CheckCircle,  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-100',  label: 'Registration fee paid'      },
                        WAIVED:           { icon: CheckCircle,  text: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200',  label: 'Registration fee waived'    },
                        EXPIRED:          { icon: AlertCircle,  text: 'text-rose-700',   bg: 'bg-rose-50',   border: 'border-rose-100',   label: 'Membership expired — renewal required' },
                      };
                      const cfg = SIDEBAR_CFG[regFeeStatus] || SIDEBAR_CFG.PENDING;
                      const Icon = cfg.icon;
                      return (
                        <div className="ml-8 space-y-1">
                          <div className={`flex items-center gap-2 text-sm ${cfg.text} ${cfg.bg} px-3 py-2.5 rounded-lg border ${cfg.border}`}>
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span className="font-medium">{cfg.label}</span>
                          </div>
                          {!clientProfile && (
                            <p className="text-xs text-slate-400 px-1">Client not yet registered in the system.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: quote builder */}
        <div className="xl:col-span-2 space-y-5">
          {!createdQuote ? (
            <>
              {/* Add Items — presets + custom buttons unified */}
              <SectionCard>
                <CardHeader icon={Layers} title="Add Items" iconColor="text-blue-500" />
                <div className="p-5 space-y-4">
                  <PresetItemSelector
                    presets={presets}
                    onSelectPreset={addPresetItem}
                    onManagePresets={() => setShowPresetManager(true)}
                  />
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs text-slate-400 font-medium">or add custom item</span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => addCustomItem('CHARGE')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 active:scale-[0.98] transition-all font-medium text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Charge
                    </button>
                    <button
                      type="button"
                      onClick={() => addCustomItem('DISCOUNT')}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 active:scale-[0.98] transition-all font-medium text-sm"
                    >
                      <Minus className="w-4 h-4" />
                      Add Discount
                    </button>
                  </div>
                </div>
              </SectionCard>

              {/* Quote Items list */}
              <SectionCard>
                <CardHeader icon={Tag} title="Quote Items" iconColor="text-slate-500">
                  <div className="flex items-center gap-2">
                    {skippedCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                        <AlertCircle className="w-3 h-3" />
                        {skippedCount} item{skippedCount > 1 ? 's' : ''} with Rs. 0 excluded
                      </span>
                    )}
                    {lineItems.length > 0 && (
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">
                        {validLineItems.length} {validLineItems.length === 1 ? 'item' : 'items'}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <div className="p-5">
                  {lineItems.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <Calculator className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">No items added yet</p>
                      <p className="text-xs text-slate-400 mt-1">Select a preset or add a custom charge above</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lineItems.map((item, index) => {
                        const invalid = !isItemValid(item);
                        return (
                          <div key={index} className={invalid ? 'opacity-50 relative' : 'relative'}>
                            {invalid && (
                              <div className="absolute -top-1 -right-1 z-10 flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />
                                Won't be included (Rs. 0)
                              </div>
                            )}
                            <QuoteLineItem
                              item={item}
                              index={index}
                              onUpdate={(updated) => updateLineItem(index, updated)}
                              onDelete={() => deleteLineItem(index)}
                              onMoveUp={() => moveLineItem(index, 'up')}
                              onMoveDown={() => moveLineItem(index, 'down')}
                              isFirst={index === 0}
                              isLast={index === lineItems.length - 1}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Summary + Terms */}
              <SectionCard>
                <CardHeader icon={Calculator} title="Summary & Terms" iconColor="text-slate-500" />
                <div className="p-5">
                  <QuoteSummary
                    lineItems={lineItems}
                    termsConditions={termsConditions}
                    onTermsChange={setTermsConditions}
                  />
                </div>
              </SectionCard>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Create Quote CTA */}
              <button
                onClick={handleCreateQuote}
                disabled={creatingQuote || validLineItems.length === 0 || totals.subtotal <= 0}
                className="w-full bg-blue-600 text-white py-3.5 px-6 rounded-xl font-semibold text-sm hover:bg-blue-700 active:scale-[0.99] transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-blue-100"
              >
                {creatingQuote ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    Creating Quote...
                  </>
                ) : (
                  <>
                    <Calculator className="w-4 h-4" />
                    Create Quote
                  </>
                )}
              </button>
            </>
          ) : (
            /* Success state */
            <SectionCard className="overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-500 to-green-600 px-8 py-10 text-center">
                <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-9 h-9 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">Quote Created Successfully!</h3>
                <p className="text-green-100 text-sm mt-1">{createdQuote.estimate_number}</p>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100">
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-slate-500">Quote Number</span>
                    <span className="text-sm font-semibold text-slate-800">{createdQuote.estimate_number}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3">
                    <span className="text-sm text-slate-500">Total Amount</span>
                    <span className="text-base font-bold text-blue-600">
                      Rs. {createdQuote.total_amount?.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleSendPDF}
                  disabled={sendingPDF}
                  className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {sendingPDF ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                      Sending PDF...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Send Quote via WhatsApp
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setCreatedQuote(null);
                    setLineItems([]);
                    setTermsConditions('The initial estimated amount is non-refundable.');
                  }}
                  className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
                >
                  Create Another Quote
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {/* Preset Manager Modal */}
      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => {
          setShowPresetManager(false);
          fetchPresets();
        }}
      />
    </AdminLayout>
  );
};

export default QuoteBuilder;
