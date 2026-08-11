import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Plus, Pencil, Trash2, X, ChevronRight,
  User, Shield, AlertCircle, Loader2,
  CheckCircle, ChevronLeft, ExternalLink, HeartPulse,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const fmt = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const EMPTY_FORM = {
  client_id: '',
  full_name: '',
  age: '',
  gender: '',
  relationship_to_client: '',
  medical_condition: '',
  residential_address: '',
  emergency_contact_name: '',
  emergency_contact_number: '',
};

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const genderLabel = (g) => GENDER_OPTIONS.find((o) => o.value === g)?.label || '—';

const LIMIT = 20;

// ─── Design tokens (shared across admin pages) ───────────────────────────────

const inputCls = (hasError) =>
  `w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-500 transition-colors ${
    hasError
      ? 'border-red-400 bg-red-50 focus:ring-red-100'
      : 'border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:ring-blue-100'
  }`;
const primaryBtnCls = 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const SectionHeader = ({ title }) => (
  <div className="px-5 pt-5 pb-2.5 border-b border-slate-100">
    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
  </div>
);

const Field = ({ label, required, error, children }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
  </div>
);

// ─── Proxy mode toggle — same switch used on service_requests.jsx ───────────

const ProxyModeToggle = ({ active, onToggle }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 border border-slate-200 bg-white rounded-lg">
    <Shield className={`w-3.5 h-3.5 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
    <span className={`text-sm font-medium ${active ? 'text-emerald-700' : 'text-slate-500'}`}>Proxy Mode</span>
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={active}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        active ? 'bg-emerald-500' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          active ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

// ─── Searchable client combobox (used in Add Care Profile) ──────────────────

const ClientCombobox = ({ clients, value, onChange, hasError }) => {
  const selected = clients.find((c) => String(c.client_profile_id) === String(value));
  const [query, setQuery] = useState(selected ? selected.full_name : '');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const match = clients.find((c) => String(c.client_profile_id) === String(value));
    setQuery(match ? match.full_name : '');
  }, [value, clients]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = clients.filter((c) =>
    (c.full_name || '').toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        placeholder="Search client by name…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        className={inputCls(hasError)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {filtered.map((c) => (
            <button
              type="button"
              key={c.client_profile_id}
              onClick={() => {
                onChange(c.client_profile_id);
                setQuery(c.full_name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 transition-colors"
            >
              {c.full_name}
            </button>
          ))}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400">
          No clients match "{query}"
        </div>
      )}
    </div>
  );
};

// ─── Add / Edit Care Profile drawer ──────────────────────────────────────────

const PatientDrawer = ({ mode, initial, clients, onClose, onSave, saving }) => {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Name is required';
    if (!form.age || isNaN(form.age) || Number(form.age) <= 0) e.age = 'Valid age required';
    if (mode === 'add' && !form.client_id) e.client_id = 'Client is required';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />

      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-slate-900">
            {mode === 'add' ? 'Add Care Profile' : 'Edit Care Profile'}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} id="patient-drawer-form" className="flex-1 overflow-y-auto">
          {mode === 'add' && (
            <>
              <SectionHeader title="Client" />
              <div className="px-5 pt-4 pb-2">
                <Field label="Client (Payer)" required error={errors.client_id}>
                  <ClientCombobox
                    clients={clients}
                    value={form.client_id}
                    onChange={(v) => set('client_id', v)}
                    hasError={!!errors.client_id}
                  />
                </Field>
              </div>
            </>
          )}

          <SectionHeader title="Personal Information" />
          <div className="px-5 pt-4 pb-2 space-y-3">
            <Field label="Full Name" required error={errors.full_name}>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                className={inputCls(!!errors.full_name)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age" required error={errors.age}>
                <input
                  type="number" min="0" max="150"
                  value={form.age}
                  onChange={(e) => set('age', e.target.value)}
                  onWheel={(e) => e.target.blur()}
                  className={inputCls(!!errors.age)}
                />
              </Field>
              <Field label="Gender">
                <select value={form.gender || ''} onChange={(e) => set('gender', e.target.value)} className={inputCls(false)}>
                  <option value="">— Select —</option>
                  {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Relationship to Client">
              <input
                type="text"
                placeholder="e.g. Friend, Parent"
                value={form.relationship_to_client}
                onChange={(e) => set('relationship_to_client', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <SectionHeader title="Care Details" />
          <div className="px-5 pt-4 pb-2 space-y-3">
            <Field label="Medical Condition">
              <textarea
                rows={2}
                value={form.medical_condition}
                onChange={(e) => set('medical_condition', e.target.value)}
                className={`${inputCls(false)} resize-none`}
              />
            </Field>
            <Field label="Residential Address">
              <input
                type="text"
                value={form.residential_address}
                onChange={(e) => set('residential_address', e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <SectionHeader title="Emergency Contact" />
          <div className="px-5 pt-4 pb-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Name">
                <input
                  type="text"
                  value={form.emergency_contact_name}
                  onChange={(e) => set('emergency_contact_name', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
              <Field label="Contact Number">
                <input
                  type="tel"
                  value={form.emergency_contact_number}
                  onChange={(e) => set('emergency_contact_number', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="patient-drawer-form"
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'add' ? 'Add Care Profile' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Delete Confirm Modal ────────────────────────────────────────────────────

const DeleteModal = ({ patient, onClose, onConfirm, deleting }) => {
  const [confirmText, setConfirmText] = useState('');
  const nameMatches = confirmText.trim() === (patient.full_name || '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Delete Care Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Are you sure you want to delete <span className="font-semibold text-slate-800">{patient.full_name}</span>?
          Care Profiles with active bookings cannot be deleted.
        </p>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          Type <span className="font-semibold text-slate-800">{patient.full_name}</span> to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={patient.full_name}
          autoFocus
          className={`${inputCls(false)} mb-6`}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || !nameMatches}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Nested table: client row → care-profile sub-table ──────────────────────

const ClientRow = ({ clientName, clientMobile, patients, proxyMode, selectMode, selectedIds, onToggleSelect, onEdit, onDelete, onView, colSpan }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr onClick={() => setOpen((v) => !v)} className="cursor-pointer hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ChevronRight className={`w-3.5 h-3.5 text-slate-300 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
            <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <span className="font-semibold text-slate-900">{clientName || 'Unknown Client'}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-500">{clientMobile || '—'}</td>
        <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{patients.length}</td>
      </tr>

      {open && (
        <tr>
          <td colSpan={colSpan} className="bg-slate-50 px-4 py-3">
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {proxyMode && selectMode && <th className="px-4 py-2.5 w-8" />}
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profile</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Age / Gender</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Relationship</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Medical Condition</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Emergency Contact</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Registered</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map((p) => (
                    <tr
                      key={p.patient_id}
                      onClick={proxyMode && selectMode ? () => onToggleSelect(p.patient_id) : undefined}
                      className={`hover:bg-slate-50 transition-colors ${proxyMode && selectMode ? 'cursor-pointer' : ''}`}
                    >
                      {proxyMode && selectMode && (
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.patient_id)}
                            onChange={() => onToggleSelect(p.patient_id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900 leading-tight">{p.full_name}</p>
                        {p.patient_code && <p className="text-xs text-slate-400 font-mono">{p.patient_code}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                        {p.age ? `${p.age}` : '—'}{p.gender ? ` · ${genderLabel(p.gender)}` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{p.relationship_to_client || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate" title={p.medical_condition}>
                        {p.medical_condition || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {p.emergency_contact_name || '—'}
                        {p.emergency_contact_number && <span className="block text-xs text-slate-400">{p.emergency_contact_number}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmt(p.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => onView(p)} title="View Profile" className={iconBtnCls}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          {proxyMode && (
                            <>
                              <button onClick={() => onEdit(p)} title="Edit" className={iconBtnCls}>
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDelete(p)}
                                title="Delete"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ─── Bulk Delete Confirm Modal ───────────────────────────────────────────────

const BulkDeleteModal = ({ count, onClose, onConfirm, deleting, error }) => {
  const [confirmText, setConfirmText] = useState('');
  const matches = confirmText.trim().toLowerCase() === 'confirm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Delete {count} care profile{count !== 1 ? 's' : ''}?</h2>
            <p className="text-xs text-slate-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          This permanently deletes the selected care profile{count !== 1 ? 's' : ''}.
          Care Profiles with active bookings cannot be deleted.
        </p>

        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          Type <span className="font-semibold text-slate-800">confirm</span> to proceed
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="confirm"
          autoFocus
          className={`${inputCls(false)} mb-6`}
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting || !matches}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Pagination controls ─────────────────────────────────────────────────────

const Pagination = ({ page, totalPages, total, limit, onPage }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left  = Math.max(1, page - delta);
  const right = Math.min(totalPages, page + delta);

  if (left > 1)        { pages.push(1); if (left > 2) pages.push('…'); }
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages) { if (right < totalPages - 1) pages.push('…'); pages.push(totalPages); }

  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  return (
    <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
      <p className="text-xs text-slate-400">
        Showing <span className="font-medium text-slate-600">{start}–{end}</span> of{' '}
        <span className="font-medium text-slate-600">{total}</span> care profiles
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1.5 text-slate-400 text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                p === page ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const { adminUser } = useAdminAuth();
  const navigate = useNavigate();

  // Admin panel login already gates on SUPER_ADMIN only, so any logged-in adminUser is authorized.
  const canProxy = !!adminUser;

  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: LIMIT });
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [proxyMode, setProxyMode] = useState(false);
  const debounceRef = useRef(null);

  // Drawer / modal state
  const [addDrawer, setAddDrawer] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadPatients = useCallback(async (pg = page, q = search) => {
    try {
      setLoading(true);
      setError(null);
      const params = { page: pg, limit: LIMIT };
      if (q) params.search = q;
      const res = await apiClient.getAllPatients(params);
      setPatients(res.data || []);
      setPagination(res.pagination || { total: 0, page: pg, limit: LIMIT });
    } catch (err) {
      setError(err.message || 'Failed to load care profiles');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { loadPatients(page, search); }, [page, search]);

  // Clear selection whenever the underlying list changes to avoid acting on stale rows.
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, patients]);

  useEffect(() => {
    if (!proxyMode) { setSelectMode(false); setSelectedIds(new Set()); }
  }, [proxyMode]);

  // Debounce search input — reset to page 1 when query changes
  const handleSearchChange = (val) => {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(val);
    }, 350);
  };

  useEffect(() => {
    if (canProxy) {
      apiClient.getAllClients().then((res) => setClients(res.data || [])).catch(() => {});
    }
  }, [canProxy]);

  // Group current page's patients by client
  const grouped = patients.reduce((acc, p) => {
    const key = p.client_id || '__none__';
    if (!acc[key]) acc[key] = { clientName: p.client_name, clientMobile: p.client_mobile, patients: [] };
    acc[key].patients.push(p);
    return acc;
  }, {});

  const totalPages = Math.max(1, Math.ceil(pagination.total / LIMIT));

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAdd = async (form) => {
    setSaving(true);
    try {
      await apiClient.createPatient({ ...form, age: Number(form.age) });
      showToast('Care Profile added successfully');
      setAddDrawer(false);
      loadPatients(page, search);
    } catch (err) {
      showToast(err.message || 'Failed to add care profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (form) => {
    setSaving(true);
    try {
      await apiClient.updatePatient(editTarget.patient_id, { ...form, age: Number(form.age) });
      showToast('Care Profile updated successfully');
      setEditTarget(null);
      loadPatients(page, search);
    } catch (err) {
      showToast(err.message || 'Failed to update care profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiClient.deletePatient(deleteTarget.patient_id);
      showToast('Care Profile deleted');
      setDeleteTarget(null);
      // If we deleted the last item on a non-first page, go back one
      const newTotal = pagination.total - 1;
      const newTotalPages = Math.max(1, Math.ceil(newTotal / LIMIT));
      const targetPage = page > newTotalPages ? newTotalPages : page;
      setPage(targetPage);
      loadPatients(targetPage, search);
    } catch (err) {
      showToast(err.message || 'Failed to delete care profile', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectMode = () => {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelect = (patientId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  };

  const openBulkDeleteConfirm = () => {
    setBulkDeleteError(null);
    setShowBulkDeleteConfirm(true);
  };

  const closeBulkDeleteConfirm = () => {
    if (bulkDeleting) return;
    setShowBulkDeleteConfirm(false);
    setBulkDeleteError(null);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map((id) => apiClient.deletePatient(id)));
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        setBulkDeleteError(
          failed.length === ids.length
            ? (failed[0].reason?.message || 'Failed to delete selected care profile(s).')
            : `${failed.length} of ${ids.length} care profile(s) could not be deleted. They may have active bookings.`
        );
      } else {
        showToast(`${ids.length} care profile${ids.length !== 1 ? 's' : ''} deleted`);
      }
      setSelectedIds(new Set());
      loadPatients(page, search);
      if (failed.length === 0) {
        setShowBulkDeleteConfirm(false);
      }
    } catch (err) {
      setBulkDeleteError(err.message || 'Failed to delete selected care profile(s).');
    } finally {
      setBulkDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AdminLayout
      title="Care Profiles"
      subtitle={`${pagination.total} care profile${pagination.total !== 1 ? 's' : ''} across all clients`}
      actions={
        canProxy && (
          <div className="flex items-center gap-2">
            <ProxyModeToggle active={proxyMode} onToggle={() => setProxyMode((v) => !v)} />
            {proxyMode && selectMode && selectedIds.size > 0 && (
              <button
                onClick={openBulkDeleteConfirm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedIds.size})
              </button>
            )}
            {proxyMode && (
              <button
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                  selectMode
                    ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
            {proxyMode && (
              <button onClick={() => setAddDrawer(true)} className={primaryBtnCls}>
                <Plus className="w-4 h-4" />
                Add Care Profile
              </button>
            )}
          </div>
        )
      }
    >
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="relative mb-4">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search by mobile number, patient name, or client name…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`${inputCls(false)} pl-8 max-w-md`}
        />
      </div>

      {/* Nested table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">{error}</p>
            <button onClick={() => loadPatients(page, search)} className={primaryBtnCls}>Retry</button>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <HeartPulse className="w-8 h-8 text-slate-200" />
            <p className="text-sm text-slate-400">
              {search ? 'No care profiles match your search.' : 'No care profiles registered yet.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Mobile</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Care Profiles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(grouped).map(([key, group]) => (
                    <ClientRow
                      key={key}
                      colSpan={3}
                      clientName={group.clientName}
                      clientMobile={group.clientMobile}
                      patients={group.patients}
                      proxyMode={proxyMode}
                      selectMode={selectMode}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      onEdit={(p) => setEditTarget(p)}
                      onDelete={(p) => setDeleteTarget(p)}
                      onView={(p) => navigate(`/admin/patients/${p.patient_id}/detail`)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={pagination.total} limit={LIMIT} onPage={setPage} />
          </>
        )}
      </div>

      {/* Add Drawer */}
      {addDrawer && (
        <PatientDrawer
          mode="add"
          initial={EMPTY_FORM}
          clients={clients}
          onClose={() => setAddDrawer(false)}
          onSave={handleAdd}
          saving={saving}
        />
      )}

      {/* Edit Drawer */}
      {editTarget && (
        <PatientDrawer
          mode="edit"
          initial={{
            full_name: editTarget.full_name || '',
            age: editTarget.age || '',
            gender: editTarget.gender || '',
            relationship_to_client: editTarget.relationship_to_client || '',
            medical_condition: editTarget.medical_condition || '',
            residential_address: editTarget.residential_address || '',
            emergency_contact_name: editTarget.emergency_contact_name || '',
            emergency_contact_number: editTarget.emergency_contact_number || '',
          }}
          clients={clients}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          saving={saving}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteModal
          patient={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}

      {/* Bulk Delete Modal */}
      {showBulkDeleteConfirm && (
        <BulkDeleteModal
          count={selectedIds.size}
          onClose={closeBulkDeleteConfirm}
          onConfirm={handleBulkDelete}
          deleting={bulkDeleting}
          error={bulkDeleteError}
        />
      )}
    </AdminLayout>
  );
}
