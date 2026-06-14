import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Loader2, AlertCircle, HeartPulse,
  User, Phone, MapPin, Stethoscope, CalendarDays, Users,
  Activity, CheckCircle, Clock, X, Star,
  ChevronRight
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });
const fmtMoney = (v) => money.format(Number(v || 0));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const genderLabel = (g) => GENDER_OPTIONS.find((o) => o.value === g)?.label || '—';

const BOOKING_STATUS_STYLES = {
  ACTIVE:     'bg-emerald-100 text-emerald-700',
  PENDING:    'bg-amber-100 text-amber-700',
  COMPLETED:  'bg-blue-100 text-blue-700',
  TERMINATED: 'bg-red-100 text-red-700',
  CANCELLED:  'bg-slate-100 text-slate-500',
};

const statusStyle = (s) => BOOKING_STATUS_STYLES[(s || '').toUpperCase()] || 'bg-slate-100 text-slate-500';

// ─── Small reusables ──────────────────────────────────────────────────────────

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm font-medium text-slate-800">{value || '—'}</p>
  </div>
);

const StatCard = ({ icon: Icon, label, value, tone = 'slate' }) => {
  const tones = {
    slate:   'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    blue:    'bg-blue-100 text-blue-700',
    violet:  'bg-violet-100 text-violet-700',
    amber:   'bg-amber-100 text-amber-700',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
};

const SectionTab = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
      active
        ? 'bg-teal-600 text-white shadow-md'
        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
    }`}
  >
    {label}
  </button>
);

const EmptyState = ({ icon: Icon = HeartPulse, message }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
    <Icon className="mx-auto mb-3 h-8 w-8 text-slate-300" />
    <p className="text-sm font-medium text-slate-500">{message}</p>
  </div>
);

// ─── Edit Modal ───────────────────────────────────────────────────────────────

const EditModal = ({ initial, onClose, onSave, saving }) => {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.full_name.trim()) e.full_name = 'Name is required';
    if (!form.age || isNaN(form.age) || Number(form.age) <= 0) e.age = 'Valid age required';
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
          <h2 className="text-lg font-bold text-slate-900">Edit Care Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text" value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors.full_name ? 'border-red-400' : 'border-slate-300'}`}
              />
              {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number" min="0" max="150" value={form.age}
                onChange={(e) => set('age', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${errors.age ? 'border-red-400' : 'border-slate-300'}`}
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
                type="text" placeholder="e.g. Friend, Parent" value={form.relationship_to_client}
                onChange={(e) => set('relationship_to_client', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Medical Condition</label>
              <textarea
                rows={2} value={form.medical_condition}
                onChange={(e) => set('medical_condition', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Residential Address</label>
              <input
                type="text" value={form.residential_address}
                onChange={(e) => set('residential_address', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact Name</label>
              <input
                type="text" value={form.emergency_contact_name}
                onChange={(e) => set('emergency_contact_name', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Emergency Contact No.</label>
              <input
                type="tel" value={form.emergency_contact_number}
                onChange={(e) => set('emergency_contact_number', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { adminUser } = useAdminAuth();
  const canEdit = !!adminUser;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [section, setSection] = useState('overview');

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getPatientDetail(patientId);
      setData(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load care profile details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [patientId]);

  const handleSave = async (form) => {
    setSaving(true);
    try {
      await apiClient.updatePatient(patientId, { ...form, age: Number(form.age) });
      showToast('Care Profile updated successfully');
      setEditOpen(false);
      await load();
    } catch (err) {
      showToast(err.message || 'Failed to update care profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Care Profile">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout title="Care Profile">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-semibold">{error || 'Care Profile not found'}</p>
          <button
            onClick={() => navigate('/admin/patients')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Care Profiles
          </button>
        </div>
      </AdminLayout>
    );
  }

  const { patient, bookings, active_bookings, staff_history, summary } = data;

  // ── Section renderers ─────────────────────────────────────────────────────

  const renderOverview = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-4">Care Profile Details</p>
        <div className="grid grid-cols-2 gap-4">
          <InfoRow label="Full Name" value={patient.full_name} />
          <InfoRow label="Age" value={patient.age ? `${patient.age} years` : null} />
          <InfoRow label="Gender" value={genderLabel(patient.gender)} />
          <InfoRow label="Relationship to Client" value={patient.relationship_to_client} />
          <div className="col-span-2">
            <InfoRow label="Medical Condition" value={patient.medical_condition} />
          </div>
          <div className="col-span-2">
            <InfoRow label="Residential Address" value={patient.residential_address} />
          </div>
          <InfoRow label="Emergency Contact" value={patient.emergency_contact_name} />
          <InfoRow label="Emergency No." value={patient.emergency_contact_number} />
          <InfoRow label="Registered On" value={fmt(patient.created_at)} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-4">Client (Payer)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <InfoRow label="Client Name" value={patient.client_name} />
          </div>
          <InfoRow label="Phone" value={patient.client_mobile} />
          <InfoRow label="Email" value={patient.client_email} />
          <div className="col-span-2">
            <InfoRow label="Address" value={patient.client_address} />
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200">
          <button
            onClick={() => navigate(`/admin/users/${patient.client_id}/detail`)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            View Client Profile <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderBookings = () => (
    <div className="space-y-3">
      {bookings.length === 0 ? (
        <EmptyState icon={CalendarDays} message="No bookings found for this care profile." />
      ) : (
        bookings.map((b) => {
          const end = b.actual_end_time || b.scheduled_end_time;
          const days = b.start_date
            ? Math.max(1, Math.ceil((new Date(end || new Date()) - new Date(b.start_date)) / 86400000))
            : null;
          const isOngoing = !end && !!b.start_date;

          return (
            <div key={b.booking_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">{b.service_type || 'Service Booking'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{b.service_model || '—'}</p>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(b.status)}`}>
                  {b.status || '—'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoRow label="Start Date" value={fmt(b.start_date)} />
                <InfoRow label="Assigned Staff" value={b.assigned_staff_name || 'Not assigned'} />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Duration</p>
                  {days !== null ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {days} {days === 1 ? 'day' : 'days'}
                      {isOngoing && <span className="text-blue-400"> (ongoing)</span>}
                    </span>
                  ) : (
                    <p className="text-sm font-medium text-slate-400">—</p>
                  )}
                </div>
                
                <InfoRow label="Amount Paid" value={fmtMoney(b.amount_paid)} />
                <InfoRow label="Balance" value={fmtMoney((b.amount_quotated || 0) - (b.amount_paid || 0))} />
                <InfoRow label="Daily Rate" value={b.daily_rate ? fmtMoney(b.daily_rate) : '—'} />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  View Booking <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const renderStaffHistory = () => (
    <div className="space-y-3">
      {staff_history.length === 0 ? (
        <EmptyState icon={Users} message="No staff have worked with this care profile yet." />
      ) : (
        staff_history.map((s) => (
          <div key={s.staff_profile_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <User className="h-5 w-5 text-teal-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{s.staff_name}</p>
                  <p className="text-xs text-slate-500">{s.designation || '—'}</p>
                </div>
              </div>
              {s.is_currently_active && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <Activity className="h-3 w-3" /> Currently Active
                </span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Days</p>
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-sm font-bold text-violet-700">
                  <Clock className="h-3.5 w-3.5" />
                  {s.total_days ?? '—'} {s.total_days === 1 ? 'day' : 'days'}
                </span>
              </div>
              <InfoRow label="Assignments" value={`${s.total_assignments} booking${s.total_assignments !== 1 ? 's' : ''}`} />
              <InfoRow label="First Worked" value={fmt(s.first_worked)} />
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => navigate(`/admin/staff/${s.staff_profile_id}/detail`)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Staff Profile <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <AdminLayout
      title="Care Profile"
      subtitle="Full care profile history, bookings and staff care record"
      actions={(
        <button
          onClick={() => navigate('/admin/patients')}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Care Profiles
        </button>
      )}
    >
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="space-y-6">
        {/* Profile header */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 px-6 py-6 text-white">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 flex-shrink-0">
                  <HeartPulse className="h-8 w-8 text-teal-200" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{patient.full_name}</h1>
                  {patient.patient_code && (
                    <p className="mt-0.5 text-sm font-mono text-teal-200">{patient.patient_code}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-teal-100">
                    {patient.age && (
                      <span className="inline-flex items-center gap-1.5">
                        <User className="h-4 w-4" /> {patient.age} years old
                      </span>
                    )}
                    {patient.medical_condition && (
                      <span className="inline-flex items-center gap-1.5">
                        <Stethoscope className="h-4 w-4" />
                        <span className="max-w-[240px] truncate">{patient.medical_condition}</span>
                      </span>
                    )}
                    {patient.residential_address && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" /> {patient.residential_address}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-teal-200">
                    Client: <span className="font-semibold text-white">{patient.client_name || '—'}</span>
                    {patient.client_mobile && (
                      <span className="ml-3 inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {patient.client_mobile}
                      </span>
                    )}
                    {patient.relationship_to_client && (
                      <span className="ml-3 text-teal-300">({patient.relationship_to_client})</span>
                    )}
                  </div>
                </div>
              </div>

              {canEdit && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/25 border border-white/20 self-start"
                >
                  <Pencil className="h-4 w-4" /> Edit Care Profile
                </button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5">
            <StatCard icon={CalendarDays} label="Total Bookings" value={summary.total_bookings} tone="blue" />
            <StatCard icon={Activity}     label="Active Bookings" value={summary.active_bookings} tone={summary.active_bookings > 0 ? 'emerald' : 'slate'} />
            <StatCard icon={Users}        label="Staff Members" value={summary.total_staff} tone="violet" />
            <StatCard icon={Star}         label="Registered" value={fmt(patient.created_at)} tone="amber" />
          </div>
        </div>

        {/* Active bookings alert */}
        {active_bookings.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
            <Activity className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-emerald-800">
              {active_bookings.length} active booking{active_bookings.length > 1 ? 's' : ''} currently running for this care profile.
              {active_bookings.some((b) => b.assigned_staff_name) && (
                <span className="font-normal ml-1">
                  Current staff: <strong>{active_bookings.map((b) => b.assigned_staff_name).filter(Boolean).join(', ')}</strong>
                </span>
              )}
            </p>
          </div>
        )}

        {/* Section tabs */}
        <div className="flex gap-2 flex-wrap">
          <SectionTab active={section === 'overview'} label="Overview" onClick={() => setSection('overview')} />
          <SectionTab active={section === 'bookings'} label={`Bookings (${bookings.length})`} onClick={() => setSection('bookings')} />
          <SectionTab active={section === 'staff'} label={`Staff History (${staff_history.length})`} onClick={() => setSection('staff')} />
        </div>

        {/* Section content */}
        <div>
          {section === 'overview' && renderOverview()}
          {section === 'bookings' && renderBookings()}
          {section === 'staff' && renderStaffHistory()}
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditModal
          initial={{
            full_name: patient.full_name || '',
            age: patient.age || '',
            gender: patient.gender || '',
            relationship_to_client: patient.relationship_to_client || '',
            medical_condition: patient.medical_condition || '',
            residential_address: patient.residential_address || '',
            emergency_contact_name: patient.emergency_contact_name || '',
            emergency_contact_number: patient.emergency_contact_number || '',
          }}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </AdminLayout>
  );
}
