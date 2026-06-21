import React, { useState, useEffect } from 'react';
import { Star, Eye, EyeOff, Search, X, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

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

// ─── All Reviews Tab ──────────────────────────────────────────────────────────

const AllReviewsTab = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ page: 1, vis: '', search: '' });
  const [toggling, setToggling] = useState(null);

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
  }, [filters]);

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
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search by staff, client, or review text…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
            {searchInput && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
          >
            Search
          </button>
        </form>

        <div className="flex gap-1.5">
          {visOpts.map(opt => (
            <button
              key={opt.value}
              onClick={() => setVis(opt.value)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                filters.vis === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading reviews…</div>
        ) : reviews.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No reviews found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Client</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Staff</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Booking</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Rating</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Review</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reviews.map(r => (
                  <tr
                    key={r.review_id}
                    className={`hover:bg-slate-50 transition-colors ${!r.is_visible ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {r.client_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
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
                        <span className="text-xs text-slate-500">{r.rating}/5</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-slate-600 line-clamp-2 leading-relaxed">{r.review_text}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {fmt(r.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.is_visible ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                          <Eye className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 ring-1 ring-slate-200">
                          <EyeOff className="w-3 h-3" /> Hidden
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggle(r)}
                        disabled={toggling === r.review_id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          r.is_visible
                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 ring-1 ring-rose-200'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 ring-1 ring-emerald-200'
                        }`}
                      >
                        {r.is_visible ? (
                          <><EyeOff className="w-3 h-3" /> Deactivate</>
                        ) : (
                          <><Eye className="w-3 h-3" /> Activate</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {((pagination.page - 1) * LIMIT) + 1}–{Math.min(pagination.page * LIMIT, pagination.total)} of {pagination.total} reviews
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goPage(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-slate-600">
              {pagination.page} / {pagination.pages}
            </span>
            <button
              onClick={() => goPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
