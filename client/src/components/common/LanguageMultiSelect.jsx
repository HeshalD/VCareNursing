import React, { useState, useRef, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { LANGUAGES } from '../../data/languages';

// Chip-based language picker. `value` is an array of language name strings.
// Search/select from the bundled LANGUAGES list, or type a custom one and add it.
const LanguageMultiSelect = ({ value = [], onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const selected = Array.isArray(value) ? value : [];

  const addLanguage = (lang) => {
    const trimmed = lang.trim();
    if (!trimmed) return;
    if (selected.some(l => l.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...selected, trimmed]);
    setQuery('');
  };

  const removeLanguage = (lang) => {
    onChange(selected.filter(l => l !== lang));
  };

  const filtered = LANGUAGES.filter(l =>
    !selected.some(s => s.toLowerCase() === l.toLowerCase()) &&
    l.toLowerCase().includes(query.trim().toLowerCase())
  );

  const canAddCustom = query.trim().length > 0 &&
    !LANGUAGES.some(l => l.toLowerCase() === query.trim().toLowerCase()) &&
    !selected.some(l => l.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selected.length === 0 && (
          <span className="text-xs text-slate-400">No languages selected</span>
        )}
        {selected.map(lang => (
          <span key={lang} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium rounded-full">
            {lang}
            <button type="button" onClick={() => removeLanguage(lang)} className="hover:text-blue-900">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && canAddCustom) {
              e.preventDefault();
              addLanguage(query);
            }
          }}
          placeholder="Search or add a language..."
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
        />
      </div>

      {open && (filtered.length > 0 || canAddCustom) && (
        <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtered.map(lang => (
            <button
              key={lang}
              type="button"
              onClick={() => addLanguage(lang)}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {lang}
            </button>
          ))}
          {canAddCustom && (
            <button
              type="button"
              onClick={() => addLanguage(query)}
              className="w-full flex items-center gap-1.5 text-left px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors border-t border-slate-100"
            >
              <Plus className="w-3.5 h-3.5" /> Add "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default LanguageMultiSelect;
