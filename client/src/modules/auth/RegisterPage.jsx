import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Lock, Eye, EyeOff, Mail, Phone, MapPin, Building2 } from 'lucide-react';
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
    honorific: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    client_type: 'INDIVIDUAL',
    terms_accepted: false,
    gender: '',
    primary_address: '',
    company_name: ''
  });

  const [fieldErrors, setFieldErrors] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    gender: '',
    primary_address: ''
  });

  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    message: '',
    color: 'text-gray-500'
  });

  const validateField = (name, value) => {
    let error = '';

    switch (name) {
      case 'fullName':
        if (!value.trim()) {
          error = 'Full name is required';
        } else if (value.length < 5 || value.length > 30) {
          error = 'Full name must be 5 to 30 characters';
        } else if (!/^[a-zA-Z\s]+$/.test(value)) {
          error = 'Full name should contain only letters';
        }
        break;
      case 'email':
        if (!value.trim()) {
          error = 'Email address is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          error = 'Valid email address is required';
        }
        break;
      case 'phone':
        if (!value.trim()) {
          error = 'Mobile number is required';
        } else if (!/^07[0-9]{8}$/.test(value.replace(/\s/g, ''))) {
          error = 'Mobile number must be 10 digits starting with 07';
        }
        break;
      case 'password':
        if (!value.trim()) {
          error = 'Password is required';
        } else if (value.length < 6) {
          error = 'Password must be at least 6 characters long';
        } else {
          const hasNumber = /\d/.test(value);
          const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(value);
          const hasUpper = /[A-Z]/.test(value);
          const hasLower = /[a-z]/.test(value);

          if (!((hasNumber && hasSpecial) || (hasUpper && hasLower))) {
            error = 'Password must include a number and special character OR uppercase and lowercase letters';
          }
        }
        break;
      case 'gender':
        if (!value) {
          error = 'Gender is required';
        }
        break;
      case 'primary_address':
        if (!value.trim()) {
          error = 'Primary address is required';
        } else if (value.length < 5 || value.length > 150) {
          error = 'Primary address must be 5 to 150 characters';
        }
        break;
    }

    return error;
  };

  const calculatePasswordStrength = (password) => {
    if (!password) {
      return { score: 0, message: '', color: 'text-gray-500' };
    }

    let score = 0;
    const checks = {
      length: password.length >= 6,
      hasNumber: /\d/.test(password),
      hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasGoodLength: password.length >= 8
    };

    Object.values(checks).forEach(passed => {
      if (passed) score++;
    });

    if (score <= 2) {
      return { score, message: 'Weak', color: 'text-red-500' };
    } else if (score <= 4) {
      return { score, message: 'Fair', color: 'text-yellow-500' };
    } else {
      return { score, message: 'Strong', color: 'text-green-500' };
    }
  };

  const handleInputChange = (name, value) => {
    setFormData({ ...formData, [name]: value });

    // Real-time validation
    const error = validateField(name, value);
    setFieldErrors({ ...fieldErrors, [name]: error });

    // Password strength indicator
    if (name === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }
  };

  const validateForm = () => {
    const errors = {};

    // Validate all fields
    Object.keys(formData).forEach(key => {
      if (key !== 'client_type' && key !== 'terms_accepted' && key !== 'honorific' && key !== 'company_name') {
        const error = validateField(key, formData[key]);
        if (error) errors[key] = error;
      }
    });

    setFieldErrors(errors);

    if (!formData.terms_accepted) {
      setError('You must accept the Terms & Conditions');
      return false;
    }

    if (Object.keys(errors).length > 0) {
      setError('Please fix all validation errors');
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
        honorific: formData.honorific || undefined,
        full_name: formData.fullName,
        email: formData.email,
        mobile_number: formData.phone,
        password: formData.password,
        client_type: formData.client_type,
        terms_accepted: formData.terms_accepted,
        gender: formData.gender,
        primary_address: formData.primary_address,
        company_name: formData.client_type === 'CORPORATE_PROXY' ? (formData.company_name || undefined) : undefined,
      });

      // Registration successful
      console.log('Registration successful:', response);
      setSuccess('OTP sent! Please check your mobile to complete verification.');

      setTimeout(() => {
        navigate('/verify-otp-reg', { state: { mobileNumber: formData.phone } });
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
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-white">
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
              {/* Account Type */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleInputChange('client_type', 'INDIVIDUAL')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${
                      formData.client_type === 'INDIVIDUAL'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange('client_type', 'CORPORATE_PROXY')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${
                      formData.client_type === 'CORPORATE_PROXY'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    As Company
                  </button>
                </div>
              </div>

              {/* Company Name — only for corporate */}
              {formData.client_type === 'CORPORATE_PROXY' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 block">Company Name <span className="text-slate-400 font-normal">(used on receipts &amp; statements)</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="e.g. Acme Holdings Ltd."
                      value={formData.company_name}
                      onChange={(e) => handleInputChange('company_name', e.target.value)}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Honorific */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Title <span className="text-slate-400 font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2">
                  {['Mr', 'Mrs', 'Miss', 'Doc', 'Prof'].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => handleInputChange('honorific', formData.honorific === h ? '' : h)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        formData.honorific === h
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Full Name Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Full Name</label>
                <div className="relative group">
                  <input
                    type="text"
                    className={`w-full bg-slate-50 border rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${fieldErrors.fullName
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <User className="w-5 h-5" />
                  </div>
                </div>
                {fieldErrors.fullName && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.fullName}</p>
                )}
              </div>

              {/* Email Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Email Address</label>
                <div className="relative group">
                  <input
                    type="email"
                    className={`w-full bg-slate-50 border rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${fieldErrors.email
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Mail className="w-5 h-5" />
                  </div>
                </div>
                {fieldErrors.email && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Mobile Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Mobile Number</label>
                <div className="relative group">
                  <input
                    type="tel"
                    className={`w-full bg-slate-50 border rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${fieldErrors.phone
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    placeholder="07XXXXXXXX"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Phone className="w-5 h-5" />
                  </div>
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>
                )}
              </div>

              {/* Gender Selection */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Gender</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleInputChange('gender', 'MALE')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${formData.gender === 'MALE'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInputChange('gender', 'FEMALE')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${formData.gender === 'FEMALE'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                  >
                    Female
                  </button>
                </div>
                {fieldErrors.gender && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.gender}</p>
                )}
              </div>

              {/* Primary Address Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Primary Address</label>
                <div className="relative group">
                  <input
                    type="text"
                    className={`w-full bg-slate-50 border rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${fieldErrors.primary_address
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    placeholder="Enter your primary address"
                    value={formData.primary_address}
                    onChange={(e) => handleInputChange('primary_address', e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <MapPin className="w-5 h-5" />
                  </div>
                </div>
                {fieldErrors.primary_address && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.primary_address}</p>
                )}
              </div>

              {/* Password Input */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Password</label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`w-full bg-slate-50 border rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${fieldErrors.password
                        ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
                )}
                {/* Password Strength Indicator */}
                {formData.password && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Password Strength:</span>
                      <span className={`text-xs font-medium ${passwordStrength.color}`}>
                        {passwordStrength.message}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${passwordStrength.score <= 2 ? 'bg-red-500' :
                            passwordStrength.score <= 4 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                        style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
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
                  <a
                    href="https://res.cloudinary.com/dohaktkth/image/upload/v1780652854/VCare_Client_Service_Agreement_znjsim.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Terms &amp; Conditions
                  </a>
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
