import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Heart, ShieldCheck, Users, Activity, Clock, Award } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import heroBg from '../../assets/images/Gemini_Generated_Image_5nmpua5nmpua5nmp.png';

const ValueCard = ({ icon: Icon, title, desc, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 hover:border-blue-100 hover:shadow-xl transition-all"
  >
    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-6">
      <Icon className="w-6 h-6 text-blue-600" />
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
    <p className="text-slate-600 leading-relaxed text-sm">{desc}</p>
  </motion.div>
);

const StatItem = ({ value, label }) => (
  <div className="text-center">
    <div className="text-4xl md:text-5xl font-bold text-white mb-2">{value}</div>
    <div className="text-blue-100 font-medium uppercase tracking-wide text-xs">{label}</div>
  </div>
);

const AboutPage = () => {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 100]);

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <Navbar />

      {/* Hero Section - Light & Premium */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden bg-white">
        <motion.div style={{ y: yHero }} className="absolute inset-0 z-0 opacity-20">
          <img src={heroBg} alt="Medical Care" className="w-full h-full object-cover" />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/90 to-white" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-sm font-semibold mb-8"
          >
            <Heart className="w-4 h-4 text-blue-600" /> Est. 2024 • Sri Lanka
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-7xl font-bold text-slate-900 mb-8 leading-tight tracking-tight"
          >
            Redefining Care <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">with Empathy.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto"
          >
            We bridge the gap between world-class medical standards and the warmth of home.
            It's not just about staffing; it's about seeing every patient as family.
          </motion.p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Built on Trust, <br />Powered by Innovation.</h2>
              <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                In Sri Lanka's rapidly evolving healthcare landscape, finding reliable home care has been a challenge. VCare was born to solve this.
              </p>
              <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                We combine rigorous clinical protocols with a human touch. Every nurse in our network is not just verified but trained to uphold dignity and comfort above all else.
              </p>
              <div className="flex gap-8">
                <div>
                  <div className="font-bold text-2xl text-slate-900 mb-1">100%</div>
                  <div className="text-sm text-slate-500">Verified Staff</div>
                </div>
                <div>
                  <div className="font-bold text-2xl text-slate-900 mb-1">24/7</div>
                  <div className="text-sm text-slate-500">Medical Support</div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border border-white">
                <img src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80" alt="Team Meeting" className="w-full h-full object-cover transition-opacity duration-500" />
              </div>
              {/* Floating Card */}
              <div className="absolute -bottom-8 -left-8 bg-white p-6 rounded-xl shadow-xl border border-slate-100 hidden md:block max-w-xs backdrop-blur-md">
                <div className="flex items-center gap-3 mb-3">
                  <Award className="w-8 h-8 text-yellow-500" />
                  <div>
                    <div className="font-bold text-slate-900">Excellence Award</div>
                    <div className="text-xs text-slate-500">Healthcare Standards 2025</div>
                  </div>
                </div>
                <p className="text-sm text-slate-600">Recognized for maintaining zero-incident safety records across 500+ homes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Grid */}
      <section className="py-24 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Our Core Values</h2>
            <p className="text-slate-600 text-lg">Every decision we make is guided by these principles.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <ValueCard
              icon={Heart}
              title="Compassion First"
              desc="We treat patients with the same kindness and respect we would want for our own parents."
              delay={0.1}
            />
            <ValueCard
              icon={ShieldCheck}
              title="Uncompromising Safety"
              desc="From background checks to clinical hygiene, we never cut corners on safety protocols."
              delay={0.2}
            />
            <ValueCard
              icon={Activity}
              title="Clinical Excellence"
              desc="Our staff receives continuous training on the latest medical care practices and technologies."
              delay={0.3}
            />
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <StatItem value="50k+" label="Lives Touched" />
            <StatItem value="1.2M" label="Care Hours" />
            <StatItem value="98%" label="Satisfaction" />
            <StatItem value="150+" label="Partner Clinics" />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-slate-50 text-center border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to experience the VCare difference?</h2>
          <p className="text-slate-600 mb-10 text-lg">
            Whether you need a full-time nurse or a short-term caregiver, we are here to support your family.
          </p>
          <button className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-1">
            Contact Us Today
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default AboutPage;
