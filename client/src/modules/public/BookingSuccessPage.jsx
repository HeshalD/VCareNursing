import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  ArrowRight,
  Phone,
  Mail,
  Calendar,
  Heart,
  Home,
  PhoneCall,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

const CONTACT_NUMBERS = [
  { label: '+94 (77) 393 9112', href: 'tel:+94773939112' },
  { label: '+94 76 799 7796', href: 'tel:+94767997796' },
  { label: '+94 777 00 4068', href: 'tel:+94777004068' },
  { label: '(011) 317 6545', href: 'tel:0113176545' },
];

const CONTACT_EMAIL = 'info@vcarenursing.com';

const NEXT_STEPS = [
  {
    icon: PhoneCall,
    title: "We'll Call You",
    description: 'Our care coordinator will contact you within 24 hours to confirm the details.',
  },
  {
    icon: ClipboardCheck,
    title: 'Finalize the Plan',
    description: "We'll confirm start dates and build a personalized care plan for your loved one.",
  },
  {
    icon: Heart,
    title: 'Care Begins',
    description: 'Your caregiver arrives and compassionate, professional care begins.',
  },
];

const BookingSuccessPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const { requestCode, selectedStaff } = location.state || {};

  const handleGoHome = () => {
    navigate('/');
  };

  const handleViewBookings = () => {
    navigate('/client/bookings');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/90 via-emerald-900/85 to-emerald-900/95" />
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
            Booking Confirmed!
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-lg text-emerald-100 max-w-2xl mx-auto"
          >
            Your care service request has been successfully submitted. Our team will contact you
            within 24 hours to finalize the arrangements.
          </motion.p>

          {requestCode && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-8 inline-flex flex-col items-center bg-white/10 border border-white/20 backdrop-blur-sm rounded-2xl px-6 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">
                Request Reference
              </p>
              <p className="font-mono text-2xl font-bold text-white mt-1">{requestCode}</p>
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
        {/* Selected Staff Info */}
        {selectedStaff && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8"
          >
            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                <Heart className="w-[18px] h-[18px] text-amber-600" />
              </div>
              Your Selected Caregiver
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <img
                src={selectedStaff.image}
                alt={selectedStaff.name}
                className="w-20 h-20 rounded-full object-cover ring-4 ring-amber-50"
              />
              <div className="flex-1">
                <h3 className="text-xl font-bold text-slate-900">{selectedStaff.name}</h3>
                <p className="text-slate-600 mb-2">
                  {selectedStaff.role} • {selectedStaff.experience}
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <Phone className="w-4 h-4 text-amber-500" />
                    Available 24/7
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4 text-amber-500" />
                    Response in 2 hours
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    Starts as planned
                  </span>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="text-2xl font-bold text-amber-600">{selectedStaff.price}</p>
                <p className="text-sm text-slate-500">per month</p>
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
          <h2 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Sparkles className="w-[18px] h-[18px] text-emerald-600" />
            </div>
            What Happens Next?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-slate-200" />
            {NEXT_STEPS.map((step, index) => (
              <div
                key={index}
                className="relative flex flex-col items-center text-center md:text-left md:items-start"
              >
                <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center flex-shrink-0 mb-4 relative z-10 ring-4 ring-white">
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
          className="bg-emerald-900 rounded-2xl p-8 mb-8 text-white"
        >
          <h3 className="font-bold text-lg mb-1.5">Need Immediate Assistance?</h3>
          <p className="text-emerald-200 text-sm mb-6">
            For urgent matters or questions about your booking, call us any time — we're available
            24/7.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {CONTACT_NUMBERS.map((c) => (
              <a
                key={c.href}
                href={c.href}
                className="flex items-center gap-2.5 px-4 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl transition-colors text-sm font-medium"
              >
                <Phone className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                {c.label}
              </a>
            ))}
          </div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="flex items-center justify-center gap-2.5 mt-3 px-4 py-3 bg-amber-500 hover:bg-amber-400 rounded-xl transition-colors text-sm font-bold text-emerald-950"
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
            onClick={handleViewBookings}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-amber-600 text-white rounded-full font-bold text-lg hover:bg-amber-700 transition-all shadow-lg shadow-amber-500/20"
          >
            View My Bookings <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={handleGoHome}
            className="flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-full font-bold text-lg hover:border-slate-900 hover:text-slate-900 transition-all"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </button>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default BookingSuccessPage;
