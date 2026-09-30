import React, { useEffect, useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import apiClient from '../../../api/api';
import StaffPageShell, { EmptyState } from './StaffPageShell';
import useMyStaffProfile from './useMyStaffProfile';

const PAGE_SIZE = 10;
const formatDate = (v) => (v
  ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');

const Stars = ({ value, size = 'h-4 w-4' }) => (
  <span className="inline-flex">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={`${size} ${i <= Math.round(value) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-200'}`} />
    ))}
  </span>
);

const StaffReviewsPage = () => {
  const { staff, loading: profileLoading, error: profileError } = useMyStaffProfile();
  const staffProfileId = staff?.staff_profile_id;
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!staffProfileId) return;
    (async () => {
      setLoading(true);
      try {
        setData(await apiClient.getReviewsForStaff(staffProfileId, page, PAGE_SIZE));
        setError('');
      } catch (err) {
        console.error('Error loading reviews:', err);
        setError('Could not load your reviews. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [staffProfileId, page]);

  const reviews = data?.reviews || [];
  const avg = Number(data?.staff_info?.average_rating || 0);
  const totalReviews = data?.staff_info?.total_reviews ?? data?.pagination?.total ?? 0;
  const pages = data?.pagination?.pages || 1;
  const dist = Object.fromEntries((data?.rating_distribution || []).map((r) => [Number(r.rating), Number(r.count)]));
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0);

  return (
    <StaffPageShell
      staffProfileId={staffProfileId}
      title="Reviews"
      subtitle="What clients have said about your work."
      loading={(loading && !data) || (profileLoading && !staff)}
      error={error || profileError}
    >
      {Number(totalReviews) === 0 && reviews.length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" description="Client reviews will appear here once they are published." />
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-6">
            <div className="text-center sm:border-r sm:border-slate-100 sm:pr-6">
              <p className="text-5xl font-semibold text-slate-900">{avg ? avg.toFixed(1) : '—'}</p>
              <div className="mt-2 flex justify-center"><Stars value={avg} size="h-5 w-5" /></div>
              <p className="mt-2 text-sm text-slate-500">{totalReviews} {Number(totalReviews) === 1 ? 'review' : 'reviews'}</p>
            </div>
            <div className="space-y-2 self-center">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="w-3">{n}</span>
                  <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-yellow-400" style={{ width: `${distTotal ? ((dist[n] || 0) / distTotal) * 100 : 0}%` }} />
                  </div>
                  <span className="w-6 text-right">{dist[n] || 0}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            {reviews.map((r) => (
              <article key={r.review_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Stars value={r.rating} />
                    <span className="text-sm font-semibold text-slate-800">{r.client_name || 'Client'}</span>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(r.created_at)}</span>
                </div>
                {r.review_text && <p className="mt-3 text-sm text-slate-600 whitespace-pre-line">{r.review_text}</p>}
              </article>
            ))}
          </section>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages || loading}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </StaffPageShell>
  );
};

export default StaffReviewsPage;
