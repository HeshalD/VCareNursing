import React, { useState, useRef, useEffect } from 'react';
import { Search, Package, Wrench, Tag, PencilLine } from 'lucide-react';

const fmtPrice = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

const TYPE_META = {
  RENTAL:            { label: 'Rental',  icon: Package, badgeCls: 'bg-purple-50 text-purple-600' },
  ONE_TIME_SERVICE:  { label: 'Service', icon: Wrench,  badgeCls: 'bg-blue-50 text-blue-600' },
};
const DEFAULT_META = { label: 'Product', icon: Tag, badgeCls: 'bg-gray-100 text-gray-500' };

const metaFor = (type) => TYPE_META[type] || DEFAULT_META;

// Searchable product/service picker for the quote builder's item table.
// Replaces a plain <select> — typing filters the catalogue live, and
// anything typed that doesn't match a catalogue item is kept as a free-text
// custom item, so admins never have to scroll a long dropdown to find (or
// give up and hand-type) an item.
const ProductAutocomplete = ({ products, item, onSelectProduct, onChangeDescription, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = products.find((p) => p.product_id === item.product_id);
  const query = item.description || '';

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = query.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : products;

  useEffect(() => { setHighlight(0); }, [query, open]);

  const pick = (p) => {
    onSelectProduct(p.product_id);
    setOpen(false);
    inputRef.current?.blur();
  };

  const useAsCustom = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChangeDescription(val);
    // Editing the text away from the selected product's name detaches it —
    // it's now a free-text custom item until a suggestion is chosen again.
    if (item.product_id && selected && val !== selected.name) {
      onSelectProduct('');
    }
    setOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
      else useAsCustom();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5">
        {item.product_id && selected ? (
          (() => {
            const { icon: Icon, badgeCls } = metaFor(selected.product_type);
            return (
              <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${badgeCls}`}>
                <Icon className="w-3 h-3" />
                {metaFor(selected.product_type).label}
              </span>
            );
          })()
        ) : (
          <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Search products & services, or type a custom item…'}
          className="w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0"
        />
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-80 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1.5">
          {filtered.length > 0 ? (
            filtered.map((p, idx) => {
              const { icon: Icon, label, badgeCls } = metaFor(p.product_type);
              return (
                <button
                  key={p.product_id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`w-full flex items-center justify-between gap-3 text-left px-3 py-2 transition-colors ${
                    idx === highlight ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md ${badgeCls}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-900 font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-gray-400">{label}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-[13px] font-medium text-gray-700 tabular-nums">
                    {fmtPrice(p.price)}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-6 text-center">
              <p className="text-[13px] text-gray-400">No catalogue items match "{query}"</p>
            </div>
          )}

          {query.trim() && (
            <>
              <div className="mx-3 my-1.5 h-px bg-gray-100" />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={useAsCustom}
                className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-gray-50 transition-colors"
              >
                <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-100 text-gray-500">
                  <PencilLine className="w-3.5 h-3.5" />
                </span>
                <span className="text-[13px] text-gray-600">
                  Use <span className="font-medium text-gray-800">"{query}"</span> as a custom item
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductAutocomplete;
