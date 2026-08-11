import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, X, Plus, Package, Image as ImageIcon, Trash2, Pencil,
  ShoppingBag, FileText, CreditCard, Search, Check, AlertCircle,
  Repeat, RotateCcw, Wrench, Undo2, Wallet, Download, History, Eye,
  ExternalLink, ChevronDown, Upload, ChevronLeft, ChevronRight, Tag,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import DateInput from '../../../components/common/DateInput';
import ImageCropModal from '../../../components/common/ImageCropModal';

// Matches the public CatalogPage product card image box, which is a
// square (aspect-square) slot.
const CATALOG_CARD_IMAGE_ASPECT = 1;

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));
const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};
const daysRemaining = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};
const DaysRemainingBadge = ({ date }) => {
  const days = daysRemaining(date);
  if (days === null) return null;
  const label = days > 0 ? `${days}d left` : days === 0 ? 'Due today' : `${Math.abs(days)}d overdue`;
  const color = days > 3 ? 'bg-emerald-50 text-emerald-700'
    : days >= 0 ? 'bg-amber-50 text-amber-700'
    : 'bg-red-50 text-red-700';
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>{label}</span>;
};

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CASH_DEPOSIT', 'CHEQUE'];

// Shared tokens (same convention used across the rest of the admin app)
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const ghostBtnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const StatusDot = ({ active, activeLabel = 'Active', inactiveLabel = 'Inactive' }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${active ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
    {active ? activeLabel : inactiveLabel}
  </span>
);

const UNIT_STATUS_DOT = {
  AVAILABLE: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  RENTED: { dot: 'bg-violet-500', text: 'text-violet-700' },
  MAINTENANCE: { dot: 'bg-amber-400', text: 'text-amber-700' },
};

const HONORIFICS = ['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Rev.'];
const CLIENT_TYPES = ['INDIVIDUAL', 'CORPORATE_PROXY'];

const emptyWalkInClient = () => ({
  honorific: '', full_name: '', gender: '', client_type: 'INDIVIDUAL',
  company_name: '', display_name_source: 'FULL_NAME', email: '', mobile_number: '', primary_address: '',
});

// Collects the same required fields as the normal "Add Client" flow
// (user_managemnet.jsx) so a walk-in customer is registered as a full client
// rather than a bare name + phone number.
const WalkInClientFields = ({ value, onChange }) => {
  const set = (patch) => onChange((v) => ({ ...v, ...patch }));
  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid grid-cols-3 gap-2">
        <select
          value={value.honorific}
          onChange={(e) => set({ honorific: e.target.value })}
          className="rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
        >
          <option value="">Honorific</option>
          {HONORIFICS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <input
          type="text"
          placeholder="Full name *"
          value={value.full_name}
          onChange={(e) => set({ full_name: e.target.value })}
          className="col-span-2 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={value.gender}
          onChange={(e) => set({ gender: e.target.value })}
          className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        >
          <option value="">Gender *</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          value={value.client_type}
          onChange={(e) => set({
            client_type: e.target.value,
            ...(e.target.value !== 'CORPORATE_PROXY' ? { company_name: '', display_name_source: 'FULL_NAME' } : {}),
          })}
          className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        >
          {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </select>
      </div>
      {value.client_type === 'CORPORATE_PROXY' && (
        <input
          type="text"
          placeholder="Company name"
          value={value.company_name}
          onChange={(e) => set({ company_name: e.target.value, ...(!e.target.value ? { display_name_source: 'FULL_NAME' } : {}) })}
          className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="email"
          placeholder="Email (optional)"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="Mobile number *"
          value={value.mobile_number}
          onChange={(e) => set({ mobile_number: e.target.value })}
          className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <input
        type="text"
        placeholder="Primary address (optional)"
        value={value.primary_address}
        onChange={(e) => set({ primary_address: e.target.value })}
        className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
      />
      <p className="text-[11px] text-slate-400">
        Registers them as a client (login credentials sent via SMS) with their registration fee left pending — they can rent or purchase now and settle it later.
      </p>
    </div>
  );
};

export default function ProductsPage() {
  const [tab, setTab] = useState('catalog'); // 'catalog' | 'quotes' | 'rentals'

  return (
    <AdminLayout title="Products" subtitle="Catalog, rentals, and product-based quotations & invoices">
      <div className="space-y-5">
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 w-fit">
          {[
            { id: 'catalog', label: 'Catalog', icon: Package },
            { id: 'quotes', label: 'Quotes & Invoices', icon: FileText },
            { id: 'rentals', label: 'Rentals', icon: Repeat },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === 'catalog' ? <CatalogTab /> : tab === 'quotes' ? <QuotesTab /> : <RentalsTab />}
      </div>
    </AdminLayout>
  );
}

// ==================== CATALOG TAB ====================

function CatalogTab() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, unitsRes] = await Promise.all([
        apiClient.getProducts({ include_unavailable: 'true' }),
        apiClient.getRentalUnits({}),
      ]);
      setProducts(Array.isArray(prodRes?.data) ? prodRes.data : []);
      setUnits(Array.isArray(unitsRes?.data) ? unitsRes.data : []);
    } catch {
      setProducts([]);
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiClient.getProductCategories();
      setCategories(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setCategories([]);
    }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await apiClient.getVendors();
      setVendors(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setVendors([]);
    }
  }, []);

  useEffect(() => { fetchAll(); fetchCategories(); fetchVendors(); }, [fetchAll, fetchCategories, fetchVendors]);

  const openCreate = () => { setEditingProduct(null); setModalOpen(true); };
  const openEdit = (product) => { setEditingProduct(product); setModalOpen(true); };

  const handleDeactivate = async (product) => {
    if (!window.confirm(`Deactivate "${product.name}"? It will no longer appear in the catalog.`)) return;
    try {
      await apiClient.deactivateProduct(product.product_id);
      fetchAll();
    } catch (err) {
      alert(err.message || 'Failed to deactivate product');
    }
  };

  const rentalProducts = products.filter((p) => p.product_type === 'RENTAL');
  const serviceProducts = products.filter((p) => p.product_type === 'ONE_TIME_SERVICE');
  const itemProducts = products.filter((p) => p.product_type === 'ITEM');

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Product
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
          <Package className="h-8 w-8" />
          <p className="text-sm font-medium">No products yet — create one to get started</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Repeat className="h-4 w-4 text-purple-500" /> Rental Items
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-600">{rentalProducts.length}</span>
            </h3>
            {rentalProducts.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                No rental products yet.
              </div>
            ) : (
              <div className="space-y-4">
                {rentalProducts.map((p) => (
                  <RentalProductPanel
                    key={p.product_id}
                    product={p}
                    units={units.filter((u) => u.product_id === p.product_id)}
                    onEdit={() => openEdit(p)}
                    onDeactivate={() => handleDeactivate(p)}
                    onChanged={fetchAll}
                    setError={setError}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShoppingBag className="h-4 w-4 text-blue-500" /> Purchasable Items
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">{itemProducts.length}</span>
            </h3>
            {itemProducts.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                No purchasable products yet.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Image</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stock Available</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itemProducts.map((p) => (
                        <tr key={p.product_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-9 w-9 rounded object-cover border border-slate-200" />
                            ) : (
                              <div className="h-9 w-9 rounded bg-slate-100 flex items-center justify-center text-slate-300">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="px-4 py-3 text-slate-500">{p.category_name || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(p.price)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            <span className={Number(p.stock_quantity) <= 0 ? 'font-medium text-red-600' : ''}>
                              {p.stock_quantity ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.is_available ? 'text-emerald-700' : 'text-slate-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.is_available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              {p.is_available ? 'Available' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" onClick={() => setHistoryProduct(p)} title="Purchase history" className={iconBtnCls}>
                                <History className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => openEdit(p)} title="Edit product" className={iconBtnCls}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {p.is_available && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivate(p)}
                                  title="Deactivate product"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Wrench className="h-4 w-4 text-emerald-500" /> One-Time Services
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">{serviceProducts.length}</span>
            </h3>
            {serviceProducts.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
                No one-time services yet.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Image</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Price</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {serviceProducts.map((p) => (
                        <tr key={p.product_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-9 w-9 rounded object-cover border border-slate-200" />
                            ) : (
                              <div className="h-9 w-9 rounded bg-slate-100 flex items-center justify-center text-slate-300">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="px-4 py-3 text-slate-500">{p.category_name || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(p.price)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${p.is_available ? 'text-emerald-700' : 'text-slate-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.is_available ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                              {p.is_available ? 'Available' : 'Deactivated'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-0.5">
                              <button type="button" onClick={() => setHistoryProduct(p)} title="Purchase history" className={iconBtnCls}>
                                <History className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => openEdit(p)} title="Edit product" className={iconBtnCls}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {p.is_available && (
                                <button
                                  type="button"
                                  onClick={() => handleDeactivate(p)}
                                  title="Deactivate product"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          vendors={vendors}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); fetchAll(); fetchCategories(); }}
        />
      )}

      {historyProduct && (
        <ProductPurchaseHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />
      )}
    </>
  );
}

// Every quotation line item that referenced this product, plus the invoice
// generated for that quote and its payment status — lets an admin see who
// bought how many of an ITEM-type product, when, and whether it's been paid,
// without leaving the Catalog tab.
function ProductPurchaseHistoryModal({ product, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.getProductPurchaseHistory(product.product_id);
        if (!cancelled) setRows(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load purchase history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [product.product_id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Purchase History — {product.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase history…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
              <History className="h-8 w-8" />
              <p className="text-sm font-medium">No purchases of this product yet</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Buyer</th>
                      <th className="px-3 py-2 text-left">Estimate #</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Line Amount</th>
                      <th className="px-3 py-2 text-left">Invoice Code</th>
                      <th className="px-3 py-2 text-left">Invoice Status</th>
                      <th className="px-3 py-2 text-left">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.line_item_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDate(r.quoted_at)}</td>
                        <td className="px-3 py-2 text-slate-800">
                          {r.client_name || r.walk_in_name || '—'}
                          {r.walk_in_name && !r.client_name && <span className="ml-1.5 text-[10px] text-amber-600">(walk-in)</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{r.estimate_number}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{r.quantity}</td>
                        <td className="px-3 py-2 text-right font-semibold text-slate-800 whitespace-nowrap">{formatMoney(r.amount)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{r.invoice_code || '—'}</td>
                        <td className="px-3 py-2">
                          {r.invoice_status ? (
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                              r.invoice_status === 'PAID' ? 'bg-emerald-50 text-emerald-700' :
                              r.invoice_status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                              r.invoice_status === 'OVERDUE' ? 'bg-red-50 text-red-700' :
                              'bg-amber-50 text-amber-700'
                            }`}>
                              {r.invoice_status}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">Not invoiced</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.paid_at ? formatDate(r.paid_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// A rental product's own card: identity + actions up top, then every physical
// unit for that product inline (status, notes, who's renting it and until
// when if RENTED, mark-maintenance toggle) plus an inline "add unit" form —
// so units never require leaving the Catalog tab to manage.
function RentalProductPanel({ product, units, onEdit, onDeactivate, onChanged, setError }) {
  const [unitCode, setUnitCode] = useState('');
  const [notes, setNotes] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);
  const [busyUnitId, setBusyUnitId] = useState('');

  const counts = units.reduce((acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc; }, {});

  const handleAddUnit = async (e) => {
    e.preventDefault();
    setError('');
    setAddingUnit(true);
    try {
      await apiClient.createRentalUnit({ product_id: product.product_id, unit_code: unitCode.trim() || undefined, notes: notes.trim() || undefined });
      setUnitCode('');
      setNotes('');
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to add unit');
    } finally {
      setAddingUnit(false);
    }
  };

  const handleToggleMaintenance = async (unit) => {
    const nextStatus = unit.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
    setBusyUnitId(unit.unit_id);
    setError('');
    try {
      await apiClient.updateRentalUnitStatus(unit.unit_id, nextStatus);
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to update unit');
    } finally {
      setBusyUnitId('');
    }
  };

  const rentedUntilDate = (u) => {
    if (u.status !== 'RENTED') return null;
    return u.rental_billing_type === 'RECURRING' ? u.rental_next_invoice_date : u.rental_end_date;
  };
  const rentedTo = (u) => u.rented_to_client_name || u.rented_to_walk_in_name || '—';

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-3">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-9 w-9 rounded object-cover border border-slate-200" />
          ) : (
            <div className="h-9 w-9 rounded bg-slate-100 flex items-center justify-center text-slate-300">
              <ImageIcon className="h-4 w-4" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {product.name}
              {!product.is_available && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Deactivated</span>
              )}
            </p>
            <p className="text-xs text-slate-400">
              {product.category_name || 'Uncategorized'} · {formatMoney(product.price)} / rental
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{counts.AVAILABLE || 0} Available</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />{counts.RENTED || 0} Rented</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{counts.MAINTENANCE || 0} Maintenance</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onEdit} title="Edit product" className={iconBtnCls}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {product.is_available && (
              <button
                type="button"
                onClick={onDeactivate}
                title="Deactivate product"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unit</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rented By</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Until</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {units.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-400">No units yet — add one below.</td>
              </tr>
            ) : (
              units.map((u) => {
                const cfg = UNIT_STATUS_DOT[u.status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                return (
                  <tr key={u.unit_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.unit_code || u.unit_id.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{u.notes || '—'}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{u.status === 'RENTED' ? rentedTo(u) : '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                      {formatDate(rentedUntilDate(u))}
                      {u.status === 'RENTED' && <DaysRemainingBadge date={rentedUntilDate(u)} />}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.status !== 'RENTED' && (
                        <button
                          type="button"
                          disabled={busyUnitId === u.unit_id}
                          onClick={() => handleToggleMaintenance(u)}
                          title={u.status === 'MAINTENANCE' ? 'Mark available' : 'Mark under maintenance'}
                          className={iconBtnCls}
                        >
                          {busyUnitId === u.unit_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAddUnit} className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Unit code (optional)</label>
          <input
            type="text"
            placeholder="e.g. BED-002"
            value={unitCode}
            onChange={(e) => setUnitCode(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] font-medium text-slate-500 mb-1">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors"
          />
        </div>
        <button type="submit" disabled={addingUnit} className={primaryBtnCls}>
          {addingUnit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add Unit
        </button>
      </form>
    </div>
  );
}

const CATEGORY_PAGE_SIZE = 6;

// Paginated, searchable list of existing categories the admin can pick from,
// plus an inline "add new" row — replaces the old bare <select> which gave
// no sense of how many categories existed or let you search them.
function CategoryPicker({ categories, value, onChange, onCreated }) {
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
      setCreateError(err.message || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-1">Category</label>

      {selected && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 w-fit">
          <Tag className="h-3 w-3" /> {selected.name}
          <button type="button" onClick={() => onChange('')} className="ml-1 text-blue-400 hover:text-blue-600">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="rounded-md border border-slate-300 bg-white overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories…"
            className="w-full text-xs text-slate-700 placeholder-slate-400 outline-none"
          />
        </div>

        <div className="divide-y divide-slate-50">
          <button
            type="button"
            onClick={() => onChange('')}
            className={`w-full flex items-center px-2.5 py-1.5 text-left text-xs transition-colors ${
              !value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            — None —
          </button>
          {pageItems.length === 0 ? (
            <p className="px-2.5 py-3 text-center text-xs text-slate-400">No categories found.</p>
          ) : (
            pageItems.map((c) => (
              <button
                key={c.category_id}
                type="button"
                onClick={() => onChange(c.category_id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors ${
                  String(value) === String(c.category_id) ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {c.name}
                {String(value) === String(c.category_id) && <Check className="h-3 w-3 shrink-0" />}
              </button>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] text-slate-400">Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="border-t border-slate-100 px-2 py-1.5">
          {addingNew ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                  placeholder="New category name"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="shrink-0 rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? '…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingNew(false); setNewName(''); setCreateError(''); }}
                  className="shrink-0 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {createError && <p className="text-[10px] text-red-600">{createError}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3 w-3" /> Add new category
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductModal({ product, categories, vendors, onClose, onSaved }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name: product?.name || '',
    product_type: product?.product_type || 'ITEM',
    category_id: product?.category_id || '',
    description: product?.description || '',
    price: product?.price || '',
    cost_price: product?.cost_price ?? '',
    stock_quantity: product?.stock_quantity ?? 0,
    vendor_id: product?.vendor_id || '',
  });
  const [localCategories, setLocalCategories] = useState(categories);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(product?.image_url || '');
  const [imageToCrop, setImageToCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleImageSelect = (file) => { if (file) setImageToCrop(file); };
  const handleImageCropComplete = (croppedFile) => {
    setImageToCrop(null);
    setImageFile(croppedFile);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(croppedFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.price) {
      setError('Name and price are required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, category_id: form.category_id || '' };
      if (isEdit) {
        await apiClient.updateProduct(product.product_id, { ...payload, is_available: product.is_available }, imageFile);
      } else {
        await apiClient.createProduct(payload, imageFile);
      }
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />

      <div className="w-full max-w-lg bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-900">{isEdit ? 'Edit Product' : 'New Product'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div className="px-5 pt-4 pb-2 space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Type</label>
                <select
                  value={form.product_type}
                  onChange={(e) => setForm((f) => ({ ...f, product_type: e.target.value }))}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ITEM">Item (customer keeps it)</option>
                  <option value="RENTAL">Rental</option>
                  <option value="ONE_TIME_SERVICE">One-Time Service</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  {form.product_type === 'RENTAL' ? 'Rental Price *' : 'Price *'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  onWheel={(e) => e.target.blur()}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Cost Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm((f) => ({ ...f, cost_price: e.target.value }))}
                onWheel={(e) => e.target.blur()}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <p className="mt-1 text-[10px] text-slate-400">What this item costs the business — used for the Profit &amp; Loss report's COGS.</p>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— In-house stock (no vendor) —</option>
                {vendors.map((v) => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-400">If this item is sourced from an outside vendor, selecting it here lets you record what's owed to them when it's sold or rented.</p>
            </div>

            <CategoryPicker
              categories={localCategories}
              value={form.category_id}
              onChange={(id) => setForm((f) => ({ ...f, category_id: id }))}
              onCreated={(cat) => setLocalCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)))}
            />

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {form.product_type === 'ITEM' && (
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Stock Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm((f) => ({ ...f, stock_quantity: e.target.value }))}
                  onWheel={(e) => e.target.blur()}
                  className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Image</label>
              <p className="mb-1.5 text-[10px] text-slate-400">Crop to match how it appears on the public catalog card.</p>
              {imagePreview ? (
                <div className="relative w-fit">
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="h-24 rounded-lg border border-slate-200 object-cover"
                    style={{ aspectRatio: CATALOG_CARD_IMAGE_ASPECT }}
                  />
                  <button
                    type="button"
                    onClick={() => { setImagePreview(''); setImageFile(null); }}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="mt-1.5">
                    <input type="file" id="product-image-change" className="hidden" accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
                    <label htmlFor="product-image-change"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium hover:bg-slate-200 cursor-pointer transition-colors">
                      <Upload className="w-3 h-3" /> Change
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <input type="file" id="product-image-upload" className="hidden" accept="image/*"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }} />
                  <label htmlFor="product-image-upload"
                    className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors group">
                    <Upload className="w-5 h-5 text-slate-400 group-hover:text-blue-500 mb-1 transition-colors" />
                    <p className="text-xs font-medium text-slate-500">Click to upload</p>
                    <p className="text-xs text-slate-400">JPG, PNG</p>
                  </label>
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </div>

      <ImageCropModal
        imageFile={imageToCrop}
        aspect={CATALOG_CARD_IMAGE_ASPECT}
        onCancel={() => setImageToCrop(null)}
        onCropComplete={handleImageCropComplete}
      />
    </div>
  );
}

// ==================== QUOTES & INVOICES TAB ====================

const QUOTE_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending Acceptance' },
  { key: 'awaiting_payment', label: 'Awaiting Payment' },
  { key: 'paid', label: 'Paid' },
];

const QUOTE_PAGE_SIZE = 12;

function QuotesTab() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [previewQuote, setPreviewQuote] = useState(null);
  const [busyQuoteId, setBusyQuoteId] = useState('');
  const [sendingQuoteId, setSendingQuoteId] = useState('');
  const [downloadingQuoteId, setDownloadingQuoteId] = useState('');
  const [sendResult, setSendResult] = useState(null); // { quoteId, pdfUrl }
  const [error, setError] = useState('');

  const [statusTab, setStatusTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedQuoteId, setExpandedQuoteId] = useState(null);
  const [vendorPromptQuote, setVendorPromptQuote] = useState(null); // full quote (with line_items) awaiting vendor-payment decisions
  const [vendorPromptLoading, setVendorPromptLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, prodInvRes, rentalOneTimeRes, rentalRecurringRes] = await Promise.all([
        apiClient.getProductQuotes(),
        apiClient.getProductInvoices({ category: 'PRODUCT' }),
        apiClient.getProductInvoices({ category: 'RENTAL_ONE_TIME' }),
        apiClient.getProductInvoices({ category: 'RENTAL_RECURRING' }),
      ]);
      setQuotes(Array.isArray(qRes?.data) ? qRes.data : []);
      setInvoices([
        ...(Array.isArray(prodInvRes?.data) ? prodInvRes.data : []),
        ...(Array.isArray(rentalOneTimeRes?.data) ? rentalOneTimeRes.data : []),
        ...(Array.isArray(rentalRecurringRes?.data) ? rentalRecurringRes.data : []),
      ]);
    } catch {
      setQuotes([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // A quote with several rental items (each getting its own agreement) plus
  // maybe a combined invoice for any non-rental items can spawn more than one
  // invoice on acceptance — and RECURRING rentals add another each billing
  // cycle after that. Show all of them, oldest first.
  const invoicesForQuote = (quoteId) =>
    invoices.filter((i) => i.quote_id === quoteId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const quoteStatusOf = (quoteInvoices) => {
    if (quoteInvoices.length === 0) return 'pending';
    return quoteInvoices.every((inv) => inv.status === 'PAID') ? 'paid' : 'awaiting_payment';
  };

  // Enrich once so filtering/sorting/summary cards all read off the same shape.
  const enrichedQuotes = quotes.map((q) => {
    const quoteInvoices = invoicesForQuote(q.quote_id);
    return { quote: q, quoteInvoices, bucket: quoteStatusOf(quoteInvoices) };
  });

  const tabCounts = enrichedQuotes.reduce(
    (acc, { bucket }) => ({ ...acc, all: acc.all + 1, [bucket]: acc[bucket] + 1 }),
    { all: 0, pending: 0, awaiting_payment: 0, paid: 0 }
  );

  const outstandingTotal = invoices.filter((i) => i.status !== 'PAID').reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const collectedTotal = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const recipientName = (q) => q.client_name || q.walk_in_name || '—';

  const filtered = enrichedQuotes.filter(({ quote: q, bucket }) => {
    if (statusTab !== 'all' && bucket !== statusTab) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      (q.estimate_number || '').toLowerCase().includes(query) ||
      recipientName(q).toLowerCase().includes(query)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / QUOTE_PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * QUOTE_PAGE_SIZE, page * QUOTE_PAGE_SIZE);

  useEffect(() => { setPage(1); }, [statusTab, search]);

  const handleAccept = async (quote) => {
    setError('');
    // Vendor-linked line items need a pay-now-or-leave-unpaid decision before
    // acceptance — check for those first instead of always accepting blind.
    setVendorPromptLoading(true);
    let hasVendorItems = false;
    let full = null;
    try {
      full = await apiClient.getProductQuote(quote.quote_id);
      const lineItems = full?.data?.line_items || full?.line_items || [];
      hasVendorItems = lineItems.some((li) => li.vendor_id);
    } catch (err) {
      setError(err.message || 'Failed to load quotation details');
      setVendorPromptLoading(false);
      return;
    }
    setVendorPromptLoading(false);

    if (hasVendorItems) {
      setVendorPromptQuote(full?.data || full);
      return;
    }

    setBusyQuoteId(quote.quote_id);
    try {
      await apiClient.acceptProductQuote(quote.quote_id);
      await fetchAll();
    } catch (err) {
      setError(err.message || 'Failed to accept quotation');
    } finally {
      setBusyQuoteId('');
    }
  };

  const handleAcceptWithVendorPayments = async (quoteId, vendorPayments) => {
    setBusyQuoteId(quoteId);
    setError('');
    try {
      await apiClient.acceptProductQuote(quoteId, { vendor_payments: vendorPayments });
      setVendorPromptQuote(null);
      await fetchAll();
    } catch (err) {
      setError(err.message || 'Failed to accept quotation');
    } finally {
      setBusyQuoteId('');
    }
  };

  const handleSend = async (quote) => {
    setSendingQuoteId(quote.quote_id);
    setError('');
    setSendResult(null);
    try {
      const res = await apiClient.sendProductQuotePDF(quote.quote_id);
      setSendResult({ quoteId: quote.quote_id, pdfUrl: res?.pdf_link });
      await fetchAll();
    } catch (err) {
      setError(err.message || 'Failed to send quotation');
    } finally {
      setSendingQuoteId('');
    }
  };

  const handleDownload = async (quote) => {
    setDownloadingQuoteId(quote.quote_id);
    setError('');
    try {
      const res = await apiClient.generateProductQuotePdf(quote.quote_id);
      if (res?.pdf_url) {
        window.open(res.pdf_url, '_blank', 'noopener');
      }
    } catch (err) {
      setError(err.message || 'Failed to generate quotation PDF');
    } finally {
      setDownloadingQuoteId('');
    }
  };

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Quotes</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{quotes.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pending Acceptance</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{tabCounts.pending}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Awaiting Payment</p>
          <p className="mt-1 text-lg font-semibold text-amber-700">{formatMoney(outstandingTotal)}</p>
          <p className="text-xs text-slate-400">{tabCounts.awaiting_payment} quote{tabCounts.awaiting_payment !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Collected</p>
          <p className="mt-1 text-lg font-semibold text-emerald-700">{formatMoney(collectedTotal)}</p>
          <p className="text-xs text-slate-400">{tabCounts.paid} quote{tabCounts.paid !== 1 ? 's' : ''} fully paid</p>
        </div>
      </div>

      {/* Toolbar: status tabs, search, new quote */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 w-fit">
          {QUOTE_STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                statusTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-slate-400">{tabCounts[key]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search recipient or estimate #…"
              className={`${inputCls} pl-8 w-64`}
            />
          </div>
          <button type="button" onClick={() => setQuoteModalOpen(true)} className={`${primaryBtnCls} shrink-0`}>
            <Plus className="h-4 w-4" /> New Product Quote
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {sendResult && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          <Check className="h-4 w-4 shrink-0" /> Quotation sent via WhatsApp.
          <a href={sendResult.pdfUrl} target="_blank" rel="noreferrer" className="underline font-medium ml-1">View PDF</a>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <ShoppingBag className="h-8 w-8" />
            <p className="text-sm font-medium">
              {quotes.length === 0 ? 'No product quotations yet' : 'No quotes match your filters'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pageItems.map(({ quote: q, quoteInvoices, bucket }) => {
              const rentalItemCount = Number(q.rental_item_count) || 0;
              const isRentalQuote = rentalItemCount > 0;
              const isExpanded = expandedQuoteId === q.quote_id;
              const singleUnpaidInvoice = quoteInvoices.length === 1 && quoteInvoices[0].status !== 'PAID' ? quoteInvoices[0] : null;

              return (
                <div key={q.quote_id}>
                  <button
                    type="button"
                    onClick={() => setExpandedQuoteId(isExpanded ? null : q.quote_id)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-24 shrink-0 text-xs text-slate-500">{formatDate(q.created_at)}</div>

                    <div className="w-40 shrink-0">
                      <p className="font-mono text-xs font-semibold text-slate-700">{q.estimate_number}</p>
                      {q.linked_quote_id ? (
                        <span className="mt-0.5 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                          + Service Request
                        </span>
                      ) : (
                        <span className="mt-0.5 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          Product Only
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm text-slate-800">
                        {recipientName(q)}
                        {q.walk_in_name && <span className="ml-1.5 text-[10px] text-amber-600">(walk-in)</span>}
                      </p>
                      {isRentalQuote && (
                        <span className="mt-0.5 inline-block rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          {rentalItemCount > 1 ? `${rentalItemCount} Rental Items` : '1 Rental Item'}
                        </span>
                      )}
                    </div>

                    <div className="w-32 shrink-0 text-right">
                      <p className="font-semibold text-slate-800">{formatMoney(q.total_amount)}</p>
                      {Number(q.total_deposit_amount) > 0 && (
                        <p className="text-[10px] text-slate-400">+{formatMoney(q.total_deposit_amount)} deposit</p>
                      )}
                    </div>

                    <div className="w-40 shrink-0">
                      {bucket === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Pending Acceptance
                        </span>
                      )}
                      {bucket === 'awaiting_payment' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Awaiting Payment{quoteInvoices.length > 1 ? ` (${quoteInvoices.filter((i) => i.status !== 'PAID').length}/${quoteInvoices.length})` : ''}
                        </span>
                      )}
                      {bucket === 'paid' && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Paid
                        </span>
                      )}
                    </div>

                    <div className="w-40 shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      {bucket === 'pending' && (
                        <button
                          type="button"
                          disabled={busyQuoteId === q.quote_id || vendorPromptLoading}
                          onClick={() => handleAccept(q)}
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busyQuoteId === q.quote_id || vendorPromptLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          {isRentalQuote ? 'Accept & Create Rental(s)' : 'Accept & Invoice'}
                        </button>
                      )}
                      {bucket === 'awaiting_payment' && singleUnpaidInvoice && (
                        <button
                          type="button"
                          onClick={() => setPaymentModalInvoice(singleUnpaidInvoice)}
                          className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <CreditCard className="h-3 w-3" /> Record Payment
                        </button>
                      )}
                      {bucket === 'awaiting_payment' && !singleUnpaidInvoice && (
                        <span className="text-xs text-slate-400">See invoices below</span>
                      )}
                    </div>

                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180 text-blue-500' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                      {quoteInvoices.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Invoices</p>
                          {quoteInvoices.map((inv) => (
                            <div key={inv.invoice_id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-slate-500">{inv.invoice_code}</span>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                  inv.status === 'PAID' ? 'text-emerald-700' : 'text-amber-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${inv.status === 'PAID' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                                  {inv.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-slate-800">{formatMoney(inv.amount)}</span>
                                {inv.status !== 'PAID' && (
                                  <button
                                    type="button"
                                    onClick={() => setPaymentModalInvoice(inv)}
                                    className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                                  >
                                    <CreditCard className="h-3 w-3" /> Pay
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {quoteInvoices.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPreviewQuote(q)}
                            title="Preview what's included in each invoice"
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Eye className="h-3 w-3" /> Preview Invoice Contents
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={downloadingQuoteId === q.quote_id}
                          onClick={() => handleDownload(q)}
                          title="Download quotation PDF"
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {downloadingQuoteId === q.quote_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          Download Quote PDF
                        </button>
                        <button
                          type="button"
                          disabled={sendingQuoteId === q.quote_id}
                          onClick={() => handleSend(q)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {sendingQuoteId === q.quote_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                          {quoteInvoices.length === 0 ? 'Send via WhatsApp' : 'Resend via WhatsApp'}
                        </button>
                        {q.linked_quote_id && (
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/quotations/${q.linked_quote_id}`)}
                            title="Also includes service request charges — open the linked service quote"
                            className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            Open Linked Service Quote{q.linked_estimate_number ? ` (${q.linked_estimate_number})` : ''}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
            <p className="text-xs text-slate-400">
              Showing {(page - 1) * QUOTE_PAGE_SIZE + 1}–{Math.min(page * QUOTE_PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-medium text-slate-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {quoteModalOpen && (
        <NewProductQuoteModal
          onClose={() => setQuoteModalOpen(false)}
          onCreated={() => { setQuoteModalOpen(false); fetchAll(); }}
        />
      )}

      {paymentModalInvoice && (
        <RecordInvoicePaymentModal
          invoice={paymentModalInvoice}
          onClose={() => setPaymentModalInvoice(null)}
          onRecorded={() => { setPaymentModalInvoice(null); fetchAll(); }}
        />
      )}

      {previewQuote && (
        <InvoicePreviewModal
          quote={previewQuote}
          invoices={invoicesForQuote(previewQuote.quote_id)}
          onClose={() => setPreviewQuote(null)}
        />
      )}

      {vendorPromptQuote && (
        <VendorPaymentPromptModal
          quote={vendorPromptQuote}
          submitting={busyQuoteId === vendorPromptQuote.quote_id}
          onClose={() => setVendorPromptQuote(null)}
          onConfirm={(vendorPayments) => handleAcceptWithVendorPayments(vendorPromptQuote.quote_id, vendorPayments)}
        />
      )}
    </>
  );
}

// Shown when accepting a PRODUCT quote that has one or more line items backed
// by a vendor-sourced product. For each such item the admin decides whether
// to pay the vendor now (from a company bank account) or leave it as an
// unpaid balance owed to the vendor, settled later from the Vendors page.
// The chosen amount defaults to the line's cost-price snapshot (COGS), editable.
function VendorPaymentPromptModal({ quote, submitting, onClose, onConfirm }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const vendorItems = (quote.line_items || []).filter((li) => li.vendor_id);

  const [decisions, setDecisions] = useState(() => {
    const initial = {};
    for (const li of vendorItems) {
      const defaultAmount = parseFloat(li.cost_price_snapshot ?? li.product_cost_price ?? 0) * parseFloat(li.quantity || 1);
      initial[li.line_item_id] = {
        pay_now: false,
        amount: defaultAmount || 0,
        payment_method: 'CASH',
        bank_account_id: '',
        cheque_number: '',
        cheque_date: '',
      };
    }
    return initial;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
  }, []);

  const updateDecision = (lineItemId, patch) => {
    setDecisions((prev) => ({ ...prev, [lineItemId]: { ...prev[lineItemId], ...patch } }));
  };

  const handleConfirm = () => {
    setError('');
    for (const li of vendorItems) {
      const d = decisions[li.line_item_id];
      if (!d.pay_now) continue;
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && !d.bank_account_id) {
        setError(`Select a bank account for "${li.description}"`);
        return;
      }
      if (d.payment_method === 'CHEQUE' && (!d.cheque_number || !d.cheque_date)) {
        setError(`Cheque number and date are required for "${li.description}"`);
        return;
      }
    }
    onConfirm(decisions);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Vendor Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">This quote includes items sourced from a vendor. Decide how to settle each one.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {vendorItems.map((li) => {
            const d = decisions[li.line_item_id];
            return (
              <div key={li.line_item_id} className="rounded-lg border border-slate-200 p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{li.description}</p>
                  <span className="text-xs text-slate-400">Vendor: {li.vendor_name}</span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="block text-[11px] font-medium text-slate-500">Amount owed</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={d.amount}
                    onChange={(e) => updateDecision(li.line_item_id, { amount: e.target.value })}
                    onWheel={(e) => e.target.blur()}
                    className="w-32 rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1 text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDecision(li.line_item_id, { pay_now: false })}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      !d.pay_now ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Leave Unpaid
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDecision(li.line_item_id, { pay_now: true })}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      d.pay_now ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Pay Now
                  </button>
                </div>

                {d.pay_now && (
                  <div className="space-y-2 border-t border-slate-100 pt-2.5">
                    <select
                      value={d.payment_method}
                      onChange={(e) => updateDecision(li.line_item_id, { payment_method: e.target.value })}
                      className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    >
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>

                    {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(d.payment_method) && (
                      <select
                        value={d.bank_account_id}
                        onChange={(e) => updateDecision(li.line_item_id, { bank_account_id: e.target.value })}
                        className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="">Select bank account…</option>
                        {bankAccounts.map((b) => (
                          <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                        ))}
                      </select>
                    )}

                    {d.payment_method === 'CHEQUE' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Cheque number"
                          value={d.cheque_number}
                          onChange={(e) => updateDecision(li.line_item_id, { cheque_number: e.target.value })}
                          className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                        <DateInput
                          value={d.cheque_date}
                          onChange={(e) => updateDecision(li.line_item_id, { cheque_date: e.target.value })}
                          className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Accept Quote
          </button>
        </div>
      </div>
    </div>
  );
}

// Shows which of the quote's line items landed on each of its invoices.
// Non-rental lines (ITEM purchases + standalone deposits) all land on the
// one combined PRODUCT-category invoice. Each RENTAL line item instead gets
// its own agreement and its own invoice — rather than trying to re-match a
// rental invoice back to "its" line item (fragile if a quote has two rental
// lines for the same product), the rental agreement itself (product, unit,
// rate, deposit) is fetched directly and used as the source of truth.
function InvoicePreviewModal({ quote, invoices, onClose }) {
  const [lineItems, setLineItems] = useState([]);
  const [rentalDetails, setRentalDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const quoteRes = await apiClient.getProductQuote(quote.quote_id);
        const items = Array.isArray(quoteRes?.data?.line_items) ? quoteRes.data.line_items : [];
        if (!cancelled) setLineItems(items);

        const rentalInvoices = invoices.filter((inv) => inv.rental_agreement_id);
        const agreementEntries = await Promise.all(
          rentalInvoices.map(async (inv) => {
            try {
              const res = await apiClient.getRentalAgreement(inv.rental_agreement_id);
              return [inv.rental_agreement_id, res?.data || null];
            } catch {
              return [inv.rental_agreement_id, null];
            }
          })
        );
        if (!cancelled) setRentalDetails(Object.fromEntries(agreementEntries));
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load invoice items');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [quote.quote_id, invoices]);

  const nonRentalItems = lineItems.filter((li) => !li.rental_billing_type);

  const itemsForInvoice = (inv) => {
    if (inv.category === 'PRODUCT') return nonRentalItems;
    const agreement = rentalDetails[inv.rental_agreement_id];
    if (!agreement) return [];
    const items = [{
      description: `${agreement.product_name} — Unit ${agreement.unit_code} (${agreement.billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time'})`,
      quantity: 1,
      amount: agreement.rate,
    }];
    if (Number(agreement.deposit_amount) > 0) {
      items.push({
        description: `Refundable Deposit — ${agreement.product_name} (Unit ${agreement.unit_code})`,
        quantity: 1,
        amount: agreement.deposit_amount,
      });
    }
    return items;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Invoice Contents — {quote.estimate_number}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            invoices.map((inv) => {
              const items = itemsForInvoice(inv);
              return (
                <div key={inv.invoice_id} className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-700">{inv.invoice_code}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                        inv.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800">{formatMoney(inv.amount)}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-slate-400">No items resolved for this invoice.</p>
                    ) : (
                      items.map((li, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                          <span className="text-slate-700">
                            {li.description}{Number(li.quantity) > 1 ? ` × ${li.quantity}` : ''}
                          </span>
                          <span className="shrink-0 font-medium text-slate-800">{formatMoney(li.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const emptyLineItem = () => ({
  description: '', quantity: 1, unit_price: '', product_id: '', unit_id: '',
  rental_billing_type: 'ONE_TIME', rental_start_date: new Date().toISOString().slice(0, 10),
  rental_end_date: '', deposit_amount: '',
});

// A standalone refundable deposit — held by the company independent of any
// rental item (e.g. a general security deposit). Distinct from the
// per-rental-item deposit_amount field on a RENTAL line.
const emptyDepositLine = () => ({
  description: 'Refundable Deposit', quantity: 1, unit_price: '', isStandaloneDeposit: true,
});

const CLIENTS_PER_PAGE = 5;

function NewProductQuoteModal({ onClose, onCreated }) {
  const [recipientType, setRecipientType] = useState('client'); // 'client' | 'walk_in'
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientPage, setClientPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [walkInClient, setWalkInClient] = useState(emptyWalkInClient());
  const [products, setProducts] = useState([]);
  const [rentalUnits, setRentalUnits] = useState([]);
  const [lineItems, setLineItems] = useState([emptyLineItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getAllClients().then((res) => setClients(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []))).catch(() => setClients([]));
    apiClient.getProducts().then((res) => setProducts(Array.isArray(res?.data) ? res.data : [])).catch(() => setProducts([]));
    apiClient.getRentalUnits({ status: 'AVAILABLE' }).then((res) => setRentalUnits(Array.isArray(res?.data) ? res.data : [])).catch(() => setRentalUnits([]));
  }, []);

  const isRentalLine = (it) => products.find((p) => p.product_id === it.product_id)?.product_type === 'RENTAL';

  const filteredClients = clients.filter((c) => {
    const name = c.full_name || c.client_name || '';
    return name.toLowerCase().includes(clientSearch.toLowerCase());
  });

  useEffect(() => { setClientPage(1); }, [clientSearch]);

  const clientTotalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PER_PAGE));
  const pagedClients = filteredClients.slice((clientPage - 1) * CLIENTS_PER_PAGE, clientPage * CLIENTS_PER_PAGE);

  const updateLineItem = (idx, patch) => {
    setLineItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addLineItem = () => setLineItems((items) => [...items, emptyLineItem()]);
  const removeLineItem = (idx) => setLineItems((items) => items.filter((_, i) => i !== idx));

  const selectProductForLine = (idx, productId) => {
    const product = products.find((p) => p.product_id === productId);
    updateLineItem(idx, {
      product_id: productId,
      description: product ? product.name : '',
      unit_price: product ? product.price : '',
      unit_id: '',
    });
  };

  const total = lineItems.reduce((sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0), 0);
  const totalDeposit = lineItems.reduce((sum, it) => sum + (isRentalLine(it) ? (parseFloat(it.deposit_amount) || 0) : 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (recipientType === 'client' && !selectedClientId) {
      setError('Please select a client');
      return;
    }
    if (recipientType === 'walk_in' && !walkInClient.full_name.trim()) {
      setError('Please enter the walk-in customer\'s full name');
      return;
    }
    if (recipientType === 'walk_in' && !walkInClient.gender) {
      setError('Please select the walk-in customer\'s gender');
      return;
    }
    if (recipientType === 'walk_in' && !walkInClient.mobile_number.trim()) {
      setError('Please enter the walk-in customer\'s mobile number — it registers them as a client');
      return;
    }
    const validItems = lineItems.filter((it) => it.description && it.unit_price !== '');
    if (validItems.length === 0) {
      setError('Add at least one line item with a description and price');
      return;
    }
    for (const it of validItems) {
      if (isRentalLine(it) && it.rental_billing_type === 'ONE_TIME' && !it.rental_end_date) {
        setError(`End date is required for the one-time rental item "${it.description}"`);
        return;
      }
    }

    setSaving(true);
    try {
      let walkInClientId = null;
      if (recipientType === 'walk_in') {
        const wicRes = await apiClient.createWalkInCustomer({
          full_name: walkInClient.full_name.trim(),
          email: walkInClient.email || undefined,
          mobile_number: walkInClient.mobile_number.trim(),
          gender: walkInClient.gender,
          primary_address: walkInClient.primary_address || undefined,
          client_type: walkInClient.client_type || 'INDIVIDUAL',
          honorific: walkInClient.honorific || undefined,
          company_name: walkInClient.company_name || undefined,
          display_name_source: walkInClient.client_type === 'CORPORATE_PROXY' && walkInClient.company_name
            ? walkInClient.display_name_source
            : 'FULL_NAME',
        });
        walkInClientId = wicRes.data.client_profile_id;
      }

      await apiClient.createProductQuotation({
        client_id: recipientType === 'client' ? selectedClientId : walkInClientId || undefined,
        line_items: validItems.map((it) => {
          if (it.isStandaloneDeposit) {
            return {
              item_type: 'DEPOSIT',
              description: it.description,
              quantity: 1,
              unit_price: parseFloat(it.unit_price) || 0,
            };
          }
          const rental = isRentalLine(it);
          return {
            item_type: rental ? 'RENTAL' : 'PRODUCT',
            description: it.description,
            quantity: parseFloat(it.quantity) || 1,
            unit_price: parseFloat(it.unit_price) || 0,
            product_id: it.product_id || undefined,
            ...(rental ? {
              unit_id: it.unit_id || undefined,
              rental_billing_type: it.rental_billing_type,
              rental_start_date: it.rental_start_date,
              rental_end_date: it.rental_billing_type === 'ONE_TIME' ? it.rental_end_date : undefined,
              deposit_amount: it.deposit_amount ? parseFloat(it.deposit_amount) : 0,
            } : {}),
          };
        }),
      });

      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
          <h3 className="text-sm font-semibold text-slate-800">New Product Quotation</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-3">
              {[
                { id: 'client', label: 'Existing Client' },
                { id: 'walk_in', label: 'Walk-in Customer' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRecipientType(id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    recipientType === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {recipientType === 'client' ? (
              <div>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clients…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 pl-8 pr-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="rounded-md border border-slate-300 divide-y divide-slate-100 overflow-hidden">
                  {pagedClients.length === 0 ? (
                    <p className="px-2.5 py-3 text-xs text-slate-400 text-center">No clients match your search.</p>
                  ) : (
                    pagedClients.map((c) => {
                      const id = c.client_profile_id || c.client_id;
                      const selected = selectedClientId === id;
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => setSelectedClientId(id)}
                          className={`w-full text-left px-2.5 py-1.5 text-sm transition-colors ${
                            selected ? 'bg-blue-50 text-blue-700 font-medium' : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {c.full_name || c.client_name} {c.mobile_number ? <span className="text-xs text-slate-400">· {c.mobile_number}</span> : ''}
                        </button>
                      );
                    })
                  )}
                </div>
                {filteredClients.length > CLIENTS_PER_PAGE && (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                    <button
                      type="button"
                      onClick={() => setClientPage((p) => Math.max(1, p - 1))}
                      disabled={clientPage === 1}
                      className="rounded px-2 py-1 font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Prev
                    </button>
                    <span>Page {clientPage} of {clientTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setClientPage((p) => Math.min(clientTotalPages, p + 1))}
                      disabled={clientPage === clientTotalPages}
                      className="rounded px-2 py-1 font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <WalkInClientFields value={walkInClient} onChange={setWalkInClient} />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-medium text-slate-500">Line Items</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setLineItems((items) => [...items, emptyDepositLine()])} className="text-xs font-medium text-amber-600 hover:underline">
                  + Add refundable deposit
                </button>
                <button type="button" onClick={addLineItem} className="text-xs font-medium text-blue-600 hover:underline">
                  + Add line
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {lineItems.map((it, idx) => {
                if (it.isStandaloneDeposit) {
                  return (
                    <div key={idx} className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-40 shrink-0 text-[11px] font-semibold text-amber-700">Refundable Deposit</span>
                        <input
                          type="text"
                          placeholder="Description"
                          value={it.description}
                          onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                          className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Amount"
                          value={it.unit_price}
                          onChange={(e) => updateLineItem(idx, { unit_price: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                        />
                        {lineItems.length > 1 && (
                          <button type="button" onClick={() => removeLineItem(idx)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="mt-1 pl-[10.5rem] text-[10px] text-amber-600">
                        Held by the company regardless of any rental item; refund or forfeit later from the Deposits tab.
                      </p>
                    </div>
                  );
                }
                const rental = isRentalLine(it);
                return (
                  <div key={idx} className={rental ? 'rounded-lg border border-purple-100 bg-purple-50/40 p-2.5 space-y-2' : ''}>
                    <div className="flex items-center gap-2">
                      <select
                        value={it.product_id}
                        onChange={(e) => selectProductForLine(idx, e.target.value)}
                        className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-xs outline-none focus:border-blue-500"
                      >
                        <option value="">Custom item…</option>
                        {products.map((p) => (
                          <option key={p.product_id} value={p.product_id}>{p.name}{p.product_type === 'RENTAL' ? ' (Rental)' : p.product_type === 'ONE_TIME_SERVICE' ? ' (Service)' : ''}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Description"
                        value={it.description}
                        onChange={(e) => updateLineItem(idx, { description: e.target.value })}
                        className="flex-1 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => updateLineItem(idx, { quantity: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="w-16 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit price"
                        value={it.unit_price}
                        onChange={(e) => updateLineItem(idx, { unit_price: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="w-28 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                      {lineItems.length > 1 && (
                        <button type="button" onClick={() => removeLineItem(idx)} className="text-slate-400 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {rental && (
                      <div className="pl-1 space-y-2">
                        <p className="text-[11px] font-semibold text-purple-700">Rental Terms for this item</p>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Specific Unit</label>
                          <select
                            value={it.unit_id || ''}
                            onChange={(e) => updateLineItem(idx, { unit_id: e.target.value })}
                            className="w-56 rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                          >
                            <option value="">Auto-assign any available unit</option>
                            {rentalUnits.filter((u) => u.product_id === it.product_id).map((u) => (
                              <option key={u.unit_id} value={u.unit_id}>{u.unit_code || u.unit_id.slice(0, 8)}</option>
                            ))}
                          </select>
                          {it.product_id && rentalUnits.filter((u) => u.product_id === it.product_id).length === 0 && (
                            <p className="mt-0.5 text-[10px] text-amber-600">No units currently available for this product.</p>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Billing</label>
                            <select
                              value={it.rental_billing_type}
                              onChange={(e) => updateLineItem(idx, { rental_billing_type: e.target.value })}
                              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                            >
                              <option value="ONE_TIME">One-time</option>
                              <option value="RECURRING">Monthly</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Start Date</label>
                            <DateInput
                              value={it.rental_start_date}
                              onChange={(e) => updateLineItem(idx, { rental_start_date: e.target.value })}
                              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                            />
                          </div>
                          {it.rental_billing_type === 'ONE_TIME' && (
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">End Date *</label>
                              <DateInput
                                value={it.rental_end_date}
                                onChange={(e) => updateLineItem(idx, { rental_end_date: e.target.value })}
                                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2 py-1 text-xs outline-none focus:border-blue-500"
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Refundable Deposit (optional)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={it.deposit_amount}
                            onChange={(e) => updateLineItem(idx, { deposit_amount: e.target.value })}
                            onWheel={(e) => e.target.blur()}
                            className="w-40 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2 py-1 text-xs outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-right text-sm font-semibold text-slate-800">
              Total: {formatMoney(total)}
              {totalDeposit > 0 && (
                <span className="block text-xs font-normal text-slate-400">
                  + {formatMoney(totalDeposit)} refundable deposit(s) = {formatMoney(total + totalDeposit)} across first invoice(s)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 shrink-0">
          <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create Quotation
          </button>
        </div>
      </form>
    </>
  );
}

function RecordInvoicePaymentModal({ invoice, onClose, onRecorded }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [slipFile, setSlipFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && !bankAccountId) {
      setError('Please select a bank account');
      return;
    }
    if (paymentMethod === 'CHEQUE' && (!chequeNumber || !chequeDate)) {
      setError('Cheque number and date are required');
      return;
    }

    setSaving(true);
    try {
      await apiClient.recordProductInvoicePayment(
        invoice.invoice_id,
        {
          payment_method: paymentMethod,
          bank_account_id: bankAccountId || undefined,
          cheque_number: chequeNumber || undefined,
          cheque_date: chequeDate || undefined,
          reference_number: referenceNumber || undefined,
          notes: notes || undefined,
        },
        slipFile
      );
      onRecorded();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">
            Record Payment — {invoice.invoice_code} ({formatMoney(invoice.amount)})
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>

          {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(paymentMethod) && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Bank Account</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Select…</option>
                {bankAccounts.map((b) => (
                  <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                ))}
              </select>
            </div>
          )}

          {paymentMethod === 'CHEQUE' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Cheque number"
                value={chequeNumber}
                onChange={(e) => setChequeNumber(e.target.value)}
                className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              />
              <DateInput
                value={chequeDate}
                onChange={(e) => setChequeDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Reference Number</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Slip / Receipt (optional)</label>
            <input type="file" onChange={(e) => setSlipFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-600" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== RENTALS TAB ====================

const RENTAL_AGREEMENT_STATUS_COLORS = {
  ACTIVE: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  COMPLETED: { dot: 'bg-slate-400', text: 'text-slate-500' },
  CANCELLED: { dot: 'bg-red-400', text: 'text-red-600' },
};

const DEPOSIT_STATUS_DOT = {
  HELD: { dot: 'bg-amber-400', text: 'text-amber-700' },
  REFUNDED: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  PARTIALLY_REFUNDED: { dot: 'bg-violet-500', text: 'text-violet-700' },
  FORFEITED: { dot: 'bg-red-400', text: 'text-red-600' },
};

// Shared refund modal — lets the admin pick which company bank account a
// bank-transfer refund is paid from, so the debit shows up correctly against
// that account's ledger/reconciliation (previously refunds were never linked
// to any bank account at all).
// Full amount is refunded by default; the admin can lower it to refund only
// part of the deposit and keep ("forfeit") the rest as a charge — e.g. a
// repair or transport fee deducted from the deposit before returning it.
export function RefundDepositModal({ deposit, onClose, onRefunded }) {
  const totalAmount = parseFloat(deposit.amount) || 0;
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [refundAmount, setRefundAmount] = useState(String(totalAmount));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
  }, []);

  const refundAmt = parseFloat(refundAmount) || 0;
  const retainedAmt = Math.max(0, Math.round((totalAmount - refundAmt) * 100) / 100);
  const isPartial = retainedAmt > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (refundAmt <= 0 || refundAmt > totalAmount) {
      setError(`Refund amount must be greater than 0 and at most ${formatMoney(totalAmount)}`);
      return;
    }
    if (paymentMethod === 'BANK_TRANSFER' && !bankAccountId) {
      setError('Please select a bank account');
      return;
    }

    setSaving(true);
    try {
      await apiClient.refundDeposit(deposit.deposit_id, {
        payment_method: paymentMethod,
        company_bank_account_id: bankAccountId || undefined,
        notes: notes || undefined,
        refund_amount: refundAmt,
      });
      onRefunded();
    } catch (err) {
      setError(err.message || 'Failed to refund deposit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Refund Deposit — {formatMoney(totalAmount)} held</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Amount to Refund</label>
            <input
              type="number"
              min="0.01"
              max={totalAmount}
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              onWheel={(e) => e.target.blur()}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
            {isPartial && (
              <p className="mt-1 text-[11px] text-amber-600">
                {formatMoney(retainedAmt)} will be kept by the company as a charge instead of returned.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Refund Via</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </select>
          </div>

          {paymentMethod === 'BANK_TRANSFER' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Refund From (Company Bank Account)</label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Select…</option>
                {bankAccounts.map((b) => (
                  <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Notes{isPartial ? ' (reason for withheld amount)' : ''}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isPartial ? 'e.g. repair fee, transport fee' : undefined}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPartial ? 'Confirm Partial Refund' : 'Confirm Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Mirror of RefundDepositModal for the forfeit direction: full amount is
// kept by default, but the admin can lower it to keep only part and refund
// the rest back to the client (which then needs a payment method/account,
// same as a regular refund).
export function ForfeitDepositModal({ deposit, onClose, onForfeited }) {
  const totalAmount = parseFloat(deposit.amount) || 0;
  const [bankAccounts, setBankAccounts] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [bankAccountId, setBankAccountId] = useState('');
  const [forfeitAmount, setForfeitAmount] = useState(String(totalAmount));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
  }, []);

  const forfeitAmt = parseFloat(forfeitAmount) || 0;
  const refundAmt = Math.max(0, Math.round((totalAmount - forfeitAmt) * 100) / 100);
  const isPartial = refundAmt > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (forfeitAmt <= 0 || forfeitAmt > totalAmount) {
      setError(`Forfeit amount must be greater than 0 and at most ${formatMoney(totalAmount)}`);
      return;
    }
    if (isPartial && paymentMethod === 'BANK_TRANSFER' && !bankAccountId) {
      setError('Please select a bank account');
      return;
    }

    setSaving(true);
    try {
      await apiClient.forfeitDeposit(deposit.deposit_id, {
        forfeit_amount: forfeitAmt,
        notes: notes || undefined,
        payment_method: isPartial ? paymentMethod : undefined,
        company_bank_account_id: isPartial ? (bankAccountId || undefined) : undefined,
      });
      onForfeited();
    } catch (err) {
      setError(err.message || 'Failed to forfeit deposit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Forfeit Deposit — {formatMoney(totalAmount)} held</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Amount to Keep (Forfeit)</label>
            <input
              type="number"
              min="0.01"
              max={totalAmount}
              step="0.01"
              value={forfeitAmount}
              onChange={(e) => setForfeitAmount(e.target.value)}
              onWheel={(e) => e.target.blur()}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {isPartial
                ? `The remaining ${formatMoney(refundAmt)} will be refunded back to the client.`
                : 'The full deposit stays with the company — no refund transaction is created.'}
            </p>
          </div>

          {isPartial && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Refund Remainder Via</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                >
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                </select>
              </div>

              {paymentMethod === 'BANK_TRANSFER' && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Refund From (Company Bank Account)</label>
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Select…</option>
                    {bankAccounts.map((b) => (
                      <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Reason{isPartial ? ' (for withheld amount)' : ' (optional)'}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isPartial ? 'e.g. repair fee, transport fee' : undefined}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPartial ? 'Confirm Partial Forfeit' : 'Confirm Forfeit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RentalsTab() {
  const [subTab, setSubTab] = useState('agreements'); // 'agreements' | 'deposits'
  const [rentalProducts, setRentalProducts] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [agreementModalOpen, setAgreementModalOpen] = useState(false);
  const [detailAgreementId, setDetailAgreementId] = useState(null);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, agrRes] = await Promise.all([
        apiClient.getProducts({ product_type: 'RENTAL', include_unavailable: 'true' }),
        apiClient.getRentalAgreements(),
      ]);
      setRentalProducts(Array.isArray(prodRes?.data) ? prodRes.data : []);
      setAgreements(Array.isArray(agrRes?.data) ? agrRes.data : []);
    } catch {
      setRentalProducts([]);
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const recipientName = (a) => a.client_name || a.walk_in_name || '—';

  return (
    <>
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 w-fit">
        {[
          { id: 'agreements', label: 'Agreements' },
          { id: 'deposits', label: 'Refundable Deposits' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              subTab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'deposits' ? (
        <DepositsPanel />
      ) : rentalProducts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No RENTAL-type products yet. Create one in the Catalog tab first, then come back here to add rental units and agreements.
        </div>
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={() => setAgreementModalOpen(true)} className={primaryBtnCls}>
              <Plus className="h-4 w-4" /> New Rental Agreement
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading rental agreements…
              </div>
            ) : agreements.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
                <Repeat className="h-8 w-8" />
                <p className="text-sm font-medium">No rental agreements yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product / Unit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deposit</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Next / End</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {agreements.map((a) => (
                      <tr key={a.rental_agreement_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900">{a.product_name}</span>
                          <span className="block text-xs text-slate-400">{a.unit_code || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {recipientName(a)}
                          {a.walk_in_name && <span className="ml-1.5 text-[10px] text-amber-600">(walk-in)</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${a.billing_type === 'RECURRING' ? 'text-violet-700' : 'text-blue-700'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${a.billing_type === 'RECURRING' ? 'bg-violet-500' : 'bg-blue-400'}`} />
                            {a.billing_type === 'RECURRING' ? 'Monthly' : 'One-time'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(a.rate)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {a.deposit_id ? (
                            (() => {
                              const cfg = DEPOSIT_STATUS_DOT[a.deposit_status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                              return (
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                  {formatMoney(a.deposit_collected_amount)} · {a.deposit_status}
                                </span>
                              );
                            })()
                          ) : Number(a.deposit_amount) > 0 ? (
                            <span className="text-xs text-slate-400">Pending payment</span>
                          ) : (
                            <span className="text-xs text-slate-300">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {(() => {
                            const cfg = RENTAL_AGREEMENT_STATUS_COLORS[a.status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                            return (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                                {a.status}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDate(a.billing_type === 'RECURRING' ? a.next_invoice_date : a.end_date)}
                          {a.status === 'ACTIVE' && (
                            <DaysRemainingBadge date={a.billing_type === 'RECURRING' ? a.next_invoice_date : a.end_date} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" onClick={() => setDetailAgreementId(a.rental_agreement_id)} className={ghostBtnCls}>
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {agreementModalOpen && (
        <NewRentalAgreementModal
          rentalProducts={rentalProducts}
          onClose={() => setAgreementModalOpen(false)}
          onCreated={() => { setAgreementModalOpen(false); fetchAll(); }}
        />
      )}

      {detailAgreementId && (
        <RentalAgreementDetailModal
          rentalAgreementId={detailAgreementId}
          onClose={() => setDetailAgreementId(null)}
          onChanged={fetchAll}
        />
      )}
    </>
  );
}

// Flat, global view of every deposit across all rental agreements — the admin
// doesn't have to drill into each agreement individually to see what's held,
// refund it, or write it off. Defaults to HELD since that's the actionable set;
// a status filter reveals the REFUNDED/FORFEITED history for audit purposes.
function DepositsPanel() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('HELD');
  const [forfeitTarget, setForfeitTarget] = useState(null);
  const [refundTarget, setRefundTarget] = useState(null);
  const [error, setError] = useState('');

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getDeposits(statusFilter ? { status: statusFilter } : {});
      setDeposits(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchDeposits(); }, [fetchDeposits]);

  const recipientName = (d) => d.client_name || d.walk_in_name || '—';

  return (
    <>
      <div className="flex gap-0.5 rounded-lg bg-slate-100 p-1 w-fit">
        {[
          { id: 'HELD', label: 'Held' },
          { id: 'REFUNDED', label: 'Refunded' },
          { id: 'PARTIALLY_REFUNDED', label: 'Partially Refunded' },
          { id: 'FORFEITED', label: 'Forfeited' },
          { id: '', label: 'All' },
        ].map(({ id, label }) => (
          <button
            key={id || 'ALL'}
            type="button"
            onClick={() => setStatusFilter(id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
              statusFilter === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading deposits…
          </div>
        ) : deposits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <Wallet className="h-8 w-8" />
            <p className="text-sm font-medium">No {statusFilter ? statusFilter.toLowerCase() : ''} deposits</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Held Since</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Recipient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Product / Unit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deposits.map((d) => {
                  const cfg = DEPOSIT_STATUS_DOT[d.status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                  return (
                    <tr key={d.deposit_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{formatDate(d.held_at)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {recipientName(d)}
                        {d.walk_in_name && <span className="ml-1.5 text-[10px] text-amber-600">(walk-in)</span>}
                      </td>
                      <td className="px-4 py-3">
                        {d.product_name ? (
                          <>
                            <span className="font-medium text-slate-800">{d.product_name}</span>
                            <span className="block text-xs text-slate-400">{d.unit_code || '—'}</span>
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> General Deposit
                            </span>
                            <span className="block text-xs text-slate-400 mt-0.5">{d.description || '—'}{d.estimate_number ? ` · ${d.estimate_number}` : ''}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{formatMoney(d.amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d.status === 'HELD' ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRefundTarget(d)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" /> Refund
                            </button>
                            <button
                              type="button"
                              onClick={() => setForfeitTarget(d)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Forfeit
                            </button>
                          </div>
                        ) : d.status === 'REFUNDED' ? (
                          <span className="text-emerald-600 text-xs font-medium">Refunded {formatDate(d.refunded_at)}</span>
                        ) : d.status === 'PARTIALLY_REFUNDED' ? (
                          <span className="text-violet-600 text-xs font-medium">
                            Refunded {formatMoney(d.refunded_amount)}, kept {formatMoney(d.forfeited_amount)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Forfeited{d.notes ? ` — ${d.notes}` : ''}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {forfeitTarget && (
        <ForfeitDepositModal
          deposit={forfeitTarget}
          onClose={() => setForfeitTarget(null)}
          onForfeited={() => { setForfeitTarget(null); fetchDeposits(); }}
        />
      )}

      {refundTarget && (
        <RefundDepositModal
          deposit={refundTarget}
          onClose={() => setRefundTarget(null)}
          onRefunded={() => { setRefundTarget(null); fetchDeposits(); }}
        />
      )}
    </>
  );
}

function NewRentalAgreementModal({ rentalProducts, onClose, onCreated }) {
  const [productId, setProductId] = useState(rentalProducts[0]?.product_id || '');
  const [recipientType, setRecipientType] = useState('client');
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [walkInClient, setWalkInClient] = useState(emptyWalkInClient());
  const [billingType, setBillingType] = useState('ONE_TIME');
  const [rate, setRate] = useState(rentalProducts[0]?.price || '');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedProduct = rentalProducts.find((p) => p.product_id === productId);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [vendorPayNow, setVendorPayNow] = useState(false);
  const [vendorAmount, setVendorAmount] = useState('');
  const [vendorPaymentMethod, setVendorPaymentMethod] = useState('CASH');
  const [vendorBankAccountId, setVendorBankAccountId] = useState('');
  const [vendorChequeNumber, setVendorChequeNumber] = useState('');
  const [vendorChequeDate, setVendorChequeDate] = useState('');

  useEffect(() => {
    apiClient.getAllClients().then((res) => setClients(Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []))).catch(() => setClients([]));
    apiClient.getBankAccounts().then((res) => setBankAccounts(Array.isArray(res?.data) ? res.data : [])).catch(() => setBankAccounts([]));
  }, []);

  useEffect(() => {
    setVendorAmount(selectedProduct?.cost_price || '');
    setVendorPayNow(false);
  }, [productId]);

  const filteredClients = clients.filter((c) => (c.full_name || c.client_name || '').toLowerCase().includes(clientSearch.toLowerCase()));

  const handleProductChange = (id) => {
    setProductId(id);
    const product = rentalProducts.find((p) => p.product_id === id);
    if (product) setRate(product.price);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!productId) { setError('Please select a rental product'); return; }
    if (recipientType === 'client' && !selectedClientId) { setError('Please select a client'); return; }
    if (recipientType === 'walk_in' && !walkInClient.full_name.trim()) { setError('Please enter the walk-in customer\'s full name'); return; }
    if (recipientType === 'walk_in' && !walkInClient.gender) { setError('Please select the walk-in customer\'s gender'); return; }
    if (recipientType === 'walk_in' && !walkInClient.mobile_number.trim()) { setError('Please enter the walk-in customer\'s mobile number — it registers them as a client'); return; }
    if (!rate || parseFloat(rate) <= 0) { setError('Rate must be greater than zero'); return; }
    if (billingType === 'ONE_TIME' && !endDate) { setError('End date is required for a one-time rental'); return; }
    if (selectedProduct?.vendor_id && vendorPayNow) {
      if (['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(vendorPaymentMethod) && !vendorBankAccountId) {
        setError('Please select a bank account for the vendor payment'); return;
      }
      if (vendorPaymentMethod === 'CHEQUE' && (!vendorChequeNumber || !vendorChequeDate)) {
        setError('Cheque number and date are required for the vendor payment'); return;
      }
    }

    setSaving(true);
    try {
      let walkInClientId = null;
      if (recipientType === 'walk_in') {
        const wicRes = await apiClient.createWalkInCustomer({
          full_name: walkInClient.full_name.trim(),
          email: walkInClient.email || undefined,
          mobile_number: walkInClient.mobile_number.trim(),
          gender: walkInClient.gender,
          primary_address: walkInClient.primary_address || undefined,
          client_type: walkInClient.client_type || 'INDIVIDUAL',
          honorific: walkInClient.honorific || undefined,
          company_name: walkInClient.company_name || undefined,
          display_name_source: walkInClient.client_type === 'CORPORATE_PROXY' && walkInClient.company_name
            ? walkInClient.display_name_source
            : 'FULL_NAME',
        });
        walkInClientId = wicRes.data.client_profile_id;
      }

      await apiClient.createRentalAgreement({
        product_id: productId,
        client_id: recipientType === 'client' ? selectedClientId : walkInClientId || undefined,
        billing_type: billingType,
        rate: parseFloat(rate),
        start_date: startDate,
        end_date: billingType === 'ONE_TIME' ? endDate : undefined,
        deposit_amount: depositAmount ? parseFloat(depositAmount) : 0,
        vendor_payment: selectedProduct?.vendor_id ? {
          pay_now: vendorPayNow,
          amount: vendorAmount || undefined,
          payment_method: vendorPaymentMethod,
          bank_account_id: vendorBankAccountId || undefined,
          cheque_number: vendorChequeNumber || undefined,
          cheque_date: vendorChequeDate || undefined,
        } : undefined,
      });

      onCreated();
    } catch (err) {
      setError(err.message || 'Failed to create rental agreement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">New Rental Agreement</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Rental Product</label>
            <select
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              {rentalProducts.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-400">The next available unit for this product will be assigned automatically.</p>
          </div>

          <div>
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit mb-3">
              {[{ id: 'client', label: 'Existing Client' }, { id: 'walk_in', label: 'Walk-in Customer' }].map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRecipientType(id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${recipientType === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {recipientType === 'client' ? (
              <div>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clients…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 pl-8 pr-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <select
                  size={4}
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                >
                  {filteredClients.map((c) => (
                    <option key={c.client_profile_id || c.client_id} value={c.client_profile_id || c.client_id}>
                      {c.full_name || c.client_name} {c.mobile_number ? `· ${c.mobile_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <WalkInClientFields value={walkInClient} onChange={setWalkInClient} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Billing</label>
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              >
                <option value="ONE_TIME">One-time (fixed period)</option>
                <option value="RECURRING">Recurring (monthly)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                {billingType === 'RECURRING' ? 'Rate / month *' : 'Total Rate *'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                onWheel={(e) => e.target.blur()}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Start Date</label>
              <DateInput
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
              />
            </div>
            {billingType === 'ONE_TIME' && (
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">End Date *</label>
                <DateInput
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {selectedProduct?.vendor_id && (
            <div className="rounded-lg border border-slate-200 p-3 space-y-2.5">
              <p className="text-xs font-medium text-slate-700">
                This unit is sourced from vendor <span className="font-semibold">{selectedProduct.vendor_name}</span>. How will you pay them?
              </p>

              <div className="flex items-center gap-3">
                <label className="block text-[11px] font-medium text-slate-500">Amount owed</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vendorAmount}
                  onChange={(e) => setVendorAmount(e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  className="w-32 rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVendorPayNow(false)}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    !vendorPayNow ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Leave Unpaid
                </button>
                <button
                  type="button"
                  onClick={() => setVendorPayNow(true)}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    vendorPayNow ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  Pay Now
                </button>
              </div>

              {vendorPayNow && (
                <div className="space-y-2 border-t border-slate-100 pt-2.5">
                  <select
                    value={vendorPaymentMethod}
                    onChange={(e) => setVendorPaymentMethod(e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  >
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>

                  {['BANK_TRANSFER', 'CASH_DEPOSIT'].includes(vendorPaymentMethod) && (
                    <select
                      value={vendorBankAccountId}
                      onChange={(e) => setVendorBankAccountId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="">Select bank account…</option>
                      {bankAccounts.map((b) => (
                        <option key={b.account_id} value={b.account_id}>{b.account_nickname} — {b.bank_name}</option>
                      ))}
                    </select>
                  )}

                  {vendorPaymentMethod === 'CHEQUE' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Cheque number"
                        value={vendorChequeNumber}
                        onChange={(e) => setVendorChequeNumber(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                      <DateInput
                        value={vendorChequeDate}
                        onChange={(e) => setVendorChequeDate(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white text-slate-800 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Refundable Deposit (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              onWheel={(e) => e.target.blur()}
              className="w-48 rounded-md border border-slate-300 bg-white text-slate-800 placeholder-slate-400 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-[11px] text-slate-400">Bundled into the first invoice and held once that invoice is paid.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Agreement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RentalAgreementDetailModal({ rentalAgreementId, onClose, onChanged }) {
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState(null);
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getRentalAgreement(rentalAgreementId);
      setAgreement(res?.data || null);
    } catch {
      setError('Failed to load rental agreement');
    } finally {
      setLoading(false);
    }
  }, [rentalAgreementId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleReturn = async () => {
    if (!window.confirm('Mark this unit as returned? This ends the rental agreement.')) return;
    setBusy(true);
    setError('');
    try {
      await apiClient.returnRentalUnit(rentalAgreementId);
      await fetchDetail();
      onChanged();
    } catch (err) {
      setError(err.message || 'Failed to mark as returned');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Rental Agreement</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
            </div>
          )}

          {loading || !agreement ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Product / Unit</p>
                  <p className="font-medium text-slate-800">{agreement.product_name} — {agreement.unit_code || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Recipient</p>
                  <p className="font-medium text-slate-800">{agreement.client_name || agreement.walk_in_name || '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Billing</p>
                  <p className="font-medium text-slate-800">{agreement.billing_type === 'RECURRING' ? `${formatMoney(agreement.rate)} / month` : `${formatMoney(agreement.rate)} one-time`}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Status</p>
                  {(() => {
                    const cfg = RENTAL_AGREEMENT_STATUS_COLORS[agreement.status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                    return (
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {agreement.status}
                      </span>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400">Start Date</p>
                  <p className="text-slate-700">{formatDate(agreement.start_date)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate-400">{agreement.billing_type === 'RECURRING' ? 'Next Invoice' : 'End Date'}</p>
                  <p className="text-slate-700">{formatDate(agreement.billing_type === 'RECURRING' ? agreement.next_invoice_date : agreement.end_date)}</p>
                </div>
              </div>

              {agreement.status === 'ACTIVE' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleReturn}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Mark Unit as Returned
                </button>
              )}

              {/* Deposit */}
              {(agreement.deposit_id || Number(agreement.deposit_amount) > 0) && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" /> Refundable Deposit
                    </p>
                    {agreement.deposit_status && (() => {
                      const cfg = DEPOSIT_STATUS_DOT[agreement.deposit_status] || { dot: 'bg-slate-400', text: 'text-slate-500' };
                      return (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          {agreement.deposit_status}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    {agreement.deposit_id ? formatMoney(agreement.deposit_collected_amount) : `${formatMoney(agreement.deposit_amount)} (not yet collected)`}
                  </p>

                  {agreement.deposit_id && agreement.deposit_status === 'HELD' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setShowRefundModal(true)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" /> Refund Deposit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setShowForfeitModal(true)}
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        Forfeit Deposit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Invoices */}
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-2">Invoices</p>
                {agreement.invoices?.length === 0 ? (
                  <p className="text-sm text-slate-400">No invoices yet.</p>
                ) : (
                  <div className="space-y-2">
                    {agreement.invoices.map((inv) => (
                      <div key={inv.invoice_id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{inv.invoice_code}</p>
                          <p className="text-[11px] text-slate-400">
                            {formatDate(inv.billing_period_start)} – {formatDate(inv.billing_period_end)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{formatMoney(inv.amount)}</span>
                          {inv.status === 'PAID' ? (
                            <span className="text-emerald-600 text-xs font-medium">Paid</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPaymentModalInvoice(inv)}
                              className="inline-flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              <CreditCard className="h-3 w-3" /> Record Payment
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {paymentModalInvoice && (
        <RecordInvoicePaymentModal
          invoice={paymentModalInvoice}
          onClose={() => setPaymentModalInvoice(null)}
          onRecorded={() => { setPaymentModalInvoice(null); fetchDetail(); onChanged(); }}
        />
      )}

      {showRefundModal && agreement?.deposit_id && (
        <RefundDepositModal
          deposit={{ deposit_id: agreement.deposit_id, amount: agreement.deposit_collected_amount }}
          onClose={() => setShowRefundModal(false)}
          onRefunded={() => { setShowRefundModal(false); fetchDetail(); onChanged(); }}
        />
      )}

      {showForfeitModal && agreement?.deposit_id && (
        <ForfeitDepositModal
          deposit={{ deposit_id: agreement.deposit_id, amount: agreement.deposit_collected_amount }}
          onClose={() => setShowForfeitModal(false)}
          onForfeited={() => { setShowForfeitModal(false); fetchDetail(); onChanged(); }}
        />
      )}
    </div>
  );
}
