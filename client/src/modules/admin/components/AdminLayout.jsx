import React from 'react';
import {
  Users, Calendar, DollarSign, Activity,
  Settings, LogOut, Bell, Search,
  ShieldCheck, FileText, Stethoscope, Baby, Heart
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const AdminLayout = ({ children, title, subtitle, actions }) => {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col flex-shrink-0 transition-all duration-300">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">V</div>
            <span className="text-xl font-bold tracking-tight">VCare Admin</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <SidebarItem
            icon={Activity}
            label="Overview"
            path="/admin/dashboard"
            active={isActive('/admin/dashboard')}
          />
          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Management</p>
          </div>
          <SidebarItem
            icon={Users}
            label="User Management"
            path="/admin/users"
            active={isActive('/admin/users')}
          />
          <SidebarItem
            icon={ShieldCheck}
            label="Worker Verification"
            path="/admin/workers"
            badge="3"
            active={isActive('/admin/workers')}
          />
          <SidebarItem
            icon={DollarSign}
            label="Financials"
            path="/admin/financial"
            active={isActive('/admin/financial')}
          />
          <SidebarItem
            icon={FileText}
            label="Reports"
            path="/admin/reports"
            active={isActive('/admin/reports')}
          />
          <SidebarItem
            icon={Settings}
            label="Settings"
            path="/admin/settings"
            active={isActive('/admin/settings')}
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <Link to="/login" className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors w-full px-4 py-2 rounded-lg hover:bg-slate-800">
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-8 flex-shrink-0">
          <div className="flex items-center gap-4 text-slate-500">
            <span className="font-medium text-slate-900">Admin</span>
            <span>/</span>
            <span className="text-blue-600 font-medium">{title || 'Dashboard'}</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-2 bg-slate-100 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 w-64 transition-all"
              />
            </div>
            <button className="relative text-slate-500 hover:text-slate-700 transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="font-bold text-sm text-slate-900">Admin User</p>
                <p className="text-xs text-slate-500">Super Admin</p>
              </div>
              <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden border-2 border-slate-100">
                <img src="https://ui-avatars.com/api/?name=Admin+User&background=0D8ABC&color=fff" alt="Admin" />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Page Header */}
            {(title || actions) && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  {title && <h1 className="text-2xl font-bold text-slate-900">{title}</h1>}
                  {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
                </div>
                {actions && <div className="flex gap-2">{actions}</div>}
              </div>
            )}

            {/* Content Children */}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, path, active, badge }) => (
  <Link
    to={path}
    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg mb-1 transition-all ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
  >
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5" />
      <span className="font-medium text-sm">{label}</span>
    </div>
    {badge && (
      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
    )}
  </Link>
);

export default AdminLayout;
