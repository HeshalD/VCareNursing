import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Download,
  AlertTriangle, Receipt,
  Wallet, Clock, RefreshCw, ChevronDown, Banknote
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { CATEGORY_CONFIG, categoryBadge, relatedTo, flowAmountClass, flowSign } from '../../../constants/transactionCategories';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (val) =>
  `LKR ${parseFloat(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

// Recharts needs real color values (not Tailwind class names), so the pie
// chart keeps its own hex palette — labels still come from the shared
// CATEGORY_CONFIG so this page never drifts from what Transactions/Bank
// Accounts call the same category.
const CATEGORY_HEX = {
  CLIENT_PAYMENT: '#10b981',
  BOOKING_PAYMENT: '#60a5fa',
  WALLET_TOPUP: '#2dd4bf',
  OTHER_INCOME: '#22c55e',
  PRODUCT_SALE: '#34d399',
  RENTAL_PAYMENT: '#c084fc',
  STAFF_SALARY_PAID: '#a78bfa',
  STAFF_ADVANCE: '#e879f9',
  AGENCY_FEE: '#818cf8',
  INTERNAL_STAFF_SALARY: '#f472b6',
  OTHER_EXPENSE: '#fb7185',
  DEPOSIT_REFUND: '#f43f5e',
  STAFF_SALARY: '#c4b5fd',
  SERVICE_INVOICE: '#22d3ee',
  REGISTRATION_FEE: '#84cc16',
  WALLET_DEBIT: '#fb923c',
  WALLET_REFUND: '#fbbf24',
  BOOKING_SETTLEMENT: '#38bdf8',
};

const STATUS_CONFIG = {
  COMPLETED: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Completed' },
  PENDING:   { dot: 'bg-amber-400',   text: 'text-amber-700',   label: 'Pending' },
  FAILED:    { dot: 'bg-red-400',     text: 'text-red-700',     label: 'Failed' },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || { dot: 'bg-slate-400', text: 'text-slate-600', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// ─── Sub Components ───────────────────────────────────────────────────────────

const StatCard = ({ title, value, sub, icon: Icon, iconBg, loading, valueClass = 'text-slate-900' }) => (
  <div className="bg-white p-4 rounded-xl border border-slate-200">
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
      <div className={`p-2 rounded-lg ${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    {loading ? (
      <div className="h-7 w-32 bg-slate-100 rounded animate-pulse" />
    ) : (
      <>
        <p className={`text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </>
    )}
  </div>
);

const SectionTitle = ({ children }) => (
  <h2 className="text-sm font-semibold text-slate-900 mb-4">{children}</h2>
);

const RECEIVABLES_BUCKET_TONES_LIST = {
  days_1_15: 'text-blue-600',
  days_16_30: 'text-blue-600',
  days_31_45: 'text-blue-600',
  days_46_plus: 'text-blue-600',
};

// Mirrors a standard AR "Total Receivables" widget: a progress bar splitting
// unpaid invoices into Current (not yet due) vs Overdue (= this app's
// total_receivables), with a dropdown breaking the overdue portion down by
// age bucket. "Current" here is invoices/daily charges that are unpaid but
// not yet overdue — outstanding_daily_invoices (always PENDING, never
// overdue) plus the non-overdue slice of product/rental invoices. It's kept
// separate from total_outstanding, which also includes registration fees.
const ReceivablesCard = ({ loading, totalReceivables, overview, receivablesAging, showBreakdown, onToggleBreakdown, onViewReport }) => {
  const current = Math.max(
    parseFloat(overview?.outstanding_daily_invoices || 0) +
    (parseFloat(overview?.outstanding_product_rental_invoices || 0) - parseFloat(overview?.overdue_product_rental_invoices || 0)),
    0
  );
  const totalUnpaid = current + totalReceivables;
  const pctOverdue = totalUnpaid > 0 ? (totalReceivables / totalUnpaid) * 100 : 0;
  const pctCurrent = 100 - pctOverdue;

  return (
    <div className="relative bg-white p-4 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Receivables</p>
        <div className="p-2 rounded-lg bg-red-50 text-red-600">
          <AlertTriangle className="w-4 h-4" />
        </div>
      </div>

      {loading ? (
        <div className="h-7 w-32 bg-slate-100 rounded animate-pulse" />
      ) : (
        <>
          <p className={`text-xl font-bold tabular-nums ${totalReceivables > 0 ? 'text-red-700' : 'text-slate-900'}`}>
            {fmt(totalReceivables)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">of {fmt(totalUnpaid)} total unpaid</p>

          <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-blue-500" style={{ width: `${pctCurrent}%` }} />
            <div className="h-full bg-orange-500" style={{ width: `${pctOverdue}%` }} />
          </div>

          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              Current : <span className="font-semibold text-slate-700">{fmt(current)}</span>
            </span>
            <button
              type="button"
              onClick={onToggleBreakdown}
              disabled={!receivablesAging?.buckets?.length}
              className="inline-flex items-center gap-1.5 text-slate-500 disabled:cursor-default"
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
              Overdue : <span className="font-semibold text-slate-700">{fmt(totalReceivables)}</span>
              {receivablesAging?.buckets?.length ? (
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
              ) : null}
            </button>
          </div>
        </>
      )}

      {showBreakdown && receivablesAging?.buckets?.length ? (
        <div className="absolute z-10 top-full right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-3">
          <div className="space-y-1.5">
            {receivablesAging.buckets.map(b => (
              <div key={b.key} className="flex items-center justify-between px-1">
                <span className="text-sm text-slate-600">{b.label}</span>
                <span className={`text-sm font-semibold tabular-nums ${RECEIVABLES_BUCKET_TONES_LIST[b.key] || 'text-blue-600'}`}>
                  {fmt(b.amount)}
                </span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onViewReport}
            className="mt-2 w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 border-t border-slate-100 pt-2"
          >
            View full report
          </button>
        </div>
      ) : null}
    </div>
  );
};

const PAYABLES_BUCKET_TONES_LIST = {
  days_1_15: 'text-violet-600',
  days_16_30: 'text-violet-600',
  days_31_45: 'text-violet-600',
  days_46_plus: 'text-violet-600',
};

// AP equivalent of ReceivablesCard: unpaid staff_wallet balances, broken
// down by age bucket. Unlike receivables there's no "not yet due" state for
// a salary balance — money earned is owed from the moment it's confirmed —
// so this card skips the Current/Overdue split and just shows the total
// plus an age-bucket dropdown.
const PayablesCard = ({ loading, totalPayables, payablesAging, showBreakdown, onToggleBreakdown, onViewReport }) => (
  <div className="relative bg-white p-4 rounded-xl border border-slate-200">
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Payables</p>
      <div className="p-2 rounded-lg bg-violet-50 text-violet-600">
        <Banknote className="w-4 h-4" />
      </div>
    </div>

    {loading ? (
      <div className="h-7 w-32 bg-slate-100 rounded animate-pulse" />
    ) : (
      <>
        <button
          type="button"
          onClick={onToggleBreakdown}
          disabled={!payablesAging?.buckets?.length}
          className="flex items-center gap-1 disabled:cursor-default"
        >
          <p className={`text-xl font-bold tabular-nums ${totalPayables > 0 ? 'text-violet-700' : 'text-slate-900'}`}>
            {fmt(totalPayables)}
          </p>
          {payablesAging?.buckets?.length ? (
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
          ) : null}
        </button>
        <p className="text-xs text-slate-400 mt-1">Unpaid staff salary balances</p>
      </>
    )}

    {showBreakdown && payablesAging?.buckets?.length ? (
      <div className="absolute z-10 top-full right-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg p-3">
        <div className="space-y-1.5">
          {payablesAging.buckets.map(b => (
            <div key={b.key} className="flex items-center justify-between px-1">
              <span className="text-sm text-slate-600">{b.label}</span>
              <span className={`text-sm font-semibold tabular-nums ${PAYABLES_BUCKET_TONES_LIST[b.key] || 'text-violet-600'}`}>
                {fmt(b.amount)}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onViewReport}
          className="mt-2 w-full text-center text-xs font-semibold text-blue-600 hover:text-blue-700 border-t border-slate-100 pt-2"
        >
          View full report
        </button>
      </div>
    ) : null}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const Financials = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionsMeta, setTransactionsMeta] = useState({ total: 0, page: 1, total_pages: 1 });
  const [advances, setAdvances] = useState(null);
  const [staffWallets, setStaffWallets] = useState(null);
  const [creditAlerts, setCreditAlerts] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [categoriesChart, setCategoriesChart] = useState([]);
  const [receivablesAging, setReceivablesAging] = useState(null);
  const [showReceivablesBreakdown, setShowReceivablesBreakdown] = useState(false);
  const [payablesAging, setPayablesAging] = useState(null);
  const [showPayablesBreakdown, setShowPayablesBreakdown] = useState(false);

  const [period, setPeriod] = useState('monthly');
  const [filters, setFilters] = useState({ category: '', flow: '', status: '', page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);

  // Fetch all summary data
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [ov, adv, sw, ca, cat, aging, payAging] = await Promise.all([
          apiClient.getFinancesOverview(),
          apiClient.getAdvancesSummary(),
          apiClient.getStaffWalletsSummary(),
          apiClient.getCreditAlertsSummary(),
          apiClient.getTransactionCategoriesChart(),
          apiClient.getReceivablesAging(),
          apiClient.getPayablesAging(),
        ]);

        setOverview(ov.data);
        setAdvances(adv.data);
        setStaffWallets(sw.data);
        setCreditAlerts(ca.data);
        setCategoriesChart(cat.data);
        setReceivablesAging(aging.data);
        setPayablesAging(payAging.data);
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

  // Fetch transactions (canonical ledger endpoint — same one Transactions/Bank
  // Accounts pages use) when filters change
  useEffect(() => {
    const fetchTransactions = async () => {
      setTxLoading(true);
      try {
        const res = await apiClient.getAllTransactions(filters);
        setTransactions(res.data || []);
        setTransactionsMeta(res.pagination || { total: 0, page: filters.page, total_pages: 1 });
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setTxLoading(false);
      }
    };
    fetchTransactions();
  }, [filters]);

  const totalOutstanding = parseFloat(overview?.total_outstanding || 0);
  const totalReceivables = parseFloat(overview?.total_receivables || 0);
  const totalPayables = parseFloat(payablesAging?.total_payables || 0);
  const netCashFlow = parseFloat(overview?.net_cash_flow || 0);

  return (
    <AdminLayout
      title="Financial Overview"
      subtitle="Real cash flow, outstanding invoices, advances, and platform activity."
      actions={
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      }
    >
      {/* ── Cash Flow Overview Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard
          title="Total Money In"
          value={fmt(overview?.total_money_in)}
          sub="Client/booking payments, product & rental sales, top-ups"
          icon={TrendingUp}
          iconBg="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
        <StatCard
          title="Total Money Out"
          value={fmt(overview?.total_money_out)}
          sub="Staff salaries, advances, agency fees, deposit refunds"
          icon={TrendingDown}
          iconBg="bg-red-50 text-red-600"
          loading={loading}
        />
        <StatCard
          title="Net Cash Flow"
          value={fmt(netCashFlow)}
          sub="Money in minus money out"
          icon={DollarSign}
          iconBg={netCashFlow >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}
          valueClass={netCashFlow >= 0 ? 'text-slate-900' : 'text-amber-700'}
          loading={loading}
        />
        <StatCard
          title="Total Outstanding"
          value={fmt(totalOutstanding)}
          sub={`Daily ${fmt(overview?.outstanding_daily_invoices)} · Product/Rental ${fmt(overview?.outstanding_product_rental_invoices)}${parseFloat(overview?.overdue_product_rental_invoices || 0) > 0 ? ` (${fmt(overview?.overdue_product_rental_invoices)} overdue)` : ''} · Reg. fee ${fmt(overview?.outstanding_registration_fees)}`}
          icon={Receipt}
          iconBg="bg-amber-50 text-amber-600"
          loading={loading}
        />
        <ReceivablesCard
          loading={loading}
          totalReceivables={totalReceivables}
          overview={overview}
          receivablesAging={receivablesAging}
          showBreakdown={showReceivablesBreakdown}
          onToggleBreakdown={() => setShowReceivablesBreakdown(v => !v)}
          onViewReport={() => navigate('/admin/reports/receivables-aging')}
        />
      </div>

      {/* ── Active Booking Financials ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
          iconBg="bg-violet-50 text-violet-600"
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
        <StatCard
          title="Registration Fee Revenue"
          value={fmt(overview?.registration_fee_revenue)}
          sub="Lifetime cash collected, across all renewal cycles"
          icon={Receipt}
          iconBg="bg-lime-50 text-lime-600"
          loading={loading}
        />
        <PayablesCard
          loading={loading}
          totalPayables={totalPayables}
          payablesAging={payablesAging}
          showBreakdown={showPayablesBreakdown}
          onToggleBreakdown={() => setShowPayablesBreakdown(v => !v)}
          onViewReport={() => navigate('/admin/reports/payables-aging')}
        />
      </div>

      {/* ── Revenue Chart + Categories Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Money In vs Money Out Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Money In vs Money Out</SectionTitle>
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1">
              {['daily', 'weekly', 'monthly'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                    period === p
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
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
                <linearGradient id="moneyIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="moneyOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(val) => `LKR ${parseFloat(val).toLocaleString()}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Area type="monotone" dataKey="money_in" stroke="#10b981" strokeWidth={2} fill="url(#moneyIn)" name="Money In" />
              <Area type="monotone" dataKey="money_out" stroke="#ef4444" strokeWidth={2} fill="url(#moneyOut)" name="Money Out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Transaction Categories Pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
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
                    fill={CATEGORY_HEX[entry.category] || '#94a3b8'}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(val, name) => [`LKR ${parseFloat(val).toLocaleString()}`, CATEGORY_CONFIG[name]?.label || name]}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Legend
                formatter={(val) => CATEGORY_CONFIG[val]?.label || val}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Secondary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

        {/* Staff Advances */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Wallet className="w-4 h-4 text-violet-600" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Advances</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Approved this month</span>
                <span className="font-semibold text-slate-900 tabular-nums">{fmt(advances?.total_approved_this_month)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pending requests</span>
                <span className="font-semibold text-amber-600 tabular-nums">{advances?.pending_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total outstanding</span>
                <span className="font-semibold text-slate-900 tabular-nums">{fmt(advances?.total_outstanding_advances)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Staff Wallets */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Staff Wallets</p>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total balance held</span>
                <span className="font-semibold text-slate-900 tabular-nums">{fmt(staffWallets?.total_balance_held)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total wallets</span>
                <span className="font-semibold text-slate-900 tabular-nums">{staffWallets?.total_staff_wallets ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Average balance</span>
                <span className="font-semibold text-slate-900 tabular-nums">{fmt(staffWallets?.average_wallet_balance)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Credit Alerts — live counts, not historical notification logs */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Booking Balance Risk (Live)</p>
          </div>
          {loading ? (
            <div className="h-4 bg-slate-100 rounded animate-pulse" />
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Expiring soon (≤1 day left)</span>
                <span className="font-semibold text-amber-600 tabular-nums">{creditAlerts?.expiring_soon_today ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Already negative</span>
                <span className="font-semibold text-red-600 tabular-nums">{creditAlerts?.negative_balance_today ?? 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Transactions Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Transactions</h2>
          <div className="flex flex-wrap gap-2">
            {/* Direction Filter */}
            <select
              value={filters.flow}
              onChange={(e) => setFilters(f => ({ ...f, flow: e.target.value, page: 1 }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Directions</option>
              <option value="IN">Money In</option>
              <option value="OUT">Money Out</option>
              <option value="NEUTRAL">Neutral</option>
            </select>

            {/* Category Filter */}
            <select
              value={filters.category}
              onChange={(e) => setFilters(f => ({ ...f, category: e.target.value, page: 1 }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">All Categories</option>
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filters.status}
              onChange={(e) => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
            <div className="p-8 text-center text-slate-400 text-sm">Loading transactions…</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">No transactions found.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {['Party', 'Category', 'Amount', 'Method', 'Status', 'Date'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const related = relatedTo(tx);
                  return (
                    <tr key={tx.transaction_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 leading-tight">{related.primary}</p>
                        {related.secondary && <p className="text-xs text-slate-400 mt-0.5">{related.secondary}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{categoryBadge(tx.category)}</td>
                      <td className={`px-4 py-3 font-semibold tabular-nums whitespace-nowrap ${flowAmountClass(tx.category, tx.transaction_type)}`}>
                        {flowSign(tx.category, tx.transaction_type)}{fmt(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">
                        {tx.payment_method?.replace(/_/g, ' ') || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={tx.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {fmtDate(tx.transaction_date || tx.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {transactionsMeta.total_pages > 1 && (
          <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-400">{transactionsMeta.total} total transactions</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                disabled={filters.page === 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-slate-600 tabular-nums px-1">
                {filters.page} / {transactionsMeta.total_pages}
              </span>
              <button
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                disabled={filters.page === transactionsMeta.total_pages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
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
