import React from 'react';
import {
  LayoutDashboard, User, Calendar, MapPin,
  DollarSign, Bell, Settings, LogOut, CheckCircle,
  Briefcase, Clock, Star, TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';

const WorkerDashboardDemo = () => {
  return (
    <div className="min-h-screen bg-slate-50 font-sans flex text-slate-900">

      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex flex-col w-72 bg-indigo-900 text-white p-6 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-10 text-emerald-400">
          <Briefcase className="w-8 h-8" />
          <span className="text-2xl font-bold text-white tracking-tight">VCare<span className="text-indigo-300">Pro</span></span>
        </div>

        <nav className="flex-1 space-y-2">
          <NavItem icon={LayoutDashboard} label="Dashboard" active />
          <NavItem icon={DollarSign} label="Earnings" />
          <NavItem icon={User} label="My Profile" />
          <NavItem icon={Settings} label="Settings" />
        </nav>

        <div className="pt-6 border-t border-indigo-800">
          <button className="flex items-center gap-3 text-indigo-300 hover:text-white transition-colors w-full px-4 py-3 rounded-xl hover:bg-white/10">
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-8 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Hello, Chamara! 👋</h1>
            <p className="text-slate-500 text-sm">Welcome back to your professional portal.</p>
          </div>

          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
              <Bell className="w-6 h-6" />
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <img
                src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=200&auto=format&fit=crop"
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover border-2 border-indigo-100"
              />
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-slate-900">Chamara Perera</p>
                <p className="text-xs text-slate-500">Certified Nurse • Kandy</p>
              </div>
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">

          {/* Application Status Banner */}
          <div className="bg-indigo-600 rounded-2xl p-6 md:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-200">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <CheckCircle className="w-8 h-8 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1">Application Submitted Successfully!</h2>
                <p className="text-indigo-100">Your profile is currently under review by our team. We will contact you at 077-123-4567 within 24 hours.</p>
              </div>
            </div>
            <div className="px-5 py-2 bg-yellow-400/20 border border-yellow-400/50 text-yellow-100 rounded-full text-sm font-bold uppercase tracking-wider backdrop-blur-md">
              Pending Verification
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              title="Total Earnings"
              value="LKR 45,000"
              sub="This Month"
              icon={DollarSign}
              color="emerald"
            />
            <StatCard
              title="Completed Shifts"
              value="12"
              sub="+2 upcoming"
              icon={Clock}
              color="blue"
            />
            <StatCard
              title="Rating"
              value="4.9"
              sub="Excellent"
              icon={Star}
              color="amber"
            />
          </div>

          {/* Dummy Job Feed */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-800">Assigned Shifts For You</h3>
              <a href="#" className="text-indigo-600 font-semibold hover:underline">View All</a>
            </div>

            <div className="grid gap-4">
              <JobCard
                title="Elderly Care - Night Shift"
                location="Nugegoda, Western Province"
                date="Today, 8:00 PM - 6:00 AM"
                price="LKR 4,500"
                tags={['Nursing', 'Urgent']}
              />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

// Helper Components
const NavItem = ({ icon: Icon, label, active }) => (
  <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${active ? 'bg-indigo-800 text-white shadow-lg shadow-indigo-900/50' : 'text-indigo-200 hover:bg-white/10 hover:text-white'}`}>
    <Icon className="w-5 h-5" />
    <span className="font-medium">{label}</span>
  </button>
);

const StatCard = ({ title, value, sub, icon: Icon, color }) => {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600"
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
          <TrendingUp className="w-3 h-3" /> +12%
        </div>
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-500 font-medium">{title} <span className="text-slate-300">•</span> {sub}</div>
    </div>
  );
};

const JobCard = ({ title, location, date, price, tags }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all cursor-pointer group flex flex-col md:flex-row items-center gap-6">
    <div className="w-14 h-14 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
      {title.charAt(0)}
    </div>
    <div className="flex-1 text-center md:text-left">
      <h4 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{title}</h4>
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-sm text-slate-500 mt-1">
        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {location}</span>
        <span className="hidden md:inline text-slate-300">•</span>
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {date}</span>
      </div>
    </div>
    <div className="flex flex-col items-end gap-2">
      <div className="text-xl font-bold text-slate-900">{price}</div>
      <div className="flex gap-2">
        {tags.map((tag, i) => (
          <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg border border-slate-200">
            {tag}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default WorkerDashboardDemo;
