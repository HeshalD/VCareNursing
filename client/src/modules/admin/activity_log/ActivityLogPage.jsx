import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import useAutoRefresh from '../../../hooks/useAutoRefresh';
import DateInput from '../../../components/common/DateInput';

// Every action_type string any backend controller currently emits via logActivity().
// Keep alphabetized — this list is also what powers "Action Type" filtering.
const ACTION_TYPE_OPTIONS = [
  'ADVANCE_APPROVED',
  'ADVANCE_REJECTED',
  'ADVANCE_THRESHOLD_UPDATED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_AGREEMENT_SENT',
  'APPLICATION_REJECTED',
  'APPLICATION_UPDATED',
  'ASSIGNMENT_COMPLETED',
  'ASSIGNMENT_UPDATED',
  'ATTENDANCE_RECORDED',
  'BANK_ACCOUNT_CREATED',
  'BANK_ACCOUNT_DEACTIVATED',
  'BANK_ACCOUNT_UPDATED',
  'BOOKING_COMPLETED',
  'BOOKING_CREATED',
  'BOOKING_MARKED_OVERDUE',
  'BOOKING_NOTE_ADDED',
  'BOOKING_NOTE_DELETED',
  'BOOKING_NOTE_UPDATED',
  'BOOKING_OVERDUE_RESOLVED',
  'BOOKING_PAUSED',
  'BOOKING_PAYMENT_RECORDED',
  'BOOKING_RESUMED',
  'BOOKING_TERMINATED',
  'BULK_IMPORT_COMMITTED',
  'CANDIDATE_PROFILE_SENT',
  'CHANGE_REQUEST_APPROVED',
  'CHANGE_REQUEST_CLAIMED',
  'CHANGE_REQUEST_REJECTED',
  'CHANGE_REQUEST_SUBMITTED',
  'CLIENT_ACCOUNT_DEACTIVATED',
  'CLIENT_ACCOUNT_REACTIVATED',
  'CLIENT_BILLING_UPDATED',
  'CLIENT_NOTE_ADDED',
  'CLIENT_NOTE_DELETED',
  'CLIENT_NOTE_UPDATED',
  'CLIENT_PAYMENT_RECORDED',
  'CLIENT_PROFILE_CREATED',
  'CLIENT_PROFILE_UPDATED',
  'CLIENT_SALESPERSON_CREDITED',
  'CLIENT_SALESPERSON_SWITCHED',
  'DAILY_INVOICE_CONFIRMED',
  'DAILY_INVOICE_RESENT',
  'DAILY_INVOICE_SKIPPED',
  'DEDUCTION_APPLIED',
  'DEPOSIT_FORFEITED',
  'DEPOSIT_REFUNDED',
  'DEVICE_ASSIGNED',
  'DEVICE_REVOKED',
  'DOC_REQUEST_SENT',
  'FUNDS_TRANSFERRED',
  'INTERNAL_STAFF_CREATED',
  'INTERNAL_STAFF_REMOVED',
  'INTERNAL_STAFF_UPDATED',
  'INVOICE_SENT',
  'INVOICING_MODE_UPDATED',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'MANUAL_TRANSACTION_ADDED',
  'PATIENT_CREATED',
  'PATIENT_DELETED',
  'PATIENT_UPDATED',
  'PAYMENT_RECEIPT_SENT',
  'PAYMENT_REJECTED',
  'PAYMENT_VERIFIED',
  'PERMISSIONS_UPDATED',
  'PETTY_CASH_TRANSACTION_ADDED',
  'PRESET_ITEM_CREATED',
  'PRESET_ITEM_DELETED',
  'PRESET_ITEM_UPDATED',
  'PRODUCT_CREATED',
  'PRODUCT_DEACTIVATED',
  'PRODUCT_INTEREST_SUBMITTED',
  'PRODUCT_INVOICE_CREATED',
  'PRODUCT_INVOICE_RESENT',
  'PRODUCT_QUOTATION_ACCEPTED',
  'PRODUCT_QUOTATION_SENT',
  'PRODUCT_UPDATED',
  'QUOTATION_CREATED',
  'QUOTATION_SENT',
  'QUOTATION_UPDATED',
  'QUOTE_PAYMENT_ALLOCATED',
  'QUOTE_PAYMENT_RECORDED',
  'RECRUITER_CREDITED',
  'RECRUITER_SWITCHED',
  'REG_FEE_INVOICE_RESENT',
  'REG_FEE_INVOICE_SENT',
  'REG_FEE_MEMBERSHIP_EXPIRED',
  'REG_FEE_PAYMENT_VERIFIED',
  'REG_FEE_RECEIPT_UPLOADED_BY_ADMIN',
  'REG_FEE_STATUS_UPDATED',
  'RENTAL_AGREEMENT_CREATED',
  'RENTAL_UNIT_RETURNED',
  'REVIEW_ADDED_BY_ADMIN',
  'REVIEW_REQUEST_SENT',
  'REVIEW_VISIBILITY_TOGGLED',
  'SALARY_EXPORT_DOWNLOADED',
  'SALARY_SHEET_NOTIFICATION_SENT',
  'SALESPERSON_CREDITED',
  'SALESPERSON_SWITCHED',
  'SCHEDULED_ACTION_CANCELLED',
  'SERVICE_REQUEST_CREATED',
  'SERVICE_REQUEST_UPDATED',
  'SESSION_FORCE_LOGOUT',
  'SHIFT_INVOICE_CONFIRMED',
  'SHIFT_INVOICE_SKIPPED',
  'SHIFT_OCCURRENCE_RESCHEDULED',
  'SHIFT_OCCURRENCE_WAIVED',
  'SHIFT_PATTERN_CHANGED',
  'SHIFT_PATTERN_CHANGE_SCHEDULED',
  'SHIFT_RESCHEDULE_CANCELLED',
  'SHIFT_STAFF_ASSIGNED',
  'SHIFT_STAFF_REASSIGNED',
  'STAFF_ACCOUNT_DEACTIVATED',
  'STAFF_ACCOUNT_REACTIVATED',
  'STAFF_ASSIGNED',
  'STAFF_BANK_ACCOUNT_CREATED',
  'STAFF_BANK_ACCOUNT_DELETED',
  'STAFF_BANK_ACCOUNT_UPDATED',
  'STAFF_MARKED_ABSENT',
  'STAFF_PAYOUT_CREATED',
  'STAFF_PROFILE_CREATED',
  'STAFF_PROFILE_UPDATED',
  'STAFF_SALARY_CONFIRMED',
  'STAFF_SALARY_SKIPPED',
  'STAFF_SWAPPED',
  'STATEMENT_DELETED',
  'STATEMENT_DOWNLOADED',
  'STATEMENT_GENERATED',
  'STATEMENT_SENT_WHATSAPP',
  'TERMINATION_APPROVED',
  'TERMINATION_REJECTED',
  'VENDOR_BILL_CREATED',
  'VENDOR_BILL_PAYMENT_RECORDED',
  'VENDOR_CREATED',
  'VENDOR_DEACTIVATED',
  'VENDOR_UPDATED',
  'WALLET_BOOKING_PAYOFF',
];

