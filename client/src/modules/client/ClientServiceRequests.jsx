import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, DollarSign, Clock, CheckCircle,
  AlertCircle, XCircle, Loader2,
  ChevronDown, ChevronRight, User,
  CreditCard, Eye, Briefcase, Calendar,
  MapPin, Phone, Activity, List
} from 'lucide-react';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  NEW_LEAD:            { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'New Lead' },
  PENDING:             { bg: '#fefce8', color: '#854d0e', border: '#fde68a', label: 'Pending' },
  CONFIRMED:           { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Confirmed' },
  ASSIGNED:            { bg: '#faf5ff', color: '#6b21a8', border: '#e9d5ff', label: 'Assigned' },
  COMPLETED:           { bg: '#ecfdf5', color: '#065f46', border: '#a7f3d0', label: 'Completed' },
  CANCELLED:           { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Cancelled' },
  SENT:                { bg: '#eef2ff', color: '#3730a3', border: '#c7d2fe', label: 'Sent' },
  VERIFIED:            { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Verified' },
  PENDING_VERIFICATION:{ bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Pending Verification' },
};

const STATUS_ICONS = {
  NEW_LEAD: AlertCircle, PENDING: Clock, CONFIRMED: CheckCircle,
  ASSIGNED: User, COMPLETED: CheckCircle, CANCELLED: XCircle,
  SENT: FileText, VERIFIED: CheckCircle, PENDING_VERIFICATION: AlertCircle,
};

const formatDate = d => d
  ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const formatCurrency = v =>
  `Rs. ${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── StatusBadge ──────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: status || 'Unknown' };
  const Icon = STATUS_ICONS[status] || AlertCircle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.border}`,
      borderRadius: 4, padding: '2px 8px',
      fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase',
    }}>
      <Icon size={10} />
      {meta.label}
    </span>
  );
};

// ─── TYPE DOT COLORS ──────────────────────────────────────────────────────────
const TYPE_DOT = { service_request: '#3b82f6', quote: '#f59e0b', payment: '#10b981' };
const TYPE_ICON = { service_request: FileText, quote: DollarSign, payment: CreditCard };
const TYPE_LABEL = { service_request: 'Service Request', quote: 'Quotation', payment: 'Payment Slip' };

const DetailItem = ({ label, value, icon, strong }) => (
  <div>
    <p style={s.detailLabel}>{label}</p>
    <p style={{ ...s.detailValue, fontWeight: strong ? 700 : 500 }}>
      {icon && <span style={{ marginRight: 4, opacity: 0.6 }}>{icon}</span>}
      {value || <span style={s.empty}>—</span>}
    </p>
  </div>
);

// ─── TimelineItem ─────────────────────────────────────────────────────────────

