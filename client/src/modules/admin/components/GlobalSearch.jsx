import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Users, UserCog, Settings, HeartPulse, CalendarDays, SendHorizontal, FileText,
  ReceiptText, ArrowLeftRight, Receipt, Truck, Package, Clock, CornerDownLeft, Loader2, Compass,
} from 'lucide-react';
import apiClient from '../../../api/api';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const MAX_CACHED_QUERIES = 50;
const RECENTS_KEY = 'adminSearchRecents';
const MAX_RECENTS = 8;
const MAX_PAGE_HITS = 5;

const TYPE_ICONS = {
  clients: Users, staff: UserCog, internal_staff: Settings, patients: HeartPulse, bookings: CalendarDays,
  service_requests: SendHorizontal, quotations: FileText, invoices: ReceiptText, statements: FileText,
  transactions: ArrowLeftRight, receipts: Receipt, vendors: Truck, products: Package, page: Compass,
};

// Repeated searches (backspacing, re-typing) show instantly from memory while a fresh request refreshes them.
const resultCache = new Map();
const NO_GROUPS = [];

const readRecents = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENTS_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const writeRecents = (list) => {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private window etc.) - recents are a convenience only
  }
};

const isTypingTarget = (el) =>
  !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

const Highlight = ({ text, term }) => {
  if (!text) return null;
  const needle = term.trim();
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at === -1) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-yellow-100 text-inherit rounded-sm">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
};

/**
 * Admin-wide search. `pages` is the list of sidebar destinations the current admin may open
 * ({label, path, section}) - they are matched client-side so navigation shortcuts feel instant.
 * The palette itself is a separate component so it mounts with fresh state on every open.
 */
const GlobalSearch = ({ pages = [] }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Global shortcuts: Ctrl/Cmd+K toggles from anywhere; "/" opens unless the user is typing somewhere.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {/* Header trigger: input-look on desktop, icon button on small screens */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-2 pl-3 pr-2 py-2 w-64 bg-slate-100 hover:bg-slate-200/70 rounded-lg text-sm text-slate-400 transition-colors"
        aria-label="Search"
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Search...</span>
        <kbd className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden text-slate-500 hover:text-slate-700 transition-colors"
        aria-label="Search"
      >
        <Search className="w-5 h-5" />
      </button>

      {open && <SearchPalette pages={pages} onClose={close} />}
    </>
  );
};

