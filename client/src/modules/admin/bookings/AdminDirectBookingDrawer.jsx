import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, ChevronDown } from 'lucide-react';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import DateInput from '../../../components/common/DateInput';

// ─── Style helpers ────────────────────────────────────────────────────────────

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

const inputCls = (hasError) =>
  `w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:border-blue-500 transition-colors ${
    hasError
      ? 'border-red-400 bg-red-50 focus:ring-red-100'
      : 'border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:ring-blue-100'
  }`;

// ─── Constants ─────────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  { label: 'Nurse', value: 'NURSE' },
  { label: 'Caregiver', value: 'CAREGIVER' },
  { label: 'Nanny', value: 'NANNY' },
  { label: 'Physiotherapist', value: 'PHYSIOTHERAPIST' },
  { label: 'Nursing Assistant', value: 'NURSING_ASSISTANT' },
  { label: 'Counsellor', value: 'COUNSELLOR' },
];

const SERVICE_MODELS = [
  { label: 'Live-In', value: 'LIVE_IN' },
  { label: 'Shift Based', value: 'SHIFT_BASED' },
  { label: 'Visit', value: 'VISITING' },
];

const GENDER_PREFS = [
  { label: 'Any', value: 'ANY' },
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
];

const GENDERS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'OTHER' },
];

const RELATIONSHIPS = [
  'Self', 'Parent', 'Child', 'Sibling', 'Spouse / Partner',
  'Guardian', 'Caregiver', 'Friend', 'Neighbor', 'Other',
];

const serializeEmergencyContacts = (contacts) => ({
  emergencyContactName: contacts.map((c) => c.name).join(' | '),
  emergencyContactNumber: contacts.map((c) => c.number).join(' | '),
});

// ─── Searchable client select ─────────────────────────────────────────────────

const ClientSelect = ({ clients, value, onChange, disabled }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = clients.find((c) => c.client_profile_id === value);

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.mobile_number || '').toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${
          disabled ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-300' : 'bg-white border-slate-300 hover:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:border-blue-500'
        }`}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>
          {selected ? `${selected.honorific ? `${selected.honorific} ` : ''}${selected.full_name} — ${selected.mobile_number ? formatMobileNumber(selected.mobile_number) : 'no phone on file'}` : 'Select a client…'}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-slate-300 bg-white rounded outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 placeholder-slate-400"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-2">No clients found.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.client_profile_id}
                  type="button"
                  onClick={() => { onChange(c.client_profile_id); setOpen(false); setSearch(''); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                    c.client_profile_id === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-800'
                  }`}
                >
                  {c.honorific ? `${c.honorific} ` : ''}{c.full_name} — {c.mobile_number ? formatMobileNumber(c.mobile_number) : 'no phone on file'}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Main drawer ──────────────────────────────────────────────────────────────

