import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, FileText, CircleDollarSign, ArrowRight,
  Upload, ExternalLink, Pencil, X, Save, User, Stethoscope,
  BadgeCheck, MapPin, ChevronDown, ChevronUp, CheckCircle2
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

/* ── Helpers ── */
const money = (v) =>
  `LKR ${parseFloat(v || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (date) =>
  date ? new Date(date).toLocaleDateString('en-LK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const getQuoteStatus = (q) => {
  const total = parseFloat(q?.total_amount || 0);
  const paid = parseFloat(q?.total_paid || 0);
  if (paid > total) return 'OVERPAID';
  if (paid === 0) return 'UNPAID';
  if (paid === total) return 'FULLY_PAID';
  return 'PARTIALLY_PAID';
};

const quoteStatusStyle = {
  FULLY_PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-50 text-amber-700 border-amber-200',
  UNPAID: 'bg-slate-100 text-slate-600 border-slate-200',
  OVERPAID: 'bg-red-50 text-red-700 border-red-200',
};

const requestStatusStyle = {
  NEW_LEAD: 'bg-blue-50 text-blue-700 border-blue-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-purple-50 text-purple-700 border-purple-200',
  COMPLETED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

const requestStatusOptions = ['NEW_LEAD', 'PENDING', 'CONFIRMED', 'ASSIGNED', 'COMPLETED', 'CANCELLED'];
const serviceModelOptions = ['LIVE_IN', 'SHIFT_BASED', 'VISITING'];
const genderOptions = ['ANY', 'MALE', 'FEMALE'];

const initialPaymentForm = {
  amount_received: '',
  payment_method: 'BANK_TRANSFER',
  bank_account_id: '',
  cheque_number: '',
  cheque_date: '',
  reference_number: '',
  notes: '',
};

/* ══════════════════════════════════════════════════════ */
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

  const [detailsOpen, setDetailsOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const selectedQuote = useMemo(
    () => quotes.find((q) => q.quote_id === selectedQuoteId) || quotes[0] || null,
    [quotes, selectedQuoteId]
  );

  const requiresBankAccount = ['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentForm.payment_method);
  const isCheque = paymentForm.payment_method === 'CHEQUE';
  const selectedQuoteStatus = selectedQuote ? getQuoteStatus(selectedQuote) : 'UNPAID';

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [requestRes, quoteRes, bankRes] = await Promise.all([
        apiClient.getServiceRequestById(requestId),
        apiClient.getServiceRequestQuoteList(requestId),
        apiClient.getBankAccounts(),
      ]);
      setRequest(requestRes.data || null);
      setQuotes(
        (quoteRes.data || []).map((q) => ({
          ...q,
          total_paid: parseFloat(q.total_paid || 0),
          total_amount: parseFloat(q.total_amount || 0),
          remaining_amount: Math.max(parseFloat(q.total_amount || 0) - parseFloat(q.total_paid || 0), 0),
          payment_count: parseInt(q.payment_count || 0, 10),
        }))
      );
      setBankAccounts(bankRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load service request');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (requestId) fetchData(); }, [requestId]);

  useEffect(() => {
    if (quotes.length > 0 && !selectedQuoteId) {
      setSelectedQuoteId(
        quotes.find((q) => q.quote_id === request?.active_quote_id)?.quote_id || quotes[0].quote_id
      );
    }
  }, [quotes, request, selectedQuoteId]);

  const openEdit = () => {
    setEditForm({
      payer_name: request.payer_name || '',
      payer_mobile: request.payer_mobile || '',
      patient_name: request.patient_name || '',
      patient_age: request.patient_age || '',
      relationship_to_client: request.relationship_to_client || '',
      patient_condition: request.patient_condition || '',
      service_type: request.service_type || '',
      service_model: request.service_model || 'SHIFT_BASED',
      location_address: request.location_address || '',
      start_date: request.start_date ? request.start_date.slice(0, 10) : '',
      remarks: request.remarks || '',
      preferred_gender: request.preferred_gender || 'ANY',
      status: request.status || 'NEW_LEAD',
    });
    setSaveError('');
    setEditMode(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveError('');
      const res = await apiClient.updateServiceRequest(requestId, editForm);
      setRequest(res.data);
      setEditMode(false);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedQuote || !request) return;
    try {
      setSubmitting(true);
      setError('');
      await apiClient.recordQuotePayment(
        selectedQuote.quote_id,
        {
          amount_received: parseFloat(paymentForm.amount_received),
          payment_method: paymentForm.payment_method,
          bank_account_id: paymentForm.bank_account_id || null,
          cheque_number: paymentForm.cheque_number || null,
          cheque_date: paymentForm.cheque_date || null,
          reference_number: paymentForm.reference_number || null,
          notes: paymentForm.notes || null,
        },
        paymentSlipFile
      );
      const bookingResult = await apiClient.convertToBooking(
        { request_id: request.request_id, quote_id: selectedQuote.quote_id },
        paymentSlipFile
      );
      const bookingId = bookingResult?.data?.booking_id;
      navigate(`/admin/bookings/${bookingId}/staff-roster`, {
        state: { request, quote: selectedQuote, bookingId },
      });
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProceed = async () => {
    if (!selectedQuote || !request) return;
    try {
      setProceeding(true);
      setError('');
      const check = await apiClient.checkQuoteBooking(selectedQuote.quote_id);
      const { has_booking, booking_id: existingBookingId } = check?.data || {};
      if (has_booking && existingBookingId) {
        navigate(`/admin/bookings/${existingBookingId}/staff-roster`, {
          state: { request, quote: selectedQuote, bookingId: existingBookingId },
        });
        return;
      }
      if (!window.confirm(`Create booking for ${selectedQuote.estimate_number} and proceed to staff selection?`)) {
        return;
      }
      const bookingResult = await apiClient.convertToBooking({
        request_id: request.request_id,
        quote_id: selectedQuote.quote_id,
      });
      const bookingId = bookingResult?.data?.booking_id;
      navigate(`/admin/bookings/${bookingId}/staff-roster`, {
        state: { request, quote: selectedQuote, bookingId },
      });
    } catch (err) {
      setError(err.message || 'Failed to proceed');
    } finally {
      setProceeding(false);
    }
  };

  const set = (field) => (v) => setEditForm((f) => ({ ...f, [field]: v }));

  return (
    <AdminLayout
      title="Service Request"
      subtitle="Review request details, manage quotations, and register payments."
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
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading service request…
        </div>
      ) : !request ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Service request not found.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

          {/* ══ LEFT COLUMN (2/3) ══ */}
          <div className="space-y-5 lg:col-span-2">

            {/* ── Request Details ── */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

              {/* Card header */}
              <div className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 truncate">
                        {editMode ? editForm.payer_name || '—' : request.payer_name}
                      </h2>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${requestStatusStyle[editMode ? editForm.status : request.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {editMode ? editForm.status : request.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      #{request.request_id} &middot; Created {fmt(request.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!editMode ? (
                    <button
                      onClick={openEdit}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditMode(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <X className="h-3.5 w-3.5" /> Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:bg-slate-50"
                  >
                    {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Save error */}
              {saveError && (
                <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
              )}

              {/* Collapsible body */}
              {detailsOpen && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4">
                  {editMode ? (
                    /* ── Edit Form ── */
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <SectionHeading icon={User} label="Client / Payer" />
                          <div className="mt-3 space-y-3">
                            <FormField label="Name" value={editForm.payer_name} onChange={set('payer_name')} />
                            <FormField label="Mobile" value={editForm.payer_mobile} onChange={set('payer_mobile')} />
                            <FormField label="Location" value={editForm.location_address} onChange={set('location_address')} />
                          </div>
                        </div>
                        <div>
                          <SectionHeading icon={Stethoscope} label="Patient" />
                          <div className="mt-3 space-y-3">
                            <FormField label="Name" value={editForm.patient_name} onChange={set('patient_name')} />
                            <FormField label="Age" type="number" value={editForm.patient_age} onChange={set('patient_age')} />
                            <FormField label="Relationship" value={editForm.relationship_to_client} onChange={set('relationship_to_client')} />
                          </div>
                        </div>
                        <div>
                          <SectionHeading icon={BadgeCheck} label="Service" />
                          <div className="mt-3 space-y-3">
                            <FormField label="Service Type" value={editForm.service_type} onChange={set('service_type')} />
                            <FormSelect label="Service Model" value={editForm.service_model} options={serviceModelOptions} onChange={set('service_model')} />
                            <FormSelect label="Preferred Gender" value={editForm.preferred_gender} options={genderOptions} onChange={set('preferred_gender')} />
                            <FormSelect label="Status" value={editForm.status} options={requestStatusOptions} onChange={set('status')} />
                            <FormField label="Start Date" type="date" value={editForm.start_date} onChange={set('start_date')} />
                          </div>
                        </div>
                      </div>
                      <FormTextarea label="Patient Condition" value={editForm.patient_condition} onChange={set('patient_condition')} />
                      <FormTextarea label="Remarks" value={editForm.remarks} onChange={set('remarks')} />
                    </div>
                  ) : (
                    /* ── View Mode ── */
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <section>
                          <SectionHeading icon={User} label="Client / Payer" />
                          <dl className="mt-3 space-y-2.5">
                            <Field label="Name" value={request.payer_name} />
                            <Field label="Mobile" value={request.payer_mobile} />
                            <Field label="Location" value={request.location_address} />
                            {request.client_id && <Field label="Client ID" value={request.client_id} />}
                          </dl>
                        </section>

                        <section>
                          <SectionHeading icon={Stethoscope} label="Patient" />
                          <dl className="mt-3 space-y-2.5">
                            <Field label="Name" value={request.patient_name} />
                            <Field label="Age" value={request.patient_age} />
                            <Field label="Relationship" value={request.relationship_to_client} />
                          </dl>
                        </section>

                        <section>
                          <SectionHeading icon={BadgeCheck} label="Service" />
                          <dl className="mt-3 space-y-2.5">
                            <Field label="Type" value={request.service_type} />
                            <Field label="Model" value={request.service_model} />
                            <Field label="Pref. Gender" value={request.preferred_gender || 'ANY'} />
                            <Field label="Start Date" value={fmt(request.start_date)} />
                          </dl>
                        </section>
                      </div>

                      {request.patient_condition && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Patient Condition</p>
                          <p className="mt-1 text-sm text-slate-700">{request.patient_condition}</p>
                        </div>
                      )}

                      {request.remarks && (
                        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Remarks</p>
                          <p className="mt-1 text-sm text-amber-900">{request.remarks}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Quotation History ── */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                    <FileText className="h-4 w-4 text-slate-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Quotation History</h3>
                </div>
                {request?.active_quote_id && (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    Active Quotation
                  </span>
                )}
              </div>

              {quotes.length === 0 ? (
                <div className="border-t border-slate-100 px-5 py-8 text-center text-sm text-slate-400">
                  No quotations yet.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {quotes.map((quote) => {
                    const qStatus = getQuoteStatus(quote);
                    const isSelected = selectedQuote?.quote_id === quote.quote_id;
                    return (
                      <li
                        key={quote.quote_id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedQuoteId(quote.quote_id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedQuoteId(quote.quote_id)}
                        className={`cursor-pointer px-5 py-4 transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                              <span className="font-semibold text-slate-900 text-sm">{quote.estimate_number}</span>
                              {quote.booking_id && (
                                <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                                  Booking Created
                                </span>
                              )}
                              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${quoteStatusStyle[qStatus]}`}>
                                {qStatus.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">
                              Created {new Date(quote.created_at).toLocaleString('en-LK')} &middot; {quote.payment_count} payment{quote.payment_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/admin/quotations/${quote.quote_id}`); }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <QuoteStat label="Total" value={money(quote.total_amount)} />
                          <QuoteStat label="Paid" value={money(quote.total_paid)} accent="text-emerald-700" />
                          <QuoteStat label="Remaining" value={money(quote.remaining_amount)} accent="text-amber-700" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── Payment Registration ── */}
            {selectedQuote && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                      <CircleDollarSign className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Payment Registration</h3>
                      <p className="text-xs text-slate-400">{selectedQuote.estimate_number}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/quotations/${selectedQuote.quote_id}`)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View Quotation
                    </button>
                    {(selectedQuoteStatus === 'FULLY_PAID' || selectedQuoteStatus === 'PARTIALLY_PAID') && (
                      <button
                        type="button"
                        onClick={handleProceed}
                        disabled={proceeding}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        {proceeding ? 'Proceeding…' : 'Proceed to Staff Roster'}
                      </button>
                    )}
                  </div>
                </div>

                <form onSubmit={handlePaymentSubmit} className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Amount Received (LKR) *</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentForm.amount_received}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount_received: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Payment Method</label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="BANK_TRANSFER">Bank Transfer</option>
                        <option value="CASH_DEPOSIT">Cash Deposit</option>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                      </select>
                    </div>
                  </div>

                  {requiresBankAccount && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Bank Account *</label>
                      <select
                        required
                        value={paymentForm.bank_account_id}
                        onChange={(e) => setPaymentForm({ ...paymentForm, bank_account_id: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">Select bank account</option>
                        {bankAccounts.map((a) => (
                          <option key={a.account_id} value={a.account_id}>
                            {a.account_nickname} ({a.bank_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {isCheque && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Cheque Number *</label>
                        <input
                          required
                          value={paymentForm.cheque_number}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_number: e.target.value })}
                          placeholder="Cheque No."
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">Cheque Date *</label>
                        <input
                          required
                          type="date"
                          value={paymentForm.cheque_date}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cheque_date: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Reference Number</label>
                    <input
                      value={paymentForm.reference_number}
                      onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                      placeholder="Optional"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
                    <textarea
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      placeholder="Optional"
                      rows={2}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-medium text-slate-500">Payment Slip</p>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Upload className="h-3.5 w-3.5" /> Choose File
                      <input
                        type="file"
                        accept="image/*,.pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setPaymentSlipFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    {paymentSlipFile && (
                      <p className="mt-2 text-xs text-slate-500">{paymentSlipFile.name}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <CircleDollarSign className="h-4 w-4" />
                    {submitting ? 'Saving…' : 'Register Payment & Continue'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* ══ RIGHT COLUMN (1/3) ══ */}
          <div className="space-y-5">

            {/* Quick info */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Overview</span>
              </div>
              <dl className="space-y-2.5">
                <Field label="Status" value={request.status} />
                <Field label="Service" value={request.service_type} />
                <Field label="Model" value={request.service_model} />
                <Field label="Pref. Gender" value={request.preferred_gender || 'ANY'} />
                <Field label="Start Date" value={fmt(request.start_date)} />
                <Field label="Created" value={fmt(request.created_at)} />
              </dl>
            </div>

            {/* Selected quotation */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Selected Quotation</span>
              </div>

              {selectedQuote ? (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-semibold text-slate-900 text-sm">{selectedQuote.estimate_number}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${quoteStatusStyle[selectedQuoteStatus]}`}>
                      {selectedQuoteStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <QuoteStat label="Total" value={money(selectedQuote.total_amount)} />
                    <QuoteStat label="Paid" value={money(selectedQuote.total_paid)} accent="text-emerald-700" />
                    <QuoteStat label="Remaining" value={money(selectedQuote.remaining_amount)} accent="text-amber-700" />
                    <QuoteStat label="Payments" value={String(selectedQuote.payment_count)} />
                  </div>

                  {(selectedQuoteStatus === 'FULLY_PAID' || selectedQuoteStatus === 'PARTIALLY_PAID') && (
                    <button
                      type="button"
                      onClick={handleProceed}
                      disabled={proceeding}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      <ArrowRight className="h-4 w-4" />
                      {proceeding ? 'Proceeding…' : 'Proceed to Staff Roster'}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">Select a quotation from the list.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

/* ── Sub-components (matching roster's design system) ── */

const SectionHeading = ({ icon: Icon, label }) => (
  <div className="flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 text-slate-400" />
    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
  </div>
);

const Field = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3">
    <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
    <dd className="text-right text-sm font-medium text-slate-800">
      {value != null && value !== '' ? String(value) : <span className="font-normal text-slate-400">—</span>}
    </dd>
  </div>
);

const QuoteStat = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
    <p className={`mt-0.5 text-sm font-semibold ${accent}`}>{value}</p>
  </div>
);

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

const FormField = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
  </div>
);

const FormTextarea = ({ label, value, onChange }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={inputCls} />
  </div>
);

const FormSelect = ({ label, value, options, onChange }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default ServiceRequestSummaryPage;
