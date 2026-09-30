import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Eye, Download, Search } from 'lucide-react';
import apiClient from '../../../api/api';

// Shared building blocks for the client-portal document pages
// (quotations, receipts, invoices, statements, care team log).

export const fmtMoney = v =>
  new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', minimumFractionDigits: 2 }).format(Number(v) || 0);

export const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('en-LK', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const BADGE_TONES = {
  green: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  amber: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  red:   { bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  blue:  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  grey:  { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
};

export const Badge = ({ tone = 'grey', children }) => {
  const t = BADGE_TONES[tone] || BADGE_TONES.grey;
  return (
    <span style={{
      display: 'inline-block', background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
};

// Opens (view) or saves (download) a PDF from a client-portal endpoint.
export const usePdfActions = (setError) => {
  const [busy, setBusy] = useState(null);

  const run = async (key, path, filename, mode) => {
    setBusy(`${key}:${mode}`);
    // Open the tab synchronously so the browser doesn't treat it as a popup.
    const tab = mode === 'view' ? window.open('', '_blank') : null;
    try {
      const { blob, url, filename: name } = await apiClient.fetchClientPortalPdf(path, filename);
      const href = blob ? URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })) : url;
      if (mode === 'view') {
        if (tab) tab.location.href = href; else window.open(href, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        if (!blob) a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      if (blob) setTimeout(() => URL.revokeObjectURL(href), 60000);
    } catch (err) {
      if (tab) tab.close();
      setError(err.message || 'Could not load the document');
    } finally {
      setBusy(null);
    }
  };

  return { busy, view: (k, p, f) => run(k, p, f, 'view'), download: (k, p, f) => run(k, p, f, 'download') };
};

export const PdfButtons = ({ id, path, filename, actions, disabled }) => (
  <div style={{ display: 'flex', gap: 6 }}>
    {['view', 'download'].map(mode => {
      const loading = actions.busy === `${id}:${mode}`;
      const Icon = mode === 'view' ? Eye : Download;
      return (
        <button
          key={mode}
          type="button"
          disabled={disabled || !!actions.busy}
          onClick={() => actions[mode](id, path, filename)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: mode === 'view' ? '#fff' : '#1e293b', color: mode === 'view' ? '#1e293b' : '#fff',
            border: '1px solid #1e293b', borderRadius: 6, padding: '5px 10px',
            fontSize: 12, fontWeight: 500, cursor: disabled || actions.busy ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Icon size={12} />}
          {mode === 'view' ? 'View' : 'Download'}
        </button>
      );
    })}
  </div>
);

// Fetches a client-portal list and renders the page frame around `children(rows)`.
const DocPage = ({ title, subtitle, listKey, searchFields = [], headerExtra, error, setError, children }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getClientPortalList(listKey);
      setRows(res.data || []);
    } catch (err) {
      setLoadError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [listKey]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(r => searchFields.some(f => String(r[f] ?? '').toLowerCase().includes(q)))
    : rows;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: "'DM Sans', sans-serif", color: '#1e293b' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        .doc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .doc-table th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #94a3b8; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
        .doc-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
        .doc-table tr:last-child td { border-bottom: none; }
      `}</style>
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '48px 24px 80px' }}>
        <header style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          marginBottom: 24, marginTop: 36, padding: '24px 28px', background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 12,
        }}>
          <div>
            <p style={{ fontSize: 12, color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 500 }}>Account</p>
            <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: '-0.02em', fontFamily: "'DM Serif Display', serif" }}>{title}</h1>
            {subtitle && <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>{subtitle}</p>}
          </div>
          {headerExtra}
        </header>

        {(error || loadError) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#991b1b', marginBottom: 20,
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error || loadError}</span>
            <button onClick={() => { setError(''); setLoadError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 12 }}>Dismiss</button>
          </div>
        )}

        {searchFields.length > 0 && rows.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, background: '#fff', fontFamily: "'DM Sans', sans-serif" }}
            />
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Loader2 size={26} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{q ? 'No matching records' : `No ${title.toLowerCase()} yet`}</p>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>{q ? 'Try a different search.' : 'Anything issued to you will appear here.'}</p>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
            {children(filtered, load)}
          </div>
        )}
      </main>
    </div>
  );
};

export default DocPage;
