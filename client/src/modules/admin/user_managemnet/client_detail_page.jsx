import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  BadgeDollarSign,
  BookOpen,
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  HeartPulse,
  Home,
  Loader2,
  MapPin,
  Phone,
  ReceiptText,
  ShieldAlert,
  Star,
  Users,
  Wallet,
  Crown,
  Download,
  SendHorizontal,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 2,
});

const formatMoney = (value) => money.format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const toDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const sectionButtonBase = 'flex-1 min-w-[110px] rounded-xl border px-3 py-3 text-left transition-all duration-200';

const SectionButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${sectionButtonBase} ${active ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
  >
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  </button>
);

const StatCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const toneMap = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    violet: 'bg-violet-100 text-violet-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.slate}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-medium text-slate-900">{value || '-'}</p>
  </div>
);

const ClientDetailPage = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [statementStartDate, setStatementStartDate] = useState(toDateInputValue(addDays(new Date(), -30)));
  const [statementEndDate, setStatementEndDate] = useState(toDateInputValue(new Date()));
  const [statementActionLoading, setStatementActionLoading] = useState('');
  const [statementRows, setStatementRows] = useState([]);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    const loadDetail = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await apiClient.getAdminClientDetail(clientId);
        setDetail(response.data || null);
      } catch (err) {
        console.error('Error loading client detail:', err);
        setError(err.message || 'Failed to load client details');
      } finally {
        setLoading(false);
      }
    };

    if (clientId) {
      loadDetail();
    }
  }, [clientId]);

  const clientProfile = detail?.client_profile || {};
  const paymentSummary = detail?.payment_summary || {};
  const bookingSummary = detail?.booking_summary || {};
  const quotationSummary = detail?.quotation_summary || {};
  const staffSummary = detail?.staff_summary || {};
  const reviewSummary = detail?.review_summary || {};
  const patientSummary = detail?.patient_summary || {};
  const statementSummary = detail?.statement_summary || {};
  const overdueSummary = detail?.overdue_summary || {};
  const recentActivity = detail?.recent_activity || {};

  const activeBookings = useMemo(() => recentActivity.bookings || [], [recentActivity.bookings]);
  const recentPayments = useMemo(() => recentActivity.payments || [], [recentActivity.payments]);
  const recentQuotes = useMemo(() => recentActivity.quotations || [], [recentActivity.quotations]);
  const recentTransactions = useMemo(() => recentActivity.transactions || [], [recentActivity.transactions]);
  const recentAssignments = useMemo(() => recentActivity.staff_assignments || [], [recentActivity.staff_assignments]);
  const recentReviews = useMemo(() => recentActivity.reviews || [], [recentActivity.reviews]);
  const patients = Array.isArray(patientSummary.data) ? patientSummary.data : [];

  const statementDateRange = useMemo(() => ({
    start_date: statementStartDate,
    end_date: statementEndDate,
  }), [statementStartDate, statementEndDate]);

  useEffect(() => {
    const loadStatementLedger = async () => {
      if (!clientId || activeSection !== 'statement') return;
      try {
        setStatementLoading(true);
        setStatementRows([]);
        const qs = new URLSearchParams({ start_date: statementStartDate, end_date: statementEndDate });
        const resp = await fetch(`/api/clients/${clientId}/statement?${qs.toString()}`, { credentials: 'same-origin' });
        if (!resp.ok) throw new Error(`Failed to fetch statement: ${resp.status}`);
        const json = await resp.json();
        // backend returns { account_summary, ledger }
        const ledger = json.ledger || [];
        setStatementRows(ledger);
      } catch (err) {
        console.error('Error loading statement ledger:', err);
      } finally {
        setStatementLoading(false);
      }
    };

    loadStatementLedger();
  }, [clientId, activeSection, statementStartDate, statementEndDate]);

  const ledgerTotals = useMemo(() => {
    const totals = statementRows.reduce(
      (acc, r) => {
        acc.total_invoiced += Number(r.amount_invoiced || 0);
        acc.total_paid += Number(r.amount_paid || 0);
        return acc;
      },
      { total_invoiced: 0, total_paid: 0 }
    );
    const final_balance = statementRows.length ? Number(statementRows[statementRows.length - 1].balance || 0) : 0;
    return { ...totals, final_balance };
  }, [statementRows]);

  const downloadStatement = async () => {
    try {
      setStatementActionLoading('download');
      const blob = await apiClient.downloadClientStatement(clientId, statementDateRange);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statement_${(clientProfile.full_name || 'client').replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('Error downloading statement:', downloadError);
      setError(downloadError.message || 'Failed to download statement');
    } finally {
      setStatementActionLoading('');
    }
  };

  const sendStatementToWhatsApp = async () => {
    try {
      setStatementActionLoading('whatsapp');
      await apiClient.sendClientStatementToWhatsApp(clientId, statementDateRange);
    } catch (sendError) {
      console.error('Error sending statement to WhatsApp:', sendError);
      setError(sendError.message || 'Failed to send statement via WhatsApp');
    } finally {
      setStatementActionLoading('');
    }
  };

  const sectionConfig = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'payments', label: 'Payments', icon: BadgeDollarSign },
    { id: 'bookings', label: 'Bookings', icon: CalendarDays },
    { id: 'quotes', label: 'Quotes', icon: FileText },
    { id: 'staff', label: 'Staff', icon: Briefcase },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'patients', label: 'Patients', icon: HeartPulse },
    { id: 'statement', label: 'Statement', icon: ReceiptText },
    { id: 'overdue', label: 'Overdue', icon: ShieldAlert },
  ];

  const topStats = [
    { icon: BadgeDollarSign, label: 'Payments Made By Client', value: formatMoney(paymentSummary.total_paid), tone: 'emerald' },
    { icon: Wallet, label: 'Invoiced Through Daily Invoicing', value: formatMoney(statementSummary.total_invoiced), tone: 'blue' },
    { icon: ShieldAlert, label: 'Overdue / Remaining Balance', value: formatMoney(overdueSummary.total_overdue_amount), tone: 'rose' },
    { icon: CalendarDays, label: 'Bookings', value: bookingSummary.total_bookings || 0, tone: 'violet' },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'payments':
        return (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentPayments.length === 0 ? (
              <EmptyState title="No payment history yet" />
            ) : (
              recentPayments.map((payment, index) => (
                <DataCard key={payment.transaction_id || index} title={payment.transaction_description || payment.category || 'Payment'}>
                  <InfoRow label="Date" value={formatDateTime(payment.created_at)} />
                  <InfoRow label="Amount" value={formatMoney(payment.amount)} />
                  <InfoRow label="Method" value={payment.payment_method || '-'} />
                  <InfoRow label="Status" value={payment.status || '-'} />
                  <InfoRow label="Reference" value={payment.reference_number || '-'} />
                </DataCard>
              ))
            )}
          </div>
        );
      case 'bookings':
        return (
          <div className="space-y-4">
            {activeBookings.length === 0 ? (
              <EmptyState title="No booking records yet" />
            ) : (
              activeBookings.map((booking, index) => (
                <DataCard key={booking.booking_id || index} title={booking.service_type || 'Booking'}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Booking ID" value={booking.booking_id} />
                    <InfoRow label="Status" value={booking.status || '-'} />
                    <InfoRow label="Service Model" value={booking.service_model || '-'} />
                    <InfoRow label="Start Date" value={formatDate(booking.start_date)} />
                    <InfoRow label="Patient" value={booking.patient_name || '-'} />
                    <InfoRow label="Assigned Staff" value={booking.current_staff_name || '-'} />
                    <InfoRow label="Quoted Amount" value={formatMoney(booking.amount_quotated || booking.quote_total || 0)} />
                    <InfoRow label="Paid" value={formatMoney(booking.amount_paid || 0)} />
                    <InfoRow label="Balance" value={formatMoney((booking.amount_quotated || booking.quote_total || 0) - (booking.amount_paid || 0))} />
                  </div>
                </DataCard>
              ))
            )}
          </div>
        );
      case 'quotes':
        return (
          <div className="space-y-4">
            {recentQuotes.length === 0 ? (
              <EmptyState title="No quotations found" />
            ) : (
              recentQuotes.map((quote, index) => (
                <DataCard key={quote.quote_id || index} title={quote.estimate_number || quote.quote_id || 'Quotation'}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Quote ID" value={quote.quote_id} />
                    <InfoRow label="Status" value={quote.status || '-'} />
                    <InfoRow label="Request" value={quote.request_id || '-'} />
                    <InfoRow label="Total Amount" value={formatMoney(quote.total_amount)} />
                    <InfoRow label="Daily Rate" value={formatMoney(quote.daily_rate)} />
                    <InfoRow label="Days" value={quote.qty_days || '-'} />
                  </div>
                </DataCard>
              ))
            )}
          </div>
        );
      case 'staff':
        return (
          <div className="space-y-4">
            {recentAssignments.length === 0 ? (
              <EmptyState title="No staff assignment history" />
            ) : (
              recentAssignments.map((assignment, index) => (
                <DataCard key={assignment.assignment_id || index} title={assignment.staff_name || 'Staff Assignment'}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Staff" value={assignment.staff_name || '-'} />
                    <InfoRow label="Designation" value={assignment.designation || '-'} />
                    <InfoRow label="Status" value={assignment.status || '-'} />
                    <InfoRow label="Assigned On" value={formatDateTime(assignment.assigned_on)} />
                    <InfoRow label="Daily Rate" value={formatMoney(assignment.daily_rate)} />
                    <InfoRow label="Allocated Amount" value={formatMoney(assignment.amount_allocated)} />
                  </div>
                </DataCard>
              ))
            )}
          </div>
        );
      case 'reviews':
        return (
          <div className="space-y-4">
            {reviewSummary.total_reviews ? (
              <div className="grid gap-4 md:grid-cols-3">
                <StatCard icon={Star} label="Average Rating" value={reviewSummary.average_rating || 0} tone="amber" />
                <StatCard icon={Users} label="Total Reviews" value={reviewSummary.total_reviews || 0} tone="violet" />
                <StatCard icon={Activity} label="Rating Spread" value={Object.keys(reviewSummary.rating_distribution || {}).length || 0} tone="slate" />
              </div>
            ) : null}
            {recentReviews.length === 0 ? (
              <EmptyState title="No reviews yet" />
            ) : (
              recentReviews.map((review, index) => (
                <DataCard key={review.review_id || index} title={review.staff_name || 'Review'}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Staff" value={review.staff_name || '-'} />
                    <InfoRow label="Rating" value={review.rating || '-'} />
                    <InfoRow label="Visible" value={review.is_visible ? 'Yes' : 'No'} />
                    <div className="md:col-span-2 lg:col-span-3">
                      <InfoRow label="Comment" value={review.review_text || '-'} />
                    </div>
                  </div>
                </DataCard>
              ))
            )}
          </div>
        );
      case 'patients':
        return (
          <div className="space-y-4">
            {patients.length === 0 ? (
              <EmptyState title="No patients registered under this client" />
            ) : (
              patients.map((patient, index) => (
                <DataCard key={patient.patient_id || index} title={patient.full_name || 'Patient'}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoRow label="Name" value={patient.full_name} />
                    <InfoRow label="Age" value={patient.age || '-'} />
                    <InfoRow label="Gender" value={patient.gender || '-'} />
                    <InfoRow label="Relationship" value={patient.relationship_to_client || '-'} />
                    <InfoRow label="Emergency Contact" value={patient.emergency_contact_name || '-'} />
                    <InfoRow label="Contact Number" value={patient.emergency_contact_number || '-'} />
                    <div className="md:col-span-2 lg:col-span-3">
                      <InfoRow label="Condition / Remarks" value={patient.medical_condition || patient.special_remarks || '-'} />
                    </div>
                  </div>
                </DataCard>
              ))
            )}
          </div>
        );
      case 'statement':
        return (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Start date</p>
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">End date</p>
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end gap-3 md:col-span-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={downloadStatement}
                    disabled={statementActionLoading === 'download'}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {statementActionLoading === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download Statement
                  </button>
                  <button
                    type="button"
                    onClick={sendStatementToWhatsApp}
                    disabled={statementActionLoading === 'whatsapp' || !clientProfile.mobile_number}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    title={clientProfile.mobile_number ? 'Send statement to WhatsApp' : 'Client has no phone number'}
                  >
                    {statementActionLoading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    Send WhatsApp
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={ReceiptText} label="Transactions" value={statementSummary.transaction_count || 0} tone="slate" />
              <StatCard icon={Wallet} label="Payments Made By Client" value={formatMoney(paymentSummary.total_paid)} tone="blue" />
              <StatCard icon={BadgeDollarSign} label="Invoiced Through Daily Invoicing" value={formatMoney(statementSummary.total_invoiced)} tone="emerald" />
              <StatCard icon={FileText} label="Overdue / Remaining Balance" value={formatMoney(overdueSummary.total_overdue_amount)} tone="rose" />
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-base font-bold text-slate-900">Transactions by Booking</h3>
                <p className="text-sm text-slate-500">Daily invoices and client payments grouped by booking date</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Booking</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Booking Details</th>
                      <th className="px-5 py-3 text-right">Invoice</th>
                      <th className="px-5 py-3 text-right">Payment</th>
                      <th className="px-5 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                    {statementLoading ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-10 text-center text-slate-500">
                          Loading statement...
                        </td>
                      </tr>
                    ) : statementRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-5 py-10 text-center text-slate-500">
                          No transaction rows available yet
                        </td>
                      </tr>
                    ) : (
                      statementRows.map((line, index) => (
                        <tr key={`${index}-${line.transaction_id || index}`} className="align-top hover:bg-slate-50/60">
                          <td className="px-5 py-4 font-medium text-slate-900">
                            <div className="space-y-1">
                              <p>{line.booking_id || '-'}</p>
                              <p className="text-xs text-slate-500">{line.booking_id ? formatDate(line.date) : '-'}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-slate-600">{formatDate(line.date)}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${line.row_type === 'INVOICE' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {line.row_type === 'INVOICE' ? 'Daily Invoice' : 'Client Payment'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            <div className="space-y-1">
                              <p>{line.transactions || '-'}</p>
                              <p className="text-xs text-slate-500">{line.details || '-'}</p>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-semibold text-slate-900">{formatMoney(line.amount_invoiced || 0)}</td>
                          <td className="px-5 py-4 text-right font-semibold text-emerald-700">{formatMoney(line.amount_paid || 0)}</td>
                          <td className="px-5 py-4 text-right font-semibold text-rose-700">{formatMoney(line.balance || 0)}</td>
                        </tr>
                      ))
                    )}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr className="font-semibold">
                        <td className="px-5 py-3">Totals</td>
                        <td className="px-5 py-3" />
                        <td className="px-5 py-3" />
                        <td className="px-5 py-3 text-slate-600">&nbsp;</td>
                        <td className="px-5 py-3 text-right">{formatMoney(ledgerTotals.total_invoiced || 0)}</td>
                        <td className="px-5 py-3 text-right text-emerald-700">{formatMoney(ledgerTotals.total_paid || 0)}</td>
                        <td className="px-5 py-3 text-right text-rose-700">{formatMoney(ledgerTotals.final_balance || 0)}</td>
                      </tr>
                    </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      case 'overdue':
        return (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <StatCard icon={ShieldAlert} label="Overdue Amount" value={formatMoney(overdueSummary.total_overdue_amount)} tone="rose" />
            <StatCard icon={CalendarDays} label="Overdue Invoices" value={overdueSummary.total_outstanding_invoices || 0} tone="amber" />
            <StatCard icon={Activity} label="Overdue Count" value={overdueSummary.overdue_payments_count || 0} tone="slate" />
          </div>
        );
      case 'overview':
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {topStats.map((stat) => (
                <StatCard key={stat.label} {...stat} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard title="Client Information">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Client Profile ID" value={clientProfile.client_profile_id} />
                  <InfoRow label="User ID" value={clientProfile.user_id} />
                  <InfoRow label="Email" value={clientProfile.email || '-'} />
                  <InfoRow label="Phone" value={clientProfile.mobile_number || '-'} />
                  <InfoRow label="Address" value={clientProfile.primary_address || '-'} />
                  <InfoRow label="Type" value={clientProfile.client_type || '-'} />
                  <InfoRow label="Gender" value={clientProfile.gender || '-'} />
                  <InfoRow label="Active" value={clientProfile.is_active ? 'Yes' : 'No'} />
                </div>
              </DataCard>

              <DataCard title="Quick Summary">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoRow label="Bookings" value={`${bookingSummary.total_bookings || 0} total`} />
                  <InfoRow label="Patients" value={patientSummary.total_patients || 0} />
                  <InfoRow label="Quotes" value={quotationSummary.total_quotes || 0} />
                  <InfoRow label="Current Staff" value={staffSummary.active_assignment_count || 0} />
                  <InfoRow label="Reviews" value={reviewSummary.total_reviews || 0} />
                  <InfoRow label="Last Transaction" value={formatDateTime(statementSummary.last_transaction_at)} />
                </div>
              </DataCard>
            </div>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Client Details" subtitle="Loading client profile...">
        <div className="flex min-h-[45vh] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading client details...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Client Details" subtitle="Unable to load client profile">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/admin/users')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to users
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Client Details"
      subtitle="Admin dashboard view of the full client profile and history"
      actions={(
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to user management
        </button>
      )}
    >
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-6 text-white">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold">
                  {(clientProfile.full_name || 'C').charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">{clientProfile.full_name || 'Client profile'}</h1>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${clientProfile.is_active ? 'bg-emerald-400/20 text-emerald-200' : 'bg-rose-400/20 text-rose-200'}`}>
                      {clientProfile.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-200">
                    <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> {clientProfile.mobile_number || '-'}</span>
                    <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {clientProfile.primary_address || '-'}</span>
                    <span className="inline-flex items-center gap-2"><Crown className="h-4 w-4" /> {clientProfile.client_type || '-'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Payments Made By Client</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoney(paymentSummary.total_paid)}</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Remaining / Overdue Balance</p>
                  <p className="mt-1 text-2xl font-bold">{formatMoney(overdueSummary.total_overdue_amount)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 lg:grid-cols-4">
            {topStats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {sectionConfig.map((section) => (
              <SectionButton
                key={section.id}
                active={activeSection === section.id}
                icon={section.icon}
                label={section.label}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {renderSection()}
        </div>
      </div>
    </AdminLayout>
  );
};

const DataCard = ({ title, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
    <div className="mb-4 flex items-center gap-2">
      <div className="h-2 w-2 rounded-full bg-blue-600" />
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
    </div>
    {children}
  </div>
);

const EmptyState = ({ title }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
    <p className="font-semibold text-slate-700">{title}</p>
  </div>
);

export default ClientDetailPage;
