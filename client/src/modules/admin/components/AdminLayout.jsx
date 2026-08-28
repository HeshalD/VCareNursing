import React, { useState, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import {
  Users, Calendar, DollarSign, Activity,
  Settings, LogOut, Bell, Search,
  ShieldCheck, FileText, SendHorizontal, Stethoscope, Baby, Heart, CalendarDays, AlertTriangle, Wallet, Landmark,
  ChevronLeft, ChevronRight, ChevronDown, ClipboardList, History, HeartPulse, ArrowLeftRight, Banknote, Star, Lock, UserCog, CalendarClock, Briefcase, Receipt, CalendarOff, MonitorSmartphone,
  Menu, X, ReceiptText, Package, Upload, Truck, KeySquare
} from 'lucide-react';
import logo from '../../../assets/Logo/VCareLogo.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  COORDINATOR: 'Coordinator',
  ACCOUNTS: 'Accounts',
};

// Single source of truth for nav sections, shared by the desktop sidebar and the mobile drawer.
// A section with `section: null` renders as a standalone top-level link (no header/collapse).
// `permKey` gates both sidebar visibility and direct-navigation access (see EXTRA_ROUTE_PERMISSIONS
// below) — access is decided purely by staff_permissions via the Permissions page; SUPER_ADMIN
// bypasses every check automatically (see hasPermission in AdminAuthContext).
// Staff roster/assignment sub-pages live under /admin/bookings/:id/... but are
// conceptually part of fulfilling a service request, not the bookings list —
// so they highlight "Service Requests" in the sidebar instead of "Bookings".
const STAFF_ROSTER_OR_ASSIGNMENT_PATH = /^\/admin\/bookings\/[^/]+\/(staff-roster|staff-assignment)$/;

