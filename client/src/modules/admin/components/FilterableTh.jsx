import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Filter } from 'lucide-react';

/**
 * Table header cell that opens a filter menu when clicked.
 *
 * options: [{ key, label, count? }] — the first option is treated as the
 * "no filter" choice (e.g. "All"), so the header is highlighted only when
 * something else is selected.
 * The menu is portalled to <body> so scrolling table wrappers don't clip it.
 */
const FilterableTh = ({ label, options, value, onChange, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const active = options.length > 0 && value !== options[0].key;

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 224;
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.left, window.innerWidth - menuWidth - 8)),
      });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <th className={className}>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Filter by ${label}`}
        className={`group inline-flex items-center gap-1 uppercase tracking-wide font-semibold transition-colors ${
          active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {label}
        {active
          ? <Filter className="w-3 h-3 fill-current" />
          : <ChevronDown className="w-3 h-3 opacity-50 group-hover:opacity-100" />}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224 }}
          className="z-[60] bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-72 overflow-y-auto normal-case tracking-normal"
        >
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Filter {label}
          </p>
          {options.map(opt => {
            const selected = value === opt.key;
            return (
              <button
                key={opt.key}
                role="menuitemradio"
                aria-checked={selected}
                type="button"
                onClick={() => { onChange(opt.key); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                  selected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {selected && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.count != null && (
                  <span className="tabular-nums text-xs text-slate-400">{opt.count}</span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </th>
  );
};

export default FilterableTh;
