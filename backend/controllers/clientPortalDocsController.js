const db = require('../config/db');
const { generateReceiptPdf } = require('../services/receiptService');
const { renderQuotePdfBuffer } = require('./quoteController');
const { ensureInvoicePdf } = require('./invoiceController');
const { ensureDailyInvoicePdf } = require('./clientController');
const { buildStatementPayload } = require('./statementController');
const { generateStatementPDF } = require('../utils/statement');

// Client-portal document endpoints. Every query is scoped to the logged-in
// user's own client profile (resolved from the token, never from a URL param),
// so a client can only ever see or download their own documents.

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveClientId(req, res) {
    const r = await db.query('SELECT client_profile_id FROM client_profiles WHERE user_id = $1', [req.user.user_id]);
    if (!r.rows.length) {
        res.status(404).json({ status: 'error', message: 'Client profile not found.' });
        return null;
    }
    return r.rows[0].client_profile_id;
}

const fail = (res, label, err) => {
    console.error(`${label}:`, err);
    return res.status(500).json({ status: 'error', message: `Failed to ${label}.` });
};

// ── Quotations ───────────────────────────────────────────────────────────────

exports.listQuotations = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;

        const result = await db.query(
            `SELECT q.quote_id, q.estimate_number, q.quote_type, q.status, q.total_amount,
                    q.estimate_date, q.created_at,
                    sr.service_type, sr.patient_name,
                    COALESCE((SELECT SUM(pt.amount_received) FROM payment_tracking pt
                              WHERE pt.quote_id = q.quote_id AND pt.status = 'VERIFIED'), 0)
                    + COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip
                                JOIN invoices i ON i.invoice_id = ip.invoice_id
                                WHERE i.quote_id = q.quote_id), 0) AS amount_paid,
                    COALESCE((SELECT json_agg(json_build_object(
                                'amount', pt.amount_received, 'date', pt.payment_date,
                                'method', pt.payment_method) ORDER BY pt.payment_date)
                              FROM payment_tracking pt
                              WHERE pt.quote_id = q.quote_id AND pt.status = 'VERIFIED'), '[]') AS payments,
                    COALESCE((SELECT STRING_AGG(li.description, ', ' ORDER BY li.sort_order)
                              FROM quote_line_items li WHERE li.quote_id = q.quote_id), '') AS items_summary
             FROM quotations q
             LEFT JOIN service_requests sr ON sr.request_id = q.request_id
             WHERE COALESCE(q.client_id, sr.client_id) = $1
               AND q.status <> 'DRAFT'
             ORDER BY q.created_at DESC`,
            [clientId]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (err) {
        fail(res, 'fetch quotations', err);
    }
};

exports.getQuotationPdf = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const { quote_id } = req.params;
        if (!uuidRegex.test(quote_id)) return res.status(400).json({ message: 'Invalid quotation id.' });

        const owned = await db.query(
            `SELECT 1 FROM quotations q
             LEFT JOIN service_requests sr ON sr.request_id = q.request_id
             WHERE q.quote_id = $1 AND COALESCE(q.client_id, sr.client_id) = $2 AND q.status <> 'DRAFT'`,
            [quote_id, clientId]
        );
        if (!owned.rows.length) return res.status(404).json({ message: 'Quotation not found.' });

        const pdf = await renderQuotePdfBuffer(quote_id);
        if (!pdf) return res.status(404).json({ message: 'Quotation not found.' });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Quotation_${pdf.estimate_number || quote_id}.pdf"`,
            'Content-Length': pdf.buffer.length,
        });
        res.status(200).send(pdf.buffer);
    } catch (err) {
        fail(res, 'generate quotation PDF', err);
    }
};

// ── Receipts ─────────────────────────────────────────────────────────────────

exports.listReceipts = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const result = await db.query(
            `SELECT receipt_id, receipt_code, source_type, total_amount, payment_method,
                    payment_date, reference_number, line_items, created_at
             FROM payment_receipts
             WHERE client_id = $1
             ORDER BY created_at DESC`,
            [clientId]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (err) {
        fail(res, 'fetch receipts', err);
    }
};

