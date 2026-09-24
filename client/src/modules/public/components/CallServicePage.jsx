import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../../../components/layout/Navbar';
import Footer from '../../../components/layout/Footer';
import { CONTACT_NUMBERS } from '../../../constants/contactNumbers';

// Full class strings per theme so Tailwind can detect them.
export const CALL_THEMES = {
  turquoise: {
    selection: 'selection:bg-cyan-100 selection:text-cyan-900',
    heroBg: 'bg-gradient-to-br from-sky-100 via-cyan-50 to-teal-100',
    badge: 'bg-cyan-100 text-cyan-700',
    dot: 'bg-teal-500',
    accent: 'text-teal-600',
    button: 'bg-teal-500 hover:bg-teal-600 shadow-teal-500/20',
    iconBox: 'bg-cyan-100 text-teal-600',
    cardHover: 'hover:border-cyan-300',
    panel: 'bg-sky-50 border-sky-100',
    panelTitle: 'text-sky-900',
    panelText: 'text-sky-800/80',
    itemHover: 'group-hover:bg-cyan-50 group-hover:border-cyan-100',
    itemIcon: 'group-hover:text-teal-600',
    heroCircle: 'from-sky-300 to-teal-300',
  },
  red: {
    selection: 'selection:bg-red-100 selection:text-red-900',
    heroBg: 'bg-gradient-to-br from-red-100 via-rose-50 to-orange-100',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
    accent: 'text-red-600',
    button: 'bg-red-600 hover:bg-red-700 shadow-red-500/20',
    iconBox: 'bg-red-100 text-red-600',
    cardHover: 'hover:border-red-300',
    panel: 'bg-red-50 border-red-100',
    panelTitle: 'text-red-900',
    panelText: 'text-red-800/80',
    itemHover: 'group-hover:bg-red-50 group-hover:border-red-100',
    itemIcon: 'group-hover:text-red-600',
    heroCircle: 'from-red-300 to-orange-300',
  },
};

/**
 * Call-only service page: shows VCare numbers as tel: links
 * (tapping on mobile opens the phone app). No booking flow.
 */
const CallServicePage = ({
  theme, badge, titleTop, titleAccent, subtitle, callLabel,
  HeroIcon, image, featuresHeading, featuresIntro, panel, features,
}) => {
  const t = CALL_THEMES[theme];

  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 ${t.selection}`}>
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center pt-24 pb-12 lg:pt-32 lg:pb-20 overflow-hidden">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
            <div className="order-2 lg:order-1 relative z-20">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
                <Link to="/" state={{ scrollTo: 'services' }} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 mb-6">
                  <ArrowLeft className="w-4 h-4" /> All services
                </Link>

                <div className={`flex w-fit items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 ${t.badge}`}>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${t.dot}`} />
                  {badge}
                </div>

                <h1 className="text-4xl xs:text-5xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-slate-900 mb-6 leading-[1.0] md:leading-[0.9]">
                  {titleTop} <br />
                  <span className={t.accent}>{titleAccent}</span>
                </h1>

                <p className="text-lg md:text-xl text-slate-600 mb-8 max-w-lg leading-relaxed">{subtitle}</p>

                <a
                  href={`tel:${CONTACT_NUMBERS[0].tel}`}
                  className={`inline-flex items-center justify-center gap-2 px-8 py-4 text-white rounded-full font-bold text-lg transition-all shadow-lg ${t.button}`}
                >
                  <Phone className="w-5 h-5" /> {callLabel}
                </a>
              </motion.div>
            </div>

            <div className="order-1 lg:order-2 flex justify-center lg:justify-end">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8 }}
                className={`relative rounded-[40px] overflow-hidden shadow-2xl border-4 border-white aspect-[4/5] w-full max-w-md lg:h-[70vh] lg:w-auto flex items-center justify-center ${t.heroBg}`}
              >
                <div className={`absolute -top-16 -right-16 w-64 h-64 rounded-full bg-gradient-to-br opacity-40 blur-2xl ${t.heroCircle}`} />
                <div className={`absolute -bottom-16 -left-16 w-64 h-64 rounded-full bg-gradient-to-br opacity-40 blur-2xl ${t.heroCircle}`} />
                {image ? (
                  <img src={image} alt={badge} className="relative w-full h-full object-contain p-6 mix-blend-multiply" />
                ) : (
                  <div className="relative w-40 h-40 sm:w-48 sm:h-48 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-lg">
                    <HeroIcon className={`w-20 h-20 sm:w-24 sm:h-24 ${t.accent}`} />
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">Call us directly</h2>
            <p className="text-slate-600 text-lg">Tap a number on your phone to start the call.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {CONTACT_NUMBERS.map(n => (
              <a
                key={n.tel}
                href={`tel:${n.tel}`}
                className={`flex items-center gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl transition-colors ${t.cardHover}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${t.iconBox}`}>
                  <Phone className="w-5 h-5" />
                </div>
                <span className="text-xl font-bold text-slate-900 tracking-tight">{n.display}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-20">
            <div className="lg:sticky lg:top-32 h-fit">
              <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">{featuresHeading}</h2>
              <p className="text-xl text-slate-600 leading-relaxed mb-8">{featuresIntro}</p>
              <div className={`p-8 border rounded-3xl ${t.panel}`}>
                <div className="flex items-center gap-4 mb-4">
                  <panel.icon className={`w-8 h-8 ${t.accent}`} />
                  <span className={`text-lg font-bold ${t.panelTitle}`}>{panel.title}</span>
                </div>
                <p className={t.panelText}>{panel.text}</p>
              </div>
            </div>

            <div className="space-y-10">
              {features.map(item => (
                <div key={item.title} className="flex gap-6 group">
                  <div className={`flex-shrink-0 w-20 h-20 bg-white rounded-2xl flex items-center justify-center border border-slate-100 transition-colors ${t.itemHover}`}>
                    <item.icon className={`w-10 h-10 text-slate-400 transition-colors ${t.itemIcon}`} />
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

      <Footer />
    </div>
  );
};

export default CallServicePage;
