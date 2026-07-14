import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, ChevronLeft, Phone, MessageSquare } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import apiClient from '../../../api/api';
// import LanguageToggle from '../../../i18n/LanguageToggle'; // hidden for this release

const VerifyStaffOTP = () => {
  const { t } = useTranslation('verifyStaffOtp');
  const navigate = useNavigate();
  const location = useLocation();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [timeLeft, setTimeLeft] = useState(300);
  const [applicationId, setApplicationId] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  useEffect(() => {
    if (!location.state?.applicationId) {
      navigate('/join-our-team');
      return;
    }
    setApplicationId(location.state.applicationId);
    setMobileNumber(location.state.mobileNumber || '');

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [location.state, navigate]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const maskMobile = (number) => {
    if (!number) return t('defaultMobilePlaceholder');
    const clean = number.replace(/\s/g, '');
    return clean.slice(0, 3) + '****' + clean.slice(-3);
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      document.getElementById(`staff-otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`staff-otp-${index - 1}`);
      if (prevInput) {
        prevInput.focus();
        const newOtp = [...otp];
        newOtp[index - 1] = '';
        setOtp(newOtp);
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = Array(6).fill('').map((_, i) => pastedData[i] || '');
    setOtp(newOtp);
    const nextEmpty = newOtp.findIndex(d => !d);
    const focusIndex = nextEmpty === -1 ? 5 : nextEmpty;
    document.getElementById(`staff-otp-${focusIndex}`)?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const otpValue = otp.join('');
    if (otpValue.length !== 6) {
      setError(t('errors.incompleteOtp'));
      return;
    }
    try {
      setIsLoading(true);
      const response = await apiClient.verifyStaffApplicationOtp(applicationId, otpValue);
      setSuccess(t('success.verified'));
      setTimeout(() => {
        navigate('/worker-registration-success', {
          state: {
            applicationData: {
              application_id: response.data?.application_id,
              application_code: response.data?.application_code,
              full_name: response.data?.full_name,
              mobile_number: response.data?.mobile_number,
              applied_roles: response.data?.applied_roles
            }
          }
        });
      }, 1500);
    } catch (err) {
      setError(err.message || t('errors.invalidOtp'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    try {
      setIsLoading(true);
      await apiClient.resendStaffApplicationOtp(applicationId);
      setTimeLeft(300);
      setOtp(['', '', '', '', '', '']);
      setSuccess(t('success.resent'));
      document.getElementById('staff-otp-0')?.focus();
    } catch (err) {
      setError(err.message || t('errors.resendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <div className="flex-grow flex flex-col items-center justify-center pt-24 pb-12 px-4">
        {/* <LanguageToggle /> hidden for this release — see memory: language-toggle-locations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden"
        >
          {/* Header */}
          <div className="bg-indigo-900 px-8 pt-10 pb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-10 transform translate-x-1/2 -translate-y-1/2">
              <Lock className="w-48 h-48 text-white" />
            </div>
            <div className="relative z-10">
              <button
                onClick={() => navigate('/join-our-team')}
                className="flex items-center gap-1.5 text-indigo-300 hover:text-white text-sm mb-6 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('backToApplication')}
              </button>
              <h1 className="text-2xl font-bold text-white mb-2">{t('title')}</h1>
              <p className="text-indigo-200 text-sm">
                {t('subtitlePrefix')}{' '}
                <span className="font-semibold text-white">{maskMobile(mobileNumber)}</span>
              </p>
            </div>
          </div>

          {/* Channel badges */}
          <div className="flex gap-3 px-8 pt-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full">
              <Phone className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-xs font-medium text-indigo-700">{t('smsBadge')}</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-4 sm:px-8 py-6 space-y-6">
            {/* OTP inputs */}
            <div>
              <label className="text-sm font-semibold text-slate-600 block mb-3">
                {t('otpLabel')}
              </label>
              <div className="flex justify-between gap-1.5 sm:gap-2" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`staff-otp-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength="1"
                    className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all ${
                      digit
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-slate-50 text-slate-900'
                    } focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100`}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                  />
                ))}
              </div>
            </div>

            {/* Timer + Resend */}
            <div className="flex items-center justify-between text-sm">
              <p className="text-slate-500">
                {t('codeExpiresIn')}{' '}
                <span className={`font-semibold ${timeLeft < 60 ? 'text-red-600' : 'text-slate-800'}`}>
                  {formatTime(timeLeft)}
                </span>
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={timeLeft > 0 || isLoading}
                className="text-indigo-600 font-medium hover:text-indigo-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {timeLeft > 0 ? t('resendIn', { time: formatTime(timeLeft) }) : t('resendCode')}
              </button>
            </div>

            {/* Error / Success */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm"
              >
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm"
              >
                {success}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || otp.join('').length !== 6}
              className="w-full flex items-center justify-center gap-2 px-8 py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {t('verifying')}
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  {t('submitButton')}
                </>
              )}
            </button>

            <p className="text-xs text-center text-slate-400">
              {t('noCodeReceived')}
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default VerifyStaffOTP;
