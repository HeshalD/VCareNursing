import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import loginBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const StaffPasswordChangePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  // Get user data from location state or localStorage
  const userData = location.state?.userData || JSON.parse(localStorage.getItem('tempUserData') || '{}');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!formData.current_password || !formData.new_password || !formData.confirm_password) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.new_password.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    if (formData.new_password !== formData.confirm_password) {
      setError('New passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      
      const response = await apiClient.changeStaffPassword({
        current_password: formData.current_password,
        new_password: formData.new_password
      });
      
      if (response.token) {
        // Update auth context with new token
        login(response.token, {
          ...userData,
          requires_password_change: false
        });
        
        // Clear temp data
        localStorage.removeItem('tempUserData');
        
        setSuccess(true);
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err) {
      setError(err.message || 'Password change failed. Please try again.');
      console.error('Password change error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen w-full flex bg-slate-50">
        {/* Left Side - Image & Branding */}
        <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
          <img
            src={loginBg}
            alt="Nurse caring for patient"
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
        </div>

        {/* Right Side - Success Message */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
          <div className="w-full max-w-md text-center space-y-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Password Changed Successfully!</h2>
              <p className="text-slate-600">
                Your password has been updated. You will be redirected to your dashboard shortly.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
        <img
          src={loginBg}
          alt="Nurse caring for patient"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col justify-center h-full p-16 max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-5xl font-bold text-white mb-6 leading-tight"
          >
            Secure Your Account
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-300 leading-relaxed font-light"
          >
            Set your new password to continue accessing your VCare staff dashboard.
            Choose a strong password that you'll remember.
          </motion.p>
        </div>
      </div>

      {/* Right Side - Password Change Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-8">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-slate-900">Change Password</h2>
                <p className="text-slate-600 text-sm">
                  First time login? Please set your new password.
                </p>
              </div>
            </div>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              {/* Current Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Temporary Password
                </label>
                <div className="relative group">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Enter your temporary password"
                    value={formData.current_password}
                    onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* New Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  New Password
                </label>
                <div className="relative group">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Enter your new password"
                    value={formData.new_password}
                    onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">Must be at least 6 characters long</p>
              </div>

              {/* Confirm New Password Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Confirm New Password
                </label>
                <div className="relative group">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Confirm your new password"
                    value={formData.confirm_password}
                    onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Error Message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
              >
                {error}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-blue-600/20 transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Updating password...
                  </>
                ) : (
                  'Change Password'
                )}
              </button>
            </motion.div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffPasswordChangePage;
