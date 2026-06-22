import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Wallet, CreditCard, AlertTriangle, Filter,
  TrendingUp, TrendingDown, DollarSign,
  Clock, CheckCircle, XCircle, ChevronDown,
  ChevronLeft, ChevronRight, RefreshCw, Loader2,
  AlertCircle, Calendar
} from 'lucide-react';
import apiClient from '../../api/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  COMPLETED: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Completed', Icon: CheckCircle },
  PENDING:   { bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Pending',   Icon: Clock },
  FAILED:    { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Failed',    Icon: XCircle },
};

const TX_META = {
  DEBIT:  { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Invoice', Icon: TrendingUp },
  CREDIT: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Payment', Icon: TrendingDown },
};

const METHOD_META = {
  BANK_TRANSFER:  { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', label: 'Bank Transfer' },
  CASH:           { color: '#065f46', bg: '#ecfdf5', border: '#a7f3d0', label: 'Cash' },
  WALLET:         { color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff', label: 'Wallet' },
  ONLINE_GATEWAY: { color: '#92400e', bg: '#fffbeb', border: '#fde68a', label: 'Online' },
};

const formatCurrency = v =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(v || 0);

const formatDate = d =>
  d ? new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// ─── Mini Badge components ────────────────────────────────────────────────────

const Badge = ({ meta, children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: meta.bg, color: meta.color,
    border: `1px solid ${meta.border}`,
    borderRadius: 4, padding: '2px 8px',
    fontSize: 10, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
  }}>
    {children}
  </span>
);

const StatusBadge = ({ status }) => {
  const m = STATUS_META[status] || STATUS_META.PENDING;
  return <Badge meta={m}><m.Icon size={10} />{m.label}</Badge>;
};

const TxBadge = ({ type }) => {
  const m = TX_META[type] || TX_META.DEBIT;
  return <Badge meta={m}><m.Icon size={10} />{m.label}</Badge>;
};

const MethodBadge = ({ method }) => {
  if (!method) return <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>;
  const m = METHOD_META[method] || { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', label: method.replace('_', ' ') };
  return <Badge meta={m}>{m.label}</Badge>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientFinancial = () => {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [clientProfile, setClientProfile] = useState(null);
  const [error, setError]             = useState('');

  const [walletBalance, setWalletBalance]   = useState(0);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [overduePayments, setOverduePayments] = useState([]);
  const [summary, setSummary]               = useState({ total_invoiced: 0, total_paid: 0, balance_due: 0 });
  const [overdueSummary, setOverdueSummary] = useState({ total_overdue_amount: 0, overdue_payments_count: 0, total_outstanding_invoices: 0 });
  const [pagination, setPagination]         = useState({ page: 1, limit: 20, total_pages: 1, total_count: 0 });
  const [filters, setFilters]               = useState({ category: '', payment_method: '', status: '', from_date: '', to_date: '' });
  const [showFilters, setShowFilters]       = useState(false);

  const fetchClientProfile = async () => {
    if (!user?.id) return null;
    try {
      const res = await apiClient.getClientProfileByUserId(user.id);
      if (res.status === 'success' || res.message?.toLowerCase().includes('retrieved successfully')) {
        setClientProfile(res.data);
        return res.data;
      }
    } catch {}
    return null;
  };

  const fetchFinancialData = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError('');

      let profile = clientProfile || await fetchClientProfile();
      if (!profile?.client_profile_id) { setError('Could not load financial data.'); return; }

      const clientId = profile.client_profile_id;
      const queryParams = {
        page: pagination?.page || 1,
        limit: pagination?.limit || 20,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      };

      const [walletRes, historyRes, overdueRes] = await Promise.all([
        apiClient.getClientWalletBalance(clientId),
        apiClient.getClientPaymentHistory(clientId, queryParams),
        apiClient.getClientOverduePayments(clientId),
      ]);

      setWalletBalance(walletRes.data.wallet_balance);
      setPaymentHistory(historyRes.data || []);
      setSummary(historyRes.summary || {});
      setPagination(historyRes.pagination || {});
      setOverduePayments(overdueRes.data || []);
      setOverdueSummary(overdueRes.summary || {});
    } catch (err) {
      setError(err.message || 'Failed to load financial data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading) fetchFinancialData();
  }, [pagination?.page, filters, user, authLoading]);

  const handleFilter = (key, value) => {
    setFilters(p => ({ ...p, [key]: value }));
    setPagination(p => ({ ...p, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ category: '', payment_method: '', status: '', from_date: '', to_date: '' });
    setPagination(p => ({ ...p, page: 1 }));
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  if (loading || authLoading) {
    return (
      <div style={s.pageWrapper}>
        <style>{kf}</style>
        <div style={s.centerState}>
          <Loader2 size={28} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
          <p style={s.loadingText}>Loading financial data</p>
        </div>
      </div>
    );
  }

  const balanceDue = summary?.balance_due || 0;

  return (
    <div style={s.pageWrapper}>
      <style>{kf}</style>

      <main style={s.main}>
        {/* Page header */}
        <header style={s.pageHeader}>
          <div>
            <p style={s.breadcrumb}>Account</p>
            <h1 style={s.pageTitle}>Financial Overview</h1>
          </div>
          <button
            onClick={() => fetchFinancialData(true)}
            disabled={refreshing}
            style={s.refreshBtn}
          >
            <RefreshCw size={13} style={refreshing ? { animation: 'spin 1s linear infinite' } : {}} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        {/* Error */}
        {error && (
          <div style={s.alertError}>
            <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Overdue alert */}
        {overdueSummary?.total_overdue_amount > 0 && (
          <div style={s.overdueAlert}>
            <AlertTriangle size={15} style={{ color: '#b45309', flexShrink: 0 }} />
            <div>
              <p style={s.overdueTitle}>Overdue Payments</p>
              <p style={s.overdueBody}>
                {overdueSummary.overdue_payments_count} overdue payment{overdueSummary.overdue_payments_count !== 1 ? 's' : ''} totalling{' '}
                <strong>{formatCurrency(overdueSummary.total_overdue_amount)}</strong>
                {overdueSummary.total_outstanding_invoices > 0 && (
                  <> · {overdueSummary.total_outstanding_invoices} outstanding invoice{overdueSummary.total_outstanding_invoices !== 1 ? 's' : ''}</>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div style={s.statsRow}>
          <StatCard
            icon={<Wallet size={15} style={{ color: '#7c3aed' }} />}
            label="Wallet Balance"
            value={formatCurrency(walletBalance)}
          />
          <StatCard
            icon={<TrendingUp size={15} style={{ color: '#dc2626' }} />}
            label="Total Invoiced"
            value={formatCurrency(summary?.total_invoiced)}
          />
          <StatCard
            icon={<TrendingDown size={15} style={{ color: '#16a34a' }} />}
            label="Total Paid"
            value={formatCurrency(summary?.total_paid)}
            valueColor="#16a34a"
          />
          <StatCard
            icon={<DollarSign size={15} style={{ color: balanceDue > 0 ? '#dc2626' : '#64748b' }} />}
            label="Balance Due"
            value={formatCurrency(balanceDue)}
            valueColor={balanceDue > 0 ? '#dc2626' : '#16a34a'}
          />
        </div>

        {/* Transaction History */}
        <section style={s.card}>
          {/* Card header */}
          <div style={s.cardHeader}>
            <h2 style={s.cardHeading}>Transaction History</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowFilters(f => !f)}
                style={{ ...s.outlineBtn, ...(hasActiveFilters ? s.outlineBtnActive : {}) }}
              >
                <Filter size={13} />
                Filters
                {hasActiveFilters && <span style={s.filterDot} />}
                <ChevronDown size={12} style={{ transition: 'transform 0.15s', transform: showFilters ? 'rotate(180deg)' : 'rotate(0)' }} />
              </button>
            </div>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div style={s.filterPanel}>
              <div style={s.filterGrid}>
                <FilterSelect label="Category" value={filters.category} onChange={v => handleFilter('category', v)}>
                  <option value="">All Categories</option>
                  <option value="CLIENT_PAYMENT">Client Payment</option>
                  <option value="SERVICE_INVOICE">Service Invoice</option>
                  <option value="WALLET_REFUND">Wallet Refund</option>
                </FilterSelect>
                <FilterSelect label="Method" value={filters.payment_method} onChange={v => handleFilter('payment_method', v)}>
                  <option value="">All Methods</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                  <option value="WALLET">Wallet</option>
                  <option value="ONLINE_GATEWAY">Online Gateway</option>
                </FilterSelect>
                <FilterSelect label="Status" value={filters.status} onChange={v => handleFilter('status', v)}>
                  <option value="">All Statuses</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                </FilterSelect>
                <FilterDate label="From" value={filters.from_date} onChange={v => handleFilter('from_date', v)} />
                <FilterDate label="To"   value={filters.to_date}   onChange={v => handleFilter('to_date', v)} />
              </div>
              {hasActiveFilters && (
                <button onClick={clearFilters} style={s.clearBtn}>Clear all filters</button>
              )}
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Date', 'Type', 'Description', 'Service', 'Method', 'Amount', 'Status'].map(h => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!paymentHistory || paymentHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={s.emptyCell}>
                      <CreditCard size={32} style={{ color: '#cbd5e1', marginBottom: 10 }} />
                      <p style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>No transactions found</p>
                      <p style={{ fontSize: 13, color: '#94a3b8' }}>Try adjusting your filters or check back later.</p>
                    </td>
                  </tr>
                ) : (
                  paymentHistory.map(tx => (
                    <tr key={tx.transaction_id} style={s.tr}>
                      <td style={s.td}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          <Calendar size={11} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                          {formatDate(tx.created_at)}
                        </span>
                      </td>
                      <td style={s.td}><TxBadge type={tx.transaction_type} /></td>
                      <td style={{ ...s.td, maxWidth: 220 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', margin: '0 0 2px' }}>
                          {tx.transaction_description}
                        </p>
                        {tx.notes && (
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{tx.notes}</p>
                        )}
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{tx.service_type || '—'}</span>
                      </td>
                      <td style={s.td}><MethodBadge method={tx.payment_method} /></td>
                      <td style={s.td}>
                        <span style={{
                          fontSize: 14, fontWeight: 700,
                          color: tx.transaction_type === 'DEBIT' ? '#dc2626' : '#16a34a',
                        }}>
                          {tx.transaction_type === 'DEBIT' ? '+' : '−'}{formatCurrency(parseFloat(tx.amount))}
                        </span>
                      </td>
                      <td style={s.td}><StatusBadge status={tx.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination?.total_pages > 1 && (
            <div style={s.paginationBar}>
              <p style={s.paginationInfo}>
                Showing{' '}
                <strong>{((pagination.page - 1) * pagination.limit) + 1}</strong>
                {' – '}
                <strong>{Math.min(pagination.page * pagination.limit, pagination.total_count)}</strong>
                {' of '}
                <strong>{pagination.total_count}</strong>
              </p>
              <div style={s.pageButtons}>
                <PageBtn
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1}
                >
                  <ChevronLeft size={14} />
                </PageBtn>
                {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                  const n = i + 1;
                  return (
                    <PageBtn
                      key={n}
                      onClick={() => setPagination(p => ({ ...p, page: n }))}
                      active={n === pagination.page}
                    >
                      {n}
                    </PageBtn>
                  );
                })}
                <PageBtn
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page === pagination.total_pages}
                >
                  <ChevronRight size={14} />
                </PageBtn>
              </div>
            </div>
          )}
        </section>

        {/* Overdue Payments */}
        {overduePayments?.length > 0 && (
          <section style={{ ...s.card, marginTop: 16, border: '1px solid #fecaca' }}>
            <div style={{ ...s.cardHeader, borderBottom: '1px solid #fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={15} style={{ color: '#dc2626' }} />
                <h2 style={{ ...s.cardHeading, color: '#991b1b' }}>Overdue Payments</h2>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Invoice Date', 'Service', 'Invoiced', 'Paid', 'Balance Due', 'Days Overdue', 'Status'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overduePayments.map(p => (
                    <tr key={p.transaction_id} style={{ ...s.tr, background: '#fff5f5' }}>
                      <td style={s.td}>
                        <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(p.invoice_date)}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 13, color: '#1e293b' }}>{p.service_type || '—'}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formatCurrency(p.invoice_amount)}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 500 }}>{formatCurrency(p.amount_paid)}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>{formatCurrency(p.balance_due)}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{
                          display: 'inline-block',
                          background: p.is_overdue ? '#fef2f2' : '#fffbeb',
                          color: p.is_overdue ? '#991b1b' : '#92400e',
                          border: `1px solid ${p.is_overdue ? '#fecaca' : '#fde68a'}`,
                          borderRadius: 4, padding: '1px 8px',
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {p.days_overdue}d
                        </span>
                      </td>
                      <td style={s.td}>
                        <Badge meta={{ bg: '#fef2f2', color: '#991b1b', border: '#fecaca' }}>Overdue</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, valueColor }) => (
  <div style={s.statCard}>
    <div style={s.statHeader}>{icon}<span style={s.statLabel}>{label}</span></div>
    <p style={{ ...s.statValue, ...(valueColor ? { color: valueColor } : {}) }}>{value}</p>
  </div>
);

const FilterSelect = ({ label, value, onChange, children }) => (
  <div style={s.filterField}>
    <label style={s.filterLabel}>{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)} style={s.input}>{children}</select>
  </div>
);

const FilterDate = ({ label, value, onChange }) => (
  <div style={s.filterField}>
    <label style={s.filterLabel}>{label}</label>
    <input type="date" value={value} onChange={e => onChange(e.target.value)} style={s.input} />
  </div>
);

const PageBtn = ({ children, onClick, disabled, active }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      minWidth: 32, height: 32,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `1px solid ${active ? '#1e293b' : '#e2e8f0'}`,
      borderRadius: 7,
      background: active ? '#1e293b' : '#fff',
      color: active ? '#fff' : disabled ? '#cbd5e1' : '#1e293b',
      fontSize: 13, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer',
      padding: '0 8px',
      fontFamily: "'DM Sans', sans-serif",
      transition: 'all 0.15s',
    }}
  >
    {children}
  </button>
);

// ─── Keyframes ────────────────────────────────────────────────────────────────

const kf = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin   { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  * { box-sizing: border-box; }
  select:focus, input:focus { outline: none; border-color: #1e293b !important; box-shadow: 0 0 0 3px rgba(30,41,59,0.08) !important; }
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
    maxWidth: 1100,
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
  refreshBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  /* Alerts */
  alertError: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#991b1b', marginBottom: 20,
  },
  overdueAlert: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 10, padding: '14px 18px',
    marginBottom: 20,
  },
  overdueTitle: {
    fontSize: 13, fontWeight: 700, color: '#92400e',
    margin: '0 0 3px', letterSpacing: '0.02em',
  },
  overdueBody: { fontSize: 13, color: '#78350f', margin: 0 },

  /* Stats */
  statsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
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
    fontSize: 20, fontWeight: 700, color: '#0f172a',
    letterSpacing: '-0.01em', margin: 0,
  },

  /* Card */
  card: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid #f1f5f9',
  },
  cardHeading: {
    fontSize: 14, fontWeight: 700, color: '#1e293b',
    margin: 0, letterSpacing: '-0.01em',
  },

  /* Outline button */
  outlineBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#fff', color: '#64748b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '7px 14px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    position: 'relative',
  },
  outlineBtnActive: {
    border: '1px solid #1e293b', color: '#1e293b',
  },
  filterDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#1e293b', flexShrink: 0,
  },

  /* Filter panel */
  filterPanel: {
    padding: '16px 24px',
    borderBottom: '1px solid #f1f5f9',
    background: '#fafafa',
    animation: 'fadeIn 0.15s ease both',
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px 16px',
    marginBottom: 8,
  },
  filterField: {},
  filterLabel: {
    display: 'block', fontSize: 10, fontWeight: 700,
    color: '#94a3b8', letterSpacing: '0.07em',
    textTransform: 'uppercase', marginBottom: 5,
  },
  input: {
    width: '100%', fontSize: 13, color: '#1e293b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '8px 10px', background: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  clearBtn: {
    background: 'none', border: 'none',
    fontSize: 12, color: '#94a3b8',
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    padding: 0, textDecoration: 'underline',
  },

  /* Table */
  table: {
    width: '100%', borderCollapse: 'collapse',
    fontFamily: "'DM Sans', sans-serif",
    minWidth: 640,
  },
  th: {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 10, color: '#94a3b8',
    fontWeight: 700, letterSpacing: '0.07em',
    textTransform: 'uppercase',
    background: '#f8fafc',
    borderBottom: '1px solid #f1f5f9',
  },
  tr: {
    borderBottom: '1px solid #f8fafc',
    transition: 'background 0.1s',
  },
  td: {
    padding: '13px 16px',
    fontSize: 13, color: '#1e293b',
    verticalAlign: 'middle',
  },
  emptyCell: {
    padding: '48px 24px',
    textAlign: 'center',
    color: '#94a3b8',
    verticalAlign: 'middle',
  },

  /* Pagination */
  paginationBar: {
    display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderTop: '1px solid #f1f5f9',
    background: '#fafafa',
  },
  paginationInfo: { fontSize: 13, color: '#94a3b8' },
  pageButtons: { display: 'flex', gap: 4 },

  /* Center state */
  centerState: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', gap: 12,
  },
  loadingText: { fontSize: 14, color: '#94a3b8', letterSpacing: '0.03em' },
};

export default ClientFinancial;