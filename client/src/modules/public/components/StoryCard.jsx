import React from 'react';
import { Link } from 'react-router-dom';
import { Play, ArrowRight } from 'lucide-react';
import { formatStoryDate, storyImage } from '../../../utils/storyFormat';

// Card used in the landing-page carousel and the /success-stories grid.
const StoryCard = ({ story, className = '' }) => {
  const img = storyImage(story);
  return (
    <Link
      to={`/success-stories/${story.slug}`}
      className={`group flex flex-col bg-white rounded-[28px] overflow-hidden border border-slate-100 shadow-xl shadow-slate-200/50 hover:-translate-y-1.5 transition-transform duration-300 ${className}`}
    >
      <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
        {img && (
          <img src={img} alt={story.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        )}
        {story.youtube_video_id && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
              <Play className="w-6 h-6 text-blue-600 fill-blue-600 ml-0.5" />
            </span>
          </span>
        )}
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-xl font-semibold text-slate-900 leading-snug mb-2 line-clamp-2">{story.title}</h3>
        {story.summary && <p className="text-slate-600 text-[15px] leading-relaxed line-clamp-3 mb-4">{story.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500 truncate">
            {[story.person_name, formatStoryDate(story.display_date)].filter(Boolean).join(' · ')}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold text-blue-600 shrink-0">
            {story.youtube_video_id ? 'Watch' : 'Read'} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default StoryCard;
