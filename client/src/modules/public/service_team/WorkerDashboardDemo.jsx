import React, { useState, useEffect } from 'react';
import {
  User,
  Calendar,
  MapPin,
  DollarSign,
  Bell,
  CheckCircle,
  Clock,
  Star,
  TrendingUp,
  Home,
  BadgeCheck,
  Briefcase,
  ArrowUpRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const WorkerDashboardDemo = () => {
  const { user, loading: authLoading } = useAuth();
  const [staffData, setStaffData] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth to finish
      if (authLoading) return;

      const userId = user?.user_id || user?.id;
      const staffId = user?.staff_id;
      
      if (!userId) {
        setDataLoading(false);
        return;
      }

      try {
        // Fetch staff data first
        try {
          const staffResponse = staffId 
            ? await apiClient.getStaffByID(staffId) 
            : await apiClient.getStaffByUserID(userId);
          setStaffData(staffResponse.data);
        } catch (staffErr) {
          console.error('Dashboard - Staff fetch failed:', staffErr);
        }

        // Fetch wallet data separately
        try {
          const walletResponse = await apiClient.getMyWallet();
          setWalletData(walletResponse.data?.data || walletResponse.data);
        } catch (walletErr) {
          console.error('Dashboard - Wallet fetch failed:', walletErr);
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

  const stats = [
    {
      title: 'Wallet Balance',
      value: `LKR ${Number(walletData?.balance || 0).toLocaleString()}`,
      description: 'Available for advances and adjustments',
      icon: DollarSign,
    },
    {
      title: 'Completed Shifts',
      value: '12',
      description: '+2 upcoming this week',
      icon: Clock,
    },
    {
      title: 'Rating',
      value: '4.9',
      description: 'Excellent service record',
      icon: Star,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex text-slate-900 overflow-hidden">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} />

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

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((stat) => (
              <StatCard key={stat.title} {...stat} />
            ))}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Assigned Shifts</h3>
                <p className="text-sm text-slate-500 mt-1">A clean snapshot of current work assignments.</p>
              </div>
              <Link to="/services/bookings" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="p-6">
              <JobCard
                title="Elderly Care - Night Shift"
                location="Nugegoda, Western Province"
                date="Today, 8:00 PM - 6:00 AM"
                price="LKR 4,500"
                tags={['Nursing', 'Urgent']}
              />
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
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <TrendingUp className="w-3 h-3" />
        +12%
      </span>
    </div>
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</p>
    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
    <p className="mt-2 text-sm text-slate-500">{description}</p>
  </div>
);

const JobCard = ({ title, location, date, price, tags }) => (
  <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-all hover:border-slate-300 hover:bg-white">
    <div className="flex items-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white font-semibold text-lg">
      {title.charAt(0)}
    </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-lg font-semibold text-slate-900">{title}</h4>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-500">
          <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {location}</span>
          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {date}</span>
        </div>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <div className="text-lg font-semibold text-slate-900">{price}</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <span key={i} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
            {tag}
          </span>
        ))}
      </div>
    </div>
  </div>
);

export default WorkerDashboardDemo;