import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Heart, ShieldCheck, Users, Activity, Award, MapPin, Phone, Mail, Building2 } from 'lucide-react';
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

const LeaderCard = ({ name, role, bio, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 hover:border-blue-100 hover:shadow-xl transition-all"
  >
    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mb-6">
      <Users className="w-7 h-7 text-white" />
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-1">{name}</h3>
    <div className="text-blue-600 font-semibold text-sm mb-4">{role}</div>
    <p className="text-slate-600 leading-relaxed text-sm">{bio}</p>
  </motion.div>
);

const ServiceAreaItem = ({ label }) => (
  <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full px-5 py-3 border border-white/20">
    <MapPin className="w-4 h-4 text-blue-100 flex-shrink-0" />
    <span className="text-white font-medium text-sm">{label}</span>
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
            <Building2 className="w-4 h-4 text-blue-600" /> Family-Owned Registered Service Provider • Sri Lanka
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl sm:text-5xl md:text-7xl font-bold text-slate-900 mb-8 leading-tight tracking-tight"
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
            We provide in-home care and support to members of the community, assisting you or your
            loved ones to attain maximum independence through our high-quality services.
          </motion.p>
        </div>
      </section>

      {/* Vision & Mission Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Our Vision <br />&amp; Mission.</h2>
              <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                <span className="font-semibold text-slate-900">Vision:</span> We provide in-home care and support
                to members of the community, assisting you or your loved ones to attain maximum
                independence through our high-quality services.
              </p>
              <p className="text-slate-600 text-lg mb-8 leading-relaxed">
                <span className="font-semibold text-slate-900">Mission:</span> We believe in developing positive,
                caring relationships with our clients. Our objective is to actively support you and your
                families to live the life you choose, with greater ease, comfort and assurance.
              </p>
              <div className="flex gap-8">
                <div>
                  <div className="font-bold text-2xl text-slate-900 mb-1">2019</div>
                  <div className="text-sm text-slate-500">Active Since</div>
                </div>
                <div>
                  <div className="font-bold text-2xl text-slate-900 mb-1">SL BRN</div>
                  <div className="text-sm text-slate-500">W C 198 56</div>
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
                    <div className="font-bold text-slate-900">Registered &amp; Trusted</div>
                    <div className="text-xs text-slate-500">Family-Owned Care Provider</div>
                  </div>
                </div>
                <p className="text-sm text-slate-600">A registered service provider dedicated to dignified, high-quality home nursing care.</p>
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <ValueCard
              icon={ShieldCheck}
              title="Quality"
              desc="Professional and dedicated high-quality services delivered to every client, every time."
              delay={0.1}
            />
            <ValueCard
              icon={Heart}
              title="Respect"
              desc="Valuing every person we care for with honest, open and compassionate communication."
              delay={0.2}
            />
            <ValueCard
              icon={Activity}
              title="Consistency"
              desc="A streamlined service system that ensures stability and reliability in the care we provide."
              delay={0.3}
            />
            <ValueCard
              icon={Users}
              title="Flexibility"
              desc="A variety of care options and schedules that accommodate the diverse needs of our clients."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* Leadership Section */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Meet Our Leadership</h2>
            <p className="text-slate-600 text-lg">The people guiding VCare's mission of compassionate, reliable care.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <LeaderCard
              name="Mrs. H W J Wimalachandra"
              role="Founder &amp; CEO"
              bio="Brings decades of medical sector experience in nursing and attendant care, both locally and internationally, and has led VCare's mission since 2019."
              delay={0.1}
            />
            <LeaderCard
              name="Mr. H.G. Anuruddha"
              role="Operations Manager"
              bio="With over 10 years of industry expertise and a background in banking and finance, he manages daily operations and IT systems to keep our care seamless."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Service Areas */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-4">Where We Serve</h2>
            <p className="text-blue-100 text-lg">From private homes to hospital bedsides, our care reaches across Sri Lanka and beyond.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <ServiceAreaItem label="All Colombo Suburbs" />
            <ServiceAreaItem label="Major Hospitals" />
            <ServiceAreaItem label="Kandy Regions" />
            <ServiceAreaItem label="Private Homes" />
            <ServiceAreaItem label="Overseas Medical Escort Services" />
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10 text-slate-600">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-blue-600" />
              <span>+94 76 799 7796</span>
            </div>
            <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span>info@vcarenursing.com</span>
            </div>
          </div>
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