const ROLE_DOT = {
  SUPER_ADMIN: 'bg-violet-500',
  COORDINATOR: 'bg-blue-400',
  ACCOUNTS:    'bg-teal-500',
};

// Action types are too numerous (~130) to hand-color one by one, and new ones get
// added as controllers grow — so color is derived from the verb at the end of the
// action_type instead of a lookup table, and stays correct without upkeep.
const dotForAction = (actionType) => {
  if (!actionType) return 'bg-slate-400';
  if (/(REJECTED|DELETED|DEACTIVATED|REVOKED|CANCELLED|SKIPPED|ABSENT|FORFEITED|REMOVED)$/.test(actionType)) {
    return 'bg-red-400';
  }
  if (/(CREATED|ADDED|APPROVED|CONFIRMED|ACCEPTED|CREDITED|VERIFIED|COMPLETED|RECORDED|ASSIGNED|REACTIVATED)$/.test(actionType)) {
    return 'bg-emerald-500';
  }
  if (/(SENT|RESENT|DOWNLOADED|GENERATED)$/.test(actionType)) {
    return 'bg-blue-400';
  }
  if (/(UPDATED|CHANGED|REASSIGNED|SWAPPED|RESCHEDULED|TOGGLED|SWITCHED|SUBMITTED|CLAIMED|ALLOCATED|OVERDUE)$/.test(actionType)) {
    return 'bg-cyan-500';
  }
  if (/(PAUSED|RESOLVED|APPLIED)$/.test(actionType)) {
    return 'bg-amber-400';
  }
  return 'bg-slate-400';
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
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)} className={inputCls} />
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
                          <td className="px-4 py-3 whitespace-nowrap"><Tag label={log.action_type.replace(/_/g, ' ')} dot={dotForAction(log.action_type)} /></td>
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
