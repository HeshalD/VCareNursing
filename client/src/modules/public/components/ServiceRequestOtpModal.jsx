import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import apiClient from '../../../api/api';

/**
 * Shown when a guest submits a service request with a mobile number that already belongs to
 * a registered client. They prove they own the number with a one-time code (SMS + WhatsApp),
 * which lets the request attach to their existing account instead of creating a duplicate client.
 *
 * Props:
 *  - isOpen     : boolean
 *  - mobile     : the number typed on the form
 *  - onVerified : (verificationToken) => void  - called once the code checks out
 *  - onClose    : () => void
 */
const RESEND_SECONDS = 60;

const ServiceRequestOtpModal = ({ isOpen, mobile, onVerified, onClose }) => {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);

  const sendCode = async () => {
    setBusy(true); setError('');
    try {
      await apiClient.sendServiceRequestOtp(mobile);
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(err.message || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Send the first code as soon as the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setOtp(''); setError(''); setSent(false); setCooldown(0);
    sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code.');
    setBusy(true); setError('');
    try {
      const res = await apiClient.verifyServiceRequestOtp(mobile, otp);
      onVerified(res.verification_token);
    } catch (err) {
      setError(err.message || 'Could not verify the code. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
        >
          <motion.div
            className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-8"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          >
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>

            <form onSubmit={verify} className="space-y-5" noValidate>
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Welcome back — verify it's you</h3>
                <p className="text-sm text-slate-600 mt-1">
                  <span className="font-semibold text-slate-800">{mobile}</span> is already registered with VCare.
                  {sent
                    ? ' We sent a 6-digit code to it by SMS and WhatsApp. Enter it to add this request to your account.'
                    : ' Sending you a 6-digit code...'}
                </p>
              </div>

              <input
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="------"
                className="w-full text-center text-3xl tracking-[0.5em] font-bold bg-slate-50 border border-slate-200 rounded-xl py-4 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

              <button type="submit" disabled={busy || otp.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]">
                {busy ? 'Please wait...' : 'Verify & submit request'}
              </button>

              <p className="text-center text-sm text-slate-500">
                Didn't get it?{' '}
                <button type="button" onClick={sendCode} disabled={busy || cooldown > 0}
                  className="font-medium text-blue-600 hover:underline disabled:text-slate-400 disabled:no-underline">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </p>
              <p className="text-center text-sm text-slate-500">
                Prefer to log in? <Link to="/login" className="font-medium text-blue-600 hover:underline">Log in</Link>
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServiceRequestOtpModal;
