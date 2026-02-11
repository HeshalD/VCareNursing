import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Heart, Calendar, CheckCircle, ShieldCheck,
  ArrowRight, UserCheck, Sun, Armchair, HandHeart, Phone
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Placeholder (reusing home care image but ideally would be specific)
import elderlyBg from '../../assets/images/home_care_takers_img_landingpage.avif';
import FeaturedCaregivers from './components/FeaturedCaregivers';

const ElderlyCarePage = () => {
  const elderlyCareWorkers = [
    {
      id: 1,
      name: "Rani Menike",
      age: 48,
      role: "Senior Companion",
      experience: "15 Years",
      location: "Maharagama",
      rating: 5.0,
      reviews: 98,
      isVerified: true,
      price: "LKR 55,000/mo",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800",
      badges: ["Cooking", "Live-in"]
    },
    {
      id: 2,
      name: "Suresh Perera",
      age: 38,
      role: "Male Caretaker",
      experience: "10 Years",
      location: "Moratuwa",
      rating: 4.8,
      reviews: 56,
      isVerified: true,
      price: "LKR 65,000/mo",
      image: "https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?auto=format&fit=crop&q=80&w=800",
      badges: ["Lifting Support", "Physio Assist"]
    },
    {
      id: 3,
      name: "Chithra Kumari",
      age: 55,
      role: "Care Assistant",
      experience: "25 Years",
      location: "Panadura",
      rating: 4.9,
      reviews: 134,
      isVerified: true,
      price: "LKR 50,000/mo",
      image: "https://images.unsplash.com/photo-1566616213894-2dcdcf8af6ed?auto=format&fit=crop&q=80&w=800",
      badges: ["Dementia Care", "Experienced"]
    },
    {
      id: 4,
      name: "Nadeesha Sewwandi",
      age: 29,
      role: "Geriatric Nurse Aide",
      experience: "5 Years",
      location: "Colombo 08",
      rating: 4.7,
      reviews: 28,
      isVerified: true,
      price: "LKR 1,100/hr",
      image: "https://images.unsplash.com/photo-1527613426441-4da17471b66d?auto=format&fit=crop&q=80&w=800",
      badges: ["Medication Mgmt", "Vitals"]
    }
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-amber-100 selection:text-amber-900">
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
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Companionship • Assistance • Dignity
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  Aging with <br />
                  <span className="text-amber-600">
                    Grace & Dignity.
                  </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">
                  Support that respects independence. From daily assistance to friendly companionship, we ensure your loved ones thrive at home.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button className="px-8 py-4 bg-amber-600 text-white rounded-full font-bold text-lg hover:bg-amber-700 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2">
                    Book Consultation <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <div className="flex -space-x-3">
                      <img src="https://i.pravatar.cc/100?u=12" alt="Caregiver" className="w-8 h-8 rounded-full border-2 border-white" />
                      <img src="https://i.pravatar.cc/100?u=13" alt="Caregiver" className="w-8 h-8 rounded-full border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                        +150
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">Compassionate Carers</span>
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
                className="relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5] object-cover bg-amber-50 w-full max-w-md lg:max-w-full lg:h-[80vh] lg:w-auto"
              >
                <img
                  src={elderlyBg}
                  alt="Elderly Care"
                  className="w-full h-full object-cover sepia-[0.3]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                      <Sun className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Daily Updates</div>
                      <div className="text-xs text-slate-500">Photos & Mood Logs</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs font-semibold text-slate-600">Mom is having a great day!</span>
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
                Respectful Support. <br />
                <span className="text-amber-600">Every Single Day.</span>
              </h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">
                It's not just about medication reminders or meals. It's about having a friend to talk to, someone to walk with, and maintaining a high quality of life at home.
              </p>
              <div className="p-8 bg-amber-50 border border-amber-100 rounded-3xl">
                <div className="flex items-center gap-4 mb-4">
                  <HandHeart className="w-8 h-8 text-amber-600" />
                  <span className="text-lg font-bold text-amber-900">Empathy First</span>
                </div>
                <p className="text-amber-800/80">
                  We hire for personality as much as skill. Our caregivers are patient, kind, and genuinely enjoy spending time with seniors.
                </p>
              </div>
            </div>

            <div className="space-y-12">
              {[
                {
                  icon: Armchair,
                  title: "Companionship",
                  desc: "Reading books, playing games, going for walks, or just a friendly chat over tea to combat loneliness."
                },
                {
                  icon: UserCheck,
                  title: "Personal Assistance",
                  desc: "Help with bathing, grooming, and dressing, always performed with the utmost respect for privacy and dignity."
                },
                {
                  icon: Phone,
                  title: "Stay Connected",
                  desc: "Our carers help seniors use technology to video call family members, ensuring you are always just a click away."
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 group">
                  <div className="flex-shrink-0 w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:bg-amber-50 group-hover:border-amber-100 transition-colors">
                    <item.icon className="w-10 h-10 text-slate-400 group-hover:text-amber-600 transition-colors" />
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
        title="Compassionate Companions"
        subtitle="Dedicated caregivers who treat your loved ones like family."
        workers={elderlyCareWorkers}
        colorTheme="amber"
      />

      {/* Pricing Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Care Packages</h2>
            <p className="text-slate-600 text-lg">Support tailored to your family's needs.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Card 1 */}
            <div className="bg-white p-10 rounded-[40px] shadow-sm hover:shadow-xl transition-shadow border border-slate-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Day Visits</h3>
                  <p className="text-slate-500">Check-ins & Help</p>
                </div>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600 uppercase tracking-wide">Hourly</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 950</span>
                <span className="text-slate-500 ml-2">/ hour</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Meal Preparation", "Medication Reminder", "Light Housekeeping"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600">
                    <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-amber-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:border-slate-900 hover:text-slate-900 transition-colors">
                Book a Visit
              </button>
            </div>

            {/* Card 2 - Featured */}
            <div className="bg-white p-10 rounded-[40px] shadow-2xl relative border-2 border-amber-500 overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 right-0 bg-amber-500 text-white text-xs font-bold px-6 py-2 rounded-bl-2xl">MOST POPULAR</div>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Live-in Aide</h3>
                  <p className="text-amber-600 font-medium">Full-time Companion</p>
                </div>
                <span className="px-4 py-1.5 bg-amber-100 rounded-full text-xs font-bold text-amber-700 uppercase tracking-wide">24/7</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 55,000</span>
                <span className="text-slate-500 ml-2">/ month</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Companionship", "Personal Hygiene", "Cooking & Cleaning", "Walks & Exercises"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/30">
                Select Care Plan
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div >
  );
};

export default ElderlyCarePage;
