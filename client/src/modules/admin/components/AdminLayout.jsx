import React, { useState } from 'react';
import {
  Users, Calendar, DollarSign, Activity,
  Settings, LogOut, Bell, Search,
  ShieldCheck, FileText, SendHorizontal, Stethoscope, Baby, Heart, CalendarDays, AlertTriangle, Wallet, Landmark,
  ChevronLeft, ChevronRight, ClipboardList, History, HeartPulse, ArrowLeftRight
} from 'lucide-react';
import logo from '../../../assets/Logo/VCareLogo.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const AdminLayout = ({ children, title, subtitle, actions }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    // Clear any authentication tokens/user data here if needed
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white hidden md:flex flex-col flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img src={logo} alt="VCare" className={`rounded-md object-contain ${collapsed ? 'w-8 h-8' : 'w-10 h-10'}`} />
            {!collapsed && <span className="text-xl font-bold tracking-tight">VCare Admin</span>}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <SidebarItem
            icon={Activity}
            label="Overview"
            path="/admin/dashboard"
            active={isActive('/admin/dashboard')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={Users}
            label="User Management"
            path="/admin/users"
            active={isActive('/admin/users') || isActive('/admin/proxy-user-management')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={SendHorizontal}
            label="Service Requests"
            path="/admin/service-requests"
            active={isActive('/admin/service-requests')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={AlertTriangle}
            label="Termination Requests"
            path="/admin/termination-requests"
            active={isActive('/admin/termination-requests')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={CalendarDays}
            label="Bookings"
            path="/admin/bookings"
            active={isActive('/admin/bookings')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={FileText}
            label="Statements"
            path="/admin/statements"
            active={isActive('/admin/statements')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={Wallet}
            label="Advance Requests"
            path="/admin/advance-requests"
            active={isActive('/admin/advance-requests')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={ShieldCheck}
            label="Worker Verification"
            path="/admin/workers"
            active={isActive('/admin/workers')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={DollarSign}
            label="Financials"
            path="/admin/financial"
            active={isActive('/admin/financial')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={ArrowLeftRight}
            label="Transactions"
            path="/admin/transactions"
            active={isActive('/admin/transactions')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={Landmark}
            label="Bank Accounts"
            path="/admin/bank-accounts"
            active={isActive('/admin/bank-accounts')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={FileText}
            label="Quotations"
            path="/admin/quotations"
            active={isActive('/admin/quotations')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={FileText}
            label="Reports"
            path="/admin/reports"
            active={location.pathname.startsWith('/admin/reports')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={HeartPulse}
            label="Care Profiles"
            path="/admin/patients"
            active={isActive('/admin/patients')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={ClipboardList}
            label="Change Requests"
            path="/admin/change-requests"
            active={isActive('/admin/change-requests')}
            collapsed={collapsed}
          />
          <SidebarItem
            icon={History}
            label="Activity Log"
            path="/admin/activity-log"
            active={isActive('/admin/activity-log')}
            collapsed={collapsed}
          />
          {/*
          <SidebarItem
            icon={Settings}
            label="Settings"
            path="/admin/settings"
            active={isActive('/admin/settings')}
          />*/}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 text-slate-400 hover:text-white transition-colors w-full px-3 py-2 rounded-lg hover:bg-slate-800 ${collapsed ? 'justify-center' : ''}`}
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="font-medium">Logout</span>}
          </button>
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

const SidebarItem = ({ icon: Icon, label, path, active, badge, collapsed }) => (
  <Link
    to={path}
    title={label}
    className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-lg mb-1 transition-colors duration-200 ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
  >
    <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
      <Icon className="w-5 h-5" />
      {!collapsed && <span className="font-medium text-sm">{label}</span>}
    </div>
    {!collapsed && badge && (
      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
    )}
  </Link>
);

export default AdminLayout;
