import { useEffect, useState } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';

const paymentMethodOptions = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Lets an admin record one payment and allocate it across a SERVICE quote's
// own remaining balance and/or its linked PRODUCT invoice (rentals/purchases/
// deposits added via ModularQuoteBuilder), in a single action — instead of
// having to visit two separate screens (Quotations page for the service
// portion, Products page for the product portion). payment_tracking (service)
// and the generic `invoices` table (product) are still two independent
// records under the hood (see quoteController.linked_quote_id /
// ensureCombinedInvoice) — this just fires both existing endpoints together.
const PaymentAllocationModal = ({ quoteId, onClose, onRecorded }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [serviceRemaining, setServiceRemaining] = useState(0);
  const [estimateNumber, setEstimateNumber] = useState('');
  const [productInvoice, setProductInvoice] = useState(null); // { invoice_id, invoice_code, amount, status }

  const [bankAccounts, setBankAccounts] = useState([]);
  const [payService, setPayService] = useState(true);
  const [serviceAmount, setServiceAmount] = useState('');
  const [payProduct, setPayProduct] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [slipFile, setSlipFile] = useState(null);

  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod);
  const isCheque = paymentMethod === 'CHEQUE';

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [quoteRes, progressRes, banksRes] = await Promise.all([
          apiClient.getQuoteWithLineItems(quoteId),
          apiClient.getQuotePaymentProgress(quoteId),
          apiClient.getBankAccounts(),
        ]);
        const quote = quoteRes?.data;
        setEstimateNumber(quote?.estimate_number || '');
        const remaining = Math.max(parseFloat(progressRes?.remaining_amount ?? quote?.total_amount ?? 0), 0);
        setServiceRemaining(remaining);
        setServiceAmount(remaining > 0 ? String(remaining) : '');
        setPayService(remaining > 0);
        setBankAccounts(banksRes?.data || []);

        const productQuoteId = quote?.product_quote_id;
        if (productQuoteId) {
          let invRes = await apiClient.getProductInvoices({ quote_id: productQuoteId });
          let invoices = Array.isArray(invRes?.data) ? invRes.data : [];
          let unpaid = invoices.find((i) => i.status !== 'PAID') || null;

          // A linked PRODUCT quote only gets its own `invoices` row once
          // someone explicitly "accepts & invoices" it (normally done from
          // the Products page). Accepting the SERVICE quote here doesn't do
          // that, so without this the product portion would silently never
          // show up in this modal. Auto-generate it here instead.
          if (!unpaid) {
            try {
              await apiClient.createInvoiceFromQuote(productQuoteId);
              invRes = await apiClient.getProductInvoices({ quote_id: productQuoteId });
              invoices = Array.isArray(invRes?.data) ? invRes.data : [];
              unpaid = invoices.find((i) => i.status !== 'PAID') || null;
            } catch {
              // Already invoiced under a race, or quote isn't invoiceable yet — ignore.
            }
          }

          setProductInvoice(unpaid);
          setPayProduct(!!unpaid);
        }
      } catch (err) {
        setError(err.message || 'Failed to load payment details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quoteId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const svcAmt = payService ? parseFloat(serviceAmount) || 0 : 0;
    if (payService && (svcAmt <= 0 || svcAmt > serviceRemaining + 0.01)) {
      setError(`Service amount must be between 0 and ${money(serviceRemaining)}`);
      return;
    }
    if (!payService && !payProduct) {
      setError('Select at least one portion to pay');
      return;
    }
    if (requiresBankAccount && !bankAccountId) {
      setError('Please select a bank account');
      return;
    }
    if (isCheque && (!chequeNumber || !chequeDate)) {
      setError('Cheque number and date are required');
      return;
    }

    setSubmitting(true);
    try {
      const sharedFields = {
        payment_method: paymentMethod,
        bank_account_id: bankAccountId || null,
        cheque_number: chequeNumber || null,
        cheque_date: chequeDate || null,
        reference_number: referenceNumber || null,
        notes: notes || null,
      };

      if (payService && svcAmt > 0) {
        await apiClient.recordQuotePayment(quoteId, { ...sharedFields, amount_received: svcAmt }, slipFile);
      }
      if (payProduct && productInvoice) {
        await apiClient.recordProductInvoicePayment(productInvoice.invoice_id, sharedFields, slipFile);
      }

      onRecorded();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Record Payment{estimateNumber ? ` — ${estimateNumber}` : ''}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            {/* Allocation */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Apply payment to</p>

              {serviceRemaining > 0 && (
                <div className="rounded-lg border border-slate-200 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={payService} onChange={(e) => setPayService(e.target.checked)} />
                    Service charges — remaining {money(serviceRemaining)}
                  </label>
                  {payService && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      max={serviceRemaining}
                      value={serviceAmount}
                      onChange={(e) => setServiceAmount(e.target.value)}
                      className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                      placeholder="Amount for service charges"
                    />
                  )}
                </div>
              )}

              {productInvoice && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-purple-800">
                    <input type="checkbox" checked={payProduct} onChange={(e) => setPayProduct(e.target.checked)} />
                    Products &amp; Rentals ({productInvoice.invoice_code}) — full amount {money(productInvoice.amount)}
                  </label>
                  <p className="mt-1 pl-6 text-[11px] text-purple-600">
                    Must be paid in full — partial payment isn't supported for this portion.
                  </p>
                </div>
              )}

              {serviceRemaining <= 0 && !productInvoice && (
                <p className="text-xs text-slate-500">This quotation is already fully paid.</p>
              )}
            </div>

            {(payService || payProduct) && (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  >
                    {paymentMethodOptions.map((m) => (
                      <option key={m} value={m}>{m.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                {requiresBankAccount && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">Bank Account</label>
                    <select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">Select bank account</option>
                      {bankAccounts.map((a) => (
                        <option key={a.account_id} value={a.account_id}>
                          {a.account_nickname} ({a.bank_name || a.account_number})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isCheque && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={chequeNumber}
                      onChange={(e) => setChequeNumber(e.target.value)}
                      placeholder="Cheque number"
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <input
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                      className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                )}

                <input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Reference number (optional)"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                />

                <div className="rounded-lg border border-slate-200 p-3">
                  <label className="mb-1.5 block text-[11px] font-medium text-slate-500">Payment Slip (optional)</label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                    <Upload className="h-3.5 w-3.5" /> Choose File
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {slipFile && <p className="mt-1.5 text-xs text-slate-600">{slipFile.name}</p>}
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (optional)"
                  rows={2}
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Recording…' : 'Submit Payment'}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default PaymentAllocationModal;
