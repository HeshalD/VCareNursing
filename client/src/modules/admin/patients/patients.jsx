import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Search, Plus, Pencil, Trash2, X, ChevronDown, ChevronRight,
  HeartPulse, Phone, User, Shield, AlertCircle, Loader2,
  CheckCircle, ChevronLeft, ExternalLink
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

// ─── Small reusable components ──────────────────────────────────────────────


const Field = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
    <p className="text-sm text-slate-800">{value || '—'}</p>
  </div>
);

// ─── Care Profile Form Modal ─────────────────────────────────────────────────

const PatientModal = ({ mode, initial, clients, onClose, onSave, saving }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {mode === 'add' ? 'Add New Care Profile' : 'Edit Care Profile'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {mode === 'add' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client (Payer) <span className="text-red-500">*</span>
              </label>
              <select
                value={form.client_id}
                onChange={(e) => set('client_id', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.client_id ? 'border-red-400' : 'border-slate-300'
                }`}
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.client_profile_id} value={c.client_profile_id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
              {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.full_name ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="150"
                value={form.age}
                onChange={(e) => set('age', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  errors.age ? 'border-red-400' : 'border-slate-300'
                }`}
              />
              {errors.age && <p className="text-xs text-red-500 mt-1">{errors.age}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
              <select
                value={form.gender || ''}
                onChange={(e) => set('gender', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">— Select —</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Relationship to Client</label>
              <input
                type="text"
                placeholder="e.g. Friend, Parent"
                value={form.relationship_to_client}
                onChange={(e) => set('relationship_to_client', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Medical Condition</label>
              <textarea
                rows={2}
                value={form.medical_condition}
                onChange={(e) => set('medical_condition', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Residential Address</label>
              <input
                type="text"
                value={form.residential_address}
                onChange={(e) => set('residential_address', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Name</label>
              <input
                type="text"
                value={form.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact No.</label>
              <input
                type="tel"
                value={form.emergency_contact_number}
                onChange={(e) => set('emergency_contact_number', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'add' ? 'Add Care Profile' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Delete Confirm Modal ────────────────────────────────────────────────────

const DeleteModal = ({ patient, onClose, onConfirm, deleting }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Delete Care Profile</h2>
          <p className="text-sm text-slate-500">This action cannot be undone.</p>
        </div>
      </div>
      <p className="text-sm text-slate-700 mb-6">
        Are you sure you want to delete <span className="font-semibold">{patient.full_name}</span>?
        Care Profiles with active bookings cannot be deleted.
      </p>
      <div className="flex justify-end gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={deleting}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
        >
          {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── Patient Row ─────────────────────────────────────────────────────────────

const PatientRow = ({ patient, proxyMode, onEdit, onDelete, onView }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-teal-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{patient.full_name}</p>
            <p className="text-xs text-slate-500">
              {patient.age ? `Age ${patient.age}` : 'Age —'}
              {patient.gender ? ` · ${genderLabel(patient.gender)}` : ''}
              {patient.relationship_to_client ? ` · ${patient.relationship_to_client}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            onClick={(e) => { e.stopPropagation(); onView(patient); }}
            className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors"
            title="View Profile"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          {proxyMode && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(patient); }}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(patient); }}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-4">
          <Field label="Gender" value={genderLabel(patient.gender)} />
          <Field label="Medical Condition" value={patient.medical_condition} />
          <Field label="Residential Address" value={patient.residential_address} />
          <Field label="Emergency Contact" value={patient.emergency_contact_name} />
          <Field label="Emergency No." value={patient.emergency_contact_number} />
          <Field label="Registered On" value={fmt(patient.created_at)} />
        </div>
      )}
    </div>
  );
};

// ─── Client Group ────────────────────────────────────────────────────────────

const ClientGroup = ({ clientName, clientMobile, patients, proxyMode, onEdit, onDelete, onView }) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 mb-3 group"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700 transition-colors">
          {clientName || 'Unknown Client'}
        </span>
        {clientMobile && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Phone className="w-3 h-3" /> {clientMobile}
          </span>
        )}
        <span className="ml-1 text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
          {patients.length} care profile{patients.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div className="space-y-2 pl-6">
          {patients.map((p) => (
            <PatientRow
              key={p.patient_id}
              patient={p}
              proxyMode={proxyMode}
              onEdit={onEdit}
              onDelete={onDelete}
              onView={onView}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const LIMIT = 20;

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
    <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-200">
      <p className="text-sm text-slate-500">
        Showing <strong className="text-slate-700">{start}–{end}</strong> of{' '}
        <strong className="text-slate-700">{total}</strong> care profiles
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-slate-400 text-sm">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-teal-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
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

  // Modal state
  const [addModal, setAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

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
      setAddModal(false);
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AdminLayout title="Care Profiles" subtitle="All registered care profiles, grouped by client">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all ${
            toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="p-6 max-w-4xl mx-auto">
        {/* Header controls */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by care profile name, client, condition, or address…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            {canProxy && (
              <>
                <button
                  onClick={() => setProxyMode((v) => !v)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    proxyMode
                      ? 'bg-violet-600 text-white border-violet-600 shadow-md'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  {proxyMode ? 'Proxy On' : 'Proxy Mode'}
                </button>
                {proxyMode && (
                  <button
                    onClick={() => setAddModal(true)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Care Profile
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 mb-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-teal-600" />
            <strong className="text-slate-800">{pagination.total}</strong> care profile{pagination.total !== 1 ? 's' : ''} total
          </span>
          {proxyMode && (
            <span className="ml-auto flex items-center gap-1.5 text-violet-600 font-semibold">
              <Shield className="w-3.5 h-3.5" /> Proxy mode active
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-slate-600 font-medium">{error}</p>
            <button
              onClick={() => loadPatients(page, search)}
              className="mt-4 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700"
            >
              Retry
            </button>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <HeartPulse className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              {search ? 'No care profiles match your search.' : 'No care profiles registered yet.'}
            </p>
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([key, group]) => (
              <ClientGroup
                key={key}
                clientName={group.clientName}
                clientMobile={group.clientMobile}
                patients={group.patients}
                proxyMode={proxyMode}
                onEdit={(p) => setEditTarget(p)}
                onDelete={(p) => setDeleteTarget(p)}
                onView={(p) => navigate(`/admin/patients/${p.patient_id}/detail`)}
              />
            ))}
            <Pagination
              page={page}
              totalPages={totalPages}
              total={pagination.total}
              limit={LIMIT}
              onPage={setPage}
            />
          </>
        )}
      </div>

      {/* Add Modal */}
      {addModal && (
        <PatientModal
          mode="add"
          initial={EMPTY_FORM}
          clients={clients}
          onClose={() => setAddModal(false)}
          onSave={handleAdd}
          saving={saving}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <PatientModal
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
    </AdminLayout>
  );
}
