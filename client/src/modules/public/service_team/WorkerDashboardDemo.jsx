import React, { useState, useEffect } from 'react';
import {
  User,
  Calendar,
  MapPin,
  DollarSign,
  CheckCircle,
  CheckCircle2,
  Clock,
  Star,
  Briefcase,
  ArrowUpRight,
  FilePen,
  Stethoscope,
  Heart,
  Baby,
  Activity,
  AlertTriangle,
  CalendarOff,
  FileText,
  Eye,
  Upload,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' });
};

const WorkerDashboardDemo = () => {
  const { user, loading: authLoading } = useAuth();
  const [staffData, setStaffData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [activeBookings, setActiveBookings] = useState([]);
  const [completedCount, setCompletedCount] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (authLoading) return;

      const userId = user?.user_id || user?.id;
      const staffId = user?.staff_id;

      if (!userId) {
        setDataLoading(false);
        return;
      }

      try {
        // Step 1: staff data (needed to get staff_profile_id for subsequent calls)
        let staffProfile = null;
        try {
          const staffRes = staffId
            ? await apiClient.getStaffByID(staffId)
            : await apiClient.getStaffByUserID(userId);
          staffProfile = staffRes.data;
          setStaffData(staffProfile);
        } catch (e) {
          console.error('Dashboard - Staff fetch failed:', e);
        }

        // Step 2: parallel secondary fetches
        const [walletRes, bookingRes] = await Promise.allSettled([
          apiClient.getMyWallet(),
          staffProfile?.staff_profile_id
            ? apiClient.getStaffBookings(staffProfile.staff_profile_id)
            : Promise.resolve(null),
        ]);

        if (walletRes.status === 'fulfilled' && walletRes.value) {
          setWalletData(walletRes.value.data?.data || walletRes.value.data);
        } else if (walletRes.status === 'rejected') {
          console.error('Dashboard - Wallet fetch failed:', walletRes.reason);
        }

        if (bookingRes.status === 'fulfilled' && bookingRes.value) {
          const allBookings = bookingRes.value.data || [];
          setActiveBookings(allBookings.filter(b => b.status?.toLowerCase() === 'active'));
          setCompletedCount(allBookings.filter(b => b.status?.toLowerCase() === 'completed').length);
        } else if (bookingRes.status === 'rejected') {
          console.error('Dashboard - Bookings fetch failed:', bookingRes.reason);
        }
      } catch (error) {
        console.error('Dashboard - General error:', error);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading]);

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center text-slate-600 font-medium">Loading your dashboard...</div>
      </div>
    );
  }

  const displayName = staffData?.full_name || user?.name || 'Staff Member';
  const profilePicture = staffData?.profile_picture_url;
  const status = staffData?.verification_status || 'PENDING';
  const currentStatus = staffData?.current_status || 'AVAILABLE';
  const isAvailable = currentStatus === 'AVAILABLE';

  const toggleAvailability = async () => {
    if (!staffData?.staff_profile_id || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      if (isAvailable) {
        await apiClient.updateStaffToUnavailable(staffData.staff_profile_id);
      } else {
        await apiClient.updateStaffStatus(staffData.staff_profile_id, 'AVAILABLE');
      }
      const response = user?.staff_id 
        ? await apiClient.getStaffByID(user.staff_id) 
        : await apiClient.getStaffByUserID(user.id);
      setStaffData(response.data);
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const role = Array.isArray(user?.role) ? user.role[0] : user?.role;
  const displayRole = role === 'NURSE' ? 'Certified Nurse' :
    role === 'CAREGIVER' ? 'Professional Caregiver' :
      role === 'COORDINATOR' ? 'Care Coordinator' :
        'Healthcare Professional';

  const avgRating = staffData?.average_rating;
  const totalReviews = staffData?.total_reviews ?? 0;

  const stats = [
    {
      title: 'Wallet Balance',
      value: `LKR ${Number(walletData?.balance || 0).toLocaleString()}`,
      description: 'Available for advances and adjustments',
      icon: DollarSign,
    },
    {
      title: 'Completed Shifts',
      value: completedCount !== null ? String(completedCount) : '—',
      description: completedCount === 1 ? '1 assignment completed' : `${completedCount ?? 0} assignments completed`,
      icon: Clock,
    },
    {
      title: 'Rating',
      value: avgRating ? Number(avgRating).toFixed(1) : '—',
      description: totalReviews > 0 ? `Based on ${totalReviews} review${totalReviews !== 1 ? 's' : ''}` : 'No reviews yet',
      icon: Star,
    },
  ];

  return (
    <div className="h-screen bg-slate-50 font-sans flex flex-col md:flex-row text-slate-900 overflow-hidden">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} title="Dashboard" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 md:py-8 space-y-6">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-6 rounded-2xl shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">Provider Portal</p>
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  Hello, {displayName}
                </h1>
                <p className="text-sm text-slate-500 mt-2 max-w-2xl">
                  Welcome back to your professional portal. Track your status, balance, and current assignments.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                {profilePicture ? (
                  <img src={profilePicture} alt="Profile" className="h-10 w-10 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white">
                    <User className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">{displayName}</p>
                  <p className="text-xs text-slate-500">{displayRole}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <div>
                  <p className="font-semibold text-slate-900">
                    {isAvailable ? 'Available for shifts' : 'Currently unavailable'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {isAvailable
                      ? 'You are visible to coordinators for assignment.'
                      : 'You will not receive new shift assignments.'}
                  </p>
                </div>
              </div>

              <button
                onClick={toggleAvailability}
                disabled={updatingStatus}
                className={`inline-flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors ${isAvailable
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                } ${updatingStatus ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className={`h-2.5 w-2.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isAvailable ? 'Mark unavailable' : 'Mark available'}
              </button>
            </div>
          </header>

          <div className={`rounded-2xl border px-6 py-5 shadow-sm ${status === 'VERIFIED'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
            : status === 'REJECTED'
              ? 'border-rose-100 bg-rose-50 text-rose-800'
              : 'border-amber-100 bg-amber-50 text-amber-800'
          }`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70">
                  <CheckCircle className={`h-6 w-6 ${status === 'VERIFIED'
                    ? 'text-emerald-600'
                    : status === 'REJECTED'
                      ? 'text-rose-600'
                      : 'text-amber-600'
                  }`} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-inherit">
                    {status === 'VERIFIED'
                      ? 'Profile verified successfully'
                      : status === 'REJECTED'
                        ? 'Application rejected'
                        : 'Application under review'}
                  </h2>
                  <p className="text-sm text-inherit/80">
                    {status === 'VERIFIED'
                      ? 'Your profile has been verified and you can start accepting shifts.'
                      : status === 'REJECTED'
                        ? 'Your application was not approved at this time.'
                        : 'Your profile is currently under review by our team.'}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center self-start rounded-full border border-current/20 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em]">
                {status === 'VERIFIED' ? 'Verified' : status === 'REJECTED' ? 'Rejected' : 'Pending Verification'}
              </span>
            </div>
          </div>

          {/* Required compliance documents */}
          {staffData?.doc_upload_token && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-violet-500" />
                  <p className="font-semibold text-slate-900 text-sm">Required Documents</p>
                </div>
                {staffData.grama_niladhari_url && staffData.police_report_url ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3 h-3" /> Complete
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    Action required
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Upload your Grama Niladhari Report and Police Report to complete your registration.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Grama Niladhari Report', url: staffData.grama_niladhari_url },
                  { label: 'Police Report', url: staffData.police_report_url },
                ].map(({ label, url }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${url ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
                  >
                    <FileText className={`h-4 w-4 flex-shrink-0 ${url ? 'text-emerald-600' : 'text-amber-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{label}</p>
                      <p className={`text-xs font-medium ${url ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {url ? 'Uploaded' : 'Pending'}
                      </p>
                    </div>
                    {url && (
                      <button onClick={() => window.open(url, '_blank')} className="text-emerald-600 hover:text-emerald-700" title="View">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {(!staffData.grama_niladhari_url || !staffData.police_report_url) && (
                <Link
                  to={`/staff/documents/${staffData.doc_upload_token}`}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-violet-600 text-white text-sm font-medium py-2.5 hover:bg-violet-500 transition-all shadow-md shadow-violet-600/20"
                >
                  <Upload className="h-4 w-4" />
                  Upload Documents
                </Link>
              )}
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat) => (
              <StatCard key={stat.title} {...stat} />
            ))}
          </section>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">Need to update your details?</p>
              <p className="text-xs text-slate-500 mt-0.5">Submit a request to change your profile or bank account information.</p>
            </div>
            <Link
              to="/services/change-request"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <FilePen className="h-4 w-4" />
              Request a Change
            </Link>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">Planning some time off?</p>
              <p className="text-xs text-slate-500 mt-0.5">Request leave for a date range and track the status of your requests.</p>
            </div>
            <Link
              to="/services/leave-request"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <CalendarOff className="h-4 w-4" />
              Request Leave
            </Link>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Active Shifts</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {activeBookings.length > 0
                    ? `You have ${activeBookings.length} active assignment${activeBookings.length !== 1 ? 's' : ''}.`
                    : 'Your current work assignments.'}
                </p>
              </div>
              <Link to="/services/bookings" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="p-6 space-y-4">
              {activeBookings.length > 0 ? (
                activeBookings.map((booking) => (
                  <ActiveBookingCard key={booking.assignment_id || booking.booking_id} booking={booking} />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 mb-4">
                    <Briefcase className="w-7 h-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">No active shifts</p>
                  <p className="text-xs mt-1 text-slate-400 text-center max-w-xs">
                    Your current assignments will appear here once you are assigned to a booking.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

// Helper Components
const StatCard = ({ title, value, description, icon: Icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between mb-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
    <p className="mt-2 text-sm text-slate-500">{description}</p>
  </div>
);

const SERVICE_TYPE_CONFIG = {
  NURSE:       { label: 'Nurse',        Icon: Stethoscope, bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100'   },
  HOME_NURSING:{ label: 'Home Nursing', Icon: Heart,       bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-100'   },
  NANNY:       { label: 'Nanny',        Icon: Baby,        bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100' },
  CAREGIVER:   { label: 'Caregiver',    Icon: Heart,       bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-100'   },
};

const ActiveBookingCard = ({ booking }) => {
  const isPendingTermination = booking.status === 'PENDING_TERMINATION';
  const serviceType = booking.service_type?.toUpperCase();
  const svcConfig = SERVICE_TYPE_CONFIG[serviceType] || {
    label: booking.service_type || 'Service',
    Icon: Activity,
    bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200',
  };
  const { Icon: SvcIcon } = svcConfig;

  const patientName = booking.patient_name || 'Patient';
  const clientName  = booking.client_name  || '—';
  const location    = booking.location_address || booking.patient_address || null;
  const dailyRate   = booking.daily_rate ? `LKR ${Number(booking.daily_rate).toLocaleString()}/day` : null;
  const dateRange   = [
    booking.service_start_date ? formatDate(booking.service_start_date) : null,
    booking.service_end_date   ? formatDate(booking.service_end_date)   : null,
  ].filter(Boolean).join(' → ') || '—';

  return (
    <div className={`rounded-2xl border bg-white p-5 transition-all hover:shadow-md ${
      isPendingTermination ? 'border-amber-200' : 'border-slate-200 hover:border-slate-300'
    }`}>
      {isPendingTermination && (
        <div className="flex items-center gap-2 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs font-medium text-amber-800">Termination pending — this assignment may be ending soon.</p>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white font-semibold text-base">
          {patientName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-base font-semibold text-slate-900 leading-tight">{patientName}</h4>
              <p className="text-xs text-slate-500 mt-0.5">Client: {clientName}</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${svcConfig.bg} ${svcConfig.text} ${svcConfig.border}`}>
              <SvcIcon className="h-3 w-3" />
              {svcConfig.label}
            </span>
          </div>

          {booking.medical_condition && (
            <p className="mt-2 text-xs text-slate-500 italic line-clamp-1">{booking.medical_condition}</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-600 truncate">{dateRange}</span>
        </div>
        {location && (
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600 truncate">{location}</span>
          </div>
        )}
        {dailyRate && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700">{dailyRate}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerDashboardDemo;