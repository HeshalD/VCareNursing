import React, { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, CheckCircle, AlertCircle, Loader2, FileText, ExternalLink,
} from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE'];

const emptyLine = () => ({
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

const CreateProductInvoiceDrawer = ({ open, onClose, clientId, clientProfile, onSuccess }) => {
  const [lineItems, setLineItems] = useState([emptyLine()]);
  const [dueDate, setDueDate] = useState('');
  const [markPaid, setMarkPaid] = useState(false);

  const [products, setProducts] = useState([]);
  const [rentalUnits, setRentalUnits] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [step, setStep] = useState('build'); // 'build' | 'done'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdInvoices, setCreatedInvoices] = useState([]);
  const [pdfLoadingId, setPdfLoadingId] = useState('');

  useEffect(() => {
    if (!open) {
      setLineItems([emptyLine()]);
      setDueDate('');
      setMarkPaid(false);
      setPaymentMethod('CASH');
      setBankAccountId('');
      setChequeNumber('');
      setChequeDate('');
      setReferenceNumber('');
      setNotes('');
      setStep('build');
      setError('');
      setCreatedInvoices([]);
      return;
    }
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
    apiClient.getProducts().then((res) => setProducts(Array.isArray(res?.data) ? res.data : [])).catch(() => setProducts([]));
    apiClient.getRentalUnits({ status: 'AVAILABLE' }).then((res) => setRentalUnits(Array.isArray(res?.data) ? res.data : [])).catch(() => setRentalUnits([]));
  }, [open]);

  const isRentalLine = (it) => products.find((p) => p.product_id === it.product_id)?.product_type === 'RENTAL';

  const updateLine = (idx, patch) => setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addLine = () => setLineItems((items) => [...items, emptyLine()]);
  const addDepositLine = () => setLineItems((items) => [...items, emptyDepositLine()]);
  const removeLine = (idx) => setLineItems((items) => items.filter((_, i) => i !== idx));

  const selectProductForLine = (idx, productId) => {
    const product = products.find((p) => p.product_id === productId);
    updateLine(idx, {
      product_id: productId,
      description: product ? product.name : '',
      unit_price: product ? product.price : '',
      unit_id: '',
    });
  };

  const validLines = lineItems.filter((it) => it.description.trim() && parseFloat(it.unit_price) > 0);
  const total = validLines.reduce((sum, it) => sum + (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0), 0);
  const depositTotal = validLines.reduce(
    (sum, it) => sum + (!it.isStandaloneDeposit && isRentalLine(it) ? (parseFloat(it.deposit_amount) || 0) : 0), 0
  );
  const hasRentalItems = validLines.some((it) => !it.isStandaloneDeposit && isRentalLine(it));

  const rentalTermsValid = validLines.every((it) => {
    if (it.isStandaloneDeposit || !isRentalLine(it)) return true;
    return it.rental_billing_type === 'RECURRING' || !!it.rental_end_date;
  });

  const paymentValid = !markPaid || (
    PAYMENT_METHODS.includes(paymentMethod) &&
    (!['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) || bankAccountId) &&
    (paymentMethod !== 'CHEQUE' || (chequeNumber && chequeDate))
  );

  const isValid = validLines.length > 0 && total > 0 && rentalTermsValid && paymentValid;

  const buildLineItemPayload = (it) => {
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
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      const quoteRes = await apiClient.createProductQuotation({
        client_id: clientId,
        line_items: validLines.map(buildLineItemPayload),
      });
      const quoteId = quoteRes.data.quote_id;

      // Rental items need a real rental_agreement (unit reservation, billing
      // schedule) — acceptProductQuote creates one per rental line plus a
      // single combined invoice for everything else (incl. standalone
      // deposits), all in one call. Non-rental quotes skip straight to a
      // plain invoice via createInvoiceFromQuote (which also supports a due
      // date — accept-product-quote doesn't).
      let invoices;
      if (hasRentalItems) {
        const acceptRes = await apiClient.acceptProductQuote(quoteId);
        const { rental_agreements: agreements, invoice: genericInvoice } = acceptRes.data;
        invoices = [
          ...agreements.map((a) => a.invoice),
          ...(genericInvoice ? [genericInvoice] : []),
        ];
      } else {
        const invoiceRes = await apiClient.createInvoiceFromQuote(quoteId, markPaid ? null : (dueDate || null));
        invoices = [invoiceRes.data];
      }

      if (markPaid) {
        const paymentPayload = {
          payment_method: paymentMethod,
          bank_account_id: ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) ? bankAccountId : undefined,
          cheque_number: paymentMethod === 'CHEQUE' ? chequeNumber : undefined,
          cheque_date: paymentMethod === 'CHEQUE' ? chequeDate : undefined,
          reference_number: referenceNumber || undefined,
          notes: notes || undefined,
        };
        const paidInvoices = [];
        for (const inv of invoices) {
          const paid = await apiClient.recordProductInvoicePayment(inv.invoice_id, paymentPayload);
          paidInvoices.push(paid.data);
        }
        setCreatedInvoices(paidInvoices);
      } else {
        setCreatedInvoices(invoices);
      }

      setStep('done');
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to create product invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewPdf = async (invoiceId) => {
    setPdfLoadingId(invoiceId);
    try {
      const res = await apiClient.getProductInvoicePdf(invoiceId);
      window.open(res.pdf_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Failed to generate invoice PDF');
    } finally {
      setPdfLoadingId('');
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Product Invoice</h2>
            <p className="text-xs text-gray-500 mt-0.5">{clientProfile?.full_name || ''}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {step === 'done' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-900">
                    {createdInvoices.length > 1 ? `${createdInvoices.length} Invoices Created` : 'Product Invoice Created'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {createdInvoices.map((inv) => (
                  <div key={inv.invoice_id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Invoice Number</span>
                      <span className="font-medium text-gray-900">{inv.invoice_code}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-bold text-blue-600">{formatMoney(inv.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        inv.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {inv.status === 'PAID' ? 'Paid' : 'Receivable'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewPdf(inv.invoice_id)}
                      disabled={pdfLoadingId === inv.invoice_id}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {pdfLoadingId === inv.invoice_id
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Loading…</>
                        : <><FileText className="h-3 w-3" /> View Invoice PDF <ExternalLink className="h-3 w-3" /></>
                      }
                    </button>
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Line items */}
              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Line Items ({lineItems.length})
                  </p>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={addDepositLine} className="text-xs font-medium text-amber-600 hover:underline">
                      + Add refundable deposit
                    </button>
                    <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                      <Plus className="h-3.5 w-3.5" /> Add line
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {lineItems.map((it, idx) => {
                    if (it.isStandaloneDeposit) {
                      return (
                        <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-40 shrink-0 text-[11px] font-semibold text-amber-700">Refundable Deposit</span>
                            <input
                              type="text"
                              placeholder="Description"
                              value={it.description}
                              onChange={(e) => updateLine(idx, { description: e.target.value })}
                              className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Amount"
                              value={it.unit_price}
                              onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                              onWheel={(e) => e.target.blur()}
                              className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                            />
                            {lineItems.length > 1 && (
                              <button type="button" onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="mt-1 pl-[10.5rem] text-[10px] text-amber-600">
                            Held by the company regardless of any rental item; refund or forfeit later from the Deposits tab.
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
                              <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : p.product_type === 'ONE_TIME_SERVICE' ? ' (Service)' : ''}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="Description"
                            value={it.description}
                            onChange={(e) => updateLine(idx, { description: e.target.value })}
                            className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="Qty"
                            value={it.quantity}
                            onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                            onWheel={(e) => e.target.blur()}
                            className="w-16 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Unit price"
                            value={it.unit_price}
                            onChange={(e) => updateLine(idx, { unit_price: e.target.value })}
                            onWheel={(e) => e.target.blur()}
                            className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                          />
                          {lineItems.length > 1 && (
                            <button type="button" onClick={() => removeLine(idx)} className="text-gray-400 hover:text-red-500">
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
                                onChange={(e) => updateLine(idx, { unit_id: e.target.value })}
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
                                  onChange={(e) => updateLine(idx, { rental_billing_type: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                >
                                  <option value="ONE_TIME">One-time</option>
                                  <option value="RECURRING">Monthly</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Start Date</label>
                                <DateInput
                                  value={it.rental_start_date}
                                  onChange={(e) => updateLine(idx, { rental_start_date: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                />
                              </div>
                              {it.rental_billing_type === 'ONE_TIME' && (
                                <div>
                                  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">End Date *</label>
                                  <DateInput
                                    value={it.rental_end_date}
                                    onChange={(e) => updateLine(idx, { rental_end_date: e.target.value })}
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
                                onChange={(e) => updateLine(idx, { deposit_amount: e.target.value })}
                                onWheel={(e) => e.target.blur()}
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

              <div className="text-right text-sm font-semibold text-gray-800">
                Total: {formatMoney(total)}
                {depositTotal > 0 && (
                  <span className="block text-xs font-normal text-gray-400">
                    + {formatMoney(depositTotal)} refundable deposit(s) = {formatMoney(total + depositTotal)} across the first invoice(s)
                  </span>
                )}
                {hasRentalItems && (
                  <span className="block text-xs font-normal text-gray-400">
                    Includes rental item(s) — a rental agreement will be created and its unit reserved on submit.
                  </span>
                )}
              </div>

              {/* Payment status */}
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Payment Status</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMarkPaid(false)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      !markPaid ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Receivable (unpaid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkPaid(true)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      markPaid ? 'border-green-300 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Mark as Paid Now
                  </button>
                </div>

                {!markPaid && !hasRentalItems && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Due Date (optional)</label>
                    <DateInput
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                {markPaid && (
                  <div className="space-y-3 border-t border-gray-100 pt-3">
                    {hasRentalItems && (
                      <p className="text-[11px] text-gray-400">
                        This payment method applies to all invoices generated by this submission.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Payment Method</label>
                        <select
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        >
                          {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                      {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && (
                        <div>
                          <label className="block text-[11px] font-medium text-gray-500 mb-1">Bank Account</label>
                          <select
                            value={bankAccountId}
                            onChange={(e) => setBankAccountId(e.target.value)}
                            className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                          >
                            <option value="">Select…</option>
                            {bankAccounts.map((b) => (
                              <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {paymentMethod === 'CHEQUE' && (
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="Cheque number"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                          className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                        <DateInput
                          value={chequeDate}
                          onChange={(e) => setChequeDate(e.target.value)}
                          className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Reference number (optional)"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <textarea
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                )}
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
          {step === 'build' ? (
            <div className="flex items-center justify-end gap-3">
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
                disabled={submitting || !isValid}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating…</>
                  : 'Create Invoice'
                }
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CreateProductInvoiceDrawer;
