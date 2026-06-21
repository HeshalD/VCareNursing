import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search, Filter } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

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

const ROLE_COLORS = {
  SUPER_ADMIN:  'bg-purple-100 text-purple-700',
  COORDINATOR:  'bg-blue-100 text-blue-700',
  ACCOUNTS:     'bg-teal-100 text-teal-700',
};

const ACTION_COLORS = {
  CHANGE_REQUEST_SUBMITTED:  'bg-slate-100 text-slate-700',
  CHANGE_REQUEST_CLAIMED:    'bg-blue-100 text-blue-700',
  CHANGE_REQUEST_APPROVED:   'bg-green-100 text-green-700',
  CHANGE_REQUEST_REJECTED:   'bg-red-100 text-red-700',
  CLIENT_PAYMENT_RECORDED:   'bg-emerald-100 text-emerald-700',
  MANUAL_TRANSACTION_ADDED:  'bg-amber-100 text-amber-700',
  BANK_ACCOUNT_CREATED:      'bg-indigo-100 text-indigo-700',
  BANK_ACCOUNT_UPDATED:      'bg-cyan-100 text-cyan-700',
  BANK_ACCOUNT_DEACTIVATED:  'bg-rose-100 text-rose-700',
  STAFF_ASSIGNED:            'bg-teal-100 text-teal-700',
  ASSIGNMENT_UPDATED:        'bg-sky-100 text-sky-700',
  ASSIGNMENT_COMPLETED:      'bg-green-100 text-green-700',
  TERMINATION_APPROVED:      'bg-orange-100 text-orange-700',
};

const fmt = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const ActivityLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50 });

  const [actionType, setActionType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [actionType, fromDate, toDate]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));

  const handleApply = () => fetchLogs(1);

  const handleClear = () => {
    setActionType('');
    setFromDate('');
    setToDate('');
  };

  return (
    <AdminLayout
      title="Activity Log"
      subtitle={`${pagination.total} total entries`}
    >
      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Action Type</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={actionType}
                onChange={e => setActionType(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
              >
                <option value="">All Actions</option>
                {ACTION_TYPE_OPTIONS.map(a => (
                  <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">To</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <History className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No activity log entries found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['Timestamp', 'Actor', 'Role', 'Action', 'Entity', ''].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map(log => {
                    const isExpanded = expandedRow === log.log_id;
                    const actionCls = ACTION_COLORS[log.action_type] || 'bg-slate-100 text-slate-700';
                    const roleCls = ROLE_COLORS[log.actor_role] || 'bg-slate-100 text-slate-700';

                    return (
                      <React.Fragment key={log.log_id}>
                        <tr
                          className="hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : log.log_id)}
                        >
                          <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">{fmt(log.created_at)}</td>
                          <td className="px-6 py-3">
                            <p className="text-sm font-semibold text-slate-900">{log.actor_name}</p>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleCls}`}>
                              {log.actor_role}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${actionCls}`}>
                              {log.action_type.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-slate-500">
                            {log.entity_type ? (
                              <span>{log.entity_type.replace(/_/g, ' ')}</span>
                            ) : '—'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {log.details
                              ? isExpanded
                                ? <ChevronUp className="w-4 h-4 text-slate-400 inline" />
                                : <ChevronDown className="w-4 h-4 text-slate-400 inline" />
                              : null}
                          </td>
                        </tr>
                        {isExpanded && log.details && (
                          <tr className="bg-slate-50">
                            <td colSpan={6} className="px-6 py-3">
                              <pre className="text-xs text-slate-600 bg-white rounded border border-slate-200 p-3 overflow-auto max-h-40 whitespace-pre-wrap">
                                {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                              </pre>
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
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {logs.length} of {pagination.total} entries
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-slate-700 font-medium px-2">
                  Page {pagination.page} of {totalPages}
                </span>
                <button
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
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