const NAV_SECTIONS = [
  {
    section: null,
    items: [
      { icon: Activity, label: 'Overview', path: '/admin/dashboard', permKey: 'VIEW_DASHBOARD' },
    ],
  },
  {
    section: 'People',
    icon: Users,
    items: [
      { icon: Users, label: 'Client Management', path: '/admin/users', match: (p) => p === '/admin/users' || p.startsWith('/admin/users/'), permKey: 'VIEW_USER_MANAGEMENT' },
      {
        icon: UserCog, label: 'Staff Management', path: '/admin/staff-management',
        match: (p) => p === '/admin/staff-management' || p === '/admin/proxy-user-management'
          || p.startsWith('/admin/staff/') || p === '/admin/staff-roster' || p.startsWith('/admin/staff-history/'),
        permKey: 'VIEW_USER_MANAGEMENT',
      },
      { icon: Settings, label: 'Internal Staff', path: '/admin/internal-staff', match: (p) => p === '/admin/internal-staff' || p.startsWith('/admin/internal-staff/'), permKey: 'VIEW_INTERNAL_STAFF' },
      { icon: Wallet, label: 'Internal Staff Salary', path: '/admin/internal-staff-salary', match: (p) => p.startsWith('/admin/internal-staff-salary'), permKey: 'VIEW_INTERNAL_STAFF_SALARY' },
      { icon: Briefcase, label: 'Salespersons', path: '/admin/salespersons', match: (p) => p === '/admin/salespersons' || p.startsWith('/admin/salespersons/'), permKey: 'VIEW_SALESPERSONS' },
      { icon: Upload, label: 'Bulk Import', path: '/admin/bulk-import', permKey: 'VIEW_BULK_IMPORT' },
    ],
  },
  {
    section: 'Operations',
    icon: SendHorizontal,
    items: [
      {
        icon: SendHorizontal, label: 'Service Requests', path: '/admin/service-requests',
        match: (p) => p === '/admin/service-requests' || p.startsWith('/admin/service-requests/')
          || p === '/admin/proxy-service-requests' || p.startsWith('/admin/quote-builder') || p.startsWith('/admin/modular-quote-builder'),
        // Sidebar highlighting only — staff-roster/staff-assignment pages still require
        // VIEW_BOOKINGS (via Bookings' `match` below), they just read as "Service
        // Requests" work to the admin, so that's what lights up in the sidebar.
        highlightMatch: (p) => p === '/admin/service-requests' || p.startsWith('/admin/service-requests/')
          || p === '/admin/proxy-service-requests' || p.startsWith('/admin/quote-builder') || p.startsWith('/admin/modular-quote-builder')
          || STAFF_ROSTER_OR_ASSIGNMENT_PATH.test(p),
        permKey: 'VIEW_SERVICE_REQUESTS',
      },
      { icon: AlertTriangle, label: 'Termination Requests', path: '/admin/termination-requests', permKey: 'VIEW_TERMINATION_REQUESTS' },
      { icon: CalendarOff, label: 'Leave Requests', path: '/admin/leave-requests', permKey: 'VIEW_STAFF_LEAVES' },
      { icon: CalendarClock, label: 'Upcoming Events', path: '/admin/upcoming-events', permKey: 'VIEW_UPCOMING_EVENTS' },
      {
        icon: CalendarDays, label: 'Bookings', path: '/admin/bookings',
        match: (p) => p === '/admin/bookings' || p.startsWith('/admin/bookings/'),
        highlightMatch: (p) => (p === '/admin/bookings' || p.startsWith('/admin/bookings/')) && !STAFF_ROSTER_OR_ASSIGNMENT_PATH.test(p),
        permKey: 'VIEW_BOOKINGS',
      },
    ],
  },
  {
    section: 'Sales',
    icon: ReceiptText,
    items: [
      { icon: FileText, label: 'Quotations', path: '/admin/quotations', match: (p) => p === '/admin/quotations' || p.startsWith('/admin/quotations/'), permKey: 'VIEW_QUOTATIONS' },
      { icon: Package, label: 'Products', path: '/admin/products', permKey: 'VIEW_PRODUCTS' },
      { icon: ReceiptText, label: 'Invoices', path: '/admin/invoices', permKey: 'VIEW_INVOICES' },
      { icon: FileText, label: 'Statements', path: '/admin/statements', permKey: 'VIEW_STATEMENTS' },
    ],
  },
  {
    section: 'Finance',
    icon: DollarSign,
    items: [
      { icon: DollarSign, label: 'Financials', path: '/admin/financial', permKey: 'VIEW_FINANCIAL' },
      { icon: ArrowLeftRight, label: 'Transactions', path: '/admin/transactions', permKey: 'VIEW_TRANSACTIONS' },
      { icon: Receipt, label: 'Client Payments', path: '/admin/client-payments', permKey: 'VIEW_USER_MANAGEMENT' },
      { icon: Wallet, label: 'Advance Requests', path: '/admin/advance-requests', permKey: 'VIEW_ADVANCE_REQUESTS' },
      { icon: Banknote, label: 'Staff Salaries', path: '/admin/salaries', permKey: 'VIEW_USER_MANAGEMENT' },
      { icon: FileText, label: 'Salary Sheets', path: '/admin/salary-sheets', permKey: 'VIEW_USER_MANAGEMENT' },
      { icon: Landmark, label: 'Bank Accounts', path: '/admin/bank-accounts', permKey: 'VIEW_BANK_ACCOUNTS' },
      { icon: Truck, label: 'Vendors', path: '/admin/vendors', match: (p) => p === '/admin/vendors' || p.startsWith('/admin/vendors/'), permKey: 'VIEW_VENDORS' },
    ],
  },
  {
    section: 'Care',
    icon: HeartPulse,
    items: [
      { icon: HeartPulse, label: 'Care Profiles', path: '/admin/patients', match: (p) => p === '/admin/patients' || p.startsWith('/admin/patients/'), permKey: 'VIEW_PATIENTS' },
      { icon: ClipboardList, label: 'Change Requests', path: '/admin/change-requests', permKey: 'VIEW_CHANGE_REQUESTS' },
      { icon: ShieldCheck, label: 'Worker Verification', path: '/admin/workers', match: (p) => p === '/admin/workers' || p.startsWith('/admin/workers/'), permKey: 'VIEW_WORKER_VERIFICATIONS' },
      { icon: Star, label: 'Reviews', path: '/admin/reviews', permKey: 'VIEW_STAFF_REVIEWS' },
    ],
  },
  {
    section: 'System',
    icon: Settings,
    items: [
      { icon: Lock, label: 'Permissions', path: '/admin/permissions', permKey: 'PERMISSIONS_MANAGE' },
      { icon: KeySquare, label: 'Roles', path: '/admin/roles', permKey: 'PERMISSIONS_MANAGE' },
      { icon: MonitorSmartphone, label: 'Active Sessions', path: '/admin/active-sessions', permKey: 'VIEW_ACTIVE_SESSIONS' },
      { icon: History, label: 'Activity Log', path: '/admin/activity-log', permKey: 'VIEW_ACTIVITY_LOG' },
      { icon: FileText, label: 'Reports', path: '/admin/reports', match: (p) => p.startsWith('/admin/reports'), permKey: 'VIEW_FINANCIAL' },
    ],
  },
];

