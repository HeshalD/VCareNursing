import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';
import useDebouncedValue from '../../../hooks/useDebouncedValue';

const PAGE_SIZE = 50;

const STATUS_META = {
  ACTIVE:      { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  PAUSED:      { dot: 'bg-amber-400',   text: 'text-amber-700' },
  TERMINATED:  { dot: 'bg-rose-400',    text: 'text-rose-700' },
  COMPLETED:   { dot: 'bg-slate-400',   text: 'text-slate-500' },
  PENDING:     { dot: 'bg-blue-400',    text: 'text-blue-700' },
};

// Persistent booking list shown alongside BookingDetailPageV2 so an admin can
// switch between bookings without navigating back to the full bookings table.
// Fetches 50 at a time from the backend; search re-queries the backend
// rather than filtering only the bookings already loaded into this list.
const BookingSwitcherSidebar = ({ activeBookingId, onNavigate }) => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 400);

  const fetchPage = async (targetPage, { append = false, searchTerm = debouncedSearch } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await apiClient.getAllBookings({
        page: targetPage,
        limit: PAGE_SIZE,
        ...(searchTerm ? { search: searchTerm } : {}),
      });
      setBookings((prev) => (append ? [...prev, ...(res.data || [])] : (res.data || [])));
      setPagination(res.pagination || null);
      setPage(targetPage);
    } catch {
      // non-fatal
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  };

  // Re-query the backend from page 1 whenever the (debounced) search term changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPage(1, { searchTerm: debouncedSearch }); }, [debouncedSearch]);

  const handleLoadMore = () => fetchPage(page + 1, { append: true });

  const handleSelect = (id) => {
    navigate(`/admin/bookings/${id}/detail`);
    onNavigate?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookings…"
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-gray-400">No bookings found.</p>
        ) : (
          <>
            {bookings.map((b) => {
              const active = String(b.booking_id) === String(activeBookingId);
              const meta = STATUS_META[b.status] || { dot: 'bg-gray-300', text: 'text-gray-500' };
              return (
                <button
                  key={b.booking_id}
                  type="button"
                  onClick={() => handleSelect(b.booking_id)}
                  className={`flex w-full flex-col gap-0.5 border-l-2 px-3 py-2.5 text-left transition-colors ${
                    active ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-[13px] font-semibold ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                      {b.client_name || 'Client'}
                    </p>
                    <span className={`flex items-center gap-1 text-[10px] font-semibold ${meta.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {b.status || '—'}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-gray-400">
                    {b.booking_code || '—'}{b.patient_name ? ` · ${b.patient_name}` : ''}
                  </p>
                </button>
              );
            })}
            {pagination?.has_next && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BookingSwitcherSidebar;
