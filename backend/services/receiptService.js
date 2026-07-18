const db = require('../config/db');
const { generateAndUploadReceipt } = require('../utils/receiptPdf');

// Build the data object the HTML template expects from a payment_receipts row.
function buildTemplateData(receipt) {
    return {
        receipt_code: receipt.receipt_code,
        payment_date: receipt.payment_date,
        payment_method: receipt.payment_method,
        reference_number: receipt.reference_number,
        cheque_number: receipt.cheque_number,
        received_from: receipt.received_from,
        total_amount: receipt.total_amount,
        line_items: receipt.line_items,
        generated_at: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    };
}

// Generate + upload the PDF for an existing receipt row and persist the URL.
// Returns the secure_url. Throws on failure (caller decides how to handle).
async function generateReceiptPdf(receipt) {
    const pdfUrl = await generateAndUploadReceipt(buildTemplateData(receipt));
    await db.query(
        'UPDATE payment_receipts SET pdf_url = $1 WHERE receipt_id = $2',
        [pdfUrl, receipt.receipt_id]
    );
    return pdfUrl;
}

/**
 * Create a payment receipt for a recorded client payment.
 *
 * Inserts the tracking row first (so the receipt is always recorded even if PDF
 * generation fails), then renders + uploads the PDF and stores its URL. The row
 * is created with whatsapp_sent = FALSE; delivery happens later via an explicit
 * admin action (see receiptController.sendReceiptWhatsApp).
 *
 * @returns the receipt row, or null if the row could not be created.
 */
async function createPaymentReceipt({
    client_id,
    source_type,            // CLIENT_PAYMENT | BOOKING_PAYMENT | QUOTE_PAYMENT
    source_id = null,
    total_amount,
    payment_method = null,
    reference_number = null,
    cheque_number = null,
    bank_account_id = null,
    payment_date = null,
    line_items = [],
    generated_by = null,
}) {
    let receipt;
    try {
        // Snapshot the billing name for the "Received From" field, respecting the
        // client's chosen display name (their own name, or their company name).
        const clientRes = await db.query(
            'SELECT full_name, company_name, display_name_source FROM client_profiles WHERE client_profile_id = $1',
            [client_id]
        );
        const clientRow = clientRes.rows[0];
        const received_from = (clientRow?.display_name_source === 'COMPANY_NAME' && clientRow?.company_name)
            || clientRow?.full_name
            || 'Valued Client';

        const insertRes = await db.query(
            `INSERT INTO payment_receipts
               (client_id, source_type, source_id, total_amount, payment_method,
                payment_date, reference_number, cheque_number, bank_account_id,
                received_from, line_items, generated_by)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6, NOW()),$7,$8,$9,$10,$11::jsonb,$12)
             RETURNING *`,
            [
                client_id, source_type, source_id, total_amount, payment_method,
                payment_date, reference_number, cheque_number, bank_account_id,
                received_from, JSON.stringify(line_items), generated_by,
            ]
        );
        receipt = insertRes.rows[0];
    } catch (err) {
        console.error('[Receipt] Failed to create receipt row:', err.message);
        return null;
    }

    // PDF generation/upload is external and slower — failure here is non-fatal;
    // the row exists and the PDF can be regenerated on demand when sending.
    try {
        receipt.pdf_url = await generateReceiptPdf(receipt);
    } catch (err) {
        console.error(`[Receipt] PDF generation failed for ${receipt.receipt_code}:`, err.message);
    }

    return receipt;
}

module.exports = { createPaymentReceipt, generateReceiptPdf };