// Routes reachable by direct navigation but not represented as their own sidebar item
// (detail/sub-pages of a list above). Gated by the same permission as their parent page.
const EXTRA_ROUTE_PERMISSIONS = [
  { match: (p) => p === '/admin/staff-history' || p.startsWith('/admin/staff-history/'), permKey: 'VIEW_ADVANCE_REQUESTS' },
  { match: (p) => p === '/admin/settings', permKey: 'VIEW_SETTINGS' },
];

const findRouteRule = (pathname) => {
  for (const group of NAV_SECTIONS) {
    for (const item of group.items) {
      if (item.match ? item.match(pathname) : pathname === item.path) return item;
    }
  }
  return EXTRA_ROUTE_PERMISSIONS.find((rule) => rule.match(pathname)) || null;
};

const SECTION_STORAGE_KEY = 'adminSidebarCollapsedSections';

// Every page mounts its own <AdminLayout>, so the sidebar <nav> is a fresh DOM
// node on every navigation and its scrollTop resets to 0 — module-level (not
// component) state so it survives the unmount/remount and the sidebar stays
// put when clicking an item further down (e.g. Activity Log).
let sidebarScrollTop = 0;

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
  const { adminToken, isSuperAdmin, hasPermission, permissionsLoaded } = useAdminAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  // Restore the sidebar's scroll position before paint so it never visibly jumps to top.
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = sidebarScrollTop;
  }, []);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  });

  const toggleSection = (section) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Expanding a section from the collapsed (icon-only) sidebar should open the full sidebar with that section visible.
  const expandSection = (section) => {
    setCollapsed(false);
    setCollapsedSections((prev) => {
      const next = { ...prev, [section]: false };
      localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const adminInfo = useMemo(() => {
    if (!adminToken) return { name: 'Admin User', roleLabel: 'Admin' };
    const payload = parseToken(adminToken);
    if (!payload) return { name: 'Admin User', roleLabel: 'Admin' };
    const rawRole = typeof payload.role === 'string'
      ? payload.role.replace(/[{}]/g, '').split(',')[0].trim()
      : 'Admin';
    return {
      name: payload.full_name || (rawRole === 'SUPER_ADMIN' ? 'Admin' : formatMobileNumber(payload.mobile_number)) || 'Admin',
      roleLabel: ROLE_LABELS[rawRole] || rawRole,
    };
  }, [adminToken]);

  const itemActive = (item) => {
    const test = item.highlightMatch || item.match;
    return test ? test(location.pathname) : location.pathname === item.path;
  };
  const canAccess = (item) => hasPermission(item.permKey);

  // Hide sidebar items/sections the current user has no permission for; SUPER_ADMIN sees everything.
  const visibleNavSections = useMemo(() => {
    return NAV_SECTIONS
      .map((group) => ({ ...group, items: group.items.filter(canAccess) }))
      .filter((group) => group.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, hasPermission]);

  // Client-side guard for direct navigation to a page the current user isn't permissioned for.
  const routeRule = findRouteRule(location.pathname);
  const routeAllowed = !routeRule || canAccess(routeRule);

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
      <aside className={`bg-white text-slate-700 border-r border-slate-200 hidden md:flex flex-col flex-shrink-0 transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <img src={logo} alt="VCare" className={`rounded-md object-contain ${collapsed ? 'w-8 h-8' : 'w-10 h-10'}`} />
            {!collapsed && <span className="text-xl font-bold tracking-tight text-slate-900">VCare Admin</span>}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav
          ref={navRef}
          onScroll={(e) => { sidebarScrollTop = e.currentTarget.scrollTop; }}
          className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-hide"
        >
          {visibleNavSections.map((group, idx) => (
            <SidebarSection
              key={group.section || `top-${idx}`}
              section={group.section}
              sectionIcon={group.icon}
              items={group.items}
              itemActive={itemActive}
              collapsed={collapsed}
              isOpen={!collapsedSections[group.section]}
              onToggle={() => toggleSection(group.section)}
              onExpand={() => expandSection(group.section)}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200">
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 text-slate-500 hover:text-slate-900 transition-colors w-full px-3 py-2 rounded-lg hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`}
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
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white text-slate-700 flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <img src={logo} alt="VCare" className="w-9 h-9 rounded-md object-contain" />
                <span className="text-lg font-bold tracking-tight text-slate-900">VCare Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto scrollbar-hide">
              {visibleNavSections.map((group, idx) => (
                <SidebarSection
                  key={group.section || `top-${idx}`}
                  section={group.section}
                  sectionIcon={group.icon}
                  items={group.items}
                  itemActive={itemActive}
                  collapsed={false}
                  isOpen={!collapsedSections[group.section]}
                  onToggle={() => toggleSection(group.section)}
                  onExpand={() => {}}
                />
              ))}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 text-slate-500 hover:text-slate-900 transition-colors w-full px-3 py-2 rounded-lg hover:bg-slate-100"
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
            {!permissionsLoaded ? (
              <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
            ) : !routeAllowed ? (
              <AccessDenied />
            ) : (
              <>
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
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const SidebarSection = ({ section, sectionIcon, items, itemActive, collapsed, isOpen, onToggle, onExpand }) => {
  // Standalone links (no section label, e.g. "Overview") always render flat - they're already a "main topic".
  if (!section) {
    return items.map((item) => (
      <SidebarItem
        key={item.path}
        icon={item.icon}
        label={item.label}
        path={item.path}
        active={itemActive(item)}
        collapsed={collapsed}
      />
    ));
  }

  // When the sidebar itself is icon-only, only show one icon per main topic (section), not every item inside it.
  if (collapsed) {
    const active = items.some(itemActive);
    return (
      <button
        onClick={onExpand}
        title={section}
        className={`w-full flex items-center justify-center px-3 py-2 rounded-lg mb-1 transition-colors duration-200 ${active
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
          }`}
      >
        {sectionIcon && React.createElement(sectionIcon, { className: 'w-4 h-4' })}
      </button>
    );
  }

  const sectionActive = items.some(itemActive);

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
          sectionActive
            ? 'text-blue-600 bg-blue-50'
            : 'text-slate-400 hover:text-slate-600'
        }`}
      >
        <span className="flex items-center gap-2">
          {sectionIcon && React.createElement(sectionIcon, { className: 'w-3.5 h-3.5' })}
          {section}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
      </button>
      {isOpen && (
        <div className="space-y-0.5 mt-0.5 pl-2 border-l border-slate-200 ml-3">
          {items.map((item) => (
            <SidebarItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              active={itemActive(item)}
              collapsed={collapsed}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, path, active, badge, collapsed, nested }) => (
  <Link
    to={path}
    title={label}
    className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 ${nested ? 'py-1.5' : 'py-2'} rounded-lg mb-1 transition-colors duration-200 ${active
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
  >
    <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
      <Icon className="w-4 h-4" />
      {!collapsed && <span className="font-medium text-xs">{label}</span>}
    </div>
    {!collapsed && badge && (
      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge}</span>
    )}
  </Link>
);

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center h-64 text-center">
    <Lock className="w-10 h-10 text-slate-300 mb-3" />
    <p className="font-semibold text-slate-700">You don't have access to this page</p>
    <p className="text-sm text-slate-400 mt-1">Ask a Super Admin to grant you the relevant permission.</p>
  </div>
);

export default AdminLayout;
