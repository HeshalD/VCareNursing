import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Loader2, Search, TrendingUp, Users2, Receipt, ArrowUpDown, ChevronRight } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const compactMoney = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 })}`;

const statusColor = (s) => {
  if (s === 'Active') return 'bg-green-100 text-green-700';
  if (s === 'Inactive') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const SalespersonsPage = () => {
  const navigate = useNavigate();
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('bookings'); // 'bookings' | 'amount' | 'name'

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
        return acc;
      },
      { amount: 0, bookings: 0 }
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
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    } else {
      sorted.sort((a, b) => parseInt(b.bookings_brought_count || 0, 10) - parseInt(a.bookings_brought_count || 0, 10));
    }
    return sorted;
  }, [salespersons, search, sortBy]);

  const openDetail = (sp) => navigate(`/admin/salespersons/${sp.id}`);

  const cycleSort = () => setSortBy((s) => (s === 'bookings' ? 'amount' : s === 'amount' ? 'name' : 'bookings'));
  const sortLabel = sortBy === 'bookings' ? 'Most bookings' : sortBy === 'amount' ? 'Highest sales' : 'Name (A–Z)';

  return (
    <AdminLayout title="Salespersons" subtitle="Sales performance credited at booking assignment">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard icon={Users2} label="Salespersons" value={loading ? '—' : salespersons.length} tint="blue" />
        <SummaryCard icon={Receipt} label="Total Bookings Brought" value={loading ? '—' : totals.bookings} tint="violet" />
        <SummaryCard icon={TrendingUp} label="Total Sales Credited" value={loading ? '—' : compactMoney(totals.amount)} tint="green" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or role..."
              className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={cycleSort}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            title="Change sort order"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortLabel}
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 h-48 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading salespersons…
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Briefcase className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-medium text-slate-500">No salespersons found</p>
              <p className="text-sm mt-1">
                Add internal staff with a role containing “Sales” to start tracking sales.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500 text-xs uppercase tracking-wide font-semibold">
                  <th className="text-left px-5 py-3">Salesperson</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Bookings Brought</th>
                  <th className="text-right px-5 py-3">Total Sales</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((sp) => (
                  <tr
                    key={sp.id}
                    onClick={() => openDetail(sp)}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-slate-900">{sp.full_name}</div>
                      {sp.email && <div className="text-xs text-slate-400">{sp.email}</div>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{sp.role || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(sp.status)}`}>
                        {sp.status || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-900">
                      {sp.bookings_brought_count || 0}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-slate-900">
                      {money(sp.total_sales_amount)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                        View details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

const TINTS = {
  blue: 'bg-blue-50 text-blue-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-green-50 text-green-600',
};

const SummaryCard = ({ icon: Icon, label, value, tint }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${TINTS[tint] || TINTS.blue}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
);

export default SalespersonsPage;
