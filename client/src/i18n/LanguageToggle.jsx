import React from 'react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from './index';

// EN / සිං toggle for the staff dashboard + worker registration flow.
// Persists the choice to localStorage so it survives across sessions.
const LanguageToggle = ({ className = '' }) => {
  const { i18n } = useTranslation();
  const current = i18n.language === 'si' ? 'si' : 'en';

  return (
    <div className={`inline-flex items-center rounded-full bg-slate-100 p-0.5 text-xs font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setAppLanguage('en')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          current === 'en' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setAppLanguage('si')}
        className={`px-2.5 py-1 rounded-full transition-colors ${
          current === 'si' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        සිං
      </button>
    </div>
  );
};

export default LanguageToggle;
