import React from 'react';
import { DollarSign, TrendingUp, TrendingDown, Download, CreditCard, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

const Financials = () => {
  return (
    <AdminLayout
      title="Financial Overview"
      subtitle="Monitor revenue, payouts, and platform fees."
      actions={
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Revenue</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h3 className="text-3xl font-bold text-slate-900">LKR 4.2M</h3>
            <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">+12.5%</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Worker Payouts</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h3 className="text-3xl font-bold text-slate-900">LKR 3.1M</h3>
            <span className="text-sm font-medium text-slate-500">74% of revenue</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Net Profit</p>
          <div className="flex items-baseline gap-2 mt-2">
            <h3 className="text-3xl font-bold text-slate-900">LKR 1.1M</h3>
            <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">+8.2%</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h3 className="font-bold text-lg text-slate-900">Recent Transactions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Transaction ID</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-slate-500">#TRX-882{i}</td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center gap-2 font-medium ${i % 2 === 0 ? 'text-green-600' : 'text-slate-900'}`}>
                      {i % 2 === 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4 text-slate-400" />}
                      {i % 2 === 0 ? 'Payout' : 'Booking Payment'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200"></div>
                      <span>{i % 2 === 0 ? 'Nurse Sarath' : 'Mrs. Perera'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold">
                    {i % 2 === 0 ? '-' : '+'} LKR {i % 2 === 0 ? '15,000' : '4,500'}
                  </td>
                  <td className="px-6 py-4 text-slate-500">Oct 24, 2024</td>
                  <td className="px-6 py-4">
                    <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">
                      Completed
                    </span>
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

export default Financials;
