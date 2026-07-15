import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, Trash2, User, Calendar, MapPin,
  Phone, AlertCircle, ChevronDown, ChevronRight,
  Clock, FileText, Shield, X, Save, Loader2, CheckCircle, MessageCircle
} from 'lucide-react';
import apiClient from '../../api/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GENDER_BADGE = {
  MALE:   { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Male' },
  FEMALE: { bg: '#fdf2f8', color: '#9d174d', border: '#fbcfe8', label: 'Female' },
  OTHER:  { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: 'Other' },
};

const GenderBadge = ({ gender }) => {
  const m = GENDER_BADGE[gender] || GENDER_BADGE.OTHER;
  return (
    <span style={{
      display: 'inline-block',
      background: m.bg, color: m.color,
      border: `1px solid ${m.border}`,
      borderRadius: 4, padding: '1px 8px',
      fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      {m.label}
    </span>
  );
};

const RegBadge = ({ paid }) => (
  <span style={{
    display: 'inline-block',
    background: paid ? '#f0fdf4' : '#fffbeb',
    color: paid ? '#166534' : '#166534',
    border: `1px solid ${paid ? '#bbf7d0' : '#bbf7d0'}`,
    borderRadius: 4, padding: '1px 8px',
    fontSize: 10, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
  }}>
    {paid ? 'Registered' : 'Registered'}
  </span>
);

const RELATIONSHIP_OPTIONS = [
  'Parent', 'Child', 'Sibling', 'Spouse / Partner',
  'Guardian', 'Caregiver', 'Friend', 'Neighbor', 'Other',
];

const FORM_EMPTY = {
  full_name: '', age: '', gender: '', relationship_to_client: '',
  medical_condition: '', residential_address: '',
  emergency_contacts: [{ name: '', number: '' }],
};

const serializeEmergencyContacts = (contacts) => ({
  emergency_contact_name: contacts.map(c => c.name).join(' | '),
  emergency_contact_number: contacts.map(c => c.number).join(' | '),
});

// ─── PatientCard ──────────────────────────────────────────────────────────────

const PatientCard = ({ patient, onDelete, expanded, onToggle }) => {
  const initials = patient.full_name
    ? patient.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      <div style={{
        ...s.card,
        borderRadius: expanded ? '12px 12px 0 0' : '12px'
      }}>
        {/* Card header */}
        <div style={s.cardHeader}>
          <div style={s.avatarSmall}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={s.patientName}>{patient.full_name}</p>
            <p style={s.patientSub}>{patient.relationship_to_client}</p>
          </div>
          <div style={s.cardActions}>
            <button onClick={() => onDelete(patient)} style={{ ...s.iconBtn, color: '#ef4444' }} title="Delete">
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Quick info */}
        <div style={s.quickInfo}>
          <div style={s.infoRow}>
            <Calendar size={12} style={s.infoIcon} />
            <span>{patient.age} years old</span>
          </div>
          <div style={s.infoRow}>
            <MapPin size={12} style={s.infoIcon} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {patient.residential_address || '—'}
            </span>
          </div>
          {(() => {
            const ecNames = (patient.emergency_contact_name || '').split(' | ');
            const ecNumbers = (patient.emergency_contact_number || '').split(' | ');
            return ecNames.filter(Boolean).map((name, i) => (
              <div key={i} style={s.infoRow}>
                <Phone size={12} style={s.infoIcon} />
                <span>{name}: {ecNumbers[i] || '—'}</span>
              </div>
            ));
          })()}
          <div style={s.infoRow}>
            <FileText size={12} style={s.infoIcon} />
            <span style={{ color: '#475569' }}>{patient.medical_condition}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={s.cardFooter}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <RegBadge paid={patient.is_registration_fee_paid} />
            {patient.gender && <GenderBadge gender={patient.gender} />}
          </div>
          <button onClick={onToggle} style={s.detailToggle}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {expanded ? 'Hide' : 'Details'}
          </button>
        </div>
      </div>

      {/* Expanded detail - separate from main card */}
      {expanded && (
        <div style={s.expandedCard}>
          <div style={s.expandedBody}>
            <DetailSection title="Care Profile Details" icon={<User size={11} />}>
              <MetaPair label="Profile ID" value={`#${patient.patient_id}`} mono />
              <MetaPair label="Full Name"  value={patient.full_name} />
              <MetaPair label="Age"        value={`${patient.age} years`} />
              <MetaPair label="Gender"     value={GENDER_BADGE[patient.gender]?.label} />
              <MetaPair label="Relationship" value={patient.relationship_to_client} />
            </DetailSection>

            <DetailSection title="Medical" icon={<FileText size={11} />}>
              <MetaPair label="Condition"      value={patient.medical_condition} />
              <MetaPair label="Special Remarks" value={patient.special_remarks || 'None'} />
              <MetaPair label="Registration"
                value={patient.is_registration_fee_paid ? 'Paid' : 'Pending'}
                valueStyle={{ color: patient.is_registration_fee_paid ? '#16a34a' : '#92400e', fontWeight: 600 }}
              />
            </DetailSection>

            <DetailSection title="Contact" icon={<Phone size={11} />}>
              <MetaPair label="Address"         value={patient.residential_address} />
              <MetaPair label="Emergency Name"  value={patient.emergency_contact_name} />
              <MetaPair label="Emergency Phone" value={patient.emergency_contact_number} />
            </DetailSection>

            <DetailSection title="System" icon={<Clock size={11} />}>
              <MetaPair label="Client ID" value={`#${patient.client_id}`} mono />
              <MetaPair label="Created"
                value={patient.created_at ? new Date(patient.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              />
              <MetaPair label="Updated"
                value={patient.updated_at ? new Date(patient.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              />
            </DetailSection>

            {patient.client_name && (
              <DetailSection title="Client Info" icon={<Shield size={11} />}>
                <MetaPair label="Client Name"    value={patient.client_name} />
                <MetaPair label="Client Address" value={patient.client_address || '—'} />
                <MetaPair label="Client Mobile"  value={patient.client_mobile || '—'} />
              </DetailSection>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const DetailSection = ({ title, icon, children }) => (
  <div style={s.detailSection}>
    <p style={s.detailSectionTitle}>
      {icon}
      {title}
    </p>
    <div style={s.metaGrid}>{children}</div>
  </div>
);

const MetaPair = ({ label, value, mono, valueStyle }) => (
  <div style={s.metaItem}>
    <p style={s.metaLabel}>{label}</p>
    <p style={{
      ...s.metaValue,
      ...(mono ? { fontFamily: 'monospace', letterSpacing: '0.02em' } : {}),
      ...valueStyle,
    }}>
      {value || <span style={s.empty}>—</span>}
    </p>
  </div>
);

// ─── PatientFormModal ─────────────────────────────────────────────────────────

const PatientFormModal = ({ formData, onChange, onSubmit, onClose, saving }) => {
  const field = (label, key, opts = {}) => (
    <div style={s.fieldWrap}>
      <label style={s.fieldLabel}>{label}</label>
      {opts.textarea ? (
        <textarea
          value={formData[key]}
          onChange={e => onChange(key, e.target.value)}
          placeholder={opts.placeholder || label}
          rows={2}
          required={opts.required}
          style={s.input}
        />
      ) : opts.select ? (
        <select
          value={formData[key]}
          onChange={e => onChange(key, e.target.value)}
          style={s.input}
        >
          <option value="">— Select —</option>
          {opts.options
            ? opts.options.map(opt => <option key={opt} value={opt}>{opt}</option>)
            : <>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </>
          }
        </select>
      ) : (
        <input
          type={opts.type || 'text'}
          value={formData[key]}
          onChange={e => onChange(key, e.target.value)}
          placeholder={opts.placeholder || label}
          maxLength={opts.maxLength}
          required={opts.required}
          style={s.input}
        />
      )}
    </div>
  );

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        {/* Modal header */}
        <div style={s.modalHeader}>
          <h2 style={s.modalTitle}>Add New Care Profile</h2>
          <button onClick={onClose} style={s.modalClose}>
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <div style={s.modalBody}>
          {field('Full Name', 'full_name', { required: true, placeholder: 'e.g. Saman Kumara' })}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px 20px' }}>
            {field('Age', 'age', { type: 'number', required: true })}
            {field('Gender', 'gender', { select: true })}
          </div>
          {field('Relationship', 'relationship_to_client', { select: true, required: true, options: RELATIONSHIP_OPTIONS })}
          {field('Medical Condition', 'medical_condition', { textarea: true, required: true })}
          {field('Residential Address', 'residential_address', { required: true, placeholder: 'e.g. 45/A, Galle Road, Dehiwala, Colombo' })}

          {/* Emergency contacts — dynamic list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={s.fieldLabel}>Emergency Contacts</label>
              <button
                type="button"
                onClick={() => onChange('emergency_contacts', [...formData.emergency_contacts, { name: '', number: '' }])}
                style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif" }}
              >
                + Add Contact
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {formData.emergency_contacts.map((contact, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={contact.name}
                    onChange={e => {
                      const updated = formData.emergency_contacts.map((c, i) => i === idx ? { ...c, name: e.target.value } : c);
                      onChange('emergency_contacts', updated);
                    }}
                    placeholder="e.g. Nimal Perera"
                    style={{ ...s.input }}
                  />
                  <input
                    type="tel"
                    value={contact.number}
                    onChange={e => {
                      const updated = formData.emergency_contacts.map((c, i) => i === idx ? { ...c, number: e.target.value } : c);
                      onChange('emergency_contacts', updated);
                    }}
                    placeholder="e.g. 077 123 4567"
                    style={{ ...s.input }}
                  />
                  {formData.emergency_contacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onChange('emergency_contacts', formData.emergency_contacts.filter((_, i) => i !== idx))}
                      style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>
            <X size={13} />
            Cancel
          </button>
          <button onClick={onSubmit} disabled={saving} style={s.saveBtn}>
            {saving
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={13} />}
            {saving ? 'Saving…' : 'Add Care Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── DeleteModal ──────────────────────────────────────────────────────────────

const DeleteModal = ({ patient, onConfirm, onClose }) => (
  <div style={s.overlay}>
    <div style={{ ...s.modal, maxWidth: 400 }}>
      <div style={s.modalHeader}>
        <h2 style={s.modalTitle}>Delete Care Profile</h2>
        <button onClick={onClose} style={s.modalClose}><X size={16} /></button>
      </div>
      <div style={{ padding: '24px 28px' }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: '#fef2f2', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Trash2 size={20} style={{ color: '#ef4444' }} />
        </div>
        <p style={{ fontSize: 14, color: '#1e293b', fontWeight: 500, marginBottom: 8 }}>
          Are you sure you want to delete <strong>{patient?.full_name}</strong>?
        </p>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          This action cannot be undone.
        </p>
        {patient?.has_active_bookings && (
          <div style={{ ...s.alertError, marginTop: 12 }}>
            <AlertCircle size={13} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>This care profile has active bookings and cannot be deleted.</span>
          </div>
        )}
      </div>
      <div style={s.modalFooter}>
        <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
        <button
          onClick={onConfirm}
          disabled={patient?.has_active_bookings}
          style={{
            ...s.saveBtn,
            background: patient?.has_active_bookings ? '#e2e8f0' : '#dc2626',
            cursor: patient?.has_active_bookings ? 'not-allowed' : 'pointer',
          }}
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientPatients = () => {
  const { user } = useAuth();
  const [patients, setPatients]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [clientProfile, setClientProfile]   = useState(null);
  const [searchTerm, setSearchTerm]         = useState('');
  const [showAddModal, setShowAddModal]     = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [expandedPatients, setExpandedPatients] = useState(new Set());
  const [saving, setSaving]                 = useState(false);
  const [formData, setFormData]             = useState(FORM_EMPTY);

  useEffect(() => { if (user) fetchClientProfile(); }, [user]);

  const fetchClientProfile = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getClientProfileByUserId(user.id);
      if (res.status === 'success' || res.message?.toLowerCase().includes('retrieved successfully')) {
        setClientProfile(res.data);
        await fetchPatients(res.data.client_profile_id);
      } else {
        setError(res.message || 'Failed to load client profile');
      }
    } catch (err) {
      setError(err.message || 'Failed to load client profile');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatients = async (clientId) => {
    try {
      const res = await fetch(`/api/patients/client/${clientId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('Failed to fetch care profiles');
      const data = await res.json();
      setPatients(data.data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const flash = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleAddPatient = async () => {
    try {
      setSaving(true);
      const { emergency_contacts, ...rest } = formData;
      const serialized = serializeEmergencyContacts(emergency_contacts);
      const res = await fetch('/api/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ client_id: clientProfile.client_profile_id, ...rest, ...serialized, age: parseInt(rest.age) }),
      });
      if (!res.ok) throw new Error('Failed to add care profile');
      setShowAddModal(false);
      setFormData(FORM_EMPTY);
      await fetchPatients(clientProfile.client_profile_id);
      flash('Care Profile added successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePatient = async () => {
    try {
      const res = await fetch(`/api/patients/${selectedPatient.patient_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to delete care profile'); }
      setShowDeleteModal(false);
      await fetchPatients(clientProfile.client_profile_id);
      flash('Care Profile removed.');
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleExpanded = async (patientId) => {
    const next = new Set(expandedPatients);
    if (next.has(patientId)) { next.delete(patientId); }
    else {
      next.add(patientId);
      try {
        const res = await fetch(`/api/patients/${patientId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) {
          const d = await res.json();
          setPatients(prev => prev.map(p => p.patient_id === patientId ? { ...p, ...d.data } : p));
        }
      } catch {}
    }
    setExpandedPatients(next);
  };

  const filtered = patients.filter(p =>
    p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.medical_condition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div style={s.pageWrapper}>
        <style>{kf}</style>
        <div style={s.centerState}>
          <Loader2 size={28} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
          <p style={s.loadingText}>Loading care profiles</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.pageWrapper}>
      <style>{kf}</style>

      <main style={s.main}>
        {/* Page header */}
        <header style={s.pageHeader}>
          <div>
            <p style={s.breadcrumb}>Account</p>
            <h1 style={s.pageTitle}>Care Profiles</h1>
          </div>
          <button onClick={() => { setFormData(FORM_EMPTY); setShowAddModal(true); }} style={s.addBtn}>
            <Plus size={14} />
            Add Care Profile
          </button>
        </header>

        {/* Alerts */}
        {successMessage && (
          <div style={s.alertSuccess}>
            <CheckCircle size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}
        {error && (
          <div style={s.alertError}>
            <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Contact-to-edit notice */}
        <div style={s.contactBanner}>
          <MessageCircle size={14} style={{ color: '#475569', flexShrink: 0 }} />
          <span>To edit an existing care profile's details, please contact VCare Nursing.</span>
        </div>

        {/* Stats + search row */}
        <div style={s.topRow}>
          <div style={s.statPill}>
            <User size={14} style={{ color: '#64748b' }} />
            <span style={s.statPillValue}>{patients.length}</span>
            <span style={s.statPillLabel}>Total Profiles</span>
          </div>
          <div style={s.statPill}>
            <CheckCircle size={14} style={{ color: '#16a34a' }} />
            <span style={s.statPillValue}>{patients.filter(p => p.is_registration_fee_paid).length}</span>
            <span style={s.statPillLabel}>Registered</span>
          </div>
          <div style={s.statPill}>
            <AlertCircle size={14} style={{ color: '#f59e0b' }} />
            <span style={s.statPillValue}>{patients.filter(p => !p.is_registration_fee_paid).length}</span>
            <span style={s.statPillLabel}>Fee Pending</span>
          </div>

          {/* Search */}
          <div style={s.searchWrap}>
            <Search size={14} style={s.searchIcon} />
            <input
              type="text"
              placeholder="Search by name or condition…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={s.searchInput}
            />
          </div>
        </div>

        {/* Patient grid */}
        {filtered.length === 0 ? (
          <div style={s.emptyState}>
            <User size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
            <p style={s.emptyTitle}>
              {searchTerm ? 'No matching care profiles' : 'No care profiles yet'}
            </p>
            <p style={s.emptyBody}>
              {searchTerm
                ? 'Try a different name or condition.'
                : 'Add your first care profile to get started.'}
            </p>
            {!searchTerm && (
              <button onClick={() => { setFormData(FORM_EMPTY); setShowAddModal(true); }} style={{ ...s.addBtn, marginTop: 16 }}>
                <Plus size={14} />
                Add Care Profile
              </button>
            )}
          </div>
        ) : (
          <div style={s.grid}>
            {filtered.map(patient => (
              <div key={patient.patient_id} style={{ display: 'flex', flexDirection: 'column' }}>
                <PatientCard
                  patient={patient}
                  onDelete={p => { setSelectedPatient(p); setShowDeleteModal(true); }}
                  expanded={expandedPatients.has(patient.patient_id)}
                  onToggle={() => toggleExpanded(patient.patient_id)}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showAddModal && (
        <PatientFormModal
          formData={formData}
          onChange={(k, v) => setFormData(p => ({ ...p, [k]: v }))}
          onSubmit={handleAddPatient}
          onClose={() => { setShowAddModal(false); setFormData(FORM_EMPTY); }}
          saving={saving}
        />
      )}
      {showDeleteModal && (
        <DeleteModal
          patient={selectedPatient}
          onConfirm={handleDeletePatient}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
};

// ─── Keyframes ────────────────────────────────────────────────────────────────

const kf = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes fadeIn  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  * { box-sizing: border-box; }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #1e293b !important;
    box-shadow: 0 0 0 3px rgba(30,41,59,0.08) !important;
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  pageWrapper: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: "'DM Sans', sans-serif",
    color: '#1e293b',
  },
  main: {
    maxWidth: 1040,
    margin: '0 auto',
    padding: '48px 24px 80px',
    animation: 'fadeIn 0.35s ease both',
  },

  /* Header */
  pageHeader: {
    display: 'flex', alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 28, marginTop: 36,
    padding: '24px 28px',
    background: '#fff',
    border: '1px solid #e2e8f0', borderRadius: 12,
  },
  breadcrumb: {
    fontSize: 12, color: '#64748b', letterSpacing: '0.08em',
    textTransform: 'uppercase', marginBottom: 4, fontWeight: 500,
  },
  pageTitle: {
    fontSize: 28, fontWeight: 600, color: '#1e293b',
    letterSpacing: '-0.02em', margin: 0,
    fontFamily: "'DM Serif Display', serif",
  },
  addBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#1e293b', color: '#f8f7f4',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.01em',
  },

  /* Alerts */
  alertSuccess: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#f0fdf4', border: '1px solid #bbf7d0',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#166534', marginBottom: 20,
  },
  alertError: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#991b1b', marginBottom: 20,
  },
  contactBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#475569', marginBottom: 20,
  },

  /* Top row */
  topRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 20, flexWrap: 'wrap',
  },
  statPill: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '10px 16px',
  },
  statPillValue: { fontSize: 16, fontWeight: 700, color: '#0f172a' },
  statPillLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },

  /* Search */
  searchWrap: {
    flex: 1, minWidth: 200,
    position: 'relative', marginLeft: 'auto',
  },
  searchIcon: {
    position: 'absolute', left: 12,
    top: '50%', transform: 'translateY(-50%)',
    color: '#94a3b8', pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', paddingLeft: 36, paddingRight: 12,
    paddingTop: 9, paddingBottom: 9,
    border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 13, color: '#1e293b',
    background: '#fff', fontFamily: "'DM Sans', sans-serif",
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },

  /* Grid */
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  },

  /* Patient card */
  card: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    animation: 'slideUp 0.25s ease both',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '18px 20px 14px',
    borderBottom: '1px solid #f1f5f9',
  },
  avatarSmall: {
    width: 40, height: 40, borderRadius: 10,
    background: '#1e293b', color: '#f8f7f4',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 600, flexShrink: 0,
  },
  patientName: { fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' },
  patientSub:  { fontSize: 12, color: '#94a3b8', margin: 0 },
  cardActions: { display: 'flex', gap: 4, marginLeft: 'auto' },
  iconBtn: {
    width: 28, height: 28, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
    borderRadius: 6, cursor: 'pointer',
    color: '#94a3b8', transition: 'background 0.15s, color 0.15s',
  },
  quickInfo: { padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 },
  infoRow: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    fontSize: 12, color: '#64748b', lineHeight: 1.4,
  },
  infoIcon: { color: '#94a3b8', flexShrink: 0, marginTop: 1 },
  cardFooter: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    borderTop: '1px solid #f1f5f9',
    background: '#fafafa',
  },
  detailToggle: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none',
    fontSize: 11, fontWeight: 600, color: '#64748b',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.05em', textTransform: 'uppercase',
    padding: 0,
  },

  /* Expanded */
  expandedCard: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderTop: 'none',
    borderRadius: '0 0 12px 12px',
    marginTop: -1, // Connect with main card
    overflow: 'hidden',
  },
  expandedBody: {
    padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  detailSection: {},
  detailSectionTitle: {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 10, fontWeight: 700, color: '#94a3b8',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    margin: '0 0 8px',
  },
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '6px 16px' },
  metaItem: {},
  metaLabel: { fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 1px' },
  metaValue: { fontSize: 12, color: '#1e293b', fontWeight: 500, margin: 0 },
  empty:     { color: '#cbd5e1', fontStyle: 'italic' },

  /* Empty state */
  centerState: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', gap: 12,
  },
  loadingText: { fontSize: 14, color: '#94a3b8', letterSpacing: '0.03em' },
  emptyState: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 24px',
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 },
  emptyBody:  { fontSize: 14, color: '#94a3b8' },

  /* Modal overlay */
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(15,23,42,0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    zIndex: 100,
    overflowY: 'auto',
  },
  modal: {
    background: '#fff', borderRadius: 14,
    width: '100%', maxWidth: 520,
    border: '1px solid #e2e8f0',
    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
    animation: 'slideUp 0.2s ease both',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid #f1f5f9',
  },
  modalTitle: {
    fontSize: 17, fontWeight: 600, color: '#1e293b', margin: 0,
    fontFamily: "'DM Serif Display', serif",
  },
  modalClose: {
    width: 32, height: 32, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none',
    borderRadius: 8, cursor: 'pointer', color: '#94a3b8',
  },
  modalBody: {
    padding: '20px 24px',
    display: 'flex', flexDirection: 'column', gap: 14,
    maxHeight: '65vh', overflowY: 'auto',
  },
  modalFooter: {
    display: 'flex', gap: 8, justifyContent: 'flex-end',
    padding: '16px 24px',
    borderTop: '1px solid #f1f5f9',
    background: '#fafafa',
  },
  cancelBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b',
    border: '1px solid #cbd5e1', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  saveBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#1e293b', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  /* Form fields */
  fieldWrap: {},
  fieldLabel: {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: '#64748b', letterSpacing: '0.07em',
    textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    width: '100%', fontSize: 14, color: '#1e293b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', background: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    resize: 'vertical', lineHeight: 1.5,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
};

export default ClientPatients;