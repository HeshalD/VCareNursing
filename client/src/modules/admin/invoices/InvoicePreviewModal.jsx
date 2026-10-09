import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Download, ExternalLink, AlertCircle, Eye } from 'lucide-react';

// In-page preview of an invoice PDF — the same document the client receives
// (WhatsApp / client portal). Sources are built in invoicePreviewSources.js.

export function PreviewButton({ onClick, disabled, className, label }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title="Preview invoice" className={className}>
      <Eye className="h-3.5 w-3.5" />{label && <span>{label}</span>}
    </button>
  );
}

export default function InvoicePreviewModal({ preview, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', src: null, isBlob: false });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;
    preview.load()
      .then(({ blob, url }) => {
        if (cancelled) return;
        if (blob) {
          objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          setState({ loading: false, error: '', src: objectUrl, isBlob: true });
        } else {
          setState({ loading: false, error: '', src: url, isBlob: false });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err.message || 'Could not load the invoice.', src: null, isBlob: false });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [preview]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const btnCls = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Client invoice preview</p>
            <h3 className="truncate text-sm font-semibold text-slate-900">{preview.title}</h3>
            {preview.subtitle && <p className="truncate text-xs text-slate-500">{preview.subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state.src && (
              <>
                <a href={state.src} target="_blank" rel="noreferrer" className={btnCls}>
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
                <a
                  href={state.src}
                  download={preview.filename}
                  target={state.isBlob ? undefined : '_blank'}
                  rel="noreferrer"
                  className={btnCls}
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </>
            )}
            <button type="button" onClick={onClose} title="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-slate-100">
          {state.loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" /> Generating preview…
            </div>
          )}
          {state.error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
              </div>
            </div>
          )}
          {state.src && <iframe title={preview.title} src={state.src} className="h-full w-full border-0" />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
