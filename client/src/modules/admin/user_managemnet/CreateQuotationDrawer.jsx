import React, { useState, useEffect } from 'react';
import {
  X, Plus, Minus, Calculator, Send, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import apiClient from '../../../api/api';
import QuoteLineItem from '../service_quotes/QuoteLineItem';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import QuoteSummary from '../service_quotes/QuoteSummary';

const CreateQuotationDrawer = ({ open, onClose, clientId, clientProfile, quoteId, onSuccess }) => {
  const isEditMode = !!quoteId;

  const [step, setStep] = useState('pick');
  const [serviceRequests, setServiceRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [presets, setPresets] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [termsConditions, setTermsConditions] = useState('The initial estimated amount is non-refundable.');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [error, setError] = useState('');
  const [createdQuote, setCreatedQuote] = useState(null);

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setSelectedRequestId(null);
      setLineItems([]);
      setTermsConditions('The initial estimated amount is non-refundable.');
      setError('');
      setCreatedQuote(null);
      return;
    }

    fetchPresets();

    if (isEditMode) {
      setStep('build');
      fetchExistingQuote();
    } else {
      setStep('pick');
      fetchServiceRequests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId]);

  const fetchPresets = async () => {
    try {
      const res = await apiClient.getPresetItems();
      setPresets(res.data || []);
    } catch { /* non-fatal */ }
  };

  const fetchServiceRequests = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getClientServiceRequests(clientId);
      const requests = Array.isArray(res.data) ? res.data : [];
      setServiceRequests(requests);
      if (requests.length === 1) {
        setSelectedRequestId(requests[0].request_id);
        setStep('build');
      }
    } catch {
      setError('Failed to load service requests');
    } finally {
      setLoading(false);
    }
  };

  const fetchExistingQuote = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getQuoteWithLineItems(quoteId);
      const quote = res.data;
      setLineItems(Array.isArray(quote.line_items) ? quote.line_items : []);
      setTermsConditions(quote.terms_conditions || 'The initial estimated amount is non-refundable.');
    } catch {
      setError('Failed to load quotation details');
    } finally {
      setLoading(false);
    }
  };

  const addPresetItem = (preset) => {
    setLineItems(prev => [...prev, { ...preset, sort_order: prev.length }]);
  };

  const addCustomItem = (type) => {
    setLineItems(prev => [
      ...prev,
      { item_type: type, description: '', quantity: 1, unit_price: 0, amount: 0, sort_order: prev.length },
    ]);
  };

  const updateLineItem = (index, updated) => {
    setLineItems(prev => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const deleteLineItem = (index) => {
    setLineItems(prev =>
      prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sort_order: i }))
    );
  };

  const moveLineItem = (index, direction) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= lineItems.length) return;
    setLineItems(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, i) => ({ ...item, sort_order: i }));
    });
  };

  const calculateTotals = () => {
    let totalCharges = 0;
    let totalDiscounts = 0;
    lineItems.forEach(item => {
      const amt = parseFloat(item.amount) || 0;
      if (item.item_type === 'CHARGE') totalCharges += amt;
      else totalDiscounts += Math.abs(amt);
    });
    return { totalCharges, totalDiscounts, subtotal: totalCharges - totalDiscounts };
  };

  const handleSubmit = async () => {
    if (lineItems.length === 0) { setError('Add at least one line item.'); return; }
    const { subtotal } = calculateTotals();
    if (subtotal <= 0) { setError('Quote total must be greater than zero.'); return; }

    setSubmitting(true);
    setError('');
    try {
      if (isEditMode) {
        await apiClient.updateQuoteLineItems(quoteId, { line_items: lineItems, terms_conditions: termsConditions });
        onSuccess?.();
        onClose();
      } else {
        const res = await apiClient.createModularQuotation({
          request_id: selectedRequestId,
          line_items: lineItems,
          terms_conditions: termsConditions,
        });
        setCreatedQuote(res.data);
        setStep('done');
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message || 'Failed to save quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendPDF = async () => {
    if (!createdQuote) return;
    setSendingPDF(true);
    setError('');
    try {
      await apiClient.sendQuotePDF(createdQuote.quote_id);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to send PDF');
    } finally {
      setSendingPDF(false);
    }
  };

  if (!open) return null;

  const totals = calculateTotals();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEditMode ? 'Edit Quotation Line Items' : 'Create Quotation'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{clientProfile?.full_name || ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : step === 'pick' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select the service request this quotation should be attached to:
              </p>
              {serviceRequests.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
                  <p className="text-sm text-gray-400">No open service requests found for this client.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {serviceRequests.map(sr => (
                    <button
                      key={sr.request_id}
                      type="button"
                      onClick={() => { setSelectedRequestId(sr.request_id); setStep('build'); }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3.5 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {sr.patient_name || sr.payer_name || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">
                            {sr.service_request_code || sr.request_id}
                            {sr.service_type ? ` · ${sr.service_type.replace(/_/g, ' ')}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          ['OPEN', 'PENDING', 'ACTIVE'].includes(sr.status)
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {sr.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : step === 'done' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-900">Quotation Created Successfully</p>
                  <p className="text-xs text-green-700 mt-0.5">{createdQuote?.estimate_number}</p>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Estimate Number</span>
                  <span className="font-medium text-gray-900">{createdQuote?.estimate_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Amount</span>
                  <span className="font-bold text-blue-600">
                    LKR {Number(createdQuote?.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Would you like to send the quotation PDF to the client via WhatsApp?
              </p>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            /* Build step — line item editor */
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <PresetItemSelector
                  presets={presets}
                  onSelectPreset={addPresetItem}
                  onManagePresets={() => {}}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addCustomItem('CHARGE')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Charge
                </button>
                <button
                  type="button"
                  onClick={() => addCustomItem('DISCOUNT')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  <Minus className="h-3.5 w-3.5" /> Add Discount
                </button>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Line Items ({lineItems.length})
                  </p>
                </div>
                <div className="p-4">
                  {lineItems.length === 0 ? (
                    <div className="py-10 text-center">
                      <Calculator className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-400">
                        No items yet. Pick from presets or add a custom charge.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lineItems.map((item, index) => (
                        <QuoteLineItem
                          key={index}
                          item={item}
                          index={index}
                          onUpdate={(updated) => updateLineItem(index, updated)}
                          onDelete={() => deleteLineItem(index)}
                          onMoveUp={() => moveLineItem(index, 'up')}
                          onMoveDown={() => moveLineItem(index, 'down')}
                          isFirst={index === 0}
                          isLast={index === lineItems.length - 1}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <QuoteSummary
                lineItems={lineItems}
                termsConditions={termsConditions}
                onTermsChange={setTermsConditions}
              />

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-4">
          {step === 'pick' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}

          {step === 'build' && (
            <div className="flex items-center gap-3">
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  ← Back
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || lineItems.length === 0 || totals.subtotal <= 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                    : isEditMode ? 'Save Changes' : 'Create Quotation'
                  }
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
              <button
                type="button"
                onClick={handleSendPDF}
                disabled={sendingPDF}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {sendingPDF
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                  : <><Send className="h-3.5 w-3.5" /> Send via WhatsApp</>
                }
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CreateQuotationDrawer;
