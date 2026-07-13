import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Calendar, DollarSign, Activity,
  ShieldCheck, CheckCircle, Clock, AlertTriangle,
  Stethoscope, Baby, Heart, Filter
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (val) =>
  `LKR ${Math.round(parseFloat(val || 0)).toLocaleString('en-LK')}`;

const formatChange = (pct) => {
  if (pct === null || pct === undefined || !isFinite(pct)) return null;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
};

const timeAgo = (dateStr) => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// Raw service_type values are inconsistent in the data (public booking forms have
// written '{NANNY}', 'NANNY', etc. over time) — normalize to one canonical key.
const normalizeServiceType = (raw) => {
  if (raw === 'HOME_NURSING') return { key: 'HOME_NURSING', label: 'Home Nursing' };
  if (['ELDERLY_CARE', 'CARETAKER'].includes(raw)) return { key: 'ELDERLY_CARE', label: 'Elderly Care' };
  if (['{NANNY}', 'NANNY', 'CHILD_CARE', 'BABY_CARE'].includes(raw)) {
    return { key: 'CHILD_CARE', label: 'Child Care' };
  }
  return { key: 'OTHER', label: raw || 'Other' };
};

const SERVICE_TYPE_BADGE = {
  HOME_NURSING: 'bg-blue-100 text-blue-800',
  ELDERLY_CARE: 'bg-rose-100 text-rose-800',
  CHILD_CARE: 'bg-amber-100 text-amber-800',
  OTHER: 'bg-slate-100 text-slate-800',
};

const CATEGORY_DOT_COLOR = {
  HOME_NURSING: 'bg-blue-500',
  ELDERLY_CARE: 'bg-rose-500',
  CHILD_CARE: 'bg-amber-500',
  OTHER: 'bg-slate-400',
};

const REQUEST_STATUS_LABELS = {
  NEW_LEAD: 'New',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ASSIGNED: 'Assigned',
  BOOKING_CREATED: 'Booked',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
};

const REQUEST_STATUS_STYLES = {
  NEW_LEAD: 'bg-red-50 text-red-600 border border-red-100',
  PENDING: 'bg-amber-50 text-amber-600 border border-amber-100',
  CONFIRMED: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  ASSIGNED: 'bg-blue-50 text-blue-600 border border-blue-100',
  BOOKING_CREATED: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  COMPLETED: 'bg-slate-100 text-slate-600 border border-slate-200',
  CANCELLED: 'bg-red-50 text-red-600 border border-red-100',
};

const ACTION_META = {
  WORKER_VERIFICATION: { icon: ShieldCheck, classes: 'bg-red-50 text-red-700' },
  STAFF_ADVANCE: { icon: DollarSign, classes: 'bg-blue-50 text-blue-700' },
  PENDING_TERMINATION: { icon: AlertTriangle, classes: 'bg-amber-50 text-amber-700' },
};

const EMPTY_DATA = {
  stats: { total_bookings: 0, active_requests: 0, available_staff: 0, monthly_revenue: 0 },
  category_breakdown: [],
  recent_requests: [],
  pending_actions: [],
};

