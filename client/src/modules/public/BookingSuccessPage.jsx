import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Phone, Mail, Calendar, Heart, Home } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

const BookingSuccessPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(10);

  const { requestId, selectedStaff } = location.state || {};

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const handleGoHome = () => {
    navigate('/');
  };

  const handleViewBookings = () => {
    navigate('/dashboard/bookings');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* Success Icon */}
          <div className="flex justify-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center"
            >
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </motion.div>
          </div>

          {/* Success Message */}
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Booking Confirmed!
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Your elderly care service request has been successfully submitted. Our team will contact you within 24 hours to finalize the arrangements.
          </p>

          {/* Request ID */}
          {requestId && (
            <div className="bg-slate-100 rounded-xl p-4 mb-8 inline-block">
              <p className="text-sm text-slate-600">Request ID</p>
              <p className="font-mono font-bold text-slate-900">{requestId}</p>
            </div>
          )}

          {/* Selected Staff Info */}
          {selectedStaff && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8 text-left"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <Heart className="w-6 h-6 text-amber-600" />
                Your Selected Caregiver
              </h2>
              <div className="flex items-center gap-6">
                <img
                  src={selectedStaff.image}
                  alt={selectedStaff.name}
                  className="w-20 h-20 rounded-full object-cover"
                />
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900">{selectedStaff.name}</h3>
                  <p className="text-slate-600 mb-2">{selectedStaff.role} • {selectedStaff.experience}</p>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      Available 24/7
                    </span>
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      Response in 2 hours
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      Starts as planned
                    </span>
                  </div>
                </div>
                <div className="text-right">
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
            transition={{ delay: 0.6 }}
            className="bg-amber-50 rounded-2xl p-8 mb-8 text-left"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">What Happens Next?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Phone,
                  title: "We'll Call You",
                  description: "Our coordinator will contact you within 24 hours to confirm details"
                },
                {
                  icon: Calendar,
                  title: "Finalize Schedule",
                  description: "We'll confirm start dates and create a personalized care plan"
                },
                {
                  icon: Heart,
                  title: "Care Begins",
                  description: "Your selected caregiver will begin providing compassionate care"
                }
              ].map((step, index) => (
                <div key={index} className="flex gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <step.icon className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-1">{step.title}</h3>
                    <p className="text-sm text-slate-600">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Emergency Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-red-50 rounded-xl p-6 mb-8 border border-red-100"
          >
            <h3 className="font-bold text-red-900 mb-2">Need Immediate Assistance?</h3>
            <p className="text-red-800 mb-4">
              For urgent matters, please call our 24/7 helpline
            </p>
            <a 
              href="tel:0771234567" 
              className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
            >
              <Phone className="w-5 h-5" />
              Call 077-123-4567
            </a>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
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

          {/* Auto-redirect Countdown */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="mt-12 text-sm text-slate-500"
          >
            Redirecting to homepage in {countdown} seconds...
          </motion.div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
};

export default BookingSuccessPage;
