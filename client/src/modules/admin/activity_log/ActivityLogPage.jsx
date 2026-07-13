import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';

const ACTION_TYPE_OPTIONS = [
  'CHANGE_REQUEST_SUBMITTED',
  'CHANGE_REQUEST_CLAIMED',
  'CHANGE_REQUEST_APPROVED',
  'CHANGE_REQUEST_REJECTED',
  'CLIENT_PAYMENT_RECORDED',
  'MANUAL_TRANSACTION_ADDED',
  'BANK_ACCOUNT_CREATED',
  'BANK_ACCOUNT_UPDATED',
  'BANK_ACCOUNT_DEACTIVATED',
  'STAFF_ASSIGNED',
  'ASSIGNMENT_UPDATED',
  'ASSIGNMENT_COMPLETED',
  'TERMINATION_APPROVED',
];

const ROLE_DOT = {
  SUPER_ADMIN: 'bg-violet-500',
  COORDINATOR: 'bg-blue-400',
  ACCOUNTS:    'bg-teal-500',
};

const ACTION_DOT = {
  CHANGE_REQUEST_SUBMITTED:  'bg-slate-400',
  CHANGE_REQUEST_CLAIMED:    'bg-blue-400',
  CHANGE_REQUEST_APPROVED:   'bg-emerald-500',
  CHANGE_REQUEST_REJECTED:   'bg-red-400',
  CLIENT_PAYMENT_RECORDED:   'bg-emerald-500',
  MANUAL_TRANSACTION_ADDED:  'bg-amber-400',
  BANK_ACCOUNT_CREATED:      'bg-indigo-400',
  BANK_ACCOUNT_UPDATED:      'bg-cyan-500',
  BANK_ACCOUNT_DEACTIVATED:  'bg-red-400',
  STAFF_ASSIGNED:            'bg-teal-500',
  ASSIGNMENT_UPDATED:        'bg-sky-400',
  ASSIGNMENT_COMPLETED:      'bg-emerald-500',
  TERMINATION_APPROVED:      'bg-orange-400',
};

const Tag = ({ label, dot }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot || 'bg-slate-400'}`} />
    {label}
  </span>
);

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors';

// Renders a log's `details` JSONB payload as a plain field/value table instead
// of a raw JSON dump — mirrors the DiffDisplay pattern on the change-requests page.
const DetailsTable = ({ details }) => {
  let value = details;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return <p className="text-xs text-slate-400 italic">{details}</p>; }
  }
  if (value === null || typeof value !== 'object') {
    return <p className="text-xs text-slate-400 italic">{String(value ?? '—')}</p>;
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  if (entries.length === 0) return <p className="text-xs text-slate-400 italic">No details recorded.</p>;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td className="px-3 py-2 w-1/3 align-top font-medium text-slate-500 capitalize">{key.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-slate-800 break-all">
                {val === null || val === undefined || val === '' ? (
                  <span className="text-slate-300">—</span>
                ) : typeof val === 'object' ? (
                  <pre className="whitespace-pre-wrap text-[11px] text-slate-600">{JSON.stringify(val, null, 2)}</pre>
                ) : (
                  String(val)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ActivityLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50 });

  const [actionType, setActionType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchLogs = useCallback(async (page = 1, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (actionType) params.action_type = actionType;
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = new Date(toDate + 'T23:59:59').toISOString();

      const res = await apiClient.getActivityLog(params);
      setLogs(res.data || []);
      setPagination(res.pagination || { total: 0, page, limit: 50 });
    } catch (err) {
      console.error('ActivityLog fetch error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [actionType, fromDate, toDate]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  // The log is a live audit trail — keep the current page current in the background.
  useAutoRefresh(() => fetchLogs(pagination.page, { silent: true }), { intervalMs: 5000 });

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  const handleApply = () => fetchLogs(1);

  const handleClear = () => {
    setActionType('');
    setFromDate('');
    setToDate('');
  };

  const hasFilters = actionType || fromDate || toDate;

  return (
    <AdminLayout
      title="Activity Log"
      subtitle={`${pagination.total} total entries`}
    >
      {/* Filters — flat inline toolbar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-56">
          <label className="block text-xs font-medium text-slate-600 mb-1">Action Type</label>
          <select value={actionType} onChange={e => setActionType(e.target.value)} className={inputCls}>
            <option value="">All Actions</option>
            {ACTION_TYPE_OPTIONS.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <button onClick={handleApply} className={primaryBtnCls}>Apply</button>
          {hasFilters && <button onClick={handleClear} className={ghostBtnCls}>Clear</button>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-slate-400">Loading activity…</div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <History className="w-8 h-8 text-slate-200" />
            <p className="text-sm text-slate-400">No activity log entries found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actor</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Entity</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map(log => {
                    const isExpanded = expandedRow === log.log_id;
                    return (
                      <React.Fragment key={log.log_id}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedRow(isExpanded ? null : log.log_id)}
                        >
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(log.created_at)}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{log.actor_name}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><Tag label={log.actor_role} dot={ROLE_DOT[log.actor_role]} /></td>
                          <td className="px-4 py-3 whitespace-nowrap"><Tag label={log.action_type.replace(/_/g, ' ')} dot={ACTION_DOT[log.action_type]} /></td>
                          <td className="px-4 py-3 text-slate-500">
                            {log.entity_type ? log.entity_type.replace(/_/g, ' ').toUpperCase() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {log.details && (
                              <ChevronDown className={`w-4 h-4 text-slate-300 ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            )}
                          </td>
                        </tr>
                        {isExpanded && log.details && (
                          <tr className="bg-slate-50">
                            <td colSpan={6} className="px-4 py-3">
                              <DetailsTable details={log.details} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                Showing {logs.length} of {pagination.total} entries
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs text-slate-500 px-2">Page {pagination.page} of {totalPages}</span>
                <button
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= totalPages}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default ActivityLogPage;
