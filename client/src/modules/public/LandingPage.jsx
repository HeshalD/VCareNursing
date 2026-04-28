import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart, Baby, Home, ArrowRight, ShieldCheck,
  Activity, Star, Globe, Clock, CheckCircle2,
  Stethoscope, Smile, TrendingUp, ChevronRight, DollarSign
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import ReviewSection from './components/ReviewSection';

// Reusing the background image from Login for consistency, but using it differently
import heroBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import elderyCareImg from '../../assets/images/eldery_care.webp';
import babyCareImg from '../../assets/images/baby_care.webp';
import homeNursingImg from '../../assets/images/home_nursing.webp';
import logoUrl from '../../assets/Logo/VCareLogo.png';
import patternBg from '../../assets/images/abstract-seamless-geometric-shape-lines-pattern-design-background_84443-23990.png';

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      {/* Background Image with Overlays */}
      <div className="absolute inset-0 z-0">
        <img src={heroBg} alt="Background" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent md:hidden" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="max-w-2xl mt-24 md:mt-32">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[80px] font-bold tracking-tight text-white mb-6 leading-[1.1]">
            Care made <br className="hidden sm:block" />
            simple, trusted, <br className="hidden sm:block" />
            and local
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-white/90 mb-8 leading-relaxed max-w-lg font-medium">
            Manage childcare, elderly care, and housekeeping services in one powerful platform. Streamline operations, track staff, and deliver better care effortlessly
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button className="w-full sm:w-auto px-6 py-3.5 bg-blue-500 text-white rounded-lg font-semibold text-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
              Find care now <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/services/join-team')}
              className="w-full sm:w-auto px-6 py-3.5 bg-[#E2E6EA] text-slate-800 rounded-lg font-semibold text-lg hover:bg-slate-300 transition-colors flex items-center justify-center"
            >
              Join as staff
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const ServiceGrid = () => {
  const services = [
    { title: 'Elderly Care', img: elderyCareImg, link: '/services/elderly-care' },
    { title: 'Child Care', img: babyCareImg, link: '/services/child-care' },
    { title: 'Home nursing', img: homeNursingImg, link: '/services/home-nursing' },

  ];

  return (
    <section id="services" className="py-24 bg-[#F7F3EF] relative">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold text-center text-slate-900 mb-12">
          Specialized care solutions for every need
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {services.map((service, index) => (
            <Link key={index} to={service.link} className="block group">
              <div className="bg-white rounded-[24px] p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow h-full flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-8">
                  <span className="text-slate-800 font-medium text-lg">{service.title}</span>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-800 transition-colors" />
                </div>
                <div className="w-full mt-auto flex justify-center pb-2">
                  <img src={service.img} alt={service.title} className="h-[200px] w-auto object-contain" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}



const JoinTeamBanner = () => {
  return (
    <section className="py-20 bg-[#F8F9FA]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl md:text-4xl font-semibold text-center text-slate-900 mb-10">
          Join Our Team
        </h2>

        <div className="relative rounded-[24px] overflow-hidden bg-[#F3F4F6] border border-slate-200 shadow-sm p-8 md:p-14">
          {/* Subtle line pattern background */}
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage: `url(${patternBg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          ></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="max-w-xl">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-5">
                Join Our Team
              </h3>
              <p className="text-slate-700 text-sm md:text-[15px] font-medium leading-relaxed mb-8 max-w-lg">
                Are you a skilled nurse, nanny, or caregiver? Connect with families
                who need your expertise. High pay, flexible hours, and total respect.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <button className="px-6 py-3.5 bg-blue-500 text-white rounded-lg font-semibold text-[15px] hover:bg-blue-600 transition-colors flex items-center justify-center gap-2">
                  Join now <ArrowRight className="w-4 h-4" />
                </button>
                <div className="px-6 py-3.5 bg-white text-slate-600 rounded-lg font-semibold text-[15px] flex items-center justify-center shadow-sm">
                  100+ Vacancies
                </div>
              </div>
            </div>

            <div className="hidden md:block w-[220px] shrink-0">
              <img src={logoUrl} alt="VCare Nursing" className="w-full h-auto object-contain drop-shadow-sm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


const BrowseStaffSection = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('All');
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filters = ['All', 'Baby care', 'Elderly care', 'Home Nursing'];
  const avatarColors = ['bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800', 'bg-amber-100 text-amber-800'];

  // Fetch staff data with ratings
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        setLoading(true);

        // Fetch staff profiles
        console.log('Fetching staff from:', '/api/staff/top-rated');
        const staffResponse = await fetch('/api/staff/top-rated');
        
        console.log('Response status:', staffResponse.status, staffResponse.statusText);
        console.log('Response headers:', Object.fromEntries(staffResponse.headers.entries()));
        
        if (!staffResponse.ok) {
          const errorText = await staffResponse.text();
          console.error('Error response body:', errorText.substring(0, 500));
          throw new Error(`HTTP ${staffResponse.status}: ${staffResponse.statusText}`);
        }
        
        // Check if response is JSON before parsing
        const contentType = staffResponse.headers.get('content-type');
        console.log('Content-Type:', contentType);
        
        if (!contentType || !contentType.includes('application/json')) {
          const text = await staffResponse.text();
          console.error('Non-JSON response (first 500 chars):', text.substring(0, 500));
          console.error('Full response URL:', staffResponse.url);
          
          // Check if it's an HTML error page
          if (text.includes('<!doctype') || text.includes('<html')) {
            console.error('API returned HTML error page - check backend deployment');
            setStaff([]); // Set empty array to prevent crashes
            setError('Service temporarily unavailable');
            return;
          }
          
          throw new Error('API returned non-JSON response');
        }
        
        const staffData = await staffResponse.json();
        console.log('Parsed JSON response:', staffData);

        // Validate response structure
        if (!staffData.data || !Array.isArray(staffData.data)) {
          console.error('Invalid API response structure:', staffData);
          throw new Error('Invalid API response structure');
        }

        // Sort by average rating and limit to top 8 for landing page
        const topRatedStaff = staffData.data
          .sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0))
          .slice(0, 8);

        setStaff(topRatedStaff);
      } catch (err) {
        console.error('Error fetching staff:', err);
        setError('Failed to load staff profiles');
      } finally {
        setLoading(false);
      }
    };

    fetchStaff();
  }, []);

  const filtered = activeFilter === 'All' ? staff : staff.filter(s => {
    // Map filter options to specific role types
    const roleMap = {
      'Baby care': ['NANNY'],
      'Elderly care': ['CAREGIVER'],
      'Home Nursing': ['NURSE']
    };

    const targetRole = roleMap[activeFilter];

    // Check if role array contains the target role
    const roleMatch = s.role && Array.isArray(s.role)
      ? s.role.includes(targetRole)
      : s.role === targetRole;

    return roleMatch;
  });

  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex justify-between items-end mb-12 flex-wrap gap-4">
          <div>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Meet our staff.
            </h2>
            <p className="text-slate-600 text-lg">
              Vetted professionals ready to be deployed today.
            </p>
          </div>
          <button
            onClick={() => navigate('/services/view-staff')}
            className="px-6 py-3 border border-slate-300 bg-white rounded-full text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            View all staff <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-3 flex-wrap mb-8">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${activeFilter === f
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Staff Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-[24px] p-6 flex flex-col gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-slate-200"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded mb-2 w-3/4"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <div className="h-6 bg-slate-200 rounded-md px-3 py-1 w-20"></div>
                  <div className="h-6 bg-slate-200 rounded-md px-3 py-1 w-24"></div>
                </div>
                <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-auto">
                  <div className="h-4 bg-slate-200 rounded w-16"></div>
                  <div className="h-6 bg-slate-200 rounded-full px-3 py-1.5 w-20"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-slate-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600">No staff found for this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filtered.map((member, i) => (
              <div
                key={member.staff_profile_id}
                className="bg-white border border-slate-200 rounded-[24px] p-6 flex flex-col gap-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {member.profile_picture_url ? (
                    <img
                      src={member.profile_picture_url}
                      alt={member.full_name}
                      className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarColors[i % avatarColors.length]}`}>
                      {member.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'ST'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm truncate">{member.full_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-500 truncate">{member.designation || member.role || 'Staff Member'}</p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <span className={`text-xs px-3 py-1 rounded-md font-medium ${member.current_status === 'available'
                    ? 'bg-green-100 text-green-800'
                    : member.current_status === 'on_shift'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-800'
                    }`}>
                    {member.current_status?.replace('_', ' ') || 'Unknown'}
                  </span>
                  {member.specialization && (
                    <span className="text-xs px-3 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">
                      {member.specialization}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-auto">
                  <span className="text-sm text-slate-500">
                    {member.average_rating > 0 ? (
                      <>
                        ★ <span className="text-slate-800 font-semibold">{member.average_rating.toFixed(1)}</span>
                        <span className="text-xs ml-1">({member.total_reviews} reviews)</span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">No ratings yet</span>
                    )}
                  </span>
                  <button
                    onClick={() => navigate(`services/staff-profile/${member.staff_profile_id}`)}
                    className="text-xs text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-50 transition-colors"
                  >
                    View profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA Strip */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-5 bg-white border border-slate-200 rounded-[20px] p-4">
          <p className="text-slate-600 text-base">
            Browse <span className="font-semibold text-slate-900">200+ verified caregivers</span> and book instantly.
          </p>
          <button
            onClick={() => navigate('/services/view-staff')}
            className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-[10px] font-bold text-base hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            Browse all staff <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};



const LandingPage = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100">
      <Navbar />
      <HeroSection />
      <ServiceGrid />
      <BrowseStaffSection />
      <JoinTeamBanner />
      <ReviewSection />
      <Footer />
    </div>
  );
};

export default LandingPage;