const AdminDirectBookingDrawer = ({
  open,
  onClose,
  onSuccess,
  preselectedClientId = null,
  preselectedClientName = null,
  preselectedPatientId = null,
  preselectedPatientName = null,
}) => {
  const navigate = useNavigate();

  // Client
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '');

  // Patient
  const [patientMode, setPatientMode] = useState('existing'); // 'existing' | 'new'
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(preselectedPatientId || '');

  // New patient form
  const [npFullName, setNpFullName] = useState('');
  const [npAge, setNpAge] = useState('');
  const [npGender, setNpGender] = useState('');
  const [npRelationship, setNpRelationship] = useState('');
  const [npMedicalCondition, setNpMedicalCondition] = useState('');
  const [npResidentialAddress, setNpResidentialAddress] = useState('');
  const [npEmergencyContacts, setNpEmergencyContacts] = useState([{ name: '', number: '' }]);

  // Service details
  const [serviceType, setServiceType] = useState('');
  const [serviceModel, setServiceModel] = useState('');
  const [preferredGender, setPreferredGender] = useState('ANY');

  // Schedule & billing
  const [startDate, setStartDate] = useState('');
  const [scheduledEndDate, setScheduledEndDate] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [shiftRate, setShiftRate] = useState('');

  // Admin notes
  const [adminNotes, setAdminNotes] = useState('');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Self-as-patient
  const [selfLoading, setSelfLoading] = useState(false);
  const [isSelfPatient, setIsSelfPatient] = useState(false);

  // "Same as client's address" for the new-patient residential address
  const [sameAsClientAddress, setSameAsClientAddress] = useState(false);
  const [clientAddressLoading, setClientAddressLoading] = useState(false);

  // ── Sync preselectedClientId when prop changes ───────────────────────────
  useEffect(() => {
    setSelectedClientId(preselectedClientId || '');
  }, [preselectedClientId]);

  // ── Reset form when drawer opens/closes ──────────────────────────────────
  useEffect(() => {
    if (open) {
      setSelectedClientId(preselectedClientId || '');
      setPatientMode('existing');
      setPatients([]);
      setSelectedPatientId(preselectedPatientId || '');
      setNpFullName(''); setNpAge(''); setNpGender(''); setNpRelationship('');
      setNpMedicalCondition(''); setNpResidentialAddress('');
      setNpEmergencyContacts([{ name: '', number: '' }]);
      setServiceType(''); setServiceModel(''); setPreferredGender('ANY');
      setStartDate(''); setScheduledEndDate(''); setDailyRate('');
      setAdminNotes('');
      setIsSelfPatient(false);
      setSameAsClientAddress(false);
      setErrors({});
    }
  }, [open, preselectedClientId, preselectedPatientId]);

  // ── Reset "same as client's address" if the client selection changes ─────
  useEffect(() => {
    setSameAsClientAddress(false);
  }, [selectedClientId]);

  // ── Fetch clients (only when no preselected client) ──────────────────────
  useEffect(() => {
    if (!open || preselectedClientId) return;
    setClientsLoading(true);
    apiClient.getAllClients({ limit: 10000 })
      .then((res) => setClients(res?.data || []))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, [open, preselectedClientId]);

  // ── Fetch patients when client changes (skipped when patient is preselected/locked) ──
  useEffect(() => {
    if (!open) return;
    if (preselectedPatientId) return;
    if (!selectedClientId) { setPatients([]); setSelectedPatientId(''); return; }
    setPatientsLoading(true);
    setSelectedPatientId('');
    apiClient.getPatientsByClient(selectedClientId)
      .then((res) => setPatients(res?.data || []))
      .catch(() => setPatients([]))
      .finally(() => setPatientsLoading(false));
  }, [open, selectedClientId, preselectedPatientId]);

  // ── Use the client's own details as the patient (self-booking) ───────────
  const handleUseSelfAsPatient = async () => {
    if (!selectedClientId || selfLoading) return;
    setPatientMode('new');
    setIsSelfPatient(true);
    setErrors((e) => ({ ...e, patient: undefined, npFullName: undefined }));
    setSelfLoading(true);
    try {
      const res = await apiClient.getClientProfile(selectedClientId);
      const profile = res?.data || {};
      setNpFullName(profile.full_name || preselectedClientName || '');
      setNpGender(profile.gender || '');
      setNpRelationship('Self');
      setNpResidentialAddress(profile.primary_address || '');
    } catch {
      setNpFullName(preselectedClientName || '');
      setNpRelationship('Self');
    } finally {
      setSelfLoading(false);
    }
  };

  // ── "Same as client's address" toggle for the new-patient residential address ──
  const handleToggleSameAsClientAddress = async (checked) => {
    setSameAsClientAddress(checked);
    if (!checked || !selectedClientId) return;
    setClientAddressLoading(true);
    try {
      const res = await apiClient.getClientProfile(selectedClientId);
      setNpResidentialAddress(res?.data?.primary_address || '');
    } catch {
      // non-fatal — leave whatever address was already entered
    } finally {
      setClientAddressLoading(false);
    }
  };

  // ── New-patient emergency contacts (one or more) ─────────────────────────
  const updateEmergencyContact = (idx, key, value) =>
    setNpEmergencyContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));

  const addEmergencyContact = () =>
    setNpEmergencyContacts((prev) => [...prev, { name: '', number: '' }]);

  const removeEmergencyContact = (idx) =>
    setNpEmergencyContacts((prev) => prev.filter((_, i) => i !== idx));

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!selectedClientId) errs.client = 'Please select a client.';
    if (patientMode === 'existing' && !selectedPatientId) errs.patient = 'Please select a patient.';
    if (patientMode === 'new' && !npFullName.trim()) errs.npFullName = 'Full name is required.';
    if (!serviceType) errs.serviceType = 'Please select a service type.';
    if (!serviceModel) errs.serviceModel = 'Please select a service model.';
    if (!startDate) errs.startDate = 'Start date is required.';
    if (serviceModel !== 'SHIFT_BASED' && (!dailyRate || isNaN(parseFloat(dailyRate)) || parseFloat(dailyRate) < 0))
      errs.dailyRate = 'Enter a valid daily rate.';
    if (serviceModel === 'SHIFT_BASED' && (!shiftRate || isNaN(parseFloat(shiftRate)) || parseFloat(shiftRate) < 0))
      errs.shiftRate = 'Enter a valid per-shift rate.';
    return errs;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setSubmitting(true);

    const payload = {
      client_profile_id: selectedClientId,
      service_type: serviceType,
      service_model: serviceModel,
      preferred_gender: preferredGender,
      start_date: startDate,
      ...(serviceModel === 'SHIFT_BASED' ? { shift_rate: parseFloat(shiftRate) } : { daily_rate: parseFloat(dailyRate) }),
      // SHIFT_BASED bookings have no booking end date — billing is purely shift-count-derived.
      ...(serviceModel !== 'SHIFT_BASED' && scheduledEndDate ? { scheduled_end_date: scheduledEndDate } : {}),
      ...(adminNotes ? { admin_notes: adminNotes } : {}),
    };

    if (patientMode === 'existing') {
      payload.patient_id = selectedPatientId;
    } else {
      payload.new_patient_full_name = npFullName.trim();
      if (npAge) payload.new_patient_age = parseInt(npAge);
      if (npGender) payload.new_patient_gender = npGender;
      if (npRelationship) payload.new_patient_relationship_to_client = npRelationship;
      if (npMedicalCondition.trim()) payload.new_patient_medical_condition = npMedicalCondition.trim();
      if (npResidentialAddress.trim()) payload.new_patient_residential_address = npResidentialAddress.trim();
      const { emergencyContactName, emergencyContactNumber } = serializeEmergencyContacts(
        npEmergencyContacts.filter((c) => c.name.trim() || c.number.trim())
      );
      if (emergencyContactName) payload.new_patient_emergency_contact_name = emergencyContactName;
      if (emergencyContactNumber) payload.new_patient_emergency_contact_number = emergencyContactNumber;
    }

    try {
      const res = await apiClient.adminDirectBooking(payload);
      if (res?.status === 'success' && res?.data) {
        if (onSuccess) onSuccess(res.data.booking_id, res.data.booking_code);
        onClose();
        navigate(`/admin/bookings/${res.data.booking_id}/staff-assignment`);
      } else {
        setErrors({ submit: res?.message || 'Failed to create booking. Please try again.' });
      }
    } catch (err) {
      setErrors({ submit: err?.message || 'Failed to create booking. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="w-full max-w-lg bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">New Direct Booking</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create a booking without going through the service request pipeline</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          <form id="admin-direct-booking-form" onSubmit={handleSubmit} noValidate>
            {/* ── Section 1: Client ─────────────────────────────────────── */}
            {!preselectedClientId && (
              <>
                <SectionHeader title="Client" />
                <div className="px-5 py-4">
                  {preselectedClientName ? (
                    <Field label="Client">
                      <p className="px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
                        {preselectedClientName}
                      </p>
                    </Field>
                  ) : (
                    <Field label="Client" required error={errors.client}>
                      {clientsLoading ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading clients…
                        </div>
                      ) : (
                        <ClientSelect
                          clients={clients}
                          value={selectedClientId}
                          onChange={(id) => { setSelectedClientId(id); setErrors((e) => ({ ...e, client: undefined })); }}
                        />
                      )}
                    </Field>
                  )}
                </div>
              </>
            )}

            {/* Preselected client read-only label */}
            {preselectedClientId && preselectedClientName && (
              <>
                <SectionHeader title="Client" />
                <div className="px-5 py-4">
                  <Field label="Client">
                    <p className="px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
                      {preselectedClientName}
                    </p>
                  </Field>
                </div>
              </>
            )}

            {/* ── Section 2: Patient ────────────────────────────────────── */}
            <SectionHeader title="Patient" />
            <div className="px-5 py-4 space-y-4">
              {preselectedPatientId ? (
                <Field label="Patient">
                  <p className="px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg">
                    {preselectedPatientName || 'Selected care profile'}
                  </p>
                </Field>
              ) : (
                <>
              {/* Mode toggle */}
              <div className="flex items-center gap-2 flex-wrap">
                {[{ key: 'existing', label: 'Existing Patient' }, { key: 'new', label: 'New Patient' }].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setPatientMode(key); setIsSelfPatient(false); setErrors((e) => ({ ...e, patient: undefined, npFullName: undefined })); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      patientMode === key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleUseSelfAsPatient}
                  disabled={!selectedClientId || selfLoading}
                  title={!selectedClientId ? 'Select a client first' : "Fill patient details with the client's own information"}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    isSelfPatient
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white`}
                >
                  {selfLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  Client is the Patient (Self)
                </button>
              </div>

              {patientMode === 'existing' ? (
                <Field label="Patient" required error={errors.patient}>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => { setSelectedPatientId(e.target.value); setErrors((err) => ({ ...err, patient: undefined })); }}
                    disabled={!selectedClientId || patientsLoading}
                    className={inputCls(!!errors.patient)}
                  >
                    <option value="">
                      {!selectedClientId
                        ? 'Select a client first…'
                        : patientsLoading
                        ? 'Loading patients…'
                        : patients.length === 0
                        ? 'No patients found'
                        : 'Select a patient…'}
                    </option>
                    {patients.map((p) => (
                      <option key={p.patient_id} value={p.patient_id}>
                        {p.full_name}{p.age ? `, age ${p.age}` : ''}{p.gender ? ` (${p.gender})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <div className="space-y-3">
                  {isSelfPatient && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      Using the client's own details as the patient. Name, gender, relationship and address are locked — switch off "Client is the Patient (Self)" above to edit them.
                    </p>
                  )}
                  <Field label="Full Name" required error={errors.npFullName}>
                    <input
                      type="text"
                      value={npFullName}
                      onChange={(e) => { setNpFullName(e.target.value); setErrors((err) => ({ ...err, npFullName: undefined })); }}
                      disabled={isSelfPatient}
                      className={inputCls(!!errors.npFullName) + (isSelfPatient ? ' bg-slate-50 text-slate-500 cursor-not-allowed' : '')}
                      placeholder="Patient's full name"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Age">
                      <input
                        type="number"
                        value={npAge}
                        onChange={(e) => setNpAge(e.target.value)}
                        onWheel={(e) => e.target.blur()}
                        min="0"
                        max="150"
                        className={inputCls(false)}
                        placeholder="e.g. 65"
                      />
                    </Field>
                    <Field label="Gender">
                      <select
                        value={npGender}
                        onChange={(e) => setNpGender(e.target.value)}
                        disabled={isSelfPatient}
                        className={inputCls(false) + (isSelfPatient ? ' bg-slate-50 text-slate-500 cursor-not-allowed' : '')}
                      >
                        <option value="">Select…</option>
                        {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Relationship with Client">
                    <select
                      value={npRelationship}
                      onChange={(e) => setNpRelationship(e.target.value)}
                      disabled={isSelfPatient}
                      className={inputCls(false) + (isSelfPatient ? ' bg-slate-50 text-slate-500 cursor-not-allowed' : '')}
                    >
                      <option value="">Select…</option>
                      {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Medical Condition">
                    <textarea
                      value={npMedicalCondition}
                      onChange={(e) => setNpMedicalCondition(e.target.value)}
                      rows={2}
                      className={inputCls(false)}
                      placeholder="Describe the patient's medical condition…"
                    />
                  </Field>
                  <Field label="Residential Address">
                    <input
                      type="text"
                      value={npResidentialAddress}
                      onChange={(e) => setNpResidentialAddress(e.target.value)}
                      disabled={isSelfPatient || sameAsClientAddress}
                      className={inputCls(false) + ((isSelfPatient || sameAsClientAddress) ? ' bg-slate-50 text-slate-500 cursor-not-allowed' : '')}
                      placeholder="Patient's residential address"
                    />
                    {!isSelfPatient && (
                      <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={sameAsClientAddress}
                          onChange={(e) => handleToggleSameAsClientAddress(e.target.checked)}
                          disabled={!selectedClientId || clientAddressLoading}
                        />
                        Same as client's address
                      </label>
                    )}
                  </Field>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-xs font-medium text-slate-600">Emergency Contacts</label>
                      <button
                        type="button"
                        onClick={addEmergencyContact}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        + Add Contact
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {npEmergencyContacts.map((contact, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                          <input
                            type="text"
                            value={contact.name}
                            onChange={(e) => updateEmergencyContact(idx, 'name', e.target.value)}
                            className={inputCls(false)}
                            placeholder="Contact name"
                          />
                          <input
                            type="tel"
                            value={contact.number}
                            onChange={(e) => updateEmergencyContact(idx, 'number', e.target.value)}
                            className={inputCls(false)}
                            placeholder="Phone number"
                          />
                          {npEmergencyContacts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEmergencyContact(idx)}
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 hover:bg-red-100"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
            </div>

            {/* ── Section 3: Service Details ────────────────────────────── */}
            <SectionHeader title="Service Details" />
            <div className="px-5 py-4 space-y-3">
              <Field label="Service Type" required error={errors.serviceType}>
                <select
                  value={serviceType}
                  onChange={(e) => { setServiceType(e.target.value); setErrors((err) => ({ ...err, serviceType: undefined })); }}
                  className={inputCls(!!errors.serviceType)}
                >
                  <option value="">Select service type…</option>
                  {SERVICE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Service Model" required error={errors.serviceModel}>
                <select
                  value={serviceModel}
                  onChange={(e) => { setServiceModel(e.target.value); setErrors((err) => ({ ...err, serviceModel: undefined })); }}
                  className={inputCls(!!errors.serviceModel)}
                >
                  <option value="">Select service model…</option>
                  {SERVICE_MODELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Preferred Staff Gender">
                <select
                  value={preferredGender}
                  onChange={(e) => setPreferredGender(e.target.value)}
                  className={inputCls(false)}
                >
                  {GENDER_PREFS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
            </div>

            {/* ── Section 4: Schedule & Billing ─────────────────────────── */}
            <SectionHeader title="Schedule & Billing" />
            <div className="px-5 py-4 space-y-3">
              <Field label="Start Date" required error={errors.startDate}>
                <DateInput
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setErrors((err) => ({ ...err, startDate: undefined })); }}
                  className={inputCls(!!errors.startDate)}
                />
              </Field>
              {serviceModel !== 'SHIFT_BASED' && (
                <Field label="Scheduled End Date (optional)">
                  <DateInput
                    value={scheduledEndDate}
                    min={startDate || undefined}
                    onChange={(e) => setScheduledEndDate(e.target.value)}
                    className={inputCls(false)}
                  />
                </Field>
              )}
              {serviceModel !== 'SHIFT_BASED' && (
                <Field label="Daily Rate" required error={errors.dailyRate}>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-sm text-slate-700 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg">
                      LKR
                    </span>
                    <input
                      type="number"
                      value={dailyRate}
                      onChange={(e) => { setDailyRate(e.target.value); setErrors((err) => ({ ...err, dailyRate: undefined })); }}
                      onWheel={(e) => e.target.blur()}
                      min="0"
                      step="0.01"
                      placeholder="e.g. 2500.00"
                      className={`flex-1 px-3 py-2 text-sm text-slate-800 border rounded-r-lg outline-none focus:ring-2 focus:border-blue-400 transition-colors ${
                        errors.dailyRate
                          ? 'border-red-400 bg-red-50 focus:ring-red-100'
                          : 'border-slate-200 focus:ring-blue-100'
                      }`}
                    />
                  </div>
                  {errors.dailyRate && <p className="text-xs text-red-600 mt-1">{errors.dailyRate}</p>}
                </Field>
              )}
              {serviceModel === 'SHIFT_BASED' && (
                <Field label="Per-Shift Rate (client charge)" required error={errors.shiftRate}>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 text-sm text-slate-700 bg-slate-50 border border-r-0 border-slate-200 rounded-l-lg">
                      LKR
                    </span>
                    <input
                      type="number"
                      value={shiftRate}
                      onChange={(e) => { setShiftRate(e.target.value); setErrors((err) => ({ ...err, shiftRate: undefined })); }}
                      onWheel={(e) => e.target.blur()}
                      min="0"
                      step="0.01"
                      placeholder="e.g. 3500.00"
                      className={`flex-1 px-3 py-2 text-sm text-slate-800 border rounded-r-lg outline-none focus:ring-2 focus:border-blue-400 transition-colors ${
                        errors.shiftRate
                          ? 'border-red-400 bg-red-50 focus:ring-red-100'
                          : 'border-slate-200 focus:ring-blue-100'
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">What the client is charged per shift — independent of staff pay.</p>
                  {errors.shiftRate && <p className="text-xs text-red-600 mt-1">{errors.shiftRate}</p>}
                </Field>
              )}
            </div>

            {/* ── Section 5: Admin Notes ────────────────────────────────── */}
            <SectionHeader title="Admin Notes" />
            <div className="px-5 py-4">
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                className={inputCls(false)}
                placeholder="Reason for direct booking (e.g. loyal client, deferred payment arrangement)…"
              />
            </div>

            {/* Submit error */}
            {errors.submit && (
              <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errors.submit}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex items-center justify-end gap-3 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="admin-direct-booking-form"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Creating…' : 'Create & Assign Staff'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDirectBookingDrawer;
