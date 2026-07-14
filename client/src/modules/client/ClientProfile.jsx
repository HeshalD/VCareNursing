import React, { useState, useEffect } from 'react';
import { User, MapPin, Phone, Mail, MessageCircle, Loader2, CheckCircle, AlertCircle, Wallet, Shield, Building2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

const ClientProfile = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

        {/* Contact-to-edit notice */}
        <div style={styles.contactBanner}>
          <MessageCircle size={15} style={{ color: '#475569', flexShrink: 0 }} />
          <span>To update any of your profile details, please contact VCare Nursing.</span>
        </div>

        {/* Outstanding fee banner */}
        {(profile?.reg_fee_status === 'PENDING' || profile?.reg_fee_status === 'INVOICED' || profile?.reg_fee_status === 'EXPIRED') && (
          <div style={styles.feeBanner}>
            <AlertCircle size={15} style={{ color: '#92400e', flexShrink: 0 }} />
            <span>
              {profile?.reg_fee_status === 'EXPIRED'
                ? 'Your VCare membership has expired.'
                : 'You have an outstanding registration fee of'}{' '}
              {profile?.reg_fee_status !== 'EXPIRED' && (
                <strong>LKR {Number(profile?.reg_fee_amount || 10000).toLocaleString('en-LK', { minimumFractionDigits: 2 })}</strong>
              )}
              {profile?.reg_fee_status !== 'EXPIRED' && '. '}
              {profile?.reg_fee_status === 'INVOICED'
                ? 'Please follow the instructions in the WhatsApp invoice to complete your payment.'
                : 'Contact VCare Nursing to receive your invoice and payment instructions.'}
            </span>
          </div>
        )}

        {/* Identity strip */}
        <section style={styles.identityStrip}>
          <div style={styles.avatar}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={styles.identityName}>
              {profile?.honorific ? <span style={styles.honorificPrefix}>{profile.honorific}</span> : null}
              {profile?.full_name || '—'}
            </p>
            {profile?.company_name && (
              <p style={styles.companyBadgeRow}>
                <Building2 size={12} style={{ flexShrink: 0 }} />
                {profile.company_name}
              </p>
            )}
            <p style={styles.identityMeta}>
              Client #{profile?.client_profile_id}&nbsp;&nbsp;·&nbsp;&nbsp;
              {(() => {
                const s = profile?.reg_fee_status;
                if (s === 'PAID') return <span style={styles.badgeGreen}>Registered</span>;
                if (s === 'WAIVED') return <span style={styles.badgeGreen}>Fee Waived</span>;
                if (s === 'RECEIPT_UPLOADED') return <span style={styles.badgeViolet}>Receipt Submitted</span>;
                if (s === 'EXPIRED') return <span style={styles.badgeRose}>Membership Expired</span>;
                return <span style={styles.badgeAmber}>Fee Pending</span>;
              })()}
            </p>
            {(profile?.reg_fee_status === 'INVOICED' || profile?.reg_fee_status === 'RECEIPT_UPLOADED') && profile?.reg_fee_receipt_token && (
              <button
                onClick={() => navigate(`/client/pay-receipt/${profile.reg_fee_receipt_token}`)}
                style={profile?.reg_fee_status === 'RECEIPT_UPLOADED' ? styles.uploadBtnMuted : styles.uploadBtn}
              >
                <Upload size={12} style={{ flexShrink: 0 }} />
                {profile?.reg_fee_status === 'RECEIPT_UPLOADED' ? 'View Receipt Portal' : 'Upload Payment Receipt'}
              </button>
            )}
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
            {/* Title (honorific) */}
            {profile?.honorific && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={styles.fieldWrap}>
                  <label style={styles.fieldLabel}>Title</label>
                  <div style={styles.displayField}>
                    <User size={15} style={styles.fieldIcon} />
                    <span style={styles.displayValue}>{profile.honorific}</span>
                  </div>
                </div>
              </div>
            )}

            <Field
              label="Full Name"
              icon={<User size={15} style={styles.fieldIcon} />}
              display={profile?.full_name}
            />
            <Field
              label="Mobile Number"
              icon={<Phone size={15} style={styles.fieldIcon} />}
              display={profile?.mobile_number}
            />
            <Field
              label="Email Address"
              icon={<Mail size={15} style={styles.fieldIcon} />}
              display={profile?.email}
            />
            <Field
              label="Address"
              icon={<MapPin size={15} style={styles.fieldIcon} />}
              display={profile?.primary_address}
            />

            {/* Company Name — only shown if set */}
            {profile?.company_name && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Field
                  label="Company Name"
                  icon={<Building2 size={15} style={styles.fieldIcon} />}
                  display={profile?.company_name}
                />
              </div>
            )}
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

const Field = ({ label, icon, display }) => (
  <div style={styles.fieldWrap}>
    <label style={styles.fieldLabel}>{label}</label>
    <div style={styles.displayField}>
      {icon}
      <span style={styles.displayValue}>{display || <span style={styles.empty}>Not provided</span>}</span>
    </div>
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
  contactBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#475569', marginBottom: 24,
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
  identityName: { fontSize: 18, fontWeight: 600, color: '#0f172a', margin: '0 0 4px', letterSpacing: '-0.01em', display: 'flex', alignItems: 'baseline', gap: 6 },
  honorificPrefix: { fontSize: 13, fontWeight: 500, color: '#64748b', letterSpacing: '0.02em' },
  companyBadgeRow: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontSize: 12, fontWeight: 500, color: '#475569',
    background: '#f1f5f9', border: '1px solid #e2e8f0',
    borderRadius: 4, padding: '2px 8px', margin: '0 0 6px',
  },
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
  badgeViolet: {
    display: 'inline-block', background: '#f3e8ff', color: '#6b21a8',
    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  badgeRose: {
    display: 'inline-block', background: '#ffe4e6', color: '#9f1239',
    borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  feeBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#78350f', marginBottom: 16,
    lineHeight: 1.5,
  },
  uploadBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    marginTop: 8,
    background: '#1e293b', color: '#f8f7f4',
    border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  uploadBtnMuted: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    marginTop: 8,
    background: 'transparent', color: '#64748b',
    border: '1px solid #cbd5e1', borderRadius: 6,
    padding: '6px 14px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
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

  /* Meta */
  metaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px 28px' },
  metaItem: { borderBottom: '1px solid #f1f5f9', paddingBottom: 14 },
  metaLabel: { fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', margin: '0 0 4px' },
  metaValue: { fontSize: 14, color: '#1e293b', fontWeight: 500, margin: 0 },
};

export default ClientProfile;