import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCircle, ChevronRight, Loader2, Plus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

const ROLE_LABELS = {
  CARETAKER: 'Caretaker',
  NURSING_ASSISTANT: 'Nursing Assistant',
  NURSE: 'Nurse',
  PHYSIOTHERAPIST: 'Physiotherapist',
  NANNY: 'Nanny',
  COUNSELLOR: 'Counsellor',
};

const STATUS_TABS = ['All', 'available', 'unavailable', 'assigned'];

const TAB_LABELS = {
  All: 'All',
  available: 'Available',
  unavailable: 'Unavailable',
  assigned: 'On Assignment',
};

function parseRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.replace(/^\{|\}$/g, '').split(',').map(r => r.trim()).filter(Boolean);
}

function formatRoles(raw) {
  return parseRoles(raw).map(r => ROLE_LABELS[r] || r.replace(/_/g, ' ')).join(', ') || '—';
}

const StatusDot = ({ status }) => {
  const cfg = {
    available:   { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Available' },
    unavailable: { dot: 'bg-slate-400',   text: 'text-slate-500',   label: 'Unavailable' },
    assigned:    { dot: 'bg-blue-500',    text: 'text-blue-700',    label: 'On Assignment' },
  }[status?.toLowerCase()] ?? { dot: 'bg-slate-300', text: 'text-slate-500', label: status ?? '—' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const DocsStatusDot = ({ worker }) => {
  const submitted = !!(worker.grama_niladhari_url && worker.police_report_url);
  const cfg = submitted
    ? { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Documents Submitted' }
    : { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Documents Pending' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const StaffManagement = () => {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [pendingMigrationOnly, setPendingMigrationOnly] = useState(false);

  useEffect(() => { fetchWorkers(); }, []);

  const fetchWorkers = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      // The API paginates (a single request caps out at PAGE_SIZE rows), so once the
      // staff roster grows past that we have to walk every page to show everyone —
      // otherwise the list silently truncates at the first page's worth of records.
      const PAGE_SIZE = 1000;
      const first = await apiClient.getAllStaff({ limit: PAGE_SIZE, page: 1 });
      let all = first.data || [];
      const totalPages = first.pagination?.total_pages || 1;

      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            apiClient.getAllStaff({ limit: PAGE_SIZE, page: i + 2 }),
          ),
        );
        remainingPages.forEach((res) => { all = all.concat(res.data || []); });
      }

      setWorkers(all);
    } catch (err) {
      if (!silent) setError('Failed to load staff');
      else console.error('StaffManagement silent refresh error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useAutoRefresh(() => fetchWorkers({ silent: true }), { intervalMs: 5000 });

  const pendingMigrationCount = workers.filter(w => w.onboarding_status === 'PENDING_MIGRATION').length;

  const filtered = workers.filter(w => {
    const status = (w.current_status || '').toLowerCase();
    const matchTab = activeTab === 'All' || status === activeTab;
    const matchPendingMigration = !pendingMigrationOnly || w.onboarding_status === 'PENDING_MIGRATION';
    const q = search.toLowerCase();
    const matchSearch = !q || [w.full_name, w.email, w.mobile_number, w.staff_code, w.location]
      .some(v => v?.toLowerCase().includes(q));
    return matchTab && matchPendingMigration && matchSearch;
  });

  const counts = STATUS_TABS.reduce((acc, t) => {
    acc[t] = t === 'All'
      ? workers.length
      : workers.filter(w => (w.current_status || '').toLowerCase() === t).length;
    return acc;
  }, {});

  if (loading) {
    return (
      <AdminLayout title="Staff Management" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Staff Management">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Staff Management"
      subtitle="View and manage all active staff members."
      actions={
        <button
          onClick={() => navigate('/admin/proxy-user-management')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
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
              {TAB_LABELS[tab]}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[tab]}</span>
            </button>
          ))}
        </div>

        {pendingMigrationCount > 0 && (
          <button
            onClick={() => setPendingMigrationOnly(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
              pendingMigrationOnly
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
          >
            Pending Migration <span className="ml-1 tabular-nums">{pendingMigrationCount}</span>
          </button>
        )}

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, code…"
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Compliance Docs</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Earnings</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400 text-sm">
                    No staff members match your filters.
                  </td>
                </tr>
              ) : filtered.map(worker => (
                <tr
                  key={worker.staff_profile_id}
                  onClick={() => navigate(`/admin/staff/${worker.staff_profile_id}/detail`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {/* Staff */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-[180px]">
                      {worker.profile_picture_url ? (
                        <img src={worker.profile_picture_url} alt={worker.full_name}
                          className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-slate-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200">
                          <UserCircle className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-slate-900 leading-tight">{worker.full_name ?? '—'}</p>
                        {worker.staff_code && (
                          <p className="text-xs text-slate-400 font-mono">{worker.staff_code}</p>
                        )}
                        {worker.onboarding_status === 'PENDING_MIGRATION' && (
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            Pending Migration
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{worker.mobile_number ?? '—'}</p>
                    <p className="text-xs text-slate-400">{worker.email ?? '—'}</p>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    <span className="text-slate-700">{formatRoles(worker.role || worker.designation)}</span>
                  </td>

                  {/* Location */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-600">{worker.location ?? worker.home_address ?? '—'}</span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusDot status={worker.current_status} />
                  </td>

                  {/* Compliance Docs */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DocsStatusDot worker={worker} />
                  </td>

                  {/* Current Earnings */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-slate-700 font-medium">
                      Rs. {parseFloat(worker.current_earnings || 0).toLocaleString('en-IN')}
                    </span>
                  </td>

                  {/* Arrow */}
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {filtered.length} of {workers.length} staff member{workers.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

    </AdminLayout>
  );
};

export default StaffManagement;
