import { useEffect, useMemo, useState } from 'react';
import { X, Upload, Loader2, BadgeDollarSign, CheckCircle2, Lock, ArrowLeft, ArrowRight, Receipt, Wallet, AlertTriangle } from 'lucide-react';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';

const paymentMethodOptions = ['BANK_TRANSFER', 'CASH_DEPOSIT', 'CASH', 'CHEQUE'];

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';

// Sums a product quote's line items — a rental item's own amount plus its
// refundable deposit (deposit_amount is a separate field, not folded into
// amount) both count toward the Products & Rentals bucket's total.
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
    remaining: Math.max(amount - paid, 0),
    settled: paid >= amount,
  };
};

const BUCKET_META = {
  reg_fee: { label: 'Registration Fee', hint: 'Must be settled first', accent: 'text-violet-700' },
  service: { label: 'Service Charges', hint: 'Remaining care/service charges', accent: 'text-blue-700' },
  products: { label: 'Products & Rentals', hint: 'Purchases, rentals & deposits', accent: 'text-amber-700' },
};

// Lets an admin record ONE payment and allocate it across up to three
// buckets — Registration Fee, Service Charges, Products & Rentals — in a
// single action (see backend paymentTrackingController.recordAllocatedPayment).
// Registration fee is a hard-gated priority bucket: its allocation must
// fully cover whatever's still due on it before the other two buckets can
// receive anything from this same payment, mirroring the waterfall order
// the backend already enforced implicitly. This still fires against two
// separate ledgers under the hood — payment_tracking for the service quote,
// invoices/invoice_payments for the linked PRODUCT quote — as one request.
const PaymentAllocationModal = ({ quoteId, onClose, onRecorded }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(1);

  const [estimateNumber, setEstimateNumber] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerMobile, setPayerMobile] = useState('');
  const [clientId, setClientId] = useState(null);
  const [regFeeInfo, setRegFeeInfo] = useState(null);
  const [serviceOnlyRemaining, setServiceOnlyRemaining] = useState(0);
  const [productsRemaining, setProductsRemaining] = useState(0);
  const [combinedRemaining, setCombinedRemaining] = useState(0);

  const [bankAccounts, setBankAccounts] = useState([]);
  const [amountReceived, setAmountReceived] = useState('');
  const [allocations, setAllocations] = useState({ reg_fee: '', service: '', products: '' });

  // Overflow — where to route whatever's left once the three buckets above
  // are maxed out (a client overpaying the quotation is allowed; it just
  // needs a destination).
  const [overflowChoice, setOverflowChoice] = useState(''); // 'WALLET' | 'BOOKING_PAYOFF'
  const [overflowBookingId, setOverflowBookingId] = useState('');
  const [overdueBookings, setOverdueBookings] = useState(null); // null = not fetched yet
  const [overdueBookingsLoading, setOverdueBookingsLoading] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [slipFile, setSlipFile] = useState(null);

  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod);
  const isCheque = paymentMethod === 'CHEQUE';

  // Vendor-linked line items on the companion PRODUCT quote (if any) that
  // haven't been accepted yet — surfaced as part of this same Step 2
  // allocation screen instead of a separate gate, so recording the payment
  // and deciding how to pay the vendor happen in one action. Without this,
  // the accept-on-open fallback below would call acceptProductQuote with no
  // vendor_payments, silently leaving every vendor bill unpaid with no admin
  // decision — same prompt ProductsPage.jsx shows on its own "Accept &
  // Invoice" button; this is the other place acceptProductQuote can fire from.
  const [productQuoteId, setProductQuoteId] = useState(null);
  const [vendorItems, setVendorItems] = useState([]);
  const [vendorDecisions, setVendorDecisions] = useState({});

  const updateVendorDecision = (lineItemId, patch) => {
    setVendorDecisions((prev) => ({ ...prev, [lineItemId]: { ...prev[lineItemId], ...patch } }));
  };

  // Fetches the linked product quote's line items + invoices and either:
  //  - it's already accepted (invoices exist) → just compute the due amount
  //  - it isn't accepted yet and has no vendor-linked items → silently accept
  //    it now (original behavior, unaffected)
  //  - it isn't accepted yet and HAS vendor-linked items → leave it
  //    unaccepted for now and record which items need a decision; handleSubmit
  //    accepts it (with vendor_payments) as the first step of submitting this
  //    same payment, so the due amount shown here is the full product total
  //    (nothing paid/accepted yet).
  const resolveProductBucket = async (pQuoteId, regRemaining, svcOnlyRemaining) => {
    let productsDue = 0;
    let productsWarning = '';
    try {
      // Ground truth for what was quoted — read straight from the product
      // quote's own line items (same source quotation_details.jsx /
      // quotations.jsx use for their Total figure), independent of whether
      // `invoices` rows exist yet. Relying on `invoices` alone previously
      // understated the Products & Rentals bucket whenever the accept-on-open
      // fallback below didn't run (e.g. the quote was already accepted but
      // its invoice rows were fetched before this modal existed).
      const productDetail = await apiClient.getProductQuote(pQuoteId);
      const productLineItems = productDetail?.data?.line_items || [];
      const productsTotal = productLineItemsTotal(productLineItems);

      let invRes = await apiClient.getProductInvoices({ quote_id: pQuoteId });
      let invoices = Array.isArray(invRes?.data) ? invRes.data : [];

      // A linked PRODUCT quote only gets its own `invoices` row(s) once
      // someone explicitly accepts it — accept it here (via
      // acceptProductQuote, NOT createInvoiceFromQuote: only that path
      // knows how to create rental_agreements and mark units RENTED —
      // see the EST-1368/BED-003 incident) so the Products & Rentals
      // bucket doesn't silently disappear from this modal.
      if (invoices.length === 0 && productLineItems.length > 0) {
        const vItems = productLineItems.filter((li) => li.vendor_id);
        if (vItems.length > 0) {
          const initialDecisions = {};
          for (const li of vItems) {
            const defaultAmount = parseFloat(li.cost_price_snapshot ?? li.product_cost_price ?? 0) * parseFloat(li.quantity || 1);
            initialDecisions[li.line_item_id] = {
              pay_now: false,
              amount: defaultAmount || 0,
              payment_method: 'CASH',
              bank_account_id: '',
              cheque_number: '',
              cheque_date: '',
            };
          }
          setVendorItems(vItems);
          setVendorDecisions(initialDecisions);
          // Not accepted yet — nothing paid, so the full quoted total is due.
          // acceptProductQuote runs at submit time instead (see handleSubmit).
          setProductsRemaining(productsTotal);
          setCombinedRemaining(regRemaining + svcOnlyRemaining + productsTotal);
          setLoading(false);
          return;
        }

        try {
          await apiClient.acceptProductQuote(pQuoteId);
          invRes = await apiClient.getProductInvoices({ quote_id: pQuoteId });
          invoices = Array.isArray(invRes?.data) ? invRes.data : [];
        } catch (acceptErr) {
          // A 409 here just means it's already accepted under a race —
          // anything else means invoices genuinely don't exist yet and
          // productsTotal (from line items) is still the right due amount.
          console.warn('acceptProductQuote fallback failed:', acceptErr.message);
        }
      }

      // A fully-PAID invoice counts as fully paid even if it predates
      // the invoice_payments ledger (no rows there yet for it) —
      // amount_paid alone would understate it in that case.
      const productsPaid = invoices.reduce(
        (s, i) => s + (i.status === 'PAID' ? (parseFloat(i.amount) || 0) : (parseFloat(i.amount_paid) || 0)),
        0
      );
      productsDue = Math.max(productsTotal - productsPaid, 0);
    } catch (productErr) {
      // Surfaced instead of silently showing 0 — a failed fetch here
      // (permissions, network, etc.) previously looked identical to
      // "this quote genuinely has no products", which made the bucket
      // vanish from the allocation table with no explanation.
      console.error('Failed to load Products & Rentals bucket:', productErr);
      productsDue = 0;
      productsWarning = `Products & Rentals couldn't be loaded (${productErr.message || 'unknown error'}) — its amount is not included below.`;
    }
    setProductsRemaining(productsDue);
    setCombinedRemaining(regRemaining + svcOnlyRemaining + productsDue);
    if (productsWarning) setError(productsWarning);
    setLoading(false);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      setVendorItems([]);
      setVendorDecisions({});
      const [quoteRes, progressRes, banksRes] = await Promise.all([
        apiClient.getQuoteWithLineItems(quoteId),
        apiClient.getQuotePaymentProgress(quoteId),
        apiClient.getBankAccounts(),
      ]);
      const quote = quoteRes?.data;
      setEstimateNumber(quote?.estimate_number || '');
      setPayerName(quote?.payer_name || '');
      setPayerMobile(quote?.payer_mobile || '');
      setClientId(quote?.request_client_id || null);
      setBankAccounts(banksRes?.data || []);

      const serviceRemaining = Math.max(parseFloat(progressRes?.remaining_amount ?? quote?.total_amount ?? 0), 0);
      const regInfo = getRegFeeInfo(progressRes?.total_paid, quote?.line_items);
      setRegFeeInfo(regInfo);
      const svcOnly = Math.max(serviceRemaining - (regInfo?.remaining || 0), 0);
      setServiceOnlyRemaining(svcOnly);

      // The linked PRODUCT quote (rentals/purchases/deposits added via the
      // Products & Rentals section) is a SEPARATE quotations row, joined in
      // by getQuoteWithLineItems via quotations.linked_quote_id — if this
      // quote was never given a companion PRODUCT quote (or the join
      // didn't find one), there is nothing to fetch and the bucket is
      // correctly absent, not a bug.
      const pQuoteId = quote?.product_quote_id || null;
      setProductQuoteId(pQuoteId);
      if (!pQuoteId) {
        setProductsRemaining(0);
        setCombinedRemaining((regInfo?.remaining || 0) + svcOnly);
        setLoading(false);
        return;
      }

      await resolveProductBucket(pQuoteId, regInfo?.remaining || 0, svcOnly);
    } catch (err) {
      setError(err.message || 'Failed to load payment details');
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [quoteId]);

  const regFeeRemaining = regFeeInfo?.remaining || 0;
  const buckets = useMemo(() => {
    const list = [];
    if (regFeeInfo && regFeeRemaining > 0) list.push({ key: 'reg_fee', due: regFeeRemaining });
    if (serviceOnlyRemaining > 0) list.push({ key: 'service', due: serviceOnlyRemaining });
    if (productsRemaining > 0) list.push({ key: 'products', due: productsRemaining });
    return list;
  }, [regFeeInfo, regFeeRemaining, serviceOnlyRemaining, productsRemaining]);

  // Reg fee must be fully covered by this payment's own allocation before
  // the other buckets can take anything — mirrors the backend's own check.
  const regFeeAllocated = parseFloat(allocations.reg_fee) || 0;
  const regFeeGateOpen = regFeeRemaining <= 0.01 || regFeeAllocated >= regFeeRemaining - 0.01;

  const allocatedTotal = ['reg_fee', 'service', 'products'].reduce(
    (s, k) => s + (parseFloat(allocations[k]) || 0), 0
  );
  const parsedAmount = parseFloat(amountReceived) || 0;
  const unallocated = Math.round((parsedAmount - allocatedTotal) * 100) / 100;

  // Once every bucket that has anything due has been allocated up to its
  // cap, any amount still unallocated is a genuine overpayment — not a
  // mistake to block — and needs an admin-chosen destination instead.
  const bucketsMaxed = buckets.every((b) => (parseFloat(allocations[b.key]) || 0) >= b.due - 0.01);
  const showOverflow = unallocated > 0.01 && bucketsMaxed;
  const chosenOverdueBooking = (overdueBookings || []).find((b) => b.booking_id === overflowBookingId);

  useEffect(() => {
    if (!showOverflow || !clientId || overdueBookings !== null) return;
    setOverdueBookingsLoading(true);
    apiClient.getClientOverdueBookings(clientId)
      .then((res) => setOverdueBookings(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setOverdueBookings([]))
      .finally(() => setOverdueBookingsLoading(false));
  }, [showOverflow, clientId, overdueBookings]);

  // Waterfall pre-fill when entering Step 2 — reg fee first, then service,
  // then products, up to the entered amount. Admin can still hand-edit any
  // row afterward as long as the totals reconcile. Anything beyond what the
  // three buckets can take is left unallocated for the overflow step below.
  const prefillAllocations = (amount) => {
    let remaining = amount;
    const next = { reg_fee: '', service: '', products: '' };
    for (const bucket of buckets) {
      if (remaining <= 0.005) break;
      const take = Math.min(remaining, bucket.due);
      next[bucket.key] = take > 0 ? String(take) : '';
      remaining -= take;
    }
    setAllocations(next);
  };

  const validateStep1 = () => {
    if (!parsedAmount || parsedAmount <= 0) return 'Enter the amount received';
    if (requiresBankAccount && !bankAccountId) return 'Please select a bank account';
    if (isCheque && (!chequeNumber || !chequeDate)) return 'Cheque number and date are required';
    return '';
  };

  const goToStep2 = () => {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError('');
    setOverflowChoice('');
    setOverflowBookingId('');
    setOverdueBookings(null);
    prefillAllocations(parsedAmount);
    setStep(2);
  };

  const handleAllocationChange = (key, value) => {
    setAllocations((prev) => ({ ...prev, [key]: value }));
  };

  const validateStep2 = () => {
    for (const bucket of buckets) {
      const val = parseFloat(allocations[bucket.key]) || 0;
      if (val > bucket.due + 0.01) return `${BUCKET_META[bucket.key].label} allocation exceeds its due amount`;
      if (val < 0) return 'Allocations cannot be negative';
    }
    if (!regFeeGateOpen && ((parseFloat(allocations.service) || 0) > 0 || (parseFloat(allocations.products) || 0) > 0)) {
      return 'Registration fee must be fully allocated before allocating to other charges';
    }
    if (unallocated < -0.01) return 'Allocated amount exceeds the payment amount';
    if (unallocated > 0.01) {
      if (!bucketsMaxed) return `${money(unallocated)} is still unallocated`;
      if (!overflowChoice) return `This payment exceeds what's due by ${money(unallocated)} — choose what to do with the extra`;
      if (overflowChoice === 'BOOKING_PAYOFF') {
        if (!overflowBookingId) return 'Select a booking to pay off with the extra amount';
        if (chosenOverdueBooking && unallocated > chosenOverdueBooking.overdue_amount + 0.01) {
          return `The extra (${money(unallocated)}) exceeds that booking's overdue amount (${money(chosenOverdueBooking.overdue_amount)})`;
        }
      }
    }
    return '';
  };

  // Validates the pay-now decisions for vendor-linked product items (if any
  // are pending — see resolveProductBucket). Independent of validateStep2's
  // allocation math: this is about how the company pays an outside vendor,
  // not how much of the client's payment covers which bucket.
  const validateVendorDecisions = () => {
    for (const li of vendorItems) {
      const d = vendorDecisions[li.line_item_id];
      if (!d?.pay_now) continue;
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && !d.bank_account_id) {
        return `Select a bank account to pay vendor for "${li.description}"`;
      }
      if (d.payment_method === 'CHEQUE' && (!d.cheque_number || !d.cheque_date)) {
        return `Cheque number and date are required to pay vendor for "${li.description}"`;
      }
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateStep2() || validateVendorDecisions();
    if (err) { setError(err); return; }
    setError('');

    setSubmitting(true);
    try {
      // The linked PRODUCT quote must exist as `invoices` rows before this
      // payment can allocate anything to the Products & Rentals bucket (see
      // paymentTrackingController's check) — if vendor items were pending a
      // decision, accept it now, bundled into this same submit action, with
      // whatever pay-now/leave-unpaid choices the admin made above.
      if (vendorItems.length > 0 && productQuoteId) {
        await apiClient.acceptProductQuote(productQuoteId, { vendor_payments: vendorDecisions });
      }

      const payload = {
        amount_received: parsedAmount,
        allocations: {
          reg_fee: parseFloat(allocations.reg_fee) || 0,
          service: parseFloat(allocations.service) || 0,
          products: parseFloat(allocations.products) || 0,
        },
        overflow: unallocated > 0.01
          ? (overflowChoice === 'BOOKING_PAYOFF'
            ? { type: 'BOOKING_PAYOFF', booking_id: overflowBookingId }
            : { type: 'WALLET' })
          : undefined,
        payment_method: paymentMethod,
        bank_account_id: bankAccountId || null,
        cheque_number: chequeNumber || null,
        cheque_date: chequeDate || null,
        reference_number: referenceNumber || null,
        notes: notes || null,
      };
      await apiClient.recordAllocatedQuotePayment(quoteId, payload, slipFile);
      onRecorded();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
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

        {/* Stepper */}
        {!loading && (
          <div className="flex items-center gap-2 px-5 pt-4">
            <StepPip index={1} label="Amount & Method" active={step === 1} done={step > 1} />
            <div className={`h-px flex-1 ${step > 1 ? 'bg-blue-400' : 'bg-slate-200'}`} />
            <StepPip index={2} label="Allocate" active={step === 2} done={false} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={step === 2 ? handleSubmit : (e) => e.preventDefault()} className="px-5 py-4 space-y-5">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
            )}

            {step === 1 ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Amount Received
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-slate-400">LKR</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      autoFocus
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl font-semibold text-slate-900 outline-none placeholder-slate-300"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Balance due: {money(combinedRemaining)}
                    {parsedAmount > combinedRemaining + 0.01 && ' — you\'ll be asked how to apply the extra next'}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Details</p>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">Payment Method</label>
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputCls}>
                        {paymentMethodOptions.map((m) => (
                          <option key={m} value={m}>{m.replace('_', ' ')}</option>
                        ))}
                      </select>
                    </div>

                    {requiresBankAccount && (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-slate-500">Bank Account</label>
                        <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={inputCls}>
                          <option value="">Select bank account</option>
                          {bankAccounts
                            .filter((a) => !(paymentMethod === 'BANK_TRANSFER' && a.is_petty_cash))
                            .map((a) => (
                              <option key={a.account_id} value={a.account_id}>
                                {a.account_nickname} ({a.bank_name || a.account_number})
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    {isCheque && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} placeholder="Cheque number" className={inputCls} />
                        <DateInput value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputCls} />
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
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Attachment</p>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      <Upload className="h-3.5 w-3.5" /> Choose File
                      <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={(e) => setSlipFile(e.target.files?.[0] || null)} />
                    </label>
                    {slipFile && <p className="mt-1.5 text-xs text-slate-600">{slipFile.name}</p>}
                    {!slipFile && <p className="mt-1.5 text-xs text-slate-400">Payment slip (optional)</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={inputCls} />
                </div>

                <button
                  type="button"
                  onClick={goToStep2}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Next: Allocate Payment <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Amount to allocate</span>
                  <span className="text-sm font-semibold text-slate-900">{money(parsedAmount)}</span>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Apply Payment To</p>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Bucket</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Due</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Allocate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {regFeeInfo && (
                          <BucketRow
                            meta={BUCKET_META.reg_fee}
                            icon={BadgeDollarSign}
                            due={regFeeRemaining}
                            settled={regFeeRemaining <= 0.01}
                            value={allocations.reg_fee}
                            disabled={regFeeRemaining <= 0.01}
                            onChange={(v) => handleAllocationChange('reg_fee', v)}
                          />
                        )}
                        {serviceOnlyRemaining > 0 && (
                          <BucketRow
                            meta={BUCKET_META.service}
                            icon={Receipt}
                            due={serviceOnlyRemaining}
                            settled={false}
                            value={allocations.service}
                            disabled={!regFeeGateOpen}
                            onChange={(v) => handleAllocationChange('service', v)}
                          />
                        )}
                        {productsRemaining > 0 && (
                          <BucketRow
                            meta={BUCKET_META.products}
                            icon={Receipt}
                            due={productsRemaining}
                            settled={false}
                            value={allocations.products}
                            disabled={!regFeeGateOpen}
                            onChange={(v) => handleAllocationChange('products', v)}
                          />
                        )}
                      </tbody>
                    </table>
                  </div>
                  {!regFeeGateOpen && (
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                      <Lock className="h-3 w-3" /> Registration fee must be fully allocated before other charges unlock.
                    </p>
                  )}
                </div>

                {vendorItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vendor Payments</p>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Some Products &amp; Rentals items are sourced from a vendor. Decide how to settle each one — this is separate from the client's payment above and will be submitted together with it.
                    </p>
                    <div className="space-y-2">
                      {vendorItems.map((li) => {
                        const d = vendorDecisions[li.line_item_id] || {};
                        return (
                          <div key={li.line_item_id} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-800">{li.description}</p>
                              <span className="shrink-0 text-[11px] text-slate-400">Vendor: {li.vendor_name}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-[11px] font-medium text-slate-500">Amount owed</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={d.amount}
                                onChange={(e) => updateVendorDecision(li.line_item_id, { amount: e.target.value })}
                                onWheel={(e) => e.target.blur()}
                                className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                              />
                            </div>

                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => updateVendorDecision(li.line_item_id, { pay_now: false })}
                                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                                  !d.pay_now ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                Leave Unpaid
                              </button>
                              <button
                                type="button"
                                onClick={() => updateVendorDecision(li.line_item_id, { pay_now: true })}
                                className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                                  d.pay_now ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                Pay Now
                              </button>
                            </div>

                            {d.pay_now && (
                              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                                <select
                                  value={d.payment_method}
                                  onChange={(e) => updateVendorDecision(li.line_item_id, { payment_method: e.target.value })}
                                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                                >
                                  {paymentMethodOptions.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                                </select>

                                {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && (
                                  <select
                                    value={d.bank_account_id}
                                    onChange={(e) => updateVendorDecision(li.line_item_id, { bank_account_id: e.target.value })}
                                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                                  >
                                    <option value="">Select bank account…</option>
                                    {bankAccounts
                                      .filter((b) => !(d.payment_method === 'BANK_TRANSFER' && b.is_petty_cash))
                                      .map((b) => (
                                        <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                                      ))}
                                  </select>
                                )}

                                {d.payment_method === 'CHEQUE' && (
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="Cheque number"
                                      value={d.cheque_number}
                                      onChange={(e) => updateVendorDecision(li.line_item_id, { cheque_number: e.target.value })}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                                    />
                                    <DateInput
                                      value={d.cheque_date}
                                      onChange={(e) => updateVendorDecision(li.line_item_id, { cheque_date: e.target.value })}
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={`rounded-lg border px-3 py-2.5 flex items-center justify-between ${Math.abs(unallocated) <= 0.01 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <span className={`text-xs font-medium ${Math.abs(unallocated) <= 0.01 ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {Math.abs(unallocated) <= 0.01 ? (
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Fully allocated</span>
                    ) : !bucketsMaxed ? (
                      `Unallocated: ${money(unallocated)}`
                    ) : (
                      `Overpayment: ${money(unallocated)} more than what's due`
                    )}
                  </span>
                </div>

                {showOverflow && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                      <AlertTriangle className="h-3.5 w-3.5" /> This payment exceeds what&apos;s due on this quotation
                    </p>
                    <p className="mt-1 text-[11px] text-blue-700">
                      Choose what to do with the extra {money(unallocated)}.
                    </p>

                    <div className="mt-2.5 space-y-2">
                      <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 cursor-pointer has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50">
                        <input
                          type="radio"
                          name="overflow-choice"
                          className="mt-0.5"
                          checked={overflowChoice === 'WALLET'}
                          onChange={() => setOverflowChoice('WALLET')}
                        />
                        <span className="flex items-start gap-2 text-xs">
                          <Wallet className="h-3.5 w-3.5 mt-0.5 text-blue-600 shrink-0" />
                          <span>
                            <span className="font-medium text-slate-800">Add to client&apos;s wallet</span>
                            <span className="block text-[11px] text-slate-500">Credited as wallet balance, usable against future charges.</span>
                          </span>
                        </span>
                      </label>

                      <label className={`flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2.5 ${overdueBookingsLoading || (overdueBookings && overdueBookings.length === 0) ? 'opacity-50' : 'cursor-pointer'} has-[:checked]:border-blue-400 has-[:checked]:bg-blue-50`}>
                        <input
                          type="radio"
                          name="overflow-choice"
                          className="mt-0.5"
                          disabled={overdueBookingsLoading || (overdueBookings && overdueBookings.length === 0)}
                          checked={overflowChoice === 'BOOKING_PAYOFF'}
                          onChange={() => setOverflowChoice('BOOKING_PAYOFF')}
                        />
                        <span className="flex-1 text-xs">
                          <span className="font-medium text-slate-800">Pay off an overdue booking</span>
                          {overdueBookingsLoading ? (
                            <span className="block text-[11px] text-slate-400">Checking for overdue bookings…</span>
                          ) : overdueBookings && overdueBookings.length === 0 ? (
                            <span className="block text-[11px] text-slate-400">This client has no overdue bookings.</span>
                          ) : (
                            <span className="block text-[11px] text-slate-500">Applies the extra toward a booking&apos;s outstanding balance.</span>
                          )}

                          {overflowChoice === 'BOOKING_PAYOFF' && overdueBookings && overdueBookings.length > 0 && (
                            <select
                              value={overflowBookingId}
                              onChange={(e) => setOverflowBookingId(e.target.value)}
                              className="mt-1.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                            >
                              <option value="">Select a booking</option>
                              {overdueBookings.map((b) => (
                                <option key={b.booking_id} value={b.booking_id}>
                                  {b.booking_code} — overdue {money(b.overdue_amount)}
                                </option>
                              ))}
                            </select>
                          )}
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Recording…' : 'Submit Payment'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

const StepPip = ({ index, label, active, done }) => (
  <div className="flex items-center gap-1.5">
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
        done ? 'bg-blue-600 text-white' : active ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {done ? <CheckCircle2 className="h-3 w-3" /> : index}
    </span>
    <span className={`text-xs font-medium ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
  </div>
);

const BucketRow = ({ meta, icon: Icon, due, settled, value, disabled, onChange }) => (
  <tr className={disabled ? 'bg-slate-50/60' : ''}>
    <td className="px-3 py-2.5">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${meta.accent}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {meta.label}
        {disabled && <Lock className="h-3 w-3 text-slate-400" />}
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5">{meta.hint}</p>
    </td>
    <td className="px-3 py-2.5 text-right text-xs text-slate-600 align-top">{money(due)}</td>
    <td className="px-3 py-2.5 align-top">
      {settled ? (
        <span className="flex items-center justify-end gap-1 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Settled
        </span>
      ) : (
        <input
          type="number"
          min="0"
          step="0.01"
          max={due}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onWheel={(e) => e.target.blur()}
          placeholder="0.00"
          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
        />
      )}
    </td>
  </tr>
);

export default PaymentAllocationModal;
