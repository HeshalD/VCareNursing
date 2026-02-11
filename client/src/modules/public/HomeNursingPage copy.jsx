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
import FeaturedCaregivers from './components/FeaturedCaregivers';

// Custom
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

  const nursingWorkers = [
    {
      id: 1,
      name: "Ama Perera",
      age: 28,
      role: "ICU Registered Nurse",
      experience: "5 Years",
      location: "Colombo 05",
      rating: 4.9,
      reviews: 124,
      isVerified: true,
      price: "LKR 1,200/hr",
      image: "https://images.unsplash.com/photo-1595152772835-219674b2a8a6?auto=format&fit=crop&q=80&w=800",
      badges: ["SLMC Reg", "ACLS Certified"]
    },
    {
      id: 2,
      name: "Ruwan Silva",
      age: 34,
      role: "Male Nurse (Palliative)",
      experience: "8 Years",
      location: "Kandy Team",
      rating: 4.8,
      reviews: 89,
      isVerified: true,
      price: "LKR 1,100/hr",
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=800",
      badges: ["Post-Op Specialist", "24/7 Shift"]
    },
    {
      id: 3,
      name: "Thanuja Bandara",
      age: 42,
      role: "Senior Matron",
      experience: "15 Years",
      location: "Gampaha",
      rating: 5.0,
      reviews: 215,
      isVerified: true,
      price: "LKR 1,800/hr",
      image: "https://images.unsplash.com/photo-1590611936760-eeb9bc598548?auto=format&fit=crop&q=80&w=800",
      badges: ["Head Nurse", "Wound Care"]
    },
    {
      id: 4,
      name: "Dilshan Jayasuriya",
      age: 25,
      role: "Assistant Nurse",
      experience: "2 Years",
      location: "Dehiwala",
      rating: 4.7,
      reviews: 42,
      isVerified: true,
      price: "LKR 850/hr",
      image: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=800",
      badges: ["Quick Response", "Vitals"]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
      <Navbar />

      {/* Hero  */}
      {/* Hero  */}
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
                  Nursing • Post-Op • Elderly
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Healing <br />
                  <span className="text-emerald-600">
                    at Home.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Hospital-grade care doesn't need a hospital bed. We bring the ICU to your living room with certified professionals and live monitoring.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button className="px-8 py-4 bg-emerald-600 text-white rounded-full font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                    Request Care <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <div className="flex -space-x-3">
                      <img src="https://i.pravatar.cc/100?u=1" alt="Nurse" className="w-8 h-8 rounded-full border-2 border-white" />
                      <img src="https://i.pravatar.cc/100?u=2" alt="Nurse" className="w-8 h-8 rounded-full border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                        +400
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">Available Now</span>
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
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                      <Activity className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Vitals Monitored</div>
                      <div className="text-xs text-slate-500">Real-time sync</div>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full w-[80%] bg-emerald-500 rounded-full" />
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
                Not just a Nurse. <br />
                <span className="text-emerald-600">A Medical Partner.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                Most agencies just send a person. We send a managed care protocol.
                Every nurse is connected to our Command OS, ensuring vitals are recorded,
                medicines are tracked, and doctors are kept in the loop.
              </p>
              <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-3xl">
                <div className="flex items-center gap-4 mb-4">
                  <Activity className="w-8 h-8 text-emerald-600" />
                  <span className="text-lg font-bold text-emerald-900">Live Vitals Monitoring</span>
                </div>
                <p className="text-emerald-800/80">
                  Our app tracks BP, Sugar, and SpO2 trends. If readings go abnormal,
                  our central command center is alerted instantly.
                </p>
              </div>
            </div>

            <div className="space-y-12">
              {[
                {
                  icon: Stethoscope,
                  title: "Clinical Expertise",
                  desc: "ICU trained staff capable of handling ventilators, tracheostomy, and post-stroke recovery."
                },
                {
                  icon: ShieldCheck,
                  title: "Background Verified",
                  desc: "Police verification, aadhaar validation, and previous employer checks are mandatory."
                },
                {
                  icon: Clock,
                  title: "Zero Absconding",
                  desc: "Our replacement guarantee ensures you are never left without care, ever."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="flex-shrink-0 w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-emerald-50 group-hover:border-emerald-100 transition-colors">
                    <item.icon className="w-10 h-10 text-slate-400 group-hover:text-emerald-600 transition-colors" />
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
      <FeaturedCaregivers
        title="Meet Our Nursing Professionals"
        subtitle="Compassionate, certified experts ready to support your family."
        workers={nursingWorkers}
        colorTheme="emerald"
      />

      {/* Pricing Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Transparent Pricing</h2>
            <p className="text-slate-600 text-lg">No hidden charges. No commission surprises. Pay directly through the app.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Card 1 */}
            <div className="bg-white p-10 rounded-[40px] shadow-sm hover:shadow-xl transition-shadow border border-slate-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Shift Care</h3>
                  <p className="text-slate-500">Flexible Support</p>
                </div>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600 uppercase tracking-wide">12 Hours</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 3,500</span>
                <span className="text-slate-500 ml-2">/ shift</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Day or Night Duty", "Basic Nursing Procedures", "Medication Management"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600">
                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:border-slate-900 hover:text-slate-900 transition-colors">
                Select Plan
              </button>
            </div>

            {/* Card 2 - Featured */}
            <div className="bg-white p-10 rounded-[40px] shadow-2xl relative border-2 border-emerald-500 overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-xs font-bold px-6 py-2 rounded-bl-2xl">RECOMMENDED</div>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Live-in Care</h3>
                  <p className="text-emerald-600 font-medium">Full-time Support</p>
                </div>
                <span className="px-4 py-1.5 bg-emerald-100 rounded-full text-xs font-bold text-emerald-700 uppercase tracking-wide">24 Hours</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 7,500</span>
                <span className="text-slate-500 ml-2">/ day</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["24/7 Resident Nurse", "ICU-level Capability", "Emergency Response Ready", "Free Replacement Guarantee"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/30">
                Start Live-in Care
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Protocol Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">Deployment Protocol</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-[2.5rem] left-[20%] right-[20%] h-0.5 bg-slate-100 -z-10" />

            {[
              { step: "01", title: "Assessment", desc: "Senior nurse visits to assess patient condition." },
              { step: "02", title: "Discovery", desc: "Algorithm matches 3 candidates. You interview them." },
              { step: "03", title: "Deployment", desc: "Selected nurse arrives with kit. Service begins." }
            ].map((step, i) => (
              <div key={i} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 text-center relative">
                <div className="w-20 h-20 mx-auto bg-white rounded-full flex items-center justify-center text-3xl font-black text-slate-200 border-4 border-slate-50 mb-6 shadow-sm">
                  <span className="text-emerald-500">{step.step}</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                <p className="text-slate-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HomeNursingPage;