exports.getReceiptPdf = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const { receipt_id } = req.params;
        if (!uuidRegex.test(receipt_id)) return res.status(400).json({ message: 'Invalid receipt id.' });

        const r = await db.query('SELECT * FROM payment_receipts WHERE receipt_id = $1 AND client_id = $2', [receipt_id, clientId]);
        if (!r.rows.length) return res.status(404).json({ message: 'Receipt not found.' });
        const receipt = r.rows[0];
        const pdfUrl = receipt.pdf_url || await generateReceiptPdf(receipt);
        res.status(200).json({ status: 'success', pdf_url: pdfUrl, filename: `${receipt.receipt_code || 'Receipt'}.pdf` });
    } catch (err) {
        fail(res, 'generate receipt PDF', err);
    }
};

// ── Invoices (service daily invoices + product/rental invoices + registration fee) ──

exports.listInvoices = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;

        const [daily, product, regFee] = await Promise.all([
            db.query(
                `SELECT bdi.daily_invoice_id AS id, bdi.service_date::text AS invoice_date, bdi.status, bdi.amount,
                        b.booking_code, b.service_type, ss.label AS shift_label, ss.shift_number
                 FROM booking_daily_invoices bdi
                 JOIN bookings b ON b.booking_id = bdi.booking_id
                 LEFT JOIN booking_shift_slots ss ON ss.shift_slot_id = bdi.shift_slot_id
                 WHERE b.client_id = $1 AND bdi.status NOT IN ('PENDING', 'SKIPPED', 'CANCELLED')
                 ORDER BY bdi.service_date DESC`,
                [clientId]
            ),
            db.query(
                `SELECT i.invoice_id AS id, i.invoice_code, i.category, i.status, i.amount, i.created_at,
                        COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.invoice_id), 0) AS amount_paid,
                        CASE WHEN i.rental_agreement_id IS NOT NULL THEN rp.name || ' — Unit ' || ru.unit_code
                             WHEN i.line_item_id IS NOT NULL THEN sli.description
                             ELSE (SELECT STRING_AGG(qli.description, ', ' ORDER BY qli.sort_order)
                                   FROM quote_line_items qli WHERE qli.quote_id = i.quote_id AND qli.is_registration_fee = false)
                        END AS item_summary
                 FROM invoices i
                 LEFT JOIN rental_agreements ra ON i.rental_agreement_id = ra.rental_agreement_id
                 LEFT JOIN products rp ON ra.product_id = rp.product_id
                 LEFT JOIN rental_units ru ON ra.unit_id = ru.unit_id
                 LEFT JOIN quote_line_items sli ON sli.line_item_id = i.line_item_id
                 WHERE i.client_id = $1
                   AND NOT (i.line_item_id IS NOT NULL AND sli.is_registration_fee = true)
                 ORDER BY i.created_at DESC`,
                [clientId]
            ),
            db.query(
                `SELECT invoice_id AS id, invoice_code, amount, status, created_at
                 FROM client_reg_fee_invoices WHERE client_id = $1 ORDER BY created_at DESC`,
                [clientId]
            ),
        ]);

        const data = [
            ...daily.rows.map(r => ({
                kind: 'SERVICE', id: r.id, code: `DINV-${String(r.id).slice(0, 8).toUpperCase()}`,
                date: r.invoice_date, status: r.status, amount: r.amount, amount_paid: null,
                description: [r.service_type, r.shift_label || (r.shift_number ? `Shift ${r.shift_number}` : null), r.booking_code && `Booking ${r.booking_code}`]
                    .filter(Boolean).join(' · ') || 'Care service',
            })),
            ...product.rows.map(r => ({
                kind: 'PRODUCT', id: r.id, code: r.invoice_code, date: r.created_at, status: r.status,
                amount: r.amount, amount_paid: r.amount_paid,
                description: r.item_summary || r.category,
            })),
            ...regFee.rows.map(r => ({
                kind: 'REG_FEE', id: r.id, code: r.invoice_code, date: r.created_at, status: r.status,
                amount: r.amount, amount_paid: null, description: 'Registration fee',
            })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json({ status: 'success', data });
    } catch (err) {
        fail(res, 'fetch invoices', err);
    }
};

