import React, { useState } from 'react';
import {
  Users, Calendar, DollarSign, Activity,
  ShieldCheck, CheckCircle, Clock,
  Stethoscope, Baby, Heart, Filter
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('Overview');

  // Define tab navigation within the dashboard
  const tabs = [
    { id: 'Overview', label: 'Overview', icon: Activity },
    { id: 'Home Nursing', label: 'Home Nursing', icon: Stethoscope },
    { id: 'Elderly Care', label: 'Elderly Care', icon: Heart },
    { id: 'Child Care', label: 'Child Care', icon: Baby },
  ];

  return (
    <AdminLayout
      title={`${activeTab} Performance`}
      subtitle="Real-time updates on bookings and assignments."
      actions={
        <>
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-colors">
            Download Report
          </button>
        </>
      }
    >
      {/* Dashboard Tabs */}
      <div className="flex space-x-1 bg-slate-200 p-1 rounded-xl mb-6 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-300/50'
              } `}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Stats Grid - Dynamic based on Tab */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Bookings" value="842" change="+12.5%" trend="up" icon={Calendar} color="blue" />
        <StatCard label="Active Requests" value="14" change="+2" trend="up" icon={Activity} color="amber" />
        <StatCard label="Available Staff" value="56" change="-3" trend="down" icon={Users} color="emerald" />
        <StatCard label="Revenue (Monthly)" value="LKR 1.2M" change="+8.1%" trend="up" icon={DollarSign} color="rose" />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Bookings Feed (Priority View) */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Live Incoming Bookings
            </h2>
            <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded-full animate-pulse">
              Live Updates
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-xs uppercase font-semibold">
                  <tr>
                    <th className="py-4 pl-6 pr-4">Service Type</th>
                    <th className="py-4 px-4">Client</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-4">Received At</th>
                    <th className="py-4 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <BookingRow
                    type="Child Care"
                    client="Mrs. Perera"
                    status="New"
                    time="Just now"
                    color="amber"
                  />
                  <BookingRow
                    type="Elderly Care"
                    client="Mr. Silva"
                    status="Assigned"
                    time="12 mins ago"
                    color="rose"
                  />
                  <BookingRow
                    type="Home Nursing"
                    client="Dr. Fernando"
                    status="Pending"
                    time="24 mins ago"
                    color="blue"
                  />
                  <BookingRow
                    type="Child Care"
                    client="Ms. Jayawardena"
                    status="Done"
                    time="1 hour ago"
                    color="amber"
                  />
                  <BookingRow
                    type="Physiotherapy"
                    client="Mr. Alwis"
                    status="Assigned"
                    time="2 hours ago"
                    color="emerald"
                  />
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 text-center">
              <button className="text-blue-600 text-sm font-medium hover:underline">View All Bookings</button>
            </div>
          </div>
        </div>

        {/* Quick Actions & Status */}
        <div className="space-y-6">
          {/* System Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Category Status</h2>
            <div className="space-y-4">
              <StatusItem label="Child Care" count="12 active" color="bg-amber-500" />
              <StatusItem label="Elderly Care" count="24 active" color="bg-rose-500" />
              <StatusItem label="Home Nursing" count="8 active" color="bg-blue-500" />
              <StatusItem label="Physiotherapy" count="5 active" color="bg-emerald-500" />
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Pending Actions</h2>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Worker Identification</p>
                  <p className="text-xs opacity-80">3 new workers need manual verification.</p>
                </div>
              </div>
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm flex items-start gap-3">
                <DollarSign className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Refund Request</p>
                  <p className="text-xs opacity-80">Booking #892 needs refund approval.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </AdminLayout>
  );
};

// Sub-components

const StatCard = ({ label, value, change, trend, icon: Icon, color }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:-translate-y-1">
      <div className="flex justify-between items-start mb-4">
        <div className={`w - 12 h - 12 rounded - xl flex items - center justify - center ${colors[color]} `}>
          <Icon className="w-6 h-6" />
        </div>
        <span className={`text - xs font - bold px - 2 py - 1 rounded - full ${trend === 'up' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} `}>
          {change}
        </span>
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
      </div>
    </div>
  );
};

const BookingRow = ({ type, client, status, time, color }) => {
  const typeColors = {
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
    blue: 'bg-blue-100 text-blue-800',
    emerald: 'bg-emerald-100 text-emerald-800'
  }

  const statusColors = {
    'New': 'bg-red-50 text-red-600 border border-red-100',
    'Pending': 'bg-amber-50 text-amber-600 border border-amber-100',
    'Assigned': 'bg-blue-50 text-blue-600 border border-blue-100',
    'Done': 'bg-slate-100 text-slate-600 border border-slate-200',
  };

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="py-4 pl-6 pr-4">
        <span className={`inline - flex items - center px - 2.5 py - 0.5 rounded - full text - xs font - medium ${typeColors[color] || 'bg-slate-100 text-slate-800'} `}>
          {type}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="font-medium text-slate-900">{client}</div>
      </td>
      <td className="py-4 px-4">
        <span className={`inline - flex items - center px - 2 py - 1 rounded - lg text - xs font - bold ${statusColors[status]} `}>
          {status}
        </span>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-1.5 text-slate-500 font-medium text-sm group-hover:text-blue-600 transition-colors">
          <Clock className="w-4 h-4" />
          {time}
        </div>
      </td>
      <td className="py-4 px-4">
        <button className="text-slate-400 hover:text-blue-600 font-medium text-sm">Details</button>
      </td>
    </tr>
  );
};

const StatusItem = ({ label, count, color }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <span className={`w - 2.5 h - 2.5 rounded - full ${color} `}></span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
    <span className="text-xs font-bold text-slate-400">{count}</span>
  </div>
)

export default AdminDashboard;

