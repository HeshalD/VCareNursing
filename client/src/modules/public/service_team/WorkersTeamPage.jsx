import React from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase, Heart, DollarSign, Award, CheckCircle,
  ArrowRight, Users, GraduationCap, Stethoscope, Baby, User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';

// Placeholder image for professionals
import proBg from '../../../assets/images/home_care_takers_img_landingpage.avif';

const WorkersTeamPage = () => {
  const benefits = [
    {
      icon: DollarSign,
      title: "Impactful Earnings",
      desc: "Earn above market rates with our transparent payment structure. Weekly payouts directly to your bank account."
    },
    {
      icon: Briefcase,
      title: "Flexible Schedule",
      desc: "You are your own boss. Accept shifts that fit your life—whether it's night shifts, weekends, or full-time live-in."
    },
    {
      icon: Award,
      title: "Career Growth",
      desc: "Access free training modules, certification upgrades, and mentorship from senior matrons."
    }
  ];

  const roles = [
    {
      icon: Stethoscope,
      title: "Registered Nurses",
      req: "SLMC Registration Required",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100"
    },
    {
      icon: Baby,
      title: "Child Care Pro",
      req: "ECCDE Diploma or Experience",
      color: "text-rose-600",
      bg: "bg-rose-50",
      border: "border-rose-100"
    },
    {
      icon: User,
      title: "Elderly Care Aide",
      req: "NVQ Level 3/4 Certificate",
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100"
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">
      <Navbar />

      {/* Hero Section */}
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center pt-24 pb-12 lg:pt-32 lg:pb-20 overflow-hidden bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">

            {/* Text Content */}
            <div className="order-2 lg:order-1 relative z-20">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  Hiring Professionals Now
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Care with Pride. <br />
                  <span className="text-indigo-600">
                    Earn with Dignity.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Join Sri Lanka's largest network of verified healthcare professionals.
                  We handle the finding clients, insurance, and billing. You just focus on caring.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/services/apply" className="px-8 py-4 bg-indigo-600 text-white rounded-full font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                    Apply Now <ArrowRight className="w-5 h-5" />
                  </Link>
                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <span className="text-sm font-medium text-slate-600">
                      <span className="font-bold text-slate-900">2,500+</span> professionals joined
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Hero Image */}
            <div className="order-1 lg:order-2 relative flex justify-center lg:justify-end">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                className="relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5] object-cover bg-indigo-50 w-full max-w-md lg:max-w-full lg:h-[80vh] lg:w-auto"
              >
                <img
                  src={proBg}
                  alt="Nursing Professional"
                  className="w-full h-full object-cover saturate-[0] mix-blend-multiply opacity-80"
                />
                <div className="absolute inset-0 bg-indigo-600/20 mix-blend-overlay" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/95 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">This Week's Earnings</span>
                    <span className="text-xs font-bold text-green-500">+12% vs last week</span>
                  </div>
                  <div className="text-3xl font-black text-slate-900 mb-1">LKR 45,000</div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
                    <div className="bg-indigo-500 h-1.5 rounded-full w-[70%]" />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="py-24 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Who We Are Looking For</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {roles.map((role, i) => (
              <div key={i} className={`p-8 rounded-3xl border ${role.border} ${role.bg} transition-transform hover:-translate-y-1`}>
                <role.icon className={`w-10 h-10 ${role.color} mb-6`} />
                <h3 className="text-xl font-bold text-slate-900 mb-2">{role.title}</h3>
                <p className="text-slate-600 text-sm font-medium">{role.req}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
                Why professionals <br />
                <span className="text-indigo-600">choose VCare.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-12">
                We are building the first "Nurse-First" ecosystem in Sri Lanka. We believe that if we take care of you, you will take better care of our patients.
              </p>

              <div className="space-y-8">
                {benefits.map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-600">
                      <item.icon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                      <p className="text-slate-600">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[40px] opacity-10 blur-2xl" />
              <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl relative">
                <h3 className="text-2xl font-bold text-slate-900 mb-8">Application Protocol</h3>

                <div className="space-y-8 relative">
                  <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100" />

                  {[
                    { step: "1", title: "Submit Documents", desc: "Upload NIC, Certificates, and CV via our app." },
                    { step: "2", title: "Skill Assessment", desc: "Take a quick online quiz or visit our center for practicals." },
                    { step: "3", title: "Background Check", desc: "We verify your police report and past employment." },
                    { step: "4", title: "Onboarding", desc: "Receive your uniform, ID, and VCare App access." }
                  ].map((s, i) => (
                    <div key={i} className="flex gap-6 relative">
                      <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 z-10 border-4 border-white shadow-sm">
                        {s.step}
                      </div>
                      <div className="pt-2">
                        <h4 className="font-bold text-slate-900 mb-1">{s.title}</h4>
                        <p className="text-slate-500 text-sm">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-10 pt-8 border-t border-slate-100">
                  <Link to="/services/apply" className="block w-full py-4 bg-slate-900 text-white text-center font-bold rounded-xl hover:bg-slate-800 transition-colors">
                    Start Application
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default WorkersTeamPage;
