import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Phone, ArrowRight, ShieldCheck, Users, Clock, Stethoscope, Ambulance, Pill, Headset, Zap,
  Wallet, Globe, Bell, HeartPulse, Video, UserCheck, ClipboardList, FileText, Search,
  CalendarCheck, Receipt, CheckCircle2, Home,
} from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { CONTACT_NUMBERS } from '../../constants/contactNumbers';
import PriorityMembershipRegisterModal from './components/PriorityMembershipRegisterModal';

const HOTLINE = CONTACT_NUMBERS[1];

const BENEFITS = [
  { icon: Headset, title: '24x7 Free Unlimited Channelling Support', desc: 'Round-the-clock help finding and booking the right doctor, at no extra charge.' },
  { icon: Users, title: 'Cover for 5 Family Members', desc: 'One membership covers the holder and up to four loved ones.' },
  { icon: Wallet, title: 'Special Service Rates', desc: 'Member-only pricing on VCare services, reviewed periodically.' },
  { icon: CalendarCheck, title: 'Online Channelling Booking', desc: 'Book your channelling appointments online, whenever it suits you.' },
  { icon: Pill, title: 'Home Medication Delivery', desc: 'Prescribed medicines delivered to your door, island-wide.' },
  { icon: Globe, title: 'Real-Time User Portal', desc: 'Follow your requests and records live through your member portal.' },
  { icon: Bell, title: 'Health Alerts & Notifications', desc: 'Timely reminders and alerts so nothing important is missed.' },
  { icon: HeartPulse, title: 'Health & Wellness Coordinator', desc: 'A dedicated coordinator who knows you and manages your care.' },
  { icon: Ambulance, title: '24x7 Priority Ambulance', desc: 'Priority dispatch when every minute counts.' },
  { icon: Video, title: 'Telehealth Consultations', desc: 'Speak to a doctor from home, arranged for you.' },
  { icon: Pill, title: '24x7 Medicine Delivery', desc: 'Urgent medicines delivered at any hour of the day or night.' },
  { icon: Phone, title: 'Priority Hotline', desc: 'A dedicated line, answered around the clock.' },
  { icon: Stethoscope, title: 'Home Visit Doctors', desc: 'Qualified doctors who come to you when travel is hard.' },
  { icon: Zap, title: 'Fast Track Service', desc: 'Skip the wait with priority handling on every request.' },
  { icon: Receipt, title: 'Pay Later Facility', desc: 'Get the care you need now and settle the bill later.' },
];

const SERVICES = [
  { icon: UserCheck, text: 'Specialist consultations' },
  { icon: FileText, text: 'Medical records digitisation' },
  { icon: Globe, text: 'International medical exploration' },
  { icon: ClipboardList, text: 'Care coordination' },
  { icon: Search, text: 'Community services assessment' },
  { icon: HeartPulse, text: 'Continuity and follow-up' },
  { icon: Users, text: 'Second opinion facilitation' },
  { icon: ShieldCheck, text: 'Health records management' },
  { icon: Stethoscope, text: 'Appointment, treatment and surgery attendance' },
  { icon: Receipt, text: 'Private insurance claim handling' },
];

const STEPS = [
  { n: '1', title: 'Register', desc: 'Send your request in a minute. New here? We just verify your mobile number.' },
  { n: '2', title: 'Get your quotation', desc: 'Our team prepares your registration fee quotation and sends it to you.' },
  { n: '3', title: 'Pay & activate', desc: 'Settle the registration fee and your Priority Membership goes live for the year.' },
];

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5 },
};