const SearchPalette = ({ pages, onClose }) => {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [fetched, setFetched] = useState({ query: '', groups: [], error: false });
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState(readRecents);
  const listRef = useRef(null);

  // Debounced fetch; each new keystroke aborts the in-flight request so stale results never land.
  // Cached answers render immediately (below) while this still refreshes them in the background.
  const query = term.trim();
  useEffect(() => {
    if (query.length < MIN_CHARS) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiClient.adminSearch(query, controller.signal);
        resultCache.set(query.toLowerCase(), data.groups || []);
        if (resultCache.size > MAX_CACHED_QUERIES) resultCache.delete(resultCache.keys().next().value);
        setFetched({ query, groups: data.groups || [], error: false });
      } catch (err) {
        if (err.name === 'AbortError') return;
        setFetched({ query, groups: [], error: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const fetchedForQuery = fetched.query === query;
  const cachedGroups = query.length >= MIN_CHARS ? resultCache.get(query.toLowerCase()) : undefined;
  const groups = fetchedForQuery ? fetched.groups : (cachedGroups || NO_GROUPS);
  const error = fetchedForQuery && fetched.error;
  const loading = query.length >= MIN_CHARS && !fetchedForQuery && !cachedGroups;

  const pageHits = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return pages
      .filter((p) => p.label.toLowerCase().includes(q) || (p.section || '').toLowerCase().includes(q))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)))
      .slice(0, MAX_PAGE_HITS)
      .map((p) => ({ type: 'page', id: p.path, title: p.label, subtitle: p.section || 'Page', url: p.path }));
  }, [pages, query]);

  // One flat, ordered list drives both rendering and keyboard navigation.
  const sections = useMemo(() => {
    if (!query) {
      return recents.length ? [{ key: 'recent', label: 'Recent', items: recents }] : [];
    }
    const record = groups.map((g) => ({ key: g.key, label: g.label, items: g.items }));
    if (!pageHits.length) return record;
    const pagesSection = { key: 'pages', label: 'Go to page', items: pageHits };
    const pageFirst = pageHits[0].title.toLowerCase().startsWith(query.toLowerCase());
    return pageFirst ? [pagesSection, ...record] : [...record, pagesSection];
  }, [query, recents, groups, pageHits]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  // Index of each section's first item within `flat`, so rows can tell which one is highlighted.
  const sectionOffsets = useMemo(
    () => sections.reduce((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + sections[i - 1].items.length], []),
    [sections],
  );
  const active = Math.min(activeIndex, Math.max(flat.length - 1, 0));

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, flat]);

  const choose = (item) => {
    if (!item) return;
    const entry = { type: item.type, id: item.id, title: item.title, subtitle: item.subtitle, url: item.url, inactive: item.inactive };
    writeRecents([entry, ...readRecents().filter((r) => r.url !== item.url)].slice(0, MAX_RECENTS));
    onClose();
    navigate(item.url);
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length) setActiveIndex((active + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length) setActiveIndex((active - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(flat[active]);
    }
  };

  const clearRecents = () => {
    writeRecents([]);
    setRecents([]);
  };

  const showNoResults = query.length >= MIN_CHARS && !loading && !error && flat.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center sm:pt-[10vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white w-full h-full sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-slate-200">
          {loading ? <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" /> : <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />}
          <input
            autoFocus
            value={term}
            onChange={(e) => { setTerm(e.target.value); setActiveIndex(0); }}
            onKeyDown={onInputKeyDown}
            placeholder="Search clients, staff, codes, phone numbers, invoices..."
            className="flex-1 py-4 text-base outline-none bg-transparent placeholder:text-slate-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close search">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto py-2">
          {!query && !recents.length && (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              Search by name, code (e.g. CL-00001, BK-00004), phone number, invoice or statement.
            </p>
          )}
          {query && query.length < MIN_CHARS && (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Type at least {MIN_CHARS} characters.</p>
          )}
          {error && <p className="px-4 py-10 text-center text-sm text-red-500">Search failed. Check your connection and try again.</p>}
          {showNoResults && <p className="px-4 py-10 text-center text-sm text-slate-400">No results for "{query}".</p>}

          {sections.map((section, sectionIdx) => (
            <div key={section.key} className="mb-1">
              <div className="flex items-center justify-between px-4 pt-2 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section.label}</span>
                {section.key === 'recent' && (
                  <button type="button" onClick={clearRecents} className="text-[11px] text-slate-400 hover:text-slate-600">Clear</button>
                )}
              </div>
              {section.items.map((item, itemIdx) => {
                const index = sectionOffsets[sectionIdx] + itemIdx;
                const isActive = index === active;
                const Icon = section.key === 'recent' ? Clock : (TYPE_ICONS[item.type] || FileText);
                return (
                  <button
                    type="button"
                    key={`${item.type}:${item.id}:${index}`}
                    data-active={isActive}
                    onClick={() => choose(item)}
                    onMouseMove={() => isActive || setActiveIndex(index)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left ${isActive ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-medium truncate ${item.inactive ? 'text-slate-400' : 'text-slate-900'}`}>
                        <Highlight text={item.title} term={query} />
                      </span>
                      {item.subtitle && (
                        <span className="block text-xs text-slate-500 truncate">
                          <Highlight text={item.subtitle} term={query} />
                        </span>
                      )}
                    </span>
                    {item.inactive && <span className="text-[10px] font-semibold uppercase text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Inactive</span>}
                    {item.badge && <span className="text-[10px] font-semibold uppercase text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">{item.badge}</span>}
                    {isActive && <CornerDownLeft className="w-4 h-4 text-slate-400 hidden sm:block flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400">
          <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
          <span><kbd className="font-semibold">Enter</kbd> open</span>
          <span><kbd className="font-semibold">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
