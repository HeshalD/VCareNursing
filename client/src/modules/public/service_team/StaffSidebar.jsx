import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, User, DollarSign, Settings, LogOut, Briefcase, Calendar 
} from 'lucide-react';

const NavItem = ({ icon: Icon, label, to, active }) => {
  return (
    <Link
      to={to}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
        active 
          ? 'bg-indigo-800 text-white shadow-lg shadow-indigo-900/50' 
          : 'text-indigo-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );
};

const StaffSidebar = ({ staffProfileId }) => {
  const location = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-72 bg-indigo-900 text-white p-6 sticky top-0 h-screen shadow-2xl">
      <div className="flex items-center gap-3 mb-10 text-emerald-400">
        <Briefcase className="w-8 h-8" />
        <span className="text-2xl font-bold text-white tracking-tight">VCare<span className="text-indigo-300">Pro</span></span>
      </div>

      <nav className="flex-1 space-y-2">
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
          icon={Settings} 
          label="Settings" 
          to="/services/settings" 
          active={location.pathname === '/services/settings'} 
        />
      </nav>

      <div className="pt-6 border-t border-indigo-800">
        <button className="flex items-center gap-3 text-indigo-300 hover:text-white transition-colors w-full px-4 py-3 rounded-xl hover:bg-white/10">
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default StaffSidebar;