// Tab navigation within the dashboard
const TABS = [
  { id: 'Overview', label: 'Overview', icon: Activity, serviceType: null },
  { id: 'Home Nursing', label: 'Home Nursing', icon: Stethoscope, serviceType: 'HOME_NURSING' },
  { id: 'Elderly Care', label: 'Elderly Care', icon: Heart, serviceType: 'ELDERLY_CARE' },
  { id: 'Child Care', label: 'Child Care', icon: Baby, serviceType: 'CHILD_CARE' },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const serviceType = TABS.find((t) => t.id === activeTab)?.serviceType;
      const res = await apiClient.getDashboardOverview(serviceType);
      setData(res.data);
    } catch (err) {
      console.error('Failed to load dashboard overview:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchOverview(); }, [activeTab]);

  // Keeps the Overview stats and recent-requests feed current without
  // interrupting whatever tab/filter the admin currently has selected.
  useAutoRefresh(() => fetchOverview({ silent: true }), { intervalMs: 5000 });

  const { stats, category_breakdown, recent_requests, pending_actions } = data;

  return (
    <AdminLayout
      title={`${activeTab} Performance`}
      subtitle="Real-time updates on bookings and assignments."
      actions={
        <>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-colors">
            Download Report
          </button>
        </>
      }
    >
      {/* Dashboard Tabs */}
      <div className="flex space-x-1 bg-slate-200 p-1 rounded-xl mb-6 w-full sm:w-fit overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/50'
              }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Grid - Dynamic based on Tab */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label="New Bookings"
          value={stats.total_bookings}
          sub="This month"
          change={formatChange(stats.total_bookings_change)}
          icon={Calendar}
          color="blue"
          loading={loading}
        />
        <StatCard
          label="Active Requests"
          value={stats.active_requests}
          sub="Leads still in the pipeline"
          icon={Activity}
          color="amber"
          loading={loading}
        />
        <StatCard
          label="Available Staff"
          value={stats.available_staff}
          sub="Across all roles"
          icon={Users}
          color="emerald"
          loading={loading}
        />
        <StatCard
          label="Revenue (Monthly)"
          value={fmt(stats.monthly_revenue)}
          sub="Client payments this month"
          change={formatChange(stats.monthly_revenue_change)}
          icon={DollarSign}
          color="rose"
          loading={loading}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Bookings Feed (Priority View) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Recent Service Requests
            </h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="py-4 pl-6 pr-4">Service Type</th>
                    <th className="py-4 px-4">Client</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Received At</th>
                    <th className="py-4 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">Loading requests...</td>
                    </tr>
                  ) : recent_requests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">No recent service requests.</td>
                    </tr>
                  ) : (
                    recent_requests.map((req) => (
                      <BookingRow
                        key={req.request_id}
                        serviceType={req.service_type}
                        client={req.patient_name || req.payer_name || 'Unknown'}
                        status={req.status}
                        time={timeAgo(req.created_at)}
                        onDetails={() => navigate(`/admin/service-requests/${req.request_id}/summary`)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 text-center">
              <button
                onClick={() => navigate('/admin/service-requests')}
                className="text-blue-600 text-sm font-medium hover:underline"
              >
                View All Requests
              </button>
            </div>
          </div>
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-6">
          {/* System Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Category Status</h2>
            <div className="space-y-4">
              {loading ? (
                [1, 2, 3].map((i) => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)
              ) : (
                category_breakdown.map((cat) => (
                  <StatusItem
                    key={cat.key}
                    label={cat.label}
                    count={`${cat.active_count} active`}
                    color={CATEGORY_DOT_COLOR[cat.key] || CATEGORY_DOT_COLOR.OTHER}
                  />
                ))
              )}
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Pending Actions</h2>
            <div className="space-y-3">
              {loading ? (
                [1, 2].map((i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)
              ) : pending_actions.length === 0 ? (
                <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="font-medium">All caught up — no pending actions.</p>
                </div>
              ) : (
                pending_actions.map((action) => {
                  const meta = ACTION_META[action.type] || ACTION_META.STAFF_ADVANCE;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={action.type}
                      onClick={() => navigate(action.link)}
                      className={`w-full p-3 rounded-lg text-sm flex items-start gap-3 text-left hover:opacity-80 transition-opacity ${meta.classes}`}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">{action.label}</p>
                        <p className="text-xs opacity-80">{action.count} {action.description}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
};

// Sub-components

const StatCard = ({ label, value, sub, change, icon: Icon, color, loading }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };

  const trend = change ? (change.startsWith('-') ? 'down' : 'up') : null;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:-translate-y-1">
      <div className="flex justify-between items-start mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        {change && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend === 'up' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {change}
          </span>
        )}
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        {loading ? (
          <div className="h-8 w-20 bg-slate-100 rounded animate-pulse mt-1" />
        ) : (
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
        )}
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
};

const BookingRow = ({ serviceType, client, status, time, onDetails }) => {
  const { key, label } = normalizeServiceType(serviceType);

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="py-4 pl-6 pr-4">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${SERVICE_TYPE_BADGE[key]}`}>
          {label}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="font-medium text-slate-900">{client}</div>
      </td>
      <td className="py-4 px-4">
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold ${REQUEST_STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
          {REQUEST_STATUS_LABELS[status] || status}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-1.5 text-slate-500 font-medium text-sm group-hover:text-blue-600 transition-colors">
          <Clock className="w-4 h-4" />
          {time}
        </div>
      </td>
      <td className="py-4 px-4">
        <button onClick={onDetails} className="text-slate-400 hover:text-blue-600 font-medium text-sm">Details</button>
      </td>
    </tr>
  );
};

const StatusItem = ({ label, count, color }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
    <span className="text-xs font-bold text-slate-400">{count}</span>
  </div>
);

export default AdminDashboard;
