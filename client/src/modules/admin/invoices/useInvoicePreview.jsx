import React, { useCallback, useState } from 'react';
import InvoicePreviewModal from './InvoicePreviewModal';

// Returns [openPreview(source), modalElement] — render modalElement once in the page.
export default function useInvoicePreview() {
  const [preview, setPreview] = useState(null);
  const close = useCallback(() => setPreview(null), []);
  const open = useCallback((p) => setPreview({ ...p, key: Date.now() }), []);
  const modal = preview ? <InvoicePreviewModal key={preview.key} preview={preview} onClose={close} /> : null;
  return [open, modal];
}
