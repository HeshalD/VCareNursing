import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, User, DollarSign, LogOut, Briefcase, Calendar, FilePen, CalendarOff,
  Menu, X
} from 'lucide-react';
import logoUrl from '../../../assets/Logo/VCareLogo.png';
import { useAuth } from '../../../context/AuthContext';
import LanguageToggle from '../../../i18n/LanguageToggle';

const NAV_ITEMS = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', to: '/services/provider-dashboard' },
  { icon: DollarSign, labelKey: 'nav.earnings', to: '/services/earnings' },
  { icon: Calendar, labelKey: 'nav.bookings', to: '/services/bookings' },
  { icon: User, labelKey: 'nav.myProfile', to: '/services/my-profile' },
  { icon: FilePen, labelKey: 'nav.requestChange', to: '/services/change-request' },
  { icon: CalendarOff, labelKey: 'nav.requestLeave', to: '/services/leave-request' },
];

const NavItem = ({ icon: Icon, labelKey, to, active, onClick }) => {
  const { t } = useTranslation('staffSidebar');
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-blue-50 text-blue-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="truncate">{t(labelKey)}</span>
    </Link>
  );
};

const ProviderPortalCard = ({ onClick }) => {
  const { t } = useTranslation('staffSidebar');
  return (
    <Link
      to="/"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 hover:bg-blue-50 transition-colors group"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-100">
        <Briefcase className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{t('providerPortal.title')}</p>
        <p className="text-xs text-blue-600 truncate">{t('providerPortal.subtitle')}</p>
      </div>
    </Link>
  );
};

const StaffSidebar = ({ staffProfileId, title }) => {
  const { t } = useTranslation('staffSidebar');
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const closeDrawer = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between h-14 px-4 bg-white border-b border-slate-200 flex-shrink-0">
        <Link to="/services/provider-dashboard" className="flex-shrink-0 flex items-center">
          <img src={logoUrl} alt="VCare Nursing" className="h-8 w-auto object-contain" />
        </Link>
        {title && <span className="text-sm font-semibold text-slate-700 truncate px-2">{title}</span>}
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -mr-2 rounded-lg text-slate-600 hover:bg-slate-50"
            aria-label={t('openMenu')}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white border-r border-slate-200 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200">
              <Link to="/services/provider-dashboard" onClick={closeDrawer} className="flex-shrink-0">
                <img src={logoUrl} alt="VCare Nursing" className="h-8 w-auto object-contain" />
              </Link>
              <button
                onClick={closeDrawer}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50"
                aria-label={t('closeMenu')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-4 border-b border-slate-100">
              <ProviderPortalCard onClick={closeDrawer} />
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  active={location.pathname === item.to}
                  onClick={closeDrawer}
                />
              ))}
            </nav>
            <div className="p-3 border-t border-slate-200">
              <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full">
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-200 flex-shrink-0 h-full">
        <div className="h-16 flex items-center border-b border-slate-200 px-5">
          <Link to="/services/provider-dashboard" className="flex-shrink-0 flex items-center">
            <img src={logoUrl} alt="VCare Nursing" className="h-10 w-auto object-contain" />
          </Link>
        </div>

        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <ProviderPortalCard />
          <LanguageToggle className="w-full justify-center" />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              active={location.pathname === item.to}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-200 space-y-1">
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all w-full">
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default StaffSidebar;
