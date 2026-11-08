import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Play, Clock, Calendar, Link2, Check, Share2, HeartHandshake } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import StoryContent from '../../components/common/StoryContent';
import StoryCard from './components/StoryCard';
import apiClient from '../../api/api';
import { formatStoryDate, youtubeThumb, readingMinutes } from '../../utils/storyFormat';

const dotGrid = (color, fade) => ({
  backgroundImage: `radial-gradient(${color} 1.5px, transparent 1.5px)`,
  backgroundSize: '22px 22px',
  maskImage: fade,
  WebkitMaskImage: fade,
});

// Thin bar under the navbar that fills as the visitor scrolls through the page.
const ReadingProgress = () => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-[60] pointer-events-none" aria-hidden="true">
      <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${pct}%` }} />
    </div>
  );
};

// Click-to-play: nothing from YouTube loads until the visitor presses play.
const VideoEmbed = ({ videoId, title }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative aspect-video bg-black">
      {playing ? (
        <iframe
          title={title}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 w-full h-full" aria-label={`Play video: ${title}`}>
          <img src={youtubeThumb(videoId)} alt="" className="w-full h-full object-cover" />
          <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-24 h-24 rounded-full bg-white/95 flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
              <Play className="w-10 h-10 text-blue-600 fill-blue-600 ml-1" />
            </span>
          </span>
        </button>
      )}
    </div>
  );
};

// Quiet page backdrop: thin outlined shapes and faint heartbeat lines only.
const PageBackdrop = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {/* concentric dashed arcs */}
    <div className="absolute top-[18%] -right-24 w-80 h-80 rounded-full border-2 border-dashed border-blue-200" />
    <div className="absolute top-[18%] -right-8 w-52 h-52 rounded-full border border-blue-100" />
    <div className="absolute top-[52%] -left-28 w-96 h-96 rounded-full border-2 border-dashed border-indigo-200" />
    <div className="absolute top-[52%] -left-10 w-60 h-60 rounded-full border border-indigo-100" />
    {/* rotated squares */}
    <div className="absolute top-[40%] right-[5%] w-24 h-24 rounded-3xl border-2 border-blue-200 rotate-12" />
    <div className="absolute top-[74%] left-[6%] w-20 h-20 rounded-2xl border-2 border-indigo-200 -rotate-12" />
    {/* heartbeat lines */}
    <svg className="absolute top-[26%] left-0 w-full h-24 text-blue-200/60" viewBox="0 0 1200 96" preserveAspectRatio="none" fill="none">
      <path d="M0 52 H380 L410 52 L430 18 L458 84 L482 30 L498 52 H1200" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <svg className="absolute top-[68%] left-0 w-full h-24 text-indigo-200/50" viewBox="0 0 1200 96" preserveAspectRatio="none" fill="none">
      <path d="M0 52 H700 L730 52 L750 20 L778 82 L802 32 L818 52 H1200" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

const ShareRow = ({ stacked = false }) => {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: nothing to do */ }
  };
  return (
    <div className={stacked ? 'flex flex-col items-stretch gap-3' : 'flex flex-wrap items-center gap-3'}>
      <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"><Share2 className="w-4 h-4" /> Share this story</span>
      <button onClick={copy} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 transition-colors">
        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Link2 className="w-4 h-4" />} {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
};

const SuccessStoryDetailPage = () => {
  const { slug } = useParams();
  // The result is tagged with the slug it was fetched for, so "loading" is simply
  // "we don't have a result for the current slug yet".
  const [result, setResult] = useState({ slug: null, story: null, related: [], notFound: false, error: '' });
  const loading = result.slug !== slug;
  const { story, related, notFound, error } = result;

  useEffect(() => {
    let cancelled = false;
    window.scrollTo(0, 0);
    apiClient.getPublicSuccessStory(slug)
      .then((res) => {
        if (cancelled) return;
        setResult({ slug, story: res.data, related: res.related || [], notFound: false, error: '' });
        document.title = `${res.data.title} | VCare Nursing`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta && res.data.summary) meta.setAttribute('content', res.data.summary);
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({
          slug, story: null, related: [], notFound: err.status === 404,
          error: err.status === 404 ? '' : 'We could not load this story right now. Please try again.',
        });
      });
    return () => { cancelled = true; };
  }, [slug]);

  const ready = !loading && story;
  const isVideo = !!story?.youtube_video_id;
  const author = story?.person_name || 'VCare Nursing';
  const minutes = ready ? readingMinutes(story.content_html) : null;
  const initials = author.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-[#F3F7FF] text-slate-900">
      <Navbar />
      <ReadingProgress />

      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-800 text-white pt-32 pb-48 md:pb-60">
        {ready && story.cover_image_url && (
          <img src={story.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-luminosity scale-110 blur-sm" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950/60 via-transparent to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-20 right-0 w-[420px] h-[300px] opacity-40" style={dotGrid('#93c5fd', 'linear-gradient(to bottom left, black 20%, transparent 75%)')} />
          <div className="absolute -bottom-24 left-0 w-[380px] h-[260px] opacity-30" style={dotGrid('#a5b4fc', 'linear-gradient(to top right, black 20%, transparent 75%)')} />
          <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full bg-blue-500/30 blur-3xl" />
          <div className="absolute top-10 -right-32 w-[380px] h-[380px] rounded-full bg-indigo-400/30 blur-3xl" />
          <div className="absolute top-[30%] -left-20 w-72 h-72 rounded-full border border-white/10" />
          <div className="absolute top-[30%] -left-8 w-48 h-48 rounded-full border border-white/10" />
          <div className="absolute bottom-10 right-[8%] w-64 h-64 rounded-full border border-white/10" />
        </div>

        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
          <Link to="/success-stories" className="inline-flex items-center gap-2 text-sm font-medium text-blue-100 hover:text-white mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> All success stories
          </Link>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-5 w-32 bg-white/20 rounded-full" />
              <div className="h-12 w-3/4 bg-white/20 rounded-xl" />
              <div className="h-5 w-1/2 bg-white/15 rounded" />
            </div>
          ) : ready ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-bold uppercase tracking-wider">
                  <HeartHandshake className="w-3.5 h-3.5" /> Success story
                </span>
                {isVideo && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-bold uppercase tracking-wider"><Play className="w-3 h-3 fill-white" /> Video</span>}
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight mb-6 max-w-5xl">{story.title}</h1>
              {story.summary && <p className="text-lg md:text-xl text-blue-100 leading-relaxed max-w-3xl mb-8">{story.summary}</p>}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-full bg-white/20 ring-2 ring-white/30 flex items-center justify-center text-sm font-bold">{initials || 'V'}</span>
                  <div>
                    <p className="font-semibold leading-tight">{author}</p>
                    <p className="text-xs text-blue-200">Shared with VCare Nursing</p>
                  </div>
                </div>
                {story.display_date && (
                  <span className="inline-flex items-center gap-2 text-sm text-blue-100"><Calendar className="w-4 h-4" /> {formatStoryDate(story.display_date)}</span>
                )}
                {minutes && (
                  <span className="inline-flex items-center gap-2 text-sm text-blue-100"><Clock className="w-4 h-4" /> {minutes} min read</span>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* wave into the page below */}
        <svg className="absolute bottom-0 left-0 w-full h-16 md:h-24 text-[#F3F7FF]" viewBox="0 0 1440 96" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">
          <path d="M0 64 C 240 0, 480 96, 720 56 S 1200 8, 1440 48 V96 H0 Z" />
        </svg>
      </header>

      {/* Body, overlapping the hero */}
      <main className="relative pb-24">
        <PageBackdrop />

        <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 -mt-32 md:-mt-44">
          {loading ? (
            <div className="rounded-[32px] bg-white shadow-xl h-[420px] animate-pulse" />
          ) : notFound ? (
            <div className="rounded-[32px] bg-white shadow-xl text-center py-20 px-6">
              <h1 className="text-3xl font-bold mb-3">This story isn&apos;t available</h1>
              <p className="text-slate-600 mb-6">It may have been removed or the link is incorrect.</p>
              <Link to="/success-stories" className="inline-flex px-6 py-3 bg-blue-600 text-white rounded-full font-semibold hover:bg-blue-700 transition-colors">Browse all stories</Link>
            </div>
          ) : error ? (
            <div className="rounded-[32px] bg-white shadow-xl text-center py-20 px-6 text-slate-600">{error}</div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
              {/* Main column */}
              <div className="min-w-0 space-y-8">
                {(isVideo || story.cover_image_url) && (
                  <div className="rounded-[32px] overflow-hidden shadow-2xl shadow-blue-900/20 ring-8 ring-white/60 bg-white">
                    {isVideo
                      ? <VideoEmbed videoId={story.youtube_video_id} title={story.title} />
                      : <img src={story.cover_image_url} alt={story.title} className="w-full max-h-[620px] object-cover" />}
                  </div>
                )}

                {story.content_html && (
                  <article className="relative bg-white rounded-[32px] shadow-xl shadow-blue-900/10 border border-white px-6 sm:px-10 md:px-14 py-10 md:py-14 overflow-hidden">
                    <span className="absolute left-0 top-12 bottom-12 w-1.5 rounded-r-full bg-gradient-to-b from-blue-400 via-indigo-400 to-blue-200" aria-hidden="true" />
                    <StoryContent html={story.content_html} className="relative story-dropcap md:text-[1.125rem]" />
                  </article>
                )}
              </div>

              {/* Sidebar */}
              <aside className="space-y-6 lg:sticky lg:top-28">
                <div className="bg-white rounded-[28px] shadow-xl shadow-blue-900/10 border border-white p-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-4">About this story</p>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold">{initials || 'V'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{author}</p>
                      <p className="text-xs text-slate-500">Shared with VCare Nursing</p>
                    </div>
                  </div>
                  <dl className="space-y-3 text-sm">
                    {story.display_date && (
                      <div className="flex items-center justify-between gap-3"><dt className="inline-flex items-center gap-2 text-slate-500"><Calendar className="w-4 h-4" /> Date</dt><dd className="font-medium text-slate-800">{formatStoryDate(story.display_date)}</dd></div>
                    )}
                    {minutes && (
                      <div className="flex items-center justify-between gap-3"><dt className="inline-flex items-center gap-2 text-slate-500"><Clock className="w-4 h-4" /> Reading time</dt><dd className="font-medium text-slate-800">{minutes} min</dd></div>
                    )}
                    <div className="flex items-center justify-between gap-3"><dt className="inline-flex items-center gap-2 text-slate-500"><HeartHandshake className="w-4 h-4" /> Format</dt><dd className="font-medium text-slate-800">{isVideo ? (story.content_html ? 'Video + article' : 'Video') : 'Article'}</dd></div>
                  </dl>
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <ShareRow stacked />
                  </div>
                </div>

                <section className="relative rounded-[28px] overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-7">
                  <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                  <div className="absolute bottom-0 right-0 w-44 h-36 opacity-30" style={dotGrid('#dbeafe', 'linear-gradient(to top left, black 20%, transparent 80%)')} aria-hidden="true" />
                  <div className="relative">
                    <h2 className="text-xl font-semibold mb-2">Care that feels like family</h2>
                    <p className="text-blue-100 text-sm leading-relaxed mb-5">Tell us what your loved one needs and we&apos;ll match you with a vetted, caring professional.</p>
                    <div className="flex flex-col gap-2.5">
                      <Link to="/" state={{ scrollTo: 'services' }} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-blue-700 rounded-full text-sm font-semibold hover:bg-blue-50 transition-colors">
                        Find care now <ArrowRight className="w-4 h-4" />
                      </Link>
                      <Link to="/success-stories" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-white/40 text-white rounded-full text-sm font-semibold hover:bg-white/10 transition-colors">
                        More stories
                      </Link>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          )}
        </div>

        {ready && related.length > 0 && (
          <div className="relative max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 mt-24">
            <div className="flex items-end justify-between gap-4 mb-8">
              <h2 className="text-2xl md:text-3xl font-semibold text-slate-900">Keep reading</h2>
              <Link to="/success-stories" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                View all <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {related.map((s) => <StoryCard key={s.story_id} story={s} />)}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default SuccessStoryDetailPage;
