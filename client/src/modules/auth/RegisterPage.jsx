import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Lock, Eye, EyeOff, Mail, Phone, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import loginBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import apiClient from '../../api/api';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    nic: '',
    password: '',
    client_type: 'INDIVIDUAL',
    terms_accepted: false
  });

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      setError('Full name is required');
      return false;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Valid email address is required');
      return false;
    }
    if (!formData.phone.trim()) {
      setError('Mobile number is required');
      return false;
    }
    if (!formData.password.trim() || formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    if (!formData.terms_accepted) {
      setError('You must accept the Terms & Conditions');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiClient.registerClient({
        full_name: formData.fullName,
        email: formData.email,
        mobile_number: formData.phone,
        password: formData.password,
        client_type: formData.client_type,
        terms_accepted: formData.terms_accepted
      });
      
      // Registration successful
      console.log('Registration successful:', response);
      setSuccess('Registration successful! Please check your email for OTP verification.');
      
      // Redirect to OTP verification page after 2 seconds
      setTimeout(() => {
        navigate('/verify-otp', { state: { email: formData.email, userId: response.data?.userId } });
      }, 2000);
      
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
        {/* Background Image */}
        <img
          src={loginBg}
          alt="Healthcare professionals"
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
            Join the Future <br />
            of Care Delivery.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-300 leading-relaxed font-light"
          >
            Create your account to access premium healthcare services,
            manage appointments, and connect with top-tier professionals.
          </motion.p>
        </div>
      </div>

      {/* Right Side - Registration Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Create Account</h2>
            <p className="text-slate-600 text-sm">
              Enter your details to register as a new user.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              {/* Full Name Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Full Name</label>
                <div className="relative group">
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <User className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Email Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Email Address</label>
                <div className="relative group">
                  <input
                    type="email"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Mail className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Mobile Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Mobile Number</label>
                <div className="relative group">
                  <input
                    type="tel"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Phone className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* NIC Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">NIC Number</label>
                <div className="relative group">
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="National identity card number"
                    value={formData.nic}
                    onChange={(e) => setFormData({ ...formData, nic: e.target.value })}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <CreditCard className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Password</label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Create a password (min 6 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="flex items-start gap-3 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={formData.terms_accepted}
                  onChange={(e) => setFormData({ ...formData, terms_accepted: e.target.checked })}
                  className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="terms" className="text-sm text-slate-600 leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" className="text-blue-600 hover:text-blue-500 font-medium underline">
                    Terms & Conditions
                  </Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-blue-600 hover:text-blue-500 font-medium underline">
                    Privacy Policy
                  </Link>
                </label>
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

            {/* Success Message */}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm"
              >
                {success}
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="pt-2"
            >
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-blue-600/20 transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>
            </motion.div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <p className="text-slate-600">
                Already have an account?{' '}
                <Link to="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </motion.div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
