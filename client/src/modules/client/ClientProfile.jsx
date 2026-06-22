import React, { useState, useEffect } from 'react';
import { User, MapPin, Phone, Mail, Edit2, Save, X, Loader2, CheckCircle, AlertCircle, Wallet, Shield } from 'lucide-react';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ClientProfile = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      if (!user) { setError('User authentication required'); return; }
      const response = await apiClient.getClientProfileByUserId(user.id);
      if (response.status === 'success' || response.message?.toLowerCase().includes('retrieved successfully')) {
        setProfile(response.data);
        setEditForm(response.data);
        setError('');
      } else {
        setError(response.message || 'Failed to load profile');
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => { setIsEditing(true); setSuccessMessage(''); };
  const handleCancel = () => { setIsEditing(false); setEditForm(profile); setSuccessMessage(''); };
  const handleInputChange = (field, value) => setEditForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    try {
      setSaveLoading(true);
      setError('');
      if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
        setError('Please enter a valid email address'); return;
      }
      if (editForm.mobile_number && !/^\d{10}$/.test(editForm.mobile_number)) {
        setError('Please enter a valid 10-digit mobile number'); return;
      }
      await apiClient.updateMe(editForm);
      setProfile(editForm);
      setIsEditing(false);
      setSuccessMessage('Profile updated successfully.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.centerState}>
          <Loader2 style={{ ...styles.spinnerIcon, animation: 'spin 1s linear infinite' }} />
          <p style={styles.loadingText}>Loading profile</p>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div style={styles.pageWrapper}>
        <div style={styles.centerState}>
          <div style={styles.errorCard}>
            <AlertCircle style={styles.errorIcon} />
            <p style={styles.errorTitle}>Unable to load profile</p>
            <p style={styles.errorBody}>{error}</p>
            <button onClick={fetchProfile} style={styles.retryBtn}>Retry</button>
          </div>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '—';

  return (
    <div style={styles.pageWrapper}>
      <style>{keyframes}</style>

      <main style={styles.main}>
        {/* Page header */}
        <header style={styles.pageHeader}>
          <div>
            <p style={styles.breadcrumb}>Account</p>
            <h1 style={styles.pageTitle}>Profile</h1>
          </div>
          {!isEditing ? (
            <button onClick={handleEdit} style={styles.editBtn}>
              <Edit2 size={14} />
              Edit
            </button>
          ) : (
            <div style={styles.actionRow}>
              <button onClick={handleCancel} style={styles.cancelBtn}>
                <X size={14} />
                Cancel
              </button>
              <button onClick={handleSave} disabled={saveLoading} style={styles.saveBtn}>
                {saveLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                {saveLoading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </header>

        {/* Alerts */}
        {successMessage && (
          <div style={styles.alertSuccess}>
            <CheckCircle size={15} style={{ color: '#16a34a', flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}
        {error && (
          <div style={styles.alertError}>
            <AlertCircle size={15} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Identity strip */}
        <section style={styles.identityStrip}>
          <div style={styles.avatar}>{initials}</div>
          <div>
            <p style={styles.identityName}>{profile?.full_name || '—'}</p>
            <p style={styles.identityMeta}>
              Client #{profile?.client_profile_id}&nbsp;&nbsp;·&nbsp;&nbsp;
              <span style={profile?.is_registration_fee_paid ? styles.badgeGreen : styles.badgeAmber}>
                {profile?.is_registration_fee_paid ? 'Registered' : 'Fee Pending'}
              </span>
            </p>
          </div>
        </section>

        {/* Stats row */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statHeader}>
              <Wallet size={15} style={{ color: '#64748b' }} />
              <span style={styles.statLabel}>Wallet Balance</span>
            </div>
            <p style={styles.statValue}>Rs. {profile?.wallet_balance ?? 0}</p>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statHeader}>
              <Shield size={15} style={{ color: '#64748b' }} />
              <span style={styles.statLabel}>Client Type</span>
            </div>
            <p style={styles.statValue} className="capitalize">{profile?.client_type || '—'}</p>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statHeader}>
              <CheckCircle size={15} style={{ color: '#64748b' }} />
              <span style={styles.statLabel}>Account Status</span>
            </div>
            <p style={{ ...styles.statValue, color: '#16a34a' }}>Active</p>
          </div>
        </div>

        {/* Personal information */}
        <section style={styles.card}>
          <h2 style={styles.cardHeading}>Personal Information</h2>
          <div style={styles.fieldGrid}>
            <Field
              label="Full Name"
              icon={<User size={15} style={styles.fieldIcon} />}
              editing={isEditing}
              value={editForm.full_name || ''}
              display={profile?.full_name}
              onChange={v => handleInputChange('full_name', v)}
              placeholder="Enter your full name"
            />
            <Field
              label="Mobile Number"
              icon={<Phone size={15} style={styles.fieldIcon} />}
              editing={isEditing}
              value={editForm.mobile_number || ''}
              display={profile?.mobile_number}
              onChange={v => handleInputChange('mobile_number', v)}
              placeholder="10-digit mobile number"
              maxLength={10}
              inputType="tel"
            />
            <Field
              label="Email Address"
              icon={<Mail size={15} style={styles.fieldIcon} />}
              editing={isEditing}
              value={editForm.email || ''}
              display={profile?.email}
              onChange={v => handleInputChange('email', v)}
              placeholder="Email address"
              inputType="email"
            />
            <Field
              label="Address"
              icon={<MapPin size={15} style={styles.fieldIcon} />}
              editing={isEditing}
              value={editForm.primary_address || ''}
              display={profile?.primary_address}
              onChange={v => handleInputChange('primary_address', v)}
              placeholder="Primary address"
              textarea
            />
          </div>
        </section>

        {/* Account metadata */}
        <section style={styles.card}>
          <h2 style={styles.cardHeading}>Account Details</h2>
          <div style={styles.metaGrid}>
            <MetaItem label="Client ID" value={`#${profile?.client_profile_id}`} mono />
            <MetaItem label="User ID" value={`#${profile?.user_id}`} mono />
            <MetaItem
              label="Account Created"
              value={profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : '—'}
            />
            <MetaItem
              label="Last Updated"
              value={profile?.updated_at
                ? new Date(profile.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : 'Never'}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

/* ─── Sub-components ─────────────────────────────────────── */

const Field = ({ label, icon, editing, value, display, onChange, placeholder, maxLength, inputType = 'text', textarea }) => (
  <div style={styles.fieldWrap}>
    <label style={styles.fieldLabel}>{label}</label>
    {editing ? (
      textarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={styles.input}
        />
      ) : (
        <input
          type={inputType}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          style={styles.input}
        />
      )
    ) : (
      <div style={styles.displayField}>
        {icon}
        <span style={styles.displayValue}>{display || <span style={styles.empty}>Not provided</span>}</span>
      </div>
    )}
  </div>
);

const MetaItem = ({ label, value, mono }) => (
  <div style={styles.metaItem}>
    <p style={styles.metaLabel}>{label}</p>
    <p style={mono ? { ...styles.metaValue, fontFamily: 'monospace', letterSpacing: '0.02em' } : styles.metaValue}>{value}</p>
  </div>
);

/* ─── Styles ─────────────────────────────────────────────── */

const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
  input:focus, textarea:focus { outline: none; border-color: #1e293b !important; box-shadow: 0 0 0 3px rgba(30,41,59,0.08) !important; }
`;

const styles = {
  pageWrapper: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: "'DM Sans', sans-serif",
    color: '#1e293b',
  },
  main: {
    maxWidth: 780,
    margin: '0 auto',
    padding: '48px 24px 80px',
    animation: 'fadeIn 0.35s ease both',
  },
  centerState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: 12,
  },
  spinnerIcon: { width: 28, height: 28, color: '#64748b' },
  loadingText: { fontSize: 14, color: '#94a3b8', letterSpacing: '0.03em' },
  errorCard: {
    background: '#fff',
    border: '1px solid #fecaca',
    borderRadius: 12,
    padding: '32px 40px',
    textAlign: 'center',
    maxWidth: 360,
  },
  errorIcon: { width: 32, height: 32, color: '#ef4444', marginBottom: 12 },
  errorTitle: { fontWeight: 600, fontSize: 16, color: '#1e293b', marginBottom: 6 },
  errorBody: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  retryBtn: {
    background: '#1e293b',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },

  /* Header */
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 36,
    marginTop: 36,
    paddingBottom: 24,
    padding: '24px 28px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#fff',
  },
  breadcrumb: { fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 500 },
  pageTitle: { fontSize: 28, fontWeight: 600, color: '#1e293b', letterSpacing: '-0.02em', margin: 0, fontFamily: "'DM Serif Display', serif" },

  editBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#1e293b', color: '#f8f7f4',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.01em',
  },
  actionRow: { display: 'flex', gap: 8 },
  cancelBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b',
    border: '1px solid #cbd5e1', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  saveBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#0f172a', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  /* Alerts */
  alertSuccess: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#f0fdf4', border: '1px solid #bbf7d0',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#166534', marginBottom: 24,
  },
  alertError: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#991b1b', marginBottom: 24,
  },

  /* Identity strip */
  identityStrip: {
    display: 'flex', alignItems: 'center', gap: 20,
    marginBottom: 28,
    padding: '24px 28px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 12,
    background: '#1e293b', color: '#f8f7f4',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 600, letterSpacing: '0.02em',
    flexShrink: 0,
  },
  identityName: { fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.01em' },
  identityMeta: { fontSize: 13, color: '#64748b', margin: 0, display: 'flex', alignItems: 'center', gap: 4 },
  badgeGreen: {
    display: 'inline-block', background: '#dcfce7', color: '#166534',
    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  badgeAmber: {
    display: 'inline-block', background: '#fef3c7', color: '#92400e',
    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },

  /* Stats */
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '18px 20px',
  },
  statHeader: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' },
  statValue: { fontSize: 20, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.01em', margin: 0 },

  /* Cards */
  card: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '28px', marginBottom: 16,
  },
  cardHeading: {
    fontSize: 13, fontWeight: 600, color: '#94a3b8',
    letterSpacing: '0.07em', textTransform: 'uppercase',
    margin: '0 0 24px', paddingBottom: 16,
    borderBottom: '1px solid #f1f5f9',
  },

  /* Fields */
  fieldGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px 28px' },
  fieldWrap: {},
  fieldLabel: {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: '#64748b', letterSpacing: '0.07em',
    textTransform: 'uppercase', marginBottom: 8,
  },
  displayField: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 14px', background: '#f8f7f4',
    borderRadius: 8, minHeight: 40,
  },
  fieldIcon: { color: '#94a3b8', marginTop: 1, flexShrink: 0 },
  displayValue: { fontSize: 14, color: '#1e293b', fontWeight: 450, lineHeight: 1.5 },
  empty: { color: '#cbd5e1', fontStyle: 'italic' },
  input: {
    width: '100%', fontSize: 14, color: '#1e293b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', background: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    resize: 'vertical', lineHeight: 1.5,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },

  /* Meta */
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 28px' },
  metaItem: { borderBottom: '1px solid #f1f5f9', paddingBottom: 14 },
  metaLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 4px' },
  metaValue: { fontSize: 14, color: '#1e293b', fontWeight: 500, margin: 0 },
};

export default ClientProfile;