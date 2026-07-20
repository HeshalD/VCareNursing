import React, { useState, useEffect } from 'react';
import {
  X, Plus, Send, CheckCircle, AlertCircle, Loader2, Package, BadgeDollarSign, Percent, ShoppingBag, CalendarClock, Clock3,
} from 'lucide-react';
import apiClient from '../../../api/api';
import PresetItemSelector from '../service_quotes/PresetItemSelector';
import LineItemRow from '../service_quotes/LineItemRow';
import RegistrationFeeRow from '../service_quotes/RegistrationFeeRow';
import RateLineItemRow from '../service_quotes/RateLineItemRow';
import ProductLineItemRow from '../service_quotes/ProductLineItemRow';

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

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [productLineItems, setProductLineItems] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [termsConditions, setTermsConditions] = useState('The initial estimated amount is non-refundable.');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingPDF, setSendingPDF] = useState(false);
  const [error, setError] = useState('');
  const [createdQuote, setCreatedQuote] = useState(null);
  const [createdProductQuote, setCreatedProductQuote] = useState(null);
  const [existingServiceModel, setExistingServiceModel] = useState(null); // edit mode only — from getQuoteWithLineItems

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setQuoteKind(null);
      setSelectedRequestId(null);
      setLineItems([]);
      setProductLineItems([]);
      setTermsConditions('The initial estimated amount is non-refundable.');
      setError('');
      setCreatedQuote(null);
      setCreatedProductQuote(null);
      return;
    }

    fetchPresets();
    apiClient.getProducts().then((res) => setProducts(Array.isArray(res?.data) ? res.data : [])).catch(() => setProducts([]));
    apiClient.getRentalUnits({ status: 'AVAILABLE' }).then((res) => setRentalUnits(Array.isArray(res?.data) ? res.data : [])).catch(() => setRentalUnits([]));
    apiClient.getSalespersons().then((res) => setSalespersons(Array.isArray(res?.data) ? res.data : [])).catch(() => setSalespersons([]));

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
    } catch {
      setError('Failed to load service requests');
    } finally {
      setLoading(false);
    }
  };

  const startProductQuote = () => {
    setQuoteKind('PRODUCT');
    setStep('build');
  };

  const isRentalLine = (it) => products.find((p) => p.product_id === it.product_id)?.product_type === 'RENTAL';

  const hasRegistrationFeeItem = lineItems.some((i) => i.is_registration_fee);
  const registrationFeeAlreadySettled = ['PAID', 'WAIVED'].includes(clientProfile?.reg_fee_status);
  const canAddRegistrationFee = !hasRegistrationFeeItem && !registrationFeeAlreadySettled;

  // Dedicated rate line items — item_subtype is what quoteController reads to
  // populate quotations.daily_rate/per_shift_rate; one of each per quote.
  // In edit mode the model comes from the quote itself (existingServiceModel);
  // in create mode it comes from whichever service request was picked.
  const selectedRequest = serviceRequests.find((r) => r.request_id === selectedRequestId);
  const activeServiceModel = existingServiceModel || selectedRequest?.service_model;
  const isShiftBased = activeServiceModel === 'SHIFT_BASED';
  const isDailyModel = ['LIVE_IN', 'VISITING'].includes(activeServiceModel);
  const hasShiftRateItem = lineItems.some((i) => i.item_subtype === 'RATE_SHIFT');
  const hasDailyRateItem = lineItems.some((i) => i.item_subtype === 'RATE_DAILY');
  const canAddShiftRate = isShiftBased && !hasShiftRateItem;
  const canAddDailyRate = isDailyModel && !hasDailyRateItem;

  const addShiftRateItem = () =>
    setLineItems((prev) => [
      ...prev,
      { item_type: 'CHARGE', description: 'Shift Rate', quantity: 7, unit_price: '', amount: 0, item_subtype: 'RATE_SHIFT', sort_order: prev.length },
    ]);

  const addDailyRateItem = () =>
    setLineItems((prev) => [
      ...prev,
      { item_type: 'CHARGE', description: 'Care Rate', quantity: 7, unit_price: '', amount: 0, item_subtype: 'RATE_DAILY', sort_order: prev.length },
    ]);

  const addRegistrationFeeItem = () => {
    const amount = parseFloat(clientProfile?.reg_fee_amount) || 10000;
    setLineItems((prev) => [
      ...prev,
      {
        item_type: 'CHARGE',
        description: 'Registration Fee',
        quantity: 1,
        unit_price: amount,
        amount,
        is_registration_fee: true,
        salesperson_id: '',
        sort_order: prev.length,
      },
    ]);
  };

  const updateProductLineItem = (idx, patch) => {
    setProductLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addProductLine = () => setProductLineItems((items) => [...items, emptyProductLine()]);
  const addDepositLine = () => setProductLineItems((items) => [...items, emptyDepositLine()]);
  const removeProductLine = (idx) => setProductLineItems((items) => items.filter((_, i) => i !== idx));

  const validProductLineItems = productLineItems.filter((it) => it.description?.trim() && it.unit_price !== '');

  const productTotal = validProductLineItems.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0), 0
  );
  const productDepositTotal = validProductLineItems.reduce(
    (sum, it) => sum + (!it.isStandaloneDeposit && isRentalLine(it) ? (parseFloat(it.deposit_amount) || 0) : 0), 0
  );

  // Shared payload shape for the companion PRODUCT-type quotation, used both
  // when the quote is products/rentals-only and when it's a companion to a
  // SERVICE quote (see quoteController.mergeProductQuoteIntoData).
  const mapProductLineItemsForApi = (items) => items.map((it) => {
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
  });

  const fetchExistingQuote = async () => {
    setLoading(true);
    try {
      const res = await apiClient.getQuoteWithLineItems(quoteId);
      const quote = res.data;
      setLineItems(Array.isArray(quote.line_items) ? quote.line_items : []);
      setTermsConditions(quote.terms_conditions || 'The initial estimated amount is non-refundable.');
      setExistingServiceModel(quote.service_model || null);
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

  const validateRentalEndDates = (items) => {
    for (const it of items) {
      if (isRentalLine(it) && it.rental_billing_type === 'ONE_TIME' && !it.rental_end_date) {
        setError(`End date is required for the one-time rental item "${it.description}"`);
        return false;
      }
    }
    return true;
  };

  const handleSubmitProductQuote = async () => {
    if (validProductLineItems.length === 0) { setError('Add at least one line item with a description and price.'); return; }
    if (!validateRentalEndDates(validProductLineItems)) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.createProductQuotation({
        client_id: clientId,
        terms_conditions: termsConditions,
        line_items: mapProductLineItemsForApi(validProductLineItems),
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

  // Companion PRODUCT-type quotation created alongside the SERVICE quote
  // (see ModularQuoteBuilder.ensureProductQuoteCreated) — its line items get
  // folded into the SERVICE quote's own PDF server-side, so the client still
  // only ever gets one combined document. Returns null when there's nothing
  // to quote.
  const createCompanionProductQuote = async (serviceQuoteId) => {
    if (validProductLineItems.length === 0) return null;
    const res = await apiClient.createProductQuotation({
      client_id: clientId,
      linked_quote_id: serviceQuoteId,
      line_items: mapProductLineItemsForApi(validProductLineItems),
    });
    return res.data;
  };

  const handleSubmit = async () => {
    if (quoteKind === 'PRODUCT') {
      await handleSubmitProductQuote();
      return;
    }

    if (lineItems.length === 0) { setError('Add at least one line item.'); return; }
    const { subtotal } = calculateTotals();
    if (subtotal <= 0) { setError('Quote total must be greater than zero.'); return; }
    if (!validateRentalEndDates(validProductLineItems)) return;

    setSubmitting(true);
    setError('');
    try {
      if (isEditMode) {
        await apiClient.updateQuoteLineItems(quoteId, { line_items: lineItems, terms_conditions: termsConditions });
        await createCompanionProductQuote(quoteId);
        onSuccess?.();
        onClose();
      } else {
        const res = await apiClient.createModularQuotation({
          request_id: selectedRequestId,
          line_items: lineItems,
          terms_conditions: termsConditions,
        });
        const productQuote = await createCompanionProductQuote(res.data.quote_id);
        setCreatedQuote(res.data);
        setCreatedProductQuote(productQuote);
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
        await apiClient.sendQuotePDF(createdQuote.quote_id, createdProductQuote?.quote_id);
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

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-4xl flex-col bg-white shadow-2xl">
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
            /* Build step — product/rental line item editor (Zoho-style table, matches ModularQuoteBuilder) */
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
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
                      {productLineItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[13px] text-gray-400">
                            No items added. Add a product, rental, or refundable deposit below.
                          </td>
                        </tr>
                      ) : (
                        productLineItems.map((it, idx) => (
                          <ProductLineItemRow
                            key={idx}
                            item={it}
                            index={idx}
                            products={products}
                            rentalUnits={rentalUnits}
                            canDelete
                            onUpdate={(updated) => updateProductLineItem(idx, updated)}
                            onDelete={() => removeProductLine(idx)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add-item row */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-4 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={addProductLine}
                    className="inline-flex items-center gap-1.5 text-[13px] text-purple-600 hover:text-purple-800 font-medium transition-colors"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    type="button"
                    onClick={addDepositLine}
                    className="inline-flex items-center gap-1.5 text-[13px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    Add Refundable Deposit
                  </button>
                </div>

                {/* Totals + Terms */}
                <div className="px-5 py-5 grid grid-cols-2 gap-6">
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
                  <div className="flex flex-col justify-end gap-2">
                    <div className="flex justify-between text-[13px] text-gray-600">
                      <span>Products &amp; Rentals</span>
                      <span className="tabular-nums">{fmt(productTotal)}</span>
                    </div>
                    {productDepositTotal > 0 && (
                      <div className="flex justify-between text-[13px] text-amber-600">
                        <span>Refundable deposit(s)</span>
                        <span className="tabular-nums">{fmt(productDepositTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="tabular-nums">LKR {fmt(productTotal + productDepositTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}
            </div>
          ) : (
            /* Build step — service line item editor (Zoho-style table, matches ModularQuoteBuilder) */
            <div className="space-y-5">
              <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
                <PresetItemSelector
                  presets={presets}
                  onSelectPreset={addPresetItem}
                  onManagePresets={() => {}}
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
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
                      {lineItems.length === 0 && productLineItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-[13px] text-gray-400">
                            No items added. Select a preset above or add a custom item below.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {lineItems.map((item, index) => (
                            item.is_registration_fee ? (
                              <RegistrationFeeRow
                                key={`svc-${index}`}
                                item={item}
                                index={index}
                                salespersons={salespersons}
                                onUpdate={(updated) => updateLineItem(index, updated)}
                                onDelete={() => deleteLineItem(index)}
                              />
                            ) : item.item_subtype === 'RATE_DAILY' || item.item_subtype === 'RATE_SHIFT' ? (
                              <RateLineItemRow
                                key={`svc-${index}`}
                                item={item}
                                index={index}
                                onUpdate={(updated) => updateLineItem(index, updated)}
                                onDelete={() => deleteLineItem(index)}
                              />
                            ) : (
                              <LineItemRow
                                key={`svc-${index}`}
                                item={item}
                                index={index}
                                isFirst={index === 0}
                                isLast={index === lineItems.length - 1}
                                onUpdate={(updated) => updateLineItem(index, updated)}
                                onDelete={() => deleteLineItem(index)}
                                onMoveUp={() => moveLineItem(index, 'up')}
                                onMoveDown={() => moveLineItem(index, 'down')}
                              />
                            )
                          ))}
                          {/* Products & Rentals — a companion PRODUCT quotation under the
                              hood (see createCompanionProductQuote), but shown here as part
                              of the same table since its items get folded into one combined
                              PDF and one WhatsApp message, same as ModularQuoteBuilder. */}
                          {productLineItems.map((item, idx) => (
                            <ProductLineItemRow
                              key={`prod-${idx}`}
                              item={item}
                              index={lineItems.length + idx}
                              products={products}
                              rentalUnits={rentalUnits}
                              canDelete
                              onUpdate={(updated) => updateProductLineItem(idx, updated)}
                              onDelete={() => removeProductLine(idx)}
                            />
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add-item row */}
                <div className="px-4 py-3 flex flex-wrap items-center gap-4 border-b border-gray-100">
                  {canAddRegistrationFee ? (
                    <>
                      <button
                        type="button"
                        onClick={addRegistrationFeeItem}
                        className="inline-flex items-center gap-1.5 text-[13px] text-amber-700 hover:text-amber-800 font-medium transition-colors"
                      >
                        <BadgeDollarSign className="w-3.5 h-3.5" />
                        Add Registration Fee
                      </button>
                      <span className="text-gray-200 select-none">|</span>
                    </>
                  ) : registrationFeeAlreadySettled && (
                    <span className="text-[11px] text-gray-400">Registration fee already settled for this client</span>
                  )}
                  {canAddShiftRate && (
                    <>
                      <button
                        type="button"
                        onClick={addShiftRateItem}
                        className="inline-flex items-center gap-1.5 text-[13px] text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                      >
                        <Clock3 className="w-3.5 h-3.5" />
                        Add Shift Rate
                      </button>
                      <span className="text-gray-200 select-none">|</span>
                    </>
                  )}
                  {canAddDailyRate && (
                    <>
                      <button
                        type="button"
                        onClick={addDailyRateItem}
                        className="inline-flex items-center gap-1.5 text-[13px] text-blue-700 hover:text-blue-900 font-medium transition-colors"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Add Care Rate
                      </button>
                      <span className="text-gray-200 select-none">|</span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => addCustomItem('CHARGE')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Charge
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    type="button"
                    onClick={() => addCustomItem('DISCOUNT')}
                    className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    <Percent className="w-3.5 h-3.5" />
                    Add Discount
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    type="button"
                    onClick={addProductLine}
                    className="inline-flex items-center gap-1.5 text-[13px] text-purple-600 hover:text-purple-800 font-medium transition-colors"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                  <span className="text-gray-200 select-none">|</span>
                  <button
                    type="button"
                    onClick={addDepositLine}
                    className="inline-flex items-center gap-1.5 text-[13px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
                  >
                    <Package className="w-3.5 h-3.5" />
                    Add Refundable Deposit
                  </button>
                </div>

                {/* Totals + Terms */}
                <div className="px-5 py-5 grid grid-cols-2 gap-6">
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
                  <div className="flex flex-col justify-end gap-2">
                    <div className="flex justify-between text-[13px] text-gray-600">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{fmt(totals.totalCharges)}</span>
                    </div>
                    {totals.totalDiscounts > 0 && (
                      <div className="flex justify-between text-[13px] text-gray-500">
                        <span>Discounts</span>
                        <span className="tabular-nums">({fmt(totals.totalDiscounts)})</span>
                      </div>
                    )}
                    {productTotal > 0 && (
                      <div className="flex justify-between text-[13px] text-purple-600">
                        <span>Products &amp; Rentals</span>
                        <span className="tabular-nums">{fmt(productTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-[14px] font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="tabular-nums">LKR {fmt(totals.subtotal + productTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>

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
                      ? validProductLineItems.length === 0
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