exports.getInvoicePdf = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const { kind, id } = req.params;
        if (!uuidRegex.test(id)) return res.status(400).json({ message: 'Invalid invoice id.' });

        let pdfUrl = null;
        let filename = 'Invoice.pdf';

        if (kind === 'SERVICE') {
            const own = await db.query(
                `SELECT 1 FROM booking_daily_invoices bdi JOIN bookings b ON b.booking_id = bdi.booking_id
                 WHERE bdi.daily_invoice_id = $1 AND b.client_id = $2`, [id, clientId]);
            if (!own.rows.length) return res.status(404).json({ message: 'Invoice not found.' });
            const inv = await ensureDailyInvoicePdf(id);
            pdfUrl = inv?.pdf_url;
            filename = `DINV-${String(id).slice(0, 8).toUpperCase()}.pdf`;
        } else if (kind === 'PRODUCT') {
            const own = await db.query('SELECT invoice_code FROM invoices WHERE invoice_id = $1 AND client_id = $2', [id, clientId]);
            if (!own.rows.length) return res.status(404).json({ message: 'Invoice not found.' });
            const inv = await ensureInvoicePdf(id);
            pdfUrl = inv?.pdf_url;
            filename = `${own.rows[0].invoice_code || 'Invoice'}.pdf`;
        } else if (kind === 'REG_FEE') {
            const own = await db.query('SELECT invoice_code, pdf_url FROM client_reg_fee_invoices WHERE invoice_id = $1 AND client_id = $2', [id, clientId]);
            if (!own.rows.length) return res.status(404).json({ message: 'Invoice not found.' });
            pdfUrl = own.rows[0].pdf_url;
            filename = `${own.rows[0].invoice_code || 'Invoice'}.pdf`;
        } else {
            return res.status(400).json({ message: 'Unknown invoice type.' });
        }

        if (!pdfUrl) return res.status(404).json({ message: 'This invoice has no PDF available yet.' });
        res.status(200).json({ status: 'success', pdf_url: pdfUrl, filename });
    } catch (err) {
        fail(res, 'generate invoice PDF', err);
    }
};

// ── Statements ───────────────────────────────────────────────────────────────

exports.listStatements = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const result = await db.query(
            `SELECT statement_id, period_start::text, period_end::text, opening_balance,
                    total_invoiced, total_paid, balance_due, created_at
             FROM saved_statements WHERE client_id = $1 ORDER BY created_at DESC`,
            [clientId]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (err) {
        fail(res, 'fetch statements', err);
    }
};

// Streams a statement PDF. With ?statement_id it regenerates that saved
// statement's exact period; otherwise it uses ?start_date/?end_date (defaults:
// everything up to now). Nothing is saved — the client is only reading.
exports.downloadStatement = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;

        let start = req.query.start_date || '1970-01-01T00:00:00Z';
        let end = req.query.end_date || new Date().toISOString();

        if (req.query.statement_id) {
            if (!uuidRegex.test(req.query.statement_id)) return res.status(400).json({ message: 'Invalid statement id.' });
            const s = await db.query(
                `SELECT period_start::text, period_end::text FROM saved_statements WHERE statement_id = $1 AND client_id = $2`,
                [req.query.statement_id, clientId]
            );
            if (!s.rows.length) return res.status(404).json({ message: 'Statement not found.' });
            start = s.rows[0].period_start;
            // include the whole final day
            end = `${s.rows[0].period_end}T23:59:59.999Z`;
        }

        if (isNaN(new Date(start)) || isNaN(new Date(end))) return res.status(400).json({ message: 'Invalid date range.' });

        const { clientName, pdfData } = await buildStatementPayload(clientId, start, end);
        const pdfBuffer = await generateStatementPDF(pdfData);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="Statement_${String(clientName).replace(/\s+/g, '_')}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.status(200).send(pdfBuffer);
    } catch (err) {
        fail(res, 'generate statement PDF', err);
    }
};

// ── Care team log ────────────────────────────────────────────────────────────

exports.listStaffLog = async (req, res) => {
    try {
        const clientId = await resolveClientId(req, res);
        if (!clientId) return;
        const result = await db.query(
            `SELECT bsa.assignment_id, bsa.service_start_date::text, bsa.service_end_date::text,
                    bsa.status AS assignment_status,
                    sp.full_name AS staff_name, sp.designation, sp.profile_picture_url,
                    b.booking_id, b.booking_code, b.service_type, b.service_model, b.status AS booking_status,
                    b.start_date::text AS booking_start_date,
                    pp.full_name AS patient_name
             FROM booking_staff_assignments bsa
             JOIN bookings b ON b.booking_id = bsa.booking_id
             JOIN staff_profiles sp ON sp.staff_profile_id = bsa.staff_profile_id
             LEFT JOIN patient_profiles pp ON pp.patient_id = b.patient_id
             WHERE b.client_id = $1
             ORDER BY bsa.service_start_date DESC, bsa.assigned_on DESC`,
            [clientId]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (err) {
        fail(res, 'fetch care team log', err);
    }
};
