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
} from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState(null);
  const [finalEndDate, setFinalEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchTerminationRequests();
  }, []);

  const fetchTerminationRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getPendingTerminationRequests();
      setTerminationRequests(response.data || []);
    } catch (err) {
      console.error('Termination Requests fetch error:', err);
      setError(`Failed to fetch termination requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

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
    if (expandedId === id) {
      setExpandedId(null);
      setApproveError(null);
    } else {
      setExpandedId(id);
      setFinalEndDate(new Date().toISOString().split('T')[0]);
      setApproveError(null);
    }
  };

  const submitApproval = async (e, terminationId) => {
    e.stopPropagation();
    try {
      setApproveLoading(true);
      setApproveError(null);
      await apiClient.approveTerminationRequest(terminationId, finalEndDate);
      setExpandedId(null);
      fetchTerminationRequests();
    } catch (err) {
      console.error('Error approving termination:', err);
      setApproveError(err.message || 'Failed to approve termination.');
    } finally {
      setApproveLoading(false);
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
      <div className="grid grid-cols-3 gap-4 mb-6">
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
                      {/* Summary Row */}
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

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50 border-b border-slate-200 border-l-2 border-l-blue-500">
                            <div className="px-6 py-6 space-y-4">
                              {/* Three-column info grid */}
                              <div className="grid grid-cols-3 gap-4">
                                {/* Booking Info */}
                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                    Booking Information
                                  </p>
                                  <Field label="Booking Code" value={request.booking_code || request.booking_id} mono />
                                  <Field
                                    label="Service Type"
                                    value={request.service_type?.replace(/[{}]/g, '') || 'General Service'}
                                  />
                                  <Field label="Service Start Date" value={fmt(request.start_date)} />
                                  <Field label="Request Submitted" value={fmtDt(request.request_date)} />
                                </div>

                                {/* Client & Care Profile */}
                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                    Client & Care Profile
                                  </p>
                                  <Field label="Client Name" value={request.client_name} />
                                  <Field label="Care Profile" value={request.patient_name} />
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                                      Location
                                    </p>
                                    <div className="flex items-start gap-1.5">
                                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                                      <p className="text-sm font-medium text-slate-900">{request.location || '—'}</p>
                                    </div>
                                  </div>
                                </div>

                                {/* Staff & Urgency */}
                                <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                    Staff & Termination
                                  </p>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                                      <User className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {request.staff_name || 'Not assigned'}
                                      </p>
                                      <p className="text-xs text-slate-400">
                                        {request.staff_code || request.staff_profile_id || ''}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                                      Urgency
                                    </p>
                                    <UrgencyBadge urgency={request.urgency} />
                                  </div>
                                  <Field
                                    label="Requested End Date"
                                    value={fmt(request.requested_end_date)}
                                  />
                                </div>
                              </div>

                              {/* Reason */}
                              <div className="bg-white rounded-lg border border-slate-200 p-4">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                                  Reason for Termination
                                </p>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                  {request.reason || 'No reason provided.'}
                                </p>
                              </div>

                              {/* Approval */}
                              <div className="bg-white rounded-lg border border-green-200 p-4">
                                <div className="flex items-start justify-between gap-6">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">Approve Termination</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                      Finalises the termination and processes any applicable refunds. The staff
                                      member will be marked as available for new assignments.
                                    </p>
                                  </div>
                                  <div className="flex items-end gap-3 flex-shrink-0">
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                        Final End Date <span className="text-red-500">*</span>
                                      </label>
                                      <input
                                        type="date"
                                        value={finalEndDate}
                                        onChange={(e) => setFinalEndDate(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                      />
                                    </div>
                                    <button
                                      onClick={(e) => submitApproval(e, request.termination_id)}
                                      disabled={approveLoading}
                                      className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {approveLoading ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <CheckCircle className="w-4 h-4" />
                                      )}
                                      Approve
                                    </button>
                                  </div>
                                </div>
                                {approveError && (
                                  <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
                                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                    {approveError}
                                  </p>
                                )}
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
    </AdminLayout>
  );
};

export default TerminationRequests;
