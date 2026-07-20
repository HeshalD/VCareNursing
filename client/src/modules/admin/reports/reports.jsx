import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Users, AlertTriangle, Banknote, TrendingUp, Scale } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

const REPORTS = [
  { title: 'Profit & Loss', desc: 'Service and product revenue, cost of goods sold, and operating expenses.', icon: TrendingUp, path: '/admin/reports/profit-loss' },
  { title: 'Balance Sheet', desc: 'Assets, liabilities, and equity as of a chosen date.', icon: Scale, path: '/admin/reports/balance-sheet' },
  { title: 'Receivables Aging', desc: 'Overdue booking balances and invoices, grouped by how long they have been outstanding.', icon: AlertTriangle, path: '/admin/reports/receivables-aging' },
  { title: 'Payables Aging', desc: 'Unpaid staff salary balances, grouped by how long they have been outstanding.', icon: Banknote, path: '/admin/reports/payables-aging' },
  { title: 'Sales by Customer', desc: 'See each customer and their sales contribution.', icon: Users, path: '/admin/reports/sales-by-customer' },
];

const filterInputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-colors';

const Reports = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const reports = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return REPORTS;
    return REPORTS.filter((r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q));
  }, [search]);

  return (
    <AdminLayout
      title="Reports"
      subtitle="Financial and operational reports across the platform."
    >
      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search reports…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${filterInputCls} pl-8`}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {reports.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            No reports match "{search}".
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reports.map((report) => (
              <button
                key={report.title}
                type="button"
                onClick={() => navigate(report.path)}
                className="w-full flex items-center gap-4 text-left px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <report.icon className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{report.title}</p>
                  <p className="text-sm text-slate-500 mt-0.5 leading-snug">{report.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default Reports;