const PriorityMembershipPage = () => {
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const openRegister = () => setRegisterOpen(true);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden bg-gradient-to-br from-blue-50 via-white to-sky-100">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gradient-to-br from-blue-300 to-sky-200 opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-gradient-to-br from-sky-200 to-indigo-200 opacity-40 blur-3xl" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }}>
              <div className="flex w-fit items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 bg-blue-100 text-blue-700">
                <div className="w-2 h-2 rounded-full animate-pulse bg-blue-500" />
                Medical Concierge Service
              </div>
              <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.95]">
                VCare Priority <br />
                <span className="text-blue-600">Membership.</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-600 mb-3 max-w-xl leading-relaxed">
                Your convenience is our priority. We care for you and your loved ones, with one dedicated team
                handling everything from channelling to home care.
              </p>
              <p className="text-sm text-slate-500 mb-8">Sri Lanka's medical concierge, available 24x7.</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={openRegister}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-lg transition-all shadow-lg shadow-blue-600/20"
                >
                  Register now <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href={`tel:${HOTLINE.tel}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-full font-bold text-lg transition-all"
                >
                  <Phone className="w-5 h-5 text-blue-600" /> {HOTLINE.display}
                </a>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }}
              className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:max-w-none w-full"
            >
              {[
                { icon: Clock, big: '24x7', small: 'Priority hotline & support' },
                { icon: Users, big: '5', small: 'Family members covered' },
                { icon: Ambulance, big: 'Priority', small: 'Ambulance dispatch' },
                { icon: Home, big: 'Home', small: 'Doctor visits & medicines' },
              ].map((s, i) => (
                <div key={s.small} className={`bg-white rounded-[24px] p-6 shadow-[0_2px_10px_rgba(0,0,0,0.05)] border border-slate-100 ${i % 2 ? 'sm:translate-y-6' : ''}`}>
                  <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="text-3xl font-bold text-slate-900 tracking-tight">{s.big}</div>
                  <div className="text-sm text-slate-500 mt-1">{s.small}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-[#F7F3EF]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-4">Everything you get as a member</h2>
            <p className="text-lg text-slate-600">Priority access to a full range of medical support, all coordinated by VCare.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title} {...fadeUp} transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                className="group bg-white rounded-[24px] p-6 shadow-[0_2px_10px_rgba(0,0,0,0.04)] hover:shadow-md border border-transparent hover:border-blue-100 transition-all"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center mb-4 transition-colors">
                  <b.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1.5">{b.title}</h3>
                <p className="text-slate-600 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* What we handle */}
      <section className="py-24 bg-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <motion.div {...fadeUp} className="lg:sticky lg:top-28">
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-5 leading-tight">
                One team. <br /><span className="text-blue-600">Your whole medical journey.</span>
              </h2>
              <p className="text-lg text-slate-600 leading-relaxed mb-8">
                Your health &amp; wellness coordinator handles the calls, the paperwork and the follow-ups, so you and
                your family can focus on getting better.
              </p>
              <div className="p-7 border rounded-3xl bg-blue-50 border-blue-100">
                <div className="flex items-center gap-3 mb-3">
                  <ShieldCheck className="w-7 h-7 text-blue-600" />
                  <span className="text-lg font-bold text-blue-900">Care without the runaround</span>
                </div>
                <p className="text-blue-900/80">From the first phone call to the last follow-up, one coordinator stays with you.</p>
              </div>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-4">
              {SERVICES.map((s, i) => (
                <motion.div
                  key={s.text} {...fadeUp} transition={{ duration: 0.4, delay: (i % 2) * 0.08 }}
                  className="flex items-center gap-4 p-5 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-white text-blue-600 flex items-center justify-center border border-slate-100">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-slate-800 leading-snug">{s.text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-[#F8F9FA]">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2 {...fadeUp} className="text-3xl md:text-4xl font-semibold text-center text-slate-900 mb-14">
            How to join
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.1 }}
                className="relative bg-white rounded-[24px] p-8 shadow-[0_2px_10px_rgba(0,0,0,0.04)]"
              >
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center mb-5">{s.n}</div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-slate-600 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            {...fadeUp}
            className="relative rounded-[32px] overflow-hidden bg-gradient-to-br from-blue-600 to-blue-800 text-white text-center px-6 py-14 md:py-16 shadow-xl"
          >
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-blue-200" />
              <h2 className="text-3xl md:text-4xl font-bold mb-3">Ready for priority care?</h2>
              <p className="text-blue-100 text-lg max-w-xl mx-auto mb-8">
                Register today and our team will send your registration fee quotation. Questions? Call us any time.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={openRegister}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-700 hover:bg-blue-50 rounded-full font-bold text-lg transition-colors"
                >
                  Register now <ArrowRight className="w-5 h-5" />
                </button>
                <a
                  href={`tel:${HOTLINE.tel}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/40 hover:bg-white/10 rounded-full font-bold text-lg transition-colors"
                >
                  <Phone className="w-5 h-5" /> {HOTLINE.display}
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />

      <PriorityMembershipRegisterModal isOpen={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
};

export default PriorityMembershipPage;
