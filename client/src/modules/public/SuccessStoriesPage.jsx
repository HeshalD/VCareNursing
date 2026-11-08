import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, Loader2, Play, ArrowRight } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import apiClient from '../../api/api';
import { formatStoryDate, storyImage } from '../../utils/storyFormat';

const PAGE_SIZE = 8;

const FILTERS = [
  { key: 'all', label: 'All stories' },
  { key: 'video', label: 'Videos' },
  { key: 'article', label: 'Articles' },
];

// Soft background shapes that fill the empty space around the content.
const Decor = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {/* dot grids */}
    <div
      className="absolute top-24 right-0 w-[360px] h-[260px] opacity-60"
      style={{
        backgroundImage: 'radial-gradient(#bfdbfe 1.5px, transparent 1.5px)',
        backgroundSize: '22px 22px',
        maskImage: 'linear-gradient(to bottom left, black 20%, transparent 75%)',
        WebkitMaskImage: 'linear-gradient(to bottom left, black 20%, transparent 75%)',
      }}
    />
    <div
      className="absolute bottom-40 left-0 w-[320px] h-[240px] opacity-50"
      style={{
        backgroundImage: 'radial-gradient(#c7d2fe 1.5px, transparent 1.5px)',
        backgroundSize: '22px 22px',
        maskImage: 'linear-gradient(to top right, black 15%, transparent 75%)',
        WebkitMaskImage: 'linear-gradient(to top right, black 15%, transparent 75%)',
      }}
    />
    {/* blurred colour washes */}
    <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-blue-100/70 blur-3xl" />
    <div className="absolute top-[38%] -right-40 w-[460px] h-[460px] rounded-full bg-indigo-100/60 blur-3xl" />
    <div className="absolute -bottom-40 left-1/4 w-[420px] h-[420px] rounded-full bg-sky-100/60 blur-3xl" />
    {/* thin rings */}
    <div className="absolute top-[22%] -left-24 w-72 h-72 rounded-full border border-blue-100" />
    <div className="absolute top-[22%] -left-12 w-48 h-48 rounded-full border border-blue-100/70" />
    <div className="absolute bottom-[18%] -right-20 w-80 h-80 rounded-full border border-indigo-100" />
    <div className="absolute bottom-[18%] -right-6 w-52 h-52 rounded-full border border-indigo-100/70" />
    {/* small floating accents */}
    <span className="absolute top-[30%] right-[12%] w-3 h-3 rounded-full bg-blue-200/80" />
    <span className="absolute top-[58%] left-[8%] w-2.5 h-2.5 rounded-full bg-indigo-200/80" />
    <span className="absolute bottom-[30%] right-[22%] w-2 h-2 rounded-full bg-sky-300/70" />
  </div>
);

const AVATAR_COLORS = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];

