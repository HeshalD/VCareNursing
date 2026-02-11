import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Users, Clock, CheckCircle, ShieldCheck,
  ArrowRight, Activity, Stethoscope, Briefcase,
  FileCheck, Globe, Star
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Placeholder image - sticking to the one we have or a generic one if not available
// In a real app we'd import specific images
import hospitalBg from '../../assets/images/home_care_takers_img_landingpage.avif'; // reusing for now as placeholder
import FeaturedCaregivers from './components/FeaturedCaregivers';

const HospitalStaffingPage = () => {
  const hospitalWorkers = [
    {
      id: 1,
      name: "Kamal De Silva",
      age: 29,
      role: "ER Registered Nurse",
      experience: "6 Years",
      location: "Colombo 07",
      rating: 4.8,
      reviews: 95,
      isVerified: true,
      price: "Contract",
      image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=800",
      badges: ["Trauma Certified", "Night Shift"]
    },
    {
      id: 2,
      name: "Dr. S. Rathnayake",
      age: 35,
      role: "Medical Officer (Locum)",
      experience: "8 Years",
      location: "Nawala",
      rating: 5.0,
      reviews: 45,
      isVerified: true,
      price: "LKR 3,500/hr",
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=800",
      badges: ["SLMC Full Reg", "OPD"]
    },
    {
      id: 3,
      name: "Nimali Fernando",
      age: 45,
      role: "Senior Ward Sister",
      experience: "20 Years",
      location: "Ragama",
      rating: 4.9,
      reviews: 180,
      isVerified: true,
      price: "Contract",
      image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=800",
      badges: ["Ward Management", "Trainer"]
    },
    {
      id: 4,
      name: "Saman Kumara",
      age: 26,
      role: "ICU Technician",
      experience: "3 Years",
      location: "Borella",
      rating: 4.7,
      reviews: 62,
      isVerified: true,
      price: "LKR 1,500/hr",
      image: "https://images.unsplash.com/photo-1638202993928-7267aad84c31?auto=format&fit=crop&q=80&w=800",
      badges: ["Ventilator Ops", "CLS"]
    }
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
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
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  B2B • Hospitals • Clinics
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Workforce <br />
                  <span className="text-blue-600">
                    On Demand.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Fill staffing gaps in your emergency ward, ICU, or general wards within hours. Verified professionals, ready to deploy.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button className="px-8 py-4 bg-blue-600 text-white rounded-full font-bold text-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2">
                    Partner With Us <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <div className="flex -space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center font-bold text-xs text-slate-600">HR</div>
                      <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center font-bold text-xs text-slate-600">DR</div>
                      <div className="w-8 h-8 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                        +50
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">Hospitals Trust Us</span>
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
                className="relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5] object-cover bg-blue-50 w-full max-w-md lg:max-w-full lg:h-[80vh] lg:w-auto"
              >
                {/* Abstract pattern or placeholder if image reused */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 z-0" />
                <img
                  src={hospitalBg}
                  alt="Hospital Staffing"
                  className="w-full h-full object-cover mix-blend-overlay opacity-80 grayscale-[30%]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Rapid Deployment</div>
                      <div className="text-xs text-slate-500">Staff on-site in &lt; 4 hours</div>
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs font-semibold text-slate-400 mt-2">
                    <span className="px-2 py-1 bg-slate-100 rounded">ICU</span>
                    <span className="px-2 py-1 bg-slate-100 rounded">ER</span>
                    <span className="px-2 py-1 bg-slate-100 rounded">OT</span>
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
                Staffing Solved. <br />
                <span className="text-blue-600">Permanently.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                Reduce administrative burden and hiring costs. VCare provides pre-vetted,
                compliant, and highly skilled medical professionals for temporary or permanent placement.
              </p>
              <div className="p-8 bg-blue-50 border border-blue-100 rounded-3xl">
                <div className="flex items-center gap-4 mb-4">
                  <Briefcase className="w-8 h-8 text-blue-600" />
                  <span className="text-lg font-bold text-blue-900">Enterprise Dashboard</span>
                </div>
                <p className="text-blue-800/80">
                  Manage shifts, view credentials, and handle payments all from a single corporate portal.
                </p>
              </div>
            </div>

            <div className="space-y-12">
              {[
                {
                  icon: FileCheck,
                  title: "Credentialed & Insured",
                  desc: "Every professional comes with verified licenses, malpractice insurance, and up-to-date vaccinations."
                },
                {
                  icon: Clock,
                  title: "24/7 Availability",
                  desc: "Need night shift coverage instantly? Our active pool of nurses is ready to deploy at any hour."
                },
                {
                  icon: Globe,
                  title: "Scalable Workforce",
                  desc: "From a single clinic to a multi-chain hospital network, scale your staff up or down based on patient volume."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="flex-shrink-0 w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                    <item.icon className="w-10 h-10 text-slate-400 group-hover:text-blue-600 transition-colors" />
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
        title="Our Medical Talent Pool"
        subtitle="Verified doctors, nurses, and technicians ready for rapid deployment."
        workers={hospitalWorkers}
        colorTheme="blue"
      />

      {/* Pricing / Contracts Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Partnership Models</h2>
            <p className="text-slate-600 text-lg">Flexible solutions for healthcare facilities of all sizes.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Card 1 */}
            <div className="bg-white p-10 rounded-[40px] shadow-sm hover:shadow-xl transition-shadow border border-slate-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Per Diem</h3>
                  <p className="text-slate-500">Ad-hoc Shifts</p>
                </div>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600 uppercase tracking-wide">Flexible</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">Market Rate</span>
                <span className="text-slate-500 ml-2">+ Service Fee</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["No commitment required", "Fill sick calls instantly", "Access to general pool"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600">
                    <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-blue-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:border-slate-900 hover:text-slate-900 transition-colors">
                Contact Sales
              </button>
            </div>

            {/* Card 2 - Featured */}
            <div className="bg-white p-10 rounded-[40px] shadow-2xl relative border-2 border-blue-500 overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 right-0 bg-blue-500 text-white text-xs font-bold px-6 py-2 rounded-bl-2xl">ENTERPRISE</div>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Contract</h3>
                  <p className="text-blue-600 font-medium">Dedicated Staffing</p>
                </div>
                <span className="px-4 py-1.5 bg-blue-100 rounded-full text-xs font-bold text-blue-700 uppercase tracking-wide">Long Term</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">Custom</span>
                <span className="text-slate-500 ml-2">Pricing</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Dedicated resource pool", "Lower hourly rates", "Priority placement", "Api Integration"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-blue-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30">
                Get Enterprise Quote
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div >
  );
};

export default HospitalStaffingPage;
