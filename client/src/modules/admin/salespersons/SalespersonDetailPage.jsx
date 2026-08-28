import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Briefcase, TrendingUp, Receipt, CalendarClock, Wallet,
  Mail, Phone, CalendarDays, ExternalLink, History, UserPlus, Users, IdCard,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactMoney = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;

const STATUS_DOT = {
  ACTIVE:     { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  INACTIVE:   { dot: 'bg-red-400',     text: 'text-red-700' },
  COMPLETED:  { dot: 'bg-blue-400',    text: 'text-blue-700' },
  TERMINATED: { dot: 'bg-red-400',     text: 'text-red-700' },
  CANCELLED:  { dot: 'bg-red-400',     text: 'text-red-700' },
  SCHEDULED:  { dot: 'bg-amber-400',   text: 'text-amber-700' },
  PAID:       { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  EXPIRED:    { dot: 'bg-red-400',     text: 'text-red-700' },
  PENDING:    { dot: 'bg-amber-400',   text: 'text-amber-700' },
};

const StatusDot = ({ status }) => {
  const cfg = STATUS_DOT[(status || '').toUpperCase()] || { dot: 'bg-slate-400', text: 'text-slate-600' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {status || '—'}
    </span>
  );
};

const Tag = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'text-slate-500',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
  };
  return <span className={`text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors';

const SalespersonDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [salesperson, setSalesperson] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [clientAssignments, setClientAssignments] = useState([]);
  const [tab, setTab] = useState('bookings'); // 'bookings' | 'registrations'

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const [bookingsRes, clientsRes] = await Promise.all([
        apiClient.getSalespersonBookings(id),
        apiClient.getSalespersonClients(id),
      ]);
      setSalesperson(bookingsRes.data?.salesperson || clientsRes.data?.salesperson || null);
      setAssignments(bookingsRes.data?.assignments || []);
      setClientAssignments(clientsRes.data?.assignments || []);
    } catch (err) {
      setError(err.message || 'Failed to load salesperson');
    } finally {
      setLoading(false);
    }
  };

  // Origin rows = bookings this salesperson brought in (these hold the credited amount).
  const creditedBookings = useMemo(() => assignments.filter((a) => a.is_origin), [assignments]);
  // Current rows = bookings this salesperson is presently assigned to.
  const currentBookings = useMemo(() => assignments.filter((a) => a.is_current), [assignments]);

  // Origin rows = clients whose registration fee was credited to this salesperson.
  const creditedClients = useMemo(() => clientAssignments.filter((a) => a.is_origin), [clientAssignments]);
  // Current rows = clients this salesperson presently manages.
  const currentClients = useMemo(() => clientAssignments.filter((a) => a.is_current), [clientAssignments]);

  const totalSales = parseFloat(salesperson?.total_sales_amount || 0);
  const numSales = parseInt(salesperson?.bookings_brought_count || 0, 10);
  const avgPerSale = numSales > 0 ? totalSales / numSales : 0;
  const maxCredit = useMemo(
    () => creditedBookings.reduce((m, b) => Math.max(m, parseFloat(b.credited_amount || 0)), 0),
    [creditedBookings]
  );

  const totalRegistrations = parseFloat(salesperson?.registrations_total_amount || 0);
  const numRegistrations = parseInt(salesperson?.registrations_brought_count || 0, 10);
  const avgPerRegistration = numRegistrations > 0 ? totalRegistrations / numRegistrations : 0;
  const maxRegCredit = useMemo(
    () => creditedClients.reduce((m, c) => Math.max(m, parseFloat(c.credited_amount || 0)), 0),
    [creditedClients]
  );

  const goToClient = (clientId) => navigate(`/admin/users/${clientId}/detail`);
  const goToBooking = (bookingId) => navigate(`/admin/bookings/${bookingId}/detail`);

  return (
    <AdminLayout
      title="Salesperson Details"
      subtitle="Sales performance, credited bookings and current assignments"
      actions={
        <button onClick={() => navigate('/admin/salespersons')} className={ghostBtnCls}>
          <ArrowLeft className="h-4 w-4" /> Back to Salespersons
        </button>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 h-64 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading salesperson…
        </div>
      ) : !salesperson ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Salesperson not found.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Identity header */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 ring-1 ring-slate-200">
                <Briefcase className="w-5 h-5 text-slate-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-slate-900">{salesperson.full_name}</h2>
                  <StatusDot status={salesperson.status} />
                </div>
                <p className="text-sm text-slate-500">{salesperson.role || 'Salesperson'}</p>
              </div>
              <div className="grid grid-cols-1 gap-1 text-sm text-slate-500 sm:text-right">
                {salesperson.email && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><Mail className="w-3.5 h-3.5 text-slate-400" /> {salesperson.email}</span>
                )}
                {salesperson.phone && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><Phone className="w-3.5 h-3.5 text-slate-400" /> {formatMobileNumber(salesperson.phone)}</span>
                )}
                {salesperson.joined_date && (
                  <span className="inline-flex items-center gap-1.5 sm:justify-end"><CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Joined {formatDate(salesperson.joined_date)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 w-fit">
            {[
              { id: 'bookings', label: 'Bookings' },
              { id: 'registrations', label: 'Registrations' },
            ].map(({ id: tabId, label }) => (
              <button
                key={tabId}
                onClick={() => setTab(tabId)}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === tabId ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'bookings' ? (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <SummaryCard icon={TrendingUp} label="Total Sales Credited" value={compactMoney(totalSales)} />
                <SummaryCard icon={Receipt} label="Number of Sales" value={numSales} />
                <SummaryCard icon={CalendarClock} label="Currently Assigned" value={currentBookings.length} />
                <SummaryCard icon={Wallet} label="Average per Sale" value={compactMoney(avgPerSale)} />
              </div>

              {/* Currently assigned bookings */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <CalendarClock className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Currently Assigned Bookings</h3>
                  <span className="ml-auto text-xs text-slate-400">{currentBookings.length} booking{currentBookings.length !== 1 ? 's' : ''}</span>
                </div>
                {currentBookings.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">Not currently assigned to any bookings.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {currentBookings.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => goToBooking(b.booking_id)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-sm font-semibold text-slate-900">{b.booking_code || b.booking_id?.slice(0, 8)}</span>
                            <StatusDot status={b.booking_status} />
                            {!b.is_origin && <Tag>switched in</Tag>}
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {b.patient_name || b.client_name || '—'}
                            {b.service_type ? ` · ${b.service_type}` : ''}
                            {b.start_date ? ` · starts ${formatDate(b.start_date)}` : ''}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Sales breakdown */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Sales Breakdown by Booking</h3>
                  <span className="ml-auto text-sm font-semibold text-slate-900">{money(totalSales)}</span>
                </div>
                {creditedBookings.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No credited sales yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client / Care Profile</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Credited On</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Share</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {creditedBookings.map((b) => {
                          const amt = parseFloat(b.credited_amount || 0);
                          const pct = totalSales > 0 ? (amt / totalSales) * 100 : 0;
                          const barW = maxCredit > 0 ? (amt / maxCredit) * 100 : 0;
                          return (
                            <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <button onClick={() => goToBooking(b.booking_id)} className="inline-flex items-center gap-1.5 font-mono text-sm font-medium text-blue-600 hover:underline">
                                  {b.booking_code || b.booking_id?.slice(0, 8)}
                                </button>
                                <div className="mt-0.5"><StatusDot status={b.booking_status} /></div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">
                                <div>{b.client_name || '—'}</div>
                                {b.patient_name && <div className="text-xs text-slate-400">{b.patient_name}</div>}
                              </td>
                              <td className="px-4 py-3 text-slate-500">{formatDate(b.assigned_at)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${barW}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 w-9 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">{money(amt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" colSpan={4}>Total</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(totalSales)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* Full assignment history (audit) */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <History className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Booking Assignment History</h3>
                  <span className="ml-auto text-xs text-slate-400">{assignments.length} record{assignments.length !== 1 ? 's' : ''}</span>
                </div>
                {assignments.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No history yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-slate-900">{a.booking_code || a.booking_id?.slice(0, 8)}</span>
                            <Tag tone={a.action === 'CREDITED' ? 'blue' : 'slate'}>{a.action}</Tag>
                            {a.is_current && <Tag tone="emerald">CURRENT</Tag>}
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {formatDateTime(a.assigned_at)}
                            {a.switch_reason ? ` · ${a.switch_reason}` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-sm font-medium text-slate-800">
                          {a.is_origin ? money(a.credited_amount) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <SummaryCard icon={UserPlus} label="Total Registrations Collected" value={compactMoney(totalRegistrations)} />
                <SummaryCard icon={IdCard} label="Total Registrations" value={numRegistrations} />
                <SummaryCard icon={Users} label="Currently Managed Clients" value={currentClients.length} />
                <SummaryCard icon={Wallet} label="Average per Registration" value={compactMoney(avgPerRegistration)} />
              </div>

              {/* Currently managed clients */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <Users className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Currently Managed Clients</h3>
                  <span className="ml-auto text-xs text-slate-400">{currentClients.length} client{currentClients.length !== 1 ? 's' : ''}</span>
                </div>
                {currentClients.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">Not currently managing any clients.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {currentClients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => goToClient(c.client_id)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold text-slate-900">{c.client_name || '—'}</span>
                            <StatusDot status={c.reg_fee_status} />
                            {!c.is_origin && <Tag>switched in</Tag>}
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {formatMobileNumber(c.mobile_number) || '—'}
                            {c.reg_fee_expires_at ? ` · reg. expires ${formatDate(c.reg_fee_expires_at)}` : ''}
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Registrations breakdown */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <UserPlus className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Registrations Breakdown by Client</h3>
                  <span className="ml-auto text-sm font-semibold text-slate-900">{money(totalRegistrations)}</span>
                </div>
                {creditedClients.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No credited registrations yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reg. Status</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Credited On</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-40">Share</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {creditedClients.map((c) => {
                          const amt = parseFloat(c.credited_amount || 0);
                          const pct = totalRegistrations > 0 ? (amt / totalRegistrations) * 100 : 0;
                          const barW = maxRegCredit > 0 ? (amt / maxRegCredit) * 100 : 0;
                          return (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <button onClick={() => goToClient(c.client_id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                                  {c.client_name || '—'}
                                </button>
                                <div className="text-xs text-slate-400 mt-0.5">{formatMobileNumber(c.mobile_number) || '—'}</div>
                              </td>
                              <td className="px-4 py-3"><StatusDot status={c.reg_fee_status} /></td>
                              <td className="px-4 py-3 text-slate-500">{formatDate(c.assigned_at)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${barW}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 w-9 text-right">{pct.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-900">{money(amt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide" colSpan={4}>Total</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{money(totalRegistrations)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </section>

              {/* Full client assignment history (audit) */}
              <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                  <History className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900">Client Assignment History</h3>
                  <span className="ml-auto text-xs text-slate-400">{clientAssignments.length} record{clientAssignments.length !== 1 ? 's' : ''}</span>
                </div>
                {clientAssignments.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">No history yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {clientAssignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">{a.client_name || '—'}</span>
                            <Tag tone={a.action === 'CREDITED' ? 'blue' : 'slate'}>{a.action}</Tag>
                            {a.is_current && <Tag tone="emerald">CURRENT</Tag>}
                          </div>
                          <div className="text-xs text-slate-400 truncate mt-0.5">
                            {formatDateTime(a.assigned_at)}
                            {a.switch_reason ? ` · ${a.switch_reason}` : ''}
                          </div>
                        </div>
                        <div className="text-right shrink-0 text-sm font-medium text-slate-800">
                          {a.is_origin ? money(a.credited_amount) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
};

const SummaryCard = ({ icon: Icon, label, value }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4">
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-slate-400" />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
    <p className="text-lg font-semibold text-slate-900">{value}</p>
  </div>
);

export default SalespersonDetailPage;
