import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Filter, Search, UserCheck, UserX, Home, User, Clock, MapPin, Phone, Mail, AlertCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const getStatusColor = (status) => {
  switch (status) {
    case 'AVAILABLE': return 'bg-green-100 text-green-800 border-green-200';
    case 'ASSIGNED': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'UNAVAILABLE': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'AVAILABLE': return <UserCheck className="w-4 h-4" />;
    case 'ASSIGNED': return <Clock className="w-4 h-4" />;
    case 'UNAVAILABLE': return <UserX className="w-4 h-4" />;
    default: return <AlertCircle className="w-4 h-4" />;
  }
};

const BookingStaffRosterPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [request, setRequest] = useState(location.state?.request || null);
  const [quote, setQuote] = useState(location.state?.quote || null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [liveInFilter, setLiveInFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const [staffRes, bookingRes] = await Promise.all([
        apiClient.getAllStaff(),
        booking ? Promise.resolve(null) : apiClient.getBookingById(bookingId)
      ]);

      setStaff(staffRes.data || []);
      if (bookingRes?.data) {
        setBooking(bookingRes.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load staff roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [bookingId]);

  const filteredStaff = useMemo(() => {
    return staff.filter((member) => {
      const matchesSearch = !searchTerm || [member.full_name, member.designation, member.home_address, member.location, member.email, member.mobile_number]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || member.current_status === statusFilter;
      const matchesGender = genderFilter === 'all' || member.gender === genderFilter;
      const matchesLiveIn = liveInFilter === 'all' || (liveInFilter === 'yes' ? member.willing_to_live_in === true : member.willing_to_live_in === false);
      const roles = Array.isArray(member.role) ? member.role : String(member.role || '').replace(/[{}"]/g, '').split(',').filter(Boolean);
      const matchesRole = roleFilter === 'all' || roles.includes(roleFilter);

      return matchesSearch && matchesStatus && matchesGender && matchesLiveIn && matchesRole;
    });
  }, [staff, searchTerm, statusFilter, genderFilter, liveInFilter, roleFilter]);

  const selectStaff = (member) => {
    navigate(`/admin/bookings/${bookingId}/staff-assignment`, {
      state: {
        booking,
        request,
        quote,
        selectedStaff: member
      }
    });
  };

  return (
    <AdminLayout
      title="Staff Roster"
      subtitle="Filter and choose the staff member to assign to this booking."
      actions={
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      }
    >
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {booking && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Booking" value={booking.booking_id || bookingId} />
            <Info label="Client" value={booking.client_name || request?.payer_name || 'N/A'} />
            <Info label="Patient" value={booking.patient_name || request?.patient_name || 'N/A'} />
            <Info label="Status" value={booking.booking_status || booking.status || 'PENDING'} />
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff by name, role, address, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2"><Filter className="w-4 h-4 text-slate-500" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              <option value="all">All Status</option>
              <option value="AVAILABLE">Available</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg">
            <option value="all">All Roles</option>
            <option value="NURSE">Nurse</option>
            <option value="CARETAKER">Caregiver</option>
            <option value="NANNY">Nanny</option>
          </select>
          <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg">
            <option value="all">All Genders</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
          <select value={liveInFilter} onChange={(e) => setLiveInFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg">
            <option value="all">Live-in Preference</option>
            <option value="yes">Willing to Live-in</option>
            <option value="no">Not Willing</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading staff roster...</div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          No staff match the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredStaff.map((member) => (
            <div key={member.staff_profile_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                    {member.profile_picture_url ? <img src={member.profile_picture_url} alt={member.full_name} className="h-12 w-12 rounded-full object-cover" /> : <User className="h-5 w-5 text-slate-500" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{member.full_name}</h3>
                    <p className="text-sm text-slate-500">{member.designation || 'Staff Member'}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${getStatusColor(member.current_status)}`}>
                        {getStatusIcon(member.current_status)} {member.current_status}
                      </span>
                      {member.willing_to_live_in && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 py-1 text-green-800">
                          <Home className="h-3 w-3" /> Live-in
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => selectStaff(member)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Choose
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2">
                <Info label="Mobile" value={member.mobile_number || 'N/A'} icon={Phone} />
                <Info label="Email" value={member.email || 'N/A'} icon={Mail} />
                <Info label="Gender" value={member.gender || 'N/A'} icon={User} />
                <Info label="Location" value={member.location || member.home_address || 'N/A'} icon={MapPin} />
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

const Info = ({ label, value, icon: Icon }) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
    </div>
    <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
  </div>
);

export default BookingStaffRosterPage;