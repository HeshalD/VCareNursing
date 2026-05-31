import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  User, Calendar, FileText, Stethoscope,
  MessageSquare, Wallet, LogOut, ChevronLeft,
  ChevronRight, Menu, ChevronDown, Briefcase, Star
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import logoUrl from '../../../assets/Logo/VCareLogo.png';

const NAV_ITEMS = [
  { icon: User, label: 'Profile', path: '/client/profile' },
  { icon: Calendar, label: 'Bookings', path: '/client/bookings' },
  { icon: FileText, label: 'Service Requests', path: '/client/service-requests' },
  { icon: Stethoscope, label: 'Patients', path: '/client/patients' },
  { icon: Wallet, label: 'Financial', path: '/client/financial' },
  { icon: MessageSquare, label: 'Reviews', path: '/client/reviews' },
];

const ClientLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const isActive = (path) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getUserDisplayName = () => {
    if (user?.full_name) return user.full_name;
    if (user?.client_info?.name) return user.client_info.name;
    if (user?.staff_info?.name) return user.staff_info.name;
    return user?.mobile_number || 'User';
  };

  const isStaffUser = () => {
    const staffRoles = ['{CARETAKER}', '{NURSE}', '{NANNY}', '{ACCOUNTS}', '{COORDINATOR}', '{SALES}', '{STORE_MANAGER}'];
    const userRole = user?.role;
    if (Array.isArray(userRole)) {
      return userRole.some(role => staffRoles.includes(role));
    }
    return staffRoles.includes(userRole);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} bg-white border-r border-slate-200 flex-col flex-shrink-0 transition-all duration-300 hidden md:flex`}
      >
        {/* Logo */}
        <div className={`h-16 flex items-center border-b border-slate-200 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
          <Link to="/" className="flex-shrink-0 flex items-center">
            <img
              src={logoUrl}
              alt="VCare Nursing"
              className={`w-auto object-contain ${collapsed ? 'h-8' : 'h-10'}`}
            />
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${collapsed ? 'justify-center' : ''} ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: Logout + Collapse */}
        <div className="p-3 border-t border-slate-200 space-y-1">
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5 flex-shrink-0" /> : <ChevronLeft className="w-5 h-5 flex-shrink-0" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-white border-r border-slate-200 flex flex-col">
            <div className="h-16 flex items-center px-5 border-b border-slate-200">
              <Link to="/" onClick={() => setMobileOpen(false)} className="flex-shrink-0">
                <img src={logoUrl} alt="VCare Nursing" className="h-10 w-auto object-contain" />
              </Link>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ icon: Icon, label, path }) => {
                const active = isActive(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button
                onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 bg-white/80 backdrop-blur-lg border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link to="/" className="md:hidden flex-shrink-0">
              <img src={logoUrl} alt="VCare Nursing" className="h-8 w-auto object-contain" />
            </Link>
            <span className="hidden md:block text-sm font-medium text-slate-500">
              My Account
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isStaffUser() && (
              <Link
                to="/services/provider-dashboard"
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-all"
              >
                <Briefcase className="w-3.5 h-3.5" />
                Staff Dashboard
              </Link>
            )}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-full transition-all"
              >
                <User className="w-4 h-4 text-slate-600" />
                <span className="text-sm font-medium text-slate-900 hidden sm:inline">{getUserDisplayName()}</span>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-900">{getUserDisplayName()}</p>
                    <p className="text-xs text-slate-500">Client Portal</p>
                  </div>
                  <Link
                    to="/client/profile"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    My Profile
                  </Link>
                  <Link
                    to="/client/bookings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Calendar className="w-4 h-4 text-slate-400" />
                    My Bookings
                  </Link>
                  <Link
                    to="/client/service-requests"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    Service Requests
                  </Link>
                  <Link
                    to="/client/patients"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Stethoscope className="w-4 h-4 text-slate-400" />
                    Patients
                  </Link>
                  <Link
                    to="/client/financial"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-slate-400" />
                    Financial
                  </Link>
                  <Link
                    to="/client/reviews"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Star className="w-4 h-4 text-slate-400" />
                    Reviews
                  </Link>
                  <div className="border-t border-slate-100 my-1"></div>
                  <button
                    onClick={() => { handleLogout(); setDropdownOpen(false); }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ClientLayout;
