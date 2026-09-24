import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { X, User, Mail, MapPin, Building2, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import PhoneInput, { isValidPhoneNumber } from '../../../components/common/PhoneInput';
import CitySelect from '../../../components/common/CitySelect';

const TERMS_URL = 'https://res.cloudinary.com/dohaktkth/image/upload/v1780652854/VCare_Client_Service_Agreement_znjsim.pdf';
const RESEND_SECONDS = 60;

const inputCls = (err) =>
  `w-full bg-slate-50 border rounded-lg px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none transition-all ${
    err ? 'border-red-500 focus:ring-1 focus:ring-red-500' : 'border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
  }`;

const choiceCls = (active, disabled) =>
  `px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${
    active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

// Defined at module level so inputs keep focus between keystrokes.
const Field = ({ label, error, children }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-slate-700 block">{label}</label>
    {children}
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

const emptyForm = {
  client_type: 'INDIVIDUAL', company_name: '', honorific: '', full_name: '', email: '',
  phone: '', gender: '', city_id: '', primary_address: '', terms_accepted: false,
};

const validate = (f) => {
  const e = {};
  if (!f.full_name.trim()) e.full_name = 'Full name is required';
  else if (f.full_name.trim().length < 5 || f.full_name.trim().length > 30) e.full_name = 'Full name must be 5 to 30 characters';
  else if (!/^[a-zA-Z\s]+$/.test(f.full_name)) e.full_name = 'Full name should contain only letters';
  if (!f.email.trim()) e.email = 'Email address is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Valid email address is required';
  if (!f.phone) e.phone = 'Mobile number is required';
  else if (!isValidPhoneNumber(f.phone)) e.phone = 'Enter a valid mobile number';
  if (!f.gender) e.gender = 'Gender is required';
  if (!f.city_id) e.city_id = 'Please select your city from the list';
  if (!f.primary_address.trim()) e.primary_address = 'Address is required';
  else if (f.primary_address.length < 5 || f.primary_address.length > 150) e.primary_address = 'Address must be 5 to 150 characters';
  if (f.client_type === 'CORPORATE_PROXY' && !f.company_name.trim()) e.company_name = 'Company name is required';
  return e;
};

/**
 * Priority Membership registration. Sends a registration-fee request to the admin team.
 *  - Logged-in clients: one confirm click, details come from their profile.
 *  - Guests: details form -> mobile OTP -> submit.
 */
const PriorityMembershipRegisterModal = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState('details'); // details | otp | done
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setStep('details'); setForm(emptyForm); setErrors({}); setOtp('');
    setError(''); setNeedsProfile(false); setCooldown(0); setBusy(false);
  }, [isOpen]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  const set = (name, value) => {
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'honorific') {
        if (value === 'Mr') next.gender = 'MALE';
        else if (value === 'Mrs' || value === 'Miss') next.gender = 'FEMALE';
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const genderLocked = ['Mr', 'Mrs', 'Miss'].includes(form.honorific);

  const sendOtp = async () => {
    setBusy(true); setError('');
    try {
      await apiClient.sendPriorityMembershipOtp(form.phone);
      setCooldown(RESEND_SECONDS);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = async (e) => {
    e.preventDefault();
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) return setError('Please fix the highlighted fields.');
    if (!form.terms_accepted) return setError('You must accept the Terms & Conditions.');
    setError('');
    await sendOtp();
  };

  const verifyAndSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit code.');
    setBusy(true); setError('');
    try {
      const ver = await apiClient.verifyPriorityMembershipOtp(form.phone, otp);
      await apiClient.registerPriorityMembershipGuest({
        verification_token: ver.verification_token,
        mobile_number: form.phone,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        gender: form.gender,
        honorific: form.honorific || undefined,
        client_type: form.client_type,
        company_name: form.client_type === 'CORPORATE_PROXY' ? form.company_name.trim() : undefined,
        city_id: form.city_id,
        primary_address: form.primary_address.trim(),
        terms_accepted: form.terms_accepted,
      });
      setStep('done');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitAsClient = async () => {
    setBusy(true); setError(''); setNeedsProfile(false);
    try {
      await apiClient.registerPriorityMembership();
      setStep('done');
    } catch (err) {
      if (err.code === 'NO_CLIENT_PROFILE') setNeedsProfile(true);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
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
            role="dialog" aria-modal="true" aria-label="Register for Priority Membership"
            className="relative w-full sm:max-w-lg bg-white rounded-t-[24px] sm:rounded-[24px] shadow-2xl max-h-[92vh] overflow-y-auto"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <button
              type="button" onClick={onClose} disabled={busy} aria-label="Close"
              className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 sm:p-8">
              {step === 'done' && (
                <div className="text-center py-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-5">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Request received</h3>
                  <p className="text-slate-600 leading-relaxed mb-8">
                    Thank you for choosing VCare Priority Membership. Our team will contact you shortly with your
                    registration fee quotation.
                  </p>
                  <button onClick={onClose} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors">
                    Done
                  </button>
                </div>
              )}

              {step !== 'done' && isAuthenticated && (
                <div className="py-2">
                  <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">Register for Priority Membership</h3>
                  <p className="text-slate-600 leading-relaxed mb-6">
                    We'll send your request to our team using the details on your account
                    {user?.full_name ? <> (<span className="font-medium text-slate-800">{user.full_name}</span>)</> : null}.
                    They will follow up with your registration fee quotation.
                  </p>
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
                      {error}{' '}
                      {needsProfile && <Link to="/create-client-profile" className="underline font-medium">Create your client profile</Link>}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={onClose} disabled={busy} className="flex-1 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={submitAsClient} disabled={busy} className="flex-1 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold transition-colors">
                      {busy ? 'Sending...' : 'Send request'}
                    </button>
                  </div>
                </div>
              )}

              {step === 'details' && !isAuthenticated && (
                <form onSubmit={submitDetails} className="space-y-4" noValidate>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 pr-8">Register for Priority Membership</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Tell us about yourself. We'll verify your mobile number, then our team will send your registration fee quotation.
                    </p>
                  </div>

                  <Field label="Account Type">
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" className={choiceCls(form.client_type === 'INDIVIDUAL')}
                        onClick={() => setForm((p) => ({ ...p, client_type: 'INDIVIDUAL', company_name: '' }))}>Individual</button>
                      <button type="button" className={choiceCls(form.client_type === 'CORPORATE_PROXY')}
                        onClick={() => set('client_type', 'CORPORATE_PROXY')}>As Company</button>
                    </div>
                  </Field>

                  {form.client_type === 'CORPORATE_PROXY' && (
                    <Field label="Company Name" error={errors.company_name}>
                      <div className="relative">
                        <input className={`${inputCls(errors.company_name)} pr-12`} placeholder="e.g. Acme Holdings Ltd."
                          value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
                        <Building2 className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                      </div>
                    </Field>
                  )}

                  <Field label={<>Title <span className="text-slate-400 font-normal">(optional)</span></>}>
                    <div className="flex flex-wrap gap-2">
                      {['Mr', 'Mrs', 'Miss', 'Doc', 'Prof'].map((h) => (
                        <button key={h} type="button" className={choiceCls(form.honorific === h)}
                          onClick={() => set('honorific', form.honorific === h ? '' : h)}>{h}</button>
                      ))}
                    </div>
                  </Field>

                  <Field label="Full Name" error={errors.full_name}>
                    <div className="relative">
                      <input className={`${inputCls(errors.full_name)} pr-12`} placeholder="Enter your full name"
                        value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
                      <User className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                    </div>
                  </Field>

                  <Field label="Email Address" error={errors.email}>
                    <div className="relative">
                      <input type="email" className={`${inputCls(errors.email)} pr-12`} placeholder="name@example.com"
                        value={form.email} onChange={(e) => set('email', e.target.value)} />
                      <Mail className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                    </div>
                  </Field>

                  <Field label="Mobile Number">
                    <PhoneInput name="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
                  </Field>

                  <Field label={<>Gender {genderLocked && <span className="text-xs font-normal text-slate-400">(set by Title)</span>}</>} error={errors.gender}>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" disabled={genderLocked} className={choiceCls(form.gender === 'MALE', genderLocked)} onClick={() => set('gender', 'MALE')}>Male</button>
                      <button type="button" disabled={genderLocked} className={choiceCls(form.gender === 'FEMALE', genderLocked)} onClick={() => set('gender', 'FEMALE')}>Female</button>
                    </div>
                  </Field>

                  <Field label="City" error={errors.city_id}>
                    <CitySelect
                      value={form.city_id}
                      onChange={(city) => set('city_id', city ? city.city_id : '')}
                      required
                      placeholder="Search and select your city"
                      className={inputCls(errors.city_id)}
                    />
                  </Field>

                  <Field label="Primary Address" error={errors.primary_address}>
                    <div className="relative">
                      <input className={`${inputCls(errors.primary_address)} pr-12`} placeholder="Enter your primary address"
                        value={form.primary_address} onChange={(e) => set('primary_address', e.target.value)} />
                      <MapPin className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
                    </div>
                  </Field>

                  <div className="flex items-start gap-3 pt-1">
                    <input id="pm-terms" type="checkbox" checked={form.terms_accepted}
                      onChange={(e) => set('terms_accepted', e.target.checked)}
                      className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500" />
                    <label htmlFor="pm-terms" className="text-sm text-slate-600 leading-relaxed">
                      I agree to the{' '}
                      <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Terms &amp; Conditions</a>
                    </label>
                  </div>

                  {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

                  <button type="submit" disabled={busy}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]">
                    {busy ? 'Sending code...' : 'Verify mobile number'}
                  </button>
                </form>
              )}

              {step === 'otp' && !isAuthenticated && (
                <form onSubmit={verifyAndSubmit} className="space-y-5" noValidate>
                  <button type="button" onClick={() => { setStep('details'); setError(''); setOtp(''); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Edit details
                  </button>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Verify your mobile</h3>
                    <p className="text-sm text-slate-600 mt-1">
                      We sent a 6-digit code to <span className="font-semibold text-slate-800">{form.phone}</span> by SMS and WhatsApp.
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
                    {busy ? 'Submitting...' : 'Verify & submit request'}
                  </button>
                  <p className="text-center text-sm text-slate-500">
                    Didn't get it?{' '}
                    <button type="button" onClick={sendOtp} disabled={busy || cooldown > 0}
                      className="font-medium text-blue-600 hover:underline disabled:text-slate-400 disabled:no-underline">
                      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PriorityMembershipRegisterModal;
