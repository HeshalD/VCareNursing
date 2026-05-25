import { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Plus,
  X,
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const paymentMethodOptions = [
  'BANK_TRANSFER',
  'CASH_DEPOSIT',
  'CASH',
  'CHEQUE'
];

const initialPaymentForm = {
  amount_received: '',
  payment_method: 'BANK_TRANSFER',
  bank_account_id: '',
  cheque_number: '',
  cheque_date: '',
  reference_number: '',
  notes: ''
};

const statusFilters = ['ALL', 'FULLY_PAID', 'PARTIALLY_PAID', 'UNPAID', 'OVERPAID'];

const getPaymentStatus = (quote) => {
  const total = parseFloat(quote.total_amount || 0);
  const paid = parseFloat(quote.total_paid || 0);

  if (paid > total) return 'OVERPAID';
  if (paid === 0) return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
};

const paymentStatusStyles = {
  FULLY_PAID: 'bg-green-100 text-green-700 border-green-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  UNPAID: 'bg-slate-100 text-slate-700 border-slate-200',
  OVERPAID: 'bg-red-100 text-red-700 border-red-200'
};

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const QuotationsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [quotations, setQuotations] = useState([]);
  const [selectedQuote, setSelectedQuote] = useState(null);

  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [actingPaymentId, setActingPaymentId] = useState(null);

  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque = paymentForm.payment_method === 'CHEQUE';

  const fetchBankAccounts = async () => {
    try {
      const response = await apiClient.getBankAccounts();
      setBankAccounts(response.data || []);
    } catch (err) {
      console.error('Failed to fetch bank accounts', err);
    }
  };

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      setError('');

      const requestsRes = await apiClient.getAllServiceRequests();
      const requests = requestsRes.data || [];
      const quoteCandidates = requests.filter((r) => r.active_quote_id);

      const quoteRows = await Promise.all(
        quoteCandidates.map(async (request) => {
          const [quoteRes, progressRes] = await Promise.all([
            apiClient.getServiceRequestQuotes(request.request_id),
            apiClient.getQuotePaymentProgress(request.active_quote_id)
          ]);

          const quote = quoteRes.data || {};
          return {
            request_id: request.request_id,
            quote_id: request.active_quote_id,
            estimate_number: quote.estimate_number || progressRes.estimate_number || '-',
            payer_name: request.payer_name,
            payer_mobile: request.payer_mobile,
            patient_name: request.patient_name,
            service_type: request.service_type,
            quote_status: quote.status,
            total_amount: parseFloat(progressRes.total_amount || quote.total_amount || 0),
            total_paid: parseFloat(progressRes.total_paid || 0),
            remaining_amount: parseFloat(progressRes.remaining_amount || 0),
            percent_paid: progressRes.percent_paid || '0.00',
            payment_count: progressRes.payment_count || 0,
            can_assign_staff: !!progressRes.can_assign_staff,
            created_at: quote.created_at || request.created_at
          };
        })
      );

      quoteRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setQuotations(quoteRows);

      if (quoteRows.length > 0) {
        await selectQuote(quoteRows[0]);
      } else {
        setSelectedQuote(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load quotations');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (quoteId) => {
    try {
      setPaymentsLoading(true);
      const response = await apiClient.getQuotePayments(quoteId);
      setPayments(response.payments || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch quote payments');
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const selectQuote = async (quote) => {
    setSelectedQuote(quote);
    setShowPaymentForm(false);
    setPaymentForm(initialPaymentForm);
    setPaymentSlipFile(null);
    await fetchPayments(quote.quote_id);
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchBankAccounts(), fetchQuotations()]);
    };
    init();
  }, []);

  const filteredQuotes = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return quotations.filter((quote) => {
      const status = getPaymentStatus(quote);
      const matchesStatus = statusFilter === 'ALL' || status === statusFilter;
      if (!matchesStatus) return false;
      if (!q) return true;

      return (
      [
        quote.estimate_number,
        quote.payer_name,
        quote.patient_name,
        quote.payer_mobile,
        quote.service_type
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
      );
    });
  }, [quotations, searchTerm, statusFilter]);

  const handlePaymentMethodChange = (value) => {
    setPaymentForm((prev) => ({
      ...prev,
      payment_method: value,
      bank_account_id: ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(value) ? prev.bank_account_id : '',
      cheque_number: value === 'CHEQUE' ? prev.cheque_number : '',
      cheque_date: value === 'CHEQUE' ? prev.cheque_date : ''
    }));
  };

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!selectedQuote) return;

    if (selectedQuote.total_paid >= selectedQuote.total_amount) {
      setError('This quotation is already fully paid. Additional payment is blocked.');
      return;
    }

    try {
      setSubmittingPayment(true);
      setError('');
      setSuccessMessage('');

      const payload = {
        amount_received: parseFloat(paymentForm.amount_received),
        payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || null,
        cheque_number: paymentForm.cheque_number || null,
        cheque_date: paymentForm.cheque_date || null,
        reference_number: paymentForm.reference_number || null,
        notes: paymentForm.notes || null
      };

      await apiClient.recordQuotePayment(selectedQuote.quote_id, payload, paymentSlipFile);
      setSuccessMessage('Payment recorded successfully.');
      setShowPaymentForm(false);
      setPaymentForm(initialPaymentForm);
      setPaymentSlipFile(null);

      await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const verifyPayment = async (paymentId) => {
    try {
      setActingPaymentId(paymentId);
      setError('');
      setSuccessMessage('');
      await apiClient.verifyQuotePayment(paymentId, 'Verified from admin quotations page');
      setSuccessMessage('Payment verified successfully.');
      if (selectedQuote) {
        await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
      }
    } catch (err) {
      setError(err.message || 'Failed to verify payment');
    } finally {
      setActingPaymentId(null);
    }
  };

  const rejectPayment = async (paymentId) => {
    const reason = window.prompt('Enter rejection reason');
    if (!reason) return;

    try {
      setActingPaymentId(paymentId);
      setError('');
      setSuccessMessage('');
      await apiClient.rejectQuotePayment(paymentId, reason);
      setSuccessMessage('Payment rejected successfully.');
      if (selectedQuote) {
        await Promise.all([fetchQuotations(), fetchPayments(selectedQuote.quote_id)]);
      }
    } catch (err) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setActingPaymentId(null);
    }
  };

  return (
    <AdminLayout
      title="Quotations"
      subtitle="View quotation payment progress, record payments, and verify/reject tracked payments."
      actions={
        <button
          onClick={fetchQuotations}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by estimate, payer, patient, phone, or service"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === status
                        ? 'border-blue-200 bg-blue-100 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {status === 'ALL' ? 'All' : status.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-slate-500">Loading quotations...</div>
          ) : filteredQuotes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-slate-500">
              <FileText className="h-8 w-8" />
              <p className="text-sm">No quotations found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Estimate</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Remaining</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => {
                    const status = getPaymentStatus(quote);

                    return (
                      <tr
                        key={quote.quote_id}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                          selectedQuote?.quote_id === quote.quote_id ? 'bg-blue-50/50' : ''
                        } ${status === 'OVERPAID' ? 'bg-red-50/60' : ''}`}
                        onClick={() => navigate(`/admin/quotations/${quote.quote_id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{quote.estimate_number}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <div>{quote.payer_name}</div>
                          <div className="text-xs text-slate-500">{quote.payer_mobile}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{money(quote.total_amount)}</td>
                        <td className="px-4 py-3 text-green-700">{money(quote.total_paid)}</td>
                        <td className="px-4 py-3 text-amber-700">{money(quote.remaining_amount)}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                            {quote.percent_paid}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${paymentStatusStyles[status]}`}>
                            {status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {!selectedQuote ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
              Select a quotation to view payment actions.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-slate-900">{selectedQuote.estimate_number}</h3>
                  <p className="text-sm text-slate-500">{selectedQuote.payer_name}</p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Total</span><span>{money(selectedQuote.total_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-green-700">{money(selectedQuote.total_paid)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Remaining</span><span className="text-amber-700">{money(selectedQuote.remaining_amount)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Progress</span><span>{selectedQuote.percent_paid}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-slate-500">Status</span><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentStatusStyles[getPaymentStatus(selectedQuote)]}`}>{getPaymentStatus(selectedQuote).replace('_', ' ')}</span></div>
                </div>

                {getPaymentStatus(selectedQuote) === 'OVERPAID' && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                    Overpaid detected: paid exceeds quotation amount. Recording more payments is blocked.
                  </div>
                )}

                <button
                  onClick={() => setShowPaymentForm((v) => !v)}
                  disabled={selectedQuote.total_paid >= selectedQuote.total_amount}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {showPaymentForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {showPaymentForm ? 'Close Form' : selectedQuote.total_paid >= selectedQuote.total_amount ? 'Payment Locked' : 'Record Payment'}
                </button>

                {showPaymentForm && (
                  <form onSubmit={submitPayment} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
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
                      onChange={(e) => handlePaymentMethodChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {paymentMethodOptions.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>

                    {requiresBankAccount && (
                      <select
                        required
                        value={paymentForm.bank_account_id}
                        onChange={(e) => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="">Select Bank Account</option>
                        {bankAccounts.map((acc) => (
                          <option key={acc.account_id} value={acc.account_id}>
                            {acc.account_nickname} ({acc.account_number})
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
                      {paymentSlipFile && (
                        <p className="mt-2 text-xs text-slate-600">Selected: {paymentSlipFile.name}</p>
                      )}
                    </div>

                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      placeholder="Notes (optional)"
                      rows={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={submittingPayment}
                      className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {submittingPayment ? 'Recording...' : 'Submit Payment'}
                    </button>
                  </form>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-slate-900">Payments</h3>

                {paymentsLoading ? (
                  <p className="text-sm text-slate-500">Loading payments...</p>
                ) : payments.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map((payment) => (
                      <div key={payment.payment_id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-900">{money(payment.amount)}</p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{payment.status}</span>
                        </div>
                        <p className="text-xs text-slate-500">{payment.payment_method} • {new Date(payment.payment_date).toLocaleString()}</p>
                        {payment.reference_number && (
                          <p className="text-xs text-slate-500">Ref: {payment.reference_number}</p>
                        )}
                        {payment.slip_url && (
                          <a
                            href={payment.slip_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            View payment slip
                          </a>
                        )}

                        {payment.status !== 'VERIFIED' && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => verifyPayment(payment.payment_id)}
                              disabled={actingPaymentId === payment.payment_id}
                              className="inline-flex items-center gap-1 rounded-md border border-green-200 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle className="h-3.5 w-3.5" /> Verify
                            </button>
                            <button
                              onClick={() => rejectPayment(payment.payment_id)}
                              disabled={actingPaymentId === payment.payment_id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {selectedQuote?.can_assign_staff && (
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              Staff can be assigned for this quote based on received payments.
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default QuotationsPage;