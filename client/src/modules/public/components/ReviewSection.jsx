import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Star, Quote, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

const ReviewSection = () => {
  const scrollRef = useRef(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -400, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
    }
  };
  const reviews = [
    {
      id: 1,
      name: "Dilshan Perera",
      role: "Client - Elderly Care",
      image: "https://i.pravatar.cc/150?u=dilshan",
      content: "Finding reliable care for my father was a nightmare until I found VCare. The nurse assigned, Sarah, is absolutely wonderful. She's punctual, professional, and treats my dad like family.",
      rating: 5
    },
    {
      id: 2,
      name: "Chathurika Alwis",
      role: "Client - Baby Care",
      image: "https://i.pravatar.cc/150?u=michelle",
      content: "I was hesitant about leaving my newborn, but the nanny from VCare put my mind at ease immediately. The background checks and verification process really make a difference.",
      rating: 5
    },
    {
      id: 3,
      name: "Dr. K. Jayasuriya",
      role: "Hospital Administrator",
      image: "https://i.pravatar.cc/150?u=jayasuriya",
      content: "VCare allows us to fill staffing gaps in our emergency ward within hours. The quality of professionals we get is consistently high. It's an indispensable tool for our hospital.",
      rating: 5
    },

    {
      id: 4,
      name: "Dr. M. Bandara",
      role: "Hospital Administrator",
      image: "https://i.pravatar.cc/150?u=Bandara",
      content: "VCare allows us to fill staffing gaps in our emergency ward within hours. The quality of professionals we get is consistently high. It's an indispensable tool for our hospital.",
      rating: 4
    }
  ];

  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[20%] right-[-5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[10%] left-[-5%] w-72 h-72 bg-indigo-200/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm mb-6"
          >
            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
            <span className="text-sm font-semibold text-slate-800">4.9/5 Average Rating</span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Stories of <span className="text-blue-600">Trust & Care</span>.
          </h2>
          <p className="text-lg text-slate-600">
            Join thousands of Sri Lankan families and healthcare facilities who have found peace of mind with VCare.
          </p>
        </div>

        {/* Desktop Navigation Buttons */}


        <div
          ref={scrollRef}
          className="flex overflow-x-auto gap-8 px-4 sm:px-0 snap-x snap-mandatory scrollbar-hide py-4"
        >
          {reviews.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="min-w-[85vw] md:min-w-[400px] snap-center bg-white rounded-[32px] p-8 shadow-xl shadow-slate-200/50 border border-slate-100 relative group hover:-translate-y-2 transition-transform duration-300 flex flex-col"
            >
              <div className="absolute top-8 right-8 text-blue-100 group-hover:text-blue-50 transition-colors">
                <Quote className="w-12 h-12 fill-current" />
              </div>

              <div className="flex gap-1 mb-6">
                {[...Array(review.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                ))}
              </div>

              <p className="text-slate-700 text-lg leading-relaxed mb-8 relative z-10">
                "{review.content}"
              </p>

              <div className="flex items-center gap-4 mt-auto">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-100">
                  <img src={review.image} alt={review.name} className="w-full h-full object-cover" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">{review.name}</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-500">{review.role}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Navigation Buttons - Centered Bottom */}
        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={scrollLeft}
            className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:scale-105 transition-all"
            aria-label="Previous reviews"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={scrollRight}
            className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:scale-105 transition-all"
            aria-label="Next reviews"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default ReviewSection;
