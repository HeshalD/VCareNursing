import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, BadgeCheck, Clock, ShieldCheck, Heart } from 'lucide-react';

const FeaturedCaregivers = ({
  title,
  subtitle,
  workers,
  colorTheme = 'blue'
}) => {

  // Theme configuration maps
  const themeStyles = {
    blue: {
      badge: "bg-blue-100 text-blue-700",
      button: "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20",
      text: "text-blue-600",
      border: "hover:border-blue-200",
      icon: "text-blue-500"
    },
    emerald: {
      badge: "bg-emerald-100 text-emerald-700",
      button: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20",
      text: "text-emerald-600",
      border: "hover:border-emerald-200",
      icon: "text-emerald-500"
    },
    rose: {
      badge: "bg-rose-100 text-rose-700",
      button: "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20",
      text: "text-rose-600",
      border: "hover:border-rose-200",
      icon: "text-rose-500"
    },
    amber: {
      badge: "bg-amber-100 text-amber-700",
      button: "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20",
      text: "text-amber-600",
      border: "hover:border-amber-200",
      icon: "text-amber-500"
    }
  };

  const currentTheme = themeStyles[colorTheme] || themeStyles.blue;

  return (
    <section className="py-24 bg-white">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">{title}</h2>
          <p className="text-slate-600 text-lg">{subtitle}</p>
        </div>

        {/* Mobile: Horizontal Scroll, Desktop: Grid */}
        <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 overflow-x-auto snap-x snap-mandatory pb-8 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
          {workers.map((worker, index) => (
            <motion.div
              key={worker.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`min-w-[85%] sm:min-w-[340px] md:min-w-0 snap-center group bg-white rounded-3xl p-4 md:p-6 border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-300 ${currentTheme.border}`}
            >
              <div className="relative mb-4 md:mb-6">
                <div className="aspect-[4/3] md:aspect-square rounded-2xl overflow-hidden bg-slate-100 relative">
                  <img
                    src={worker.image}
                    alt={worker.name}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                  {worker.isVerified && (
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm p-1.5 rounded-full shadow-sm" title="Verified Professional">
                      <BadgeCheck className={`w-5 h-5 ${currentTheme.icon} fill-current/10`} />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-white rounded-full shadow-md border border-slate-100 whitespace-nowrap">
                  <div className="flex items-center gap-1 text-sm font-bold text-slate-900">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    {worker.rating}
                    <span className="text-slate-400 font-normal">({worker.reviews})</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 text-center">
                <h3 className="text-xl font-bold text-slate-900 mb-1">{worker.name}</h3>
                <p className={`text-sm font-medium ${currentTheme.text} mb-4`}>{worker.role}</p>

                <div className="flex justify-center flex-wrap gap-2 mb-6">
                  {worker.badges?.map((badge, i) => (
                    <span key={i} className={`px-2.5 py-1 rounded-md text-xs font-semibold ${currentTheme.badge}`}>
                      {badge}
                    </span>
                  ))}
                </div>

                <div className="space-y-2 md:space-y-3 mb-4 md:mb-6 text-left bg-slate-50 p-3 md:p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Age
                    </span>
                    <span className="text-sm font-medium text-slate-900">{worker.age} Years</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Location
                    </span>
                    <span className="text-sm font-medium text-slate-900 truncate max-w-[120px]" title={worker.location}>{worker.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" /> Experience
                    </span>
                    <span className="text-sm font-medium text-slate-900">{worker.experience}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6 px-2">
                  <div className="text-left">
                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider">Starting at</div>
                    <div className="text-lg font-bold text-slate-900">{worker.price}</div>
                  </div>
                </div>

                <button className={`w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-lg transition-all transform active:scale-[0.98] ${currentTheme.button}`}>
                  View Profile & Book
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <button className="text-slate-500 hover:text-slate-800 font-medium transition-colors flex items-center gap-2 mx-auto">
            View all available professionals <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedCaregivers;
