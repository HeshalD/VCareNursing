import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Heart, Calendar, CheckCircle, ShieldCheck,
  ArrowRight, UserCheck, Sun, Armchair, HandHeart, Phone, Filter, Loader2, Star
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Using the exact illustration for Elderly Care
import elderyCareImg from '../../assets/images/eldery_care.webp';
import FeaturedCaregivers from './components/FeaturedCaregivers';
import apiClient from '../../api/api';
import { toCaregiverCard } from './components/caregiverCard';

const PatientCarePage = () => {
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [filteredStaff, setFilteredStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('ALL');

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchStaffData();
  }, []);

  useEffect(() => {
    filterStaff();
  }, [staffData, activeFilter]);

  const fetchStaffData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both NURSE and CARETAKER staff
      const [nursesResponse, caretakersResponse] = await Promise.all([
        apiClient.getStaffByRole('NURSE', { status: 'AVAILABLE', limit: 20, public_only: true }),
        apiClient.getStaffByRole('CARETAKER', { status: 'AVAILABLE', limit: 20, public_only: true })
      ]);

      const nurses = nursesResponse.data || [];
      const caretakers = caretakersResponse.data || [];

      // Transform API data to match expected format (real data only)
      const transformedStaff = [...nurses, ...caretakers].map(staff => {
        const isNurse = staff.role.includes('NURSE');
        return toCaregiverCard(staff, isNurse ? 'Nurse' : 'Caretaker', isNurse ? 'NURSE' : 'CARETAKER');
      });

      setStaffData(transformedStaff);
      setAvailableCount((nursesResponse.pagination?.total_count || 0) + (caretakersResponse.pagination?.total_count || 0));
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
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-violet-100 selection:text-violet-900">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-24 pb-12 lg:pt-32 lg:pb-20 overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">

            {/* Text Content */}
            <div className="order-2 lg:order-1 relative z-20">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                  Rehabilitation • Mobility • Support
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Dedicated <br />
                  <span className="text-violet-600">
                    Patient Care.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Trained care attendants assisting bedridden or recovering patients with daily hygiene, feeding, mobility, and continuous monitoring.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/services/patient-care/book" className="px-8 py-4 bg-violet-600 text-white rounded-full font-bold text-lg hover:bg-violet-700 transition-all shadow-lg shadow-violet-500/20 flex items-center justify-center gap-2">
                    Request Care <ArrowRight className="w-5 h-5" />
                  </Link>
                  
                  {availableCount > 0 && (
                    <div className="flex items-center gap-3 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                      <span className="text-lg font-bold text-slate-900">{availableCount}</span>
                      <span className="text-sm font-medium text-slate-600">Available Caretakers</span>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />)}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20">
            <div className="lg:sticky lg:top-32 h-fit mb-12 lg:mb-0">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                Care For Every Stage. <br />
                <span className="text-violet-600">Every Condition.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                Whether a patient needs light daily help or intensive support through a severe condition, we match the right professional and adjust the level of care as needs change.
              </p>
              <div className="p-8 bg-violet-50 border border-violet-100 rounded-3xl">
                <div className="flex items-center gap-4 mb-4">
                  <HandHeart className="w-8 h-8 text-violet-600" />
                  <span className="text-lg font-bold text-violet-900">Care That Adapts</span>
                </div>
                <p className="text-violet-800/80">
                  Our team is trained to support patients across the full range, from the lowest-need conditions to the most severe states.
                </p>
              </div>
            </div>

            <div className="space-y-12">
              {[
                {
                  icon: Armchair,
                  title: "Everyday Support",
                  desc: "Help with meals, mobility, hygiene and medication reminders for patients with mild or stable conditions."
                },
                {
                  icon: UserCheck,
                  title: "Intensive Bedside Care",
                  desc: "Round-the-clock attention for bedridden or severely ill patients, including positioning, feeding assistance and close monitoring."
                },
                {
                  icon: Phone,
                  title: "Clinical Nursing",
                  desc: "Qualified nurses for wound care, injections, vitals and health monitoring when a patient needs medical attention."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="flex-shrink-0 w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-violet-50 group-hover:border-violet-100 transition-colors">
                    <item.icon className="w-10 h-10 text-slate-400 group-hover:text-violet-600 transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">{item.title}</h3>
                    <p className="text-slate-600 text-lg leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>



      {/* Featured Caregivers Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filter Section */}
          <div className="flex flex-col items-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 text-center">
              Our Patient Care Team
            </h2>
            <p className="text-slate-600 text-lg mb-8 text-center max-w-3xl">
              Experienced carers and nurses ready to support patients at every level of need.
            </p>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-full p-1">
              <button
                onClick={() => handleFilterChange('ALL')}
                className={`px-6 py-2 rounded-full font-medium transition-all ${activeFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                All Staff
              </button>
              <button
                onClick={() => handleFilterChange('NURSE')}
                className={`px-6 py-2 rounded-full font-medium transition-all ${activeFilter === 'NURSE'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Nurses
              </button>
              <button
                onClick={() => handleFilterChange('CARETAKER')}
                className={`px-6 py-2 rounded-full font-medium transition-all ${activeFilter === 'CARETAKER'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                Caretakers
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin mb-4" />
              <p className="text-slate-600">Loading caregivers...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-16">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchStaffData}
                className="px-6 py-2 bg-violet-600 text-white rounded-full font-medium hover:bg-violet-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Staff Data */}
          {!loading && !error && (
            <FeaturedCaregivers
              workers={filteredStaff}
              colorTheme="violet"
            />
          )}
        </div>
      </section>

      {/* Pricing Section */}


      <Footer />
    </div >
  );
};

export default PatientCarePage;
