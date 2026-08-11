import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserCircle, ChevronRight, ChevronLeft, Loader2, Plus, Mars, Venus, Trash2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import useDebouncedValue from '../../../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

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

const GenderIcon = ({ gender }) => {
  const cfg = {
    MALE:   { Icon: Mars,  className: 'text-blue-500',   label: 'Male' },
    FEMALE: { Icon: Venus, className: 'text-pink-500',   label: 'Female' },
  }[gender?.toUpperCase()];

  if (!cfg) return null;

  const { Icon, className, label } = cfg;
  return <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${className}`} aria-label={label} title={label} />;
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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);
  const [pendingMigrationOnly, setPendingMigrationOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [counts, setCounts] = useState({ All: 0 });

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Reset back to page 1 whenever a filter/search changes underneath the current page.
  useEffect(() => { setPage(1); }, [activeTab, debouncedSearch, pendingMigrationOnly]);

  useEffect(() => { fetchWorkers(); }, [activeTab, debouncedSearch, pendingMigrationOnly, page]);

  // Clear selection whenever the underlying list changes to avoid acting on stale rows.
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab, debouncedSearch, pendingMigrationOnly, page]);

  const buildFilters = () => ({
    page,
    limit: PAGE_SIZE,
    ...(activeTab !== 'All' ? { status: activeTab } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(pendingMigrationOnly ? { pending_migration: 'true' } : {}),
  });

  const fetchWorkers = async ({ silent = false } = {}) => {
    // Only take over the whole page with the spinner on the very first load.
    // Later fetches (search/tab/page changes, auto-refresh) update in place so
    // the search input never unmounts and loses focus.
    const showSpinner = !silent && !hasLoadedOnce;
    try {
      if (showSpinner) setLoading(true);
      if (!silent) setError(null);
      const response = await apiClient.getAllStaff(buildFilters());
      setWorkers(response.data || []);
      setPagination(response.pagination || null);
      if (response.counts) setCounts(response.counts);
      setHasLoadedOnce(true);
    } catch (err) {
      if (!silent) setError('Failed to load staff');
      else console.error('StaffManagement silent refresh error:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useAutoRefresh(() => fetchWorkers({ silent: true }), { intervalMs: 5000 });

  const toggleSelectMode = () => {
    setSelectMode(v => !v);
    setSelectedIds(new Set());
  };

  const toggleSelect = (staffId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev =>
      prev.size === workers.length ? new Set() : new Set(workers.map(w => w.staff_profile_id))
    );
  };

  const openDeleteConfirm = () => {
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const closeDeleteConfirm = () => {
    if (deleteLoading) return;
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const handleDeleteConfirmed = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== 'confirm') return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map(id => apiClient.deleteStaffProfile(id)));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        setDeleteError(
          failed.length === ids.length
            ? (failed[0].reason?.message || 'Failed to delete selected staff member(s).')
            : `${failed.length} of ${ids.length} staff member(s) could not be deleted. They may have active bookings.`
        );
      }
      setSelectedIds(new Set());
      await fetchWorkers();
      if (failed.length === 0) {
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete selected staff member(s).');
    } finally {
      setDeleteLoading(false);
    }
  };

  const pendingMigrationCount = counts.pending_migration || 0;
  const totalCount = pagination?.total_count ?? workers.length;
  const totalPages = pagination?.total_pages ?? 1;
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(page * PAGE_SIZE, totalCount);

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
        <div className="flex items-center gap-2">
          {selectMode && selectedIds.size > 0 && (
            <button
              onClick={openDeleteConfirm}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button
            onClick={toggleSelectMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
              selectMode
                ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button
            onClick={() => navigate('/admin/proxy-user-management')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Staff
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
              {TAB_LABELS[tab]}
              <span className="ml-1.5 tabular-nums text-slate-400">{counts[tab] ?? 0}</span>
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
                {selectMode && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={workers.length > 0 && selectedIds.size === workers.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Gender</th>
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
              {workers.length === 0 ? (
                <tr>
                  <td colSpan={selectMode ? 10 : 9} className="text-center py-16 text-slate-400 text-sm">
                    No staff members match your filters.
                  </td>
                </tr>
              ) : workers.map(worker => (
                <tr
                  key={worker.staff_profile_id}
                  onClick={() => selectMode
                    ? toggleSelect(worker.staff_profile_id)
                    : navigate(`/admin/staff/${worker.staff_profile_id}/detail`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {/* Select */}
                  {selectMode && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(worker.staff_profile_id)}
                        onChange={() => toggleSelect(worker.staff_profile_id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  )}

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

                  {/* Gender */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <GenderIcon gender={worker.gender} />
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

        {workers.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            <span>
              Showing {rangeStart}-{rangeEnd} of {totalCount} staff member{totalCount !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!pagination?.has_prev}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={!pagination?.has_next}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={closeDeleteConfirm} />
          <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-1.5">
              Delete {selectedIds.size} staff member{selectedIds.size !== 1 ? 's' : ''}?
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              This permanently deletes the selected staff profile{selectedIds.size !== 1 ? 's' : ''} and login account{selectedIds.size !== 1 ? 's' : ''}.
              This action cannot be undone. Staff with active bookings cannot be deleted.
            </p>

            {deleteError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
                {deleteError}
              </div>
            )}

            <label className="block text-xs font-medium text-slate-600 mb-1">
              Type <span className="font-semibold text-slate-800">confirm</span> to proceed
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="confirm"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 bg-white text-slate-800 placeholder-slate-400 transition-colors"
            />

            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteLoading || deleteConfirmText.trim().toLowerCase() !== 'confirm'}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
};

export default StaffManagement;
