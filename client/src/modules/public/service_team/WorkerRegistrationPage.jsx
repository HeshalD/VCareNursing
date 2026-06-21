import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Calendar, Phone, CreditCard, MapPin,
  Briefcase, FileText, CheckCircle, ChevronDown, List,
  ChevronRight, ChevronLeft, Award, Home, Upload, X
} from 'lucide-react';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';
import apiClient from '../../../api/api';

const WorkerRegistrationPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    full_name: '', email: '', mobile_number: '', applied_roles: [], 
    qualifications: '', home_address: '', location: '', latitude: '', longitude: '',
    documents: [], profile_picture: null, gender: '', willing_to_live_in: false, date_of_birth: '',
    nic_number: '', nic_front: null, nic_back: null
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [documentPreviews, setDocumentPreviews] = useState([]);
  const [nicFrontPreview, setNicFrontPreview] = useState('');
  const [nicBackPreview, setNicBackPreview] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    full_name: '',
    email: '',
    mobile_number: '',
    applied_roles: '',
    qualifications: '',
    home_address: '',
    location: '',
    gender: '',
    date_of_birth: '',
    documents: '',
    profile_picture: '',
    nic_number: '',
    nic_front: '',
    nic_back: ''
  });

  // Auto-complete form fields if user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log('Full user object:', user);
      console.log('Available fields:', Object.keys(user));
      
      // Extract data from actual user object structure
      const fullName = user.client_info?.name || user.staff_info?.name || user.full_name || '';
      const email = user.email || ''; // Email is at top level in response.data
      const gender = user.gender || ''; // New field from JWT
      const primaryAddress = user.primary_address || ''; // New field from JWT
      
      setFormData(prev => ({
        ...prev,
        full_name: fullName.trim() || prev.full_name,
        mobile_number: user.mobile_number || prev.mobile_number,
        email: email || prev.email,
        gender: gender || prev.gender,
        home_address: primaryAddress || prev.home_address
      }));
      
      console.log('Auto-completed form fields:', {
        full_name: fullName.trim(),
        mobile_number: user.mobile_number,
        email: email,
        gender: gender,
        home_address: primaryAddress
      });
    }
  }, [isAuthenticated, user]);

  // Helper functions to check if fields are auto-completed
  const hasAutoCompletedFullName = () => {
    if (!isAuthenticated || !user) return false;
    return !!(user.client_info?.name || user.staff_info?.name || user.full_name);
  };

  const hasAutoCompletedEmail = () => {
    if (!isAuthenticated || !user) return false;
    return !!user.email;
  };

  const hasAutoCompletedGender = () => {
    if (!isAuthenticated || !user) return false;
    return !!user.gender;
  };

  const hasAutoCompletedAddress = () => {
    if (!isAuthenticated || !user) return false;
    return !!user.primary_address;
  };

  // Handle NIC front photo change
  const handleNicFrontChange = (file) => {
    if (file) {
      setFormData(prev => ({ ...prev, nic_front: file }));
      const error = validateField('nic_front', file);
      setFieldErrors(prev => ({ ...prev, nic_front: error }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setNicFrontPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle NIC back photo change
  const handleNicBackChange = (file) => {
    if (file) {
      setFormData(prev => ({ ...prev, nic_back: file }));
      const error = validateField('nic_back', file);
      setFieldErrors(prev => ({ ...prev, nic_back: error }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setNicBackPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle NIC front delete
  const handleNicFrontDelete = () => {
    setFormData(prev => ({ ...prev, nic_front: null }));
    setNicFrontPreview('');
    setFieldErrors(prev => ({ ...prev, nic_front: 'NIC front photo is required' }));
  };

  // Handle NIC back delete
  const handleNicBackDelete = () => {
    setFormData(prev => ({ ...prev, nic_back: null }));
    setNicBackPreview('');
    setFieldErrors(prev => ({ ...prev, nic_back: 'NIC back photo is required' }));
  };

  // Handle profile picture change
  const handleProfilePictureChange = (file) => {
    if (file) {
      setFormData(prev => ({ ...prev, profile_picture: file }));
      const error = validateField('profile_picture', file);
      setFieldErrors(prev => ({ ...prev, profile_picture: error }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle profile picture delete
  const handleProfilePictureDelete = () => {
    setFormData(prev => ({ ...prev, profile_picture: null }));
    setFieldErrors(prev => ({ ...prev, profile_picture: 'Profile picture is required' }));
    setProfilePicturePreview('');
  };

  // Handle documents change
  const handleDocumentsChange = (files) => {
    const newDocuments = Array.from(files);
    setFormData(prev => ({ ...prev, documents: newDocuments }));
    const error = validateField('documents', newDocuments);
    setFieldErrors(prev => ({ ...prev, documents: error }));
    
    // Create previews for new documents
    const newPreviews = newDocuments.map(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setDocumentPreviews(prev => {
            const filtered = prev.filter(p => p.name !== file.name);
            return [...filtered, { name: file.name, type: file.type, preview: reader.result }];
          });
        };
        reader.readAsDataURL(file);
        return { name: file.name, type: file.type, preview: null };
      } else {
        return { name: file.name, type: file.type, preview: null };
      }
    });
    
    // Update previews state for non-image files immediately
    setDocumentPreviews(prev => {
      const filtered = prev.filter(p => !newDocuments.find(doc => doc.name === p.name));
      return [...filtered, ...newPreviews.filter(p => p.preview === null)];
    });
  };

  // Handle single document delete
  const handleDocumentDelete = (fileName) => {
    const updatedDocuments = formData.documents.filter(doc => doc.name !== fileName);
    setFormData(prev => ({ ...prev, documents: updatedDocuments }));
    const error = validateField('documents', updatedDocuments);
    setFieldErrors(prev => ({ ...prev, documents: error }));
    setDocumentPreviews(prev => prev.filter(p => p.name !== fileName));
  };

  // Real-time validation function
  const validateField = (name, value) => {
    let error = '';
    
    switch (name) {
      case 'full_name':
        if (!value || value.trim() === '') {
          error = 'Full name is required';
        } else if (value.trim().length < 3) {
          error = 'Full name must be at least 3 characters';
        } else if (value.trim().length > 50) {
          error = 'Full name must be less than 50 characters';
        }
        break;
      case 'email':
        if (value && value.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          error = 'Valid email address is required';
        }
        break;
      case 'mobile_number':
        if (!value || value.trim() === '') {
          error = 'Mobile number is required';
        } else if (!/^07[0-9]{8}$/.test(value.replace(/\s/g, ''))) {
          error = 'Mobile number must be 10 digits starting with 07';
        }
        break;
      case 'applied_roles':
        if (!value || value.length === 0) {
          error = 'At least one role must be selected';
        }
        break;
      case 'qualifications':
        if (!value || value.trim() === '') {
          error = 'Qualifications are required';
        } else if (value.trim().length < 10) {
          error = 'Qualifications must be at least 10 characters';
        }
        break;
      case 'home_address':
        if (!value || value.trim() === '') {
          error = 'Home address is required';
        } else if (value.trim().length < 10) {
          error = 'Home address must be at least 10 characters';
        }
        break;
      case 'location':
        if (!value || value.trim() === '') {
          error = 'Location is required';
        }
        break;
      case 'gender':
        if (!value || value.trim() === '') {
          error = 'Gender is required';
        }
        break;
      case 'date_of_birth':
        if (!value || value.trim() === '') {
          error = 'Date of birth is required';
        } else {
          const selectedDate = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate > today) {
            error = 'Date of birth cannot be in the future';
          } else {
            let age = today.getFullYear() - selectedDate.getFullYear();
            const monthDiff = today.getMonth() - selectedDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < selectedDate.getDate())) {
              age--;
            }
            if (age < 18) {
              error = 'You must be at least 18 years old to apply';
            } else if (age > 65) {
              error = 'Age must be less than 65 years';
            }
          }
        }
        break;
      case 'documents':
        if (!value || value.length === 0) {
          error = 'At least one document must be uploaded';
        }
        break;
      case 'profile_picture':
        if (!value) {
          error = 'Profile picture is required';
        }
        break;
      case 'nic_number':
        if (!value || value.trim() === '') {
          error = 'NIC number is required';
        } else if (value.trim().length < 5) {
          error = 'NIC number must be at least 5 characters';
        }
        break;
      case 'nic_front':
        if (!value) {
          error = 'NIC front photo is required';
        }
        break;
      case 'nic_back':
        if (!value) {
          error = 'NIC back photo is required';
        }
        break;
    }
    
    return error;
  };

  // Handle input change with validation
  const handleInputChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    const error = validateField(name, value);
    setFieldErrors(prev => ({ ...prev, [name]: error }));
  };

  // Check if form is valid
  const isFormValid = () => {
    const requiredFields = {
      full_name: formData.full_name,
      mobile_number: formData.mobile_number,
      applied_roles: formData.applied_roles,
      qualifications: formData.qualifications,
      home_address: formData.home_address,
      location: formData.location,
      gender: formData.gender,
      date_of_birth: formData.date_of_birth,
      documents: formData.documents,
      profile_picture: formData.profile_picture,
      nic_number: formData.nic_number,
      nic_front: formData.nic_front,
      nic_back: formData.nic_back
    };
    
    // Check if all fields have values and no errors
    for (const [field, value] of Object.entries(requiredFields)) {
      const error = validateField(field, value);
      if (error || !value || (Array.isArray(value) && value.length === 0)) {
        return false;
      }
    }
    return true;
  };

  const totalSteps = 5;

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Prepare application data
      const applicationData = {
        full_name: formData.full_name,
        email: formData.email,
        mobile_number: formData.mobile_number,
        applied_roles: formData.applied_roles,
        qualifications: formData.qualifications,
        home_address: formData.home_address,
        location: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        gender: formData.gender,
        willing_to_live_in: formData.willing_to_live_in,
        date_of_birth: formData.date_of_birth,
        nic_number: formData.nic_number
      };

      // Prepare form data with all files
      const formDataWithFiles = new FormData();
      Object.keys(applicationData).forEach(key => {
        if (Array.isArray(applicationData[key])) {
          formDataWithFiles.append(key, JSON.stringify(applicationData[key]));
        } else {
          formDataWithFiles.append(key, applicationData[key]);
        }
      });
      
      // Add documents
      if (formData.documents && formData.documents.length > 0) {
        formData.documents.forEach(doc => {
          formDataWithFiles.append('documents', doc);
        });
      }
      
      // Add profile picture
      if (formData.profile_picture) {
        formDataWithFiles.append('profile_picture', formData.profile_picture);
      }
      
      // Add NIC files
      if (formData.nic_front) {
        formDataWithFiles.append('nic_front', formData.nic_front);
      }
      if (formData.nic_back) {
        formDataWithFiles.append('nic_back', formData.nic_back);
      }
      
      // Submit application with all files
      const response = await apiClient.submitApplication(
        applicationData,
        formData.documents,
        formData.profile_picture,
        formData.nic_front,
        formData.nic_back
      );

      console.log('Application submitted successfully:', response);
      
      // Navigate to success page with application data
      navigate('/verify-staff-otp', {
        state: {
          applicationId: response.data?.application_id,
          mobileNumber: formData.mobile_number
        }
      });
      
    } catch (error) {
      console.error('Application submission error:', error);
      setSubmitError(error.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  { id: 2, title: "NIC Details", icon: CreditCard },
                  { id: 3, title: "Location", icon: MapPin },
                  { id: 4, title: "Professional", icon: Briefcase },
                  { id: 5, title: "Confirm", icon: CheckCircle }
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
                      
                      {/* Auto-complete notice for authenticated users */}
                      {isAuthenticated && (
                        <div className="md:col-span-2 mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <p className="text-sm text-emerald-800">
                              <span className="font-semibold">Welcome back!</span> Some fields have been pre-filled from your account. You can modify them if needed.
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                          <label className="text-sm font-semibold text-slate-600 block mb-1">
                            Name With Initials
                            {hasAutoCompletedFullName() && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">From account</span>
                            )}
                          </label>
                          <input
                            type="text"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 ${
                              hasAutoCompletedFullName() 
                                ? 'bg-emerald-50 border-emerald-200' 
                                : fieldErrors.full_name 
                                  ? 'bg-red-50 border-red-300' 
                                  : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.full_name}
                            onChange={e => handleInputChange('full_name', e.target.value)}
                            placeholder="e.g. Saman Kumara"
                            required
                          />
                          {fieldErrors.full_name && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.full_name}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">
                            Email Address
                            <span className="ml-2 text-xs text-slate-400 font-normal">(Optional)</span>
                            {hasAutoCompletedEmail() && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">From account</span>
                            )}
                          </label>
                          <input
                            type="email"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 ${
                              hasAutoCompletedEmail()
                                ? 'bg-emerald-50 border-emerald-200'
                                : fieldErrors.email
                                  ? 'bg-red-50 border-red-300'
                                  : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.email}
                            onChange={e => handleInputChange('email', e.target.value)}
                            placeholder="e.g. saman@example.com"
                          />
                          {fieldErrors.email && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">
                            Mobile Number
                            {isAuthenticated && user?.mobile_number && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">From account</span>
                            )}
                          </label>
                          <input
                            type="tel"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 ${
                              isAuthenticated && user?.mobile_number 
                                ? 'bg-emerald-50 border-emerald-200' 
                                : fieldErrors.mobile_number 
                                  ? 'bg-red-50 border-red-300' 
                                  : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.mobile_number}
                            onChange={e => handleInputChange('mobile_number', e.target.value)}
                            placeholder="e.g. 0771234567"
                            required
                          />
                          {fieldErrors.mobile_number && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.mobile_number}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">
                            Gender
                            {hasAutoCompletedGender() && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">From account</span>
                            )}
                          </label>
                          <select
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 ${
                              hasAutoCompletedGender() 
                                ? 'bg-emerald-50 border-emerald-200' 
                                : fieldErrors.gender 
                                  ? 'bg-red-50 border-red-300' 
                                  : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.gender}
                            onChange={e => handleInputChange('gender', e.target.value)}
                            required
                          >
                            <option value="">Select gender</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                          </select>
                          {fieldErrors.gender && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.gender}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Date of Birth</label>
                          <input
                            type="date"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 ${
                              fieldErrors.date_of_birth 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.date_of_birth}
                            onChange={e => handleInputChange('date_of_birth', e.target.value)}
                            required
                          />
                          {fieldErrors.date_of_birth && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.date_of_birth}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Applied Roles</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['NURSE', 'CARETAKER', 'NANNY'].map((role) => (
                              <button
                                key={role}
                                type="button"
                                onClick={() => {
                                  const currentRoles = formData.applied_roles || [];
                                  let newRoles;
                                  if (currentRoles.includes(role)) {
                                    // Remove role if already selected
                                    newRoles = currentRoles.filter(r => r !== role);
                                  } else {
                                    // Add role if not selected
                                    newRoles = [...currentRoles, role];
                                  }
                                  setFormData({ 
                                    ...formData, 
                                    applied_roles: newRoles 
                                  });
                                  const error = validateField('applied_roles', newRoles);
                                  setFieldErrors(prev => ({ ...prev, applied_roles: error }));
                                }}
                                className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                                  formData.applied_roles && formData.applied_roles.includes(role)
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                                }`}
                              >
                                {role.charAt(0) + role.slice(1).toLowerCase()}
                              </button>
                            ))}
                          </div>
                          {fieldErrors.applied_roles && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.applied_roles}</p>
                          )}
                          {formData.applied_roles && formData.applied_roles.length > 0 && (
                            <p className="text-xs text-slate-500 mt-2">
                              Selected: {formData.applied_roles.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <label className="flex items-center gap-3 text-sm font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-indigo-600 bg-slate-50 border-slate-200 rounded focus:ring-indigo-500"
                              checked={formData.willing_to_live_in}
                              onChange={e => setFormData({ ...formData, willing_to_live_in: e.target.checked })}
                            />
                            Willing to live in with client
                          </label>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: NIC Details */}
                  {currentStep === 2 && (
                    <motion.div
                      key="step2"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">NIC Details</h2>
                      <div className="space-y-6">
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">NIC Number</label>
                          <input
                            type="text"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 ${
                              fieldErrors.nic_number 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.nic_number}
                            onChange={e => handleInputChange('nic_number', e.target.value)}
                            placeholder="e.g. 123456789V"
                            required
                          />
                          {fieldErrors.nic_number && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.nic_number}</p>
                          )}
                        </div>

                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">NIC Front Photo</label>
                          {nicFrontPreview ? (
                            <div className="relative">
                              <div className="mt-2 relative">
                                <img
                                  src={nicFrontPreview}
                                  alt="NIC front preview"
                                  className="w-full max-h-64 object-cover rounded-xl border-2 border-indigo-200 shadow-md"
                                />
                                <button
                                  type="button"
                                  onClick={handleNicFrontDelete}
                                  className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                                  title="Remove NIC front photo"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="mt-3">
                                <input
                                  type="file"
                                  id="nic-front-reupload"
                                  className="hidden"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) handleNicFrontChange(file);
                                  }}
                                />
                                <label
                                  htmlFor="nic-front-reupload"
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors cursor-pointer text-sm font-medium"
                                >
                                  <Upload className="w-4 h-4" />
                                  Change Photo
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="file"
                                id="nic-front-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) handleNicFrontChange(file);
                                }}
                              />
                              <label
                                htmlFor="nic-front-upload"
                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                              >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                                  <p className="text-sm text-slate-500 font-medium">Click to upload NIC front</p>
                                  <p className="text-xs text-slate-400 mt-1">JPG, PNG (Max 2MB)</p>
                                </div>
                              </label>
                            </div>
                          )}
                          {fieldErrors.nic_front && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.nic_front}</p>
                          )}
                        </div>

                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">NIC Back Photo</label>
                          {nicBackPreview ? (
                            <div className="relative">
                              <div className="mt-2 relative">
                                <img
                                  src={nicBackPreview}
                                  alt="NIC back preview"
                                  className="w-full max-h-64 object-cover rounded-xl border-2 border-indigo-200 shadow-md"
                                />
                                <button
                                  type="button"
                                  onClick={handleNicBackDelete}
                                  className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                                  title="Remove NIC back photo"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="mt-3">
                                <input
                                  type="file"
                                  id="nic-back-reupload"
                                  className="hidden"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) handleNicBackChange(file);
                                  }}
                                />
                                <label
                                  htmlFor="nic-back-reupload"
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors cursor-pointer text-sm font-medium"
                                >
                                  <Upload className="w-4 h-4" />
                                  Change Photo
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="file"
                                id="nic-back-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) handleNicBackChange(file);
                                }}
                              />
                              <label
                                htmlFor="nic-back-upload"
                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                              >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                                  <p className="text-sm text-slate-500 font-medium">Click to upload NIC back</p>
                                  <p className="text-xs text-slate-400 mt-1">JPG, PNG (Max 2MB)</p>
                                </div>
                              </label>
                            </div>
                          )}
                          {fieldErrors.nic_back && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.nic_back}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Location */}
                  {currentStep === 3 && (
                    <motion.div
                      key="step3"
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
                              <option value="eastern">Eastern</option>
                              <option value="north central">North Central</option>
                              <option value="northen">Nothern</option>
                              <option value="nothern western">Nothern Western</option>
                              <option value="sabaragamuwa">Sabaragamuwa</option>
                              <option value="southern">Southern</option>
                              <option value="uva">Uva</option>
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                          <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">City</label>
                          <input
                            type="text"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder:text-slate-400 ${
                              fieldErrors.location 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.location}
                            onChange={e => handleInputChange('location', e.target.value)}
                            placeholder="e.g. Colombo"
                            required
                          />
                          {fieldErrors.location && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.location}</p>
                          )}
                        </div>
                        <div className="md:col-span-2">
                          <label className="text-sm font-semibold text-slate-600 block mb-1">
                            Home Address
                            {hasAutoCompletedAddress() && (
                              <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">From account</span>
                            )}
                          </label>
                          <textarea
                            rows="3"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 placeholder:text-slate-400 ${
                              hasAutoCompletedAddress() 
                                ? 'bg-emerald-50 border-emerald-200' 
                                : fieldErrors.home_address 
                                  ? 'bg-red-50 border-red-300' 
                                  : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.home_address}
                            onChange={e => handleInputChange('home_address', e.target.value)}
                            placeholder="Street address, Zip code"
                            required
                          />
                          {fieldErrors.home_address && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.home_address}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 4: Professional */}
                  {currentStep === 4 && (
                    <motion.div
                      key="step4"
                      variants={slideVariants}
                      initial="hidden" animate="visible" exit="exit"
                      className="space-y-6"
                    >
                      <h2 className="text-2xl font-bold text-slate-800 mb-6 hidden md:block">Professional Profile</h2>
                      <div className="space-y-6">
                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Qualifications</label>
                          <textarea
                            rows="3"
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-slate-900 placeholder:text-slate-400 ${
                              fieldErrors.qualifications 
                                ? 'bg-red-50 border-red-300' 
                                : 'bg-slate-50 border-slate-200'
                            }`}
                            value={formData.qualifications}
                            onChange={e => handleInputChange('qualifications', e.target.value)}
                            placeholder="Degrees, NVQ levels, etc."
                            required
                          />
                          {fieldErrors.qualifications && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.qualifications}</p>
                          )}
                        </div>

                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Upload Certificates / CV</label>
                          
                          {/* Document Previews */}
                          {documentPreviews.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {documentPreviews.map((doc, index) => (
                                <div key={doc.name} className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                                  {doc.preview ? (
                                    <img
                                      src={doc.preview}
                                      alt={doc.name}
                                      className="w-12 h-12 object-cover rounded border border-indigo-200"
                                    />
                                  ) : (
                                    <div className="w-12 h-12 bg-indigo-100 rounded flex items-center justify-center">
                                      <FileText className="w-6 h-6 text-indigo-600" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-indigo-900 truncate">{doc.name}</p>
                                    <p className="text-xs text-indigo-600">{doc.type.includes('pdf') ? 'PDF' : doc.type.includes('image') ? 'Image' : 'Document'}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDocumentDelete(doc.name)}
                                    className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors flex-shrink-0"
                                    title="Remove document"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Upload Area */}
                          <div className="relative mt-3">
                            <input
                              type="file"
                              id="doc-upload"
                              className="hidden"
                              multiple
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleDocumentsChange(e.target.files)}
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
                          </div>
                          
                          {/* File count indicator */}
                          {fieldErrors.documents && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.documents}</p>
                          )}
                          {formData.documents && formData.documents.length > 0 && (
                            <div className="mt-2 text-sm text-slate-600">
                              {formData.documents.length} file(s) uploaded
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="text-sm font-semibold text-slate-600 block mb-1">Profile Picture</label>
                          
                          {/* Profile Picture Preview */}
                          {profilePicturePreview ? (
                            <div className="relative">
                              <div className="mt-2 relative">
                                <img
                                  src={profilePicturePreview}
                                  alt="Profile preview"
                                  className="w-32 h-32 object-cover rounded-xl border-2 border-indigo-200 shadow-md"
                                />
                                <button
                                  type="button"
                                  onClick={handleProfilePictureDelete}
                                  className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                                  title="Remove profile picture"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-600" />
                                <span className="text-sm text-indigo-900 font-medium">
                                  {formData.profile_picture?.name || 'Profile picture selected'}
                                </span>
                              </div>
                              {/* Re-upload button */}
                              <div className="mt-3">
                                <input
                                  type="file"
                                  id="profile-reupload"
                                  className="hidden"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file) handleProfilePictureChange(file);
                                  }}
                                />
                                <label
                                  htmlFor="profile-reupload"
                                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors cursor-pointer text-sm font-medium"
                                >
                                  <Upload className="w-4 h-4" />
                                  Change Photo
                                </label>
                              </div>
                            </div>
                          ) : (
                            /* Upload Area */
                            <div className="relative">
                              <input
                                type="file"
                                id="profile-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  if (file) handleProfilePictureChange(file);
                                }}
                              />
                              <label
                                htmlFor="profile-upload"
                                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                              >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <Upload className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                                  <p className="text-sm text-slate-500 font-medium">Click to upload profile picture</p>
                                  <p className="text-xs text-slate-400 mt-1">JPG, PNG (Max 2MB)</p>
                                </div>
                              </label>
                            </div>
                          )}
                          {fieldErrors.profile_picture && (
                            <p className="text-xs text-red-500 mt-1">{fieldErrors.profile_picture}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 5: Confirmation */}
                  {currentStep === 5 && (
                    <motion.div
                      key="step5"
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
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900">{formData.full_name || "Not provided"}</h3>
                            <p className="text-sm text-slate-500">{formData.email} • {formData.mobile_number}</p>
                            {formData.gender && (
                              <p className="text-xs text-slate-400 mt-1">Gender: {formData.gender.charAt(0) + formData.gender.slice(1).toLowerCase()}</p>
                            )}
                            {formData.date_of_birth && (
                              <p className="text-xs text-slate-400 mt-1">Date of Birth: {formData.date_of_birth}</p>
                            )}
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full" />
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900">{formData.location || "Location"}</h3>
                            <p className="text-sm text-slate-500">{formData.home_address || "No address provided"}</p>
                            {formData.willing_to_live_in && (
                              <p className="text-xs text-emerald-600 mt-1">✓ Willing to live in with client</p>
                            )}
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full" />
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <Briefcase className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900">
                              {formData.applied_roles && formData.applied_roles.length > 0 
                                ? formData.applied_roles.join(', ') 
                                : "No Roles Selected"}
                            </h3>
                            <p className="text-sm text-slate-500 line-clamp-2">{formData.qualifications || "No qualifications provided"}</p>
                          </div>
                        </div>
                        <div className="h-px bg-slate-200 w-full" />
                        <div className="flex gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-slate-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-slate-900">Documents</h3>
                            <p className="text-sm text-slate-500">
                              {formData.documents && formData.documents.length > 0 
                                ? `${formData.documents.length} document(s) uploaded` 
                                : "No documents uploaded"}
                            </p>
                            {formData.profile_picture && (
                              <p className="text-xs text-emerald-600 mt-1">✓ Profile picture uploaded</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Missing Fields Warning */}
                      {!isFormValid() && (
                        <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100 mt-4">
                          <span className="text-amber-600">⚠️</span>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-amber-900 mb-2">
                              Required fields missing
                            </p>
                            <p className="text-sm text-amber-700 mb-2">
                              The following fields are required to submit your application:
                            </p>
                            <ul className="text-xs text-amber-600 space-y-1">
                              {!formData.full_name && <li>• Full Name</li>}
                              {!formData.mobile_number && <li>• Mobile Number</li>}
                              {!formData.nic_number && <li>• NIC Number</li>}
                              {!formData.nic_front && <li>• NIC Front Photo</li>}
                              {!formData.nic_back && <li>• NIC Back Photo</li>}
                              {(!formData.applied_roles || formData.applied_roles.length === 0) && <li>• Applied Roles</li>}
                              {!formData.qualifications && <li>• Qualifications</li>}
                              {!formData.home_address && <li>• Home Address</li>}
                              {!formData.location && <li>• Location</li>}
                              {!formData.gender && <li>• Gender</li>}
                              {!formData.date_of_birth && <li>• Date of Birth</li>}
                              {(!formData.documents || formData.documents.length === 0) && <li>• Documents</li>}
                              {!formData.profile_picture && <li>• Profile Picture</li>}
                            </ul>
                            <p className="text-xs text-amber-600 mt-2">
                              Please go back and complete these fields to submit your application.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Error Display */}
                      {submitError && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100 mt-4">
                          <span className="text-red-600">⚠️</span>
                          <p className="text-sm text-red-900">
                            {submitError}
                          </p>
                        </div>
                      )}

                      {/* Terms and Conditions */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800 mb-1">Terms & Conditions</p>
                            <p className="text-xs text-slate-500 mb-2">
                              By submitting this application, you agree to VCare's terms of service and privacy policy.
                            </p>
                            <a
                              href="https://res.cloudinary.com/dohaktkth/image/upload/v1780652809/INDEPENDENT_CONTRACTOR_AGREEMENT_knloa6.pdf"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Read full Terms &amp; Conditions (PDF)
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Confirmation Checkbox */}
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors">
                          <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={(e) => setIsConfirmed(e.target.checked)}
                            className="w-5 h-5 text-amber-600 bg-amber-50 border-amber-300 rounded focus:ring-amber-500 mt-0.5 flex-shrink-0"
                          />
                          <div className="text-sm">
                            <p className="font-semibold text-amber-900">
                              I confirm that all the information provided above is accurate and complete, and I have read and agree to the{' '}
                              <a
                                href="https://res.cloudinary.com/dohaktkth/image/upload/v1780652809/INDEPENDENT_CONTRACTOR_AGREEMENT_knloa6.pdf"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Terms &amp; Conditions
                              </a>.
                            </p>
                            <p className="text-amber-700 mt-1">
                              I understand that VCare will contact me within 24 hours regarding my application.
                            </p>
                          </div>
                        </label>

                        {!isConfirmed && (
                          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <p className="text-xs text-blue-700">
                              Please review your details carefully and check the confirmation box to enable submission.
                            </p>
                          </div>
                        )}
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

                {currentStep < 5 ? (
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
                    disabled={isSubmitting || !isConfirmed || !isFormValid()}
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Application'} <CheckCircle className="w-5 h-5" />
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

