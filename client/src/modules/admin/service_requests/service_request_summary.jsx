import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, FileText, CircleDollarSign, ArrowRight, Upload, ExternalLink } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const getStatus = (quote) => {
  const total = parseFloat(quote?.total_amount || 0);
  const paid = parseFloat(quote?.total_paid || 0);
  if (paid > total) return 'OVERPAID';
  if (paid === 0) return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
};

const statusStyles = {
  FULLY_PAID: 'bg-green-100 text-green-700 border-green-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  UNPAID: 'bg-slate-100 text-slate-700 border-slate-200',
  OVERPAID: 'bg-red-100 text-red-700 border-red-200'
};

const initialPaymentForm = {
  amount_received: '',
  payment_method: 'BANK_TRANSFER',
  bank_account_id: '',
  cheque_number: '',
  cheque_date: '',
  reference_number: '',
  notes: ''
};

const ServiceRequestSummaryPage = () => {
  const { requestId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [submitting, setSubmitting] = useState(false);
  const [proceeding, setProceeding] = useState(false);

  const selectedQuote = useMemo(
    () => quotes.find((quote) => quote.quote_id === selectedQuoteId) || quotes[0] || null,
    [quotes, selectedQuoteId]
  );

  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque = paymentForm.payment_method === 'CHEQUE';
  const selectedQuoteStatus = selectedQuote ? getStatus(selectedQuote) : 'UNPAID';

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const [requestRes, quoteRes, bankRes] = await Promise.all([
        apiClient.getServiceRequestById(requestId),
        apiClient.getServiceRequestQuoteList(requestId),
        apiClient.getBankAccounts()
      ]);

      setRequest(requestRes.data || null);
      setQuotes((quoteRes.data || []).map((quote) => ({
        ...quote,
        total_paid: parseFloat(quote.total_paid || 0),
        total_amount: parseFloat(quote.total_amount || 0),
        remaining_amount: Math.max(parseFloat(quote.total_amount || 0) - parseFloat(quote.total_paid || 0), 0),
        payment_count: parseInt(quote.payment_count || 0, 10)
      })));
      setBankAccounts(bankRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load service request summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (requestId) {
      fetchData();
    }
  }, [requestId]);

  useEffect(() => {
    if (quotes.length > 0 && !selectedQuoteId) {
      setSelectedQuoteId(quotes.find((quote) => quote.quote_id === request?.active_quote_id)?.quote_id || quotes[0].quote_id);
    }
  }, [quotes, request, selectedQuoteId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedQuote || !request) return;

    try {
      setSubmitting(true);
      setError('');

      const paymentPayload = {
        amount_received: parseFloat(paymentForm.amount_received),
        payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || null,
        cheque_number: paymentForm.cheque_number || null,
        cheque_date: paymentForm.cheque_date || null,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null
      };

      await apiClient.recordQuotePayment(selectedQuote.quote_id, paymentPayload, paymentSlipFile);
      const bookingResult = await apiClient.convertToBooking({
        request_id: request.request_id,
        quote_id: selectedQuote.quote_id
      }, paymentSlipFile);

      const bookingId = bookingResult?.data?.booking_id;
      navigate(`/admin/bookings/${bookingId}/staff-roster`, {
        state: {
          request,
          quote: selectedQuote,
          bookingId
        }
      });
    } catch (err) {
      setError(err.message || 'Failed to record payment and create booking');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceedToNextPage = async () => {
    if (!selectedQuote || !request) return;

    try {
      setProceeding(true);
      setError('');

      // Check if booking already exists for this quote
      const bookingCheckResult = await apiClient.checkQuoteBooking(selectedQuote.quote_id);
      const { has_booking, booking_id: existingBookingId } = bookingCheckResult?.data || {};

      if (has_booking && existingBookingId) {
        // Booking already exists, skip confirmation and go directly to staff roster
        navigate(`/admin/bookings/${existingBookingId}/staff-roster`, {
          state: {
            request,
            quote: selectedQuote,
            bookingId: existingBookingId
          }
        });
        return;
      }

      // Booking doesn't exist, ask for confirmation
      const confirmCreateBooking = window.confirm(
        `This quotation is fully paid. Do you want to create the booking now and proceed to staff selection for ${selectedQuote.estimate_number}?`
      );

      if (!confirmCreateBooking) {
        setProceeding(false);
        return;
      }

      const bookingResult = await apiClient.convertToBooking({
        request_id: request.request_id,
        quote_id: selectedQuote.quote_id
      });

      const bookingId = bookingResult?.data?.booking_id;
      navigate(`/admin/bookings/${bookingId}/staff-roster`, {
        state: {
          request,
          quote: selectedQuote,
          bookingId
        }
      });
    } catch (err) {
      setError(err.message || 'Failed to proceed to staff selection');
    } finally {
      setProceeding(false);
    }
  };

  return (
    <AdminLayout
      title="Service Request Summary"
      subtitle="Review the request, inspect quotations, register payment, and continue to staff selection."
      actions={
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/admin/service-requests')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading service request...</div>
      ) : !request ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Service request not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm text-slate-500">Request ID: {request.request_id}</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-900">{request.payer_name}</h2>
                  <p className="text-sm text-slate-500">{request.patient_name} · {request.service_type}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-medium">Current Status</p>
                  <p>{request.status}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Mobile" value={request.payer_mobile} />
                <InfoCard label="Patient Age" value={String(request.patient_age || 'N/A')} />
                <InfoCard label="Start Date" value={request.start_date ? new Date(request.start_date).toLocaleDateString() : 'N/A'} />
                <InfoCard label="Location" value={request.location_address || 'N/A'} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Quotation History</h3>
                {request?.active_quote_id && (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">Active Quotation</span>
                )}
              </div>

              <div className="space-y-3">
                {quotes.map((quote) => {
                  const status = getStatus(quote);
                  const isSelected = selectedQuote?.quote_id === quote.quote_id;

                  return (
                    <div
                      key={quote.quote_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedQuoteId(quote.quote_id)}
                      className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                        isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-500" />
                            <span className="font-semibold text-slate-900">{quote.estimate_number}</span>
                            {quote.booking_id && (
                              <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
                                ✓ Booking Created
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-slate-500">Created {new Date(quote.created_at).toLocaleString()}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[status]}`}>
                          {status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <MiniStat label="Total" value={money(quote.total_amount)} />
                        <MiniStat label="Paid" value={money(quote.total_paid)} valueClassName="text-green-700" />
                        <MiniStat label="Remaining" value={money(quote.remaining_amount)} valueClassName="text-amber-700" />
                      </div>

                      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                        <span>{quote.payment_count} payment records</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/admin/quotations/${quote.quote_id}`);
                          }}
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink className="h-4 w-4" /> Open quotation details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedQuote && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Payment Registration</h3>
                    <p className="text-sm text-slate-500">Selected quotation: {selectedQuote.estimate_number}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/quotations/${selectedQuote.quote_id}`)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      View quotation details
                    </button>
                    {selectedQuoteStatus === 'FULLY_PAID' || selectedQuoteStatus === 'PARTIALLY_PAID' && (
                      <button
                        type="button"
                        onClick={handleProceedToNextPage}
                        disabled={proceeding}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <ArrowRight className="h-4 w-4" />
                        {proceeding ? 'Proceeding...' : 'Proceed to Staff Roster'}
                      </button>
                    )}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentForm.amount_received}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount_received: e.target.value })}
                    placeholder="Amount Received"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />

                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                    <option value="CASH_DEPOSIT">CASH_DEPOSIT</option>
                    <option value="CASH">CASH</option>
                    <option value="CHEQUE">CHEQUE</option>
                  </select>

                  {requiresBankAccount && (
                    <select
                      required
                      value={paymentForm.bank_account_id}
                      onChange={(e) => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">Select bank account</option>
                      {bankAccounts.map((account) => (
                        <option key={account.account_id} value={account.account_id}>
                          {account.account_nickname} ({account.bank_name})
                        </option>
                      ))}
                    </select>
                  )}

                  {isCheque && (
                    <>
                      <input
                        required
                        value={paymentForm.cheque_number}
                        onChange={(e) => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })}
                        placeholder="Cheque Number"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                      <input
                        required
                        type="date"
                        value={paymentForm.cheque_date}
                        onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </>
                  )}

                  <input
                    value={paymentForm.reference_number}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                    placeholder="Reference Number (optional)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />

                  <div className="rounded-lg border border-slate-200 p-3">
                    <label className="mb-2 block text-xs font-medium text-slate-600">Upload Payment Slip (optional)</label>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100">
                      <Upload className="h-3.5 w-3.5" /> Choose File
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setPaymentSlipFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {paymentSlipFile && <p className="mt-2 text-xs text-slate-600">Selected: {paymentSlipFile.name}</p>}
                  </div>

                  <textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                    placeholder="Notes (optional)"
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <CircleDollarSign className="h-4 w-4" />
                    {submitting ? 'Saving and continuing...' : 'Register Payment & Continue'}
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Request Overview</h3>
              <div className="space-y-2 text-sm">
                <Row label="Client" value={request.payer_name} />
                <Row label="Patient" value={request.patient_name} />
                <Row label="Service" value={request.service_type} />
                <Row label="Status" value={request.status} />
                <Row label="Preferred Gender" value={request.preferred_gender || 'ANY'} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Selected Quotation</h3>
              {selectedQuote ? (
                <div className="space-y-2 text-sm">
                  <Row label="Estimate" value={selectedQuote.estimate_number} />
                  <Row label="Total Amount" value={money(selectedQuote.total_amount)} />
                  <Row label="Paid" value={money(selectedQuote.total_paid)} />
                  <Row label="Remaining" value={money(selectedQuote.remaining_amount)} />
                  <Row label="Status" value={getStatus(selectedQuote).replace('_', ' ')} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a quotation to continue.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const InfoCard = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
  </div>
);

const MiniStat = ({ label, value, valueClassName = 'text-slate-900' }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</p>
  </div>
);

const Row = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-900">{value || '—'}</span>
  </div>
);

export default ServiceRequestSummaryPage;