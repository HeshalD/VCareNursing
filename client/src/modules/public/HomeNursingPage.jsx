import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Home, Clock, Calendar, CheckCircle, ShieldCheck,
  ArrowRight, Heart, UserCheck, Star, Activity,
  Stethoscope, MapPin, Pill
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import homeCareBg from '../../assets/images/home_care_takers_img_landingpage.avif';

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
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0, 1, 1, 0]);

  return (
    <div className="min-h-screen bg-[#0b1120] text-white selection:bg-emerald-500/30">
      <Navbar />

      {/* Hero Section: Editorial Style */}
      <section className="relative min-h-screen flex items-center pt-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 w-full grid lg:grid-cols-2 gap-20 items-center">
          <div className="relative z-20">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100px" }}
              transition={{ duration: 1, delay: 0.5 }}
              className="h-1 bg-emerald-500 mb-8"
            />
            <h1 className="text-6xl md:text-8xl font-bold leading-[0.9] text-white mb-8">
              Healing <br />
              <span className="text-slate-500">at Home.</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-lg font-light leading-relaxed">
              Hospital-grade care doesn't need a hospital bed.
              <span className="text-emerald-400 font-semibold block mt-4">
                We bring the ICU to your living room.
              </span>
            </p>

            <div className="flex flex-wrap gap-6">
              <button className="px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-none font-bold text-lg transition-all flex items-center gap-3">
                Requests Care <ArrowRight className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-4 px-6 py-4 border border-white/10 bg-white/5">
                <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-[#0b1120]" />
                  <div className="w-10 h-10 rounded-full bg-slate-600 border-2 border-[#0b1120]" />
                  <div className="w-10 h-10 rounded-full bg-slate-500 border-2 border-[#0b1120] flex items-center justify-center text-xs font-bold text-white">
                    +400
                  </div>
                </div>
                <span className="text-sm font-medium text-slate-400">Nurses Available Now</span>
              </div>
            </div>
          </div>

          {/* Asymmetrical Image Placement */}
          <div className="relative h-[600px] lg:h-[800px] w-full">
            <div className="absolute top-0 right-0 w-[120%] h-full bg-slate-800 rounded-l-[100px] overflow-hidden translate-x-20 z-10">
              <img
                src={homeCareBg}
                alt="Care at home"
                className="w-full h-full object-cover mix-blend-overlay opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#0b1120]/50 to-[#0b1120]" />
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Scroll Section - "The VCare Standard" */}
      <section className="py-32 bg-[#0f172a] relative border-t border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-24">
            <div className="sticky top-32 h-fit">
              <h2 className="text-5xl font-bold mb-6">Not an Agency. <br />A Medical Partner.</h2>
              <p className="text-xl text-slate-400 leading-relaxed mb-8">
                Most agencies just send a person. We send a managed care protocol.
                Every nurse is connected to our Command OS, ensuring vitals are recorded,
                medicines are tracked, and doctors are kept in the loop.
              </p>
              <div className="p-8 bg-emerald-900/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-4 mb-4">
                  <Activity className="w-8 h-8 text-emerald-400" />
                  <span className="text-lg font-bold text-white">Live Vitals Monitoring</span>
                </div>
                <p className="text-slate-400">
                  Our app tracks BP, Sugar, and SpO2 trends. If readings go abnormal,
                  our central command center is alerted instantly.
                </p>
              </div>
            </div>

            <div className="space-y-32 pt-12">
              <div className="group">
                <div className="h-64 bg-slate-800/50 rounded-2xl mb-6 flex items-center justify-center border border-white/5 group-hover:border-emerald-500/30 transition-colors">
                  <Stethoscope className="w-24 h-24 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h3 className="text-3xl font-bold text-white mb-2">Clinical Expertise</h3>
                <p className="text-slate-400 text-lg">ICU trained staff capable of handling ventilators, tracheostomy, and post-stroke recovery.</p>
              </div>

              <div className="group">
                <div className="h-64 bg-slate-800/50 rounded-2xl mb-6 flex items-center justify-center border border-white/5 group-hover:border-emerald-500/30 transition-colors">
                  <ShieldCheck className="w-24 h-24 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h3 className="text-3xl font-bold text-white mb-2">Background Verified</h3>
                <p className="text-slate-400 text-lg">Police verification, aadhaar validation, and previous employer checks are mandatory.</p>
              </div>

              <div className="group">
                <div className="h-64 bg-slate-800/50 rounded-2xl mb-6 flex items-center justify-center border border-white/5 group-hover:border-emerald-500/30 transition-colors">
                  <Clock className="w-24 h-24 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                </div>
                <h3 className="text-3xl font-bold text-white mb-2">Zero Absconding</h3>
                <p className="text-slate-400 text-lg">Our replacement guarantee ensures you are never left without care, ever.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - "The Plan" layout */}
      <section className="py-32 bg-[#0b1120]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-end mb-20 border-b border-white/10 pb-12">
            <div>
              <span className="text-emerald-500 font-mono text-sm tracking-wider uppercase">Transparent Pricing</span>
              <h2 className="text-5xl font-bold mt-2">Choose your <br />Correction Level.</h2>
            </div>
            <p className="text-slate-400 max-w-sm mt-8 md:mt-0 text-right">
              No hidden charges. No commission surprises. <br /> Pay directly through the app.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Card 1 */}
            <div className="bg-[#161f32] p-12 hover:bg-[#1c263c] transition-colors group cursor-pointer border-l-4 border-transparent hover:border-emerald-500">
              <div className="flex justify-between items-start mb-12">
                <h3 className="text-3xl font-bold">Shift Care</h3>
                <span className="px-4 py-2 bg-slate-700/50 rounded text-sm font-mono text-slate-300">12 HOURS</span>
              </div>
              <div className="mb-12">
                <div className="text-5xl font-bold text-white">LKR 3,500</div>
                <div className="text-slate-500 mt-2">per shift</div>
              </div>
              <ul className="space-y-4 mb-12 border-t border-slate-700/50 pt-8">
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle className="w-5 h-5 text-slate-500" /> Day or Night Duty</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle className="w-5 h-5 text-slate-500" /> Basic Nursing Procedures</li>
                <li className="flex items-center gap-3 text-slate-300"><CheckCircle className="w-5 h-5 text-slate-500" /> Medication Management</li>
              </ul>
              <button className="w-full py-5 border border-slate-600 text-white font-bold hover:bg-white hover:text-[#0b1120] transition-colors">
                SELECT SHIFT PLAN
              </button>
            </div>

            {/* Card 2 */}
            <div className="bg-emerald-900/10 p-12 border border-emerald-500/20 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
              <div className="absolute top-0 right-0 bg-emerald-500 text-[#0b1120] text-xs font-bold px-6 py-2">RECOMMENDED</div>
              <div className="flex justify-between items-start mb-12">
                <h3 className="text-3xl font-bold text-white">Live-in Care</h3>
                <span className="px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded text-sm font-mono">24 HOURS</span>
              </div>
              <div className="mb-12">
                <div className="text-5xl font-bold text-white">LKR 7,500</div>
                <div className="text-emerald-500/50 mt-2">per day</div>
              </div>
              <ul className="space-y-4 mb-12 border-t border-emerald-500/20 pt-8">
                <li className="flex items-center gap-3 text-white"><CheckCircle className="w-5 h-5 text-emerald-500" /> 24/7 Resident Nurse</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle className="w-5 h-5 text-emerald-500" /> Complex ICU-level capability</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle className="w-5 h-5 text-emerald-500" /> Emergency Response Ready</li>
                <li className="flex items-center gap-3 text-white"><CheckCircle className="w-5 h-5 text-emerald-500" /> Free Replacement Guarantee</li>
              </ul>
              <button className="w-full py-5 bg-emerald-500 text-[#0b1120] font-bold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20">
                START LIVE-IN CARE
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* How it works - Horizontal Steps */}
      <section className="py-32 bg-[#0f172a] border-t border-white/5">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold mb-16 text-center">Deployment Protocol</h2>
          <div className="grid md:grid-cols-3 gap-12 relative">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-6 left-16 right-16 h-0.5 bg-slate-800 -z-10" />

            <div className="bg-[#0b1120] p-8 border border-white/5 z-10">
              <div className="text-6xl font-black text-slate-800 mb-6 font-mono">01</div>
              <h3 className="text-xl font-bold text-white mb-4">Assessment</h3>
              <p className="text-slate-400">Our senior nurse visits your home to assess the patient's condition and environment.</p>
            </div>

            <div className="bg-[#0b1120] p-8 border border-white/5 z-10">
              <div className="text-6xl font-black text-slate-800 mb-6 font-mono">02</div>
              <h3 className="text-xl font-bold text-white mb-4">Discovery</h3>
              <p className="text-slate-400">Our algorithm matches you with 3 candidates. You interview them via video call.</p>
            </div>

            <div className="bg-[#0b1120] p-8 border border-white/5 z-10">
              <div className="text-6xl font-black text-slate-800 mb-6 font-mono">03</div>
              <h3 className="text-xl font-bold text-white mb-4">Deployment</h3>
              <p className="text-slate-400">Selected nurse arrives with the VCare kit. Service begins immediately.</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomeNursingPage;
