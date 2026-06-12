import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, User, DollarSign, Settings, LogOut, Briefcase, Calendar, FilePen
} from 'lucide-react';
import logoUrl from '../../../assets/Logo/VCareLogo.png';

const NavItem = ({ icon: Icon, label, to, active }) => {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
};

const StaffSidebar = ({ staffProfileId }) => {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 flex-shrink-0 h-full">
      <div className="h-16 flex items-center border-b border-slate-200 px-5">
        <Link to="/services/provider-dashboard" className="flex-shrink-0 flex items-center">
          <img src={logoUrl} alt="VCare Nursing" className="h-10 w-auto object-contain" />
        </Link>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <Link
          to="/"
          className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 hover:bg-blue-50 transition-colors group"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-100">
            <Briefcase className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Provider Portal</p>
            <p className="text-xs text-blue-600 truncate">Go to client view →</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavItem 
          icon={LayoutDashboard} 
          label="Dashboard" 
          to="/services/provider-dashboard" 
          active={location.pathname === '/services/provider-dashboard'} 
        />
        <NavItem 
          icon={DollarSign} 
          label="Earnings" 
          to="/services/earnings" 
          active={location.pathname === '/services/earnings'} 
        />
        <NavItem 
          icon={Calendar}
          label="Bookings"
          to="/services/bookings"
          active={location.pathname === '/services/bookings'}
        />
        <NavItem 
          icon={User} 
          label="My Profile" 
          to="/services/my-profile" 
          active={location.pathname === '/services/my-profile'}
        />
        <NavItem
          icon={FilePen}
          label="Request Change"
          to="/services/change-request"
          active={location.pathname === '/services/change-request'}
        />
        <NavItem
          icon={Settings}
          label="Settings"
          to="/services/settings"
          active={location.pathname === '/services/settings'}
        />
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-1">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full">
          <LogOut className="w-5 h-5 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default StaffSidebar;