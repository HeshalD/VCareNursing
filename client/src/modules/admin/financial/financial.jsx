import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Download,
  ArrowUpRight, ArrowDownLeft, AlertTriangle,
  Package, Wallet, Clock, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (val) =>
  `LKR ${parseFloat(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

const CATEGORY_COLORS = {
  CLIENT_PAYMENT: '#6366f1',
  SERVICE_INVOICE: '#f59e0b',
  WALLET_REFUND: '#10b981',
  STAFF_SALARY: '#3b82f6',
  AGENCY_FEE: '#8b5cf6',
};

const CATEGORY_LABELS = {
  CLIENT_PAYMENT: 'Client Payment',
  SERVICE_INVOICE: 'Service Invoice',
  WALLET_REFUND: 'Wallet Refund',
  STAFF_SALARY: 'Staff Salary',
  AGENCY_FEE: 'Agency Fee',
};

const STATUS_STYLES = {
  COMPLETED: 'bg-green-50 text-green-700',
  PENDING: 'bg-yellow-50 text-yellow-700',
  FAILED: 'bg-red-50 text-red-700',
};

// ─── Sub Components ───────────────────────────────────────────────────────────

const StatCard = ({ title, value, sub, icon: Icon, iconBg, loading }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <div className={`p-2 rounded-xl ${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    {loading ? (
      <div className="h-8 w-32 bg-slate-100 rounded animate-pulse" />
    ) : (
      <>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </>
    )}
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 className="text-base font-semibold text-slate-800 mb-4">{children}</h2>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Financials = () => {
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsMeta, setTransactionsMeta] = useState({ total_count: 0, page: 1 });
  const [advances, setAdvances] = useState(null);
  const [staffWallets, setStaffWallets] = useState(null);
  const [creditAlerts, setCreditAlerts] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [categoriesChart, setCategoriesChart] = useState([]);

  const [period, setPeriod] = useState('monthly');
  const [filters, setFilters] = useState({ category: '', status: '', page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);

  // Fetch all summary data
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [ov, adv, sw, ca, cat] = await Promise.all([
          apiClient.getFinancesOverview(),
          apiClient.getAdvancesSummary(),
          apiClient.getStaffWalletsSummary(),
          apiClient.getCreditAlertsSummary(),
          apiClient.getTransactionCategoriesChart(),
        ]);
        
        setOverview(ov.data);
        setAdvances(adv.data);
        setStaffWallets(sw.data);
        setCreditAlerts(ca.data);
        setCategoriesChart(cat.data);
      } catch (err) {
        console.error('Failed to load finances data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // Fetch revenue chart when period changes
  useEffect(() => {
    const fetchChart = async () => {
      try {
        const res = await apiClient.getRevenueChart(period);
        setRevenueChart(res.data);
      } catch (err) {
        console.error('Failed to load chart:', err);
      }
    };
    fetchChart();
  }, [period]);

  // Fetch transactions when filters change
  useEffect(() => {
    const fetchTransactions = async () => {
      setTxLoading(true);
      try {
        const res = await apiClient.getFinancesTransactions(filters);
        setTransactions(res.data);
        setTransactionsMeta({
          total_count: res.data.total_count,
          page: res.data.page
        });
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setTxLoading(false);
      }
    };
    fetchTransactions();
  }, [filters]);

  const totalPages = Math.ceil(transactionsMeta.total_count / filters.limit);

  return (
    <AdminLayout
      title="Financial Overview"
      subtitle="Monitor revenue, invoices, advances, and platform activity."
      actions={
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      }
    >
      {/* ── Revenue Overview Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Revenue Collected"
          value={fmt(overview?.total_revenue_collected)}
          sub="All time client payments"
          icon={DollarSign}
          iconBg="bg-indigo-50 text-indigo-600"
          loading={loading}
        />
        <StatCard
          title="Total Invoiced"
          value={fmt(overview?.total_invoiced)}
          sub="All service invoices issued"
          icon={ArrowUpRight}
          iconBg="bg-amber-50 text-amber-600"
          loading={loading}
        />
        <StatCard
          title="Outstanding Balance"
          value={fmt(overview?.outstanding_balance)}
          sub="Collected minus invoiced"
          icon={TrendingUp}
          iconBg="bg-green-50 text-green-600"
          loading={loading}
        />
        <StatCard
          title="Total Refunds Issued"
          value={fmt(overview?.total_refunds_issued)}
          sub="Wallet refunds to clients"
          icon={TrendingDown}
          iconBg="bg-red-50 text-red-600"
          loading={loading}
        />
      </div>

      {/* ── Active Booking Financials ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Active Bookings"
          value={overview?.active_bookings_count ?? '—'}
          sub="Currently running services"
          icon={RefreshCw}
          iconBg="bg-blue-50 text-blue-600"
          loading={loading}
        />
        <StatCard
          title="Daily Burn Rate"
          value={fmt(overview?.total_daily_burn_rate)}
          sub="Sum of all active daily rates"
          icon={Clock}
          iconBg="bg-purple-50 text-purple-600"
          loading={loading}
        />
        <StatCard
          title="Projected Monthly Revenue"
          value={fmt(overview?.projected_monthly_revenue)}
          sub="Daily burn × 30 days"
          icon={TrendingUp}
          iconBg="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
      </div>

      {/* ── Revenue Chart + Categories Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* Revenue vs Invoiced Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Revenue vs Invoiced</SectionTitle>
            <div className="flex gap-2">
              {['daily', 'weekly', 'monthly'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition ${
                    period === p
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueChart}>
              <defs>
                <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="invoiced" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(val) => `LKR ${parseFloat(val).toLocaleString()}`}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revenue)" name="Revenue" />
              <Area type="monotone" dataKey="invoiced" stroke="#f59e0b" strokeWidth={2} fill="url(#invoiced)" name="Invoiced" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction Categories Pie */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <SectionTitle>By Category</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categoriesChart}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
              >
                {categoriesChart.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={CATEGORY_COLORS[entry.category] || '#94a3b8'}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(val, name) => [`LKR ${parseFloat(val).toLocaleString()}`, CATEGORY_LABELS[name] || name]}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Legend
                formatter={(val) => CATEGORY_LABELS[val] || val}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Secondary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">

        {/* Staff Advances */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-purple-50 rounded-xl">
              <Wallet className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Staff Advances</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Approved this month</span>
                <span className="font-semibold text-slate-800">{fmt(advances?.total_approved_this_month)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pending requests</span>
                <span className="font-semibold text-amber-600">{advances?.pending_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total outstanding</span>
                <span className="font-semibold text-slate-800">{fmt(advances?.total_outstanding_advances)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Staff Wallets */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-50 rounded-xl">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Staff Wallets</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total balance held</span>
                <span className="font-semibold text-slate-800">{fmt(staffWallets?.total_balance_held)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total wallets</span>
                <span className="font-semibold text-slate-800">{staffWallets?.total_staff_wallets ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Average balance</span>
                <span className="font-semibold text-slate-800">{fmt(staffWallets?.average_wallet_balance)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Credit Alerts */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-red-50 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Credit Alerts Today</p>
          </div>
          {loading ? (
            <div className="h-4 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Expiring soon</span>
                <span className="font-semibold text-amber-600">{creditAlerts?.expiring_soon_today ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Negative balance</span>
                <span className="font-semibold text-red-600">{creditAlerts?.negative_balance_today ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Transactions Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-800">Transactions</h2>
          <div className="flex flex-wrap gap-2">
            {/* Category Filter */}
            <select
              value={filters.category}
              onChange={(e) => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All Categories</option>
              <option value="CLIENT_PAYMENT">Client Payment</option>
              <option value="SERVICE_INVOICE">Service Invoice</option>
              <option value="WALLET_REFUND">Wallet Refund</option>
              <option value="STAFF_SALARY">Staff Salary</option>
              <option value="AGENCY_FEE">Agency Fee</option>
            </select>

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {txLoading ? (
            <div className="p-8 text-center text-slate-400 text-sm">Loading transactions...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No transactions found.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Service Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Method</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.map((tx) => (
                  <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {tx.client_name || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: `${CATEGORY_COLORS[tx.category]}18`,
                          color: CATEGORY_COLORS[tx.category] || '#64748b'
                        }}
                      >
                        {CATEGORY_LABELS[tx.category] || tx.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500">{tx.service_type || '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {fmt(tx.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 capitalize">
                      {tx.payment_method?.replace('_', ' ') || '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[tx.status] || 'bg-slate-100 text-slate-600'}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-400 text-xs">
                      {new Date(tx.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>{transactionsMeta.total_count} total transactions</span>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                disabled={filters.page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition"
              >
                Previous
              </button>
              <span className="px-3 py-1.5">
                {filters.page} / {totalPages}
              </span>
              <button
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                disabled={filters.page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default Financials;