/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, X, Search, Check, ChevronLeft, ChevronRight, Tag, Upload } from 'lucide-react';
import apiClient from '../../../api/api';
import ImageCropModal from '../../../components/common/ImageCropModal';
import {
  btn, iconBtn, inputCls, textareaCls, Segmented, Toggle, Field, ErrorBanner, Drawer,
  CATALOG_CARD_IMAGE_ASPECT, formatMoney, MOTION_CSS,
} from './productUi';

// ----- Category picker + product drawer -----

const CATEGORY_PAGE_SIZE = 6;

// Paginated, searchable list of existing categories plus an inline "add new" row.
export function CategoryPicker({ categories, value, onChange, onCreated }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / CATEGORY_PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * CATEGORY_PAGE_SIZE, page * CATEGORY_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search]);

  const selected = categories.find((c) => String(c.category_id) === String(value));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await apiClient.createProductCategory({ name: newName.trim() });
      onCreated(res.data);
      onChange(res.data.category_id);
      setNewName('');
      setAddingNew(false);
    } catch (err) {
      setCreateError(err?.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  const optionCls = (on) => `flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${on ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`;

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Category</span>
      {selected && (
        <div className="mb-2 flex w-fit items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          <Tag className="h-3 w-3" /> {selected.name}
          <button type="button" aria-label="Clear category" onClick={() => onChange('')} className="ml-1 rounded text-blue-700 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <input
            type="text"
            aria-label="Search categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full py-1 text-[13px] text-slate-700 placeholder-slate-500 outline-none"
          />
        </div>
        <div className="divide-y divide-slate-100">
          <button type="button" onClick={() => onChange('')} className={optionCls(!value)}>None</button>
          {pageItems.length === 0 ? (
            <p className="px-3 py-3 text-center text-[13px] text-slate-500">No categories found.</p>
          ) : pageItems.map((c) => (
            <button key={c.category_id} type="button" onClick={() => onChange(c.category_id)} className={optionCls(String(value) === String(c.category_id))}>
              {c.name}
              {String(value) === String(c.category_id) && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
            <button type="button" aria-label="Previous categories" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" aria-label="Next categories" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
        <div className="border-t border-slate-100 px-3 py-2">
          {addingNew ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  aria-label="New category name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                  placeholder="New category name"
                  className={inputCls(false)}
                />
                <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()} className={btn('primary', 'sm')}>{creating ? '…' : 'Add'}</button>
                <button type="button" aria-label="Cancel new category" onClick={() => { setAddingNew(false); setNewName(''); setCreateError(''); }} className={iconBtn}><X className="h-4 w-4" /></button>
              </div>
              {createError && <p role="alert" className="text-xs text-red-700">{createError}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setAddingNew(true)} className="rounded text-[13px] font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              + Add new category
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export const blankProductForm = () => ({
  name: '', product_type: 'ITEM', category_id: '', description: '', price: '', cost_price: '', stock_quantity: 0, vendor_id: '',
});
export const formFromProduct = (p) => (p ? {
  name: p.name || '',
  product_type: p.product_type || 'ITEM',
  category_id: p.category_id || '',
  description: p.description || '',
  price: p.price || '',
  cost_price: p.cost_price ?? '',
  stock_quantity: p.stock_quantity ?? 0,
  vendor_id: p.vendor_id || '',
} : blankProductForm());

export const TYPE_HELP = {
  ITEM: 'Sold per unit with a tracked stock quantity.',
  RENTAL: 'Rented out by the month. Availability comes from its units.',
  ONE_TIME_SERVICE: 'Charged per visit or shift. Stock is not tracked.',
};

export function ProductDrawer({ mode, product, categories, vendors, onClose, onSaved, hideAddAnother = false, lockedType = null, existingNames = [] }) {
  const isEdit = mode === 'edit';
  const isSystem = !!product?.system_key && mode === 'edit';
  const baselinePublic = isEdit ? product?.is_public !== false : true;
  const [form, setForm] = useState(() => formFromProduct(product));
  const [isPublicOn, setIsPublicOn] = useState(() => (product ? product.is_public !== false : true));
  const [localCategories, setLocalCategories] = useState(categories);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image_url || '');
  const [imageToCrop, setImageToCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const baseline = useRef({ form: JSON.stringify(formFromProduct(product)), pub: product ? product.is_public !== false : true, image: product?.image_url || '' });

  const dirty = JSON.stringify(form) !== baseline.current.form || isPublicOn !== baseline.current.pub || imagePreview !== baseline.current.image;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const handleImageSelect = (file) => { if (file) setImageToCrop(file); };
  const handleImageCropComplete = (croppedFile) => {
    setImageToCrop(null);
    setImageFile(croppedFile);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(croppedFile);
  };

  // Creating a second product with an existing name is allowed (it may be a different variant), but flagged.
  const nameKey = form.name.trim().toLowerCase();
  const duplicateName = !isEdit && !!nameKey && existingNames.some((n) => (n || '').trim().toLowerCase() === nameKey);

  const priceN = parseFloat(form.price);
  const costN = parseFloat(form.cost_price);
  const showMargin = !Number.isNaN(priceN) && !Number.isNaN(costN) && form.cost_price !== '';
  const margin = priceN - costN;
  const marginPct = priceN > 0 ? Math.round((margin / priceN) * 100) : 0;

  const resetForNext = () => {
    const blank = { ...blankProductForm(), product_type: form.product_type };
    setForm(blank);
    setIsPublicOn(true);
    setImageFile(null);
    setImagePreview('');
    setErrors({});
    baseline.current = { form: JSON.stringify(blank), pub: true, image: '' };
  };

  const submit = async (addAnother) => {
    setServerError('');
    const errs = {};
    if (!form.name) errs.name = 'Enter a product name.';
    if (!form.price) errs.price = 'Enter a price.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const payload = { ...form, category_id: form.category_id || '' };
      let id = product?.product_id;
      let created = null;
      if (isEdit) {
        await apiClient.updateProduct(product.product_id, { ...payload, is_available: product.is_available }, imageFile);
      } else {
        const res = await apiClient.createProduct(payload, imageFile);
        created = res?.data || res;
        id = created?.product_id;
      }
      let visibilityFailed = false;
      if (isPublicOn !== baselinePublic) {
        try {
          if (!id) throw new Error('missing id');
          await apiClient.setProductsVisibility([id], isPublicOn);
        } catch {
          visibilityFailed = true;
        }
      }
      await onSaved({ addAnother, name: form.name, created: !isEdit, product: created, visibilityFailed });
      if (addAnother) resetForNext();
    } catch (err) {
      setServerError(err?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        title={isEdit ? 'Edit product' : mode === 'duplicate' ? 'Duplicate product' : 'New product'}
        subtitle={isEdit ? 'Update this product in your catalog.' : 'Add a product, rental or service to your catalog.'}
        dirty={dirty}
        onClose={onClose}
        onSubmit={(e) => { e.preventDefault(); submit(false); }}
        footer={(
          <>
            <button type="button" onClick={onClose} className={btn('secondary')}>Cancel</button>
            <span className="flex-1" />
            {!isEdit && !hideAddAnother && <button type="button" disabled={saving} onClick={() => submit(true)} className={btn('secondary')}>Save and add another</button>}
            <button type="submit" disabled={saving} className={btn('primary')}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create product'}
            </button>
          </>
        )}
      >
        <ErrorBanner message={serverError} />

        {isSystem && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
            This is a system product used by the quotation builders (transport). Its name, type and availability are fixed and it has no stock. You can change its default price, cost and description; the price is also set on each quotation.
          </p>
        )}

        {!isSystem && !lockedType && (
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Type</span>
            <Segmented
              ariaLabel="Product type"
              value={form.product_type}
              onChange={(v) => set({ product_type: v })}
              options={[{ value: 'ITEM', label: 'Item' }, { value: 'RENTAL', label: 'Rental' }, { value: 'ONE_TIME_SERVICE', label: 'Service' }]}
            />
            <p className="mt-1.5 text-xs text-slate-500">{TYPE_HELP[form.product_type]}</p>
          </div>
        )}

        <Field label="Name *" htmlFor="pd-name" error={errors.name}>
          <input id="pd-name" type="text" value={form.name} disabled={isSystem} onChange={(e) => set({ name: e.target.value })} className={inputCls(!!errors.name)} />
          {duplicateName && (
            <p role="status" className="mt-1 text-xs font-semibold text-amber-700">
              A product named "{form.name.trim()}" already exists in the catalogue. Search for it instead, unless this is a different item.
            </p>
          )}
        </Field>

        <CategoryPicker
          categories={localCategories}
          value={form.category_id}
          onChange={(id) => set({ category_id: id })}
          onCreated={(cat) => setLocalCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={form.product_type === 'RENTAL' ? 'Rate per month (LKR) *' : 'Price (LKR) *'} htmlFor="pd-price" error={errors.price}>
            <input id="pd-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(!!errors.price)} />
          </Field>
          <Field label="Cost price (LKR)" htmlFor="pd-cost" hint="Used for the Profit & Loss report's COGS.">
            <input id="pd-cost" type="number" min="0" step="0.01" value={form.cost_price} onChange={(e) => set({ cost_price: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
          </Field>
        </div>
        {showMargin && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px]">
            <span className="text-slate-500">Estimated margin</span>
            <b className={`tabular-nums ${margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(margin)} ({marginPct}%)</b>
          </div>
        )}

        {form.product_type === 'ITEM' && !isSystem && (
          <Field label="Stock quantity" htmlFor="pd-stock" className="max-w-[200px]">
            <input id="pd-stock" type="number" value={form.stock_quantity} onChange={(e) => set({ stock_quantity: e.target.value })} onWheel={(e) => e.target.blur()} className={inputCls(false)} />
          </Field>
        )}

        {!isSystem && <Field label="Vendor" htmlFor="pd-vendor" hint="If this is sourced from an outside vendor, selecting it lets you record what's owed to them when it's sold or rented.">
          <select id="pd-vendor" value={form.vendor_id} onChange={(e) => set({ vendor_id: e.target.value })} className={inputCls(false)}>
            <option value="">In-house stock (no vendor)</option>
            {vendors.map((v) => <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}
          </select>
        </Field>}

        <Field label="Description" htmlFor="pd-desc">
          <textarea id="pd-desc" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} className={textareaCls(false)} />
        </Field>

        <div>
          <span className="mb-1 block text-[13px] font-semibold text-slate-700">Image</span>
          <p className="mb-2 text-xs text-slate-500">Crop to match how it appears on the public catalog card.</p>
          {imagePreview ? (
            <div className="flex items-center gap-4">
              <img src={imagePreview} alt="Product preview" className="h-24 rounded-lg border border-slate-200 object-cover" style={{ aspectRatio: CATALOG_CARD_IMAGE_ASPECT }} />
              <div className="flex flex-col gap-2">
                <input type="file" id="product-image-change" className="sr-only" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
                <label htmlFor="product-image-change" className={`${btn('secondary', 'sm')} cursor-pointer`}><Upload className="h-3.5 w-3.5" /> Change</label>
                <button type="button" onClick={() => { setImagePreview(''); setImageFile(null); }} className={btn('danger', 'sm')}>Remove</button>
              </div>
            </div>
          ) : (
            <div>
              <input type="file" id="product-image-upload" className="sr-only" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); e.target.value = ''; }} />
              <label htmlFor="product-image-upload" className="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-500">
                <Upload className="mb-1 h-5 w-5" />
                <span className="text-[13px] font-semibold">Click to upload</span>
                <span className="text-xs text-slate-500">JPG or PNG</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3.5 py-3">
          <div>
            <b className="text-sm text-slate-900">Show on public catalog</b>
            <p className="text-xs text-slate-500">Customers can see this product on the website.</p>
          </div>
          <Toggle checked={isPublicOn} onChange={setIsPublicOn} label="Show on public catalog" />
        </div>
      </Drawer>

      {imageToCrop && (
        <div className="fixed inset-0 z-[60]">
          <ImageCropModal
            imageFile={imageToCrop}
            aspect={CATALOG_CARD_IMAGE_ASPECT}
            onCancel={() => setImageToCrop(null)}
            onCropComplete={handleImageCropComplete}
          />
        </div>
      )}
    </>
  );
}

// "Add new product" from anywhere an invoice / quotation line picks a product. It is the Products
// page's own ProductDrawer (same form, same POST /products, same PRODUCT_CREATE gate), so a product
// created here is indistinguishable from one added in the catalogue. The Products page's data
// (categories, vendors) is loaded here because the callers don't have it.
export function AddProductDrawer({ initialName = '', lockedType = null, existingNames = [], onClose, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      apiClient.getProductCategories().catch(() => null),
      apiClient.getVendors().catch(() => null),
    ]).then(([cat, ven]) => {
      if (!live) return;
      setCategories(Array.isArray(cat?.data) ? cat.data : []);
      setVendors(Array.isArray(ven?.data) ? ven.data : []);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  if (!ready) return null;

  const seed = { ...blankProductForm(), name: initialName, ...(lockedType ? { product_type: lockedType } : {}) };
  return (
    <>
      <style>{MOTION_CSS}</style>
      <ProductDrawer
        mode="create"
        product={initialName || lockedType ? { ...seed, product_id: undefined } : null}
        categories={categories}
        vendors={vendors}
        hideAddAnother
        lockedType={lockedType}
        existingNames={existingNames}
        onClose={onClose}
        onSaved={async ({ created, product }) => { if (created && product) onCreated(product); }}
      />
    </>
  );
}