// One story as a timeline entry: a dot on the rail, a connector, and a full-width post card.
// On desktop the cover image sits on the left and the text on the right; on mobile it stacks like a feed post.
const StoryPost = ({ story }) => {
  const img = storyImage(story);
  const author = story.person_name || 'VCare Nursing';
  const date = formatStoryDate(story.display_date);
  const isVideo = !!story.youtube_video_id;
  const href = `/success-stories/${story.slug}`;
  const initials = author.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const color = AVATAR_COLORS[story.story_id % AVATAR_COLORS.length];
  // With a cover the text takes the right-hand side; without one it spans the card.
  const textCols = img ? 'md:col-start-6 md:col-span-7' : 'md:col-span-12';

  return (
    <div className="relative">
      {/* rail dot + connector */}
      <span className="absolute -left-8 sm:-left-10 top-[30px] w-4 h-4 rounded-full bg-white border-[4px] border-blue-500 shadow-[0_0_0_4px_rgba(219,234,254,0.9)] z-10" aria-hidden="true" />
      <span className="absolute -left-4 sm:-left-6 top-[37px] w-4 sm:w-6 h-0.5 bg-blue-200" aria-hidden="true" />

      <article className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:shadow-slate-200/70 transition-shadow overflow-hidden md:grid md:grid-cols-12 md:grid-rows-[auto_1fr_auto]">
        <div className={`flex items-center gap-3 px-5 pt-5 md:px-8 md:pt-7 ${textCols}`}>
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${color}`}>{initials || 'V'}</div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-[15px] truncate">{author}</p>
            <p className="text-xs text-slate-500">{date || 'Success story'}{isVideo && ' · Video'}</p>
          </div>
        </div>

        <div className={`px-5 pt-4 pb-4 md:px-8 ${textCols}`}>
          <Link to={href} className="block group">
            <h2 className="text-xl sm:text-2xl md:text-[28px] font-bold text-slate-900 leading-snug group-hover:text-blue-600 transition-colors">{story.title}</h2>
          </Link>
          {story.summary && <p className="mt-3 text-slate-700 leading-relaxed line-clamp-3">{story.summary}</p>}
          {story.excerpt && (
            <p className="mt-3 pl-4 border-l-2 border-blue-200 text-slate-500 text-[15px] leading-relaxed line-clamp-4">
              {story.excerpt}
            </p>
          )}
        </div>

        {img && (
          <Link
            to={href}
            aria-label={story.title}
            className="group relative block bg-slate-100 aspect-[16/10] md:aspect-auto md:min-h-[260px] md:col-span-5 md:col-start-1 md:row-start-1 md:row-span-3 overflow-hidden"
          >
            <img src={img} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
            {isVideo && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
                  <Play className="w-7 h-7 text-blue-600 fill-blue-600 ml-1" />
                </span>
              </span>
            )}
          </Link>
        )}

        <div className={`px-5 py-3.5 md:px-8 md:py-4 flex items-center justify-between border-t border-slate-100 ${textCols}`}>
          <span className="text-sm text-slate-500">{isVideo ? 'Video story' : 'Article'}</span>
          <Link to={href} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
            {isVideo ? 'Watch story' : 'Read story'} <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </article>
    </div>
  );
};

// Wraps the entries with the vertical rail (a gradient line with a dot at each end).
const Timeline = ({ children }) => (
  <div className="relative pl-8 sm:pl-10">
    <span className="absolute left-[7px] sm:left-[15px] top-2 bottom-2 w-0.5 rounded-full bg-gradient-to-b from-blue-200 via-blue-300 to-blue-100" aria-hidden="true" />
    <span className="absolute left-[4px] sm:left-[12px] top-0 w-2 h-2 rounded-full bg-blue-300" aria-hidden="true" />
    <span className="absolute left-[4px] sm:left-[12px] bottom-0 w-2 h-2 rounded-full bg-blue-200" aria-hidden="true" />
    <div className="space-y-8">{children}</div>
  </div>
);

const SuccessStoriesPage = () => {
  const [stories, setStories] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (nextPage) => {
    try {
      if (nextPage === 1) setLoading(true);
      else setLoadingMore(true);
      setError('');
      const res = await apiClient.getPublicSuccessStories({ page: nextPage, limit: PAGE_SIZE });
      setStories((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data]));
      setHasMore(!!res.pagination?.hasMore);
      setPage(nextPage);
    } catch {
      setError('We could not load the success stories right now. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    document.title = 'Success Stories | VCare Nursing';
    load(1);
  }, [load]);

  const filtered = useMemo(() => stories.filter((s) => {
    if (filter === 'video') return !!s.youtube_video_id;
    if (filter === 'article') return !s.youtube_video_id;
    return true;
  }), [stories, filter]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navbar />
      <main className="relative pt-32 pb-24 overflow-hidden">
        <Decor />

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <header className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-block px-3 py-1 mb-4 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
              Success stories
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight mb-4">
              Care that changed <span className="text-blue-600">everyday life</span>
            </h1>
            <p className="text-lg text-slate-600">
              Real experiences from the families and people VCare has had the privilege to care for.
            </p>
          </header>

          <div className="flex justify-center gap-2 flex-wrap mb-10" role="tablist" aria-label="Filter stories">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
                  filter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <Timeline>
              {[...Array(3)].map((_, i) => <div key={i} className="h-[300px] rounded-3xl bg-slate-100 animate-pulse" />)}
            </Timeline>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-slate-600 mb-4">{error}</p>
              <button onClick={() => load(1)} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">Try again</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <Newspaper className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-lg">
                {stories.length === 0
                  ? 'No success stories have been published yet. Please check back soon.'
                  : 'No stories match this filter yet.'}
              </p>
            </div>
          ) : (
            <>
              <Timeline>
                {filtered.map((s) => <StoryPost key={s.story_id} story={s} />)}
              </Timeline>
              {hasMore && (
                <div className="text-center mt-12">
                  <button
                    onClick={() => load(page + 1)}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-8 py-3.5 border border-slate-300 bg-white rounded-full text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more stories
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SuccessStoriesPage;
