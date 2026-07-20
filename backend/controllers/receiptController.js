const db = require('../config/db');
const { logActivity } = require('../utils/activityLogger');
const { sendPaymentReceipt, sendClientInvoice } = require('../utils/metaWhatsapp');
const { generateReceiptPdf } = require('../services/receiptService');
const { ensureCombinedInvoice } = require('./quoteController');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const methodLabel = {
    BANK_TRANSFER: 'Bank Transfer',
    CASH_DEPOSIT: 'Cash Deposit',
    CASH: 'Cash',
    CHEQUE: 'Cheque',
    WALLET: 'Wallet',
};

const fmtAmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Traces a payment_receipts row back to the SERVICE quote it was paid
// against (if any), so its combined Invoice (see quoteController.
// ensureCombinedInvoice) can be sent alongside this receipt. Only
// QUOTE_PAYMENT (paid against a SERVICE quote directly) and PRODUCT_INVOICE
// (paid against a PRODUCT quote that may be linked back to a SERVICE quote)
// resolve to anything — other receipt sources (bookings, reg fee, etc.)
// have no combined-invoice concept and simply return null.
async function resolveServiceQuoteId(receipt) {
    if (receipt.source_type === 'QUOTE_PAYMENT') {
        const r = await db.query('SELECT quote_id FROM payment_tracking WHERE payment_id = $1', [receipt.source_id]);
        return r.rows[0]?.quote_id || null;
    }
    if (receipt.source_type === 'PRODUCT_INVOICE') {
        const inv = await db.query('SELECT quote_id FROM invoices WHERE invoice_id = $1', [receipt.source_id]);
        const productQuoteId = inv.rows[0]?.quote_id;
        if (!productQuoteId) return null;
        const q = await db.query('SELECT linked_quote_id FROM quotations WHERE quote_id = $1', [productQuoteId]);
        return q.rows[0]?.linked_quote_id || null;
    }
    return null;
}

