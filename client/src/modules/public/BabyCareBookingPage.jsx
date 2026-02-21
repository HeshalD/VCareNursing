import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Calendar, Phone, MapPin, Heart, CheckCircle, ShieldCheck,
  ArrowRight, UserCheck, Baby, Filter, Loader2,
  ChevronRight, ChevronLeft, Briefcase, Home, Clock, Star
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import apiClient from '../../api/api';

const BabyCareBookingPage = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [staffData, setStaffData] = useState([]);
  const [filteredStaff, setFilteredStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [shouldRefetchStaff, setShouldRefetchStaff] = useState(false);

  const [formData, setFormData] = useState({
    // Payer Information
    payer_name: '',
    payer_mobile: '',
    payer_email: '',

    // Baby Information
    patient_name: '',
    patient_age: '',
    relationship: 'PARENT',
    patient_condition: '',

    // Service Details
    service_type: '{NANNY}',
    service_model: 'VISITING',
    home_address: '',
    latitude: '',
    longitude: '',
    start_date: '',
    remarks: '',
    preferred_gender: 'ANY',
    preferred_staff_id: null
  });

  const totalSteps = 4;

  useEffect(() => {
    console.log('Step 4 useEffect triggered:', { currentStep, staffDataLength: staffData.length, shouldRefetchStaff });
    // Fetch staff data when we reach step 4 for the first time or need to refetch
    if (currentStep === 4 && (staffData.length === 0 || shouldRefetchStaff)) {
      console.log('Fetching staff data...');
      fetchStaffData();
      setShouldRefetchStaff(false);
    }
    if (currentStep === 4) {
      console.log('Step 4 is active - should show nanny selection');
    }
  }, [currentStep, shouldRefetchStaff]);

  useEffect(() => {
    filterStaff();
  }, [staffData, activeFilter]);

  const fetchStaffData = async () => {
    try {
      console.log('fetchStaffData called, genderPreference:', formData.preferred_gender);
      setLoading(true);
      setError(null);

      // Get current gender preference from form state
      const genderPreference = formData.preferred_gender;

      // Fetch NANNY staff based on gender preference
      if (genderPreference && genderPreference !== 'ANY') {
        console.log('Fetching staff by gender:', genderPreference);
        const staffResponse = await apiClient.getStaffByGender(genderPreference, {
          status: 'AVAILABLE',
          limit: 20
        });

        console.log('Gender API response:', staffResponse);

        // Transform gender-filtered data and filter for NANNY role
        const staff = staffResponse.data || [];
        const transformedStaff = staff
          .filter(staff => staff.role === 'NANNY')
          .map(staff => ({
            id: staff.staff_profile_id,
            name: staff.full_name,
            age: Math.floor(Math.random() * 20) + 25,
            role: 'Nanny',
            experience: Math.floor(Math.random() * 15) + 2,
            location: staff.home_address || 'Sri Lanka',
            rating: (Math.random() * 1.5 + 3.5).toFixed(1),
            reviews: Math.floor(Math.random() * 150) + 10,
            isVerified: staff.verification_status === 'VERIFIED',
            price: `LKR ${Math.floor(Math.random() * 800) + 600}/hr`,
            image: staff.profile_picture_url || `https://i.pravatar.cc/300?u=${staff.staff_profile_id}`,
            badges: Array.isArray(staff.qualifications) && staff.qualifications.length > 0
              ? staff.qualifications.slice(0, 2)
              : ['Experienced'],
            staffType: 'NANNY'
          }));

        console.log('Setting staff data:', transformedStaff);
        setStaffData(transformedStaff);
      } else {
        console.log('Fetching all NANNY staff (no gender preference)');
        // Fetch NANNY staff when no gender preference
        const nanniesResponse = await apiClient.getStaffByRole('NANNY', { status: 'AVAILABLE', limit: 20 });

        console.log('Nannies response:', nanniesResponse);

        const nannies = nanniesResponse.data || [];

        // Transform API data to match expected format
        const transformedStaff = nannies.map(staff => {
          // Calculate age from date_of_birth if available
          let calculatedAge = 25; // Default fallback age
          if (staff.date_of_birth) {
            const birthDate = new Date(staff.date_of_birth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
            calculatedAge = age;
          }

          return {
            id: staff.staff_profile_id,
            name: staff.full_name,
            age: calculatedAge,
            role: 'Nanny',
            experience: Math.floor(Math.random() * 15) + 2,
            location: staff.home_address || 'Sri Lanka',
            rating: (Math.random() * 1.5 + 3.5).toFixed(1),
            reviews: Math.floor(Math.random() * 150) + 10,
            isVerified: staff.verification_status === 'VERIFIED',
            price: `LKR ${Math.floor(Math.random() * 800) + 600}/hr`,
            image: staff.profile_picture_url || `https://i.pravatar.cc/300?u=${staff.staff_profile_id}`,
            badges: Array.isArray(staff.qualifications) && staff.qualifications.length > 0
              ? staff.qualifications.slice(0, 2)
              : ['Experienced'],
            staffType: 'NANNY'
          };
        });

        console.log('Setting staff data (all):', transformedStaff);
        setStaffData(transformedStaff);
      }
    } catch (err) {
      console.error('Error fetching staff data:', err);
      setError('Failed to load staff data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const filterStaff = () => {
    if (activeFilter === 'ALL') {
      setFilteredStaff(staffData);
    } else {
      setFilteredStaff(staffData.filter(staff => staff.staffType === activeFilter));
    }
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
  };

  const handleStaffSelect = (staff) => {
    setSelectedStaff(staff);
    setFormData({ ...formData, preferred_staff_id: staff.id });
  };

  const nextStep = () => {
    console.log('nextStep called, currentStep:', currentStep, 'totalSteps:', totalSteps);
    if (currentStep < totalSteps) {
      const newStep = currentStep + 1;
      console.log('Advancing to step:', newStep);
      setCurrentStep(newStep);
    } else {
      console.log('Cannot advance - already at final step');
    }
  };

  const prevStep = () => {
    console.log('prevStep called, currentStep:', currentStep);
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      console.log('Enter key pressed on step:', currentStep);
      // Only allow navigation on steps 1-3
      if (currentStep < 4) {
        console.log('Going to next step via Enter key');
        nextStep();
      }
      // On step 4, do nothing - user must click submit button
    }
  };

  // Only allow handleKeyDown on steps 1-3, not on step 4
  const shouldHandleKeyDown = () => {
    return currentStep < 4;
  };

  const handleSubmit = async (e) => {
    console.log('handleSubmit called on step:', currentStep);
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Prepare form data, ensuring empty strings are converted to null for numeric fields
      const submissionData = {
        ...formData,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
      };

      const response = await apiClient.submitServiceRequest(submissionData);
      console.log('Booking request submitted successfully:', response);

      // Navigate to success page
      navigate('/booking-success', {
        state: {
          requestId: response.data?.request_id,
          selectedStaff: selectedStaff
        }
      });

    } catch (error) {
      console.error('Booking submission error:', error);
      setSubmitError(error.message || 'Failed to submit booking request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Animation variants
  const slideVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Book Baby Care Service
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Find the perfect nanny for your little one in just a few simple steps
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          <div className="flex items-center gap-4">
            {[
              { id: 1, title: "Payer Details", icon: User },
              { id: 2, title: "Baby Info", icon: Baby },
              { id: 3, title: "Service Details", icon: Heart },
              { id: 4, title: "Choose Nanny", icon: CheckCircle }
            ].map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div className={`p-3 rounded-full ${currentStep >= step.id ? 'bg-rose-500 text-white border-rose-500' : 'bg-white text-slate-400 border-slate-300'}`}>
                    <step.icon className="w-6 h-6" />
                  </div>
                  <span className={`text-sm font-medium mt-2 ${currentStep >= step.id ? 'text-slate-900' : 'text-slate-400'}`}>
                    {step.title}
                  </span>
                </div>
                {index < 3 && (
                  <div className={`h-0.5 w-16 transition-all ${currentStep > step.id ? 'bg-rose-500' : 'bg-slate-300'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-[32px] shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-8 md:p-12">
            <form onSubmit={(e) => e.preventDefault()}>
              <AnimatePresence mode="wait">

                {/* Step 1: Payer Details */}
                {currentStep === 1 && (
                  <motion.div
                    key="step1"
                    variants={slideVariants}
                    initial="hidden" animate="visible" exit="exit"
                    className="space-y-6"
                  >
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Payer Information</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Full Name</label>
                        <input
                          type="text"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 placeholder:text-slate-400"
                          value={formData.payer_name}
                          onChange={e => setFormData({ ...formData, payer_name: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="e.g. John Doe"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Mobile Number</label>
                        <input
                          type="tel"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 placeholder:text-slate-400"
                          value={formData.payer_mobile}
                          onChange={e => setFormData({ ...formData, payer_mobile: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="e.g. 0771234567"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Email Address</label>
                        <input
                          type="email"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 placeholder:text-slate-400"
                          value={formData.payer_email}
                          onChange={e => setFormData({ ...formData, payer_email: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="e.g. john@example.com"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 2: Baby Information */}
                {currentStep === 2 && (
                  <motion.div
                    key="step2"
                    variants={slideVariants}
                    initial="hidden" animate="visible" exit="exit"
                    className="space-y-6"
                  >
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Baby Information</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Baby Name</label>
                        <input
                          type="text"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 placeholder:text-slate-400"
                          value={formData.patient_name}
                          onChange={e => setFormData({ ...formData, patient_name: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="e.g. Emma Johnson"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Baby Age</label>
                        <input
                          type="number"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900 placeholder:text-slate-400"
                          value={formData.patient_age}
                          onChange={e => setFormData({ ...formData, patient_age: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="e.g. 6 months, 2 years"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Relationship to Baby</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900"
                          value={formData.relationship}
                          onChange={e => setFormData({ ...formData, relationship: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          required
                        >
                          <option value="PARENT">Parent</option>
                          <option value="GUARDIAN">Guardian</option>
                          <option value="GRANDPARENT">Grandparent</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Special Needs or Requirements (Optional)</label>
                        <textarea
                          rows="3"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                          value={formData.patient_condition}
                          onChange={e => setFormData({ ...formData, patient_condition: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="Any special care requirements, allergies, or preferences..."
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Service Details */}
                {currentStep === 3 && (
                  <motion.div
                    key="step3"
                    variants={slideVariants}
                    initial="hidden" animate="visible" exit="exit"
                    className="space-y-6"
                  >
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Service Details</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Home Address</label>
                        <textarea
                          rows="3"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                          value={formData.home_address}
                          onChange={e => setFormData({ ...formData, home_address: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="Full address for care service"
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Start Date</label>
                        <input
                          type="date"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900"
                          value={formData.start_date}
                          onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          required
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Service Model</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900"
                          value={formData.service_model}
                          onChange={e => setFormData({ ...formData, service_model: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          required
                        >
                          <option value="VISITING">Visiting</option>
                          <option value="LIVE_IN">Live In</option>
                          <option value="PART_TIME">Part Time</option>
                          <option value="FULL_TIME">Full Time</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Preferred Nanny Gender</label>
                        <select
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-900"
                          value={formData.preferred_gender}
                          onChange={e => {
                            setFormData({ ...formData, preferred_gender: e.target.value });
                            // Trigger refetch if we're already on step 4
                            if (currentStep === 4) {
                              setShouldRefetchStaff(true);
                            }
                          }}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                        >
                          <option value="ANY">No Preference</option>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-sm font-semibold text-slate-600 block mb-1">Additional Remarks (Optional)</label>
                        <textarea
                          rows="3"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none text-slate-900 placeholder:text-slate-400"
                          value={formData.remarks}
                          onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                          onKeyDown={shouldHandleKeyDown() ? handleKeyDown : undefined}
                          placeholder="Any special requirements or notes..."
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Step 4: Choose Nanny */}
                {currentStep === 4 && (
                  <motion.div
                    key="step4"
                    variants={slideVariants}
                    initial="hidden" animate="visible" exit="exit"
                    className="space-y-6"
                  >
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">Choose Your Nanny</h2>

                    {/* No Specific Staff Option */}
                    <div
                      onClick={() => {
                        setSelectedStaff(null);
                        setFormData({ ...formData, preferred_staff_id: null });
                      }}
                      className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all mb-6 ${!selectedStaff
                          ? 'border-rose-500 bg-rose-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                    >
                      {!selectedStaff && (
                        <div className="absolute top-4 right-4 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                      )}

                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center">
                          <Baby className="w-8 h-8 text-slate-500" />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">No Specific Nanny</h3>
                          <p className="text-sm text-slate-600">Let us assign the best available nanny based on your requirements</p>
                        </div>
                      </div>
                    </div>

                    {/* Filter Buttons */}
                    <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1 mb-8">
                      <button
                        onClick={() => handleFilterChange('ALL')}
                        className={`px-6 py-2 rounded-full font-medium transition-all ${activeFilter === 'ALL'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        All Nannies
                      </button>
                      <button
                        onClick={() => handleFilterChange('NANNY')}
                        className={`px-6 py-2 rounded-full font-medium transition-all ${activeFilter === 'NANNY'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        Nannies
                      </button>
                    </div>

                    {/* Loading State */}
                    {loading && (
                      <div className="flex flex-col items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-4" />
                        <p className="text-slate-600">Loading trusted nannies...</p>
                      </div>
                    )}

                    {/* Error State */}
                    {error && (
                      <div className="text-center py-16">
                        <p className="text-red-600 mb-4">{error}</p>
                        <button
                          onClick={fetchStaffData}
                          className="px-6 py-2 bg-rose-500 text-white rounded-full font-medium hover:bg-rose-600 transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    )}

                    {/* Staff Selection */}
                    {!loading && !error && (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredStaff.map((staff) => (
                          <div
                            key={staff.id}
                            onClick={() => handleStaffSelect(staff)}
                            className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all ${selectedStaff?.id === staff.id
                                ? 'border-rose-500 bg-rose-50'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                              }`}
                          >
                            {selectedStaff?.id === staff.id && (
                              <div className="absolute top-4 right-4 w-6 h-6 bg-rose-500 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                            )}

                            <div className="flex items-center gap-4 mb-4">
                              <img
                                src={staff.image}
                                alt={staff.name}
                                className="w-16 h-16 rounded-full object-cover"
                              />
                              <div>
                                <h3 className="font-bold text-slate-900">{staff.name}</h3>
                                <p className="text-sm text-slate-600">{staff.role}</p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Star className="w-4 h-4 text-rose-500 fill-current" />
                                <span>{staff.rating} ({staff.reviews} reviews)</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <Briefcase className="w-4 h-4" />
                                <span>{staff.experience}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <MapPin className="w-4 h-4" />
                                <span>{staff.location}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm font-semibold text-rose-600">
                                <span>{staff.price}</span>
                              </div>
                            </div>

                            {staff.isVerified && (
                              <div className="flex items-center gap-1 mt-3">
                                <ShieldCheck className="w-4 h-4 text-green-600" />
                                <span className="text-xs text-green-600 font-medium">Verified</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8">
                <button
                  type="button"
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${currentStep === 1
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                    }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                  Previous
                </button>

                {currentStep < totalSteps ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors"
                  >
                    Next
                    <ChevronRight className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Confirm Booking
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default BabyCareBookingPage;
