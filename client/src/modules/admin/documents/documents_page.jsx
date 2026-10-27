import React, { useEffect, useRef, useState } from 'react';
import { Loader2, FileText, ExternalLink, Upload, History, RotateCcw, ChevronDown, Users, Send } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const AUDIENCE_LABEL = { STAFF: 'Staff', CLIENT: 'Clients' };

const DocumentCard = ({ doc, canEdit, busy, onReplace, onRestore }) => {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const submit = async () => {
    const ok = await onReplace(doc, file, note);
    if (ok) {
      setFile(null);
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900">{doc.title}</h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 inline-flex items-center gap-1">
                <Users className="w-3 h-3" /> {AUDIENCE_LABEL[doc.audience] || doc.audience}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">v{doc.version}</span>
            </div>
            {doc.description && <p className="text-sm text-slate-500 mt-0.5">{doc.description}</p>}
            {doc.sent_via && (
              <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
                <Send className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" /> <span>{doc.sent_via}</span>
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              Last updated {fmt(doc.updated_at)}{doc.updated_by_name ? ` by ${doc.updated_by_name}` : ''}
            </p>
          </div>
        </div>
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> View current file
        </a>
      </div>

      {canEdit && (
        <div className="px-5 pb-5">
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Replace with a newer version</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-white file:border file:border-slate-300 file:text-slate-700 hover:file:bg-slate-100"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="What changed? (optional, e.g. Updated clause 7)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">PDF only, up to 15 MB. It is used for the very next send.</p>
              <button
                type="button"
                disabled={!file || busy}
                onClick={submit}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Publish
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-2"><History className="w-4 h-4" /> Version history ({doc.versions.length})</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
        </button>
        {showHistory && (
          <ul className="divide-y divide-slate-100">
            {doc.versions.map((v) => {
              const current = v.version === doc.version;
              return (
                <li key={v.version} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">
                      v{v.version} {current && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Current</span>}
                    </p>
                    <p className="text-xs text-slate-500">{fmt(v.uploaded_at)}{v.uploaded_by_name ? ` · ${v.uploaded_by_name}` : ''}{v.note ? ` · ${v.note}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={v.file_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline text-xs font-medium inline-flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </a>
                    {canEdit && !current && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRestore(doc, v.version)}
                        className="text-xs font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Make current
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const DocumentsPage = () => {
  const { adminToken, hasPermission } = useAdminAuth();
  const canEdit = hasPermission ? hasPermission('DOCUMENT_REPLACE') : false;
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyKey, setBusyKey] = useState(null);

  const load = () =>
    apiClient.getManagedDocuments()
      .then((res) => setDocs(res?.data || []))
      .catch((err) => setError(err?.message || 'Failed to load documents.'));

  useEffect(() => {
    if (adminToken) load();
  }, [adminToken]);

  const run = async (doc, action) => {
    setBusyKey(doc.document_key);
    setError('');
    setSuccess('');
    try {
      const res = await action();
      setSuccess(res?.message || 'Saved.');
      await load();
      return true;
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const handleReplace = (doc, file, note) => {
    if (!window.confirm(`Replace "${doc.title}"? Everyone who is sent this document from now on will receive the new file.`)) return false;
    return run(doc, () => apiClient.replaceManagedDocument(doc.document_key, file, note));
  };

  const handleRestore = (doc, version) => {
    if (!window.confirm(`Make version ${version} of "${doc.title}" the current file again?`)) return false;
    return run(doc, () => apiClient.restoreManagedDocument(doc.document_key, version));
  };

  const groups = (docs || []).reduce((acc, d) => {
    const label = AUDIENCE_LABEL[d.audience] || d.audience;
    let g = acc.find((x) => x.label === label);
    if (!g) acc.push((g = { label, items: [] }));
    g.items.push(d);
    return acc;
  }, []);

  return (
    <AdminLayout
      title="Documents"
      subtitle="The official documents the system sends to staff and clients. Replace a file once and every future send uses it."
    >
      <div className="max-w-3xl space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

        {!docs ? (
          <div className="p-10 flex justify-center">{error ? null : <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}</div>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Sent to {g.label}</h2>
              {g.items.map((d) => (
                <DocumentCard
                  key={d.document_key}
                  doc={d}
                  canEdit={canEdit}
                  busy={busyKey === d.document_key}
                  onReplace={handleReplace}
                  onRestore={handleRestore}
                />
              ))}
            </section>
          ))
        )}
        {docs && !canEdit && <p className="text-xs text-slate-400">You don't have permission to replace documents.</p>}
      </div>
    </AdminLayout>
  );
};

export default DocumentsPage;
