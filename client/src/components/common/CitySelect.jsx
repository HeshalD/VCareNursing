import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, MapPin, X } from 'lucide-react';
import apiClient from '../../api/api';

// The city list is small and static, so it is fetched once per page load and shared
// by every CitySelect on screen. A failed request is not cached so the next mount retries.
let citiesPromise = null;
const loadCities = () => {
  if (!citiesPromise) {
    citiesPromise = apiClient
      .getSriLankaCities()
      .then((res) => res.data || [])
      .catch((err) => {
        citiesPromise = null;
        throw err;
      });
  }
  return citiesPromise;
};

// Searchable picker for a Sri Lankan city, backed by the sl_cities master list.
//   value       city_id (number | string | null)
//   onChange    called with the whole city object ({ city_id, name, district, province,
//               latitude, longitude }) or null when cleared. Send city.city_id to the API.
//   legacyText  the old free-text location, shown as a hint while no city is selected so
//               existing records can be re-mapped by hand.
// `className` styles the trigger so it can match whichever form it sits in.
const CitySelect = ({
  value,
  onChange,
  legacyText = '',
  className = '',
  placeholder = 'Select city',
  required = false,
  disabled = false,
}) => {
  const [cities, setCities] = useState([]);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadCities()
      .then((list) => { if (!cancelled) setCities(list); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selected = useMemo(
    () => (value ? cities.find((c) => String(c.city_id) === String(value)) || null : null),
    [cities, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) => c.name.toLowerCase().includes(q) || c.district.toLowerCase().includes(q)
    );
  }, [cities, query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${highlight}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlight(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  const choose = (city) => {
    onChange(city);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>
          {selected ? `${selected.name}, ${selected.district}` : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && !required && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear city"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </span>
      </button>

      {/* Lets native form validation flag an empty required field. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={selected ? String(selected.city_id) : ''}
          onChange={() => {}}
          className="absolute inset-0 opacity-0 pointer-events-none"
        />
      )}

      {!selected && legacyText && (
        <p className="mt-1 text-xs text-amber-600">
          Current entry: &ldquo;{legacyText}&rdquo; &mdash; not from the list. Please pick the matching city.
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] bg-white border border-slate-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
              onKeyDown={onKeyDown}
              placeholder="Search city or district..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {loadError && (
              <li className="px-3 py-2 text-sm text-red-600">Could not load cities. Close and reopen to retry.</li>
            )}
            {!loadError && cities.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">Loading cities...</li>
            )}
            {!loadError && cities.length > 0 && filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">No matching city</li>
            )}
            {filtered.map((city, i) => {
              // Group header ("Colombo") whenever the district changes down the list.
              const header = i === 0 || filtered[i - 1].district !== city.district;
              return (
                <li key={city.city_id} role="presentation">
                  {header && (
                    <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {city.district} &middot; {city.province.replace(' Province', '')}
                    </div>
                  )}
                  <div
                    role="option"
                    aria-selected={selected?.city_id === city.city_id}
                    data-index={i}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(city)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${
                      i === highlight ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                    } ${selected?.city_id === city.city_id ? 'font-semibold' : ''}`}
                  >
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{city.name}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CitySelect;
