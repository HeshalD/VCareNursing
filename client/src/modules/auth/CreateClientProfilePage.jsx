import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2, Mail, Phone, MapPin, Building2, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import loginBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import apiClient from '../../api/api';

const genderLabel = (g) => {
  if (g === 'MALE') return 'Male';
  if (g === 'FEMALE') return 'Female';
  if (g === 'OTHER') return 'Other';
  return g || '—';
};

// A staff member's basic account details (name, email, mobile, gender, address)
// were already captured and verified when they registered as staff — this form
// reuses them read-only instead of asking the user to type them again, so those
// values can only ever change via the admin dashboard, never here.
const LockedField = ({ label, value, icon: Icon }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-slate-700 block">{label}</label>
    <div className="relative">
      <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-600">
        {value || '—'}
      </div>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4" />}
        <Lock className="w-3.5 h-3.5" />
      </div>
    </div>
  </div>
);

const CreateClientProfilePage = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const [loadingInfo, setLoadingInfo] = useState(true);
  const [account, setAccount] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [clientType, setClientType] = useState('INDIVIDUAL');
  const [companyName, setCompanyName] = useState('');
  const [honorific, setHonorific] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    (async () => {
      try {
        const res = await apiClient.getMyAccountInfo();
        const data = res.data || res;
        if (data.has_client_profile) {
          navigate('/client/profile');
          return;
        }
        if (!data.has_staff_profile) {
          setLoadError('No staff profile was found for this account.');
          return;
        }
        setAccount(data);
      } catch (err) {
        setLoadError(err.message || 'Failed to load your account details.');
      } finally {
        setLoadingInfo(false);
      }
    })();
  }, [authLoading, isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!termsAccepted) {
      setSubmitError('You must accept the Terms & Conditions.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.createClientProfileForExistingUser({
        client_type: clientType,
        company_name: clientType === 'CORPORATE_PROXY' ? (companyName || undefined) : undefined,
        honorific: honorific || undefined,
        terms_accepted: termsAccepted,
      });
      navigate('/client/profile');
    } catch (err) {
      setSubmitError(err.message || 'Failed to create client profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || loadingInfo) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm max-w-md text-center">
          {loadError}
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
          alt="Healthcare professionals"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

        <div className="relative z-10 flex flex-col justify-center h-full p-16 max-w-2xl">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-5xl font-bold text-white mb-6 leading-tight"
          >
            Book Care <br />
            With Your Existing Account.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg text-slate-300 leading-relaxed font-light"
          >
            We already have your details on file from your staff registration —
            just confirm a few extra details to start booking care as a client.
          </motion.p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-white">
        <div className="w-full max-w-md space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Create Client Profile</h2>
            <p className="text-slate-600 text-sm">
              These details are already on file and can't be changed here — contact an admin if anything below is incorrect.
            </p>
          </motion.div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              <LockedField label="Full Name" value={account?.full_name} />
              <LockedField label="Email Address" value={account?.email} icon={Mail} />
              <LockedField label="Mobile Number" value={account?.mobile_number} icon={Phone} />
              <LockedField label="Gender" value={genderLabel(account?.gender)} />
              <LockedField label="Primary Address" value={account?.primary_address} icon={MapPin} />

              {/* Account Type */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 block">Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setClientType('INDIVIDUAL')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${
                      clientType === 'INDIVIDUAL'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientType('CORPORATE_PROXY')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all font-medium text-sm ${
                      clientType === 'CORPORATE_PROXY'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    As Company
                  </button>
                </div>
              </div>

              {/* Company Name — only for corporate */}
              {clientType === 'CORPORATE_PROXY' && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 block">Company Name <span className="text-slate-400 font-normal">(used on receipts &amp; statements)</span></label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 pl-4 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                      placeholder="e.g. Acme Holdings Ltd."
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
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
                      onClick={() => setHonorific(honorific === h ? '' : h)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                        honorific === h
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="flex items-start gap-3 pt-2">
                <input
                  type="checkbox"
                  id="terms"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
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

            {submitError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
              >
                {submitError}
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
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-blue-600/20 transition-all duration-200 transform active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating Profile...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Create Client Profile
                  </>
                )}
              </button>
            </motion.div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateClientProfilePage;
