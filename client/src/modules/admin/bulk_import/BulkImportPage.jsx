import React, { useState, useRef, useMemo } from 'react';
import { Upload, Download, Loader2, CheckCircle2, XCircle, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const SHEET_LABELS = {
  staff: 'Staff',
  clients: 'Clients',
  patients: 'Care Profiles',
  bookings: 'Active Bookings',
};

const ResultTable = ({ label, rows, showOnlyErrors }) => {
  const [collapsed, setCollapsed] = useState(false);
  if (!rows || rows.length === 0) return null;
  const errorCount = rows.filter((r) => r.status === 'error').length;
  const visibleRows = showOnlyErrors ? rows.filter((r) => r.status === 'error') : rows;

  return (
    <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          <h3 className="font-semibold text-gray-800">{label}</h3>
          <span className="text-xs text-gray-500">
            {rows.length} row{rows.length === 1 ? '' : 's'}
            {errorCount > 0 && <span className="text-red-600 font-medium"> · {errorCount} error{errorCount === 1 ? '' : 's'}</span>}
          </span>
        </div>
        {errorCount === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> All clear</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><XCircle className="w-3.5 h-3.5" /> Needs attention</span>
        )}
      </button>

      {!collapsed && (
        visibleRows.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-500">No rows with issues in this sheet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white border-t border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Row</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.row_number} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{r.row_number}</td>
                    <td className="px-3 py-2">
                      {r.status === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="w-3.5 h-3.5" /> Error</span>
                      ) : r.status === 'created' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Created</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> OK</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.status === 'error' ? (r.message || (r.errors || []).join('; ')) : (r.status === 'created' ? 'Ready to import' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
};

const ProgressBar = ({ label, processed, total, color = 'bg-blue-500' }) => {
  const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span>{total > 0 ? `${processed} / ${total} rows` : 'Starting…'}</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

const BulkImportPage = () => {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewResults, setPreviewResults] = useState(null);
  const [commitResults, setCommitResults] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  // Row counts as actually reported by the server while the background
  // preview/commit job runs (see apiClient.pollImportJob).
  const [previewProgress, setPreviewProgress] = useState({ processed: 0, total: 0 });
  const [commitProgress, setCommitProgress] = useState({ processed: 0, total: 0 });

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vcare_bulk_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err.message || 'Failed to download template');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setPreviewResults(null);
    setCommitResults(null);
    setError('');
  };

  const handlePreview = async () => {
    if (!selectedFile) return;
    try {
      setPreviewing(true);
      setPreviewProgress({ processed: 0, total: 0 });
      setError('');
      setCommitResults(null);
      setShowOnlyErrors(false);
      const res = await apiClient.previewBulkImport(selectedFile, (processed, total) =>
        setPreviewProgress({ processed, total })
      );
      setPreviewResults(res.data);
    } catch (err) {
      setError(err.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile) return;
    try {
      setCommitting(true);
      setCommitProgress({ processed: 0, total: 0 });
      setError('');
      const res = await apiClient.commitBulkImport(selectedFile, (processed, total) =>
        setCommitProgress({ processed, total })
      );
      setCommitResults(res.data);
      setPreviewResults(null);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setCommitting(false);
    }
  };

  const hasBlockingErrors = previewResults
    ? Object.values(previewResults.summary).some((s) => s.errors > 0)
    : false;

  const previewErrorCount = useMemo(() => {
    if (!previewResults) return 0;
    return Object.values(previewResults.results).reduce(
      (sum, rows) => sum + (rows || []).filter((r) => r.status === 'error').length,
      0
    );
  }, [previewResults]);

  const commitErrorCount = useMemo(() => {
    if (!commitResults) return 0;
    return Object.values(commitResults.results).reduce(
      (sum, rows) => sum + (rows || []).filter((r) => r.status === 'error').length,
      0
    );
  }, [commitResults]);

  return (
    <AdminLayout title="Bulk Import" subtitle="Migrate staff, clients, care profiles, and bookings from a spreadsheet.">
      <div className="max-w-4xl">
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-1">Step 1 — Download the template</h3>
          <p className="text-sm text-gray-600 mb-3">
            One workbook with four sheets: Staff, Clients, Care Profiles, and Active Bookings. Fill in whatever
            you know now — most fields can be left blank and completed later.
          </p>
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" /> Download Template
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
          <h3 className="font-semibold text-gray-800 mb-1">Step 2 — Upload the filled spreadsheet</h3>
          <p className="text-sm text-gray-600 mb-3">
            We'll check every row for problems first — nothing is saved until you confirm.
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="text-sm"
            />
            <button
              onClick={handlePreview}
              disabled={!selectedFile || previewing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
            >
              {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Preview
            </button>
          </div>
          {previewing && (
            <ProgressBar label="Checking rows…" processed={previewProgress.processed} total={previewProgress.total} />
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {previewResults && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="font-semibold text-gray-800">Step 3 — Review the preview</h3>
              {previewErrorCount > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOnlyErrors}
                    onChange={(e) => setShowOnlyErrors(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Show only rows with issues ({previewErrorCount})
                </label>
              )}
            </div>
            {Object.keys(SHEET_LABELS).map((key) => (
              <ResultTable
                key={key}
                label={SHEET_LABELS[key]}
                rows={previewResults.results[key]}
                showOnlyErrors={showOnlyErrors}
              />
            ))}
            <button
              onClick={handleCommit}
              disabled={hasBlockingErrors || committing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
            >
              {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Confirm Import
            </button>
            {hasBlockingErrors && (
              <p className="text-xs text-red-600 mt-2">Fix the errors above and re-upload before importing.</p>
            )}
            {committing && (
              <ProgressBar
                label="Importing…"
                processed={commitProgress.processed}
                total={commitProgress.total}
                color="bg-emerald-500"
              />
            )}
          </div>
        )}

        {commitResults && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h3 className="font-semibold text-gray-800">Step 4 — Import complete</h3>
              {commitErrorCount > 0 && (
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOnlyErrors}
                    onChange={(e) => setShowOnlyErrors(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Show only rows with issues ({commitErrorCount})
                </label>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Batch ID: <span className="font-mono">{commitResults.import_batch_id}</span>
            </p>
            {Object.keys(SHEET_LABELS).map((key) => (
              <ResultTable
                key={key}
                label={SHEET_LABELS[key]}
                rows={commitResults.results[key]}
                showOnlyErrors={showOnlyErrors}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default BulkImportPage;
