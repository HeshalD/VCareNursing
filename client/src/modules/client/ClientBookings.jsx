import React, { useState, useEffect } from 'react';
import {
  Eye, XCircle, Loader2, Calendar, User, Activity,
  Clock, CheckCircle, AlertCircle, Stethoscope, Baby,
  Heart, AlertTriangle, RefreshCw, ChevronDown, Star
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/api';
import { useAuth } from '../../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = d => d
  ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  : '—';

const formatDateLong = d => d
  ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  : '—';

const formatTime = t => {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${period}`;
};

const STATUS_META = {
  active:             { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Active' },
  pending_termination:{ bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Pending Termination' },
  terminated:         { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Terminated' },
  completed:          { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Completed' },
  cancelled:          { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: 'Cancelled' },
};

const StatusBadge = ({ status }) => {
  const key = status?.toLowerCase();
  const m = STATUS_META[key] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em',
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
      borderRadius: 9999, padding: '3px 10px',
    }}>
      {m.label}
    </span>
  );
};

const getServiceTypeIcon = (serviceType) => {
  const icons = { '{NURSE}': Stethoscope, '{NANNY}': Baby, 'HOME_NURSING': Heart };
  return icons[serviceType] || Activity;
};

// ─── Main Component ─────────────────────────────────────────────────────────

const ClientBookings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingDetails, setBookingDetails] = useState({});
  const [showAllBookings, setShowAllBookings] = useState(false);
  const [showTerminationForm, setShowTerminationForm] = useState(false);
  const [terminationBooking, setTerminationBooking] = useState(null);
  const [terminationForm, setTerminationForm] = useState({
    urgency: '', requested_end_date: '', reason: ''
  });
  const [terminationLoading, setTerminationLoading] = useState(false);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewBooking, setReviewBooking] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);

  useEffect(() => { if (user) fetchBookings(); }, [user, showAllBookings]);

  const fetchBookings = async () => {
    setLoading(true); setError('');
    try {
      if (!user) { setError('User authentication required'); return; }
      const response = showAllBookings
        ? await apiClient.getAllBookingsForClient()
        : await apiClient.getActiveBookingByClientID();

      let bookingsData = [];
      if (Array.isArray(response)) bookingsData = response;
      else if (response.status === 'success') bookingsData = response.data || [];
      else { setError(response.message || 'Failed to load bookings'); return; }

      setBookings(bookingsData);

      const detailsPromises = bookingsData.map(async (booking) => {
        try {
          const detailResponse = await apiClient.getBookingById(booking.booking_id);
          return { bookingId: booking.booking_id, details: detailResponse.data };
        } catch (err) {
          console.error(`Error fetching details for booking ${booking.booking_id}:`, err);
          return { bookingId: booking.booking_id, details: null };
        }
      });

      const detailsResults = await Promise.all(detailsPromises);
      const detailsMap = {};
      detailsResults.forEach(r => { if (r.details) detailsMap[r.bookingId] = r.details; });
      setBookingDetails(detailsMap);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleTerminationRequest = (booking) => {
    setTerminationBooking(booking);
    setShowTerminationForm(true);
    setTerminationForm({ urgency: '', requested_end_date: '', reason: '' });
  };

  const handleStaffClick = (staffId) => {
    if (staffId) {
      navigate(`/services/staff-profile/${staffId}`);
    }
  };

  const openReviewModal = (booking) => {
    setReviewBooking(booking);
    setShowReviewModal(true);
    setReviewRating(5);
    setReviewText('');
    setReviewError('');
    setReviewSuccess(false);
  };

  const closeReviewModal = () => {
    setShowReviewModal(false);
    setReviewBooking(null);
    setReviewRating(5);
    setReviewText('');
    setReviewError('');
    setReviewSuccess(false);
  };

  const submitReview = async () => {
    if (!reviewBooking) return;

    const staffProfileId = bookingDetails[reviewBooking.booking_id]?.staff_profile_id;
    if (!staffProfileId) {
      setReviewError('Staff information not available');
      return;
    }

    setSubmittingReview(true);
    setReviewError('');

    try {
      const reviewData = {
        staff_profile_id: staffProfileId,
        rating: reviewRating,
        review_text: reviewText.trim() || null,
        booking_id: reviewBooking.booking_id,
      };

      await apiClient.createStaffReview(reviewData);
      setReviewSuccess(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        closeReviewModal();
      }, 2000);
    } catch (err) {
      console.error('Error submitting review:', err);
      setReviewError(err.message || 'Failed to submit review. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const submitTerminationRequest = async () => {
    if (!terminationForm.urgency || !terminationForm.requested_end_date || !terminationForm.reason) {
      setError('Please fill in all termination form fields'); return;
    }
    try {
      setTerminationLoading(true);
      await apiClient.requestBookingTermination(terminationBooking.booking_id, terminationForm);
      setShowTerminationForm(false);
      setTerminationBooking(null);
      setTerminationForm({ urgency: '', requested_end_date: '', reason: '' });
      fetchBookings();
    } catch (err) {
      console.error('Error requesting termination:', err);
      setError(err.message || 'Failed to request termination');
    } finally {
      setTerminationLoading(false);
    }
  };

  const stats = [
    { label: 'Total', value: bookings.length, color: '#1e293b', bg: '#f1f5f9', icon: Calendar },
    { label: 'Active', value: bookings.filter(b => b.status === 'ACTIVE').length, color: '#166534', bg: '#f0fdf4', icon: CheckCircle },
    { label: 'Pending Termination', value: bookings.filter(b => b.status === 'PENDING_TERMINATION').length, color: '#92400e', bg: '#fffbeb', icon: Clock },
    { label: 'Terminated', value: bookings.filter(b => b.status === 'TERMINATED').length, color: '#991b1b', bg: '#fef2f2', icon: AlertCircle },
    { label: 'Completed', value: bookings.filter(b => b.status === 'COMPLETED').length, color: '#1d4ed8', bg: '#eff6ff', icon: CheckCircle },
  ];

  if (loading) {
    return (
      <div style={s.pageWrapper}>
        <div style={s.centerState}>
          <Loader2 size={28} style={{ ...s.spinnerIcon, animation: 'spin 1s linear infinite' }} />
          <p style={s.loadingText}>Loading your bookings…</p>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  if (error && bookings.length === 0) {
    return (
      <div style={s.pageWrapper}>
        <div style={s.centerState}>
          <div style={s.errorCard}>
            <AlertCircle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
            <p style={s.errorTitle}>Unable to load bookings</p>
            <p style={s.errorBody}>{error}</p>
            <button onClick={fetchBookings} style={s.retryBtn}>Retry</button>
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
            <h1 style={s.pageTitle}>{showAllBookings ? 'All My Bookings' : 'My Active Bookings'}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Active</span>
              <button
                onClick={() => setShowAllBookings(!showAllBookings)}
                style={{
                  width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: showAllBookings ? '#3b82f6' : '#cbd5e1', position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, left: showAllBookings ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }} />
              </button>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>All</span>
            </div>
            <button onClick={fetchBookings} style={s.primaryBtn}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </header>

        {/* Stats */}
        <div style={s.statsGrid}>
          {stats.map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} style={s.statCard}>
              <div style={{ ...s.statIconWrap, background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p style={{ ...s.statValue, color }}>{value}</p>
                <p style={s.statLabel}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bookings Table */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ ...s.cardHeading, margin: 0 }}>Bookings</h2>
          </div>

          {bookings.length === 0 ? (
            <div style={s.emptyState}>
              <Calendar size={32} style={{ color: '#cbd5e1', marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', margin: '0 0 4px' }}>No bookings found</p>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                {showAllBookings ? "You don't have any bookings yet." : "You don't have any active bookings at the moment."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Booking ID', 'Service', 'Start Date', 'Staff Assigned', 'Status', 'Actions'].map(h => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const ServiceIcon = getServiceTypeIcon(b.service_type);
                    const details = bookingDetails[b.booking_id];
                    return (
                      <tr key={b.booking_id || b.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={s.td}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                            {b.booking_code || b.booking_id}
                          </span>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ServiceIcon size={14} style={{ color: '#3b82f6' }} />
                            </div>
                            <span style={{ fontWeight: 500, color: '#0f172a', textTransform: 'capitalize' }}>
                              {b.service_type || 'General Service'}
                            </span>
                          </div>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
                            <Calendar size={12} />
                            {formatDate(b.start_date)}
                          </div>
                          {formatTime(details?.service_start_time) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11, color: '#94a3b8' }}>
                              <Clock size={11} />
                              {formatTime(details.service_start_time)}
                            </div>
                          )}
                        </td>
                        <td style={s.td}>
                          <div 
                            style={{ 
                              display: 'flex', alignItems: 'center', gap: 8, 
                              cursor: details?.staff_profile_id ? 'pointer' : 'default',
                              padding: '4px',
                              borderRadius: '6px',
                              transition: 'background-color 0.2s'
                            }}
                            onClick={() => handleStaffClick(details?.staff_profile_id)}
                            onMouseEnter={(e) => {
                              if (details?.staff_profile_id) {
                                e.currentTarget.style.backgroundColor = '#f1f5f9';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <User size={12} style={{ color: '#64748b' }} />
                            </div>
                            <div>
                              <p style={{ 
                                margin: 0, fontWeight: 500, color: '#0f172a', fontSize: 13,
                                textDecoration: details?.staff_profile_id ? 'underline' : 'none',
                                textDecorationColor: details?.staff_profile_id ? '#3b82f6' : 'transparent',
                                textUnderlineOffset: '2px'
                              }}>
                                {details?.staff_name || `Staff #${b.assigned_staff_id || 'Not assigned'}`}
                              </p>
                              {details?.staff_mobile && (
                                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{details.staff_mobile}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={s.td}><StatusBadge status={b.status} /></td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button
                              onClick={() => setSelectedBooking(b)}
                              style={{ ...s.ghostBtn, color: '#3b82f6', borderColor: '#bfdbfe' }}
                              title="View details"
                            >
                              <Eye size={14} />
                              View
                            </button>
                            {(b.status === 'ACTIVE' || b.status === 'COMPLETED') && details?.staff_profile_id && (
                              <button
                                onClick={() => openReviewModal(b)}
                                style={{ ...s.ghostBtn, color: '#f59e0b', borderColor: '#fde68a' }}
                                title="Leave a review for staff"
                              >
                                <Star size={14} />
                                Review
                              </button>
                            )}
                            {b.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleTerminationRequest(b)}
                                style={{ ...s.ghostBtn, color: '#ef4444', borderColor: '#fecaca' }}
                                title="Request termination"
                              >
                                <AlertTriangle size={14} />
                                Terminate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Detail Modal */}
      {selectedBooking && (
        <div style={s.modalOverlay}>
          <div style={s.modalCard}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Booking Details</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  {selectedBooking.booking_code || selectedBooking.booking_id}
                </p>
              </div>
              <button onClick={() => setSelectedBooking(null)} style={s.closeBtn}>
                <XCircle size={22} style={{ color: '#94a3b8' }} />
              </button>
            </div>
            <div style={{ padding: '24px 28px' }}>
              {/* Booking Info */}
              <div style={{ ...s.infoBlock, marginBottom: 20 }}>
                <h3 style={s.infoBlockTitle}><Calendar size={16} style={{ color: '#3b82f6' }} /> Booking Information</h3>
                <div style={s.infoGrid}>
                  <InfoItem label="Booking" value={selectedBooking.booking_code || selectedBooking.booking_id} />
                  <InfoItem label="Status" value={<StatusBadge status={selectedBooking.status} />} />
                  <InfoItem label="Service Type" value={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {React.createElement(getServiceTypeIcon(selectedBooking.service_type), { size: 14, style: { color: '#3b82f6' } })}
                      </div>
                      <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{selectedBooking.service_type || 'General Service'}</span>
                    </div>
                  } />
                  <InfoItem label="Start Date" value={formatDateLong(selectedBooking.start_date)} />
                  <InfoItem label="Start Time" value={formatTime(bookingDetails[selectedBooking.booking_id]?.service_start_time) || '—'} />
                </div>
              </div>

              {/* Staff Info */}
              <div style={{ ...s.infoBlock, marginBottom: 20 }}>
                <h3 style={s.infoBlockTitle}><User size={16} style={{ color: '#3b82f6' }} /> Assigned Staff</h3>
                {(() => {
                  const details = bookingDetails[selectedBooking.booking_id];
                  if (details && details.staff_name) {
                    return (
                      <div style={s.infoGrid}>
                        <InfoItem 
                          label="Staff Name" 
                          value={
                            <span
                              style={{ 
                                cursor: details.staff_profile_id ? 'pointer' : 'default',
                                color: details.staff_profile_id ? '#3b82f6' : '#1e293b',
                                textDecoration: details.staff_profile_id ? 'underline' : 'none',
                                textDecorationColor: details.staff_profile_id ? '#3b82f6' : 'transparent',
                                textUnderlineOffset: '2px'
                              }}
                              onClick={() => handleStaffClick(details.staff_profile_id)}
                            >
                              {details.staff_name}
                            </span>
                          } 
                        />
                        <InfoItem label="Mobile" value={details.staff_mobile || 'N/A'} />
                        <InfoItem label="Email" value={details.staff_email || 'N/A'} />
                      </div>
                    );
                  }
                  return <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Staff information not available</p>;
                })()}
              </div>

              {/* Raw Data */}
              <div style={s.infoBlock}>
                <h3 style={s.infoBlockTitle}><Activity size={16} style={{ color: '#3b82f6' }} /> Complete Data</h3>
                <pre style={s.codeBlock}>
                  {JSON.stringify({ ...selectedBooking, details: bookingDetails[selectedBooking.booking_id] }, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && reviewBooking && (
        <div style={s.modalOverlay}>
          <div style={{ ...s.modalCard, maxWidth: 480 }}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Leave a Review</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  For: {bookingDetails[reviewBooking.booking_id]?.staff_name || 'Staff Member'}
                </p>
              </div>
              <button onClick={closeReviewModal} style={s.closeBtn}>
                <XCircle size={22} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            <div style={{ padding: '24px 28px' }}>
              {reviewSuccess ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: '#166534', margin: '0 0 8px' }}>Review Submitted!</h3>
                  <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Thank you for your feedback.</p>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 20 }}>
                    <label style={s.fieldLabel}>Your Rating</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setReviewRating(star)}
                          onMouseEnter={() => setReviewRating(star)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 4,
                            transition: 'transform 0.15s',
                          }}
                          onMouseLeave={() => setReviewRating(reviewRating)}
                        >
                          <Star
                            size={28}
                            fill={star <= reviewRating ? '#f59e0b' : '#e2e8f0'}
                            stroke={star <= reviewRating ? '#f59e0b' : '#e2e8f0'}
                            strokeWidth={1}
                          />
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                      {reviewRating === 5 ? 'Excellent' :
                       reviewRating === 4 ? 'Very Good' :
                       reviewRating === 3 ? 'Good' :
                       reviewRating === 2 ? 'Fair' : 'Poor'}
                    </p>
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <label style={s.fieldLabel}>Your Review <span style={{ color: '#64748b' }}>(optional)</span></label>
                    <textarea
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Share your experience with this staff member..."
                      rows={4}
                      maxLength={500}
                      style={s.input}
                    />
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0', textAlign: 'right' }}>
                      {reviewText.length}/500
                    </p>
                  </div>

                  {reviewError && (
                    <div style={{ ...s.alertWarning, marginBottom: 20, background: '#fef2f2', borderColor: '#fecaca' }}>
                      <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{reviewError}</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={closeReviewModal} style={s.secondaryBtn}>Cancel</button>
                    <button
                      onClick={submitReview}
                      disabled={submittingReview}
                      style={{ ...s.primaryBtn, flex: 1, opacity: submittingReview ? 0.7 : 1 }}
                    >
                      {submittingReview ? (
                        <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                      ) : (
                        'Submit Review'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Termination Modal */}
      {showTerminationForm && terminationBooking && (
        <div style={s.modalOverlay}>
          <div style={{ ...s.modalCard, maxWidth: 480 }}>
            <div style={s.modalHeader}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Request Termination</h2>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Booking ID: #{terminationBooking.booking_id || terminationBooking.id}
                </p>
              </div>
              <button onClick={() => setShowTerminationForm(false)} style={s.closeBtn}>
                <XCircle size={22} style={{ color: '#94a3b8' }} />
              </button>
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{ ...s.alertWarning, marginBottom: 20 }}>
                <AlertTriangle size={16} style={{ color: '#b45309', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: '#92400e', margin: '0 0 2px' }}>Termination Request</h4>
                  <p style={{ fontSize: 12, color: '#b45309', margin: 0, lineHeight: 1.5 }}>
                    Submitting this request will initiate the termination process. The admin team will review and process it accordingly.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={s.fieldLabel}>Urgency Level <span style={{ color: '#ef4444' }}>*</span></label>
                  <select
                    value={terminationForm.urgency}
                    onChange={e => setTerminationForm({ ...terminationForm, urgency: e.target.value })}
                    style={s.select}
                  >
                    <option value="">Select urgency level</option>
                    <option value="FUTURE">Low – Can wait</option>
                    <option value="TODAY">Medium – Soon</option>
                    <option value="IMMEDIATE">High – Urgent</option>
                  </select>
                </div>
                <div>
                  <label style={s.fieldLabel}>Requested End Date <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="date"
                    value={terminationForm.requested_end_date}
                    onChange={e => setTerminationForm({ ...terminationForm, requested_end_date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    style={s.input}
                  />
                </div>
                <div>
                  <label style={s.fieldLabel}>Reason for Termination <span style={{ color: '#ef4444' }}>*</span></label>
                  <textarea
                    value={terminationForm.reason}
                    onChange={e => setTerminationForm({ ...terminationForm, reason: e.target.value })}
                    rows={4}
                    placeholder="Please explain why you need to terminate this booking…"
                    style={s.input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button onClick={() => setShowTerminationForm(false)} style={s.secondaryBtn}>Cancel</button>
                <button
                  onClick={submitTerminationRequest}
                  disabled={terminationLoading}
                  style={{ ...s.dangerBtn, opacity: terminationLoading ? 0.7 : 1 }}
                >
                  {terminationLoading ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Inline Helpers ───────────────────────────────────────────────────────────

const InfoItem = ({ label, value }) => (
  <div>
    <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{label}</p>
    <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{value}</div>
  </div>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const keyframes = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: #1e293b !important; box-shadow: 0 0 0 3px rgba(30,41,59,0.08) !important; }
`;

const s = {
  pageWrapper: {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: "'DM Sans', sans-serif",
    color: '#1e293b',
  },
  main: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '48px 24px 80px',
    animation: 'fadeIn 0.35s ease both',
  },
  centerState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '60vh', gap: 12,
  },
  spinnerIcon: { width: 28, height: 28, color: '#64748b' },
  loadingText: { fontSize: 14, color: '#94a3b8', letterSpacing: '0.03em' },
  errorCard: {
    background: '#fff', border: '1px solid #fecaca', borderRadius: 12,
    padding: '32px 40px', textAlign: 'center', maxWidth: 360,
  },
  errorTitle: { fontWeight: 600, fontSize: 16, color: '#1e293b', marginBottom: 6 },
  errorBody: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  retryBtn: {
    background: '#1e293b', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 20px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
  },

  pageHeader: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    marginBottom: 28, padding: '24px 28px',
    borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: 12,
  },
  breadcrumb: { fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 500 },
  pageTitle: { fontSize: 26, fontWeight: 600, color: '#1e293b', letterSpacing: '-0.02em', margin: 0, fontFamily: "'DM Serif Display', serif" },

  primaryBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: '#0f172a', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '9px 18px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  ghostBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'transparent', color: '#64748b',
    border: '1px solid #cbd5e1', borderRadius: 8,
    padding: '6px 12px', fontSize: 12, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },

  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12, marginBottom: 20,
  },
  statCard: {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 14,
  },
  statIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  statValue: { fontSize: 20, fontWeight: 700, margin: '0 0 2px', lineHeight: 1 },
  statLabel: { fontSize: 12, color: '#64748b', margin: 0, fontWeight: 500 },

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

  th: {
    textAlign: 'left', fontSize: 10, fontWeight: 700,
    color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em',
    padding: '12px 14px',
  },
  td: { padding: '14px', verticalAlign: 'middle', color: '#334155' },

  emptyState: { textAlign: 'center', padding: '48px 24px' },

  modalOverlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    background: '#fff', borderRadius: 14,
    maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '22px 28px', borderBottom: '1px solid #f1f5f9',
    position: 'sticky', top: 0, background: '#fff', borderRadius: '14px 14px 0 0',
  },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 2 },

  infoBlock: {
    background: '#f8fafc', borderRadius: 10, padding: 20,
    border: '1px solid #e2e8f0',
  },
  infoBlockTitle: {
    fontSize: 13, fontWeight: 600, color: '#0f172a',
    display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 16px',
  },
  infoGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 28px',
  },
  codeBlock: {
    background: '#0f172a', color: '#22c55e', fontSize: 11,
    fontFamily: "'DM Mono', monospace", padding: 16, borderRadius: 8,
    overflowX: 'auto', lineHeight: 1.6, margin: 0,
  },

  alertWarning: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 8, padding: '14px 16px',
  },

  fieldLabel: {
    display: 'block', fontSize: 11, fontWeight: 600,
    color: '#64748b', letterSpacing: '0.07em',
    textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    width: '100%', fontSize: 14, color: '#1e293b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', background: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    resize: 'vertical', lineHeight: 1.5,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  select: {
    width: '100%', fontSize: 14, color: '#1e293b',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', background: '#fff',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },

  secondaryBtn: {
    flex: 1, background: '#fff', color: '#475569',
    border: '1px solid #e2e8f0', borderRadius: 8,
    padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
  dangerBtn: {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    background: '#ef4444', color: '#fff',
    border: 'none', borderRadius: 8,
    padding: '9px 16px', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  },
};

export default ClientBookings;