import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import loginBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import apiClient from '../../api/api';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [mobileNumber, setMobileNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!mobileNumber) {
      setError('Please enter your mobile number');
      return;
    }

    try {
      setIsLoading(true);
      const response = await apiClient.requestForgotPasswordOtp(mobileNumber);

      console.log('OTP request successful:', response);
      setSuccess('OTP sent to your registered phone number!');

      // Redirect to OTP verification page after 1 second
      setTimeout(() => {
        navigate('/forgot-password/verify-otp', {
          state: {
            userId: response.data.user_id,
            mobileNumber: mobileNumber
          }
        });
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
      console.error('Forgot password error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50">
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex w-1/2 relative bg-slate-900 overflow-hidden">
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
            Reset Your <br />
            Password Securely.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-300 leading-relaxed font-light"
          >
            Enter your registered mobile number to receive a verification code
            and reset your password safely.
          </motion.p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link
              to="/login"
              className="inline-flex items-center text-slate-600 hover:text-slate-900 mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Login
            </Link>

            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              Forgot Password?
            </h2>
            <p className="text-slate-600 text-sm">
              Enter your registered mobile number and we'll send you a verification code to reset your password.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              {/* Mobile Number Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 block">
                  Mobile Number
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3.5 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Enter your registered mobile number"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500">
                    <Phone className="w-5 h-5" />
                  </div>
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

            <motion.button
              type="submit"
              disabled={isLoading || !mobileNumber}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending OTP...
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5" />
                  Send Verification Code
                </>
              )}
            </motion.button>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-sm text-slate-600">
              Remember your password?{' '}
              <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign In
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
