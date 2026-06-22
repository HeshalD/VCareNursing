import React, { useState, useEffect } from 'react';
import {
  Calendar, User, Activity, Clock, MapPin, Phone,
  AlertCircle, CheckCircle, Stethoscope, Baby, Heart,
  Loader2, RefreshCw, ChevronDown, ChevronUp, DollarSign,
  FileText, AlertTriangle
} from 'lucide-react';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';
import StaffCareTimeline from '../../admin/user_managemnet/StaffCareTimeline';

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
  active: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'Active' },
  pending_termination: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Pending Termination' },
  terminated: { bg: '#fef2f2', color: '#991b1b', border: '#fecaca', label: 'Terminated' },
  completed: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Completed' },
  cancelled: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: 'Cancelled' },
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
  const icons = { NURSE: Stethoscope, NANNY: Baby, HOME_NURSING: Heart };
  return icons[serviceType] || Activity;
};

// ─── Main Component ─────────────────────────────────────────────────────────

const WorkerBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedBooking, setExpandedBooking] = useState(null);
  const [staffProfileId, setStaffProfileId] = useState(null);
  const [timelineAssignments, setTimelineAssignments] = useState([]);
  const [timelineAttendance, setTimelineAttendance] = useState([]);
  const [timelineLeaveDays, setTimelineLeaveDays] = useState([]);

  useEffect(() => {
    if (user) {
      fetchStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    if (staffProfileId) {
      fetchBookings();
      fetchTimeline();
    }
  }, [staffProfileId]);

  const fetchStaffProfile = async () => {
    try {
      if (!user?.id) {
        setError('User not authenticated');
        setLoading(false);
        return;
      }
      const response = await apiClient.getStaffByUserID(user.id);
      if (response?.data?.staff_profile_id) {
        setStaffProfileId(response.data.staff_profile_id);
      } else {
        setError('Staff profile not found');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching staff profile:', err);
      setError('Failed to load staff profile');
      setLoading(false);
    }
  };

  const fetchBookings = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.getStaffBookings(staffProfileId);
      let bookingsData = [];
      if (Array.isArray(response)) {
        bookingsData = response;
      } else if (response.status === 'success') {
        bookingsData = response.data || [];
      } else {
        setError(response.message || 'Failed to load bookings');
        setLoading(false);
        return;
      }
      setBookings(bookingsData);
    } catch (err) {
      console.error('Error fetching bookings:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      const [calendarRes, leaveRes] = await Promise.all([
        apiClient.getStaffAttendanceCalendar(staffProfileId),
        apiClient.getStaffLeaveSummary(staffProfileId),
      ]);
      setTimelineAssignments(calendarRes?.data?.assignments || []);
      setTimelineAttendance(calendarRes?.data?.attendance || []);
      setTimelineLeaveDays(leaveRes?.data?.approved_leaves || []);
    } catch (err) {
      console.error('Error fetching work & pay calendar:', err);
    }
  };

  const toggleExpand = (bookingId) => {
    setExpandedBooking(expandedBooking === bookingId ? null : bookingId);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900">
        <StaffSidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900">
        <StaffSidebar />
        <main className="flex-1 flex items-center justify-center p-8 text-center">
          <div>
            <AlertCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
            <button
              onClick={fetchBookings}
              style={{
                padding: '0.5rem 1rem',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900 overflow-hidden">
      <StaffSidebar />
      <main className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>
              My Assignments
            </h1>
            <p style={{ color: '#6b7280' }}>
              View all your current and past patient assignments
            </p>
          </div>

          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Total Assignments</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1f2937' }}>{bookings.length}</div>
            </div>
            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Active</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#166534' }}>
                {bookings.filter(b => b.status?.toLowerCase() === 'active').length}
              </div>
            </div>
            <div style={{
              background: 'white',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Completed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1d4ed8' }}>
                {bookings.filter(b => b.status?.toLowerCase() === 'completed').length}
              </div>
            </div>
          </div>

          {/* Work & Pay Calendar */}
          {(timelineAssignments.length > 0 || timelineLeaveDays.length > 0) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <StaffCareTimeline
                assignments={timelineAssignments}
                attendanceRecords={timelineAttendance}
                leaveDays={timelineLeaveDays}
                interactive={false}
              />
            </div>
          )}

          {/* Bookings List */}
          {bookings.length === 0 ? (
            <div style={{
              background: 'white',
              padding: '3rem',
              borderRadius: '0.5rem',
              border: '1px solid #e5e7eb',
              textAlign: 'center'
            }}>
              <Activity size={48} style={{ color: '#9ca3af', marginBottom: '1rem' }} />
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                No assignments yet
              </h3>
              <p style={{ color: '#6b7280' }}>
                You don&apos;t have any patient assignments at the moment.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {bookings.map((booking) => {
                const ServiceIcon = getServiceTypeIcon(booking.service_type);
                const rowId = booking.assignment_id || booking.booking_id;
                const isExpanded = expandedBooking === rowId;

                return (
                  <div
                    key={rowId}
                    style={{
                      background: 'white',
                      borderRadius: '0.5rem',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Card Header */}
                    <div
                      onClick={() => toggleExpand(rowId)}
                      style={{
                        padding: '1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '0.5rem',
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <ServiceIcon size={24} style={{ color: '#3b82f6' }} />
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 600, color: '#1f2937' }}>
                            {booking.patient_name || booking.patient_full_name || 'Unknown Care Profile'}
                          </span>
                          <StatusBadge status={booking.status} />
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          {booking.service_type} • {booking.service_model?.replace('_', ' ')}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          Started {formatDate(booking.start_date)}
                          {formatTime(booking.service_start_time) && ` at ${formatTime(booking.service_start_time)}`}
                        </div>
                        {booking.scheduled_end_time && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            Ends {formatDate(booking.scheduled_end_time)}
                          </div>
                        )}
                      </div>

                      {isExpanded ? <ChevronUp size={20} style={{ color: '#6b7280' }} /> : <ChevronDown size={20} style={{ color: '#6b7280' }} />}
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div style={{ padding: '1rem' }}>
                        {/* Patient Info */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <User size={16} /> Care Profile Information
                          </h4>
                          <div style={{
                            background: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Full Name</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.patient_name || booking.patient_full_name || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Age</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.patient_age || '—'} years</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Gender</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.patient_gender || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Medical Condition</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.medical_condition || '—'}</div>
                            </div>
                          </div>
                        </div>

                        {/* Client Info */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Phone size={16} /> Client Contact
                          </h4>
                          <div style={{
                            background: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Client Name</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.client_name || booking.payer_name || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Mobile</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.client_mobile || booking.payer_mobile || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Emergency Contact</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>
                                {booking.emergency_contact_name ? `${booking.emergency_contact_name} (${booking.emergency_contact_number})` : '—'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Location */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <MapPin size={16} /> Service Location
                          </h4>
                          <div style={{
                            background: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.375rem'
                          }}>
                            <div style={{ fontWeight: 500, color: '#1f2937' }}>
                              {booking.location_address || booking.patient_address || '—'}
                            </div>
                            {booking.gps_coordinates && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                                GPS: {booking.gps_coordinates.x}, {booking.gps_coordinates.y}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Financial Details */}
                        <div style={{ marginBottom: '1.5rem' }}>
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <DollarSign size={16} /> Assignment Details
                          </h4>
                          <div style={{
                            background: '#f9fafb',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                            gap: '0.75rem'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Start Time</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{formatTime(booking.service_start_time) || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Daily Rate</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>LKR{booking.daily_rate || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Duration</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>{booking.duration_days || '—'} days</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>OT Rate</div>
                              <div style={{ fontWeight: 500, color: '#1f2937' }}>LKR{booking.ot_rate || '500'}/hr</div>
                            </div>
                          </div>
                        </div>

                        {/* Service Remarks */}
                        {booking.service_remarks && (
                          <div style={{ marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <FileText size={16} /> Special Remarks
                            </h4>
                            <div style={{
                              background: '#fffbeb',
                              padding: '1rem',
                              borderRadius: '0.375rem',
                              border: '1px solid #fde68a'
                            }}>
                              <p style={{ color: '#92400e', fontSize: '0.875rem' }}>{booking.service_remarks}</p>
                            </div>
                          </div>
                        )}

                        {/* Termination Warning */}
                        {booking.termination_status && (
                          <div style={{
                            background: '#fef2f2',
                            padding: '1rem',
                            borderRadius: '0.375rem',
                            border: '1px solid #fecaca',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem'
                          }}>
                            <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
                            <div>
                              <div style={{ fontWeight: 600, color: '#991b1b' }}>
                                Termination {booking.termination_status}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: '#b91c1c' }}>
                                Requested end: {formatDateLong(booking.requested_end_date)}
                              </div>
                              {booking.termination_reason && (
                                <div style={{ fontSize: '0.875rem', color: '#b91c1c', marginTop: '0.25rem' }}>
                                  Reason: {booking.termination_reason}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WorkerBookings;
