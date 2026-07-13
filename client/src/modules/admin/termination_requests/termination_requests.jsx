import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  User,
  AlertTriangle,
  MapPin,
  Search,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Wallet,
  History,
  Loader2,
  X,
} from 'lucide-react';

const formatMoney = (v) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(Number(v || 0));

const URGENCY_CONFIG = {
  IMMEDIATE: { dot: 'bg-red-500',    text: 'text-red-700',    label: 'Immediate' },
  TODAY:     { dot: 'bg-orange-400', text: 'text-orange-700', label: 'Today' },
  FUTURE:    { dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Future' },
};

const STATUS_CONFIG = {
  APPROVED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Approved' },
  REJECTED: { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Rejected' },
};

const UrgencyBadge = ({ urgency }) => {
  const cfg = URGENCY_CONFIG[urgency] || { dot: 'bg-slate-400', text: 'text-slate-600', label: urgency };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const Field = ({ label, value, mono = false }) => (
  <div>
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    <p className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
  </div>
);

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtDt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const URGENCY_TABS = ['All', 'Immediate', 'Today', 'Future'];
const TAB_TO_URGENCY = { Immediate: 'IMMEDIATE', Today: 'TODAY', Future: 'FUTURE' };

const TerminationRequests = () => {
  const [terminationRequests, setTerminationRequests] = useState([]);
  const [historyRequests, setHistoryRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(null);

  // Modal state
  const [modal, setModal] = useState(null); // null | request object
  const [modalFinalEndDate, setModalFinalEndDate] = useState('');
  const [settlementAction, setSettlementAction] = useState('WALLET_DEPOSIT');
  const [settlementNote, setSettlementNote] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState(null);

  // Reject modal state
  const [rejectModal, setRejectModal] = useState(null); // null | request object
  const [rejectReason, setRejectReason] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pendingRes, historyRes] = await Promise.all([
        apiClient.getPendingTerminationRequests(),
        apiClient.getTerminationHistory(),
      ]);
      setTerminationRequests(pendingRes.data || []);
      setHistoryRequests(historyRes.data || []);
    } catch (err) {
      console.error('Termination Requests fetch error:', err);
      setError(`Failed to fetch termination requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTerminationRequests = fetchAll;

  const filteredRequests = terminationRequests.filter((req) => {
    const matchesSearch =
      req.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.booking_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesUrgency = urgencyFilter === 'all' || req.urgency === urgencyFilter;
    return matchesSearch && matchesUrgency;
  });

  const counts = {
    All: terminationRequests.length,
    Immediate: terminationRequests.filter((r) => r.urgency === 'IMMEDIATE').length,
    Today: terminationRequests.filter((r) => r.urgency === 'TODAY').length,
    Future: terminationRequests.filter((r) => r.urgency === 'FUTURE').length,
  };

  const activeTab = urgencyFilter === 'all'
    ? 'All'
    : URGENCY_TABS.find((t) => TAB_TO_URGENCY[t] === urgencyFilter) || 'All';

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const openModal = (e, request) => {
    e.stopPropagation();
    setModal(request);
    setModalFinalEndDate(
      request.requested_end_date
        ? new Date(request.requested_end_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    );
    setSettlementAction('WALLET_DEPOSIT');
    setSettlementNote('');
    setApproveError(null);
  };

  const closeModal = () => {
    setModal(null);
    setApproveError(null);
  };

  const submitApproval = async () => {
    if (settlementAction === 'NO_REFUND' && !settlementNote.trim()) {
      setApproveError('A settlement note is required when selecting no refund.');
      return;
    }
    try {
      setApproveLoading(true);
      setApproveError(null);
      const response = await apiClient.approveTerminationRequest(
        modal.termination_id,
        modalFinalEndDate,
        settlementAction,
        settlementNote.trim() || null,
      );
      closeModal();
      setExpandedId(null);
      fetchTerminationRequests();
      if (response?.scheduled) {
        window.alert(response.message || 'Termination scheduled for the future date. The booking stays active and billed until then.');
      }
    } catch (err) {
      console.error('Error approving termination:', err);
      setApproveError(err.message || 'Failed to approve termination.');
    } finally {
      setApproveLoading(false);
    }
  };

  const openRejectModal = (e, request) => {
    e.stopPropagation();
    setRejectModal(request);
    setRejectReason('');
    setRejectError(null);
  };

  const closeRejectModal = () => {
    setRejectModal(null);
    setRejectError(null);
  };

  const submitRejection = async () => {
    if (!rejectReason.trim()) {
      setRejectError('A reason is required when rejecting a termination request.');
      return;
    }
    try {
      setRejectLoading(true);
      setRejectError(null);
      await apiClient.rejectTerminationRequest(rejectModal.termination_id, rejectReason.trim());
      closeRejectModal();
      setExpandedId(null);
      fetchTerminationRequests();
    } catch (err) {
      console.error('Error rejecting termination:', err);
      setRejectError(err.message || 'Failed to reject termination.');
    } finally {
      setRejectLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Termination Requests" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Termination Requests">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Termination Requests"
      subtitle="Review and process booking termination requests."
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {URGENCY_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setUrgencyFilter(tab === 'All' ? 'all' : TAB_TO_URGENCY[tab])}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[tab]}</span>
            </button>
          ))}
        </div>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by client, staff, or booking…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No termination requests match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Booking', 'Client & Care Profile', 'Assigned Staff', 'Urgency', 'Requested End Date', 'Submitted', ''].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((request) => {
                  const isExpanded = expandedId === request.termination_id;
                  return (
                    <React.Fragment key={request.termination_id}>
                      <tr
                        className={`transition-colors cursor-pointer select-none ${
                          isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => handleToggle(request.termination_id)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-xs font-mono text-slate-400">{request.termination_code}</p>
                          <p className="font-semibold font-mono text-slate-900">
                            {request.booking_code || request.booking_id}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 capitalize">
                            {request.service_type?.replace(/[{}]/g, '') || 'General'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900 leading-tight">{request.client_name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{request.patient_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                              <User className="w-4 h-4 text-slate-400" />
                            </div>
                            <p className="text-slate-700">{request.staff_name || 'Not assigned'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <UrgencyBadge urgency={request.urgency} />
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {request.requested_end_date ? fmt(request.requested_end_date) : '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDt(request.request_date)}</td>
                        <td className="px-4 py-3 text-right">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-blue-500 ml-auto" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-300 ml-auto" />
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/70">
                            <div className="px-4 py-5 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Booking Information</p>
                                  <Field label="Booking Code" value={request.booking_code || request.booking_id} mono />
                                  <Field label="Service Type" value={request.service_type?.replace(/[{}]/g, '') || 'General Service'} />
                                  <Field label="Service Start Date" value={fmt(request.start_date)} />
                                  <Field label="Request Submitted" value={fmtDt(request.request_date)} />
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client & Care Profile</p>
                                  <Field label="Client Name" value={request.client_name} />
                                  <Field label="Care Profile" value={request.patient_name} />
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</p>
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                      <p className="text-sm font-medium text-slate-900">{request.location || '—'}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff & Termination</p>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                                      <User className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{request.staff_name || 'Not assigned'}</p>
                                      <p className="text-xs text-slate-400 font-mono">{request.staff_code || request.staff_profile_id || ''}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Urgency</p>
                                    <UrgencyBadge urgency={request.urgency} />
                                  </div>
                                  <Field label="Requested End Date" value={fmt(request.requested_end_date)} />
                                </div>
                              </div>

                              <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reason for Termination</p>
                                <p className="text-sm text-slate-700 leading-relaxed">{request.reason || 'No reason provided.'}</p>
                              </div>

                              <div className="bg-white rounded-xl border border-slate-200 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">Process this request</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Approving finalises the termination and processes settlement. The staff member will be marked as available.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={(e) => openRejectModal(e, request)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      Reject
                                    </button>
                                    <button
                                      onClick={(e) => openModal(e, request)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                      Approve
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredRequests.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filteredRequests.length} of {terminationRequests.length} pending request{terminationRequests.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Past Terminations */}
      <div className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Past Terminations</h2>
            <span className="text-xs tabular-nums text-slate-400">{historyRequests.length}</span>
          </div>

          <div className="relative sm:ml-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search past terminations…"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {historyRequests.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No past terminations yet.</div>
          ) : (() => {
            const filtered = historyRequests.filter((r) =>
              r.client_name?.toLowerCase().includes(historySearch.toLowerCase()) ||
              r.patient_name?.toLowerCase().includes(historySearch.toLowerCase()) ||
              r.staff_name?.toLowerCase().includes(historySearch.toLowerCase()) ||
              r.termination_code?.toLowerCase().includes(historySearch.toLowerCase()) ||
              r.booking_code?.toLowerCase().includes(historySearch.toLowerCase())
            );
            if (filtered.length === 0) {
              return (
                <div className="text-center py-16 text-slate-400 text-sm">No results match your search.</div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {['Ref', 'Client & Care Profile', 'Staff', 'Urgency', 'Official End Date', 'Status', 'Submitted', ''].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((r) => {
                      const isEx = historyExpanded === r.termination_id;
                      return (
                        <React.Fragment key={r.termination_id}>
                          <tr
                            className={`transition-colors cursor-pointer select-none ${isEx ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                            onClick={() => setHistoryExpanded(isEx ? null : r.termination_id)}
                          >
                            <td className="px-4 py-3">
                              <p className="text-xs font-mono text-slate-400">{r.termination_code}</p>
                              <p className="font-semibold font-mono text-slate-700">{r.booking_code || r.booking_id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 leading-tight">{r.client_name}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{r.patient_name}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-slate-700">{r.staff_name || '—'}</p>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <UrgencyBadge urgency={r.urgency} />
                            </td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {r.official_end_date ? fmt(r.official_end_date) : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDt(r.request_date)}</td>
                            <td className="px-4 py-3 text-right">
                              {isEx ? <ChevronUp className="w-4 h-4 text-slate-400 ml-auto" /> : <ChevronDown className="w-4 h-4 text-slate-300 ml-auto" />}
                            </td>
                          </tr>
                          {isEx && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50/70">
                                <div className="px-4 py-5 space-y-4">
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Booking</p>
                                      <Field label="Booking Code" value={r.booking_code || r.booking_id} mono />
                                      <Field label="Service Type" value={r.service_type?.replace(/[{}]/g, '') || 'General'} />
                                      <Field label="Service Start" value={fmt(r.start_date)} />
                                      <Field label="Official End" value={r.official_end_date ? fmt(r.official_end_date) : '—'} />
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client & Care Profile</p>
                                      <Field label="Client" value={r.client_name} />
                                      <Field label="Care Profile" value={r.patient_name} />
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</p>
                                        <div className="flex items-start gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                          <p className="text-sm font-medium text-slate-900">{r.location || '—'}</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Financials</p>
                                      <Field label="Total Paid" value={formatMoney(r.total_paid)} />
                                      <Field label="Total Invoiced" value={formatMoney(r.total_invoiced)} />
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Remaining Balance</p>
                                        <p className={`text-sm font-semibold ${Number(r.remaining_balance) > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                          {formatMoney(r.remaining_balance)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Client's Reason</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{r.reason || 'No reason provided.'}</p>
                                  </div>
                                  {r.status === 'REJECTED' && r.rejection_reason && (
                                    <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Rejection Reason</p>
                                      <p className="text-sm text-red-800 leading-relaxed">{r.rejection_reason}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Approval Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Approve Termination</h2>
                <p className="text-xs text-slate-400 mt-0.5">{modal.client_name} · {modal.booking_code || modal.booking_id}</p>
              </div>
              <button onClick={closeModal} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Financial summary */}
              {(() => {
                const totalPaid = Number(modal.total_paid || 0);
                const totalInvoiced = Number(modal.total_invoiced || 0);
                const remainingBalance = Number(modal.remaining_balance || 0);
                return (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Total Paid</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalPaid)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Total Invoiced</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalInvoiced)}</p>
                    </div>
                    <div className={`rounded-lg border p-3 ${remainingBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-xs text-slate-400 mb-0.5">Remaining Balance</p>
                      <p className={`text-sm font-semibold ${remainingBalance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatMoney(remainingBalance)}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Final end date */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Official End Date <span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="date"
                  value={modalFinalEndDate}
                  onChange={(e) => setModalFinalEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors"
                />
                {modalFinalEndDate && modalFinalEndDate > new Date().toISOString().split('T')[0] && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    This is a future date — the booking will stay active and billed until then, and terminate automatically on {fmt(modalFinalEndDate)}.
                  </p>
                )}
              </div>

              {/* Settlement action */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-600">Settlement Action</label>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    settlementAction === 'WALLET_DEPOSIT' ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${settlementAction === 'WALLET_DEPOSIT' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    {settlementAction === 'WALLET_DEPOSIT' ? 'Refund available' : 'No refund'}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm text-slate-700 transition-colors ${
                    settlementAction === 'WALLET_DEPOSIT' ? 'border-blue-400 ring-2 ring-blue-100 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="settlementAction"
                      value="WALLET_DEPOSIT"
                      checked={settlementAction === 'WALLET_DEPOSIT'}
                      onChange={(e) => setSettlementAction(e.target.value)}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold text-slate-900">Deposit to wallet</span>
                      </div>
                      <span className="block text-xs text-slate-500 mt-0.5">Return the remaining balance to the client's VCare wallet.</span>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm text-slate-700 transition-colors ${
                    settlementAction === 'NO_REFUND' ? 'border-blue-400 ring-2 ring-blue-100 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="settlementAction"
                      value="NO_REFUND"
                      checked={settlementAction === 'NO_REFUND'}
                      onChange={(e) => setSettlementAction(e.target.value)}
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="font-semibold text-slate-900">No refund</span>
                      </div>
                      <span className="block text-xs text-slate-500 mt-0.5">Retain the remaining balance with the booking record.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Settlement note */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Settlement Note {settlementAction === 'NO_REFUND' && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <textarea
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  rows={3}
                  placeholder={settlementAction === 'NO_REFUND' ? 'Required — explain why no refund is being issued' : 'Optional note about the settlement decision'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              {approveError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {approveError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitApproval}
                disabled={approveLoading || !modalFinalEndDate}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approveLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {approveLoading ? 'Approving…' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closeRejectModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Reject Termination Request</h2>
                <p className="text-xs text-slate-400 mt-0.5">{rejectModal.client_name} · {rejectModal.booking_code || rejectModal.booking_id}</p>
              </div>
              <button onClick={closeRejectModal} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                The booking will remain active and the client will be notified of the rejection.
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Reason for Rejection <span className="text-red-500 ml-0.5">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why this termination request is being rejected — this will be shared with the client"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              {rejectError && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                  {rejectError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={closeRejectModal}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={rejectLoading || !rejectReason.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejectLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {rejectLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default TerminationRequests;
