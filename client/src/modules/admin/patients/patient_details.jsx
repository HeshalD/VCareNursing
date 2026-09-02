import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Pencil, Loader2, AlertCircle, HeartPulse,
  User, Phone, MapPin, Stethoscope, CalendarDays, Users, Briefcase,
  Activity, CheckCircle, Clock, ChevronDown, Check, Trash2, X,
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import AdminDirectBookingDrawer from '../bookings/AdminDirectBookingDrawer';
import { formatMobileNumber } from '../../../utils/phoneFormat';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v) =>
  v ? new Date(v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 });
const fmtMoney = (v) => money.format(Number(v || 0));

const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

const genderLabel = (g) => GENDER_OPTIONS.find((o) => o.value === g)?.label || '-';

// ─── Small reusables (mirrors client_detail_page.jsx) ────────────────────────

const InfoRow = ({ label, value }) => (
  <div>
    <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</p>
    <p className="mt-0.5 text-sm text-gray-800 font-medium">{value || '-'}</p>
  </div>
);

const SideNavItem = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-all border-l-2 ${
      active
        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
        : 'border-transparent text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span>{label}</span>
  </button>
);

const DataCard = ({ title, actions, children }) => (
  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
      <h3 className="text-[13px] font-semibold text-gray-700">{title}</h3>
      {actions}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const EmptyState = ({ icon: Icon = HeartPulse, title }) => (
  <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
    <Icon className="mx-auto mb-2 h-6 w-6 text-gray-300" />
    <p className="text-sm text-gray-400">{title}</p>
  </div>
);

const SectionList = ({ children }) => (
  <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white">
    {children}
  </div>
);

const ExpandableRow = ({ summary, actions, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex w-full items-center gap-2 px-5 py-3.5 transition-colors hover:bg-gray-50">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
          <div className="min-w-0 flex-1">{summary}</div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {actions}
      </div>
      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }) => {
  if (!status) return <span className="text-gray-400">-</span>;
  const s = status.toUpperCase();
  const cls =
    ['ACTIVE', 'COMPLETED'].includes(s)
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : ['PENDING'].includes(s)
      ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
      : ['CANCELLED', 'TERMINATED'].includes(s)
      ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'
      : 'bg-gray-100 text-gray-600 ring-1 ring-inset ring-gray-200';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
};

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { adminUser } = useAdminAuth();
  const canEdit = !!adminUser;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [sameAsClientAddress, setSameAsClientAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [toast, setToast] = useState(null);

  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsDropdownRef = useRef(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [showDirectBooking, setShowDirectBooking] = useState(false);

  useEffect(() => {
    if (!actionsOpen) return;
    const handler = (e) => {
      if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target)) setActionsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [actionsOpen]);

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

  const openEditProfile = () => {
    setProfileForm({
      full_name: data.patient.full_name || '',
      age: data.patient.age || '',
      gender: data.patient.gender || '',
      relationship_to_client: data.patient.relationship_to_client || '',
      medical_condition: data.patient.medical_condition || '',
      residential_address: data.patient.residential_address || '',
      emergency_contact_name: data.patient.emergency_contact_name || '',
      emergency_contact_number: data.patient.emergency_contact_number || '',
    });
    setSameAsClientAddress(false);
    setProfileError('');
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    if (!profileForm.full_name.trim()) { setProfileError('Full name is required.'); return; }
    if (!profileForm.age || isNaN(profileForm.age) || Number(profileForm.age) <= 0) { setProfileError('Valid age required.'); return; }
    setSaving(true);
    setProfileError('');
    try {
      await apiClient.updatePatient(patientId, { ...profileForm, age: Number(profileForm.age) });
      showToast('Care Profile updated successfully');
      setEditingProfile(false);
      await load();
    } catch (err) {
      setProfileError(err.message || 'Failed to update care profile');
    } finally {
      setSaving(false);
    }
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setDeleteConfirmText('');
    setDeleteError('');
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await apiClient.deletePatient(patientId);
      navigate('/admin/patients');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete care profile');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Care Profile" subtitle="Loading care profile...">
        <div className="flex min-h-[45vh] items-center justify-center rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center gap-3 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading care profile...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout title="Care Profile" subtitle="Unable to load care profile">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
          <p className="font-semibold text-sm">{error || 'Care Profile not found'}</p>
          <button
            onClick={() => navigate('/admin/patients')}
            className="mt-4 inline-flex items-center gap-1.5 rounded bg-red-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-red-700"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Care Profiles
          </button>
        </div>
      </AdminLayout>
    );
  }

  const { patient, bookings, active_bookings, staff_history, summary } = data;

  const sectionConfig = [
    { id: 'overview', label: 'Overview',      icon: Users },
    { id: 'bookings',  label: `Bookings (${bookings.length})`,     icon: CalendarDays },
    { id: 'staff',     label: `Staff History (${staff_history.length})`, icon: Briefcase },
  ];
  const activeNavSection = sectionConfig.find((s) => s.id === activeSection);
  const ActiveSectionIcon = activeNavSection?.icon;

  const renderOverview = () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <DataCard
        title="Care Profile Details"
        actions={canEdit && !editingProfile && (
          <button
            type="button"
            onClick={openEditProfile}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      >
        {editingProfile ? (
          <div className="space-y-3">
            {profileError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {profileError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                <input className={inputCls} value={profileForm.full_name} onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Age <span className="text-red-500">*</span></label>
                <input type="number" min="0" max="150" className={inputCls} value={profileForm.age} onChange={(e) => setProfileForm((f) => ({ ...f, age: e.target.value }))} onWheel={(e) => e.target.blur()} />
              </div>
              <div>
                <label className={labelCls}>Gender</label>
                <select className={inputCls} value={profileForm.gender} onChange={(e) => setProfileForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="">- Select -</option>
                  {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Relationship to Client</label>
                <input className={inputCls} value={profileForm.relationship_to_client} onChange={(e) => setProfileForm((f) => ({ ...f, relationship_to_client: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Medical Condition</label>
                <textarea rows={2} className={`${inputCls} resize-none`} value={profileForm.medical_condition} onChange={(e) => setProfileForm((f) => ({ ...f, medical_condition: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Residential Address</label>
                <input
                  className={`${inputCls} ${sameAsClientAddress ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}`}
                  value={profileForm.residential_address}
                  onChange={(e) => setProfileForm((f) => ({ ...f, residential_address: e.target.value }))}
                  disabled={sameAsClientAddress}
                />
                {data.patient.client_address && (
                  <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={sameAsClientAddress}
                      onChange={(e) => {
                        setSameAsClientAddress(e.target.checked);
                        if (e.target.checked) {
                          setProfileForm((f) => ({ ...f, residential_address: data.patient.client_address }));
                        }
                      }}
                    />
                    Same as client's address
                  </label>
                )}
              </div>
              <div>
                <label className={labelCls}>Emergency Contact Name</label>
                <input className={inputCls} value={profileForm.emergency_contact_name} onChange={(e) => setProfileForm((f) => ({ ...f, emergency_contact_name: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>Emergency Contact No.</label>
                <input type="tel" className={inputCls} value={profileForm.emergency_contact_number} onChange={(e) => setProfileForm((f) => ({ ...f, emergency_contact_number: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditingProfile(false)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="Full Name" value={patient.full_name} />
            <InfoRow label="Age" value={patient.age ? `${patient.age} years` : null} />
            <InfoRow label="Gender" value={genderLabel(patient.gender)} />
            <InfoRow label="Relationship to Client" value={patient.relationship_to_client} />
            <div className="col-span-2"><InfoRow label="Medical Condition" value={patient.medical_condition} /></div>
            <div className="col-span-2"><InfoRow label="Residential Address" value={patient.residential_address} /></div>
            <InfoRow label="Emergency Contact" value={patient.emergency_contact_name} />
            <InfoRow label="Emergency No." value={patient.emergency_contact_number} />
            <InfoRow label="Registered On" value={fmt(patient.created_at)} />
          </div>
        )}
      </DataCard>

      <DataCard title="Client (Payer)">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><InfoRow label="Client Name" value={patient.client_name} /></div>
          <InfoRow label="Phone" value={formatMobileNumber(patient.client_mobile)} />
          <InfoRow label="Email" value={patient.client_email} />
          <div className="col-span-2"><InfoRow label="Address" value={patient.client_address} /></div>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => navigate(`/admin/users/${patient.client_id}/detail`)}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowRight className="h-3.5 w-3.5" /> View Client Profile
          </button>
        </div>
      </DataCard>

      {active_bookings.length > 0 && (
        <div className="lg:col-span-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <Activity className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-800">
            <span className="font-semibold">{active_bookings.length} active booking{active_bookings.length > 1 ? 's' : ''}</span> currently running for this care profile.
            {active_bookings.some((b) => b.assigned_staff_name) && (
              <span className="ml-1">
                Current staff: <span className="font-semibold">{active_bookings.map((b) => b.assigned_staff_name).filter(Boolean).join(', ')}</span>
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );

  const renderBookings = () => (
    bookings.length === 0 ? (
      <EmptyState icon={CalendarDays} title="No bookings found for this care profile." />
    ) : (
      <SectionList>
        {bookings.map((b) => {
          const end = b.actual_end_time || b.scheduled_end_time;
          const days = b.start_date
            ? Math.max(1, Math.ceil((new Date(end || new Date()) - new Date(b.start_date)) / 86400000))
            : null;
          return (
            <ExpandableRow
              key={b.booking_id}
              summary={
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="font-semibold text-gray-900 text-sm">{b.service_type || 'Service Booking'}</span>
                  <StatusBadge status={b.status} />
                  <span className="text-sm text-gray-500">{fmt(b.start_date)}</span>
                  <span className="text-sm text-gray-500">{b.assigned_staff_name || 'Not assigned'}</span>
                  <span className="font-semibold text-gray-700 text-sm">{fmtMoney(b.amount_paid)}</span>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow label="Service Model" value={b.service_model} />
                <InfoRow label="Start Date" value={fmt(b.start_date)} />
                <InfoRow label="Assigned Staff" value={b.assigned_staff_name || 'Not assigned'} />
                <InfoRow label="Amount Paid" value={fmtMoney(b.amount_paid)} />
                <InfoRow label="Balance" value={fmtMoney((b.amount_quotated || 0) - (b.amount_paid || 0))} />
                <InfoRow label="Daily Rate" value={b.daily_rate ? fmtMoney(b.daily_rate) : '-'} />
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Duration</p>
                  <div className="mt-1">
                    {days !== null ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-100">
                        {days} {days === 1 ? 'day' : 'days'}
                        {!end && <span className="text-blue-400"> (ongoing)</span>}
                      </span>
                    ) : (
                      <span className="text-sm font-medium text-gray-400">-</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => navigate(`/admin/bookings/${b.booking_id}/detail`)}
                  className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ArrowRight className="h-3.5 w-3.5" /> View Booking
                </button>
              </div>
            </ExpandableRow>
          );
        })}
      </SectionList>
    )
  );

  const renderStaffHistory = () => (
    staff_history.length === 0 ? (
      <EmptyState icon={Users} title="No staff have worked with this care profile yet." />
    ) : (
      <SectionList>
        {staff_history.map((s) => (
          <ExpandableRow
            key={s.staff_profile_id}
            summary={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="font-semibold text-gray-900 text-sm">{s.staff_name}</span>
                <span className="text-sm text-gray-500">{s.designation || '-'}</span>
                {s.is_currently_active && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    <Check className="h-3 w-3" /> Currently Active
                  </span>
                )}
              </div>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Days</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-100">
                  <Clock className="h-3.5 w-3.5" />
                  {s.total_days ?? '-'} {s.total_days === 1 ? 'day' : 'days'}
                </span>
              </div>
              <InfoRow label="Assignments" value={`${s.total_assignments} booking${s.total_assignments !== 1 ? 's' : ''}`} />
              <InfoRow label="First Worked" value={fmt(s.first_worked)} />
            </div>
            <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => navigate(`/admin/staff/${s.staff_profile_id}/detail`)}
                className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <ArrowRight className="h-3.5 w-3.5" /> View Staff Profile
              </button>
            </div>
          </ExpandableRow>
        ))}
      </SectionList>
    )
  );

  const renderSection = () => {
    if (activeSection === 'bookings') return renderBookings();
    if (activeSection === 'staff') return renderStaffHistory();
    return renderOverview();
  };

  return (
    <AdminLayout title={patient.full_name || 'Care Profile'} subtitle={`Care Profile Code: ${patient.patient_code || patient.patient_id}`}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* ── Top action bar ── */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/admin/patients')}
            className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {canEdit && (
            <div className="relative" ref={actionsDropdownRef}>
              <button
                type="button"
                onClick={() => setActionsOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-blue-700"
              >
                Actions <ChevronDown className="h-4 w-4" />
              </button>

              {actionsOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {[
                    { label: 'Edit Profile', action: () => { setActiveSection('overview'); openEditProfile(); setActionsOpen(false); } },
                    { label: 'Create Booking', action: () => { setShowDirectBooking(true); setActionsOpen(false); } },
                    { label: 'Delete Profile', danger: true, action: () => { setDeleteModalOpen(true); setActionsOpen(false); } },
                  ].map(({ label, action, danger }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={action}
                      className={`w-full px-4 py-2 text-left text-[13px] hover:bg-gray-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Zoho Books-style profile header ── */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
                {(patient.full_name || 'C').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[17px] font-semibold text-gray-900">{patient.full_name}</h1>
                  {patient.patient_code && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-mono font-medium text-gray-500">{patient.patient_code}</span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-gray-400">
                  {patient.age && <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{patient.age} years{patient.gender ? ` · ${genderLabel(patient.gender)}` : ''}</span>}
                  {patient.medical_condition && (
                    <span className="flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" /><span className="max-w-[240px] truncate">{patient.medical_condition}</span></span>
                  )}
                  {patient.residential_address && (
                    <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /><span className="max-w-[240px] truncate">{patient.residential_address}</span></span>
                  )}
                </div>
                <div className="mt-1.5 text-[13px] text-gray-500">
                  Client: <span className="font-semibold text-gray-900">{patient.client_name || '-'}</span>
                  {patient.client_mobile && <span className="ml-3 inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{formatMobileNumber(patient.client_mobile)}</span>}
                  {patient.relationship_to_client && <span className="ml-3 text-gray-400">({patient.relationship_to_client})</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Snapshot strip */}
          <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-4">
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total Bookings</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{summary.total_bookings}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Active Bookings</p>
              <p className={`mt-0.5 text-sm font-semibold ${summary.active_bookings > 0 ? 'text-emerald-600' : 'text-gray-900'}`}>{summary.active_bookings}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Staff Members</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{summary.total_staff}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Registered</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">{fmt(patient.created_at)}</p>
            </div>
          </div>
        </div>

        {/* ── Sidebar + content ── */}
        <div className="flex items-start gap-4">
          <aside className="w-48 shrink-0">
            <div className="sticky top-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Sections</p>
              </div>
              <nav className="py-1">
                {sectionConfig.map((s) => (
                  <SideNavItem key={s.id} active={activeSection === s.id} icon={s.icon} label={s.label} onClick={() => setActiveSection(s.id)} />
                ))}
              </nav>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-5 py-3">
                {ActiveSectionIcon && <ActiveSectionIcon className="h-4 w-4 text-gray-400" />}
                <h2 className="text-[13px] font-semibold text-gray-700">{activeNavSection?.label}</h2>
              </div>
              <div className="p-5">
                {renderSection()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <AdminDirectBookingDrawer
        open={showDirectBooking}
        onClose={() => setShowDirectBooking(false)}
        onSuccess={() => load()}
        preselectedClientId={patient.client_id}
        preselectedClientName={patient.client_name}
        preselectedPatientId={patient.patient_id}
        preselectedPatientName={patient.full_name}
      />

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Delete Care Profile</h3>
              </div>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              {deleteError && (
                <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {deleteError}
                </div>
              )}
              <p className="text-sm text-gray-600">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-gray-900">{patient.full_name || 'this care profile'}</span>?
                This action cannot be undone. Care Profiles with active bookings cannot be deleted.
              </p>
              <label className="mt-4 block text-xs font-medium text-gray-600">
                Type <span className="font-semibold text-gray-900">{patient.full_name}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={patient.full_name}
                autoFocus
                className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirmText.trim() !== (patient.full_name || '').trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
