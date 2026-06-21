import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowLeftRight,
  UserPlus,
  Clock,
  Wallet,
  Search,
  Filter,
  PlayCircle,
  Ban,
  ExternalLink,
  ClipboardList,
} from 'lucide-react';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatMoney = (v) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(Number(v || 0));

const BUCKET_CONFIG = {
  NEEDS_ACTION: { label: 'Needs Action', badge: 'bg-red-100 text-red-800 border-red-200', stat: 'border-red-200 text-red-600' },
  OVERDUE: { label: 'Overdue', badge: 'bg-red-100 text-red-800 border-red-200', stat: 'border-red-200 text-red-600' },
  TODAY: { label: 'Today', badge: 'bg-orange-100 text-orange-800 border-orange-200', stat: 'border-orange-200 text-orange-600' },
  UPCOMING: { label: 'Next 7 Days', badge: 'bg-blue-100 text-blue-800 border-blue-200', stat: 'border-blue-200 text-blue-600' },
  LATER: { label: 'Later', badge: 'bg-slate-100 text-slate-700 border-slate-200', stat: 'border-slate-200 text-slate-500' },
};

const ACTION_TYPE_CONFIG = {
  TERMINATION: { label: 'Scheduled Termination', Icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  COMPLETION: { label: 'Scheduled Completion', Icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  STAFF_SWAP: { label: 'Scheduled Staff Swap', Icon: ArrowLeftRight, color: 'text-blue-600 bg-blue-50' },
  ASSIGNMENT_START: { label: 'Scheduled Assignment Start', Icon: UserPlus, color: 'text-blue-600 bg-blue-50' },
  PENDING_TERMINATION: { label: 'Awaiting Approval', Icon: Clock, color: 'text-amber-600 bg-amber-50' },
  NEGATIVE_BALANCE: { label: 'Negative Balance', Icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  EXPIRING_SOON: { label: 'Balance Expiring Soon', Icon: Wallet, color: 'text-amber-600 bg-amber-50' },
  ATTENDANCE_NEEDED: { label: 'Attendance Not Logged', Icon: ClipboardList, color: 'text-amber-600 bg-amber-50' },
};

const BucketBadge = ({ bucket }) => {
  const cfg = BUCKET_CONFIG[bucket] || BUCKET_CONFIG.LATER;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
};

const ActionTypeTag = ({ actionType }) => {
  const cfg = ACTION_TYPE_CONFIG[actionType] || { label: actionType, Icon: CalendarClock, color: 'text-slate-600 bg-slate-50' };
  const { Icon } = cfg;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium text-slate-700">{cfg.label}</span>
    </div>
  );
};

const UpcomingEvents = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bucketFilter, setBucketFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { event, mode: 'cancel' | 'execute' }

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getUpcomingEvents();
      setEvents(res.data || []);
    } catch (err) {
      console.error('Upcoming events fetch error:', err);
      setError(`Failed to fetch upcoming events: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const counts = useMemo(() => ({
    NEEDS_ACTION: events.filter((e) => e.due_bucket === 'NEEDS_ACTION' || e.due_bucket === 'OVERDUE').length,
    TODAY: events.filter((e) => e.due_bucket === 'TODAY').length,
    UPCOMING: events.filter((e) => e.due_bucket === 'UPCOMING').length,
    LATER: events.filter((e) => e.due_bucket === 'LATER').length,
  }), [events]);

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      !searchTerm ||
      e.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.booking_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.current_staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.incoming_staff_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBucket =
      bucketFilter === 'all' ||
      (bucketFilter === 'NEEDS_ACTION' ? (e.due_bucket === 'NEEDS_ACTION' || e.due_bucket === 'OVERDUE') : e.due_bucket === bucketFilter);

    return matchesSearch && matchesBucket;
  });

  const handleCancel = async (event) => {
    try {
      setBusyId(event.id);
      await apiClient.cancelScheduledAction(event.id);
      setConfirmAction(null);
      await fetchEvents();
    } catch (err) {
      console.error('Cancel scheduled action error:', err);
      alert(err.message || 'Failed to cancel scheduled action.');
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteNow = async (event) => {
    try {
      setBusyId(event.id);
      await apiClient.executeScheduledActionNow(event.id);
      setConfirmAction(null);
      await fetchEvents();
    } catch (err) {
      console.error('Execute scheduled action error:', err);
      alert(err.message || 'Failed to execute scheduled action.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Upcoming Events" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Upcoming Events" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-800 text-sm">{error}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Upcoming Events"
      subtitle={`${filteredEvents.length} item${filteredEvents.length !== 1 ? 's' : ''} — scheduled actions, pending approvals, and balance forecasts`}
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {([
          ['NEEDS_ACTION', 'Needs Action'],
          ['TODAY', 'Today'],
          ['UPCOMING', 'Next 7 Days'],
          ['LATER', 'Later'],
        ]).map(([key, label]) => {
          const cfg = BUCKET_CONFIG[key];
          const isActive = bucketFilter === key;
          return (
            <button
              key={key}
              onClick={() => setBucketFilter(isActive ? 'all' : key)}
              className={`bg-white rounded-lg border p-4 text-left transition-all hover:shadow-sm ${
                isActive ? `ring-2 ${cfg.stat} border-transparent` : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <p className={`text-3xl font-bold ${cfg.stat.split(' ')[1] || cfg.stat}`}>{counts[key]}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by client, care profile, staff, or booking code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={bucketFilter}
            onChange={(e) => setBucketFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All</option>
            <option value="NEEDS_ACTION">Needs Action</option>
            <option value="TODAY">Today</option>
            <option value="UPCOMING">Next 7 Days</option>
            <option value="LATER">Later</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CalendarClock className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 text-sm">No upcoming events found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Event', 'Booking', 'Client & Care Profile', 'Staff', 'Effective Date', 'Status', ''].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((event) => (
                  <tr key={`${event.source}-${event.id}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <ActionTypeTag actionType={event.action_type} />
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/admin/bookings/${event.booking_id}/v2`)}
                        className="text-sm font-semibold font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        {event.booking_code || event.booking_id}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-slate-900">{event.client_name || '—'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{event.patient_name || '—'}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {event.incoming_staff_name ? (
                        <span>
                          {event.current_staff_name || 'Unassigned'} <span className="text-slate-400">→</span>{' '}
                          <span className="font-medium">{event.incoming_staff_name}</span>
                        </span>
                      ) : (
                        event.current_staff_name || '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {event.effective_date ? (
                        fmt(event.effective_date)
                      ) : event.source === 'PREDICTION' ? (
                        <span className={event.action_type === 'NEGATIVE_BALANCE' ? 'text-red-600 font-medium' : 'text-amber-600'}>
                          {event.action_type === 'NEGATIVE_BALANCE'
                            ? `Owes ${formatMoney(Math.abs(event.remaining_balance))}`
                            : `~${event.balance_days_remaining} day(s) left`}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <BucketBadge bucket={event.due_bucket} />
                    </td>
                    <td className="px-6 py-4 text-right pr-6">
                      {event.source === 'SCHEDULED_ACTION' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={busyId === event.id}
                            onClick={() => setConfirmAction({ event, mode: 'execute' })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            title="Execute now"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            Execute
                          </button>
                          <button
                            disabled={busyId === event.id}
                            onClick={() => setConfirmAction({ event, mode: 'cancel' })}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                            title="Cancel"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </div>
                      )}
                      {event.source === 'PENDING_APPROVAL' && (
                        <button
                          onClick={() => navigate('/admin/termination-requests')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          Review Request
                        </button>
                      )}
                      {event.source === 'ATTENDANCE' && (
                        <button
                          onClick={() => navigate(`/admin/bookings/${event.booking_id}/v2`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          Log Attendance
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">
                {confirmAction.mode === 'cancel' ? 'Cancel Scheduled Action?' : 'Execute Now?'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {ACTION_TYPE_CONFIG[confirmAction.event.action_type]?.label} for {confirmAction.event.client_name} ({confirmAction.event.booking_code || confirmAction.event.booking_id})
              </p>
            </div>
            <div className="px-6 py-5 text-sm text-slate-700">
              {confirmAction.mode === 'cancel'
                ? 'This will cancel the scheduled action and revert any reservations made for it. This cannot be undone.'
                : `This will run the action immediately instead of waiting for ${fmt(confirmAction.event.effective_date)}.`}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => (confirmAction.mode === 'cancel' ? handleCancel(confirmAction.event) : handleExecuteNow(confirmAction.event))}
                disabled={busyId === confirmAction.event.id}
                className={`inline-flex items-center gap-2 px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                  confirmAction.mode === 'cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {busyId === confirmAction.event.id ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : confirmAction.mode === 'cancel' ? (
                  <Ban className="w-4 h-4" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default UpcomingEvents;
