import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import {
  CalendarClock,
  AlertTriangle,
  CheckCircle,
  ArrowLeftRight,
  UserPlus,
  Clock,
  Wallet,
  Search,
  Ban,
  ExternalLink,
  ClipboardList,
  CalendarOff,
  Loader2,
  X,
  Info,
} from 'lucide-react';

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatMoney = (v) =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 }).format(Number(v || 0));

const BUCKET_CONFIG = {
  NEEDS_ACTION: { label: 'Needs Action', dot: 'bg-red-500',    text: 'text-red-700' },
  OVERDUE:      { label: 'Overdue',      dot: 'bg-red-500',    text: 'text-red-700' },
  TODAY:        { label: 'Today',        dot: 'bg-orange-400', text: 'text-orange-700' },
  UPCOMING:     { label: 'Next 7 Days',  dot: 'bg-blue-400',   text: 'text-blue-700' },
  LATER:        { label: 'Later',        dot: 'bg-slate-400',  text: 'text-slate-600' },
};

const ACTION_TYPE_CONFIG = {
  TERMINATION: { label: 'Scheduled Termination', Icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  COMPLETION: { label: 'Scheduled Completion', Icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  STAFF_SWAP: { label: 'Scheduled Staff Swap', Icon: ArrowLeftRight, color: 'text-blue-600 bg-blue-50' },
  ASSIGNMENT_START: { label: 'Scheduled Assignment Start', Icon: UserPlus, color: 'text-blue-600 bg-blue-50' },
  PENDING_TERMINATION: { label: 'Termination Approval', Icon: Clock, color: 'text-amber-600 bg-amber-50' },
  NEGATIVE_BALANCE: { label: 'Negative Balance', Icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  EXPIRING_SOON: { label: 'Balance Expiring Soon', Icon: Wallet, color: 'text-amber-600 bg-amber-50' },
  ATTENDANCE_NEEDED: { label: 'Attendance Not Logged', Icon: ClipboardList, color: 'text-amber-600 bg-amber-50' },
  PENDING_LEAVE: { label: 'Leave Request', Icon: CalendarOff, color: 'text-amber-600 bg-amber-50' },
};

const URGENCY_CONFIG = {
  IMMEDIATE: { label: 'Immediate', color: 'bg-red-50 text-red-700' },
  TODAY:     { label: 'Today',     color: 'bg-orange-50 text-orange-700' },
  FUTURE:    { label: 'Future',    color: 'bg-slate-100 text-slate-600' },
};

// Sources where a human decision genuinely blocks progress — these won't
// resolve themselves. Everything else (self-executing scheduled actions,
// balance forecasts) is informational.
const NEEDS_ACTION_SOURCES = ['PENDING_APPROVAL', 'ATTENDANCE', 'PENDING_LEAVE'];

const BucketBadge = ({ bucket }) => {
  const cfg = BUCKET_CONFIG[bucket] || BUCKET_CONFIG.LATER;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const ActionTypeTag = ({ actionType }) => {
  const cfg = ACTION_TYPE_CONFIG[actionType] || { label: actionType, Icon: CalendarClock, color: 'text-slate-600 bg-slate-50' };
  const { Icon } = cfg;
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-medium text-slate-700">{cfg.label}</span>
    </div>
  );
};

// Small label:value pair used to lay out an event's supporting details
// directly in its row — the point is the admin shouldn't need to click
// through just to see enough to decide whether/how to act.
const Detail = ({ label, value, tone = 'text-slate-700' }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className={`text-xs ${tone} truncate`}>{value}</div>
    </div>
  );
};

const UrgencyPill = ({ urgency }) => {
  const cfg = URGENCY_CONFIG[urgency];
  if (!cfg) return null;
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>;
};

const BookingLink = ({ event, navigate }) =>
  event.booking_id ? (
    <button
      onClick={() => navigate(`/admin/bookings/${event.booking_id}/v2`)}
      className="font-semibold font-mono text-blue-600 hover:underline inline-flex items-center gap-1"
    >
      {event.booking_code || event.booking_id}
      <ExternalLink className="w-3 h-3" />
    </button>
  ) : (
    <span className="text-slate-400">—</span>
  );

const UpcomingEvents = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // event pending a cancel confirmation

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

  const matchesSearch = (e) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      e.client_name?.toLowerCase().includes(q) ||
      e.patient_name?.toLowerCase().includes(q) ||
      e.booking_code?.toLowerCase().includes(q) ||
      e.current_staff_name?.toLowerCase().includes(q) ||
      e.incoming_staff_name?.toLowerCase().includes(q)
    );
  };

  const filtered = events.filter(matchesSearch);
  const needsAction = filtered.filter((e) => NEEDS_ACTION_SOURCES.includes(e.source));
  const informational = filtered.filter((e) => !NEEDS_ACTION_SOURCES.includes(e.source));

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

  if (loading) {
    return (
      <AdminLayout title="Upcoming Events" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Upcoming Events">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Upcoming Events"
      subtitle="Scheduled actions, pending approvals, and balance forecasts."
    >
      {/* Search */}
      <div className="flex justify-end mb-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by client, staff, or booking…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Needs Action ─────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-red-50/40">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-900">Needs Action</h2>
            <span className="text-xs font-medium text-slate-400">— a person has to decide or log something before this can move forward</span>
            <span className="ml-auto text-xs font-semibold text-red-700 bg-red-100 rounded-full px-2 py-0.5">{needsAction.length}</span>
          </div>

          {needsAction.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Nothing needs your attention right now.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {needsAction.map((event) => (
                <div key={`${event.source}-${event.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className="w-56 shrink-0">
                    <ActionTypeTag actionType={event.action_type} />
                  </div>

                  <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                    {event.source === 'PENDING_APPROVAL' && (
                      <>
                        <Detail label="Booking" value={<BookingLink event={event} navigate={navigate} />} />
                        <Detail label="Client / Care Profile" value={`${event.client_name || '—'} · ${event.patient_name || '—'}`} />
                        <Detail
                          label="Requested End Date"
                          value={fmt(event.effective_date)}
                          tone="text-red-600 font-medium"
                        />
                        <Detail label="Urgency" value={<UrgencyPill urgency={event.urgency} />} />
                        <Detail label="Reason" value={event.reason} />
                        <Detail label="Requested On" value={fmt(event.created_at)} />
                      </>
                    )}

                    {event.source === 'PENDING_LEAVE' && (
                      <>
                        <Detail label="Staff" value={`${event.current_staff_name || '—'}${event.staff_code ? ` (${event.staff_code})` : ''}`} />
                        <Detail label="Leave Period" value={`${fmt(event.start_date)} → ${fmt(event.end_date)}`} tone="font-medium" />
                        <Detail label="Reason" value={event.reason} />
                        <Detail label="Requested On" value={fmt(event.created_at)} />
                      </>
                    )}

                    {event.source === 'ATTENDANCE' && (
                      <>
                        <Detail label="Booking" value={<BookingLink event={event} navigate={navigate} />} />
                        <Detail label="Client / Care Profile" value={`${event.client_name || '—'} · ${event.patient_name || '—'}`} />
                        <Detail label="Staff" value={event.current_staff_name} />
                        <Detail label="Date" value={fmt(event.effective_date)} tone="font-medium" />
                      </>
                    )}
                  </div>

                  <div className="w-40 shrink-0 flex justify-end">
                    {event.source === 'PENDING_APPROVAL' && (
                      <button
                        onClick={() => navigate('/admin/termination-requests')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
                      >
                        Review Request
                      </button>
                    )}
                    {event.source === 'ATTENDANCE' && (
                      <button
                        onClick={() => navigate(`/admin/bookings/${event.booking_id}/v2`)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        Log Attendance
                      </button>
                    )}
                    {event.source === 'PENDING_LEAVE' && (
                      <button
                        onClick={() => navigate('/admin/leave-requests')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-slate-200 rounded-lg hover:bg-amber-50 hover:border-amber-200 transition-colors"
                      >
                        <CalendarOff className="w-3.5 h-3.5" />
                        Review Request
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Informational ────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
            <Info className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900">Informational</h2>
            <span className="text-xs font-medium text-slate-400">— these resolve on their own or are forecasts; act only if you want to override</span>
            <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{informational.length}</span>
          </div>

          {informational.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No informational events.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    {['Event', 'Booking', 'Client & Care Profile', 'Staff', 'Effective Date', 'Status', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {informational.map((event) => (
                    <tr key={`${event.source}-${event.id}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <ActionTypeTag actionType={event.action_type} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <BookingLink event={event} navigate={navigate} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 leading-tight">{event.client_name || '—'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{event.patient_name || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {event.incoming_staff_name ? (
                          <span>
                            {event.current_staff_name || 'Unassigned'} <span className="text-slate-400">→</span>{' '}
                            <span className="font-medium">{event.incoming_staff_name}</span>
                          </span>
                        ) : (
                          event.current_staff_name || '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
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
                      <td className="px-4 py-3 whitespace-nowrap">
                        <BucketBadge bucket={event.due_bucket} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {event.source === 'SCHEDULED_ACTION' && (
                          <button
                            disabled={busyId === event.id}
                            onClick={() => setConfirmAction(event)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-600 border border-slate-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
                            title="Cancel before it fires automatically"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Cancel Scheduled Action?</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {ACTION_TYPE_CONFIG[confirmAction.action_type]?.label} for {confirmAction.client_name} ({confirmAction.booking_code || confirmAction.booking_id})
                </p>
              </div>
              <button
                onClick={() => setConfirmAction(null)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 text-sm text-slate-700">
              This will cancel the scheduled action and revert any reservations made for it. This cannot be undone.
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => handleCancel(confirmAction)}
                disabled={busyId === confirmAction.id}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500"
              >
                {busyId === confirmAction.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
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
