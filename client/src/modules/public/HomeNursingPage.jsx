import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Home, Clock, Calendar, CheckCircle, ShieldCheck,
  ArrowRight, Heart, UserCheck, Star, Activity,
  Stethoscope, MapPin, Pill, Loader2
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import homeCareBg from '../../assets/images/home_nursing.webp';
import FeaturedCaregivers from './components/FeaturedCaregivers';
import apiClient from '../../api/api';

// Custom "Not AI Generated" UI Components
const ProcessStep = ({ number, title, desc }) => (
  <div className="flex gap-6 group">
    <div className="flex-shrink-0 w-12 h-12 rounded-full border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono text-lg font-bold group-hover:bg-emerald-500 group-hover:text-[#0b1120] transition-colors">
      {number}
    </div>
    <div>
      <h4 className="text-xl font-bold text-white mb-2">{title}</h4>
      <p className="text-slate-400">{desc}</p>
    </div>
  </div>
)

const HomeNursingPage = () => {
  const targetRef = useRef(null);
  const [staffData, setStaffData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0, 1, 1, 0]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchWillingStaff();
  }, []);

  const fetchWillingStaff = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both NURSE and CARETAKER staff who are willing to live in
      const [nursesResponse, caretakersResponse] = await Promise.all([
        apiClient.getStaffWillingToLiveIn({ role: 'NURSE', status: 'AVAILABLE', limit: 10 }),
        apiClient.getStaffWillingToLiveIn({ role: 'CARETAKER', status: 'AVAILABLE', limit: 10 })
      ]);

      const nurses = nursesResponse.data || [];
      const caretakers = caretakersResponse.data || [];

      // Transform API data to match expected format
      const transformedStaff = [...nurses, ...caretakers].map(staff => {
        // Calculate age from date_of_birth if available
        let calculatedAge = 30; // Default fallback age
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
          role: staff.role.includes('NURSE') ? 'Nurse' : 'Caretaker',
          experience: `${Math.floor(Math.random() * 20) + 5} Years`, // Placeholder
          location: staff.home_address || 'Sri Lanka',
          rating: (Math.random() * 1.5 + 3.5).toFixed(1), // Random rating 3.5-5.0
          reviews: Math.floor(Math.random() * 150) + 10, // Random reviews
          isVerified: staff.verification_status === 'VERIFIED',
          price: `LKR ${Math.floor(Math.random() * 50000) + 30000}/mo`, // Placeholder pricing
          image: staff.profile_picture_url || `https://i.pravatar.cc/300?u=${staff.staff_profile_id}`,
          badges: Array.isArray(staff.qualifications) && staff.qualifications.length > 0
            ? staff.qualifications.slice(0, 2)
            : ['Experienced'],
          staffType: staff.role.includes('NURSE') ? 'NURSE' : 'CARETAKER'
        };
      });

      setStaffData(transformedStaff);
    } catch (err) {
      console.error('Error fetching staff data:', err);
      setError('Failed to load staff data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
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
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  ICU • Post-Surgery • Vitals
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Healing <br />
                  <span className="text-emerald-500">
                    at Home.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Hospital-grade care doesn't need a hospital bed. We bring the ICU to your living room with certified professionals and live monitoring.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/services/home-nursing/book" className="px-8 py-4 bg-emerald-500 text-white rounded-full font-bold text-lg hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                    Request Care <ArrowRight className="w-5 h-5" />
                  </Link>

                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <div className="flex -space-x-3">
                      <img src="https://i.pravatar.cc/100?u=12" alt="Nurse" className="w-8 h-8 rounded-full border-2 border-white" />
                      <img src="https://i.pravatar.cc/100?u=13" alt="Nurse" className="w-8 h-8 rounded-full border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                        +400
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">Active Nurses</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Hero Image / Visual */}
            <div className="order-1 lg:order-2 relative flex justify-center lg:justify-end">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                className="relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5] object-cover w-full max-w-md lg:max-w-full lg:h-[80vh] lg:w-auto"
              >
                <img
                  src={homeCareBg}
                  alt="Home Nursing"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-500">
                      <Activity className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Live Monitored</div>
                      <div className="text-xs text-slate-500">24/7 Command Center</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />)}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Scroll Section - "The VCare Standard" */}
      <section className="py-32 bg-white relative">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-24">
            <div className="sticky top-32 h-fit">
              <h2 className="text-5xl font-bold mb-6 text-slate-900">Not an Agency. <br />A Medical Partner.</h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                Most agencies just send a person. We send a managed care protocol.
                Every nurse is connected to our Command OS, ensuring vitals are recorded,
                medicines are tracked, and doctors are kept in the loop.
              </p>

            </div>

            <div className="space-y-32 pt-12">
              <div className="group">
                <div className="h-64 bg-slate-50 rounded-2xl mb-6 flex items-center justify-center border border-slate-200 group-hover:border-emerald-500/30 transition-colors">
                  <Stethoscope className="w-24 h-24 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-2">Clinical Expertise</h3>
                <p className="text-slate-600 text-lg">ICU trained staff capable of handling ventilators, tracheostomy, and post-stroke recovery.</p>
              </div>

              <div className="group">
                <div className="h-64 bg-slate-50 rounded-2xl mb-6 flex items-center justify-center border border-slate-200 group-hover:border-emerald-500/30 transition-colors">
                  <ShieldCheck className="w-24 h-24 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h3 className="text-3xl font-bold text-slate-900 mb-2">Background Verified</h3>
                <p className="text-slate-600 text-lg">Police verification, aadhaar validation, and previous employer checks are mandatory.</p>
              </div>


            </div>
          </div>
        </div>
      </section>

      {/* How it works - Horizontal Steps */}


      {/* Featured Staff Section - Willing to Live In */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 text-center">
              Available for Live-In Care
            </h2>
            <p className="text-slate-600 text-lg mb-8 text-center max-w-3xl">
              Professional nurses and caretakers ready to provide full-time home care services.
            </p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
              <p className="text-slate-600">Loading available staff...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-16">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={fetchWillingStaff}
                className="px-6 py-2 bg-emerald-500 text-white rounded-full font-medium hover:bg-emerald-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Staff Data */}
          {!loading && !error && (
            <FeaturedCaregivers
              workers={staffData}
              colorTheme="emerald"
            />
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomeNursingPage;
