import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package, Wrench, Tag, Plus } from 'lucide-react';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import { AddProductDrawer } from '../products/ProductDrawer';

const fmtPrice = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

const TYPE_META = {
  RENTAL:            { label: 'Rental',  icon: Package, badgeCls: 'bg-purple-50 text-purple-600' },
  ONE_TIME_SERVICE:  { label: 'Service', icon: Wrench,  badgeCls: 'bg-blue-50 text-blue-600' },
};
const DEFAULT_META = { label: 'Product', icon: Tag, badgeCls: 'bg-gray-100 text-gray-500' };

const metaFor = (type) => TYPE_META[type] || DEFAULT_META;

// Every word typed must appear in the name, category or description. Names that start with what was
// typed come first, then names containing it, then matches found only in the category/description.
function searchProducts(products, query) {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  const words = q.split(/\s+/);
  const scored = [];
  for (const p of products) {
    const name = (p.name || '').toLowerCase();
    const rest = `${p.category_name || ''} ${p.description || ''}`.toLowerCase();
    const hay = `${name} ${rest}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : words.every((w) => name.includes(w)) ? 2 : 3;
    scored.push({ p, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).map((s) => s.p);
}

// Searchable product/service picker. Typing filters the catalogue live; picking a suggestion selects
// it. Only catalogue items can be chosen: free-text "custom items" were removed because they let
// arbitrary charges onto quotations (transport must be the "Transport Charges" product). Text typed
// without picking a suggestion leaves the line unpicked, which the builders refuse to save.
//
// A user who may create products (PRODUCT_CREATE) also gets an "Add new product" row. It opens the
// Products page's own product form (AddProductDrawer), then selects the new product on this line.
//
//   products          catalogue to search (the parent's list; the new product is appended through onProductCreated)
//   item              { product_id, description } — description holds the typed text
//   onSelectProduct   (productId, product) — '' when the line is detached; `product` is passed so a
//                     just-created product can be applied before the parent's list has re-rendered
//   typeFilter        optional array of product_type values to offer (e.g. ['RENTAL'])
//   lockedType        product_type a newly created product must have (e.g. 'RENTAL')
//   variant           'bare' (borderless, for the quote tables) | 'boxed' (a normal bordered input)
const ProductAutocomplete = ({
  products, item, onSelectProduct, onChangeDescription, onProductCreated, placeholder,
  typeFilter = null, lockedType = null, variant = 'bare', allowCreate = true,
}) => {
  const { hasPermission } = useAdminAuth();
  const canCreate = allowCreate && !!hasPermission?.('PRODUCT_CREATE');

  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [adding, setAdding] = useState(null); // { name } while the add-product drawer is open
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const pool = typeFilter ? products.filter((p) => typeFilter.includes(p.product_type)) : products;
  const selected = products.find((p) => p.product_id === item.product_id);
  const query = item.description || '';

  const filtered = searchProducts(pool, query);
  const typed = query.trim();
  // The "Add new" row follows the matches whenever something is typed, and stands alone when nothing matches.
  const showAdd = canCreate && !!typed && !(selected && typed === selected.name);
  const exactMatch = filtered.find((p) => (p.name || '').trim().toLowerCase() === typed.toLowerCase());
  const rowCount = filtered.length + (showAdd ? 1 : 0);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // The list is fixed-positioned (portal) so a scrolling drawer or table never clips it.
  const place = useCallback(() => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 320);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 220 && r.top > spaceBelow;
    setPos(up
      ? { left, width, bottom: window.innerHeight - r.top + 6, maxHeight: Math.min(288, r.top - 12) }
      : { left, width, top: r.bottom + 6, maxHeight: Math.min(288, spaceBelow - 12) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place(); // eslint-disable-line react-hooks/set-state-in-effect -- measures the input's on-screen box
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, place, query]);

  const pick = (p) => {
    onSelectProduct(p.product_id, p);
    setOpen(false);
    inputRef.current?.blur();
  };

  const startAdd = () => {
    setAdding({ name: typed });
    setOpen(false);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChangeDescription(val);
    // Editing the text away from the selected product's name detaches it —
    // the line is unpicked (and can't be saved) until a suggestion is chosen again.
    if (item.product_id && selected && val !== selected.name) {
      onSelectProduct('');
    }
    setHighlight(0);
    setOpen(true);
  };

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown') { setHighlight(0); setOpen(true); } return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rowCount - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight < filtered.length) pick(filtered[highlight]);
      else if (showAdd) startAdd();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const inputCls = variant === 'boxed'
    ? 'w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500'
    : 'w-full text-sm text-gray-800 bg-transparent placeholder-gray-300 border-0 outline-none focus:ring-0 p-0';

  const selectedMeta = selected ? metaFor(selected.product_type) : null;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5">
        {selectedMeta && item.product_id ? (
          <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${selectedMeta.badgeCls}`}>
            <selectedMeta.icon className="w-3 h-3" />
            {selectedMeta.label}
          </span>
        ) : <Search className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => { setHighlight(0); setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || 'Search the product catalogue…'}
          className={inputCls}
          autoComplete="off"
        />
      </div>
      {!item.product_id && typed && !open && (
        <p className="mt-0.5 text-[11px] text-amber-600">
          Pick an item from the catalogue{canCreate ? ' or add it as a new product' : ''}
        </p>
      )}

      {open && pos && createPortal(
        <div
          ref={listRef}
          style={{ position: 'fixed', zIndex: 70, ...pos }}
          className="overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1.5"
        >
          {filtered.map((p, idx) => {
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
                    <div className="text-[11px] text-gray-400">{label}{p.category_name ? ` · ${p.category_name}` : ''}</div>
                  </div>
                </div>
                <div className="shrink-0 text-[13px] font-medium text-gray-700 tabular-nums">
                  {fmtPrice(p.price)}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center">
              <p className="text-[13px] text-gray-400">
                {typed ? `No catalogue items match "${typed}"` : 'No products in the catalogue yet'}
              </p>
            </div>
          )}

          {showAdd && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={startAdd}
              onMouseEnter={() => setHighlight(filtered.length)}
              className={`w-full flex items-center gap-2 text-left px-3 py-2.5 border-t border-gray-100 text-sm font-medium text-blue-700 transition-colors ${
                highlight === filtered.length ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">Add new product "{typed}"</span>
            </button>
          )}
          {showAdd && exactMatch && (
            <p className="px-3 pb-1.5 -mt-0.5 text-[11px] text-amber-700">
              "{exactMatch.name}" is already in the catalogue — pick it above unless this is a different item.
            </p>
          )}
        </div>,
        document.body
      )}

      {adding && createPortal(
        <div className="relative z-[80]" onSubmit={(e) => e.stopPropagation()}>
          <AddProductDrawer
            initialName={adding.name}
            lockedType={lockedType}
            existingNames={products.map((p) => p.name)}
            onClose={() => setAdding(null)}
            onCreated={(product) => {
              setAdding(null);
              onProductCreated?.(product);
              onSelectProduct(product.product_id, product);
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProductAutocomplete;
