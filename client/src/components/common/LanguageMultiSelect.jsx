import React, { useState } from 'react';
import { Plus } from 'lucide-react';

const STANDARD_LANGUAGES = ['English', 'Sinhala', 'Tamil'];

// Checkbox language picker. `value` is an array of language name strings.
// English / Sinhala / Tamil are plain checkboxes; anything else is added as a custom
// language (shown as its own checked checkbox, uncheck to remove).
const LanguageMultiSelect = ({ value = [], onChange, className = '' }) => {
  const [custom, setCustom] = useState('');

  const selected = Array.isArray(value) ? value : [];
  const has = (lang) => selected.some(l => l.toLowerCase() === lang.toLowerCase());
  const customLanguages = selected.filter(
    l => !STANDARD_LANGUAGES.some(s => s.toLowerCase() === l.toLowerCase())
  );

  const toggle = (lang) => {
    if (has(lang)) onChange(selected.filter(l => l.toLowerCase() !== lang.toLowerCase()));
    else onChange([...selected, lang]);
  };

  const addCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    if (!has(trimmed)) onChange([...selected, trimmed]);
    setCustom('');
  };

  const checkbox = (lang) => (
    <label key={lang} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={has(lang)}
        onChange={() => toggle(lang)}
        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
      />
      {lang}
    </label>
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {STANDARD_LANGUAGES.map(checkbox)}
        {customLanguages.map(checkbox)}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Other language..."
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-colors"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
    </div>
  );
};

export default LanguageMultiSelect;