const TimelineItem = ({ item, type, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const Icon = TYPE_ICON[type] || FileText; // Fallback to FileText
  const dotColor = TYPE_DOT[type] || '#64748b'; // Fallback to gray

  return (
    <div style={{ position: 'relative', paddingLeft: 40, paddingBottom: isLast ? 0 : 24 }}>
      {/* Vertical line */}
      {!isLast && (
        <div style={{
          position: 'absolute', left: 11, top: 28, bottom: 0,
          width: 1, background: '#e2e8f0',
        }} />
      )}

      {/* Dot */}
      <div style={{
        position: 'absolute', left: 5, top: 8,
        width: 14, height: 14, borderRadius: '50%',
        background: dotColor,
        border: '2.5px solid #fff',
        boxShadow: `0 0 0 2px ${dotColor}33`,
      }} />

      {/* Card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        {/* Card header */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '16px 20px', cursor: 'pointer',
          }}
          onClick={() => setExpanded(e => !e)}
        >
          <div style={{ flex: 1 }}>
            {/* Type + badge row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 700,
                color: dotColor, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                <Icon size={12} />
                {TYPE_LABEL[type] || 'Unknown'}
              </span>
              {type === 'service_request' && <StatusBadge status={item.status} />}
              {type === 'quote' && <StatusBadge status={item.status || 'SENT'} />}
              {type === 'payment' && <StatusBadge status={item.verified_at ? 'VERIFIED' : 'PENDING_VERIFICATION'} />}
            </div>

            {/* Primary info */}
            {type === 'service_request' && (
              <div>
                <p style={s.cardPrimary}>{item.patient_name || '—'}</p>
                <p style={s.cardSub}>{item.service_type}</p>
              </div>
            )}
            {type === 'quote' && (
              <div>
                <p style={s.cardPrimary}>{item.estimate_number}</p>
                <p style={{ ...s.cardSub, fontWeight: 600, color: '#0f172a', fontSize: 16 }}>
                  {formatCurrency(item.total_amount)}
                </p>
              </div>
            )}
            {type === 'payment' && (
              <div>
                <p style={s.cardPrimary}>Slip for {item.estimate_number}</p>
                <p style={{ ...s.cardSub, fontWeight: 600, color: '#0f172a', fontSize: 16 }}>
                  {formatCurrency(item.total_amount)}
                </p>
              </div>
            )}

            {/* Timestamp */}
            <p style={s.cardTime}>
              <Calendar size={11} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
              {formatDate(
                type === 'service_request' ? item.created_at
                : type === 'quote' ? item.quote_created_at
                : item.payment_uploaded_at
              )}
            </p>
          </div>

          {/* Chevron */}
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: expanded ? '#f1f5f9' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
            flexShrink: 0, marginLeft: 12,
          }}>
            {expanded
              ? <ChevronDown size={15} style={{ color: '#64748b' }} />
              : <ChevronRight size={15} style={{ color: '#94a3b8' }} />}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #f1f5f9',
            background: '#fafafa',
            animation: 'expandIn 0.18s ease both',
          }}>
            {type === 'service_request' && (
              <div style={s.detailGrid}>
                <DetailItem label="Payer Name" value={item.payer_name} />
                <DetailItem label="Payer Mobile" value={item.payer_mobile} icon={<Phone size={12} />} />
                <DetailItem label="Age" value={item.patient_age ? `${item.patient_age} years` : null} />
                <DetailItem label="Service Model" value={item.service_model} />
                {item.location_address && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <DetailItem label="Address" value={item.location_address} icon={<MapPin size={12} />} />
                  </div>
                )}
                {item.patient_condition && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <DetailItem label="Condition" value={item.patient_condition} />
                  </div>
                )}
              </div>
            )}

            {type === 'quote' && (
              <div style={s.detailGrid}>
                <DetailItem label="Daily Rate" value={formatCurrency(item.daily_rate)} />
                <DetailItem label="Duration" value={item.qty_days ? `${item.qty_days} days` : null} />
                <DetailItem label="Transport Fee" value={formatCurrency(item.transport_fee)} />
                <DetailItem label="Registration Fee" value={formatCurrency(item.registration_fee)} />
                <DetailItem label="Subtotal" value={formatCurrency(item.sub_total)} />
                <DetailItem label="Total" value={formatCurrency(item.total_amount)} strong />
              </div>
            )}

            {type === 'payment' && (
              <div style={s.detailGrid}>
                <DetailItem label="Quote Ref." value={item.estimate_number} />
                <DetailItem label="Amount" value={formatCurrency(item.total_amount)} strong />
                <DetailItem label="Uploaded" value={formatDate(item.payment_uploaded_at)} />
                {item.verified_at && (
                  <DetailItem label="Verified" value={formatDate(item.verified_at)} />
                )}
                {item.slip_url && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                    <button style={s.slipBtn}>
                      <Eye size={13} />
                      View Payment Slip
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientServiceRequests = () => {
  const [viewMode, setViewMode]   = useState('timeline');
  const [filter, setFilter]       = useState('all');
  const [loading, setLoading]     = useState(true);
  const [data, setData]           = useState([]);
  const [error, setError]         = useState('');
  const { user }                  = useAuth();

  useEffect(() => { fetchData(); }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const profileResponse = await apiClient.getClientProfileByUserId(user.user_id);
      if (!profileResponse.data?.client_profile_id) {
        setError('Client profile not found. Please contact support.');
        setLoading(false);
        return;
      }
      await fetchServiceRequests(profileResponse.data.client_profile_id);
    } catch {
      setError('Failed to fetch client profile. Please contact support.');
      setLoading(false);
    }
  };

  const fetchServiceRequests = async (clientProfileId) => {
    try {
      let response;
      switch (filter) {
        case 'requests': response = await apiClient.getClientServiceRequests(clientProfileId); break;
        case 'quotes':   response = await apiClient.getClientQuotes(clientProfileId); break;
        case 'payments': response = await apiClient.getClientPaymentSlips(clientProfileId); break;
        default:         response = await apiClient.getClientServiceHistory(clientProfileId);
      }
      setData(response.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const prepareTimelineData = () => {
    const timeline = [];
    
    if (filter === 'all') {
      // Unified service history data - each item has type field
      data.forEach(item => {
        timeline.push({
          ...item,
          type: item.type,
          _sortDate: item.date || item.created_at
        });
      });
    } else {
      // Individual endpoint data - add type based on filter
      data.forEach(item => {
        const type = filter === 'requests' ? 'service_request' : 
                   filter === 'quotes' ? 'quote' : 'payment';
        timeline.push({
          ...item,
          type: type,
          _sortDate: item.created_at || item.quote_created_at || item.payment_uploaded_at
        });
      });
    }
    
    return timeline.sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate));
  };

  /* Summary counts */
  const counts = {
    requests: filter === 'all' ? data.filter(d => d.type === 'service_request').length : 
             filter === 'requests' ? data.length : 0,
    quotes:   filter === 'all' ? data.filter(d => d.type === 'quote').length : 
             filter === 'quotes' ? data.length : 0,
    payments: filter === 'all' ? data.filter(d => d.type === 'payment').length : 
             filter === 'payments' ? data.length : 0,
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div style={s.centerState}>
          <Loader2 size={28} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
          <p style={s.loadingText}>Loading history</p>
        </div>
      );
    }

    if (error) {
      const isAccess = error.includes('Client profile not found');
      return (
        <div style={s.errorCard}>
          <AlertCircle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
          <p style={s.errorTitle}>{isAccess ? 'Profile Not Found' : 'Something went wrong'}</p>
          <p style={s.errorBody}>{error}</p>
          {!isAccess && (
            <button onClick={fetchData} style={s.retryBtn}>Retry</button>
          )}
          {isAccess && user?.staff_profile_id && (
            <Link to="/services/provider-dashboard" style={s.staffBtn}>
              <Briefcase size={14} />
              Staff Dashboard
            </Link>
          )}
        </div>
      );
    }

    if (data.length === 0) {
      return (
        <div style={s.emptyState}>
          <FileText size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
          <p style={s.emptyTitle}>No records found</p>
          <p style={s.emptyBody}>
            {filter === 'all'
              ? 'No service requests, quotes, or payments yet.'
              : `No ${filter} found.`}
          </p>
        </div>
      );
    }

    if (viewMode === 'timeline') {
      const items = prepareTimelineData();
      return (
        <div>
          {items.map((item, i) => (
            <TimelineItem
              key={`${item.type}-${item._sortDate}-${i}`}
              item={item}
              type={item.type}
              isLast={i === items.length - 1}
            />
          ))}
        </div>
      );
    }

    /* List view */
    const items = prepareTimelineData(); // Use same processed data as timeline
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Type', 'Details', 'Status', 'Date'].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const Icon = TYPE_ICON[item.type] || FileText;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={s.td}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: TYPE_DOT[item.type] || '#64748b' }}>
                      <Icon size={14} />
                      {TYPE_LABEL[item.type] || 'Unknown'}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ fontSize: 13, color: '#1e293b', lineHeight: 1.7 }}>
                      {item.patient_name && <div><strong style={{ color: '#64748b', fontWeight: 500 }}>Care Profile:</strong> {item.patient_name}</div>}
                      {item.estimate_number && <div><strong style={{ color: '#64748b', fontWeight: 500 }}>Quote:</strong> {item.estimate_number}</div>}
                      {item.total_amount && <div><strong style={{ color: '#64748b', fontWeight: 500 }}>Amount:</strong> {formatCurrency(item.total_amount)}</div>}
                    </div>
                  </td>
                  <td style={s.td}>
                    {item.type === 'service_request' && <StatusBadge status={item.status} />}
                    {item.type === 'quote' && <StatusBadge status={item.status || 'SENT'} />}
                    {item.type === 'payment' && <StatusBadge status={item.verified_at ? 'VERIFIED' : 'PENDING_VERIFICATION'} />}
                  </td>
                  <td style={{ ...s.td, color: '#94a3b8', fontSize: 12 }}>
                    {formatDate(item._sortDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const FILTERS = [
    { key: 'all',      label: 'All' },
    { key: 'requests', label: 'Requests' },
    { key: 'quotes',   label: 'Quotes' },
    { key: 'payments', label: 'Payments' },
  ];

  return (
    <div style={s.pageWrapper}>
      <style>{keyframes}</style>

      <main style={s.main}>
        {/* Page header */}
        <header style={s.pageHeader}>
          <div>
            <p style={s.breadcrumb}>Account</p>
            <h1 style={s.pageTitle}>Service History</h1>
          </div>
          {/* View mode toggle */}
          <div style={s.viewToggle}>
            <button
              onClick={() => setViewMode('timeline')}
              style={{ ...s.toggleBtn, ...(viewMode === 'timeline' ? s.toggleActive : {}) }}
              title="Timeline View"
            >
              <Clock size={14} />
              Timeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{ ...s.toggleBtn, ...(viewMode === 'list' ? s.toggleActive : {}) }}
              title="List View"
            >
              <List size={14} />
              List
            </button>
          </div>
        </header>

        {/* Summary stats */}
        <div style={s.statsRow}>
          <div style={s.statCard}>
            <div style={s.statHeader}>
              <FileText size={15} style={{ color: '#3b82f6' }} />
              <span style={s.statLabel}>Requests</span>
            </div>
            <p style={s.statValue}>{counts.requests}</p>
          </div>
          <div style={s.statCard}>
            <div style={s.statHeader}>
              <DollarSign size={15} style={{ color: '#f59e0b' }} />
              <span style={s.statLabel}>Quotations</span>
            </div>
            <p style={s.statValue}>{counts.quotes}</p>
          </div>
          <div style={s.statCard}>
            <div style={s.statHeader}>
              <CreditCard size={15} style={{ color: '#10b981' }} />
              <span style={s.statLabel}>Payments</span>
            </div>
            <p style={s.statValue}>{counts.payments}</p>
          </div>
          <div style={s.statCard}>
            <div style={s.statHeader}>
              <Activity size={15} style={{ color: '#64748b' }} />
              <span style={s.statLabel}>Total Records</span>
            </div>
            <p style={s.statValue}>{counts.requests + counts.quotes + counts.payments}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div style={s.filterBar}>
          <div style={s.filterGroup}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{ ...s.filterBtn, ...(filter === f.key ? s.filterActive : {}) }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <section style={s.content}>
          {renderContent()}
        </section>
      </main>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes expandIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
`;

const s = {
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

  /* Page header */
  pageHeader: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 28,
    marginTop: 36,
    padding: '24px 28px',
    borderBottom: '1px solid #e2e8f0',
    background: '#fff',
    borderRadius: 12,
  },
  breadcrumb: {
    fontSize: 12, color: '#64748b',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 4, fontWeight: 500,
  },
  pageTitle: {
    fontSize: 28, fontWeight: 600, color: '#1e293b',
    letterSpacing: '-0.02em', margin: 0,
    fontFamily: "'DM Serif Display', serif",
  },

  /* View toggle */
  viewToggle: {
    display: 'flex', background: '#f1f5f9',
    borderRadius: 8, padding: 3, gap: 2,
  },
  toggleBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '6px 13px', borderRadius: 6, border: 'none',
    background: 'transparent', color: '#64748b',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s',
  },
  toggleActive: {
    background: '#fff', color: '#1e293b',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },

  /* Stats */
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12, marginBottom: 16,
  },
  statCard: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '18px 20px',
  },
  statHeader: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 },
  statLabel: {
    fontSize: 11, color: '#94a3b8', fontWeight: 600,
    letterSpacing: '0.07em', textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 22, fontWeight: 600, color: '#0f172a',
    letterSpacing: '-0.01em', margin: 0,
  },

  /* Filter bar */
  filterBar: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '16px 20px',
    marginBottom: 20,
  },
  filterGroup: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  filterBtn: {
    padding: '7px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
    background: 'transparent', color: '#64748b',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s',
  },
  filterActive: {
    background: '#1e293b', color: '#f8f7f4',
    border: '1px solid #1e293b',
  },

  /* Content */
  content: {
    animation: 'fadeIn 0.2s ease both',
  },

  /* Center states */
  centerState: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 0', gap: 12,
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12,
  },
  loadingText: { fontSize: 14, color: '#94a3b8', letterSpacing: '0.03em' },
  errorCard: {
    background: '#fff', border: '1px solid #fecaca',
    borderRadius: 12, padding: '40px',
    textAlign: 'center',
  },
  errorTitle: { fontWeight: 600, fontSize: 16, color: '#1e293b', marginBottom: 6 },
  errorBody: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  retryBtn: {
    background: '#1e293b', color: '#fff', border: 'none',
    borderRadius: 8, padding: '8px 20px',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },
  staffBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#4f46e5', color: '#fff',
    borderRadius: 8, padding: '8px 20px',
    fontSize: 13, fontWeight: 500,
    textDecoration: 'none',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 0',
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: '#1e293b', marginBottom: 6 },
  emptyBody: { fontSize: 14, color: '#94a3b8' },

  /* Timeline card internals */
  cardPrimary: { fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' },
  cardSub: { fontSize: 13, color: '#64748b', margin: '0 0 6px' },
  cardTime: { fontSize: 11, color: '#94a3b8', margin: 0 },

  /* Detail grid */
  detailGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px 24px',
  },
  detailLabel: {
    fontSize: 10, color: '#94a3b8', fontWeight: 700,
    letterSpacing: '0.07em', textTransform: 'uppercase',
    margin: '0 0 2px',
  },
  detailValue: { fontSize: 13, color: '#1e293b', margin: 0 },
  empty: { color: '#cbd5e1', fontStyle: 'italic' },

  slipBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#3b82f6',
    border: '1px solid #bfdbfe', borderRadius: 7,
    padding: '6px 14px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  /* Table */
  th: {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 11, color: '#94a3b8',
    fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase',
  },
  td: { padding: '14px 16px', fontSize: 13, color: '#1e293b', verticalAlign: 'top' },
};

export default ClientServiceRequests;