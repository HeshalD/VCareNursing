import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Loader2, Search, TrendingUp, Users2, Receipt, ArrowUpDown, ChevronRight, UserPlus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactMoney = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;

const STATUS_CONFIG = {
  Active:   { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  Inactive: { dot: 'bg-red-400',     text: 'text-red-700' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { dot: 'bg-amber-400', text: 'text-amber-700' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {status || '—'}
    </span>
  );
};

const SalespersonsPage = () => {
  const navigate = useNavigate();
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('bookings'); // 'bookings' | 'amount' | 'registrations' | 'name'

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await apiClient.getSalespersons();
      setSalespersons(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load salespersons');
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    return salespersons.reduce(
      (acc, sp) => {
        acc.amount += parseFloat(sp.total_sales_amount || 0);
        acc.bookings += parseInt(sp.bookings_brought_count || 0, 10);
        acc.registrations += parseInt(sp.registrations_brought_count || 0, 10);
        return acc;
      },
      { amount: 0, bookings: 0, registrations: 0 }
    );
  }, [salespersons]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = salespersons;
    if (q) {
      rows = rows.filter((sp) =>
        `${sp.full_name || ''} ${sp.role || ''} ${sp.email || ''}`.toLowerCase().includes(q)
      );
    }
    const sorted = [...rows];
    if (sortBy === 'amount') {
      sorted.sort((a, b) => parseFloat(b.total_sales_amount || 0) - parseFloat(a.total_sales_amount || 0));
    } else if (sortBy === 'registrations') {
      sorted.sort((a, b) => parseInt(b.registrations_brought_count || 0, 10) - parseInt(a.registrations_brought_count || 0, 10));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    } else {
      sorted.sort((a, b) => parseInt(b.bookings_brought_count || 0, 10) - parseInt(a.bookings_brought_count || 0, 10));
    }
    return sorted;
  }, [salespersons, search, sortBy]);

  const openDetail = (sp) => navigate(`/admin/salespersons/${sp.id}`);

  const SORT_CYCLE = ['bookings', 'registrations', 'amount', 'name'];
  const cycleSort = () => setSortBy((s) => SORT_CYCLE[(SORT_CYCLE.indexOf(s) + 1) % SORT_CYCLE.length]);
  const SORT_LABELS = {
    bookings: 'Most bookings',
    registrations: 'Most registrations',
    amount: 'Highest sales',
    name: 'Name (A–Z)',
  };
  const sortLabel = SORT_LABELS[sortBy];

  if (loading) {
    return (
      <AdminLayout title="Salespersons" subtitle="Loading…">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Salespersons" subtitle="Credited at booking assignment and at registration fee payment.">
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard icon={Users2} label="Salespersons" value={salespersons.length} tint="blue" />
        <SummaryCard icon={Receipt} label="Total Bookings Brought" value={totals.bookings} tint="violet" />
        <SummaryCard icon={UserPlus} label="Total Registrations Brought" value={totals.registrations} tint="amber" />
        <SummaryCard icon={TrendingUp} label="Total Sales Credited" value={compactMoney(totals.amount)} tint="emerald" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <button
          onClick={cycleSort}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg hover:text-slate-800 transition-colors w-fit"
          title="Change sort order"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortLabel}
        </button>

        <div className="relative sm:ml-auto">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or role…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none w-64"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {visible.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="text-sm font-medium text-slate-500">No salespersons found</p>
              <p className="text-xs mt-1">
                Add internal staff with a role containing “Sales” to start tracking sales.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Salesperson</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Bookings Brought</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Registrations Brought</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Sales</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((sp) => (
                  <tr
                    key={sp.id}
                    onClick={() => openDetail(sp)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 leading-tight">{sp.full_name}</p>
                      {sp.email && <p className="text-xs text-slate-400">{sp.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{sp.role || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={sp.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                      {sp.bookings_brought_count || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                      {sp.registrations_brought_count || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {money(sp.total_sales_amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {visible.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {visible.length} of {salespersons.length} salesperson{salespersons.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

const TINTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

const SummaryCard = ({ icon: Icon, label, value, tint }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3.5">
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${TINTS[tint] || TINTS.blue}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  </div>
);

export default SalespersonsPage;
