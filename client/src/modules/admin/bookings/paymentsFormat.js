// Shared formatting + receipt-state helpers for the booking Payments tab components.
export const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
export const num = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const toDate = (v) => { if (!v) return null; const d = typeof v === 'string' && v.length === 10 ? new Date(`${v}T00:00:00`) : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
export const dd = (v) => { const d = toDate(v); return d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; };
export const METHODS = [['BANK_TRANSFER', 'Bank transfer'], ['CASH_DEPOSIT', 'Cash deposit'], ['CASH', 'Cash'], ['CHEQUE', 'Cheque']];
export const methodName = (key) => (METHODS.find(m => m[0] === key) || [])[1] || null;

// 'none' (no receipt yet) | 'failed' (receipt row but no PDF) | 'ready' (PDF, not sent) | 'sent'
export const receiptState = (rcpt) => (!rcpt ? 'none' : !rcpt.pdf_url ? 'failed' : rcpt.whatsapp_sent ? 'sent' : 'ready');
export const RECEIPT_META = {
  none: { label: 'No receipt', tone: 'mute', action: 'Create receipt', primary: false },
  ready: { label: 'Ready', tone: 'info', action: 'Send', primary: true },
  failed: { label: 'PDF failed', tone: 'bad', action: 'Retry PDF', primary: false },
  sent: { label: 'Sent', tone: 'ok', action: 'Resend', primary: false },
};
export const referenceText = (p) => (p.chequeNumber ? `Cheque ${p.chequeNumber}` : (p.reference && p.reference !== '-' ? p.reference : '—'));
