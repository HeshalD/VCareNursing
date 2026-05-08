import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, AlertCircle, RefreshCw,
  ChevronLeft, ChevronRight, User, Calendar,
  Users, Clock, PenLine, ArrowRight, MessageCircle
} from 'lucide-react';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = d => d
  ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—';

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientReviews = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [insights, setInsights] = useState({
    total: 0,
    uniqueStaff: 0,
    latestDate: null,
    avgWords: 0,
    mostReviewedStaff: null,
    mostReviewedCount: 0,
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const profileResponse = await apiClient.getClientProfileByUserId(user.user_id || user.id);
      if (!profileResponse.data?.client_profile_id) {
        setError('Client profile not found. Please contact support.');
        setLoading(false);
        return;
      }
      const clientProfileId = profileResponse.data.client_profile_id;
      const response = await apiClient.getClientReviews(clientProfileId, page, 10);
      const reviewList = response.reviews || [];
      setReviews(reviewList);
      setPagination(response.pagination || { page: 1, limit: 10, total: 0, pages: 0 });

      // Compute insights across all pages using total count
      const total = response.pagination?.total || reviewList.length;
      const allReviews = reviewList; // API returns current page; use what we have for current-page insights
      const uniqueStaff = new Set(allReviews.map(r => r.staff_profile_id)).size;
      const latestDate = allReviews.length
        ? allReviews.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), allReviews[0].created_at)
        : null;
      const avgWords = allReviews.length
        ? Math.round(allReviews.reduce((s, r) => s + (r.review_text?.split(/\s+/).length || 0), 0) / allReviews.length)
        : 0;

      // Find most-reviewed staff
      const staffCounts = {};
      allReviews.forEach(r => {
        staffCounts[r.staff_profile_id] = (staffCounts[r.staff_profile_id] || 0) + 1;
      });
      let mostReviewedStaff = null;
      let mostReviewedCount = 0;
      Object.entries(staffCounts).forEach(([staffId, count]) => {
        if (count > mostReviewedCount) {
          mostReviewedCount = count;
          const rev = allReviews.find(r => String(r.staff_profile_id) === String(staffId));
          mostReviewedStaff = rev?.staff_name || `Staff #${staffId}`;
        }
      });

      setInsights({ total, uniqueStaff, latestDate, avgWords, mostReviewedStaff, mostReviewedCount });
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setError(err.message || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={s.pageWrapper}>
        <div style={s.centerState}>
          <Loader2 size={28} style={{ ...s.spinnerIcon, animation: 'spin 1s linear infinite' }} />
          <p style={s.loadingText}>Loading reviews</p>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (error && reviews.length === 0) {
    return (
      <div style={s.pageWrapper}>
        <div style={s.centerState}>
          <div style={s.errorCard}>
            <AlertCircle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
            <p style={s.errorTitle}>Unable to load reviews</p>
            <p style={s.errorBody}>{error}</p>
            <button onClick={() => fetchData()} style={s.retryBtn}>Retry</button>
          </div>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  return (
    <div style={s.pageWrapper}>
      <style>{keyframes}</style>
      <main style={s.main}>
        {/* Header */}
        <header style={s.pageHeader}>
          <div>
            <p style={s.breadcrumb}>Account</p>
            <h1 style={s.pageTitle}>My Reviews</h1>
          </div>
          <button onClick={() => navigate('/services/view-staff')} style={s.primaryBtn}>
            Browse Staff
            <ArrowRight size={14} />
          </button>
        </header>

        {/* Alerts */}
        {error && (
          <div style={s.alertError}>
            <AlertCircle size={15} style={{ color: '#dc2626', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Insights */}
        {insights.total > 0 && (
          <div style={s.insightsGrid}>
            <div style={s.insightCard}>
              <div style={s.insightIcon}><MessageCircle size={18} style={{ color: '#0f172a' }} /></div>
              <div>
                <p style={s.insightValue}>{insights.total}</p>
                <p style={s.insightLabel}>Total Reviews</p>
              </div>
            </div>
            <div style={s.insightCard}>
              <div style={s.insightIcon}><Users size={18} style={{ color: '#0f172a' }} /></div>
              <div>
                <p style={s.insightValue}>{insights.uniqueStaff}</p>
                <p style={s.insightLabel}>Staff Reviewed</p>
              </div>
            </div>
            <div style={s.insightCard}>
              <div style={s.insightIcon}><PenLine size={18} style={{ color: '#0f172a' }} /></div>
              <div>
                <p style={s.insightValue}>{insights.avgWords}</p>
                <p style={s.insightLabel}>Avg Words / Review</p>
              </div>
            </div>
            <div style={s.insightCard}>
              <div style={s.insightIcon}><Clock size={18} style={{ color: '#0f172a' }} /></div>
              <div>
                <p style={s.insightValue}>{insights.latestDate ? formatDate(insights.latestDate) : '—'}</p>
                <p style={s.insightLabel}>Latest Review</p>
              </div>
            </div>
          </div>
        )}

        {insights.mostReviewedStaff && (
          <div style={{ ...s.card, marginBottom: 16 }}>
            <h2 style={{ ...s.cardHeading, margin: 0, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>Most Reviewed Staff</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <div style={s.avatar}>
                <User size={16} style={{ color: '#64748b' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>{insights.mostReviewedStaff}</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{insights.mostReviewedCount} review{insights.mostReviewedCount > 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        )}

        {/* Reviews List */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ ...s.cardHeading, margin: 0 }}>All Reviews</h2>
            <button onClick={() => fetchData(pagination.page)} style={s.ghostBtn}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {reviews.length === 0 ? (
            <div style={s.emptyState}>
              <MessageCircle size={32} style={{ color: '#cbd5e1', marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>No reviews yet</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>
                You have not submitted any reviews. Browse staff to book and review caregivers.
              </p>
              <button onClick={() => navigate('/services/view-staff')} style={s.primaryBtn}>
                Browse Staff
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {reviews.map(review => (
                <div key={review.review_id} style={s.reviewCard}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={s.avatar}>
                        <User size={14} style={{ color: '#64748b' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 2px' }}>
                          {review.staff_name || `Staff #${review.staff_profile_id}`}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
                          <Calendar size={12} />
                          {formatDate(review.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, margin: 0 }}>
                    {review.review_text}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button
                onClick={() => fetchData(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{ ...s.ghostBtn, opacity: pagination.page <= 1 ? 0.4 : 1 }}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => fetchData(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                style={{ ...s.ghostBtn, opacity: pagination.page >= pagination.pages ? 0.4 : 1 }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
  input:focus, textarea:focus { outline: none; border-color: #1e293b !important; box-shadow: 0 0 0 3px rgba(30,41,59,0.08) !important; }
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
    borderRadius: 12,
  },
  breadcrumb: { fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 500 },
  pageTitle: { fontSize: 28, fontWeight: 600, color: '#1e293b', letterSpacing: '-0.02em', margin: 0, fontFamily: "'DM Serif Display', serif" },

  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#0f172a', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.01em',
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b',
    border: '1px solid #cbd5e1', borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  /* Alerts */
  alertError: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: 8, padding: '12px 16px',
    fontSize: 13, color: '#991b1b', marginBottom: 24,
  },

  /* Insights */
  insightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  insightCard: {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightValue: {
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 2px',
    lineHeight: 1,
  },
  insightLabel: {
    fontSize: 12,
    color: '#64748b',
    margin: 0,
    fontWeight: 500,
  },

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

  /* Review cards */
  reviewCard: {
    background: '#f8fafc', border: '1px solid #e2e8f0',
    borderRadius: 10, padding: '20px 24px',
  },
  avatar: {
    width: 36, height: 36, borderRadius: '50%',
    background: '#e2e8f0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  /* Empty state */
  emptyState: {
    textAlign: 'center', padding: '48px 24px',
  },
};

export default ClientReviews;
