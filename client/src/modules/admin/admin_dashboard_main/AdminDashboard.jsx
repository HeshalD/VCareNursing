import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Landmark, ChevronDown, Plus } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (val) =>
  `LKR ${Math.round(parseFloat(val || 0)).toLocaleString('en-LK')}`;

// Tight, no-space, always-2-decimal format used by the Receivables/Payables
// aging cards to match the reference widget exactly (e.g. "LKR20,278,510.00").
const fmtTight = (val) =>
  `LKR${parseFloat(val || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CASH_FLOW_PERIODS = [
  { key: 'this_fiscal_year', label: 'This Fiscal Year' },
  { key: 'previous_fiscal_year', label: 'Previous Fiscal Year' },
  { key: 'last_12_months', label: 'Last 12 Months' },
];

const INCOME_EXPENSE_PERIODS = [
  { key: 'this_fiscal_year', label: 'This Fiscal Year' },
  { key: 'previous_fiscal_year', label: 'Previous Fiscal Year' },
  { key: 'last_12_months', label: 'Last 12 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
];

const TOP_EXPENSES_PERIODS = [
  { key: 'this_fiscal_year', label: 'This Fiscal Year' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'this_month', label: 'This Month' },
  { key: 'previous_fiscal_year', label: 'Previous Fiscal Year' },
  { key: 'previous_quarter', label: 'Previous Quarter' },
  { key: 'previous_month', label: 'Previous Month' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'last_12_months', label: 'Last 12 Months' },
];

const DONUT_COLORS = ['#2563eb', '#f97316', '#10b981', '#8b5cf6', '#ef4444'];

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <AdminLayout
      title="Dashboard"
      subtitle="Financial overview across receivables, cash flow, and expenses."
    >
      <div className="space-y-6">
        <AgingRow />
        <CashFlowCard />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <IncomeExpenseCard />
          </div>
          <TopExpensesCard />
        </div>
        <BankAccountsCard onManage={() => navigate('/admin/bank-accounts')} />
      </div>
    </AdminLayout>
  );
};

// ─── Widget 1: Receivables / Payables aging ─────────────────────────────────

const AgingRow = () => {
  const navigate = useNavigate();
  const [receivables, setReceivables] = useState(null);
  const [payables, setPayables] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [recvRes, payRes, overviewRes] = await Promise.all([
          apiClient.getReceivablesAging(),
          apiClient.getPayablesAging(),
          apiClient.getFinancesOverview(),
        ]);
        setReceivables(recvRes.data);
        setPayables(payRes.data);
        setOverview(overviewRes.data);
      } catch (err) {
        console.error('Failed to load aging summaries:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Invoices/daily charges that are unpaid but not yet overdue — kept apart
  // from total_outstanding, which also folds in registration fees.
  const currentReceivables = Math.max(
    parseFloat(overview?.outstanding_daily_invoices || 0) +
    (parseFloat(overview?.outstanding_product_rental_invoices || 0) - parseFloat(overview?.overdue_product_rental_invoices || 0)),
    0
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AgingCard
        title="Total Receivables"
        subLabel="Total Unpaid Invoices"
        total={receivables?.total_receivables}
        current={currentReceivables}
        buckets={receivables?.buckets}
        loading={loading}
        onViewReport={() => navigate('/admin/reports/receivables-aging')}
      />
      <AgingCard
        title="Total Payables"
        subLabel="Total Unpaid Bills"
        total={payables?.total_payables}
        // Salary balances are owed the moment they're earned — there's no
        // "not yet due" state the way an invoice has a due date — so payables
        // has no current/not-yet-due split; the whole bar reads as overdue.
        current={0}
        buckets={payables?.buckets}
        loading={loading}
        onViewReport={() => navigate('/admin/reports/payables-aging')}
      />
    </div>
  );
};

const AgingCard = ({ title, subLabel, total, current, buckets, loading, onViewReport }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const totalAmt = parseFloat(total || 0);
  const currentAmt = parseFloat(current || 0);
  const totalUnpaid = currentAmt + totalAmt;
  const pctOverdue = totalUnpaid > 0 ? (totalAmt / totalUnpaid) * 100 : 0;
  const pctCurrent = 100 - pctOverdue;

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100 rounded-t-2xl">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onViewReport}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
            <Plus className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          New
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="h-8 w-40 bg-slate-100 rounded animate-pulse" />
        ) : (
          <>
            <p className="text-xs font-medium text-amber-600">{subLabel}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{fmtTight(totalAmt)}</p>

            <div className="mt-4 h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-blue-500" style={{ width: `${pctCurrent}%` }} />
              <div className="h-full bg-orange-500" style={{ width: `${pctOverdue}%` }} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-slate-500">
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                Current : <span className="font-semibold text-slate-700">{fmtTight(currentAmt)}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowBreakdown((v) => !v)}
                disabled={!buckets?.length}
                className="inline-flex items-center gap-1.5 text-slate-500 disabled:cursor-default"
              >
                <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                Overdue : <span className="font-semibold text-slate-700">{fmtTight(totalAmt)}</span>
                {buckets?.length ? (
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} />
                ) : null}
              </button>
            </div>
          </>
        )}
      </div>

      {showBreakdown && buckets?.length ? (
        <div className="absolute z-10 top-full right-6 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-lg p-3">
          <div className="space-y-1.5">
            {buckets.map((b) => (
              <div key={b.key} className="flex items-center justify-between px-1">
                <span className="text-sm text-slate-600">{b.label}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-700">{fmtTight(b.amount)}</span>
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

// ─── Widget 2: Cash Flow ─────────────────────────────────────────────────────

const CashFlowCard = () => {
  const [period, setPeriod] = useState('this_fiscal_year');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getCashFlowSummary({ period });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load cash flow summary:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">Cash Flow</h2>
        <PeriodSelect value={period} onChange={setPeriod} options={CASH_FLOW_PERIODS} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {loading ? (
            <div className="h-[220px] bg-slate-100 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data?.series || []}>
                <defs>
                  <linearGradient id="cashFlowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(val) => fmt(val)}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="cash" stroke="#2563eb" strokeWidth={2} fill="url(#cashFlowFill)" name="Cash" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-4">
          <CashFlowStat label={`Cash as on ${data?.from || '—'}`} value={data?.opening_cash} loading={loading} dotColor="bg-slate-400" />
          <CashFlowStat label="Incoming" value={data?.total_incoming} loading={loading} dotColor="bg-emerald-500" sign="+" />
          <CashFlowStat label="Outgoing" value={data?.total_outgoing} loading={loading} dotColor="bg-red-500" sign="-" />
          <CashFlowStat label={`Cash as on ${data?.to || '—'}`} value={data?.closing_cash} loading={loading} dotColor="bg-blue-600" sign="=" />
        </div>
      </div>
    </div>
  );
};

const CashFlowStat = ({ label, value, loading, dotColor, sign }) => (
  <div>
    <p className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${dotColor}`} />
      {label}
    </p>
    {loading ? (
      <div className="h-5 w-28 bg-slate-100 rounded animate-pulse mt-1" />
    ) : (
      <p className="text-lg font-bold text-slate-900 mt-0.5">
        {fmt(value)}{sign ? <span className="text-slate-400 font-medium text-sm ml-1">( {sign} )</span> : null}
      </p>
    )}
  </div>
);

// ─── Widget 3a: Income & Expense ────────────────────────────────────────────

const IncomeExpenseCard = () => {
  const [period, setPeriod] = useState('this_fiscal_year');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getIncomeExpenseChart({ period });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load income & expense chart:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-full">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold text-slate-900">Income and Expense</h2>
        <PeriodSelect value={period} onChange={setPeriod} options={INCOME_EXPENSE_PERIODS} />
      </div>

      <div className="flex items-center gap-6 mb-4 text-sm">
        <span className="flex items-center gap-1.5 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Total Income
          <span className="font-bold text-slate-900 ml-1">{loading ? '—' : fmt(data?.total_income)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Total Expenses
          <span className="font-bold text-slate-900 ml-1">{loading ? '—' : fmt(data?.total_expense)}</span>
        </span>
      </div>

      {loading ? (
        <div className="h-[240px] bg-slate-100 rounded animate-pulse" />
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data?.periods || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(val) => fmt(val)}
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Bar dataKey="income" fill="#10b981" name="Income" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill="#f87171" name="Expenses" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-slate-400 mt-3">* Income and expense values displayed are exclusive of taxes.</p>
    </div>
  );
};

// ─── Widget 3b: Top Expenses ─────────────────────────────────────────────────

const TopExpensesCard = () => {
  const [period, setPeriod] = useState('this_fiscal_year');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getTopExpenses({ period });
      setData(res.data);
    } catch (err) {
      console.error('Failed to load top expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const items = data?.items || [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-900">Top Expenses</h2>
        <PeriodSelect value={period} onChange={setPeriod} options={TOP_EXPENSES_PERIODS} />
      </div>

      {loading ? (
        <div className="h-[220px] bg-slate-100 rounded animate-pulse" />
      ) : items.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">No expenses in this period.</div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={items}
                  dataKey="amount"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {items.map((entry, index) => (
                    <Cell key={entry.label} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val) => fmt(val)} contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-xs text-slate-400">All Expenses</p>
              <p className="text-sm font-bold text-slate-900">{fmt(data?.total)}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {items.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                  {item.label}
                </span>
                <span className="font-semibold text-slate-700 tabular-nums">{fmt(item.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Widget 4: Bank Accounts ─────────────────────────────────────────────────

const BankAccountsCard = ({ onManage }) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getBankAccounts();
        setAccounts((res.data || []).filter((a) => a.is_active));
      } catch (err) {
        console.error('Failed to load bank accounts:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900">Bank Accounts</h2>
        <button onClick={onManage} className="text-xs font-medium text-blue-600 hover:underline">
          Manage
        </button>
      </div>
      <div className="p-2">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No active bank accounts.</div>
        ) : (
          accounts.map((acc) => (
            <div key={acc.account_id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 rounded-xl transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{acc.account_nickname}</p>
                  <p className="text-xs text-slate-400">{acc.bank_name}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {fmt(acc.current_balance ?? acc.opening_balance)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── Shared ──────────────────────────────────────────────────────────────────

const PeriodSelect = ({ value, onChange, options }) => (
  <div className="relative">
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="appearance-none bg-slate-50 border border-slate-200 text-xs font-medium text-slate-600 rounded-lg pl-3 pr-7 py-1.5 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
    >
      {options.map((opt) => (
        <option key={opt.key} value={opt.key}>{opt.label}</option>
      ))}
    </select>
    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);

export default AdminDashboard;
