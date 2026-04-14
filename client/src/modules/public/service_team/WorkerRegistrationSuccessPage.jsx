import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Phone, Mail, Calendar, Briefcase, Home, FileText, User } from 'lucide-react';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';

const WorkerRegistrationSuccessPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(10);

  const { applicationData } = location.state || {};

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

  const handleViewApplications = () => {
    navigate('/services/join-team');
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
            Application Submitted!
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Your caregiver application has been successfully submitted. Our team will review your application and contact you within 3-5 business days.
          </p>

          {/* Application ID */}
          {applicationData?.application_id && (
            <div className="bg-slate-100 rounded-xl p-4 mb-8 inline-block">
              <p className="text-sm text-slate-600">Application ID</p>
              <p className="font-mono font-bold text-slate-900">{applicationData.application_id}</p>
            </div>
          )}

          {/* Applicant Info */}
          {applicationData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8 mb-8 text-left"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <Briefcase className="w-6 h-6 text-amber-600" />
                Your Application Details
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">Personal Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Name:</span>
                      <span className="font-medium text-slate-900">{applicationData.full_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Email:</span>
                      <span className="font-medium text-slate-900">{applicationData.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Mobile:</span>
                      <span className="font-medium text-slate-900">{applicationData.mobile_number}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 mb-4">Application Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Applied Roles:</span>
                      <span className="font-medium text-slate-900">
                        {Array.isArray(applicationData.applied_roles) 
                          ? applicationData.applied_roles.join(', ')
                          : applicationData.applied_roles}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Status:</span>
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                        Under Review
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">Submitted:</span>
                      <span className="font-medium text-slate-900">
                        {new Date().toLocaleDateString()}
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
            transition={{ delay: 0.6 }}
            className="bg-amber-50 rounded-2xl p-8 mb-8 text-left"
          >
            <h2 className="text-2xl font-bold text-slate-900 mb-6">What Happens Next?</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: FileText,
                  title: "Application Review",
                  description: "Our team will review your qualifications and documents"
                },
                {
                  icon: Phone,
                  title: "Interview Call",
                  description: "We'll contact you for an interview within 3-5 business days"
                },
                {
                  icon: Briefcase,
                  title: "Onboarding",
                  description: "Successful candidates will be onboarded and trained"
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

          {/* Contact Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-blue-50 rounded-xl p-6 mb-8 border border-blue-100"
          >
            <h3 className="font-bold text-blue-900 mb-2">Questions About Your Application?</h3>
            <p className="text-blue-800 mb-4">
              For inquiries about your application status, please contact our HR team
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="tel:0771234567" 
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
              >
                <Phone className="w-5 h-5" />
                Call HR: 077-123-4567
              </a>
              <a 
                href="mailto:hr@vcarenursing.com" 
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-blue-200 text-blue-700 rounded-xl font-bold hover:border-blue-600 hover:text-blue-800 transition-all"
              >
                <Mail className="w-5 h-5" />
                hr@vcarenursing.com
              </a>
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <button
              onClick={handleViewApplications}
              className="flex items-center justify-center gap-2 px-8 py-4 bg-amber-600 text-white rounded-full font-bold text-lg hover:bg-amber-700 transition-all shadow-lg shadow-amber-500/20"
            >
              View Service Team <ArrowRight className="w-5 h-5" />
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

export default WorkerRegistrationSuccessPage;
