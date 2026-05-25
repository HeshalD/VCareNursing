import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Users, CalendarDays, CircleDollarSign, Clock3, AlertCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const money = (value) =>
  `LKR ${parseFloat(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const BookingStaffAssignmentPage = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [assignment, setAssignment] = useState({
    staff_profile_id: location.state?.selectedStaff?.staff_profile_id || '',
    service_start_date: '',
    daily_rate: '',
    ot_rate: '',
    notes: ''
  });

  const selectedStaff = useMemo(() =>
    formData?.available_staff?.find((staff) => staff.staff_profile_id === assignment.staff_profile_id)
      || location.state?.selectedStaff
      || null,
    [formData, assignment.staff_profile_id, location.state]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiClient.getBookingAssignmentFormData(bookingId);
      setFormData(response.data || null);
      setAssignment((current) => ({
        ...current,
        service_start_date: current.service_start_date || response.data?.booking?.start_date || '',
        daily_rate: current.daily_rate || response.data?.booking?.quote_daily_rate || ''
      }));
    } catch (err) {
      setError(err.message || 'Failed to load assignment form');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) {
      fetchData();
    }
  }, [bookingId]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await apiClient.assignStaffToBooking(bookingId, {
        staff_profile_id: assignment.staff_profile_id,
        service_start_date: assignment.service_start_date,
        daily_rate: assignment.daily_rate ? parseFloat(assignment.daily_rate) : null,
        ot_rate: assignment.ot_rate ? parseFloat(assignment.ot_rate) : null,
        notes: assignment.notes || null
      });

      setSuccess('Staff assigned successfully.');
      setTimeout(() => {
        navigate('/admin/service-requests');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to assign staff');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout
      title="Staff Assignment"
      subtitle="Complete the final assignment form for the selected booking."
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
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Loading assignment form...</div>
      ) : !formData ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">Assignment data not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Booking Summary</h3>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Booking" value={formData.booking.booking_id} />
                <Stat label="Client" value={formData.booking.client_name} />
                <Stat label="Patient" value={formData.booking.patient_name} />
                <Stat label="Service" value={formData.booking.service_type} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Paid" value={money(formData.booking.amount_paid)} />
                <Stat label="Quotated" value={money(formData.booking.amount_quotated)} />
                <Stat label="Quote Rate" value={money(formData.booking.quote_daily_rate || 0)} />
                <Stat label="Booking Status" value={formData.booking.booking_status} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Assignment Form</h3>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Staff Member</label>
                <select
                  required
                  value={assignment.staff_profile_id}
                  onChange={(e) => setAssignment({ ...assignment, staff_profile_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">Select staff member</option>
                  {formData.available_staff.map((staff) => (
                    <option key={staff.staff_profile_id} value={staff.staff_profile_id}>
                      {staff.staff_name} - {staff.specialization}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Service Start Date</label>
                  <input
                    required
                    type="date"
                    value={assignment.service_start_date}
                    onChange={(e) => setAssignment({ ...assignment, service_start_date: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Daily Rate</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={assignment.daily_rate}
                    onChange={(e) => setAssignment({ ...assignment, daily_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">OT Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={assignment.ot_rate}
                    onChange={(e) => setAssignment({ ...assignment, ot_rate: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
                  <input
                    value={assignment.notes}
                    onChange={(e) => setAssignment({ ...assignment, notes: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Users className="h-4 w-4" />
                {submitting ? 'Assigning...' : 'Assign Staff Member'}
              </button>
            </form>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Selected Staff</h3>
              {selectedStaff ? (
                <div className="space-y-2 text-sm">
                  <Detail label="Name" value={selectedStaff.staff_name || selectedStaff.full_name} />
                  <Detail label="Role" value={selectedStaff.specialization || selectedStaff.designation} />
                  <Detail label="Status" value={selectedStaff.current_status || 'AVAILABLE'} />
                  <Detail label="Earnings" value={money(selectedStaff.current_earnings || 0)} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">No staff selected yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Assignment Notes</h3>
              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-blue-600" />
                  <span>Start date should align with the booking period.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CircleDollarSign className="mt-0.5 h-4 w-4 text-blue-600" />
                  <span>Daily rate defaults from the quotation but can be adjusted before assignment.</span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-4 w-4 text-blue-600" />
                  <span>Assignment submission will update the booking status to ACTIVE.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-semibold text-slate-900">{value || 'N/A'}</p>
  </div>
);

const Detail = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
    <span className="text-slate-500">{label}</span>
    <span className="font-medium text-slate-900">{value || '—'}</span>
  </div>
);

export default BookingStaffAssignmentPage;