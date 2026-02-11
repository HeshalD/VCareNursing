import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Baby, Heart, Clock, CheckCircle, ShieldCheck,
  ArrowRight, Smile, Star, Coffee, Home
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';

// Placeholder image
import babyImage from '../../assets/images/baby_caretakers_image_landingpage.webp';
import FeaturedCaregivers from './components/FeaturedCaregivers';

const ChildCarePage = () => {
  const childCareWorkers = [
    {
      id: 1,
      name: "Shehani Dias",
      age: 32,
      role: "Certified Nanny",
      experience: "7 Years",
      location: "Nugegoda",
      rating: 4.9,
      reviews: 82,
      isVerified: true,
      price: "LKR 950/hr",
      image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=800",
      badges: ["Newborn Specialist", "First Aid"]
    },
    {
      id: 2,
      name: "Malini Gunasooriya",
      age: 40,
      role: "Montessori Teacher",
      experience: "12 Years",
      location: "Battaramulla",
      rating: 5.0,
      reviews: 156,
      isVerified: true,
      price: "LKR 1,200/hr",
      image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800",
      badges: ["Early Education", "Special Needs"]
    },
    {
      id: 3,
      name: "Dilani Jayasinghe",
      age: 24,
      role: "Babysitter",
      experience: "3 Years",
      location: "Galle Fort",
      rating: 4.8,
      reviews: 45,
      isVerified: true,
      price: "LKR 600/hr",
      image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=800",
      badges: ["Student", "Part-Time"]
    },
    {
      id: 4,
      name: "Mrs. K. Perera",
      age: 52,
      role: "Expert Governess",
      experience: "25 Years",
      location: "Colombo 03",
      rating: 5.0,
      reviews: 310,
      isVerified: true,
      price: "LKR 2,000/hr",
      image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&q=80&w=800",
      badges: ["Premium Care", "Multi-lingual"]
    }
  ];
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
                  <button className="px-8 py-4 bg-rose-500 text-white rounded-full font-bold text-lg hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center gap-2">
                    Find a Nanny <ArrowRight className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4 px-6 py-4 bg-white border border-slate-200 rounded-full shadow-sm">
                    <div className="flex -space-x-3">
                      <img src="https://i.pravatar.cc/100?u=5" alt="Nanny" className="w-8 h-8 rounded-full border-2 border-white" />
                      <img src="https://i.pravatar.cc/100?u=6" alt="Nanny" className="w-8 h-8 rounded-full border-2 border-white" />
                      <div className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                        +200
                      </div>
                    </div>
                    <span className="text-sm font-medium text-slate-600">Active Nannies</span>
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
                  src={babyImage}
                  alt="Child Care"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />

                {/* Floating Card */}
                <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-6 rounded-3xl border border-white/50 shadow-lg">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center text-rose-500">
                      <Heart className="w-6 h-6 fill-current" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">Peace of Mind</div>
                      <div className="text-xs text-slate-500">Safety First Policy</div>
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
      <FeaturedCaregivers
        title="Trusted by Sri Lankan Families"
        subtitle="Meet our highest-rated nanny professionals."
        workers={childCareWorkers}
        colorTheme="rose"
      />

      {/* Pricing Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">Simple Pricing</h2>
            <p className="text-slate-600 text-lg">Invest in quality care for your children.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Card 1 */}
            <div className="bg-white p-10 rounded-[40px] shadow-sm hover:shadow-xl transition-shadow border border-slate-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Babysitting</h3>
                  <p className="text-slate-500">Hourly Care</p>
                </div>
                <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-600 uppercase tracking-wide">4 Hours Min</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 800</span>
                <span className="text-slate-500 ml-2">/ hour</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Date Nights", "Weekend Help", "Verified Sitters"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-600">
                    <div className="w-6 h-6 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-rose-500" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl border-2 border-slate-200 text-slate-700 font-bold hover:border-slate-900 hover:text-slate-900 transition-colors">
                Book a Sitter
              </button>
            </div>

            {/* Card 2 - Featured */}
            <div className="bg-white p-10 rounded-[40px] shadow-2xl relative border-2 border-rose-500 overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 right-0 bg-rose-500 text-white text-xs font-bold px-6 py-2 rounded-bl-2xl">FULL TIME</div>
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Professional Nanny</h3>
                  <p className="text-rose-600 font-medium">Monthly Contract</p>
                </div>
                <span className="px-4 py-1.5 bg-rose-100 rounded-full text-xs font-bold text-rose-700 uppercase tracking-wide">Daily</span>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">LKR 65,000</span>
                <span className="text-slate-500 ml-2">/ month</span>
              </div>
              <ul className="space-y-4 mb-10">
                {["Dedicated Nanny", "Developmental Activities", "Light Housekeeping", "Sick Days Covered"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-700 font-medium">
                    <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4 text-rose-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <button className="w-full py-4 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30">
                Find My Nanny
              </button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div >
  );
};

export default ChildCarePage;
