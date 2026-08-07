import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import apiClient from '../../../api/api';

const STATUS_META = {
  NEW_LEAD:        { dot: 'bg-purple-400',  text: 'text-purple-700' },
  PENDING:         { dot: 'bg-amber-400',   text: 'text-amber-700' },
  CONTACTED:       { dot: 'bg-blue-400',    text: 'text-blue-700' },
  CONFIRMED:       { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  ASSIGNED:        { dot: 'bg-indigo-400',  text: 'text-indigo-700' },
  COMPLETED:       { dot: 'bg-slate-400',   text: 'text-slate-500' },
  CANCELLED:       { dot: 'bg-red-400',     text: 'text-red-700' },
  BOOKING_CREATED: { dot: 'bg-indigo-500',  text: 'text-indigo-700' },
};

// Persistent service-request list shown alongside ServiceRequestSummaryPage so
// an admin can switch between requests without navigating back to the table.
// The list endpoint has no server-side pagination/search, so this fetches the
// full set once (same as service_requests.jsx) and filters on the client.
const ServiceRequestSwitcherSidebar = ({ activeRequestId, onNavigate }) => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await apiClient.getAllServiceRequests();
        if (!cancelled) setRequests(res.data || []);
      } catch {
        if (!cancelled) setRequests([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(r =>
      [r.payer_name, r.patient_name, r.payer_mobile, r.service_type, r.service_request_code]
        .some(v => v?.toLowerCase?.().includes(q))
    );
  }, [requests, search]);

  const handleSelect = (id) => {
    navigate(`/admin/service-requests/${id}/summary`);
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
            placeholder="Search requests…"
            className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-2 text-[13px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-gray-400">No requests found.</p>
        ) : (
          filtered.map((r) => {
            const active = String(r.request_id) === String(activeRequestId);
            const meta = STATUS_META[r.status] || { dot: 'bg-gray-300', text: 'text-gray-500' };
            return (
              <button
                key={r.request_id}
                type="button"
                onClick={() => handleSelect(r.request_id)}
                className={`flex w-full flex-col gap-0.5 border-l-2 px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-blue-600 bg-blue-50' : 'border-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-[13px] font-semibold ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                    {r.payer_name || 'Client'}
                  </p>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold ${meta.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {(r.status || '—').replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="truncate text-[11px] text-gray-400">
                  {r.service_request_code || '—'}{r.patient_name ? ` · ${r.patient_name}` : ''}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ServiceRequestSwitcherSidebar;
