import React, { useState, useEffect } from 'react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  Calendar,
  User,
  AlertTriangle,
  Clock,
  MapPin,
  Filter,
  Search,
  CheckCircle,
  XCircle,
  Activity,
  ChevronDown,
  ChevronUp,
  Wallet,
  History,
} from 'lucide-react';

const formatMoney = (v) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(Number(v || 0));

const URGENCY_CONFIG = {
  IMMEDIATE: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    stat: 'border-red-200 text-red-600',
    ring: 'ring-2 ring-red-200 border-red-300',
    Icon: AlertTriangle,
    label: 'Immediate',
  },
  TODAY: {
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    stat: 'border-orange-200 text-orange-600',
    ring: 'ring-2 ring-orange-200 border-orange-300',
    Icon: Clock,
    label: 'Today',
  },
  FUTURE: {
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    stat: 'border-yellow-200 text-yellow-600',
    ring: 'ring-2 ring-yellow-200 border-yellow-300',
    Icon: Calendar,
    label: 'Future',
  },
};

const UrgencyBadge = ({ urgency }) => {
  const cfg = URGENCY_CONFIG[urgency];
  if (!cfg) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-gray-100 text-gray-800 border-gray-200">
      <Activity className="w-3.5 h-3.5" />
      {urgency}
    </span>
  );
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badge}`}>
      <Icon className="w-3.5 h-3.5" />
      {urgency}
    </span>
  );
};

const Field = ({ label, value, mono = false }) => (
  <div>
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
    <p className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
  </div>
);

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const fmtDt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

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

  const counts = {
    IMMEDIATE: terminationRequests.filter((r) => r.urgency === 'IMMEDIATE').length,
    TODAY: terminationRequests.filter((r) => r.urgency === 'TODAY').length,
    FUTURE: terminationRequests.filter((r) => r.urgency === 'FUTURE').length,
  };

  if (loading) {
    return (
      <AdminLayout title="Termination Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Termination Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Termination Requests"
      subtitle={`${filteredRequests.length} pending request${filteredRequests.length !== 1 ? 's' : ''}`}
    >
      {/* Urgency Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {(['IMMEDIATE', 'TODAY', 'FUTURE']).map((key) => {
          const cfg = URGENCY_CONFIG[key];
          const isActive = urgencyFilter === key;
          return (
            <button
              key={key}
              onClick={() => setUrgencyFilter(isActive ? 'all' : key)}
              className={`bg-white rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
                isActive ? cfg.ring : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-3xl font-bold ${cfg.stat}`}>{counts[key]}</p>
              <p className="text-sm text-slate-500 mt-1">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, care profile, staff, or booking ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Urgency</option>
            <option value="IMMEDIATE">Immediate</option>
            <option value="TODAY">Today</option>
            <option value="FUTURE">Future</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No termination requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Booking', 'Client & Care Profile', 'Assigned Staff', 'Urgency', 'Requested End Date', 'Submitted', ''].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider"
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
                          isExpanded ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => handleToggle(request.termination_id)}
                      >
                        <td className="px-6 py-4">
                          <p className="text-xs font-mono text-slate-400">{request.termination_code}</p>
                          <p className="text-sm font-semibold font-mono text-slate-900">
                            {request.booking_code || request.booking_id}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 capitalize">
                            {request.service_type?.replace(/[{}]/g, '') || 'General'}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-900">{request.client_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{request.patient_name}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                            <p className="text-sm text-slate-700">{request.staff_name || 'Not assigned'}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <UrgencyBadge urgency={request.urgency} />
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {request.requested_end_date ? fmt(request.requested_end_date) : '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{fmtDt(request.request_date)}</td>
                        <td className="px-6 py-4 text-right pr-6">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-blue-500 inline" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-slate-400 inline" />
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50 border-b border-slate-200 border-l-2 border-l-blue-500">
                            <div className="px-6 py-6 space-y-4">
                              <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Booking Information</p>
                                  <Field label="Booking Code" value={request.booking_code || request.booking_id} mono />
                                  <Field label="Service Type" value={request.service_type?.replace(/[{}]/g, '') || 'General Service'} />
                                  <Field label="Service Start Date" value={fmt(request.start_date)} />
                                  <Field label="Request Submitted" value={fmtDt(request.request_date)} />
                                </div>

                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client & Care Profile</p>
                                  <Field label="Client Name" value={request.client_name} />
                                  <Field label="Care Profile" value={request.patient_name} />
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Location</p>
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                      <p className="text-sm font-medium text-slate-900">{request.location || '—'}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff & Termination</p>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                      <User className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{request.staff_name || 'Not assigned'}</p>
                                      <p className="text-xs text-slate-400">{request.staff_code || request.staff_profile_id || ''}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Urgency</p>
                                    <UrgencyBadge urgency={request.urgency} />
                                  </div>
                                  <Field label="Requested End Date" value={fmt(request.requested_end_date)} />
                                </div>
                              </div>

                              <div className="bg-white rounded-lg border border-slate-200 p-4">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Reason for Termination</p>
                                <p className="text-sm text-slate-700 leading-relaxed">{request.reason || 'No reason provided.'}</p>
                              </div>

                              <div className="bg-white rounded-lg border border-green-200 p-4">
                                <div className="flex items-center justify-between gap-6">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">Approve Termination</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Finalises the termination and processes settlement. The staff member will be marked as available.
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={(e) => openRejectModal(e, request)}
                                      className="inline-flex items-center gap-2 px-5 py-2 bg-white text-red-600 border border-red-200 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors"
                                    >
                                      <XCircle className="w-4 h-4" />
                                      Reject
                                    </button>
                                    <button
                                      onClick={(e) => openModal(e, request)}
                                      className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
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
      </div>

      {/* Past Terminations */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <History className="w-5 h-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">Past Terminations</h2>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
            {historyRequests.length}
          </span>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search past terminations..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {historyRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <History className="w-8 h-8 text-slate-300" />
              <p className="text-slate-500 text-sm">No past terminations yet</p>
            </div>
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
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Search className="w-8 h-8 text-slate-300" />
                  <p className="text-slate-500 text-sm">No results match your search</p>
                </div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Ref', 'Client & Care Profile', 'Staff', 'Urgency', 'Official End Date', 'Status', 'Submitted', ''].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((r) => {
                      const isEx = historyExpanded === r.termination_id;
                      return (
                        <React.Fragment key={r.termination_id}>
                          <tr
                            className={`transition-colors cursor-pointer select-none ${isEx ? 'bg-slate-50 border-l-2 border-l-slate-400' : 'hover:bg-slate-50'}`}
                            onClick={() => setHistoryExpanded(isEx ? null : r.termination_id)}
                          >
                            <td className="px-5 py-4">
                              <p className="text-xs font-mono text-slate-400">{r.termination_code}</p>
                              <p className="text-sm font-semibold font-mono text-slate-700">{r.booking_code || r.booking_id}</p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold text-slate-900">{r.client_name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{r.patient_name}</p>
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm text-slate-700">{r.staff_name || '—'}</p>
                            </td>
                            <td className="px-5 py-4">
                              <UrgencyBadge urgency={r.urgency} />
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">
                              {r.official_end_date ? fmt(r.official_end_date) : '—'}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                r.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                                  : r.status === 'REJECTED' ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-500">{fmtDt(r.request_date)}</td>
                            <td className="px-5 py-4 text-right pr-5">
                              {isEx ? <ChevronUp className="w-4 h-4 text-slate-400 inline" /> : <ChevronDown className="w-4 h-4 text-slate-400 inline" />}
                            </td>
                          </tr>
                          {isEx && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50 border-b border-slate-200 border-l-2 border-l-slate-400">
                                <div className="px-6 py-5 space-y-4">
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Booking</p>
                                      <Field label="Booking Code" value={r.booking_code || r.booking_id} mono />
                                      <Field label="Service Type" value={r.service_type?.replace(/[{}]/g, '') || 'General'} />
                                      <Field label="Service Start" value={fmt(r.start_date)} />
                                      <Field label="Official End" value={r.official_end_date ? fmt(r.official_end_date) : '—'} />
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Client & Care Profile</p>
                                      <Field label="Client" value={r.client_name} />
                                      <Field label="Care Profile" value={r.patient_name} />
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Location</p>
                                        <div className="flex items-start gap-1.5">
                                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                          <p className="text-sm font-medium text-slate-900">{r.location || '—'}</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Financials</p>
                                      <Field label="Total Paid" value={formatMoney(r.total_paid)} />
                                      <Field label="Total Invoiced" value={formatMoney(r.total_invoiced)} />
                                      <div>
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Remaining Balance</p>
                                        <p className={`text-sm font-semibold ${Number(r.remaining_balance) > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                          {formatMoney(r.remaining_balance)}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="bg-white rounded-lg border border-slate-200 p-4">
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Client's Reason</p>
                                    <p className="text-sm text-slate-700 leading-relaxed">{r.reason || 'No reason provided.'}</p>
                                  </div>
                                  {r.status === 'REJECTED' && r.rejection_reason && (
                                    <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                                      <p className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Rejection Reason</p>
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
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Approve Termination</h2>
                <p className="text-xs text-slate-500 mt-0.5">{modal.client_name} · {modal.booking_code || modal.booking_id}</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Financial summary */}
              {(() => {
                const totalPaid = Number(modal.total_paid || 0);
                const totalInvoiced = Number(modal.total_invoiced || 0);
                const remainingBalance = Number(modal.remaining_balance || 0);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Paid</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalPaid)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-0.5">Total Invoiced</p>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(totalInvoiced)}</p>
                    </div>
                    <div className={`rounded-lg border p-3 ${remainingBalance > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-xs text-slate-500 mb-0.5">Remaining Balance</p>
                      <p className={`text-sm font-semibold ${remainingBalance > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatMoney(remainingBalance)}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Final end date */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Official End Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={modalFinalEndDate}
                  onChange={(e) => setModalFinalEndDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
                {modalFinalEndDate && modalFinalEndDate > new Date().toISOString().split('T')[0] && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    This is a future date — the booking will stay active and billed until then, and terminate automatically on {fmt(modalFinalEndDate)}.
                  </p>
                )}
              </div>

              {/* Settlement action */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Settlement Action</label>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    settlementAction === 'WALLET_DEPOSIT' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {settlementAction === 'WALLET_DEPOSIT' ? 'Refund available' : 'No refund'}
                  </span>
                </div>
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${
                    settlementAction === 'WALLET_DEPOSIT' ? 'ring-green-400' : 'ring-slate-200 hover:ring-green-300'
                  }`}>
                    <input
                      type="radio"
                      name="settlementAction"
                      value="WALLET_DEPOSIT"
                      checked={settlementAction === 'WALLET_DEPOSIT'}
                      onChange={(e) => setSettlementAction(e.target.value)}
                      className="mt-1 accent-green-600"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-semibold text-slate-900">Deposit to wallet</span>
                      </div>
                      <span className="block text-xs text-slate-500 mt-0.5">Return the remaining balance to the client's VCare wallet.</span>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700 ring-1 transition ${
                    settlementAction === 'NO_REFUND' ? 'ring-amber-400' : 'ring-slate-200 hover:ring-amber-300'
                  }`}>
                    <input
                      type="radio"
                      name="settlementAction"
                      value="NO_REFUND"
                      checked={settlementAction === 'NO_REFUND'}
                      onChange={(e) => setSettlementAction(e.target.value)}
                      className="mt-1 accent-amber-500"
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
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Settlement Note {settlementAction === 'NO_REFUND' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  rows={3}
                  placeholder={settlementAction === 'NO_REFUND' ? 'Required — explain why no refund is being issued' : 'Optional note about the settlement decision'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {approveError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {approveError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitApproval}
                disabled={approveLoading || !modalFinalEndDate}
                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {approveLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeRejectModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Reject Termination Request</h2>
                <p className="text-xs text-slate-500 mt-0.5">{rejectModal.client_name} · {rejectModal.booking_code || rejectModal.booking_id}</p>
              </div>
              <button onClick={closeRejectModal} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                The booking will remain active and the client will be notified of the rejection.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why this termination request is being rejected — this will be shared with the client"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>

              {rejectError && (
                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  {rejectError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={closeRejectModal}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitRejection}
                disabled={rejectLoading || !rejectReason.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rejectLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default TerminationRequests;
