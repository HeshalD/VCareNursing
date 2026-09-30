import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Baby, Heart, Clock, CheckCircle, ShieldCheck,
  ArrowRight, Smile, Star, Coffee, Home, Loader2
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Using requested image for child care
import babyImage from '../../assets/images/baby_care.webp';
import FeaturedCaregivers from './components/FeaturedCaregivers';
import apiClient from '../../api/api';
import { toCaregiverCard } from './components/caregiverCard';

const ChildCarePage = () => {
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchStaffData();
  }, []);

  const fetchStaffData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch NANNY staff
      const nanniesResponse = await apiClient.getStaffByRole('NANNY', { status: 'AVAILABLE', limit: 20 });
      const nannies = nanniesResponse.data || [];

      // Transform API data to match expected format (real data only)
      const transformedStaff = nannies.map(staff => toCaregiverCard(staff, 'Nanny', 'NANNY'));

      setStaffData(transformedStaff);
      setAvailableCount(nanniesResponse.pagination?.total_count || 0);
    } catch (err) {
      console.error('Error fetching staff data:', err);
      setError('Failed to load staff data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-rose-100 selection:text-rose-900">
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
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Nanny • Newborn • Toddler
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Love & Care <br />
                  <span className="text-rose-500">
                    for Little Ones.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Trusted nannies and experienced maternity nurses to support your parenting journey. Background verified, kind, and professional.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/services/child-care/book" className="px-8 py-4 bg-rose-500 text-white rounded-full font-bold text-lg hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2">
                    Find a Nanny <ArrowRight className="w-5 h-5" />
                  </Link>

                  {availableCount > 0 && (
                    <div className="flex items-center gap-3 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                      <span className="text-lg font-bold text-slate-900">{availableCount}</span>
                      <span className="text-sm font-medium text-slate-600">Available Nannies</span>
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

      {/* Standards Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20">
            <div className="lg:sticky lg:top-32 h-fit mb-12 lg:mb-0">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                More than a Sitting. <br />
                <span className="text-rose-500">It's Development.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                Our care providers aren't just watchers; they engage, play, and nurture.
                From newborn specialists to active toddler playmates, we find the perfect match for your family's vibe.
              </p>
              <div className="p-8 bg-rose-50 border border-rose-100 rounded-3xl">
                <div className="flex items-center gap-4 mb-4">
                  <ShieldCheck className="w-8 h-8 text-rose-500" />
                  <span className="text-lg font-bold text-rose-900">The VCare Trust Seal</span>
                </div>
                <p className="text-rose-800/80">
                  Detailed background checks, police verification, and reference calls. We deny 95% of applicants so you get the top 5%.
                </p>
              </div>
            </div>

            <div className="space-y-12">
              {[
                {
                  icon: Baby,
                  title: "Newborn Care Specialists",
                  desc: "Night nurses and doulas to help you sleep while baby is safe. Experts in feeding, swaddling, and sleep training."
                },
                {
                  icon: Smile,
                  title: "Engaging Toddler Care",
                  desc: "Nannies who put down the phone and pick up the toys. Focused on developmental milestones and creative play."
                },
                {
                  icon: Clock,
                  title: "Flexible Scheduling",
                  desc: "Need a date night sitter? Or a full-time 9-5 nanny? We handle the scheduling and replacements seamlessly."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="flex-shrink-0 w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-rose-50 group-hover:border-rose-100 transition-colors">
                    <item.icon className="w-10 h-10 text-slate-400 group-hover:text-rose-500 transition-colors" />
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
          <div className="flex flex-col items-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 text-center">
              Trusted by Sri Lankan Families
            </h2>
            <p className="text-slate-600 text-lg mb-8 text-center max-w-3xl">
              Meet our highest-rated nanny professionals.
            </p>
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

          {/* Staff Data */}
          {!loading && !error && (
            <FeaturedCaregivers
              workers={staffData}
              colorTheme="rose"
            />
          )}
        </div>
      </section>

      {/* Pricing Section */}


      <Footer />
    </div >
  );
};

export default ChildCarePage;
