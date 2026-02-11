import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Calendar, Phone, CreditCard, MapPin,
  Briefcase, FileText, CheckCircle, ChevronDown, List,
  ChevronRight, ChevronLeft, Award, Home, Upload
} from 'lucide-react';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';

const WorkerRegistrationPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: '', age: '', dob: '', nic: '', phone: '',
    province: '', district: '', address: '',
    serviceType: '', qualifications: '', aboutMe: '',
    documents: null
  });

  const totalSteps = 4;

  const nextStep = () => {
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  // Animation variants
  const slideVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Worker Application:', formData);
    // Simulate API call
    setTimeout(() => {
      navigate('/services/provider-dashboard');
    }, 1000);
  };

  const services = [
    { value: 'nursing', label: 'Home Nursing' },
    { value: 'caretaker', label: 'Elderly Caretaker' },
    { value: 'nanny', label: 'Nanny / Child Care' },
    { value: 'hospital', label: 'Hospital Staffing' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <div className="flex-grow flex items-center justify-center pt-24 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-5xl bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden flex flex-col md:flex-row min-h-[600px]">


          {/* Left Sidebar - Progress & Info */}
          <div className="w-full md:w-1/3 bg-indigo-900 p-8 text-white relative flex flex-col justify-between hidden md:flex">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-800 to-indigo-900" />
            <div className="absolute top-0 right-0 p-12 opacity-10 transform translate-x-1/2 -translate-y-1/2">
              <Briefcase className="w-64 h-64 text-white" />
            </div>

            <div className="relative z-10">
              <h1 className="text-3xl font-bold mb-2">Join VCare</h1>
              <p className="text-indigo-200 text-sm mb-8">Complete your profile to start receiving job offers.</p>

              {/* Progress Steps */}
              <div className="space-y-6">
                {[
                  { id: 1, title: "Personal", icon: User },
                  { id: 2, title: "Location", icon: MapPin },
                  { id: 3, title: "Professional", icon: Briefcase },
                  { id: 4, title: "Confirm", icon: CheckCircle }
                ].map((step) => (
                  <div key={step.id} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${currentStep >= step.id
                      ? 'bg-white text-indigo-900 border-white'
                      : 'bg-transparent text-indigo-400 border-indigo-700'
                      }`}>
                      <step.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${currentStep >= step.id ? 'text-white' : 'text-indigo-400'}`}>
                        {step.title}
                      </div>
                      {currentStep === step.id && (
                        <motion.div layoutId="activeStep" className="h-0.5 w-12 bg-emerald-400 mt-1 rounded-full" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-8 md:mt-0">
              <div className="p-4 bg-indigo-800/50 rounded-xl backdrop-blur-sm border border-indigo-700">
                <p className="text-xs text-indigo-200">
                  "Highest paying healthcare platform in Sri Lanka."
                </p>
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1.5 h-1.5 bg-yellow-400 rounded-full" />)}
                </div>
              </div>
            </div>
          </div>

          {/* Right Content - Multi-step Form */}
          <div className="w-full md:w-2/3 bg-white p-8 md:p-12 relative flex flex-col">
            {/* Mobile Header (Visible only on mobile) */}
            <div className="md:hidden mb-6 pb-6 border-b border-slate-100">
              <h1 className="text-2xl font-bold text-slate-900">Step {currentStep} of {totalSteps}</h1>
              <div className="w-full bg-slate-100 h-2rounded-full mt-2">
                <div
                  className="h-2 bg-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex-grow flex flex-col justify-between h-full">

              {/* Steps Content */}
              <div className="flex-grow">
                <AnimatePresence mode="wait">

                  {/* Step 1: Personal Details */}
                  {currentStep === 1 && (
                    <motion.div
                      key="step1"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">Personal Details</h2>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Full Name</label>
                          <input
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.fullName}
                            onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                            placeholder="e.g. Saman Kumara"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Date of Birth</label>
                          <input
                            type="date"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.dob}
                            onChange={e => setFormData({ ...formData, dob: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Age</label>
                          <input
                            type="number"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.age}
                            onChange={e => setFormData({ ...formData, age: e.target.value })}
                            placeholder="e.g. 28"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">NIC Number</label>
                          <input
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.nic}
                            onChange={e => setFormData({ ...formData, nic: e.target.value })}
                            placeholder="National ID"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Phone Number</label>
                          <input
                            type="tel"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value })}
                            placeholder="077 123 4567"
                            required
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Location */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">Location Details</h2>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Province</label>
                          <div className="relative">
                            <select
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-slate-900"
                              value={formData.province}
                              onChange={e => setFormData({ ...formData, province: e.target.value })}
                              required
                            >
                              <option value="">Select Province</option>
                              <option value="western">Western</option>
                              <option value="central">Central</option>
                              <option value="southern">Southern</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">District / City</label>
                          <input
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400"
                            value={formData.district}
                            onChange={e => setFormData({ ...formData, district: e.target.value })}
                            placeholder="e.g. Colombo"
                            required
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Home Address</label>
                          <textarea
                            rows="3"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                            value={formData.address}
                            onChange={e => setFormData({ ...formData, address: e.target.value })}
                            placeholder="Street address, Zip code"
                            required
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Professional */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">Professional Profile</h2>
                      <div className="space-y-6">
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Applying For</label>
                          <div className="relative">
                            <select
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-slate-900"
                              value={formData.serviceType}
                              onChange={e => setFormData({ ...formData, serviceType: e.target.value })}
                              required
                            >
                              <option value="">Select Service Type</option>
                              {services.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Qualifications</label>
                          <textarea
                            rows="3"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                            value={formData.qualifications}
                            onChange={e => setFormData({ ...formData, qualifications: e.target.value })}
                            placeholder="Degrees, NVQ levels, etc."
                            required
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">About Me</label>
                          <textarea
                            rows="4"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                            value={formData.aboutMe}
                            onChange={e => setFormData({ ...formData, aboutMe: e.target.value })}
                            placeholder="Brief introduction..."
                            required
                          />
                        </div>

                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Upload Certificates / CV</label>
                          <div className="relative">
                            <input
                              type="file"
                              id="doc-upload"
                              className="hidden"
                              multiple
                              onChange={(e) => setFormData({ ...formData, documents: e.target.files })}
                            />
                            <label
                              htmlFor="doc-upload"
                              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                            >
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                                <p className="text-sm text-slate-500 font-medium">Click to upload documents</p>
                                <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG (Max 5MB)</p>
                              </div>
                            </label>
                            {formData.documents && (
                              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                <span className="text-sm text-indigo-900 font-medium">
                                  {formData.documents.length} file(s) selected
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 4: Confirmation */}
                  {currentStep === 4 && (
                    <motion.div
                      key="step4"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">Confirm Details</h2>

                      <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-4">
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-slate-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900">{formData.fullName || "Not provided"}</h3>
                            <p className="text-sm text-slate-500">{formData.phone} • {formData.nic}</p>
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full" />
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-slate-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900">{formData.city || formData.district || "Location"}</h3>
                            <p className="text-sm text-slate-500">{formData.address || "No address provided"}</p>
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full" />
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-5 h-5 text-slate-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 capitalize">{formData.serviceType || "No Service Selected"}</h3>
                            <p className="text-sm text-slate-500 line-clamp-2">{formData.qualifications}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100 mt-4">
                        <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                        <p className="text-sm text-emerald-900">
                          I confirm details are accurate. VCare will contact me within 24 hours.
                        </p>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>

              {/* Navigation Buttons */}
              <div className="pt-8 mt-8 border-t border-slate-100 flex justify-between">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium hover:text-indigo-600 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" /> Back
                  </button>
                ) : (
                  <div /> /* Spacer */
                )}

                {currentStep < 4 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all"
                  >
                    Next Step <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all"
                  >
                    Submit Application <CheckCircle className="w-5 h-5" />
                  </button>
                )}
              </div>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkerRegistrationPage;

