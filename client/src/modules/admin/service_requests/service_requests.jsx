import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Phone, MapPin, Calendar, FileText,
  Eye, Calculator, Settings, Shield, Loader2,
  ChevronRight,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import PresetManager from '../service_quotes/PresetManager';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

const STATUS_TABS = ['All', 'New Lead', 'Pending', 'Contacted', 'Confirmed', 'Cancelled', 'Booking Created'];

const TAB_TO_STATUS = {
  'New Lead':       'NEW_LEAD',
  'Pending':        'PENDING',
  'Contacted':      'CONTACTED',
  'Confirmed':      'CONFIRMED',
  'Cancelled':      'CANCELLED',
  'Booking Created':'BOOKING_CREATED',
};

const STATUS_CONFIG = {
  NEW_LEAD:        { dot: 'bg-purple-400', text: 'text-purple-700', label: 'New Lead' },
  PENDING:         { dot: 'bg-amber-400',  text: 'text-amber-700',  label: 'Pending' },
  CONTACTED:       { dot: 'bg-blue-400',   text: 'text-blue-700',   label: 'Contacted' },
  CONFIRMED:       { dot: 'bg-emerald-500',text: 'text-emerald-700',label: 'Confirmed' },
  CANCELLED:       { dot: 'bg-red-400',    text: 'text-red-700',    label: 'Cancelled' },
  BOOKING_CREATED: { dot: 'bg-indigo-500', text: 'text-indigo-700', label: 'Booking Created' },
};

// PENDING here means the booking exists but no staff has been assigned yet
// (bookings.status flips to ACTIVE once staffAssignmentController assigns
// staff — see staffAssignmentController.js:410).
const BOOKING_STATUS_CONFIG = {
  PENDING: { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Yet to Assign Staff' },
  ACTIVE:  { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Active' },
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

const BookingStatusBadge = ({ status }) => {
  const cfg = BOOKING_STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const formatDate = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (v) =>
  v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const ServiceRequests = () => {
  const navigate = useNavigate();
  const [requests, setRequests]               = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);
  const [search, setSearch]                   = useState('');
  const [activeTab, setActiveTab]             = useState('All');
  const [showPresetManager, setShowPresetManager] = useState(false);

  useEffect(() => { fetchRequests(); }, []);

  const fetchRequests = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      const res = await apiClient.getAllServiceRequests();
      setRequests(res.data || []);
    } catch (err) {
      if (!silent) setError('Failed to load service requests.');
      else console.error('ServiceRequests silent refresh error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // New leads arrive from the public site continuously, so keep this list
  // fresh in the background; pause while the preset manager modal is open.
  useAutoRefresh(() => fetchRequests({ silent: true }), {
    intervalMs: 5000,
    enabled: !showPresetManager,
  });

  const filtered = requests.filter(r => {
    const statusMatch = activeTab === 'All' || r.status === TAB_TO_STATUS[activeTab];
    const q = search.trim().toLowerCase();
    const textMatch = !q || [r.payer_name, r.patient_name, r.payer_mobile, r.service_type, r.service_request_code]
      .some(v => v?.toLowerCase().includes(q));
    return statusMatch && textMatch;
  });

  const counts = {
    All: requests.length,
    ...Object.fromEntries(
      STATUS_TABS.filter(t => t !== 'All').map(tab => [
        tab,
        requests.filter(r => r.status === TAB_TO_STATUS[tab]).length,
      ])
    ),
  };

  if (loading) {
    return (
      <AdminLayout title="Service Requests" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Service Requests">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Service Requests"
      subtitle={`${requests.length} total request${requests.length !== 1 ? 's' : ''}`}
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white rounded-lg">
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-medium text-slate-500">Proxy Mode</span>
            <button
              type="button"
              onClick={() => navigate('/admin/proxy-service-requests')}
              role="switch"
              aria-checked={false}
              className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-slate-200 transition-colors duration-200 ease-in-out focus:outline-none"
            >
              <span className="pointer-events-none inline-block h-4 w-4 translate-x-1 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out" />
            </button>
          </div>
          <button
            onClick={() => setShowPresetManager(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Manage Presets
          </button>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, service…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Request</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-slate-200" />
                      <p className="text-sm text-slate-400">No service requests match your filters.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(r => (
                <tr key={r.request_id} className="hover:bg-slate-50 transition-colors">

                  {/* Request */}
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-slate-900 leading-tight">{r.payer_name}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-slate-500 text-xs">
                      <Phone className="w-3 h-3" />
                      <span>{r.payer_mobile}</span>
                    </div>
                    {r.service_request_code && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{r.service_request_code}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(r.created_at)}</p>
                  </td>

                  {/* Care Profile */}
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-slate-900">{r.patient_name || '—'}</p>
                    {(r.patient_age || r.relationship_to_client) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[r.patient_age && `Age ${r.patient_age}`, r.relationship_to_client].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {r.patient_condition && (
                      <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] truncate">{r.patient_condition}</p>
                    )}
                  </td>

                  {/* Service */}
                  <td className="px-4 py-3 align-top">
                    <p className="font-medium text-slate-900">{r.service_type || '—'}</p>
                    {r.service_model && (
                      <p className="text-xs text-slate-500 mt-0.5">{r.service_model.replace(/_/g, ' ')}</p>
                    )}
                    {r.preferred_gender && r.preferred_gender !== 'ANY' && (
                      <p className="text-xs text-slate-400 mt-0.5">Prefers {r.preferred_gender.toLowerCase()}</p>
                    )}
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3 align-top max-w-[180px]">
                    <div className="flex items-start gap-1 text-slate-600">
                      <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
                      <span className="text-xs line-clamp-2">{r.location_address || '—'}</span>
                    </div>
                  </td>

                  {/* Start Date */}
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    <div className="flex items-center gap-1 text-slate-600 text-xs">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{formatDate(r.start_date)}</span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={r.status || 'PENDING'} />
                      {r.status === 'BOOKING_CREATED' && r.booking_status && (
                        <BookingStatusBadge status={r.booking_status} />
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => navigate(`/admin/service-requests/${r.request_id}/summary`)}
                        title="View Summary"
                        className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {['NEW_LEAD', 'PENDING'].includes(r.status || 'PENDING') && (
                        <button
                          onClick={() => navigate(`/admin/modular-quote-builder/${r.request_id}`)}
                          title="Create Quote"
                          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-emerald-600 transition-colors"
                        >
                          <Calculator className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {requests.length} request{requests.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => setShowPresetManager(false)}
      />
    </AdminLayout>
  );
};

export default ServiceRequests;
