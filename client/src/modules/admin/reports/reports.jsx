import React from 'react';
import { FileText, Download, TrendingUp, Users, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminLayout from '../components/AdminLayout';

const Reports = () => {
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
          <h3 className="font-bold text-lg text-slate-900">Available Reports</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {[
            { title: 'Monthly Financial Summary', desc: 'Detailed breakdown of all earnings and payouts for Oct 2024.', icon: TrendingUp, color: 'text-green-600 bg-green-50' },
            { title: 'User Registration Analytics', desc: 'New user signups and retention metrics.', icon: Users, color: 'text-blue-600 bg-blue-50' },
            { title: 'Booking Performance', desc: 'Completion rates, cancellations, and average ratings.', icon: Calendar, color: 'text-amber-600 bg-amber-50' },
          ].map((report, i) => (
            <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${report.color}`}>
                  <report.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{report.title}</h4>
                  <p className="text-sm text-slate-500">{report.desc}</p>
                </div>
              </div>
              <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                <Download className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default Reports;
