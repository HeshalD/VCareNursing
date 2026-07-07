import React, { useState, useMemo, useEffect } from 'react';
import {
  Users, Calendar, DollarSign, Activity,
  Settings, LogOut, Bell, Search,
  ShieldCheck, FileText, SendHorizontal, Stethoscope, Baby, Heart, CalendarDays, AlertTriangle, Wallet, Landmark,
  ChevronLeft, ChevronRight, ClipboardList, History, HeartPulse, ArrowLeftRight, Banknote, Star, Lock, UserCog, CalendarClock, Briefcase, Receipt, CalendarOff, MonitorSmartphone,
  Menu, X, ReceiptText
} from 'lucide-react';
import logo from '../../../assets/Logo/VCareLogo.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import apiClient from '../../../api/api';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  COORDINATOR: 'Coordinator',
  ACCOUNTS: 'Accounts',
};

// Single source of truth for nav items, shared by the desktop sidebar and the mobile drawer.
const NAV_ITEMS = [
  { icon: Activity, label: 'Overview', path: '/admin/dashboard' },
  { icon: Users, label: 'Client Management', path: '/admin/users', match: (p) => p === '/admin/users' || p.startsWith('/admin/users/') },
  { icon: UserCog, label: 'Staff Management', path: '/admin/staff-management', match: (p) => p === '/admin/staff-management' || p === '/admin/proxy-user-management' },
  { icon: Settings, label: 'Internal Staff', path: '/admin/internal-staff' },
  { icon: Briefcase, label: 'Salespersons', path: '/admin/salespersons' },
  { icon: SendHorizontal, label: 'Service Requests', path: '/admin/service-requests' },
  { icon: AlertTriangle, label: 'Termination Requests', path: '/admin/termination-requests' },
  { icon: CalendarClock, label: 'Upcoming Events', path: '/admin/upcoming-events' },
  { icon: CalendarOff, label: 'Leave Requests', path: '/admin/leave-requests' },
  { icon: CalendarDays, label: 'Bookings', path: '/admin/bookings' },
  { icon: ReceiptText, label: 'Daily Invoices', path: '/admin/invoices' },
  { icon: FileText, label: 'Statements', path: '/admin/statements' },
  { icon: Wallet, label: 'Advance Requests', path: '/admin/advance-requests' },
  { icon: ShieldCheck, label: 'Worker Verification', path: '/admin/workers' },
  { icon: DollarSign, label: 'Financials', path: '/admin/financial' },
  { icon: ArrowLeftRight, label: 'Transactions', path: '/admin/transactions' },
  { icon: Receipt, label: 'Client Payments', path: '/admin/client-payments' },
  { icon: Banknote, label: 'Staff Salaries', path: '/admin/salaries' },
  { icon: FileText, label: 'Salary Sheets', path: '/admin/salary-sheets' },
  { icon: Landmark, label: 'Bank Accounts', path: '/admin/bank-accounts' },
  { icon: FileText, label: 'Quotations', path: '/admin/quotations' },
  { icon: FileText, label: 'Reports', path: '/admin/reports', match: (p) => p.startsWith('/admin/reports') },
  { icon: HeartPulse, label: 'Care Profiles', path: '/admin/patients' },
  { icon: ClipboardList, label: 'Change Requests', path: '/admin/change-requests' },
  { icon: Star, label: 'Reviews', path: '/admin/reviews' },
  { icon: Lock, label: 'Permissions', path: '/admin/permissions' },
  { icon: MonitorSmartphone, label: 'Active Sessions', path: '/admin/active-sessions' },
  { icon: History, label: 'Activity Log', path: '/admin/activity-log' },
];

const parseToken = (token) => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};

const AdminLayout = ({ children, title, subtitle, actions }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { adminToken } = useAdminAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const adminInfo = useMemo(() => {
    if (!adminToken) return { name: 'Admin User', roleLabel: 'Admin' };
    const payload = parseToken(adminToken);
    if (!payload) return { name: 'Admin User', roleLabel: 'Admin' };
    const rawRole = typeof payload.role === 'string'
      ? payload.role.replace(/[{}]/g, '').split(',')[0].trim()
      : 'Admin';
    return {
      name: payload.full_name || (rawRole === 'SUPER_ADMIN' ? 'Admin' : payload.mobile_number) || 'Admin',
      roleLabel: ROLE_LABELS[rawRole] || rawRole,
    };
  }, [adminToken]);

  const itemActive = (item) => (item.match ? item.match(location.pathname) : location.pathname === item.path);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await apiClient.deviceLogout();
    } catch {
      // best-effort - still log the user out locally even if this fails
    }
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin');
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar (desktop) */}
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
          {NAV_ITEMS.map((item) => (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              active={itemActive(item)}
              collapsed={collapsed}
            />
          ))}
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <img src={logo} alt="VCare" className="w-9 h-9 rounded-md object-contain" />
                <span className="text-lg font-bold tracking-tight">VCare Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => (
                <SidebarItem
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  path={item.path}
                  active={itemActive(item)}
                  collapsed={false}
                />
              ))}
            </nav>
            <div className="p-3 border-t border-slate-800">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors w-full px-3 py-2 rounded-lg hover:bg-slate-800"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 text-slate-500 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 flex-shrink-0"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-medium text-slate-900 hidden sm:inline">Admin</span>
            <span className="hidden sm:inline">/</span>
            <span className="text-blue-600 font-medium truncate">{title || 'Dashboard'}</span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
            <div className="relative hidden lg:block">
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
            <div className="flex items-center gap-3 pl-4 sm:pl-6 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="font-bold text-sm text-slate-900">{adminInfo.name}</p>
                <p className="text-xs text-slate-500">{adminInfo.roleLabel}</p>
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-200 rounded-full overflow-hidden border-2 border-slate-100">
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(adminInfo.name)}&background=0D8ABC&color=fff`}
                  alt={adminInfo.name}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Page Header */}
            {(title || actions) && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  {title && <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>}
                  {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
