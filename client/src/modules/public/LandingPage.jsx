import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Heart, Baby, Home, ArrowRight, ShieldCheck,
  Activity, Star, Globe, Clock, CheckCircle2,
  Stethoscope, Smile, TrendingUp, ChevronRight
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Reusing the background image from Login for consistency, but using it differently
import heroBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';
import babyCareBg from '../../assets/images/baby_caretakers_image_landingpage.webp';
import homeCareBg from '../../assets/images/home_care_takers_img_landingpage.avif';

const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-slate-50">
      {/* Abstract Background Shapes */}
      <div className="absolute inset-0 z-0">
        {/* Mobile Background Image */}
        <div className="absolute inset-0 md:hidden z-0 opacity-20">
          <img src={heroBg} alt="Background" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-slate-50/80 to-transparent" />
        </div>

        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-400/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-400/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full pt-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="max-w-2xl">
            

            <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-tighter text-slate-900 mb-8 leading-[1.0] md:leading-[0.9]">
              Healing. <br />
              <span className="text-blue-600">
                Humanized.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed max-w-lg">
              Modern healthcare requires more than just treatment; it requires efficiency. Our solution helps facilities reduce administrative overhead by up to 15%, allowing for smarter resource deployment and faster patient throughput.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <button className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-full font-bold text-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
                Find Care Now <ArrowRight className="w-5 h-5" />
              </button>
              <button className="w-full sm:w-auto px-8 py-4 border border-slate-300 text-slate-700 bg-white rounded-full font-bold text-lg hover:bg-slate-50 transition-colors">
                Join as Staff
              </button>
            </div>
          </div>

          {/* Visual Element - Right Side */}
          <div className="relative hidden lg:block h-[600px] w-full">
            {/* Main Image Card */}
            <motion.div
              initial={{ opacity: 0, y: 50, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: -2 }}
              transition={{ duration: 0.8 }}
              className="absolute top-10 right-10 w-4/5 h-4/5 rounded-[40px] overflow-hidden border-4 border-white shadow-2xl z-10"
            >
              <img src={heroBg} alt="Medical Professional" className="w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a]/90 to-transparent" />
              <div className="absolute bottom-8 left-8 right-8">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden">
                    <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Avatar" />
                  </div>
                  <div>
                    <div className="text-white font-bold">Sarah Jenkins</div>
                    <div className="text-blue-400 text-xs font-bold uppercase">Senior Nurse • ICU Specialist</div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-xs font-bold border border-green-500/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" /> ON DUTY - 24H SHIFT
                </div>
                <div className="absolute bottom-6 right-6 px-4 py-2 bg-green-500/20 text-green-400 text-sm font-bold rounded-lg border border-green-500/30">
                  Wallet: LKR 14,250
                </div>
              </div>
            </motion.div>

            {/* Floating Widget 1 */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="absolute bottom-20 left-0 bg-white/90 backdrop-blur-xl border border-slate-200 p-6 rounded-3xl shadow-xl z-20 w-64"
            >
              <div className="flex justify-between items-start mb-4">
                <Activity className="text-pink-500 w-6 h-6" />
                <span className="text-xs font-mono text-slate-500">LIVE FEED</span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">142</div>
              <div className="text-sm text-slate-500">Active Shifts filled in last hour</div>
            </motion.div>

            {/* Floating Widget 2 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="absolute top-0 right-0 bg-blue-600 text-white p-6 rounded-[30px] shadow-xl z-20 w-48 text-center"
            >
              <div className="text-4xl font-bold mb-1">4.9</div>
              <div className="flex justify-center gap-1 mb-2">
                {[1, 2, 3, 4, 5].map(i => <Star key={i} className="w-3 h-3 fill-white text-white" />)}
              </div>
              <div className="text-xs opacity-80">Trust Score</div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

const ServiceGrid = () => {
  return (
    <section id="services" className="py-24 bg-white relative">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Three Doors.<br />Infinite Care.</h2>
          <p className="text-slate-600 max-w-xl text-lg">
            We've simplified the complexity of healthcare staffing into three distinct verticals. Choose your path.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[600px]">
          {/* Large Card - Hospital */}
          <div className="md:col-span-8 min-h-[400px] group relative rounded-[40px] overflow-hidden bg-slate-100 border-4 border-white shadow-xl hover:border-blue-50 transition-colors cursor-pointer">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')] bg-cover bg-center opacity-90 group-hover:scale-105 transition-transform duration-700" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-10">
              <div className="w-16 h-16 rounded-2xl bg-rose-500 hidden md:flex items-center justify-center mb-6 text-white shadow-lg shadow-rose-500/20">
                <Heart className="w-8 h-8" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2">Hospital Caretakers</h3>
              <p className="text-slate-200 max-w-md mb-6">
                Enterprise-grade solution for clinics and hospitals.
                Fill nursing voids instantly with our vetted pool.
              </p>
              <span className="inline-flex items-center text-white font-bold border-b border-white pb-1">
                Access Portal <ArrowRight className="ml-2 w-4 h-4" />
              </span>
            </div>
          </div>

          {/* Right Column Stack */}
          <div className="md:col-span-4 flex flex-col gap-6">
            {/* Baby Care */}
            <div className="flex-1 group relative rounded-[40px] overflow-hidden bg-blue-50 border-4 border-white shadow-xl hover:border-blue-100 transition-all cursor-pointer">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-90 group-hover:scale-105 transition-transform duration-700"
                style={{ backgroundImage: `url(${babyCareBg})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="p-8 h-full flex flex-col justify-end relative z-10">
                <Baby className="w-10 h-10 text-blue-400 mb-4 hidden md:block" />
                <h3 className="text-2xl font-bold text-white mb-1">Baby Care</h3>
                <p className="text-sm text-slate-200">Pediatric nurses & nannies.</p>
              </div>
            </div>

            {/* Home Care */}
            {/* Home Care */}
            <Link to="/services/home-nursing" className="block flex-1">
              <div className="h-full group relative rounded-[40px] overflow-hidden bg-emerald-50 border-4 border-white shadow-xl hover:border-emerald-100 transition-all cursor-pointer">
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-90 group-hover:scale-105 transition-transform duration-700"
                  style={{ backgroundImage: `url(${homeCareBg})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="p-8 h-full flex flex-col justify-end relative z-10">
                  <Home className="w-10 h-10 text-emerald-400 mb-4 hidden md:block" />
                  <h3 className="text-2xl font-bold text-white mb-1">Home Nursing</h3>
                  <p className="text-sm text-slate-400">Elderly care & post-op recovery.</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const Marquee = () => {
  return (
    <div className="bg-blue-600 py-4 overflow-hidden flex relative z-20">
      {/* 
        We use two identical sets of content side-by-side. 
        The animation moves the whole duplicate set (-50%), creating a perfect loop.
      */}
      <div className="animate-marquee whitespace-nowrap flex gap-16 items-center min-w-full">
        {/* Set 1 */}
        {[...Array(5)].map((_, i) => (
          <div key={`a-${i}`} className="flex items-center gap-16">
            <div className="flex items-center gap-4 opacity-100">
              <span className="text-white font-bold text-lg tracking-wider">BOOK NOW</span>
              <Star className="w-5 h-5 text-white fill-white" />
              <span className="text-blue-100 font-medium">CHILD CARE</span>
              <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50" />
              <span className="text-blue-100 font-medium">HOME NURSING</span>
              <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50" />
              <span className="text-blue-100 font-medium">ELDER CARE</span>
            </div>
          </div>
        ))}
        {/* Set 2 (Duplicate for Loop) */}
        {[...Array(5)].map((_, i) => (
          <div key={`b-${i}`} className="flex items-center gap-16">
            <div className="flex items-center gap-4 opacity-100">
              <span className="text-white font-bold text-lg tracking-wider">BOOK NOW</span>
              <Star className="w-5 h-5 text-white fill-white" />
              <span className="text-blue-100 font-medium">CHILD CARE</span>
              <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50" />
              <span className="text-blue-100 font-medium">HOME NURSING</span>
              <div className="w-1.5 h-1.5 bg-white rounded-full opacity-50" />
              <span className="text-blue-100 font-medium">ELDER CARE</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};



const LandingPage = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100">
      <Navbar />
      <HeroSection />
      <Marquee />
      <ServiceGrid />

      <Footer />
    </div>
  );
};

export default LandingPage;
