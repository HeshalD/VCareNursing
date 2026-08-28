import React, { useState, useEffect } from 'react';
import { Star, Eye, EyeOff, Search, X, BookOpen, ChevronLeft, ChevronRight, Plus, Phone, Check, Loader2, User, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { formatMobileNumber } from '../../../utils/phoneFormat';

const StarDisplay = ({ rating }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(n => (
      <Star
        key={n}
        className={`w-3.5 h-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
      />
    ))}
  </div>
);

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const LIMIT = 10;

const inputCls = 'w-full pl-8 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-colors';
const primaryBtnCls = 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors';
const iconBtnCls = 'inline-flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

const StatusDot = ({ visible }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${visible ? 'text-emerald-700' : 'text-slate-500'}`}>
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${visible ? 'bg-emerald-500' : 'bg-slate-400'}`} />
    {visible ? 'Active' : 'Hidden'}
  </span>
);

// ─── Add Review Modal ─────────────────────────────────────────────────────────
// Lets an admin log a review on a client's behalf — e.g. after calling the
// client and getting verbal feedback over the phone. A 4-step picker: search
// client → pick booking (most recent first) → pick the staff who worked it → rate.

const STEP_CLIENT = 'client';
const STEP_BOOKING = 'booking';
const STEP_STAFF = 'staff';
const STEP_DETAILS = 'details';

const StepCrumb = ({ label, value, onChange, active }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={!onChange}
    className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
      active ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
    } ${!onChange ? 'cursor-default' : ''}`}
  >
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    <p className="font-medium text-slate-800 truncate max-w-[9rem]">{value}</p>
  </button>
);

const AddReviewModal = ({ onClose, onCreated }) => {
  const [step, setStep] = useState(STEP_CLIENT);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingFilter, setBookingFilter] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const [staffList, setStaffList] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Debounced client search
  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); setClientsLoading(false); return; }
    setClientsLoading(true);
    const t = setTimeout(() => {
      apiClient.getAllClients({ search: clientSearch.trim(), limit: 20 })
        .then(res => setClientResults(res?.data || []))
        .catch(() => setClientResults([]))
        .finally(() => setClientsLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  const chooseClient = (client) => {
    setSelectedClient(client);
    setSelectedBooking(null);
    setSelectedStaff(null);
    setBookingFilter('');
    setBookings([]);
    setBookingsLoading(true);
    setStep(STEP_BOOKING);
    apiClient.getClientBookingsForAdmin(client.client_profile_id)
      .then(res => setBookings(res?.data || []))
      .catch(() => setBookings([]))
      .finally(() => setBookingsLoading(false));
  };

  const chooseBooking = (booking) => {
    setSelectedBooking(booking);
    setSelectedStaff(null);
    setStaffList([]);
    setStaffLoading(true);
    setStep(STEP_STAFF);
    apiClient.getBookingStaffForReview(booking.booking_id)
      .then(res => setStaffList(res?.data || []))
      .catch(() => setStaffList([]))
      .finally(() => setStaffLoading(false));
  };

  const chooseStaff = (staff) => {
    setSelectedStaff(staff);
    setStep(STEP_DETAILS);
  };

  const goToClientStep = () => setStep(STEP_CLIENT);
  const goToBookingStep = () => selectedClient && setStep(STEP_BOOKING);
  const goToStaffStep = () => selectedBooking && setStep(STEP_STAFF);

  const filteredBookings = bookingFilter.trim()
    ? bookings.filter(b =>
        `${b.service_type || ''} ${b.service_model || ''} ${b.status || ''}`.toLowerCase().includes(bookingFilter.trim().toLowerCase())
      )
    : bookings;

  const handleSubmit = async () => {
    if (!selectedClient || !selectedBooking || !selectedStaff || rating === 0 || !reviewText.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiClient.adminCreateReview({
        client_id: selectedClient.client_profile_id,
        booking_id: selectedBooking.booking_id,
        staff_profile_id: selectedStaff.staff_profile_id,
        rating,
        review_text: reviewText.trim(),
      });
      onCreated(res.review);
    } catch (err) {
      setError(err.message || 'Failed to create review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-900">Add Review on Behalf of Client</p>
          </div>
          <button onClick={onClose} className={iconBtnCls}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Breadcrumbs for steps already completed */}
        {(selectedClient || selectedBooking || selectedStaff) && (
          <div className="flex items-center gap-2 px-6 pt-4 flex-wrap">
            {selectedClient && (
              <StepCrumb
                label="Client"
                value={selectedClient.full_name}
                active={step === STEP_CLIENT}
                onChange={goToClientStep}
              />
            )}
            {selectedBooking && (
              <StepCrumb
                label="Booking"
                value={`${selectedBooking.service_type || 'Booking'} · ${fmt(selectedBooking.start_date)}`}
                active={step === STEP_BOOKING}
                onChange={goToBookingStep}
              />
            )}
            {selectedStaff && (
              <StepCrumb
                label="Staff"
                value={selectedStaff.full_name}
                active={step === STEP_STAFF || step === STEP_DETAILS}
                onChange={goToStaffStep}
              />
            )}
          </div>
        )}

        <div className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: search client */}
          {step === STEP_CLIENT && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Search Client</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Name, mobile, or client code…"
                  className={inputCls}
                />
              </div>
              <div className="mt-2 border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                {clientsLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-slate-400 gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                  </div>
                ) : !clientSearch.trim() ? (
                  <p className="text-xs text-slate-400 text-center py-6">Type to search for a client…</p>
                ) : clientResults.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No clients found.</p>
                ) : (
                  clientResults.map(c => (
                    <button
                      key={c.client_profile_id}
                      type="button"
                      onClick={() => chooseClient(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{c.full_name}</p>
                        <p className="text-xs text-slate-500 truncate">{formatMobileNumber(c.mobile_number) || c.email || '—'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: pick booking */}
          {step === STEP_BOOKING && selectedClient && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Booking · most recent first
              </label>
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={bookingFilter}
                  onChange={e => setBookingFilter(e.target.value)}
                  placeholder="Filter by service or status…"
                  className={inputCls}
                />
              </div>
              <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                {bookingsLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-slate-400 gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading bookings…
                  </div>
                ) : filteredBookings.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No bookings found for this client.</p>
                ) : (
                  filteredBookings.map(b => (
                    <button
                      key={b.booking_id}
                      type="button"
                      onClick={() => chooseBooking(b)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{b.service_type || 'Booking'}</p>
                        <p className="text-xs text-slate-500 truncate">{fmt(b.start_date)} · {b.status}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 3: pick staff */}
          {step === STEP_STAFF && selectedBooking && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Staff who worked this booking
              </label>
              <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
                {staffLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-slate-400 gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading staff…
                  </div>
                ) : staffList.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No staff found for this booking.</p>
                ) : (
                  staffList.map(s => (
                    <button
                      key={s.staff_profile_id}
                      type="button"
                      onClick={() => chooseStaff(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors flex items-center gap-2.5"
                    >
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{s.full_name}</p>
                        <p className="text-xs text-slate-500 truncate">{s.designation || 'Staff'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 4: rating + review */}
          {step === STEP_DETAILS && selectedStaff && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(n)} className="p-0.5">
                      <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Review</label>
                <textarea
                  rows={4}
                  value={reviewText}
                  onChange={e => setReviewText(e.target.value)}
                  placeholder="What the client said over the phone…"
                  className={`${inputCls} resize-y`}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 justify-center inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={rating === 0 || !reviewText.trim() || submitting}
                  className={`${primaryBtnCls} flex-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {submitting ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </>
          )}

          {step !== STEP_DETAILS && (
            <button onClick={onClose} className="justify-center inline-flex items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── All Reviews Tab ──────────────────────────────────────────────────────────

const AllReviewsTab = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ page: 1, vis: '', search: '' });
  const [toggling, setToggling] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = { page: filters.page, limit: LIMIT };
        if (filters.vis !== '') params.is_visible = filters.vis;
        if (filters.search.trim()) params.search = filters.search.trim();
        const res = await apiClient.getAdminAllReviews(params);
        setReviews(res.reviews || []);
        setPagination(res.pagination || { page: 1, total: 0, pages: 0 });
      } catch (err) {
        console.error('Failed to fetch reviews', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters, refreshKey]);

  const handleReviewCreated = () => {
    setShowAddModal(false);
    setFilters(f => ({ ...f, page: 1 }));
    setRefreshKey(k => k + 1);
  };

  const setVis = (v) => setFilters(f => ({ ...f, vis: v, page: 1 }));
  const goPage = (p) => setFilters(f => ({ ...f, page: p }));

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters(f => ({ ...f, search: searchInput, page: 1 }));
  };

  const clearSearch = () => {
    setSearchInput('');
    setFilters(f => ({ ...f, search: '', page: 1 }));
  };

  const handleToggle = async (review) => {
    setToggling(review.review_id);
    try {
      await apiClient.toggleReviewVisibility(review.review_id);
      setReviews(prev =>
        prev.map(r =>
          r.review_id === review.review_id ? { ...r, is_visible: !r.is_visible } : r
        )
      );
    } catch (err) {
      console.error('Failed to toggle review visibility', err);
    } finally {
      setToggling(null);
    }
  };

  const visOpts = [
    { label: 'All Reviews', value: '' },
    { label: 'Active', value: 'true' },
    { label: 'Hidden', value: 'false' },
  ];

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex gap-0.5 bg-slate-100 rounded-lg p-1 w-fit">
          {visOpts.map(opt => (
            <button
              key={opt.value}
              onClick={() => setVis(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                filters.vis === opt.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 sm:ml-auto">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by staff, client, or review text…"
              className={`${inputCls} w-64`}
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button type="submit" className={primaryBtnCls}>Search</button>
        </form>

        <button onClick={() => setShowAddModal(true)} className={primaryBtnCls}>
          <Plus className="w-3.5 h-3.5" /> Add Review
        </button>
      </div>

      {showAddModal && (
        <AddReviewModal onClose={() => setShowAddModal(false)} onCreated={handleReviewCreated} />
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-slate-400">Loading reviews…</div>
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <Star className="w-8 h-8 text-slate-200" />
            <p className="text-sm text-slate-400">No reviews found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Booking</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rating</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Review</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.map(r => (
                  <tr
                    key={r.review_id}
                    className={`hover:bg-slate-50 transition-colors ${!r.is_visible ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {r.client_name || '—'}
                      {r.submitted_by_admin && (
                        <span
                          title={`Added by ${r.submitted_by_name || 'an admin'} on behalf of the client`}
                          className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5 align-middle"
                        >
                          <Phone className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {r.staff_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.booking_id ? (
                        <Link
                          to={`/admin/bookings/${r.booking_id}/detail`}
                          className="inline-flex items-center gap-1.5 text-blue-600 hover:underline whitespace-nowrap"
                        >
                          <BookOpen className="w-3 h-3 flex-shrink-0" />
                          <span>{r.booking_service_type || 'Booking'}</span>
                          {r.booking_start_date && (
                            <span className="text-slate-400 text-xs">· {fmt(r.booking_start_date)}</span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">No booking</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <StarDisplay rating={r.rating} />
                        <span className="text-xs text-slate-400">{r.rating}/5</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-slate-600 line-clamp-2 leading-relaxed">{r.review_text}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {fmt(r.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusDot visible={r.is_visible} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggle(r)}
                        disabled={toggling === r.review_id}
                        title={r.is_visible ? 'Deactivate review' : 'Activate review'}
                        className={iconBtnCls}
                      >
                        {r.is_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && reviews.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
            Showing {((pagination.page - 1) * LIMIT) + 1}–{Math.min(pagination.page * LIMIT, pagination.total)} of {pagination.total} reviews
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-end gap-1 mt-3">
          <button
            onClick={() => goPage(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="px-2 text-xs text-slate-500">{pagination.page} / {pagination.pages}</span>
          <button
            onClick={() => goPage(pagination.page + 1)}
            disabled={pagination.page >= pagination.pages || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
};

// ─── Page Shell ───────────────────────────────────────────────────────────────

const AdminReviewsPage = () => (
  <AdminLayout
    title="Staff Reviews"
    subtitle="Manage client reviews submitted by clients"
  >
    <AllReviewsTab />
  </AdminLayout>
);

export default AdminReviewsPage;