function extractActorRole(role) {
    const raw = Array.isArray(role) ? role[0] : role;
    return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

// =========================================================
// GET /api/payment-receipts
// Paginated list of all client payment receipts, ordered by client
// (then newest first). Supports ?page, ?limit, ?search (client name or
// receipt code).
// =========================================================
const getAllReceipts = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search || '').trim();

        const filterParams = [];
        let where = '';
        if (search) {
            filterParams.push(`%${search}%`);
            where = `WHERE cp.full_name ILIKE $1 OR r.receipt_code ILIKE $1`;
        }

        const countRes = await db.query(
            `SELECT COUNT(*) AS total
             FROM payment_receipts r
             JOIN client_profiles cp ON cp.client_profile_id = r.client_id
             ${where}`,
            filterParams
        );
        const total = parseInt(countRes.rows[0].total, 10);

        const dataRes = await db.query(
            `SELECT r.receipt_id, r.receipt_code, r.client_id, cp.full_name AS client_name,
                    u.mobile_number, r.source_type, r.total_amount, r.payment_method,
                    r.payment_date, r.reference_number, r.line_items, r.pdf_url,
                    r.whatsapp_sent, r.whatsapp_sent_at, r.send_error, r.created_at
             FROM payment_receipts r
             JOIN client_profiles cp ON cp.client_profile_id = r.client_id
             LEFT JOIN users u ON u.user_id = cp.user_id
             ${where}
             ORDER BY cp.full_name ASC, r.created_at DESC
             LIMIT $${filterParams.length + 1} OFFSET $${filterParams.length + 2}`,
            [...filterParams, limit, offset]
        );

        return res.status(200).json({
            status: 'success',
            receipts: dataRes.rows,
            pagination: { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (err) {
        console.error('getAllReceipts error:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

// =========================================================
// GET /api/payment-receipts/client/:client_id
// List all receipts for a client (newest first).
// =========================================================
const getClientReceipts = async (req, res) => {
    try {
        const { client_id } = req.params;
        if (!uuidRegex.test(client_id)) {
            return res.status(400).json({ status: 'error', message: 'Invalid client_id format' });
        }

        const result = await db.query(
            `SELECT receipt_id, receipt_code, source_type, source_id, total_amount,
                    payment_method, payment_date, reference_number, cheque_number,
                    received_from, line_items, pdf_url, whatsapp_sent, whatsapp_sent_at,
                    send_error, created_at
             FROM payment_receipts
             WHERE client_id = $1
             ORDER BY created_at DESC`,
            [client_id]
        );

        return res.status(200).json({ status: 'success', receipts: result.rows });
    } catch (err) {
        console.error('getClientReceipts error:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

// =========================================================
// GET /api/payment-receipts/booking/:booking_id
// Receipts that relate to a booking, each mapped to the booking_payment_tracking
// row (booking_payment_id) it corresponds to so the UI can render a receipt
// against each payment line.
// =========================================================
const getBookingReceipts = async (req, res) => {
    try {
        const { booking_id } = req.params;
        if (!uuidRegex.test(booking_id)) {
            return res.status(400).json({ status: 'error', message: 'Invalid booking_id format' });
        }

        const result = await db.query(
            `SELECT r.receipt_id, r.receipt_code, r.total_amount, r.payment_method,
                    r.payment_date, r.pdf_url, r.whatsapp_sent, r.whatsapp_sent_at,
                    r.send_error, r.created_at, bpt.booking_payment_id
             FROM payment_receipts r
             JOIN booking_payment_tracking bpt
               ON (r.source_type = 'BOOKING_PAYMENT' AND bpt.booking_payment_id = r.source_id)
               OR (r.source_type = 'QUOTE_PAYMENT'   AND bpt.payment_tracking_id = r.source_id)
             WHERE bpt.booking_id = $1
             UNION
             SELECT r.receipt_id, r.receipt_code, r.total_amount, r.payment_method,
                    r.payment_date, r.pdf_url, r.whatsapp_sent, r.whatsapp_sent_at,
                    r.send_error, r.created_at, cpa.booking_payment_id
             FROM payment_receipts r
             JOIN client_payment_allocations cpa
               ON r.source_type = 'CLIENT_PAYMENT' AND cpa.record_id = r.source_id
             WHERE cpa.booking_id = $1
             ORDER BY created_at DESC`,
            [booking_id]
        );

        return res.status(200).json({ status: 'success', receipts: result.rows });
    } catch (err) {
        console.error('getBookingReceipts error:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

// =========================================================
// GET /api/payment-receipts/:receipt_id
// =========================================================
const getReceipt = async (req, res) => {
    try {
        const { receipt_id } = req.params;
        if (!uuidRegex.test(receipt_id)) {
            return res.status(400).json({ status: 'error', message: 'Invalid receipt_id format' });
        }

        const result = await db.query(
            `SELECT r.*, cp.full_name AS client_name
             FROM payment_receipts r
             LEFT JOIN client_profiles cp ON cp.client_profile_id = r.client_id
             WHERE r.receipt_id = $1`,
            [receipt_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Receipt not found' });
        }

        return res.status(200).json({ status: 'success', receipt: result.rows[0] });
    } catch (err) {
        console.error('getReceipt error:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

// =========================================================
// POST /api/payment-receipts/:receipt_id/send
// Send (or resend) the receipt PDF to the client over WhatsApp.
// Regenerates the PDF first if it is missing.
// =========================================================
const sendReceiptWhatsApp = async (req, res) => {
    try {
        const { receipt_id } = req.params;
        if (!uuidRegex.test(receipt_id)) {
            return res.status(400).json({ status: 'error', message: 'Invalid receipt_id format' });
        }

        const result = await db.query(
            `SELECT r.*, u.mobile_number
             FROM payment_receipts r
             JOIN client_profiles cp ON cp.client_profile_id = r.client_id
             JOIN users u ON u.user_id = cp.user_id
             WHERE r.receipt_id = $1`,
            [receipt_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'Receipt not found' });
        }

        const receipt = result.rows[0];

        if (!receipt.mobile_number) {
            return res.status(400).json({ status: 'error', message: 'Client has no mobile number on file' });
        }

        // Ensure a PDF exists (regenerate on demand if the earlier attempt failed).
        let pdfUrl = receipt.pdf_url;
        if (!pdfUrl) {
            try {
                pdfUrl = await generateReceiptPdf(receipt);
            } catch (genErr) {
                console.error('sendReceiptWhatsApp: PDF generation failed:', genErr.message);
                return res.status(502).json({ status: 'error', message: 'Failed to generate receipt PDF' });
            }
        }

        try {
            const waRes = await sendPaymentReceipt(
                receipt.mobile_number,
                receipt.received_from || 'Valued Client',
                receipt.receipt_code,
                fmtAmt(receipt.total_amount),
                fmtDate(receipt.payment_date),
                methodLabel[receipt.payment_method] || receipt.payment_method || 'N/A',
                pdfUrl,
                `${receipt.receipt_code}.pdf`
            );

            const messageId = waRes?.messages?.[0]?.id || null;

            await db.query(
                `UPDATE payment_receipts
                 SET whatsapp_sent = TRUE, whatsapp_sent_at = NOW(),
                     whatsapp_message_id = $1, send_error = NULL
                 WHERE receipt_id = $2`,
                [messageId, receipt_id]
            );

            getActorName(req.user?.user_id).then((actorName) => logActivity({
                actorUserId: req.user?.user_id,
                actorName,
                actorRole: extractActorRole(req.user?.role),
                actionType: 'PAYMENT_RECEIPT_SENT',
                entityType: 'payment_receipt',
                entityId: String(receipt_id),
                details: {
                    receipt_code: receipt.receipt_code,
                    client_id: receipt.client_id,
                    amount: parseFloat(receipt.total_amount),
                    message_id: messageId,
                },
            })).catch((e) => console.error('[Receipt] Activity log error:', e.message));

            // Best-effort: send the combined Invoice alongside this receipt if
            // this payment was made against a SERVICE quote (or a PRODUCT quote
            // linked to one). Never blocks or fails the receipt response — the
            // WhatsApp template ('vcare_client_invoice') may not be Meta-approved
            // yet, in which case this just logs and the receipt send still succeeds.
            let invoiceSent = false;
            try {
                const serviceQuoteId = await resolveServiceQuoteId(receipt);
                if (serviceQuoteId) {
                    const invoice = await ensureCombinedInvoice(serviceQuoteId);
                    if (invoice?.invoice_pdf_url && invoice.payer_mobile) {
                        await sendClientInvoice(
                            invoice.payer_mobile,
                            invoice.payer_name || receipt.received_from || 'Valued Client',
                            invoice.invoice_code,
                            fmtAmt(invoice.total_amount),
                            invoice.invoice_pdf_url
                        );
                        invoiceSent = true;
                    }
                }
            } catch (invErr) {
                console.error('[Invoice] Send alongside receipt failed (non-fatal):', invErr.response?.data ? JSON.stringify(invErr.response.data) : invErr.message);
            }

            return res.status(200).json({
                status: 'success',
                message: 'Receipt sent via WhatsApp',
                data: { receipt_id, pdf_url: pdfUrl, whatsapp_message_id: messageId, invoice_sent: invoiceSent },
            });
        } catch (sendErr) {
            const errMsg = sendErr.response?.data ? JSON.stringify(sendErr.response.data) : sendErr.message;
            await db.query(
                'UPDATE payment_receipts SET send_error = $1 WHERE receipt_id = $2',
                [errMsg, receipt_id]
            );
            console.error('sendReceiptWhatsApp: WhatsApp send failed:', errMsg);
            return res.status(502).json({ status: 'error', message: 'Failed to send receipt via WhatsApp' });
        }
    } catch (err) {
        console.error('sendReceiptWhatsApp error:', err);
        return res.status(500).json({ status: 'error', message: err.message || 'Server error' });
    }
};

module.exports = { getAllReceipts, getClientReceipts, getBookingReceipts, getReceipt, sendReceiptWhatsApp };
