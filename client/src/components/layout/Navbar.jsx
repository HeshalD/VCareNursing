import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Menu, X, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
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
  };

  const getUserDisplayName = () => {
    if (user?.client_info?.name) {
      return user.client_info.name;
    }
    if (user?.staff_info?.name) {
      return user.staff_info.name;
    }
    return user?.mobile_number || 'User';
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">VCare<span className="text-blue-500">.</span></span>
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
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">{getUserDisplayName()}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-full text-sm font-medium transition-all"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
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
                <div className="flex items-center gap-2 px-3 py-3 bg-blue-50 rounded-xl mt-4">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">{getUserDisplayName()}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-2 w-full px-5 py-3 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
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
