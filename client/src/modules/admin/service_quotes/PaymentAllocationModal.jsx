import { useEffect, useState } from 'react';
import { X, Upload, Loader2, BadgeDollarSign, Lock, Receipt, CheckCircle2, Clock3 } from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';

const paymentMethodOptions = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SectionHeader = ({ title }) => (
  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{title}</p>
);

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';

// Sums a product quote's line items for the combined Summary total below —
// a rental item's own amount plus its refundable deposit (deposit_amount is
// a separate field, not folded into amount) both count toward the total.
const productLineItemsTotal = (items) => {
  let total = 0;
  for (const li of items || []) {
    total += parseFloat(li.amount) || 0;
    if (li.rental_billing_type) {
      total += parseFloat(li.deposit_amount) || 0;
    }
  }
  return total;
};

// Registration fee is treated as the first "bucket" any payment against the
// SERVICE quote fills (see paymentTrackingController.recordPayment) — the
// threshold basis is the SERVICE-only paid amount, not the combined
// service+product figure.
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

// Lets an admin record one payment and allocate it across a SERVICE quote's
// own remaining balance and/or its linked PRODUCT invoice (rentals/purchases/
// deposits added via ModularQuoteBuilder), in a single action — instead of
// having to visit two separate screens (Quotations page for the service
// portion, Products page for the product portion). payment_tracking (service)
// and the generic `invoices` table (product) are still two independent
// records under the hood (see quoteController.linked_quote_id /
// ensureCombinedInvoice) — this just fires both existing endpoints together.
//
// If a registration fee line item exists and isn't fully settled yet, it's
// treated as a hard gate: the admin can only allocate this payment toward the
// registration fee until it's settled — service charges and products stay
// locked, mirroring the order the backend already applies payments in.
const PaymentAllocationModal = ({ quoteId, onClose, onRecorded }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [estimateNumber, setEstimateNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerMobile, setPayerMobile] = useState('');
  const [serviceTotal, setServiceTotal] = useState(0);
  const [servicePaid, setServicePaid] = useState(0);
  const [serviceRemaining, setServiceRemaining] = useState(0);
  const [regFeeInfo, setRegFeeInfo] = useState(null);
  const [productInvoices, setProductInvoices] = useState([]); // unpaid [{ invoice_id, invoice_code, amount, status }, ...]
  const [productTotal, setProductTotal] = useState(0);
  const [productPaid, setProductPaid] = useState(0);

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

  // Registration fee gate — until it's settled, this payment can only go
  // toward it; service charges and products stay locked.
  const regFeeLocked = !!regFeeInfo && !regFeeInfo.settled;
  const serviceOtherRemaining = Math.max(serviceRemaining - (regFeeInfo?.remaining || 0), 0);
  const serviceCap = regFeeLocked ? regFeeInfo.remaining : serviceRemaining;

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
        setPayerName(quote?.payer_name || '');
        setPayerMobile(quote?.payer_mobile || '');
        setServiceTotal(parseFloat(progressRes?.total_amount ?? quote?.total_amount ?? 0));
        setServicePaid(parseFloat(progressRes?.total_paid || 0));

        const remaining = Math.max(parseFloat(progressRes?.remaining_amount ?? quote?.total_amount ?? 0), 0);
        setServiceRemaining(remaining);

        const regInfo = getRegFeeInfo(progressRes?.total_paid, quote?.line_items);
        setRegFeeInfo(regInfo);
        const locked = !!regInfo && !regInfo.settled;
        const cap = locked ? regInfo.remaining : remaining;
        setServiceAmount(cap > 0 ? String(cap) : '');
        setPayService(cap > 0);
        setBankAccounts(banksRes?.data || []);

        const productQuoteId = quote?.product_quote_id;
        if (productQuoteId) {
          // Product total is pulled independently of the registration-fee
          // lock so the Summary panel's combined Total reflects products &
          // deposits even while the lock prevents actually paying them yet.
          try {
            const productDetail = await apiClient.getProductQuote(productQuoteId);
            setProductTotal(productLineItemsTotal(productDetail?.data?.line_items));
          } catch {
            setProductTotal(0);
          }

          try {
            let invRes = await apiClient.getProductInvoices({ quote_id: productQuoteId });
            let invoices = Array.isArray(invRes?.data) ? invRes.data : [];
            setProductPaid(invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0));

            if (!locked) {
              let unpaidList = invoices.filter((i) => i.status !== 'PAID');

              // A linked PRODUCT quote only gets its own `invoices` row(s) once
              // someone explicitly accepts it (normally done from the Products
              // page). Accepting the SERVICE quote here doesn't do that, so
              // without this the product portion would silently never show up
              // in this modal. Accept it here instead — via acceptProductQuote,
              // NOT createInvoiceFromQuote: a quote can contain RENTAL line
              // items, and only acceptProductQuote knows how to create the
              // rental_agreements row(s) and mark the unit(s) RENTED. Using
              // the flat invoice-only endpoint here previously let a rental
              // get fully paid for while never being recorded as rented (see
              // the EST-1368/BED-003 incident).
              if (invoices.length === 0) {
                try {
                  await apiClient.acceptProductQuote(productQuoteId);
                } catch {
                  // Already accepted under a race, or quote isn't acceptable yet
                  // — either way, re-fetch below to pick up whatever exists now.
                }
                try {
                  invRes = await apiClient.getProductInvoices({ quote_id: productQuoteId });
                  invoices = Array.isArray(invRes?.data) ? invRes.data : [];
                  unpaidList = invoices.filter((i) => i.status !== 'PAID');
                } catch {
                  unpaidList = [];
                }
              }

              setProductInvoices(unpaidList);
              setPayProduct(unpaidList.length > 0);
            }
          } catch {
            setProductPaid(0);
          }
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
    if (payService && (svcAmt <= 0 || svcAmt > serviceCap + 0.01)) {
      setError(
        regFeeLocked
          ? `Registration fee amount must be between 0 and ${money(serviceCap)}`
          : `Service amount must be between 0 and ${money(serviceCap)}`
      );
      return;
    }
    if (!payService && !(payProduct && !regFeeLocked)) {
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
      if (payProduct && !regFeeLocked && productInvoices.length > 0) {
        for (const inv of productInvoices) {
          await apiClient.recordProductInvoicePayment(inv.invoice_id, sharedFields, slipFile);
        }
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
      <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Record Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {estimateNumber}
              {payerName && <span> &middot; {payerName}</span>}
              {payerMobile && <span className="text-slate-300"> ({payerMobile})</span>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
            )}

            {/* Summary — combined total = service charges (incl. registration
                fee) + products/rentals + refundable deposits, matching the
                figure shown on the Quotations and Quotation Details pages. */}
            <div>
              <SectionHeader title="Summary" />
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    <Receipt className="h-3 w-3" /> Total
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-0.5">{money(serviceTotal + productTotal)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    <CheckCircle2 className="h-3 w-3" /> Paid
                  </div>
                  <p className="text-sm font-semibold text-emerald-700 mt-0.5">{money(servicePaid + productPaid)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    <Clock3 className="h-3 w-3" /> Remaining
                  </div>
                  <p className="text-sm font-semibold text-amber-700 mt-0.5">{money(Math.max((serviceTotal + productTotal) - (servicePaid + productPaid), 0))}</p>
                </div>
              </div>
            </div>

            {/* Allocation */}
            <div>
              <SectionHeader title="Apply Payment To" />
              <div className="space-y-2">

                {regFeeInfo && (
                  <div className={`rounded-lg border p-3 ${regFeeLocked ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <label className={`flex items-center gap-2 text-sm font-medium ${regFeeLocked ? 'text-amber-900' : 'text-emerald-800'}`}>
                      <input
                        type="checkbox"
                        checked={regFeeLocked ? payService : true}
                        disabled={!regFeeLocked}
                        onChange={(e) => regFeeLocked && setPayService(e.target.checked)}
                      />
                      <BadgeDollarSign className="h-3.5 w-3.5 shrink-0" />
                      Registration Fee
                      {regFeeLocked && <span className="font-normal text-amber-700">— remaining {money(regFeeInfo.remaining)}</span>}
                    </label>

                    {regFeeLocked ? (
                      payService && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          max={regFeeInfo.remaining}
                          value={serviceAmount}
                          onChange={(e) => setServiceAmount(e.target.value)}
                          className="mt-2 ml-6 w-[calc(100%-1.5rem)] rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                          placeholder="Amount toward registration fee"
                        />
                      )
                    ) : (
                      <p className="mt-1 ml-6 flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Settled — {money(regFeeInfo.allocated)} of {money(regFeeInfo.amount)}
                      </p>
                    )}
                  </div>
                )}

                {regFeeLocked ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 font-medium text-slate-600">
                      <Lock className="h-3.5 w-3.5" /> Service charges &amp; products locked
                    </div>
                    <p className="mt-1">
                      The registration fee must be settled before other service charges
                      {productInvoices.length > 0 ? ' or products & rentals' : ''} can be paid.
                      {serviceOtherRemaining > 0 && <> {money(serviceOtherRemaining)} in other service charges is waiting.</>}
                    </p>
                  </div>
                ) : (
                  <>
                    {serviceRemaining > 0 && (
                      <div className="rounded-lg border border-slate-200 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                          <input type="checkbox" checked={payService} onChange={(e) => setPayService(e.target.checked)} />
                          {regFeeInfo ? 'Remaining service charges' : 'Service charges'} — remaining {money(serviceRemaining)}
                        </label>
                        {payService && (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={serviceRemaining}
                            value={serviceAmount}
                            onChange={(e) => setServiceAmount(e.target.value)}
                            className="mt-2 ml-6 w-[calc(100%-1.5rem)] rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                            placeholder="Amount for service charges"
                          />
                        )}
                      </div>
                    )}

                    {productInvoices.length > 0 && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-purple-800">
                          <input type="checkbox" checked={payProduct} onChange={(e) => setPayProduct(e.target.checked)} />
                          Products &amp; Rentals ({productInvoices.map((i) => i.invoice_code).join(', ')}) — full amount{' '}
                          {money(productInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0))}
                        </label>
                        <p className="mt-1 pl-6 text-[11px] text-purple-600">
                          Must be paid in full — partial payment isn&apos;t supported for this portion.
                        </p>
                      </div>
                    )}

                    {serviceRemaining <= 0 && productInvoices.length === 0 && (
                      <p className="text-xs text-slate-500">This quotation is already fully paid.</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {(payService || (payProduct && !regFeeLocked)) && (
              <>
                <div>
                  <SectionHeader title="Payment Details" />
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className={inputCls}
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
                          className={inputCls}
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
                          className={inputCls}
                        />
                        <DateInput
                          value={chequeDate}
                          onChange={(e) => setChequeDate(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    )}

                    <input
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      placeholder="Reference number (optional)"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <SectionHeader title="Attachment" />
                  <div className="rounded-lg border border-slate-200 p-3">
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
                    {!slipFile && <p className="mt-1.5 text-xs text-slate-400">Payment slip (optional)</p>}
                  </div>
                </div>

                <div>
                  <SectionHeader title="Notes" />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    rows={2}
                    className={inputCls}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
