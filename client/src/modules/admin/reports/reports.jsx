import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, TrendingUp, Users, Calendar, ReceiptText, PieChart, Wallet, ArrowRight, ClipboardList, AlertTriangle, Banknote } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminLayout from '../components/AdminLayout';

const Reports = () => {
  const navigate = useNavigate();

  const data = [
    { name: 'Jan', revenue: 4000, bookings: 240 },
    { name: 'Feb', revenue: 3000, bookings: 139 },
    { name: 'Mar', revenue: 2000, bookings: 980 },
    { name: 'Apr', revenue: 2780, bookings: 390 },
    { name: 'May', revenue: 1890, bookings: 480 },
    { name: 'Jun', revenue: 2390, bookings: 380 },
    { name: 'Jul', revenue: 3490, bookings: 430 },
  ];

  return (
    <AdminLayout
      title="System Reports"
      subtitle="Analytics and detailed reports on system performance."
      actions={
        <div className="flex gap-2">
          <select className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg px-3 py-2 outline-none">
            <option>Monthly</option>
            <option>Weekly</option>
            <option>Daily</option>
          </select>
          <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <ReportStatCard icon={TrendingUp} label="Revenue Reports" value="12" tone="emerald" />
        <ReportStatCard icon={Users} label="Customer Reports" value="08" tone="blue" />
        <ReportStatCard icon={Calendar} label="Booking Reports" value="06" tone="amber" />
        <ReportStatCard icon={Wallet} label="Financial Reports" value="10" tone="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 mb-6">Revenue Growth</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-900 mb-6">Booking Volume</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg text-slate-900">Available Reports</h3>
              <p className="text-sm text-slate-500 mt-1">Open a report to review client, booking, and financial breakdowns.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/admin/reports/sales-by-customer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
              >
                Sales by Customer
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/admin/reports/receivables-aging"
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
              >
                Receivables Aging
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/admin/reports/payables-aging"
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
              >
                Payables Aging
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/admin/reports/profit-loss"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                Profit &amp; Loss
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-6 py-3">Report</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {[
                { title: 'Sales by Customer', desc: 'See each customer and their sales contribution.', icon: Users, color: 'text-blue-600 bg-blue-50', category: 'Customers', action: () => navigate('/admin/reports/sales-by-customer') },
                { title: 'Receivables Aging', desc: 'All overdue booking balances and invoices, grouped by how long they have been outstanding.', icon: AlertTriangle, color: 'text-red-600 bg-red-50', category: 'Finance', action: () => navigate('/admin/reports/receivables-aging') },
                { title: 'Payables Aging', desc: 'All unpaid staff salary balances, grouped by how long they have been outstanding.', icon: Banknote, color: 'text-violet-600 bg-violet-50', category: 'Finance', action: () => navigate('/admin/reports/payables-aging') },
                { title: 'Profit & Loss', desc: 'Service and product revenue, cost of goods sold, and operating expenses, previewable by month, 6 months, or year.', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50', category: 'Finance', action: () => navigate('/admin/reports/profit-loss') },
                { title: 'Booking Performance', desc: 'Review completion rates, cancellations, and average durations.', icon: Calendar, color: 'text-amber-600 bg-amber-50', category: 'Operations' },
                { title: 'Payment Tracking', desc: 'Monitor payments, balances, and overdue amounts across clients.', icon: ReceiptText, color: 'text-violet-600 bg-violet-50', category: 'Finance' },
                { title: 'Service Mix', desc: 'Understand which services are generating the most activity.', icon: PieChart, color: 'text-sky-600 bg-sky-50', category: 'Operations' },
                { title: 'Customer Statement Activity', desc: 'Review statement generation and transaction patterns.', icon: ClipboardList, color: 'text-slate-600 bg-slate-100', category: 'Customers' },
              ].map((report) => (
                <tr key={report.title} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${report.color}`}>
                        <report.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{report.title}</h4>
                        <p className="text-xs text-slate-500 mt-1">Ready for detailed review</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{report.desc}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {report.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      type="button"
                      onClick={report.action || (() => {})}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
};

const ReportStatCard = ({ icon: Icon, label, value, tone }) => {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.blue}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

export default Reports;
