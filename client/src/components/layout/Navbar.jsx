import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, User, LogOut, Briefcase, Calendar, ChevronDown, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import logoUrl from '../../assets/Logo/VCareLogo.png';
const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { user, isAuthenticated, logout, loading } = useAuth();
  const navigate = useNavigate();

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.location.href = `/#${id}`;
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setIsOpen(false);
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getUserDisplayName = () => {
    // Use full_name from AuthContext (from JWT payload)
    if (user?.full_name) {
      return user.full_name;
    }
    // Fallback to nested info objects for backward compatibility
    if (user?.client_info?.name) {
      return user.client_info.name;
    }
    if (user?.staff_info?.name) {
      return user.staff_info.name;
    }
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

  const isClientUser = () => {
    const clientRoles = ['{CLIENT}'];
    const userRole = user?.role;

    if (Array.isArray(userRole)) {
      return userRole.some(role => clientRoles.includes(role));
    }
    return clientRoles.includes(userRole);
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0 flex items-center gap-2">
            <img src={logoUrl} alt="VCare Nursing" className="h-10 w-auto object-contain" />
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Home</Link>
            <button onClick={() => scrollToSection('services')} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Services</button>
            <Link to="/about" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">About</Link>

            {loading ? (
              <div className="w-20 h-8 bg-slate-200 rounded-full animate-pulse"></div>
            ) : isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/client/bookings"
                  className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-full text-sm font-medium transition-all"
                  title="My Bookings"
                >
                  <Calendar className="w-4 h-4" />
                </Link>
                {isStaffUser() && (
                  <Link
                    to="/services/provider-dashboard"
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-sm font-medium transition-all"
                  >
                    <Briefcase className="w-4 h-4" />
                    <span className="hidden sm:inline">Dashboard</span>
                  </Link>
                )}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 rounded-full transition-all"
                  >
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">{getUserDisplayName()}</span>
                    <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50"
                    >
                      <Link
                        to="/client/profile"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        My Profile
                      </Link>
                      <Link
                        to="/client/bookings"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Calendar className="w-4 h-4 text-slate-400" />
                        My Bookings
                      </Link>
                      <Link
                        to="/client/service-requests"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Briefcase className="w-4 h-4 text-slate-400" />
                        Service Requests
                      </Link>
                      <Link
                        to="/client/patients"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <Users className="w-4 h-4 text-slate-400" />
                        Patients
                      </Link>
                      {isStaffUser() && (
                        <Link
                          to="/services/provider-dashboard"
                          className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          <Briefcase className="w-4 h-4 text-slate-400" />
                          Staff Dashboard
                        </Link>
                      )}
                      <div className="border-t border-slate-100 my-2"></div>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-slate-600 hover:text-slate-900">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-white border-b border-slate-200 shadow-xl"
        >
          <div className="px-4 pt-2 pb-6 space-y-2">
            <Link to="/" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 bg-slate-50 rounded-lg">Home</Link>
            <button onClick={() => { scrollToSection('services'); setIsOpen(false); }} className="block w-full text-left px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg">Services</button>
            <Link to="/about" className="block px-3 py-2 text-base font-medium text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-lg">About</Link>

            {loading ? (
              <div className="w-full h-12 bg-slate-200 rounded-xl animate-pulse mt-4"></div>
            ) : isAuthenticated ? (
              <>
                <Link
                  to="/client/bookings"
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl font-medium transition-all"
                >
                  <Calendar className="w-4 h-4" />
                  My Bookings
                </Link>
                {isStaffUser() && (
                  <Link
                    to="/services/provider-dashboard"
                    className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all mt-4"
                  >
                    <Briefcase className="w-4 h-4" />
                    Staff Dashboard
                  </Link>
                )}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-3 bg-blue-50 hover:bg-blue-100 rounded-xl mt-4 transition-all w-full"
                  >
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">{getUserDisplayName()}</span>
                    <ChevronDown className={`w-4 h-4 text-blue-600 transition-transform ml-auto ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50"
                    >
                      <Link
                        to="/client/profile"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => { setIsDropdownOpen(false); setIsOpen(false); }}
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        My Profile
                      </Link>
                      <Link
                        to="/client/bookings"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => { setIsDropdownOpen(false); setIsOpen(false); }}
                      >
                        <Calendar className="w-4 h-4 text-slate-400" />
                        My Bookings
                      </Link>
                      <Link
                        to="/client/patients"
                        className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => { setIsDropdownOpen(false); setIsOpen(false); }}
                      >
                        <Users className="w-4 h-4 text-slate-400" />
                        Patients
                      </Link>
                      {isStaffUser() && (
                        <Link
                          to="/services/provider-dashboard"
                          className="flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => { setIsDropdownOpen(false); setIsOpen(false); }}
                        >
                          <Briefcase className="w-4 h-4 text-slate-400" />
                          Staff Dashboard
                        </Link>
                      )}
                      <div className="border-t border-slate-100 my-2"></div>
                      <button
                        onClick={() => { handleLogout(); setIsOpen(false); }}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </motion.div>
                  )}
                </div>
              </>
            ) : (
              <Link to="/login" className="block w-full text-center mt-4 px-5 py-3 bg-blue-600 text-white rounded-xl font-medium">
                Login Portal
              </Link>
            )}
          </div>
        </motion.div>
      )}
    </nav>
  );
};

export default Navbar;
