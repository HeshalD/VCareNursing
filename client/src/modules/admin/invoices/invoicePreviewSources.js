import apiClient from '../../../api/api';

// Preview sources for InvoicePreviewModal. Each resolves to either a Blob
// (endpoints that stream the PDF) or a stored URL (S3-hosted PDFs).

const urlSource = (pdfUrl) => async () => {
  if (!pdfUrl) throw new Error('This invoice has no PDF available yet.');
  return { url: pdfUrl };
};

export const invoicePreview = {
  daily: (inv) => ({
    title: `Service invoice — ${inv.service_date || ''}`.trim(),
    subtitle: [inv.booking_code, inv.client_name].filter(Boolean).join(' · '),
    filename: `Invoice_${inv.booking_code || inv.booking_id?.slice(0, 8)}_${inv.service_date}.pdf`,
    load: async () => ({ blob: await apiClient.downloadDailyInvoicePdf(inv.daily_invoice_id) }),
  }),
  product: (inv) => ({
    title: `Invoice ${inv.invoice_code || ''}`.trim(),
    subtitle: inv.client_name || inv.walk_in_name || inv.category || '',
    filename: `${inv.invoice_code || 'Invoice'}.pdf`,
    load: async () => {
      const res = await apiClient.getProductInvoicePdf(inv.invoice_id);
      const url = res?.pdf_url || res?.data?.pdf_url;
      return urlSource(url)();
    },
  }),
  url: (pdfUrl, { title = 'Invoice', subtitle = '', filename = 'Invoice.pdf' } = {}) => ({
    title, subtitle, filename, load: urlSource(pdfUrl),
  }),
};
