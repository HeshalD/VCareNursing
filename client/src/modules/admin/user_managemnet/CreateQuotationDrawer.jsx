import React, { useState, useEffect } from 'react';
import {
  X, Plus, Minus, Calculator, Send, CheckCircle, AlertCircle, Loader2, Trash2, Package,
} from 'lucide-react';
import apiClient from '../../../api/api';
import QuoteLineItem from '../service_quotes/QuoteLineItem';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import QuoteSummary from '../service_quotes/QuoteSummary';

const emptyProductLine = () => ({
  description: '', quantity: 1, unit_price: '', product_id: '', unit_id: '',
  rental_billing_type: 'ONE_TIME', rental_start_date: new Date().toISOString().slice(0, 10),
  rental_end_date: '', deposit_amount: '',
});

// A standalone refundable deposit — held by the company independent of any
// rental item. Distinct from the per-rental-item deposit_amount field.
const emptyDepositLine = () => ({
  description: 'Refundable Deposit', quantity: 1, unit_price: '', isStandaloneDeposit: true,
});

const formatMoney = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CreateQuotationDrawer = ({ open, onClose, clientId, clientProfile, quoteId, onSuccess }) => {
  const isEditMode = !!quoteId;

  const [step, setStep] = useState('pick');
  const [quoteKind, setQuoteKind] = useState(null); // 'SERVICE' | 'PRODUCT'
  const [serviceRequests, setServiceRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [presets, setPresets] = useState([]);
  const [lineItems, setLineItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [rentalUnits, setRentalUnits] = useState([]);
  const [productLineItems, setProductLineItems] = useState([emptyProductLine()]);
  const [termsConditions, setTermsConditions] = useState('The initial estimated amount is non-refundable.');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [error, setError] = useState('');
  const [createdQuote, setCreatedQuote] = useState(null);

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setQuoteKind(null);
      setSelectedRequestId(null);
      setLineItems([]);
      setProductLineItems([emptyProductLine()]);
      setTermsConditions('The initial estimated amount is non-refundable.');
      setError('');
      setCreatedQuote(null);
      return;
    }

    fetchPresets();

    if (isEditMode) {
      setQuoteKind('SERVICE');
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
        setQuoteKind('SERVICE');
        setStep('build');
      }
    } catch {
      setError('Failed to load service requests');
    } finally {
      setLoading(false);
    }
  };

  const startProductQuote = async () => {
    setQuoteKind('PRODUCT');
    setStep('build');
    setLoading(true);
    try {
      const [productsRes, unitsRes] = await Promise.all([
        apiClient.getProducts(),
        apiClient.getRentalUnits({ status: 'AVAILABLE' }),
      ]);
      setProducts(Array.isArray(productsRes?.data) ? productsRes.data : []);
      setRentalUnits(Array.isArray(unitsRes?.data) ? unitsRes.data : []);
    } catch {
      setError('Failed to load product catalog');
    } finally {
      setLoading(false);
    }
  };

  const isRentalLine = (it) => products.find((p) => p.product_id === it.product_id)?.product_type === 'RENTAL';

  const updateProductLineItem = (idx, patch) => {
    setProductLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addProductLine = () => setProductLineItems((items) => [...items, emptyProductLine()]);
  const addDepositLine = () => setProductLineItems((items) => [...items, emptyDepositLine()]);
  const removeProductLine = (idx) => setProductLineItems((items) => items.filter((_, i) => i !== idx));

  const selectProductForLine = (idx, productId) => {
    const product = products.find((p) => p.product_id === productId);
    updateProductLineItem(idx, {
      product_id: productId,
      description: product ? product.name : '',
      unit_price: product ? product.price : '',
      unit_id: '',
    });
  };

  const productTotal = productLineItems.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0
  );
  const productDepositTotal = productLineItems.reduce(
    (sum, it) => sum + (isRentalLine(it) ? (parseFloat(it.deposit_amount) || 0) : 0), 0
  );

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

  const handleSubmitProductQuote = async () => {
    const validItems = productLineItems.filter((it) => it.description && it.unit_price !== '');
    if (validItems.length === 0) { setError('Add at least one line item with a description and price.'); return; }
    for (const it of validItems) {
      if (isRentalLine(it) && it.rental_billing_type === 'ONE_TIME' && !it.rental_end_date) {
        setError(`End date is required for the one-time rental item "${it.description}"`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.createProductQuotation({
        client_id: clientId,
        terms_conditions: termsConditions,
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
      setCreatedQuote(res.data);
      setStep('done');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to save quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (quoteKind === 'PRODUCT') {
      await handleSubmitProductQuote();
      return;
    }

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
      if (quoteKind === 'PRODUCT') {
        await apiClient.sendProductQuotePDF(createdQuote.quote_id);
      } else {
        await apiClient.sendQuotePDF(createdQuote.quote_id);
      }
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
              <button
                type="button"
                onClick={startProductQuote}
                className="w-full rounded-lg border border-dashed border-purple-200 bg-purple-50/40 px-4 py-3.5 text-left hover:border-purple-300 hover:bg-purple-50 transition-colors flex items-center gap-3"
              >
                <Package className="h-5 w-5 text-purple-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Product / Rental Quotation</p>
                  <p className="text-xs text-gray-500 mt-0.5">No service request needed — quote products or rentals directly for this client.</p>
                </div>
              </button>

              <p className="text-sm text-gray-600">
                Or select the service request this quotation should be attached to:
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
                      onClick={() => { setSelectedRequestId(sr.request_id); setQuoteKind('SERVICE'); setStep('build'); }}
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
          ) : quoteKind === 'PRODUCT' ? (
            /* Build step — product/rental line item editor */
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Line Items ({productLineItems.length})
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={addDepositLine} className="text-xs font-medium text-amber-600 hover:underline">
                      + Add refundable deposit
                    </button>
                    <button type="button" onClick={addProductLine} className="text-xs font-medium text-blue-600 hover:underline">
                      + Add line
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {productLineItems.map((it, idx) => {
                    if (it.isStandaloneDeposit) {
                      return (
                        <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-40 shrink-0 text-[11px] font-semibold text-amber-700">Refundable Deposit</span>
                            <input
                              type="text"
                              placeholder="Description"
                              value={it.description}
                              onChange={(e) => updateProductLineItem(idx, { description: e.target.value })}
                              className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount"
                              value={it.unit_price}
                              onChange={(e) => updateProductLineItem(idx, { unit_price: e.target.value })}
                              className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                            />
                            {productLineItems.length > 1 && (
                              <button type="button" onClick={() => removeProductLine(idx)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="mt-1 pl-[10.5rem] text-[10px] text-amber-600">
                            Held by the company regardless of any rental item; refund or forfeit later from the client's deposits.
                          </p>
                        </div>
                      );
                    }
                    const rental = isRentalLine(it);
                    return (
                      <div key={idx} className={rental ? 'rounded-lg border border-purple-100 bg-purple-50/40 p-2.5 space-y-2' : ''}>
                        <div className="flex items-center gap-2">
                          <select
                            value={it.product_id}
                            onChange={(e) => selectProductForLine(idx, e.target.value)}
                            className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                          >
                            <option value="">Custom item…</option>
                            {products.map((p) => (
                              <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : ''}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Description"
                            value={it.description}
                            onChange={(e) => updateProductLineItem(idx, { description: e.target.value })}
                            className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Qty"
                            value={it.quantity}
                            onChange={(e) => updateProductLineItem(idx, { quantity: e.target.value })}
                            className="w-16 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit price"
                            value={it.unit_price}
                            onChange={(e) => updateProductLineItem(idx, { unit_price: e.target.value })}
                            className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          {productLineItems.length > 1 && (
                            <button type="button" onClick={() => removeProductLine(idx)} className="text-gray-400 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {rental && (
                          <div className="pl-1 space-y-2">
                            <p className="text-[11px] font-semibold text-purple-700">Rental Terms for this item</p>
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Specific Unit</label>
                              <select
                                value={it.unit_id || ''}
                                onChange={(e) => updateProductLineItem(idx, { unit_id: e.target.value })}
                                className="w-56 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                              >
                                <option value="">Auto-assign any available unit</option>
                                {rentalUnits.filter((u) => u.product_id === it.product_id).map((u) => (
                                  <option key={u.unit_id} value={u.unit_id}>{u.unit_code || u.unit_id.slice(0, 8)}</option>
                                ))}
                              </select>
                              {it.product_id && rentalUnits.filter((u) => u.product_id === it.product_id).length === 0 && (
                                <p className="mt-0.5 text-[10px] text-amber-600">No units currently available for this product.</p>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Billing</label>
                                <select
                                  value={it.rental_billing_type}
                                  onChange={(e) => updateProductLineItem(idx, { rental_billing_type: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                >
                                  <option value="ONE_TIME">One-time</option>
                                  <option value="RECURRING">Monthly</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Start Date</label>
                                <input
                                  type="date"
                                  value={it.rental_start_date}
                                  onChange={(e) => updateProductLineItem(idx, { rental_start_date: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                />
                              </div>
                              {it.rental_billing_type === 'ONE_TIME' && (
                                <div>
                                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">End Date *</label>
                                  <input
                                    type="date"
                                    value={it.rental_end_date}
                                    onChange={(e) => updateProductLineItem(idx, { rental_end_date: e.target.value })}
                                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                  />
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Refundable Deposit (optional)</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={it.deposit_amount}
                                onChange={(e) => updateProductLineItem(idx, { deposit_amount: e.target.value })}
                                className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2 py-1 text-xs outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div className="text-right text-sm font-semibold text-gray-800">
                  Total: {formatMoney(productTotal)}
                  {productDepositTotal > 0 && (
                    <span className="block text-xs font-normal text-gray-400">
                      + {formatMoney(productDepositTotal)} refundable deposit(s) = {formatMoney(productTotal + productDepositTotal)} across first invoice(s)
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Terms &amp; conditions</label>
                  <textarea
                    value={termsConditions}
                    onChange={(e) => setTermsConditions(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}
            </div>
          ) : (
            /* Build step — service line item editor */
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
                  disabled={
                    submitting ||
                    (quoteKind === 'PRODUCT'
                      ? productLineItems.filter((it) => it.description && it.unit_price !== '').length === 0
                      : lineItems.length === 0 || totals.subtotal <= 0)
                  }
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
