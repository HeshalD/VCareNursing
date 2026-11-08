import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Loader2, AlertCircle, CheckCircle2, Trash2, ExternalLink } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import RichTextEditor from './RichTextEditor';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import apiClient from '../../../api/api';
import { youtubeThumb } from '../../../utils/storyFormat';

// Mirrors the server's YouTube parsing so the admin sees a live preview before saving.
const parseYoutubeId = (input) => {
  const value = (input || '').trim();
  if (!value) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?]+)/)?.[1] || null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
};

const EMPTY = {
  title: '', summary: '', person_name: '', display_date: '', cover_image_url: '', youtube_url: '', content_html: '',
};

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
  </label>
);

const inputClass = 'w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

const AdminSuccessStoryEditorPage = () => {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { adminToken, hasPermission } = useAdminAuth();
  const canEdit = hasPermission?.('STORY_CREATE_EDIT');
  const canPublish = hasPermission?.('STORY_PUBLISH');
  const isNew = !storyId;

  const [form, setForm] = useState(EMPTY);
  const [meta, setMeta] = useState(null); // slug / status of a saved story
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const coverRef = useRef(null);

  useEffect(() => {
    if (isNew || !adminToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        apiClient.setToken(adminToken);
        const res = await apiClient.getAdminSuccessStory(storyId);
        if (cancelled) return;
        const s = res.data;
        setForm({
          title: s.title || '',
          summary: s.summary || '',
          person_name: s.person_name || '',
          display_date: s.display_date ? String(s.display_date).slice(0, 10) : '',
          cover_image_url: s.cover_image_url || '',
          youtube_url: s.youtube_video_id ? `https://youtu.be/${s.youtube_video_id}` : '',
          content_html: s.content_html || '',
        });
        setMeta({ slug: s.slug, status: s.status, is_archived: s.is_archived });
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load the story.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, storyId, adminToken]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
  };

  const youtubeId = parseYoutubeId(form.youtube_url);
  const youtubeInvalid = form.youtube_url.trim() !== '' && !youtubeId;
  const isPublished = meta?.status === 'PUBLISHED';

  const uploadImage = async (file) => {
    apiClient.setToken(adminToken);
    const res = await apiClient.uploadSuccessStoryImage(file);
    return res.url;
  };

  const handleCover = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploadingCover(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, cover_image_url: url }));
      setDirty(true);
    } catch (err) {
      setError(err.message || 'Cover image upload failed.');
    } finally {
      setUploadingCover(false);
    }
  };

  // Saves the story (create or update). Returns the saved row, or null if it failed.
  const save = async () => {
    if (!form.title.trim()) { setError('Please enter a title.'); return null; }
    if (youtubeInvalid) { setError('That does not look like a valid YouTube link.'); return null; }
    setSaving(true);
    setError('');
    try {
      apiClient.setToken(adminToken);
      const res = isNew
        ? await apiClient.createSuccessStory(form)
        : await apiClient.updateSuccessStory(storyId, form);
      setMeta({ slug: res.data.slug, status: res.data.status, is_archived: res.data.is_archived });
      setDirty(false);
      return res.data;
    } catch (err) {
      setError(err.message || 'Failed to save the story.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const saved = await save();
    if (!saved) return;
    if (isNew) navigate(`/admin/success-stories/${saved.story_id}`, { replace: true });
    else {
      setNotice('Saved.');
      setTimeout(() => setNotice(''), 3000);
    }
  };

  const handlePublishToggle = async () => {
    const saved = await save();
    if (!saved) return;
    setSaving(true);
    try {
      apiClient.setToken(adminToken);
      const res = await apiClient.setSuccessStoryPublished(saved.story_id, !isPublished);
      setMeta({ slug: res.data.slug, status: res.data.status, is_archived: res.data.is_archived });
      if (isNew) navigate(`/admin/success-stories/${saved.story_id}`, { replace: true });
      setNotice(res.data.status === 'PUBLISHED' ? 'Story published.' : 'Story unpublished.');
      setTimeout(() => setNotice(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to change publish status.');
      if (isNew) navigate(`/admin/success-stories/${saved.story_id}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const leave = (e) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  };

  return (
    <AdminLayout title={isNew ? 'New success story' : 'Edit success story'} subtitle="Write an article, add a YouTube video, or both">
      <div className="max-w-4xl">
        <Link to="/admin/success-stories" onClick={leave} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to stories
        </Link>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="w-4 h-4" /> {notice}
          </div>
        )}

        {!canEdit ? (
          <p className="text-slate-500">You don&apos;t have permission to edit success stories.</p>
        ) : loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <Field label="Title">
                <input value={form.title} onChange={update('title')} maxLength={200} className={inputClass} placeholder="e.g. A mother's peace of mind" />
              </Field>
              <Field label="Short summary" hint="Shown on story cards and in search results. Up to 600 characters.">
                <textarea value={form.summary} onChange={update('summary')} maxLength={600} rows={3} className={inputClass} />
              </Field>
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Client / author name" hint="Optional. For example a first name, or 'The Perera family'.">
                  <input value={form.person_name} onChange={update('person_name')} maxLength={150} className={inputClass} />
                </Field>
                <Field label="Display date">
                  <input type="date" value={form.display_date} onChange={update('display_date')} className={inputClass} />
                </Field>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Cover image</span>
                {form.cover_image_url ? (
                  <div className="relative w-full max-w-md">
                    <img src={form.cover_image_url} alt="Cover" className="w-full aspect-[16/10] object-cover rounded-xl border border-slate-200" />
                    <button
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, cover_image_url: '' })); setDirty(true); }}
                      className="absolute top-2 right-2 p-2 rounded-lg bg-white/95 text-red-600 shadow hover:bg-white"
                      aria-label="Remove cover image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => coverRef.current?.click()}
                    disabled={uploadingCover}
                    className="w-full max-w-md aspect-[16/10] border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    {uploadingCover ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
                    <span className="text-sm font-medium">{uploadingCover ? 'Uploading…' : 'Upload cover image'}</span>
                    <span className="text-xs">JPG, PNG or WebP, up to 5 MB</span>
                  </button>
                )}
                <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCover} />
                {!form.cover_image_url && youtubeId && (
                  <p className="text-xs text-slate-500 mt-2">No cover image uploaded, so the YouTube video&apos;s thumbnail will be used as the cover.</p>
                )}
              </div>

              <Field label="YouTube video link" hint="Optional. Paste a normal, short (youtu.be) or Shorts link.">
                <input value={form.youtube_url} onChange={update('youtube_url')} className={`${inputClass} ${youtubeInvalid ? 'border-red-400' : ''}`} placeholder="https://www.youtube.com/watch?v=…" />
              </Field>
              {youtubeInvalid && <p className="text-sm text-red-600 -mt-3">That does not look like a valid YouTube link.</p>}
              {youtubeId && (
                <div className="max-w-md">
                  <img src={youtubeThumb(youtubeId)} alt="Video thumbnail" className="w-full aspect-video object-cover rounded-xl border border-slate-200" />
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Article</span>
              <RichTextEditor
                value={form.content_html}
                onChange={(html) => { setForm((f) => ({ ...f, content_html: html })); setDirty(true); }}
                onUploadImage={uploadImage}
              />
              <p className="text-xs text-slate-500 mt-2">A story needs an article, a video, or both before it can be published.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-slate-50/90 backdrop-blur py-4 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {isPublished ? 'Save changes' : 'Save draft'}
              </button>
              {canPublish && !meta?.is_archived && (
                <button
                  onClick={handlePublishToggle}
                  disabled={saving}
                  className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {isPublished ? 'Unpublish' : 'Save & publish'}
                </button>
              )}
              {isPublished && meta?.slug && (
                <a href={`/success-stories/${meta.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                  View on site <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {dirty && <span className="text-sm text-amber-600">Unsaved changes</span>}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSuccessStoryEditorPage;
