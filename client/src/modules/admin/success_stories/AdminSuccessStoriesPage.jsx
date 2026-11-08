import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Archive, ArchiveRestore, Star, ArrowUp, ArrowDown, X, Play, Loader2, AlertCircle, CheckCircle2, ExternalLink, Newspaper,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import apiClient from '../../../api/api';
import { formatStoryDate, storyImage } from '../../../utils/storyFormat';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'On Success Stories page' },
  { key: 'draft', label: 'Drafts' },
  { key: 'featured', label: 'On landing page' },
  { key: 'archived', label: 'Archived' },
];

const isLive = (s) => s.status === 'PUBLISHED' && !s.is_archived;

// A labelled on/off switch button. Clicking it saves straight away.
const ToggleButton = ({ on, busy, disabled, title, icon: Icon, label, onClick, tone = 'blue' }) => {
  const onClass = tone === 'green'
    ? 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'
    : 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-pressed={on}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        on ? onClass : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className={`w-4 h-4 ${on ? 'fill-current' : ''}`} />}
      {label}
    </button>
  );
};

const AdminSuccessStoriesPage = () => {
  const navigate = useNavigate();
  const { adminToken, hasPermission } = useAdminAuth();
  const canEdit = hasPermission?.('STORY_CREATE_EDIT');
  const canPublish = hasPermission?.('STORY_PUBLISH');
  const canArchive = hasPermission?.('STORY_ARCHIVE');
  const canFeature = hasPermission?.('STORY_FEATURE');

  const [stories, setStories] = useState([]);
  const [maxFeatured, setMaxFeatured] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(null); // `${storyId}:${action}`

  const load = useCallback(async () => {
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.getAdminSuccessStories();
      setStories(res.data);
      setMaxFeatured(res.maxFeatured || 6);
    } catch (err) {
      setError(err.message || 'Failed to load stories.');
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { if (adminToken) load(); }, [adminToken, load]);

  // Landing-page stories, in display order.
  const featured = useMemo(
    () => stories.filter((s) => s.is_featured && isLive(s)).sort((a, b) => a.featured_order - b.featured_order),
    [stories]
  );

  const visible = useMemo(() => stories.filter((s) => {
    switch (filter) {
      case 'published': return isLive(s);
      case 'draft': return s.status === 'DRAFT' && !s.is_archived;
      case 'featured': return s.is_featured && isLive(s);
      case 'archived': return s.is_archived;
      default: return true;
    }
  }), [stories, filter]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  // Runs one action, then reloads so the screen always matches the database.
  const run = async (key, fn, okMessage) => {
    setBusy(key);
    setError('');
    try {
      apiClient.setToken(adminToken);
      await fn();
      await load();
      if (okMessage) flash(okMessage);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const toggleLanding = (s) => run(
    `${s.story_id}:landing`,
    () => apiClient.toggleSuccessStoryFeatured(s.story_id, !s.is_featured),
    s.is_featured ? 'Removed from the landing page.' : 'Now showing on the landing page.'
  );

  const toggleStoriesPage = (s) => run(
    `${s.story_id}:page`,
    () => apiClient.setSuccessStoryPublished(s.story_id, s.status !== 'PUBLISHED'),
    s.status === 'PUBLISHED' ? 'Removed from the Success Stories page.' : 'Added to the Success Stories page.'
  );

  const archive = (s) => {
    if (!s.is_archived && !window.confirm(`Archive "${s.title}"? It will be hidden from the public site and removed from the landing page.`)) return;
    run(`${s.story_id}:archive`, () => apiClient.setSuccessStoryArchived(s.story_id, !s.is_archived),
      s.is_archived ? 'Story restored as a draft.' : 'Story archived.');
  };

  const move = (index, delta) => {
    const ids = featured.map((s) => s.story_id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run('reorder', () => apiClient.setSuccessStoryFeatured(ids));
  };

  return (
    <AdminLayout
      title="Success Stories"
      subtitle="Articles and videos shown on the public Success Stories page"
      actions={canEdit && (
        <Link to="/admin/success-stories/new" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
          <Plus className="w-4 h-4" /> New story
        </Link>
      )}
    >
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss"><X className="w-4 h-4" /></button>
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4" /> {notice}
        </div>
      )}

      {/* Landing page order. Only needed to change the order; adding/removing is done per story below. */}
      <section className="mb-8 bg-white border border-slate-200 rounded-2xl p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-slate-900">Showing on the landing page ({featured.length} of {maxFeatured})</h2>
          <p className="text-sm text-slate-500">Use the arrows to change the order. Changes save automatically.</p>
        </div>
        {featured.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-4 py-3">
            Nothing is on the landing page yet, so its Success Stories section is hidden. Press &ldquo;Landing page&rdquo; on a story below to add it.
          </p>
        ) : (
          <ol className="space-y-2">
            {featured.map((s, i) => (
              <li key={s.story_id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{s.title}</span>
                {canFeature && (
                  <>
                    <button onClick={() => move(i, -1)} disabled={i === 0 || busy === 'reorder'} aria-label="Move up" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === featured.length - 1 || busy === 'reorder'} aria-label="Move down" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              filter === f.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Stories */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center text-slate-500">
          {stories.length === 0 ? 'No stories yet. Create the first one.' : 'No stories match this filter.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {visible.map((s) => {
            const img = storyImage(s);
            const onPage = isLive(s);
            return (
              <div key={s.story_id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="relative w-24 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                  {img && <img src={img} alt="" className="w-full h-full object-cover" />}
                  {s.youtube_video_id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/25"><Play className="w-5 h-5 text-white fill-white" /></span>
                  )}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <button
                    onClick={() => canEdit && navigate(`/admin/success-stories/${s.story_id}`)}
                    className="text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
                  >
                    {s.title}
                  </button>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                    {s.is_archived && <span className="px-2.5 py-1 rounded-full font-medium bg-slate-200 text-slate-700">Archived</span>}
                    {!s.is_archived && s.status === 'DRAFT' && <span className="px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-800">Draft</span>}
                    {s.person_name && <span>{s.person_name}</span>}
                    {s.display_date && <span>{formatStoryDate(s.display_date)}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canPublish && !s.is_archived && (
                    <ToggleButton
                      tone="green"
                      icon={Newspaper}
                      on={s.status === 'PUBLISHED'}
                      busy={busy === `${s.story_id}:page`}
                      label="Success Stories page"
                      title={s.status === 'PUBLISHED' ? 'Showing on the Success Stories page. Click to remove.' : 'Click to add to the Success Stories page'}
                      onClick={() => toggleStoriesPage(s)}
                    />
                  )}
                  {canFeature && !s.is_archived && (
                    <ToggleButton
                      icon={Star}
                      on={s.is_featured && onPage}
                      busy={busy === `${s.story_id}:landing`}
                      disabled={!onPage}
                      label="Landing page"
                      title={!onPage ? 'Add it to the Success Stories page first' : s.is_featured ? 'Showing on the landing page. Click to remove.' : 'Click to show on the landing page'}
                      onClick={() => toggleLanding(s)}
                    />
                  )}
                  {onPage && (
                    <a href={`/success-stories/${s.slug}`} target="_blank" rel="noopener noreferrer" title="View on site" aria-label="View on site" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><ExternalLink className="w-4 h-4" /></a>
                  )}
                  {canEdit && (
                    <Link to={`/admin/success-stories/${s.story_id}`} title="Edit" aria-label="Edit" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Pencil className="w-4 h-4" /></Link>
                  )}
                  {canArchive && (
                    <button
                      disabled={busy === `${s.story_id}:archive`}
                      onClick={() => archive(s)}
                      title={s.is_archived ? 'Restore' : 'Archive'}
                      aria-label={s.is_archived ? 'Restore' : 'Archive'}
                      className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {s.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminSuccessStoriesPage;
