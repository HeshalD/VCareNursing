import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import StoryCard from './StoryCard';
import apiClient from '../../../api/api';

// "Stories of Trust & Care": the success stories an admin has featured for the landing page.
// Renders nothing until at least one story is featured, so there's never an empty heading.
const ReviewSection = () => {
  const scrollRef = useRef(null);
  const [stories, setStories] = useState([]);

  useEffect(() => {
    let cancelled = false;
    apiClient.getFeaturedSuccessStories()
      .then((res) => { if (!cancelled) setStories(res.data || []); })
      .catch(() => { /* leave the section hidden if stories can't load */ });
    return () => { cancelled = true; };
  }, []);

  const scrollByCard = (direction) => {
    scrollRef.current?.scrollBy({ left: direction * 400, behavior: 'smooth' });
  };

  if (stories.length === 0) return null;

  return (
    <section className="py-24 bg-slate-50 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[20%] right-[-5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-[10%] left-[-5%] w-72 h-72 bg-indigo-200/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Stories of <span className="text-blue-600">Trust &amp; Care</span>.
          </h2>
          <p className="text-lg text-slate-600">
            Join thousands of Sri Lankan families and healthcare facilities who have found peace of mind with VCare.
          </p>
        </div>

        <div
          ref={scrollRef}
          className="flex overflow-x-auto gap-8 px-4 sm:px-0 snap-x snap-mandatory scrollbar-hide py-4"
        >
          {stories.map((story, index) => (
            <motion.div
              key={story.story_id}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="min-w-[85vw] md:min-w-[400px] md:max-w-[400px] snap-center flex"
            >
              <StoryCard story={story} className="w-full" />
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-4 mt-8">
          {stories.length > 1 && (
            <button
              onClick={() => scrollByCard(-1)}
              className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:scale-105 transition-all"
              aria-label="Previous stories"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <Link
            to="/success-stories"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            View all success stories <ArrowRight className="w-4 h-4" />
          </Link>
          {stories.length > 1 && (
            <button
              onClick={() => scrollByCard(1)}
              className="w-12 h-12 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-slate-50 hover:scale-105 transition-all"
              aria-label="Next stories"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default ReviewSection;
