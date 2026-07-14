import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CheckCircle, ArrowRight, Phone, Mail, Calendar, Briefcase, Home, FileText, User } from 'lucide-react';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';
// import LanguageToggle from '../../../i18n/LanguageToggle'; // hidden for this release

const CONTACT_NUMBERS = [
  { label: '+94 (77) 393 9112', href: 'tel:+94773939112' },
  { label: '+94 76 799 7796', href: 'tel:+94767997796' },
  { label: '+94 777 00 4068', href: 'tel:+94777004068' },
  { label: '(011) 317 6545', href: 'tel:0113176545' },
];

const CONTACT_EMAIL = 'info@vcarenursing.com';

const NEXT_STEP_ICONS = [FileText, Phone, Briefcase];

const WorkerRegistrationSuccessPage = () => {
  const { t } = useTranslation('workerRegistrationSuccess');
  const navigate = useNavigate();
  const location = useLocation();

  const { applicationData } = location.state || {};

  const nextSteps = t('nextSteps.steps', { returnObjects: true }).map((step, i) => ({
    ...step,
    icon: NEXT_STEP_ICONS[i],
  }));

  const handleGoHome = () => {
    navigate('/');
  };

  const handleViewApplications = () => {
    navigate('/services/join-team');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* <LanguageToggle /> hidden for this release — see memory: language-toggle-locations */}

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/90 via-indigo-900/85 to-indigo-900/95" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
            className="w-20 h-20 bg-white/10 border border-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-3xl md:text-5xl font-bold text-white mb-4"
          >
            {t('hero.title')}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-lg text-indigo-100 max-w-2xl mx-auto"
          >
            {t('hero.description')}
          </motion.p>

          {applicationData?.application_code && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-8 inline-flex flex-col items-center bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl px-6 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">
                {t('hero.referenceLabel')}
              </p>
              <p className="font-mono text-2xl font-bold text-white mt-1">
                {applicationData.application_code}
              </p>
            </motion.div>
          )}
        </div>

        {/* Wave divider into the body */}
        <svg
          className="relative block w-full text-slate-50"
          viewBox="0 0 1440 60"
          preserveAspectRatio="none"
          style={{ height: 40 }}
        >
          <path fill="currentColor" d="M0,32 C240,64 480,0 720,16 C960,32 1200,64 1440,32 L1440,60 L0,60 Z" />
        </svg>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 -mt-2">
        {/* Applicant Info */}
        {applicationData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8"
          >
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center">
                <Briefcase className="w-[18px] h-[18px] text-indigo-600" />
              </div>
              {t('applicantInfo.title')}
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
                  {t('applicantInfo.personalInfo')}
                </h3>
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-500 w-14 flex-shrink-0">{t('applicantInfo.nameLabel')}</span>
                    <span className="font-medium text-slate-900">{applicationData.full_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-500 w-14 flex-shrink-0">{t('applicantInfo.mobileLabel')}</span>
                    <span className="font-medium text-slate-900">{applicationData.mobile_number}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">
                  {t('applicantInfo.applicationInfo')}
                </h3>
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <Briefcase className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-500 w-14 flex-shrink-0 mt-0.5">{t('applicantInfo.rolesLabel')}</span>
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {(Array.isArray(applicationData.applied_roles)
                        ? applicationData.applied_roles
                        : [applicationData.applied_roles]
                      ).filter(Boolean).map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-semibold"
                        >
                          {role.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-500 w-14 flex-shrink-0">{t('applicantInfo.statusLabel')}</span>
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-xs font-semibold">
                      {t('applicantInfo.statusValue')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-500 w-14 flex-shrink-0">{t('applicantInfo.dateLabel')}</span>
                    <span className="font-medium text-slate-900">
                      {new Date().toLocaleDateString('en-GB')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* What Happens Next */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8"
        >
          <h2 className="text-xl font-bold text-slate-900 mb-8">{t('nextSteps.title')}</h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-slate-200" />
            {nextSteps.map((step, index) => (
              <div key={index} className="relative flex flex-col items-center text-center md:text-left md:items-start">
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center flex-shrink-0 mb-4 relative z-10 ring-4 ring-white">
                  <step.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-slate-900 mb-1">{step.title}</h3>
                <p className="text-sm text-slate-500">{step.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contact Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-indigo-900 rounded-2xl p-8 mb-8 text-white"
        >
          <h3 className="font-bold text-lg mb-1.5">{t('contact.title')}</h3>
          <p className="text-indigo-200 text-sm mb-6">
            {t('contact.description')}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {CONTACT_NUMBERS.map((c) => (
              <a
                key={c.href}
                href={c.href}
                className="flex items-center gap-2.5 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl transition-colors text-sm font-medium"
              >
                <Phone className="w-4 h-4 text-indigo-300 flex-shrink-0" />
                {c.label}
              </a>
            ))}
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center justify-center gap-2.5 mt-3 px-4 py-3 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors text-sm font-bold text-indigo-950"
          >
            <Mail className="w-4 h-4" />
            {CONTACT_EMAIL}
          </a>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button
            onClick={handleViewApplications}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-amber-600 text-white rounded-full font-bold text-lg hover:bg-amber-700 transition-all shadow-lg shadow-amber-500/20"
          >
            {t('actions.viewServiceTeam')} <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-full font-bold text-lg hover:border-slate-900 hover:text-slate-900 transition-all"
          >
            <Home className="w-5 h-5" />
            {t('actions.backToHome')}
          </button>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default WorkerRegistrationSuccessPage;
