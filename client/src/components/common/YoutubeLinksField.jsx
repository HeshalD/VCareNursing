import React, { useState } from 'react';
import { X, Plus, Youtube } from 'lucide-react';

const isLikelyYoutubeUrl = (url) => /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url.trim());

// Admin-only add/remove list of YouTube video URLs. `value` is an array of URL strings.
const YoutubeLinksField = ({ value = [], onChange, className = '' }) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const links = Array.isArray(value) ? value : [];

  const addLink = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isLikelyYoutubeUrl(trimmed)) {
      setError('Enter a valid YouTube link (youtube.com or youtu.be).');
      return;
    }
    if (links.includes(trimmed)) {
      setError('This link has already been added.');
      return;
    }
    onChange([...links, trimmed]);
    setDraft('');
    setError('');
  };

  const removeLink = (url) => onChange(links.filter(l => l !== url));

  return (
    <div className={className}>
      {links.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2.5">
          {links.map((url) => (
            <div key={url} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <Youtube className="w-4 h-4 text-red-500 flex-shrink-0" />
              <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate font-medium text-slate-700 hover:text-blue-600">
                {url}
              </a>
              <button type="button" onClick={() => removeLink(url)} className="flex-shrink-0 text-red-500 hover:text-red-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
          placeholder="https://www.youtube.com/watch?v=..."
          className={`flex-1 px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-400 transition-colors ${
            error ? 'border-red-400 bg-red-50 focus:ring-red-100' : 'border-slate-200 focus:ring-blue-100'
          }`}
        />
        <button
          type="button"
          onClick={addLink}
          className="inline-flex items-center gap-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
};

export default YoutubeLinksField;
