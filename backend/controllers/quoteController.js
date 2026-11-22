const db = require('../config/db');
const { warnIfRegistrationIncomplete } = require('../services/registrationFeeGuard');
const html_to_pdf = require('html-pdf-node');
const estimateTemplate = require('../templates/estimateTemplate');
const { withTermsUrl } = require('../services/managedDocuments');
const { billingName } = require('../utils/clientName');
const { sendClientQuotation, sendClientProductQuotation, sendClientInvoice } = require('../utils/metaWhatsapp');
const { uploadBufferToS3 } = require('../config/s3Config');
const { logActivity } = require('../utils/activityLogger');
const { creditSalespersonForRegistration } = require('../services/clientSalespersonService');
const { getOrCreateClientProfileForQuotation, sendClientWelcomeCredentials, markRegFeeInvoicedFromQuote } = require('../services/clientBootstrapService');
const { createRentalAgreementCore, RentalAgreementError } = require('./rentalController');
const { generateAndUploadRegFeeInvoice } = require('../utils/regFeeInvoicePdf');
const { createVendorBillCore, applyVendorBillPayment } = require('./vendorController');
const { ensureInvoiceCharge, linkProductQuoteToBooking, payBookingProductInvoicesFromWallet } = require('../services/invoiceCharges');
const { unbilledLinesSql, saleStatusOf } = require('../services/productBilling');

// Estimate numbers are EST-NNNN. The 4-digit space is small, so check for a
// collision (retrying) and widen to 5 digits if it is nearly exhausted.
async function generateUniqueEstimateNumber() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const digits = attempt < 20 ? 4 : 5;
    const min = Math.pow(10, digits - 1);
    const candidate = `EST-${Math.floor(min + Math.random() * 9 * min)}`;
    const { rows } = await db.query('SELECT 1 FROM quotations WHERE estimate_number = $1 LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
  }
  throw new Error('Could not generate a unique estimate number');
}

function extractActorRole(role) {
  const raw = Array.isArray(role) ? role[0] : role;
  return typeof raw === 'string' ? raw.replace(/\{|\}/g, '').split(',')[0].trim() : String(raw);
}

async function getActorName(userId) {
  const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
  return result.rows[0]?.full_name || 'Admin';
}

async function safeLog(params) {
  try {
    await logActivity(params);
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

exports.createQuotation = async (req, res) => {
    const { request_id, daily_rate, qty_days, per_shift_rate, qty_shifts, transport_fee, registration_fee } = req.body;

    try {
        // 1. Setup constants based on Sample Estimate
        const regFee = (registration_fee !== undefined && registration_fee !== '' && registration_fee !== null) ? parseFloat(registration_fee) : 0;
        const transport = transport_fee || 1000.00; // Based on sample

        // Shift-based bookings are priced per shift instead of per day —
        // per_shift_rate/qty_shifts take precedence when supplied.
        const isShiftBased = per_shift_rate !== undefined && per_shift_rate !== null && per_shift_rate !== '';
        const days = qty_days || 7;
        const shifts = qty_shifts || 7;

        // 2. Calculate Totals
        const item2Amount = isShiftBased ? parseFloat(per_shift_rate) * shifts : (daily_rate || 0) * days;
        const subTotal = regFee + item2Amount + transport;

        // Generate a unique estimate number (e.g., EST-1001)
        const estimateNumber = await generateUniqueEstimateNumber();

        // 3. Insert into Database
        const query = `
            INSERT INTO quotations (
                estimate_number, request_id, registration_fee,
                daily_rate, qty_days, per_shift_rate, qty_shifts, transport_fee,
                sub_total, total_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;

        const result = await db.query(query, [
            estimateNumber, request_id, regFee,
            daily_rate || 0, days, isShiftBased ? parseFloat(per_shift_rate) : null, isShiftBased ? shifts : null, transport,
            subTotal, subTotal
        ]);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'QUOTATION_CREATED',
            entityType: 'QUOTATION',
            entityId: result.rows[0].quote_id,
            details: {
                quote_id: result.rows[0].quote_id,
                estimate_number: result.rows[0].estimate_number,
                request_id,
                total_amount: subTotal,
            },
        });

        res.status(201).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Estimate Error:", error);
        res.status(500).json({ message: "Failed to generate estimate" });
    }
};

exports.getQuoteByRequest = async (req, res) => {
    const { requestId } = req.params;

    try {
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type,
                   s.status as request_status, s.active_quote_id,
                   pq.quote_id as product_quote_id
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
            WHERE q.request_id = $1
            ORDER BY q.created_at DESC
        `, [requestId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No quotes found for this request" });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0] // Return the most recent quote
        });

    } catch (error) {
        console.error("Get Quote Error:", error);
        res.status(500).json({ message: "Failed to fetch quote" });
    }
};

exports.getQuotesByRequest = async (req, res) => {
    const { requestId } = req.params;

    try {
        // Lazy require: invoiceController requires this module at load time.
        const { lineItemDuplicateSql } = require('./invoiceController');
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type,
                   s.status as request_status, s.active_quote_id, s.client_id as request_client_id,
                   cp.honorific as client_honorific,
                   pq.quote_id as product_quote_id,
                   -- Companion PRODUCT quote (products/rentals), shown on the quotation page as part of
                   -- the combined total: its amount plus each rental's refundable deposit (same as
                   -- expandProductLineItemsForDisplay), and what's been paid on its real invoices.
                   COALESCE(pq.total_amount, 0) + COALESCE((
                       SELECT SUM(pli.deposit_amount) FROM quote_line_items pli
                       WHERE pli.quote_id = pq.quote_id AND pli.rental_billing_type IS NOT NULL AND pli.deposit_amount > 0
                   ), 0) as product_total,
                   COALESCE((
                       SELECT SUM(i.amount) FROM invoices i
                       WHERE i.quote_id = pq.quote_id AND i.status = 'PAID' AND NOT ${lineItemDuplicateSql('i')}
                   ), 0) as product_paid,
                   COALESCE((
                       SELECT SUM(amount_received)
                       FROM payment_tracking pt
                       WHERE pt.quote_id = q.quote_id AND pt.status = 'VERIFIED'
                   ), 0) as total_paid,
                   COALESCE((
                       SELECT COUNT(*)
                       FROM payment_tracking pt
                       WHERE pt.quote_id = q.quote_id
                   ), 0) as payment_count,
                   COALESCE((
                       SELECT json_agg(json_build_object(
                           'line_item_id', li.line_item_id,
                           'item_type', li.item_type,
                           'description', li.description,
                           'quantity', li.quantity,
                           'unit_price', li.unit_price,
                           'amount', li.amount
                       ) ORDER BY li.sort_order)
                       FROM quote_line_items li
                       WHERE li.quote_id = q.quote_id
                   ), '[]') as line_items
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
            WHERE q.request_id = $1
            ORDER BY q.created_at DESC
        `, [requestId]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (error) {
        console.error('Get Quotes By Request Error:', error);
        res.status(500).json({ message: 'Failed to fetch quotes for request' });
    }
};

exports.getClientQuotes = async (req, res) => {
    const { client_id } = req.params;

    try {
        const result = await db.query(`
            SELECT q.*, 
                   sr.payer_name, 
                   sr.payer_mobile, 
                   COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = sr.patient_id), sr.patient_name) AS patient_name, 
                   sr.service_type,
                   sr.status as request_status,
                   sr.created_at as request_created_at,
                   NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') AS client_name,
                   u.mobile_number as client_mobile
            FROM quotations q
            JOIN service_requests sr ON q.request_id = sr.request_id
            LEFT JOIN client_profiles cp ON sr.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            WHERE sr.client_id = $1
            ORDER BY q.created_at DESC
        `, [client_id]);

        res.status(200).json({
            status: 'success',
            data: result.rows
        });

    } catch (error) {
        console.error("Get Client Quotes Error:", error);
        res.status(500).json({ message: "Failed to fetch client quotes" });
    }
};

exports.generateAndSendPDF = async (req, res) => {
    const { quote_id } = req.params;
    const { product_quote_id } = req.body || {};

    try {
        // 1. Fetch Quote & Patient Data (including line items)
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type, cp.honorific AS client_honorific,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') AS line_items
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            WHERE q.quote_id = $1
            GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.patient_id, s.service_type, cp.honorific
        `, [quote_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quote not found" });
        }
        const data = result.rows[0];

        // Merge a companion PRODUCT quotation's items (rental/purchase items
        // added via ModularQuoteBuilder's Products & Rentals section) straight
        // into this document so the client gets one PDF and one WhatsApp
        // message instead of two — see mergeProductQuoteIntoData.
        if (product_quote_id) {
            await mergeProductQuoteIntoData(data, product_quote_id);
        }

        // 2. Generate PDF Buffer
        const html = estimateTemplate(await withTermsUrl(data));
        const file = { content: html };
        const pdfBuffer = await html_to_pdf.generatePdf(file, { format: 'A4' });

        // 3. Upload Buffer to S3
        // Keep .pdf in the key so the URL includes the extension
        // (required for WhatsApp/Twilio to detect the MIME type correctly)
        const pdfKey = `estimates/Estimate_${data.estimate_number}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

        console.log('S3 Debug - Upload response:', { url: pdfUrl, key: pdfKey });

        // 4. Send quotation template with PDF document header via Meta WhatsApp
        await sendClientQuotation(data.payer_mobile, data.payer_name, data.estimate_number, pdfUrl);

        // 7. Update Status
        await db.query("UPDATE quotations SET status = 'SENT' WHERE quote_id = $1", [quote_id]);
        if (product_quote_id) {
            await db.query("UPDATE quotations SET status = 'SENT' WHERE quote_id = $1", [product_quote_id]);
        }

        // 8. Update service request status to PENDING and set active_quote_id
        await db.query("UPDATE service_requests SET status = 'PENDING', active_quote_id = $1 WHERE request_id = $2", [quote_id, data.request_id]);

        // Priority Membership leads from the website have no client account yet. As soon as
        // the quotation reaches them, create it so payment and everything after runs as usual.
        // Non-fatal: recording the payment creates the account too if this ever fails.
        if (data.service_type === 'PRIORITY_MEMBERSHIP') {
            const pg = await db.pool.connect();
            try {
                await pg.query('BEGIN');
                const bootstrap = await getOrCreateClientProfileForQuotation(pg, { request_id: data.request_id });
                await pg.query('COMMIT');
                sendClientWelcomeCredentials(bootstrap);
                // The quotation doubles as the registration fee invoice: mark the client as
                // invoiced so only the payment is left to record.
                await markRegFeeInvoicedFromQuote({
                    quoteId: quote_id,
                    clientId: bootstrap.client_id,
                    pdfUrl,
                    sentBy: req.user?.user_id,
                });
            } catch (bootstrapErr) {
                await pg.query('ROLLBACK').catch(() => {});
                console.error('Priority Membership client profile creation failed (non-fatal):', bootstrapErr.message);
            } finally {
                pg.release();
            }
        }

        // Any quotation: a salesperson picked on its registration fee line is credited to the
        // client as soon as the quotation goes out (same moment the standalone reg fee invoice
        // credits), so they show on the client's page. Needs an existing client — for a lead
        // with no account yet, the credit happens when the fee payment creates it. Idempotent
        // and non-fatal.
        try {
            const regLine = await db.query(
                `SELECT li.amount, li.salesperson_id, sr.client_id
                 FROM quote_line_items li
                 JOIN quotations q ON q.quote_id = li.quote_id
                 JOIN service_requests sr ON sr.request_id = q.request_id
                 WHERE li.quote_id = $1 AND li.is_registration_fee = true AND li.salesperson_id IS NOT NULL
                 LIMIT 1`,
                [quote_id]
            );
            const row = regLine.rows[0];
            if (row?.client_id) {
                await creditSalespersonForRegistration(db, {
                    client_id: row.client_id,
                    salesperson_id: row.salesperson_id,
                    assigned_by: req.user?.user_id,
                    credited_amount: row.amount,
                });
            }
        } catch (creditErr) {
            console.error('Failed to credit salesperson at quotation send (non-fatal):', creditErr.message);
        }

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'QUOTATION_SENT',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: {
                quote_id,
                estimate_number: data.estimate_number,
                request_id: data.request_id,
                payer_mobile: data.payer_mobile,
                pdf_url: pdfUrl,
                product_quote_id: product_quote_id || undefined,
            },
        });

        // Warn (never block) when the quotation carries no registration-fee line and the
        // client's registration fee isn't in order — the usual way fees go uninvoiced.
        let registration_warning = null;
        try {
            const feeLine = await db.query(
                `SELECT 1 FROM quote_line_items WHERE quote_id = $1 AND is_registration_fee = true LIMIT 1`, [quote_id]);
            if (feeLine.rows.length === 0) {
                const who = await db.query(`SELECT client_id FROM service_requests WHERE request_id = $1`, [data.request_id]);
                registration_warning = await warnIfRegistrationIncomplete(req, {
                    clientId: who.rows[0]?.client_id, action: 'QUOTE_SENT_WITHOUT_REG_FEE',
                });
            }
        } catch (warnErr) {
            console.error('Quote registration warning failed:', warnErr.message);
        }

        res.status(200).json({
            status: 'success',
            message: 'PDF Estimate generated, uploaded, and sent via WhatsApp',
            pdf_link: pdfUrl,
            registration_warning
        });

    } catch (error) {
        console.error("PDF/WhatsApp Error:", error);
        res.status(500).json({ message: "Failed to process and send estimate", error: error.message });
    }
};

exports.generatePdfOnly = async (req, res) => {
    const { quote_id } = req.params;
    const { product_quote_id } = req.body || {};
    try {
        const result = await db.query(
            `SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type, cp.honorific AS client_honorific,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') AS line_items
             FROM quotations q
             JOIN service_requests s ON q.request_id = s.request_id
             LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
             WHERE q.quote_id = $1
             GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.patient_id, s.service_type, cp.honorific`,
            [quote_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quote not found' });
        }
        const data = result.rows[0];
        if (product_quote_id) {
            await mergeProductQuoteIntoData(data, product_quote_id);
        }
        const html = estimateTemplate(await withTermsUrl(data));
        const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
        const pdfKey = `estimates/Estimate_${data.estimate_number}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

        // Match generateAndSendPDF: generating the quote PDF (download or send)
        // moves the service request into PENDING and links this as its active quote.
        await db.query("UPDATE service_requests SET status = 'PENDING', active_quote_id = $1 WHERE request_id = $2", [quote_id, data.request_id]);

        res.status(200).json({ status: 'success', pdf_url: pdfUrl });
    } catch (error) {
        console.error('generatePdfOnly error:', error);
        res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    }
};

// ==================== PRESET ITEMS MANAGEMENT ====================

exports.getPresetItems = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT * FROM quote_preset_items 
            WHERE is_active = true 
            ORDER BY sort_order, name
        `);
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('Get Preset Items Error:', error);
        res.status(500).json({ message: 'Failed to fetch preset items' });
    }
};

exports.createPresetItem = async (req, res) => {
    const { name, item_type, description, default_quantity, default_unit_price, sort_order } = req.body;

    try {
        const result = await db.query(`
            INSERT INTO quote_preset_items (name, item_type, description, default_quantity, default_unit_price, sort_order)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [name, item_type, description, default_quantity || 1, default_unit_price, sort_order || 0]);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'PRESET_ITEM_CREATED',
            entityType: 'PRESET_ITEM',
            entityId: String(result.rows[0].preset_id),
            details: { name, item_type, default_unit_price },
        });

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Create Preset Item Error:', error);
        res.status(500).json({ message: 'Failed to create preset item' });
    }
};

exports.updatePresetItem = async (req, res) => {
    const { preset_id } = req.params;
    const { name, item_type, description, default_quantity, default_unit_price, is_active, sort_order } = req.body;

    try {
        const result = await db.query(`
            UPDATE quote_preset_items 
            SET name = $1, item_type = $2, description = $3, default_quantity = $4, 
                default_unit_price = $5, is_active = $6, sort_order = $7, updated_at = CURRENT_TIMESTAMP
            WHERE preset_id = $8
            RETURNING *
        `, [name, item_type, description, default_quantity, default_unit_price, is_active, sort_order, preset_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Preset item not found' });
        }

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'PRESET_ITEM_UPDATED',
            entityType: 'PRESET_ITEM',
            entityId: String(preset_id),
            details: { name, item_type, default_unit_price },
        });

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update Preset Item Error:', error);
        res.status(500).json({ message: 'Failed to update preset item' });
    }
};

exports.deletePresetItem = async (req, res) => {
    const { preset_id } = req.params;

    try {
        const result = await db.query(`
            UPDATE quote_preset_items SET is_active = false WHERE preset_id = $1 RETURNING *
        `, [preset_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Preset item not found' });
        }

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'PRESET_ITEM_DELETED',
            entityType: 'PRESET_ITEM',
            entityId: String(preset_id),
            details: { preset_id },
        });

        res.status(200).json({ status: 'success', message: 'Preset item deactivated' });
    } catch (error) {
        console.error('Delete Preset Item Error:', error);
        res.status(500).json({ message: 'Failed to delete preset item' });
    }
};

// ==================== MODULAR QUOTE OPERATIONS ====================

// ─── What a SERVICE quotation may hold ────────────────────────────────────────
// Only the registration fee, the dedicated care/shift rate lines and discounts.
// Free-form "custom charges" were removed (they were being misused, and nothing
// invoiced them); extras such as transport are catalogue products on the
// companion PRODUCT quotation, which is invoiced as a product sale.
const RATE_SUBTYPES = ['RATE_DAILY', 'RATE_SHIFT'];
const isCustomChargeLine = (item) =>
    item.item_type === 'CHARGE' && !item.is_registration_fee && !RATE_SUBTYPES.includes(item.item_subtype);
const isDisallowedServiceLine = (item) =>
    item.item_type !== 'DISCOUNT' && (item.item_type !== 'CHARGE' || isCustomChargeLine(item));
const customChargeRejection = (item) =>
    `"${(item.description || 'This line').trim()}" is a custom charge. Custom charges can no longer be added to a quotation — `
    + 'add extras such as transport as a product (Transport Charges) instead.';

// Products added to a service quotation that ALREADY has a booking are invoiced at once, on that
// booking, the same way booking creation invoices the products that were quoted before it. Otherwise
// nothing would ever accept them: the booking-creation step has already passed, and the payment form
// is not guaranteed to be used. Returns the result of attachLinkedProductsToBooking, or null when the
// quotation has no booking yet (then the products are invoiced at booking creation or first payment).
async function invoiceCompanionIfBooked(serviceQuoteId, actorUserId) {
    const found = await db.query(
        `SELECT COALESCE(sq.booking_id,
                          (SELECT bk.booking_id FROM bookings bk WHERE bk.request_id = sq.request_id ORDER BY bk.created_at DESC LIMIT 1)) AS booking_id
         FROM quotations sq WHERE sq.quote_id = $1`,
        [serviceQuoteId]
    );
    const bookingId = found.rows[0]?.booking_id;
    if (!bookingId) return null;

    const pg = await db.pool.connect();
    try {
        await pg.query('BEGIN');
        const result = await attachLinkedProductsToBooking(pg, { serviceQuoteId, bookingId, actorUserId });
        await pg.query('COMMIT');
        return result;
    } catch (err) {
        await pg.query('ROLLBACK').catch(() => {});
        console.error('[quote] could not invoice products added to a booked quotation:', err.message);
        return { accepted: false, warning: `The products were added but could not be invoiced automatically (${err.message}). Accept them from the Products page.` };
    } finally {
        pg.release();
    }
}

exports.createModularQuotation = async (req, res) => {
    const {
        request_id, line_items, terms_conditions, quote_type, walk_in_customer_id, linked_quote_id,
    } = req.body;
    let { client_id } = req.body;
    const isProductQuote = quote_type === 'PRODUCT';
    // Optional: the booking a stand-alone product sale belongs to (its invoices are tied to it on acceptance).
    const saleBookingId = isProductQuote && !linked_quote_id ? (req.body.booking_id || null) : null;

    try {
        if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
            return res.status(400).json({ message: 'At least one line item is required' });
        }

        // Custom charges are not allowed: a service quotation holds only the
        // registration fee, the care/shift rate and discounts. Extras such as transport
        // are catalogue products on its companion product quotation.
        if (!isProductQuote) {
            const bad = line_items.find(isDisallowedServiceLine);
            if (bad) return res.status(400).json({ message: customChargeRejection(bad) });
        }

        let linkedServiceQuote = null;
        if (isProductQuote && linked_quote_id) {
            const sq = await db.query(
                `SELECT q.quote_id, q.quote_type, sr.client_id AS request_client_id
                 FROM quotations q LEFT JOIN service_requests sr ON sr.request_id = q.request_id
                 WHERE q.quote_id = $1`,
                [linked_quote_id]
            );
            linkedServiceQuote = sq.rows[0];
            if (!linkedServiceQuote || linkedServiceQuote.quote_type !== 'SERVICE') {
                return res.status(400).json({ message: 'linked_quote_id must be a service quotation' });
            }
            // A companion product line must be a catalogue product (transport is the
            // "Transport Charges" product); only a standalone refundable deposit is free text.
            const unpicked = line_items.find((i) => i.item_type !== 'DEPOSIT' && !i.product_id);
            if (unpicked) {
                return res.status(400).json({ message: `"${unpicked.description || 'Item'}" is not a catalogue product. Pick it from the product catalogue (transport is "Transport Charges").` });
            }
            // A lead has no client account until its first payment; the client is
            // attached then (clientBootstrapService) or when the quote is accepted.
            if (!client_id && !walk_in_customer_id) client_id = linkedServiceQuote.request_client_id || null;
        }

        if (isProductQuote) {
            if (!client_id && !walk_in_customer_id && !linkedServiceQuote) {
                return res.status(400).json({ message: 'A PRODUCT quote requires either client_id or walk_in_customer_id' });
            }
        } else if (!request_id) {
            return res.status(400).json({ message: 'request_id is required for SERVICE quotes' });
        }

        // A stand-alone sale may be tied to one of the client's bookings. It must be that client's own
        // booking, so the invoices never land on someone else's account.
        if (saleBookingId) {
            if (!client_id) {
                return res.status(400).json({ message: 'A booking can only be chosen for a registered client.' });
            }
            const ownBooking = await db.query(
                `SELECT 1 FROM bookings b JOIN service_requests sr ON sr.request_id = b.request_id
                 WHERE b.booking_id = $1 AND sr.client_id = $2`,
                [saleBookingId, client_id]
            );
            if (ownBooking.rows.length === 0) {
                return res.status(400).json({ message: 'That booking does not belong to this client.' });
            }
        }

        // One companion product quotation per service quotation (the payment form and the
        // combined invoice read a single one). Adding products later, e.g. transport while
        // editing, extends it if it isn't accepted yet.
        let appendToQuoteId = null;
        if (linkedServiceQuote) {
            const existing = await db.query(
                `SELECT quote_id FROM quotations
                 WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT' AND COALESCE(status, '') <> 'REJECTED'
                 ORDER BY created_at LIMIT 1`,
                [linked_quote_id]
            );
            if (existing.rows[0]) {
                // Every product line is invoiced on its own, so a line can be added to a quotation that is
                // already invoiced. The exceptions are an older quotation billed by ONE combined invoice
                // (the new line would count as covered by it) and one that already has a rental
                // agreement (rentals are created once, when the quotation is accepted).
                const existingId = existing.rows[0].quote_id;
                if (await isProductQuoteAccepted(db, existingId)) {
                    const locked = await db.query(
                        `SELECT 1 FROM invoices WHERE quote_id = $1 AND category = 'PRODUCT' AND line_item_id IS NULL
                         UNION ALL SELECT 1 FROM rental_agreements WHERE quote_id = $1 LIMIT 1`,
                        [existingId]
                    );
                    if (locked.rows.length > 0) {
                        return res.status(409).json({ message: 'This quotation\'s products were invoiced together (or include a rental), so no more can be added to it. Create a separate product sale instead.' });
                    }
                }
                appendToQuoteId = existingId;
            }
        }

        // A registration-fee line item settles client_profiles.reg_fee_status
        // once payments reach it (see paymentTrackingController.recordPayment) —
        // reject up front if this client's registration is already settled, so
        // an admin can't accidentally re-charge/re-trigger it via a new quote.
        if (!isProductQuote && line_items.some(i => i.is_registration_fee)) {
            const clientCheck = await db.query(
                `SELECT cp.reg_fee_status FROM service_requests sr
                 JOIN client_profiles cp ON cp.client_profile_id = sr.client_id
                 WHERE sr.request_id = $1`,
                [request_id]
            );
            if (['PAID', 'WAIVED'].includes(clientCheck.rows[0]?.reg_fee_status)) {
                return res.status(409).json({ message: 'This client\'s registration fee is already settled — remove the Registration Fee line item.' });
            }
        }

        // Any line item referencing a RENTAL-type product needs its own
        // proposed billing terms (rental_billing_type/rental_start_date/
        // rental_end_date/deposit_amount on that item) — these ride along on
        // the PDF sent to the client and get carried straight into that
        // item's own rental_agreement on acceptance (see acceptProductQuote).
        // Terms are per-line-item, not per-quote, so a quote can freely mix
        // several rental items (each with different terms) with ordinary
        // one-off purchases.
        // product_id -> cost_price, used to snapshot each line item's cost basis
        // below (for both product and service quotes, since either can carry
        // product-backed line items).
        let productCostById = new Map();
        {
            const allProductIds = [...new Set(line_items.map(i => i.product_id).filter(Boolean))];
            if (allProductIds.length > 0) {
                const costResult = await db.query(
                    `SELECT product_id, cost_price FROM products WHERE product_id = ANY($1::uuid[])`,
                    [allProductIds]
                );
                productCostById = new Map(costResult.rows.map(p => [p.product_id, p.cost_price]));
            }
        }

        if (isProductQuote) {
            const productIds = [...new Set(line_items.map(i => i.product_id).filter(Boolean))];
            if (productIds.length > 0) {
                const productsResult = await db.query(
                    `SELECT product_id, product_type FROM products WHERE product_id = ANY($1::uuid[])`,
                    [productIds]
                );
                const rentalProductIds = new Set(productsResult.rows.filter(p => p.product_type === 'RENTAL').map(p => p.product_id));

                for (const item of line_items) {
                    if (!rentalProductIds.has(item.product_id)) continue;
                    if (!['ONE_TIME', 'RECURRING'].includes(item.rental_billing_type)) {
                        return res.status(400).json({ message: `rental_billing_type must be ONE_TIME or RECURRING for rental item "${item.description}"` });
                    }
                    if (item.rental_billing_type === 'ONE_TIME' && !item.rental_end_date) {
                        return res.status(400).json({ message: `rental_end_date is required for the ONE_TIME rental item "${item.description}"` });
                    }
                    // A specific physical unit is optional at quote time (e.g. "BED-002"
                    // rather than just "Medical Bed") — if chosen, it must actually belong
                    // to this product and still be AVAILABLE. Left unset, acceptProductQuote
                    // auto-picks the first AVAILABLE unit, same as before this existed.
                    if (item.unit_id) {
                        const unitResult = await db.query(
                            `SELECT status FROM rental_units WHERE unit_id = $1 AND product_id = $2`,
                            [item.unit_id, item.product_id]
                        );
                        if (unitResult.rows.length === 0) {
                            return res.status(400).json({ message: `Selected unit not found for rental item "${item.description}"` });
                        }
                        if (unitResult.rows[0].status !== 'AVAILABLE') {
                            return res.status(409).json({ message: `Selected unit for "${item.description}" is no longer available` });
                        }
                    }
                }
            }
        }

        // Calculate totals and process line items
        let sub_total = 0;
        const processedItems = line_items.map((item, index) => {
            const quantity = parseFloat(item.quantity) || 1;
            const unit_price = parseFloat(item.unit_price) || 0;
            const amount = item.item_type === 'DISCOUNT'
                ? -(Math.abs(quantity * unit_price))
                : quantity * unit_price;

            sub_total += amount;

            return {
                ...item,
                quantity,
                unit_price,
                amount,
                sort_order: item.sort_order !== undefined ? item.sort_order : index,
                cost_price_snapshot: item.product_id ? (productCostById.get(item.product_id) ?? 0) : null,
            };
        });

        // Adding to the service quotation's existing (not yet accepted) product quotation.
        if (appendToQuoteId) {
            const maxSort = await db.query(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM quote_line_items WHERE quote_id = $1`, [appendToQuoteId]);
            const offset = parseInt(maxSort.rows[0].m, 10) + 1;
            for (const [i, item] of processedItems.entries()) {
                await db.query(`
                    INSERT INTO quote_line_items (
                        quote_id, item_type, description, quantity, unit_price, amount, sort_order, product_id,
                        rental_billing_type, rental_start_date, rental_end_date, deposit_amount, unit_id, cost_price_snapshot
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                `, [
                    appendToQuoteId, item.item_type, item.description, item.quantity, item.unit_price, item.amount, offset + i,
                    item.product_id || null, item.rental_billing_type || null, item.rental_start_date || null,
                    item.rental_billing_type === 'ONE_TIME' ? (item.rental_end_date || null) : null,
                    parseFloat(item.deposit_amount) || 0, item.unit_id || null, item.cost_price_snapshot,
                ]);
            }
            await db.query(
                `UPDATE quotations q SET sub_total = t.total, total_amount = t.total, updated_at = CURRENT_TIMESTAMP,
                        client_id = COALESCE(q.client_id, $2)
                 FROM (SELECT COALESCE(SUM(amount), 0) AS total FROM quote_line_items WHERE quote_id = $1) t
                 WHERE q.quote_id = $1`,
                [appendToQuoteId, client_id || null]
            );
            const updated = await db.query(`SELECT * FROM quotations WHERE quote_id = $1`, [appendToQuoteId]);
            await safeLog({
                actorUserId: req.user?.user_id,
                actorRole: extractActorRole(req.user?.role),
                actionType: 'QUOTATION_UPDATED',
                entityType: 'QUOTATION',
                entityId: appendToQuoteId,
                details: { quote_id: appendToQuoteId, added_line_items: processedItems.length, linked_quote_id },
            });
            const invoicing = await invoiceCompanionIfBooked(linked_quote_id, req.user?.user_id || null);
            return res.status(201).json({ status: 'success', data: updated.rows[0], appended_to_existing: true, product_invoicing: invoicing });
        }

        // Generate estimate number
        const estimateNumber = await generateUniqueEstimateNumber();

        // Extract legacy values for backwards compatibility
        const registration_fee = processedItems.find(i =>
            i.description.toLowerCase().includes('registration')
        )?.amount || 0;

        // A tagged item_subtype is the authoritative signal (added via the
        // dedicated "Add Care Rate"/"Add Shift Rate" buttons in the quote
        // builder) — description text-matching only remains as a fallback for
        // older callers that don't send item_subtype.
        const dailyRateItem = processedItems.find(i => i.item_subtype === 'RATE_DAILY')
            || processedItems.find(i => i.description.toLowerCase().includes('daily') || i.description.toLowerCase().includes('care rate'));
        const daily_rate = dailyRateItem?.unit_price || 0;
        const qty_days = dailyRateItem?.quantity || 1;

        const shiftRateItem = processedItems.find(i => i.item_subtype === 'RATE_SHIFT')
            || processedItems.find(i => i.description.toLowerCase().includes('shift'));
        const per_shift_rate = shiftRateItem?.unit_price || null;
        const qty_shifts = shiftRateItem?.quantity || null;

        const transport_fee = processedItems.find(i =>
            i.description.toLowerCase().includes('transport')
        )?.amount || 0;

        // Insert quotation
        const quoteQuery = `
            INSERT INTO quotations (
                estimate_number, request_id, registration_fee, daily_rate, qty_days, per_shift_rate, qty_shifts, transport_fee,
                sub_total, total_amount, terms_conditions, quote_type, client_id, walk_in_customer_id, linked_quote_id, booking_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *;
        `;

        const quoteResult = await db.query(quoteQuery, [
            estimateNumber, isProductQuote ? null : request_id, registration_fee, daily_rate, qty_days, per_shift_rate, qty_shifts, transport_fee,
            sub_total, sub_total, terms_conditions || 'The initial estimated amount is non-refundable.',
            isProductQuote ? 'PRODUCT' : 'SERVICE',
            isProductQuote ? (client_id || null) : null,
            isProductQuote ? (walk_in_customer_id || null) : null,
            isProductQuote ? (linked_quote_id || null) : null,
            saleBookingId,
        ]);

        const quote_id = quoteResult.rows[0].quote_id;

        // Insert line items — rental terms only apply to (and are only stored
        // for) items referencing a RENTAL product; harmless nulls otherwise.
        for (const item of processedItems) {
            await db.query(`
                INSERT INTO quote_line_items (
                    quote_id, item_type, description, quantity, unit_price, amount, sort_order, product_id,
                    rental_billing_type, rental_start_date, rental_end_date, deposit_amount, unit_id,
                    is_registration_fee, salesperson_id, item_subtype, cost_price_snapshot
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            `, [
                quote_id, item.item_type, item.description, item.quantity, item.unit_price, item.amount, item.sort_order, item.product_id || null,
                item.rental_billing_type || null,
                item.rental_start_date || null,
                item.rental_billing_type === 'ONE_TIME' ? (item.rental_end_date || null) : null,
                parseFloat(item.deposit_amount) || 0,
                item.unit_id || null,
                !!item.is_registration_fee,
                item.salesperson_id || null,
                item.item_subtype || null,
                item.cost_price_snapshot,
            ]);
        }

        // Return complete quote with line items
        const completeQuote = await db.query(`
            SELECT q.*,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order,
                        'product_id', li.product_id,
                        'rental_billing_type', li.rental_billing_type,
                        'rental_start_date', li.rental_start_date,
                        'rental_end_date', li.rental_end_date,
                        'deposit_amount', li.deposit_amount,
                        'unit_id', li.unit_id,
                        'unit_code', ru.unit_code,
                        'item_subtype', li.item_subtype
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            LEFT JOIN rental_units ru ON li.unit_id = ru.unit_id
            WHERE q.quote_id = $1
            GROUP BY q.quote_id
        `, [quote_id]);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'QUOTATION_CREATED',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: {
                quote_id,
                estimate_number: estimateNumber,
                request_id,
                total_amount: sub_total,
                line_item_count: processedItems.length,
            },
        });

        const invoicing = isProductQuote && linked_quote_id
            ? await invoiceCompanionIfBooked(linked_quote_id, req.user?.user_id || null)
            : null;

        res.status(201).json({
            status: 'success',
            data: completeQuote.rows[0],
            product_invoicing: invoicing
        });

    } catch (error) {
        console.error('Modular Quote Error:', error);
        res.status(500).json({ message: 'Failed to generate quotation', error: error.message });
    }
};

exports.getQuoteWithLineItems = async (req, res) => {
    const { quote_id } = req.params;

    try {
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type, s.service_model,
                s.client_id as request_client_id,
                cp.honorific as client_honorific,
                pq.quote_id as product_quote_id,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order,
                        'is_registration_fee', li.is_registration_fee,
                        'item_subtype', li.item_subtype
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
            WHERE q.quote_id = $1
            GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.patient_id, s.service_type, s.service_model, s.client_id, cp.honorific, pq.quote_id
        `, [quote_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Get Quote with Line Items Error:', error);
        res.status(500).json({ message: 'Failed to fetch quote' });
    }
};

exports.updateQuoteLineItems = async (req, res) => {
    const { quote_id } = req.params;
    const { line_items, terms_conditions } = req.body;

    // No new custom charges (see isDisallowedServiceLine). A custom charge the
    // quotation already had (created before they were removed) may stay, so older
    // quotations can still be edited — matched on its description.
    if (Array.isArray(line_items)) {
        const existing = await db.query(
            `SELECT item_type, is_registration_fee, item_subtype, description FROM quote_line_items WHERE quote_id = $1`,
            [quote_id]
        );
        const legacy = new Set(existing.rows.filter(isCustomChargeLine).map((r) => (r.description || '').trim().toLowerCase()));
        const bad = line_items.find((i) => isDisallowedServiceLine(i)
            && !(isCustomChargeLine(i) && legacy.has((i.description || '').trim().toLowerCase())));
        if (bad) return res.status(400).json({ message: customChargeRejection(bad) });
    }

    try {
        await db.query('BEGIN');

        // Delete existing line items
        await db.query('DELETE FROM quote_line_items WHERE quote_id = $1', [quote_id]);

        // Recalculate and insert new line items
        let sub_total = 0;
        const processedItems = [];
        for (let i = 0; i < line_items.length; i++) {
            const item = line_items[i];
            const quantity = parseFloat(item.quantity) || 1;
            const unit_price = parseFloat(item.unit_price) || 0;
            const amount = item.item_type === 'DISCOUNT'
                ? -(Math.abs(quantity * unit_price))
                : quantity * unit_price;

            sub_total += amount;
            processedItems.push({ ...item, quantity, unit_price, amount });

            await db.query(`
                INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order, is_registration_fee, salesperson_id, item_subtype)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [quote_id, item.item_type, item.description, quantity, unit_price, amount, item.sort_order || i, !!item.is_registration_fee, item.salesperson_id || null, item.item_subtype || null]);
        }

        // Re-derive the legacy rate columns from the (possibly changed) line
        // items — without this, editing a quote's rate never reaches
        // quotations.daily_rate/per_shift_rate, and a booking created from it
        // afterwards would silently use the stale value from creation time.
        const registration_fee = processedItems.find(i => i.description.toLowerCase().includes('registration'))?.amount || 0;
        const dailyRateItem = processedItems.find(i => i.item_subtype === 'RATE_DAILY')
            || processedItems.find(i => i.description.toLowerCase().includes('daily') || i.description.toLowerCase().includes('care rate'));
        const daily_rate = dailyRateItem?.unit_price || 0;
        const qty_days = dailyRateItem?.quantity || 1;
        const shiftRateItem = processedItems.find(i => i.item_subtype === 'RATE_SHIFT')
            || processedItems.find(i => i.description.toLowerCase().includes('shift'));
        const per_shift_rate = shiftRateItem?.unit_price || null;
        const qty_shifts = shiftRateItem?.quantity || null;

        // Update quotation totals + legacy rate columns
        await db.query(`
            UPDATE quotations
            SET sub_total = $1, total_amount = $1, terms_conditions = $2, updated_at = CURRENT_TIMESTAMP,
                registration_fee = $3, daily_rate = $4, qty_days = $5, per_shift_rate = $6, qty_shifts = $7,
                invoice_code = CASE WHEN EXISTS (SELECT 1 FROM payment_tracking WHERE quote_id = $8 AND status = 'VERIFIED') THEN invoice_code ELSE NULL END,
                invoice_pdf_url = CASE WHEN EXISTS (SELECT 1 FROM payment_tracking WHERE quote_id = $8 AND status = 'VERIFIED') THEN invoice_pdf_url ELSE NULL END,
                invoice_generated_at = CASE WHEN EXISTS (SELECT 1 FROM payment_tracking WHERE quote_id = $8 AND status = 'VERIFIED') THEN invoice_generated_at ELSE NULL END
            WHERE quote_id = $8
        `, [sub_total, terms_conditions, registration_fee, daily_rate, qty_days, per_shift_rate, qty_shifts, quote_id]);

        await db.query('COMMIT');

        // Return updated quote
        const result = await db.query(`
            SELECT q.*,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order,
                        'is_registration_fee', li.is_registration_fee,
                        'item_subtype', li.item_subtype
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            WHERE q.quote_id = $1
            GROUP BY q.quote_id
        `, [quote_id]);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'QUOTATION_UPDATED',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: {
                quote_id,
                new_total: sub_total,
                line_item_count: line_items.length,
            },
        });

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Update Quote Error:', error);
        res.status(500).json({ message: 'Failed to update quote', error: error.message });
    }
};

exports.updateQuoteStatus = async (req, res) => {
    const { quote_id } = req.params;
    const { status } = req.body;

    const allowed = ['ACCEPTED', 'REJECTED', 'SENT'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }

    try {
        const result = await db.query(
            `UPDATE quotations SET status = $1 WHERE quote_id = $2
             RETURNING quote_id, estimate_number, status`,
            [status, quote_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quote not found' });
        }

        res.json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Update Quote Status Error:', error);
        res.status(500).json({ message: 'Failed to update quote status' });
    }
};

// POST /api/quotes/product/request — a logged-in CLIENT expresses interest in a
// catalog product from the client portal. Creates a DRAFT (not SENT) quotation
// so it's distinguishable in the admin "Quotes & Invoices" queue from a
// properly priced/reviewed quote an admin has built and sent.
exports.submitProductInterest = async (req, res) => {
    const { product_id, quantity } = req.body;

    if (!product_id) {
        return res.status(400).json({ message: 'product_id is required' });
    }

    try {
        const clientResult = await db.query(
            'SELECT client_profile_id FROM client_profiles WHERE user_id = $1',
            [req.user.user_id]
        );
        if (clientResult.rows.length === 0) {
            return res.status(404).json({ message: 'Client profile not found for this account' });
        }
        const client_id = clientResult.rows[0].client_profile_id;

        const productResult = await db.query(
            'SELECT product_id, name, price, cost_price FROM products WHERE product_id = $1 AND is_available = true',
            [product_id]
        );
        if (productResult.rows.length === 0) {
            return res.status(404).json({ message: 'Product not found or unavailable' });
        }
        const product = productResult.rows[0];
        const qty = parseFloat(quantity) || 1;
        const amount = qty * parseFloat(product.price);

        const estimateNumber = await generateUniqueEstimateNumber();

        const quoteResult = await db.query(
            `INSERT INTO quotations (
                estimate_number, daily_rate, qty_days, sub_total, total_amount,
                status, quote_type, client_id
             ) VALUES ($1, 0, 1, $2, $2, 'DRAFT', 'PRODUCT', $3)
             RETURNING *`,
            [estimateNumber, amount, client_id]
        );
        const quote_id = quoteResult.rows[0].quote_id;

        await db.query(
            `INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, product_id, cost_price_snapshot)
             VALUES ($1, 'PRODUCT', $2, $3, $4, $5, $6, $7)`,
            [quote_id, product.name, qty, product.price, amount, product_id, product.cost_price]
        );

        await safeLog({
            actorUserId: req.user.user_id,
            actorRole: extractActorRole(req.user.role),
            actionType: 'PRODUCT_INTEREST_SUBMITTED',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: { client_id, product_id, quantity: qty },
        });

        res.status(201).json({ status: 'success', data: quoteResult.rows[0] });
    } catch (error) {
        console.error('Submit Product Interest Error:', error);
        res.status(500).json({ message: 'Failed to submit product request' });
    }
};

// ==================== PRODUCT QUOTE OPERATIONS ====================
// Mirrors getQuoteWithLineItems/getClientQuotes but for quote_type = 'PRODUCT',
// which has no service_requests row to join against (client_id/walk_in_customer_id
// identify the recipient instead).

exports.getProductQuoteWithLineItems = async (req, res) => {
    const { quote_id } = req.params;

    try {
        const result = await db.query(`
            SELECT q.*,
                   CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                        THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
                   u.mobile_number as client_mobile,
                   wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id,
                        'item_type', li.item_type,
                        'description', li.description,
                        'quantity', li.quantity,
                        'unit_price', li.unit_price,
                        'amount', li.amount,
                        'sort_order', li.sort_order,
                        'product_id', li.product_id,
                        'rental_billing_type', li.rental_billing_type,
                        'rental_start_date', li.rental_start_date,
                        'rental_end_date', li.rental_end_date,
                        'deposit_amount', li.deposit_amount,
                        'unit_id', li.unit_id,
                        'unit_code', ru.unit_code,
                        'vendor_id', p.vendor_id,
                        'vendor_name', v.name,
                        'cost_price_snapshot', li.cost_price_snapshot,
                        'product_cost_price', p.cost_price,
                        'invoice_id', (SELECT i.invoice_id FROM invoices i WHERE i.line_item_id = li.line_item_id AND i.category <> 'LINE_ITEM' LIMIT 1),
                        'invoice_code', (SELECT i.invoice_code FROM invoices i WHERE i.line_item_id = li.line_item_id AND i.category <> 'LINE_ITEM' LIMIT 1),
                        'invoice_status', (SELECT i.status FROM invoices i WHERE i.line_item_id = li.line_item_id AND i.category <> 'LINE_ITEM' LIMIT 1),
                        'billed', (p.product_type::text = 'RENTAL' AND EXISTS (SELECT 1 FROM rental_agreements ra WHERE ra.quote_id = li.quote_id))
                                  OR (COALESCE(p.product_type::text, '') <> 'RENTAL' AND EXISTS (
                                       SELECT 1 FROM invoices i WHERE i.category <> 'LINE_ITEM'
                                         AND (i.line_item_id = li.line_item_id OR (i.line_item_id IS NULL AND i.category = 'PRODUCT' AND i.quote_id = li.quote_id))))
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            LEFT JOIN client_profiles cp ON q.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN walk_in_customers wc ON q.walk_in_customer_id = wc.walk_in_customer_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            LEFT JOIN rental_units ru ON li.unit_id = ru.unit_id
            LEFT JOIN products p ON li.product_id = p.product_id
            LEFT JOIN vendors v ON p.vendor_id = v.vendor_id
            WHERE q.quote_id = $1 AND q.quote_type = 'PRODUCT'
            GROUP BY q.quote_id, cp.full_name, cp.honorific, cp.company_name, cp.display_name_source, u.mobile_number, wc.full_name, wc.mobile_number
        `, [quote_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Product quote not found' });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error('Get Product Quote Error:', error);
        res.status(500).json({ message: 'Failed to fetch product quote' });
    }
};

exports.listProductQuotes = async (req, res) => {
    const { client_id, walk_in_customer_id, status } = req.query;

    try {
        const conditions = [`q.quote_type = 'PRODUCT'`];
        const params = [];

        if (client_id) {
            params.push(client_id);
            conditions.push(`q.client_id = $${params.length}`);
        }
        if (walk_in_customer_id) {
            params.push(walk_in_customer_id);
            conditions.push(`q.walk_in_customer_id = $${params.length}`);
        }
        if (status) {
            params.push(status);
            conditions.push(`q.status = $${params.length}`);
        }

        const result = await db.query(`
            SELECT q.*,
                   CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                        THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
                   u.mobile_number as client_mobile,
                   wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
                   sq.estimate_number as linked_estimate_number,
                   COALESCE((
                       SELECT COUNT(*) FROM quote_line_items li
                       JOIN products p ON li.product_id = p.product_id
                       WHERE li.quote_id = q.quote_id AND p.product_type = 'RENTAL'
                   ), 0) as rental_item_count,
                   COALESCE((
                       SELECT SUM(li.deposit_amount) + COALESCE(SUM(li.amount) FILTER (WHERE li.item_type = 'DEPOSIT'), 0)
                       FROM quote_line_items li
                       WHERE li.quote_id = q.quote_id
                   ), 0) as total_deposit_amount,
                   (SELECT COUNT(*)::int FROM (${unbilledLinesSql('q.quote_id')}) ub) AS unbilled_line_count,
                   sq.status AS service_status, sq.request_id AS linked_request_id,
                   (q.linked_quote_id IS NOT NULL) AS is_companion,
                   COALESCE(inv.invoice_count, 0) AS invoice_count,
                   COALESCE(inv.invoiced_total, 0) AS invoiced_total,
                   COALESCE(inv.paid_total, 0) AS paid_total,
                   bk.booking_id AS sale_booking_id, bk.booking_code AS sale_booking_code, bk.status AS sale_booking_status
            FROM quotations q
            LEFT JOIN client_profiles cp ON q.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN walk_in_customers wc ON q.walk_in_customer_id = wc.walk_in_customer_id
            LEFT JOIN quotations sq ON sq.quote_id = q.linked_quote_id
            LEFT JOIN bookings bk ON bk.booking_id = COALESCE(q.booking_id, sq.booking_id)
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS invoice_count,
                       SUM(i.amount) AS invoiced_total,
                       SUM(CASE WHEN i.status = 'PAID' THEN i.amount
                                ELSE LEAST(i.amount, COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = i.invoice_id), 0)) END) AS paid_total
                FROM invoices i
                WHERE i.quote_id = q.quote_id AND i.category IN ('PRODUCT', 'RENTAL_ONE_TIME', 'RENTAL_RECURRING')
            ) inv ON true
            WHERE ${conditions.join(' AND ')}
            ORDER BY q.created_at DESC
        `, params);

        const rows = result.rows.map((r) => ({
            ...r,
            amount_owing: Math.max((Number(r.invoiced_total) || 0) - (Number(r.paid_total) || 0), 0),
            sale_status: saleStatusOf(r),
        }));
        res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
        console.error('List Product Quotes Error:', error);
        res.status(500).json({ message: 'Failed to fetch product quotes' });
    }
};

// Bookings a stand-alone product sale can be tied to, for the Products page's "New quotation" form.
// Live bookings first (newest first), then finished ones; cancelled ones are left out. The first
// row is what the form pre-selects.
exports.listClientBookingsForSale = async (req, res) => {
    try {
        const { client_id } = req.params;
        const result = await db.query(
            `SELECT b.booking_id, b.booking_code, b.status, b.start_date, sr.service_type,
                    COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = sr.patient_id), sr.patient_name) AS patient_name,
                    (b.status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')) AS is_live
             FROM bookings b
             JOIN service_requests sr ON sr.request_id = b.request_id
             WHERE sr.client_id = $1 AND b.status <> 'CANCELLED'
             ORDER BY (b.status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')) DESC, b.created_at DESC`,
            [client_id]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('List client bookings for sale error:', error);
        res.status(500).json({ message: 'Failed to load the client\'s bookings' });
    }
};

exports.checkQuoteBooking = async (req, res) => {
    const { quote_id } = req.params;

    try {
        const result = await db.query(`
            SELECT booking_id FROM quotations WHERE quote_id = $1
        `, [quote_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quote not found" });
        }

        const booking_id = result.rows[0].booking_id;
        
        res.status(200).json({
            status: 'success',
            data: {
                has_booking: booking_id !== null && booking_id !== undefined,
                booking_id: booking_id || null
            }
        });

    } catch (error) {
        console.error('Check Quote Booking Error:', error);
        res.status(500).json({ message: 'Failed to check quote booking', error: error.message });
    }
};

// ==================== PRODUCT QUOTE PDF / SEND ====================
// Mirrors generateAndSendPDF/generatePdfOnly above, but for quote_type =
// 'PRODUCT' quotes — these have no service_requests row to pull payer info
// from, so payer_name/payer_mobile come from client_profiles/walk_in_customers
// instead. estimateTemplate itself only reads estimate_number/payer_name/
// line_items/sub_total/total_amount/terms_conditions, so it's reused as-is.
// If the quote has a proposed rental (rental_billing_type set), the deposit
// and billing terms are appended as extra display-only line items so the
// client sees the full picture on the PDF even though the deposit isn't a
// real quote_line_items row (see acceptProductQuote for how it's actually billed).

// Expands a PRODUCT quote's raw line items into display form: each rental
// item's billing cadence (and specific unit, if one was chosen) appended to
// its own description, plus its own deposit shown as a distinct line right
// after it. Shared by buildProductQuotePdfData (the product quote's own PDF)
// and mergeProductQuoteIntoData (folding a companion product quote into a
// service quote's PDF so only one document/message goes to the client).
function expandProductLineItemsForDisplay(rawLineItems, baseTotal) {
    let total = parseFloat(baseTotal) || 0;
    const items = [];
    for (const li of rawLineItems) {
        if (li.rental_billing_type) {
            const billingLabel = li.rental_billing_type === 'RECURRING' ? 'Billed monthly' : 'One-time, fixed period';
            const unitLabel = li.unit_code ? ` — Unit ${li.unit_code}` : '';
            items.push({ ...li, description: `${li.description}${unitLabel} (${billingLabel})` });

            const depositAmt = parseFloat(li.deposit_amount) || 0;
            if (depositAmt > 0) {
                items.push({
                    description: `Refundable Deposit for ${li.description} (fully refundable on return)`,
                    quantity: 1,
                    unit_price: depositAmt,
                    amount: depositAmt,
                });
                total += depositAmt;
            }
        } else {
            items.push(li);
        }
    }
    return { items, total };
}

async function buildProductQuotePdfData(quote_id) {
    const result = await db.query(`
        SELECT q.*,
               CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                    THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS client_name,
               u.mobile_number as client_mobile,
               wc.full_name as walk_in_name, wc.mobile_number as walk_in_mobile,
               COALESCE(json_agg(
                   json_build_object(
                       'line_item_id', li.line_item_id,
                       'item_type', li.item_type,
                       'description', li.description,
                       'quantity', li.quantity,
                       'unit_price', li.unit_price,
                       'amount', li.amount,
                       'sort_order', li.sort_order,
                       'rental_billing_type', li.rental_billing_type,
                       'deposit_amount', li.deposit_amount,
                       'unit_code', ru.unit_code
                   ) ORDER BY li.sort_order
               ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
        FROM quotations q
        LEFT JOIN client_profiles cp ON q.client_id = cp.client_profile_id
        LEFT JOIN users u ON cp.user_id = u.user_id
        LEFT JOIN walk_in_customers wc ON q.walk_in_customer_id = wc.walk_in_customer_id
        LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
        LEFT JOIN rental_units ru ON li.unit_id = ru.unit_id
        WHERE q.quote_id = $1 AND q.quote_type = 'PRODUCT'
        GROUP BY q.quote_id, cp.full_name, cp.honorific, cp.company_name, cp.display_name_source, u.mobile_number, wc.full_name, wc.mobile_number
    `, [quote_id]);

    if (result.rows.length === 0) return null;
    const data = result.rows[0];

    data.payer_name = data.client_name || data.walk_in_name || 'Customer';
    data.payer_mobile = data.client_mobile || data.walk_in_mobile;

    const { items, total } = expandProductLineItemsForDisplay(data.line_items, data.total_amount);
    data.line_items = items;
    data.total_amount = total;
    data.sub_total = total;

    return data;
}

// Folds a companion PRODUCT quote's line items into an already-fetched
// SERVICE quote's `data` object (mutates in place) so ModularQuoteBuilder's
// combined "Generate & Send" sends one PDF / one WhatsApp message instead of
// two. The underlying PRODUCT quotation row still exists on its own — it's
// what acceptProductQuote later turns into real rental agreements/deposits/
// invoices — only the client-facing document is merged here.
async function mergeProductQuoteIntoData(data, product_quote_id) {
    const result = await db.query(`
        SELECT q.total_amount,
               COALESCE(json_agg(
                   json_build_object(
                       'line_item_id', li.line_item_id,
                       'item_type', li.item_type,
                       'description', li.description,
                       'quantity', li.quantity,
                       'unit_price', li.unit_price,
                       'amount', li.amount,
                       'sort_order', li.sort_order,
                       'rental_billing_type', li.rental_billing_type,
                       'deposit_amount', li.deposit_amount,
                       'unit_code', ru.unit_code
                   ) ORDER BY li.sort_order
               ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
        FROM quotations q
        LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
        LEFT JOIN rental_units ru ON li.unit_id = ru.unit_id
        WHERE q.quote_id = $1 AND q.quote_type = 'PRODUCT'
        GROUP BY q.quote_id
    `, [product_quote_id]);

    if (result.rows.length === 0) return;
    const { items, total } = expandProductLineItemsForDisplay(result.rows[0].line_items, result.rows[0].total_amount);

    const existingCount = data.line_items.length;
    data.line_items = [...data.line_items, ...items.map((it, i) => ({ ...it, sort_order: existingCount + i }))];
    data.sub_total = (parseFloat(data.sub_total) || 0) + total;
    data.total_amount = (parseFloat(data.total_amount) || 0) + total;
}

// Generates (once) a combined Invoice PDF for a SERVICE quote plus its
// linked PRODUCT quote, if any — e.g. daily-rate charges + a rental + its
// deposit, folded into one document the same way the merged quotation PDF
// is (see mergeProductQuoteIntoData). Called the first time any payment is
// recorded against either portion (see paymentTrackingController.recordPayment
// and invoiceController.recordInvoicePayment) and again, idempotently, by
// receiptController.sendReceiptWhatsApp so it can be sent alongside the
// receipt. Reuses the same invoice_code_seq as the standalone `invoices`
// table for one consistent numbering sequence.
// Creates (once) a standalone registration-fee-only invoice, separate from
// the combined Invoice, so the fee has its own document in the client's
// "Registration Fee Invoices" list — mirrors the manual clientController
// .sendRegFeeInvoice flow but skips the WhatsApp send/bank-account prompt.
// Called as soon as cumulative verified payments cross the registration fee
// line item's own amount (see paymentTrackingController.recordPayment),
// independently of the combined Invoice — which may still be pending the
// rest of the quote getting paid off. Idempotent: keyed on a deterministic
// invoice_code derived from the quote.
async function ensureRegFeeInvoiceRecord(serviceQuoteId, { clientId, registrationFee, payerName }) {
    if (!clientId || !registrationFee || parseFloat(registrationFee) <= 0) return;

    const invoiceCode = `REGFEE-${serviceQuoteId.slice(0, 8).toUpperCase()}`;
    const existing = await db.query(
        `SELECT invoice_id FROM client_reg_fee_invoices WHERE client_id = $1 AND invoice_code = $2`,
        [clientId, invoiceCode]
    );
    if (existing.rows.length > 0) {
        // Created as SENT when a Priority Membership quotation went out — the payment
        // that just settled it flips it to PAID. settleRegistrationFee has already
        // stamped client_profiles.reg_fee_paid_at/reg_fee_expires_at by this point
        // (see paymentTrackingController.recordPayment), so copy that same window.
        await db.query(
            `UPDATE client_reg_fee_invoices crfi SET status = 'PAID',
                    period_start = cp.reg_fee_paid_at, period_end = cp.reg_fee_expires_at
             FROM client_profiles cp
             WHERE crfi.invoice_id = $1 AND cp.client_profile_id = $2 AND crfi.status <> 'PAID'`,
            [existing.rows[0].invoice_id, clientId]
        );
        return;
    }

    const bankResult = await db.query(
        `SELECT ba.account_id, ba.bank_name, ba.account_holder_name, ba.account_number, ba.branch_name
         FROM payment_tracking pt
         JOIN bank_accounts ba ON pt.bank_account_id = ba.account_id
         WHERE pt.quote_id = $1
         ORDER BY pt.payment_date ASC LIMIT 1`,
        [serviceQuoteId]
    );
    const bank = bankResult.rows[0] || {};
    const feeAmount = parseFloat(registrationFee).toFixed(2);

    // Print the client's billing name with their honorific (falls back to the request's payer name).
    const nameRow = await db.query(
        `SELECT honorific, full_name, company_name, display_name_source FROM client_profiles WHERE client_profile_id = $1`,
        [clientId]
    );
    const invoiceName = billingName(nameRow.rows[0]) || payerName;

    try {
        const pdfUrl = await generateAndUploadRegFeeInvoice({
            invoice_code: invoiceCode,
            invoice_date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            client_name: invoiceName,
            amount: feeAmount,
            bank_name: bank.bank_name || '',
            account_holder_name: bank.account_holder_name || '',
            account_number: bank.account_number || '',
            branch_name: bank.branch_name || '—',
            upload_url: '',
        });

        await db.query(
            `INSERT INTO client_reg_fee_invoices (client_id, invoice_code, amount, pdf_url, bank_account_id, status, period_start, period_end)
             SELECT $1, $2, $3, $4, $5, 'PAID', cp.reg_fee_paid_at, cp.reg_fee_expires_at
             FROM client_profiles cp WHERE cp.client_profile_id = $1`,
            [clientId, invoiceCode, feeAmount, pdfUrl, bank.account_id || null]
        );
    } catch (err) {
        console.error('Failed to generate standalone registration fee invoice:', err.message);
    }
}

// `allowUnpaid`: an admin can build the invoice document before the quotation is fully
// paid (the manual "Generate Combined Invoice" action). Automatic generation after each
// payment keeps waiting for full payment.
// regenerate: rebuild the PDF of an already-issued combined invoice after its
// quotation was edited (services/invoiceAmountEdits.js) — same invoice number
// and date, no paid-in-full requirement.
async function ensureCombinedInvoice(serviceQuoteId, { allowUnpaid = false, regenerate = false } = {}) {
    const existing = await db.query(
        `SELECT q.invoice_code, q.invoice_pdf_url, q.total_amount,
                s.payer_name, s.payer_mobile
         FROM quotations q
         JOIN service_requests s ON q.request_id = s.request_id
         WHERE q.quote_id = $1`,
        [serviceQuoteId]
    );
    if (existing.rows.length === 0) return null;
    const row = existing.rows[0];

    if (!regenerate && row.invoice_code && row.invoice_pdf_url) {
        // Total may include a linked product quote's items — recompute for
        // the return value without touching the already-generated PDF.
        const productLink = await db.query(
            `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
            [serviceQuoteId]
        );
        let totalAmount = parseFloat(row.total_amount) || 0;
        if (productLink.rows.length > 0) {
            const stub = { total_amount: totalAmount, sub_total: totalAmount, line_items: [] };
            await mergeProductQuoteIntoData(stub, productLink.rows[0].quote_id).catch(() => {});
            totalAmount = parseFloat(stub.total_amount) || totalAmount;
        }
        return {
            invoice_code: row.invoice_code,
            invoice_pdf_url: row.invoice_pdf_url,
            total_amount: totalAmount,
            payer_name: row.payer_name,
            payer_mobile: row.payer_mobile,
        };
    }

    const result = await db.query(`
        SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type, cp.honorific AS client_honorific,
            COALESCE(json_agg(
                json_build_object(
                    'line_item_id', li.line_item_id,
                    'item_type', li.item_type,
                    'description', li.description,
                    'quantity', li.quantity,
                    'unit_price', li.unit_price,
                    'amount', li.amount,
                    'sort_order', li.sort_order
                ) ORDER BY li.sort_order
            ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') AS line_items
        FROM quotations q
        JOIN service_requests s ON q.request_id = s.request_id
        LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
        WHERE q.quote_id = $1
        GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.patient_id, s.service_type, cp.honorific
    `, [serviceQuoteId]);
    if (result.rows.length === 0) return null;
    const data = result.rows[0];

    // Only generate once the quotation itself is paid off in full — a
    // partial payment (e.g. just crossing the registration-fee threshold)
    // should not trigger this; see paymentTrackingController.recordPayment,
    // which now calls this on every payment regardless of amount.
    const paidResult = await db.query(
        `SELECT COALESCE(SUM(amount_received), 0) AS total_paid
         FROM payment_tracking WHERE quote_id = $1 AND status = 'VERIFIED'`,
        [serviceQuoteId]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid) || 0;
    const totalDue = parseFloat(data.total_amount) || 0;
    if (!allowUnpaid && !regenerate && totalPaid < totalDue) return null;

    const productLink = await db.query(
        `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
        [serviceQuoteId]
    );
    if (productLink.rows.length > 0) {
        await mergeProductQuoteIntoData(data, productLink.rows[0].quote_id);
    }

    const reuseCode = regenerate && row.invoice_code;
    const invoice_code = reuseCode
        ? row.invoice_code
        : (await db.query(`SELECT 'INV-' || LPAD(nextval('invoice_code_seq')::text, 6, '0') AS code`)).rows[0].code;

    data.document_label = 'Invoice';
    data.document_number = invoice_code;

    const html = estimateTemplate(await withTermsUrl(data));
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
    const pdfKey = `invoices/Invoice_${invoice_code}_${Date.now()}.pdf`;
    const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

    await db.query(
        reuseCode
            ? `UPDATE quotations SET invoice_code = $1, invoice_pdf_url = $2 WHERE quote_id = $3`
            : `UPDATE quotations SET invoice_code = $1, invoice_pdf_url = $2, invoice_generated_at = NOW() WHERE quote_id = $3`,
        [invoice_code, pdfUrl, serviceQuoteId]
    );

    return {
        invoice_code,
        invoice_pdf_url: pdfUrl,
        total_amount: parseFloat(data.total_amount) || 0,
        payer_name: data.payer_name,
        payer_mobile: data.payer_mobile,
    };
}
exports.ensureCombinedInvoice = ensureCombinedInvoice;

// Renders a quotation's PDF to a buffer without any of the side effects of
// generatePdfOnly/generateAndSendPDF (no S3 upload, no service_request status
// change) — used by the client portal to view/download a quote read-only.
exports.renderQuotePdfBuffer = async (quote_id) => {
    const typeRes = await db.query('SELECT quote_type FROM quotations WHERE quote_id = $1', [quote_id]);
    if (typeRes.rows.length === 0) return null;
    let data;
    if (typeRes.rows[0].quote_type === 'PRODUCT') {
        data = await buildProductQuotePdfData(quote_id);
    } else {
        const result = await db.query(
            `SELECT q.*, s.payer_name, s.payer_mobile, COALESCE((SELECT NULLIF(CONCAT_WS(' ', NULLIF(pph.honorific, ''), pph.full_name), '') FROM patient_profiles pph WHERE pph.patient_id = s.patient_id), s.patient_name) AS patient_name, s.service_type, cp.honorific AS client_honorific,
                COALESCE(json_agg(
                    json_build_object(
                        'line_item_id', li.line_item_id, 'item_type', li.item_type,
                        'description', li.description, 'quantity', li.quantity,
                        'unit_price', li.unit_price, 'amount', li.amount, 'sort_order', li.sort_order
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') AS line_items
             FROM quotations q
             JOIN service_requests s ON q.request_id = s.request_id
             LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
             WHERE q.quote_id = $1
             GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.patient_id, s.service_type, cp.honorific`,
            [quote_id]
        );
        data = result.rows[0];
    }
    if (!data) return null;
    const buffer = await html_to_pdf.generatePdf({ content: estimateTemplate(await withTermsUrl(data)) }, { format: 'A4' });
    return { buffer, estimate_number: data.estimate_number };
};
exports.ensureRegFeeInvoiceRecord = ensureRegFeeInvoiceRecord;

// POST /api/quotes/:quote_id/generate-combined-invoice — manual "just build (or
// return the cached) combined invoice" action, without the WhatsApp-send side
// effect that sendCombinedInvoice bundles in. Returns null (still 200, with
// generated: false) if the quote isn't fully paid yet — ensureCombinedInvoice's
// own guard, unchanged.
exports.generateCombinedInvoice = async (req, res) => {
    const { quote_id } = req.params;
    try {
        const invoice = await ensureCombinedInvoice(quote_id, { allowUnpaid: true });
        if (!invoice) {
            return res.status(200).json({
                status: 'success',
                generated: false,
                message: 'Combined invoice could not be generated for this quotation.',
            });
        }
        res.status(200).json({ status: 'success', generated: true, data: invoice });
    } catch (error) {
        console.error('Error generating combined invoice:', error);
        res.status(500).json({ status: 'error', message: 'Failed to generate combined invoice.' });
    }
};

// GET /api/quotes/invoices/list — every SERVICE quote that has had a
// combined Invoice generated (see ensureCombinedInvoice), for the admin
// "Combined Invoices" view. Each row carries amount_paid / balance / payment_status
// (PAID | PARTIAL | PENDING) because the invoice can be generated before full payment. Recomputes each row's total the same way the
// cached branch of ensureCombinedInvoice does, so a linked PRODUCT quote's
// items are reflected even though quotations.total_amount itself only ever
// holds the SERVICE quote's own amount.
exports.listCombinedInvoices = async (req, res) => {
    const { client_id } = req.query;
    try {
        const params = [];
        let where = `WHERE q.invoice_code IS NOT NULL AND q.invoice_pdf_url IS NOT NULL`;
        if (client_id) {
            params.push(client_id);
            where += ` AND s.client_id = $${params.length}`;
        }
        const result = await db.query(`
            SELECT q.quote_id, q.estimate_number, q.total_amount, q.invoice_code,
                   q.invoice_pdf_url, q.invoice_generated_at,
                   q.original_amount, q.edited_at, q.edited_by_name, q.edit_reason, q.edit_count,
                   s.payer_name, s.payer_mobile,
                   CASE WHEN cp.display_name_source = 'COMPANY_NAME' AND NULLIF(cp.company_name, '') IS NOT NULL
                        THEN cp.company_name ELSE NULLIF(CONCAT_WS(' ', NULLIF(cp.honorific, ''), cp.full_name), '') END AS billed_to_name
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN client_profiles cp ON s.client_id = cp.client_profile_id
            ${where}
            ORDER BY q.invoice_generated_at DESC
        `, params);

        const rows = await Promise.all(result.rows.map(async (row) => {
            const productLink = await db.query(
                `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
                [row.quote_id]
            );
            let total_amount = parseFloat(row.total_amount) || 0;
            if (productLink.rows.length > 0) {
                const stub = { total_amount, sub_total: total_amount, line_items: [] };
                await mergeProductQuoteIntoData(stub, productLink.rows[0].quote_id).catch(() => {});
                total_amount = parseFloat(stub.total_amount) || total_amount;
            }

            // A combined invoice can now exist before the quotation is fully paid, so
            // report how much has actually been received: the service quote's verified
            // payments plus payments applied to the linked product quote's invoices.
            const servicePaidRes = await db.query(
                `SELECT COALESCE(SUM(amount_received), 0) AS paid FROM payment_tracking WHERE quote_id = $1 AND status = 'VERIFIED'`,
                [row.quote_id]
            );
            let amount_paid = parseFloat(servicePaidRes.rows[0].paid) || 0;
            if (productLink.rows.length > 0) {
                const productPaidRes = await db.query(
                    `SELECT COALESCE(SUM(ip.amount), 0) AS paid
                     FROM invoice_payments ip JOIN invoices i ON ip.invoice_id = i.invoice_id
                     WHERE i.quote_id = $1`,
                    [productLink.rows[0].quote_id]
                );
                amount_paid += parseFloat(productPaidRes.rows[0].paid) || 0;
            }
            const balance = Math.max(Math.round((total_amount - amount_paid) * 100) / 100, 0);
            const payment_status = balance <= 0.01 ? 'PAID' : amount_paid > 0.01 ? 'PARTIAL' : 'PENDING';
            // original_amount is the service quote's own pre-edit total; add the
            // linked product part so it compares like-for-like with total_amount.
            const original_amount = row.original_amount == null ? null
                : Math.round((parseFloat(row.original_amount) + (total_amount - (parseFloat(row.total_amount) || 0))) * 100) / 100;
            return { ...row, total_amount, amount_paid, balance, payment_status, original_amount };
        }));

        res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
        console.error('List Combined Invoices Error:', error);
        res.status(500).json({ message: 'Failed to fetch combined invoices' });
    }
};

// POST /api/quotes/:quote_id/send-invoice — (re)send the combined Invoice
// PDF to the client/payer via WhatsApp, independent of the payment-receipt
// flow (receiptController.sendReceiptWhatsApp sends it automatically
// alongside a receipt; this lets an admin resend it on demand, e.g. from
// the admin Invoices page). Generates the invoice first if it doesn't
// exist yet — ensureCombinedInvoice is idempotent either way.
exports.sendCombinedInvoice = async (req, res) => {
    const { quote_id } = req.params;
    try {
        const invoice = await ensureCombinedInvoice(quote_id);
        if (!invoice) {
            const quoteCheck = await db.query(`SELECT quote_id FROM quotations WHERE quote_id = $1`, [quote_id]);
            if (quoteCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Quote not found' });
            }
            return res.status(400).json({ message: 'This quotation is not fully paid yet — the combined Invoice is only generated once it is.' });
        }
        if (!invoice.payer_mobile) {
            return res.status(400).json({ message: 'No mobile number on file for this quote\'s payer' });
        }

        try {
            await sendClientInvoice(invoice.payer_mobile, invoice.payer_name, invoice.invoice_code, invoice.total_amount, invoice.invoice_pdf_url);
        } catch (sendErr) {
            console.error('Send Combined Invoice WhatsApp Error:', sendErr.message);
            return res.status(502).json({ message: 'WhatsApp send failed — the "vcare_client_invoice" template may not be approved yet' });
        }

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'INVOICE_SENT',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: { invoice_code: invoice.invoice_code, payer_mobile: invoice.payer_mobile },
        });

        res.status(200).json({ status: 'success', data: invoice });
    } catch (error) {
        console.error('Send Combined Invoice Error:', error);
        res.status(500).json({ message: error.message || 'Failed to send invoice' });
    }
};

// POST /api/quotes/product/:quote_id/generate-pdf — PDF only, no WhatsApp send
exports.generateProductQuotePdf = async (req, res) => {
    const { quote_id } = req.params;
    try {
        const data = await buildProductQuotePdfData(quote_id);
        if (!data) {
            return res.status(404).json({ message: 'Product quote not found' });
        }
        const html = estimateTemplate(await withTermsUrl(data));
        const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
        const pdfKey = `estimates/Estimate_${data.estimate_number}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');
        res.status(200).json({ status: 'success', pdf_url: pdfUrl });
    } catch (error) {
        console.error('generateProductQuotePdf error:', error);
        res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    }
};

// POST /api/quotes/product/:quote_id/send — generate PDF, upload, WhatsApp it to the client/walk-in
exports.sendProductQuotePDF = async (req, res) => {
    const { quote_id } = req.params;

    try {
        const data = await buildProductQuotePdfData(quote_id);
        if (!data) {
            return res.status(404).json({ message: 'Product quote not found' });
        }
        if (!data.payer_mobile) {
            return res.status(400).json({ message: 'No mobile number on file for this recipient — cannot send via WhatsApp' });
        }

        const html = estimateTemplate(await withTermsUrl(data));
        const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
        const pdfKey = `estimates/Estimate_${data.estimate_number}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

        await sendClientProductQuotation(data.payer_mobile, data.payer_name, data.estimate_number, pdfUrl);

        await db.query(`UPDATE quotations SET status = 'SENT' WHERE quote_id = $1`, [quote_id]);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorName: await getActorName(req.user?.user_id).catch(() => 'Admin'),
            actorRole: extractActorRole(req.user?.role),
            actionType: 'PRODUCT_QUOTATION_SENT',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: { quote_id, estimate_number: data.estimate_number, payer_mobile: data.payer_mobile, pdf_url: pdfUrl },
        });

        res.status(200).json({ status: 'success', message: 'Quotation sent via WhatsApp', pdf_link: pdfUrl });
    } catch (error) {
        console.error('sendProductQuotePDF error:', error);
        res.status(500).json({ message: 'Failed to send quotation', error: error.message });
    }
};

// ==================== ACCEPT PRODUCT QUOTE ====================
// POST /api/quotes/product/:quote_id/accept
// The single "accept" action for any PRODUCT quote, regardless of what's on
// it. A quote can freely mix several rental items (each with its own billing
// terms) and ordinary one-off purchases in one go:
//   - Each line item referencing a RENTAL product gets its own real
//     rental_agreement + first invoice (via the shared createRentalAgreementCore,
//     same helper the direct "New Rental Agreement" endpoint uses).
//   - Everything else (non-rental line items) is combined into a single
//     generic PRODUCT invoice for their total, same as the old
//     invoiceController.createInvoiceFromQuote behaviour.
// All-or-nothing: if any rental item can't be fulfilled (e.g. no available
// unit), the whole acceptance rolls back — nothing is partially created.
class AcceptQuoteError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ─── How a product quotation is billed ───────────────────────────────────────
// Every product line (and every standalone refundable deposit) gets its OWN invoice, with its own
// charge on the client's ledger. A rental line is billed by its rental agreement instead. A line
// can be invoiced on its own at any time (the per-line buttons on the quotation payment form), or
// all together by accepting the quotation; either way the same function bills it, so the invoice,
// ledger charge, booking tie and vendor bill are always the same.
//
// Older quotations were billed with ONE invoice for all their non-rental lines (invoices.line_item_id
// is NULL). Those still count as billing every such line.

// Lines still waiting for an invoice (or, for rentals, an agreement): see services/productBilling.js.
const UNBILLED_LINES_SQL = unbilledLinesSql('$1');

async function unbilledLineIds(executor, quoteId) {
    return (await executor.query(UNBILLED_LINES_SQL, [quoteId])).rows.map((r) => r.line_item_id);
}

// True once nothing is left to bill on a product quotation (and something has been billed).
async function isProductQuoteAccepted(executor, quoteId) {
    const billed = await executor.query(
        `SELECT 1 FROM invoices WHERE quote_id = $1 AND category <> 'LINE_ITEM'
         UNION ALL SELECT 1 FROM rental_agreements WHERE quote_id = $1 LIMIT 1`,
        [quoteId]
    );
    if (billed.rows.length === 0) return false;
    return (await unbilledLineIds(executor, quoteId)).length === 0;
}

// Bills one non-rental product line: its own invoice, its ledger charge, and (for a vendor-sourced
// product) what is owed to the vendor. A document-only invoice already raised for the line is
// converted in place, keeping its invoice number and any payment on it, instead of billing twice.
// Returns { invoice, vendorBill, created } or null when the line is already billed.
async function billProductLine(pgClient, { quote, line, vendorDecision = {}, actorUserId = null, dueDate = null }) {
    const existing = (await pgClient.query(`SELECT * FROM invoices WHERE line_item_id = $1 FOR UPDATE`, [line.line_item_id])).rows[0];
    if (existing && existing.category !== 'LINE_ITEM') return null;

    let invoice;
    if (existing) {
        invoice = (await pgClient.query(
            `UPDATE invoices SET category = 'PRODUCT', client_id = COALESCE(client_id, $2), walk_in_customer_id = COALESCE(walk_in_customer_id, $3),
                    due_date = COALESCE(due_date, $4), pdf_url = NULL
             WHERE invoice_id = $1 RETURNING *`,
            [existing.invoice_id, quote.client_id, quote.walk_in_customer_id, dueDate]
        )).rows[0];
    } else {
        invoice = (await pgClient.query(
            `INSERT INTO invoices (category, client_id, walk_in_customer_id, quote_id, line_item_id, amount, due_date, created_by)
             VALUES ('PRODUCT', $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [quote.client_id, quote.walk_in_customer_id, quote.quote_id, line.line_item_id, line.amount, dueDate, actorUserId]
        )).rows[0];
    }
    // Puts the invoice on the client's ledger (Total Invoiced, statements).
    await ensureInvoiceCharge(pgClient, invoice.invoice_id);

    // Stock goes down when a physical item is invoiced (and comes back if the invoice is cancelled).
    // Selling more than is in stock is allowed: the stock simply goes negative (a back-order to be
    // restocked). The full quantity is recorded on the line, so cancelling returns exactly that.
    // Rentals are not stock: they are tracked by their units.
    if (line.product_id) {
        const stock = (await pgClient.query(
            `SELECT p.product_type, p.system_key, p.stock_quantity, COALESCE(li.stock_deducted, 0) AS stock_deducted
             FROM products p JOIN quote_line_items li ON li.line_item_id = $2
             WHERE p.product_id = $1 FOR UPDATE OF p`,
            [line.product_id, line.line_item_id]
        )).rows[0];
        if (stock && stock.product_type === 'ITEM' && !stock.system_key && Number(stock.stock_deducted) === 0) {
            const take = Math.max(0, Math.round(parseFloat(line.quantity) || 0));
            if (take > 0) {
                await pgClient.query(`UPDATE products SET stock_quantity = stock_quantity - $2, updated_at = CURRENT_TIMESTAMP WHERE product_id = $1`, [line.product_id, take]);
                await pgClient.query(`UPDATE quote_line_items SET stock_deducted = $2 WHERE line_item_id = $1`, [line.line_item_id, take]);
            }
        }
    }

    let vendorBill = null;
    if (line.vendor_id) {
        const decision = vendorDecision || {};
        const defaultAmount = parseFloat(line.cost_price_snapshot ?? line.product_cost_price ?? 0) * parseFloat(line.quantity || 1);
        const billAmount = decision.amount !== undefined && decision.amount !== null && decision.amount !== ''
            ? parseFloat(decision.amount) : defaultAmount;
        if (billAmount && billAmount > 0) {
            vendorBill = await createVendorBillCore(pgClient, {
                vendor_id: line.vendor_id, source_type: 'PRODUCT_SALE', product_id: line.product_id,
                reference_id: quote.quote_id, amount: billAmount, description: line.description, createdBy: actorUserId,
            });
            if (decision.pay_now) {
                const vendor = (await pgClient.query('SELECT * FROM vendors WHERE vendor_id = $1', [line.vendor_id])).rows[0];
                await applyVendorBillPayment(pgClient, {
                    bill: vendorBill, vendor, amount: billAmount, payment_method: decision.payment_method,
                    bank_account_id: decision.bank_account_id, cheque_number: decision.cheque_number, cheque_date: decision.cheque_date,
                    reference_number: decision.reference_number, notes: decision.notes, actorUserId,
                });
            }
        }
    }
    return { invoice, vendorBill, created: !existing };
}

// The booking a product quotation belongs to: its own, or its service quotation's.
async function bookingOfProductQuote(pgClient, quote) {
    if (quote.booking_id) return quote.booking_id;
    if (!quote.linked_quote_id) return null;
    const sq = await pgClient.query(`SELECT booking_id FROM quotations WHERE quote_id = $1`, [quote.linked_quote_id]);
    return sq.rows[0]?.booking_id || null;
}

// Loads the lines of a product quotation with what billing needs to know about their product.
async function loadBillableLines(pgClient, quoteId) {
    return (await pgClient.query(
        `SELECT li.*, p.product_type, p.vendor_id, p.cost_price AS product_cost_price
         FROM quote_line_items li LEFT JOIN products p ON li.product_id = p.product_id
         WHERE li.quote_id = $1 ORDER BY li.sort_order`, [quoteId]
    )).rows;
}

// Accepts a PRODUCT quotation inside the caller's open transaction: rental agreements and their
// invoices, then one invoice per remaining product line, then vendor bills. Shared by the "Accept"
// endpoint and booking conversion (see attachLinkedProductsToBooking). Lines already invoiced on
// their own are left as they are. Throws AcceptQuoteError / RentalAgreementError.
//  - A companion quote built for a lead has no client yet: the lead's client account
//    is created here (as the first payment would), so its invoices bill the client.
//  - When the service quotation already has a booking, the invoices are tied to it.
async function acceptProductQuoteCore(pgClient, quote_id, { vendorPayments = {}, actorUserId = null, dueDate = null } = {}) {
        const quoteResult = await pgClient.query(
            `SELECT * FROM quotations WHERE quote_id = $1 AND quote_type = 'PRODUCT' FOR UPDATE`,
            [quote_id]
        );
        if (quoteResult.rows.length === 0) throw new AcceptQuoteError(404, 'Product quote not found');
        const quote = quoteResult.rows[0];

        if (await isProductQuoteAccepted(pgClient, quote_id)) {
            throw new AcceptQuoteError(409, 'This quote has already been accepted');
        }

        let bootstrap = null;
        if (!quote.client_id && !quote.walk_in_customer_id) {
            const serviceQuote = quote.linked_quote_id
                ? (await pgClient.query(`SELECT * FROM quotations WHERE quote_id = $1`, [quote.linked_quote_id])).rows[0]
                : null;
            if (!serviceQuote?.request_id) {
                throw new AcceptQuoteError(400, 'This product quotation has no client or walk-in customer');
            }
            bootstrap = await getOrCreateClientProfileForQuotation(pgClient, serviceQuote);
            quote.client_id = bootstrap.client_id;
            await pgClient.query(`UPDATE quotations SET client_id = $1 WHERE quote_id = $2`, [quote.client_id, quote_id]);
        }

        const lines = await loadBillableLines(pgClient, quote_id);
        if (lines.length === 0) throw new AcceptQuoteError(400, 'This quote has no line items');

        const createdAgreements = [];
        const createdVendorBills = [];
        const hasAgreement = (await pgClient.query(`SELECT 1 FROM rental_agreements WHERE quote_id = $1 LIMIT 1`, [quote_id])).rows.length > 0;
        if (!hasAgreement) {
            for (const item of lines.filter((li) => li.product_type === 'RENTAL')) {
                const { agreement, invoice, vendor_bill } = await createRentalAgreementCore(pgClient, {
                    product_id: item.product_id,
                    unit_id: item.unit_id,
                    client_id: quote.client_id,
                    walk_in_customer_id: quote.walk_in_customer_id,
                    quote_id,
                    billing_type: item.rental_billing_type,
                    rate: item.amount,
                    start_date: item.rental_start_date,
                    end_date: item.rental_end_date,
                    deposit_amount: item.deposit_amount,
                    vendor_payment: vendorPayments[item.line_item_id],
                    createdBy: actorUserId,
                });
                createdAgreements.push({ ...agreement, invoice });
                if (vendor_bill) createdVendorBills.push(vendor_bill);
            }
        }

        // One invoice per remaining non-rental line (a line already invoiced on its own is skipped).
        const invoices = [];
        for (const line of lines.filter((li) => li.product_type !== 'RENTAL' && ['PRODUCT', 'DEPOSIT'].includes(li.item_type) && parseFloat(li.amount) > 0)) {
            const billed = await billProductLine(pgClient, { quote, line, vendorDecision: vendorPayments[line.line_item_id], actorUserId, dueDate });
            if (!billed) continue;
            invoices.push(billed.invoice);
            if (billed.vendorBill) createdVendorBills.push(billed.vendorBill);
        }

        await pgClient.query(`UPDATE quotations SET status = 'ACCEPTED' WHERE quote_id = $1`, [quote_id]);

        // Already booked → the invoices belong to that booking's account.
        const bookingId = await bookingOfProductQuote(pgClient, quote);
        if (bookingId) await linkProductQuoteToBooking(pgClient, { productQuoteId: quote_id, bookingId });

        // genericInvoice is the first new invoice, kept so older callers keep working.
        return { quote, createdAgreements, invoices, genericInvoice: invoices[0] || null, createdVendorBills, bootstrap };
}

// Transport lines typed in as free-form "custom charges" (the practice that was removed) are
// invoiced nowhere. When their quotation becomes a booking they are moved onto a product
// quotation as the Transport Charges product, so they are invoiced like any product sale.
// Only transport is converted; any other custom line is left alone. The line keeps its row
// (and the payments allocated to it); a document-only "extra charge" invoice for it is deleted,
// because the product invoice replaces it. Returns the product quotes that need accepting.
const LEGACY_TRANSPORT_SQL = `item_type = 'CHARGE' AND is_registration_fee = false AND item_subtype IS NULL
    AND (description ILIKE '%trans%' OR description ILIKE '%trasport%')`;

async function convertLegacyTransportLines(pgClient, { serviceQuoteId, bookingId = null }) {
    const linesRes = await pgClient.query(
        `SELECT line_item_id, amount FROM quote_line_items WHERE quote_id = $1 AND ${LEGACY_TRANSPORT_SQL} ORDER BY sort_order`,
        [serviceQuoteId]
    );
    if (linesRes.rows.length === 0) return { converted: 0, quoteIds: [] };

    const prod = (await pgClient.query(`SELECT product_id, name, cost_price FROM products WHERE system_key = 'TRANSPORT' OR name = 'Transport Charges' ORDER BY (system_key = 'TRANSPORT') DESC NULLS LAST LIMIT 1`)).rows[0];
    if (!prod) return { converted: 0, quoteIds: [], warning: 'The "Transport Charges" product is missing, so the transport line was left as it is.' };
    // The billing client: the booking's, or (before any booking) the lead's, which may not exist yet.
    const clientId = bookingId
        ? (await pgClient.query(`SELECT client_id FROM bookings WHERE booking_id = $1`, [bookingId])).rows[0]?.client_id || null
        : (await pgClient.query(`SELECT sr.client_id FROM quotations q JOIN service_requests sr ON sr.request_id = q.request_id WHERE q.quote_id = $1`, [serviceQuoteId])).rows[0]?.client_id || null;

    // Reuse the quotation's own unaccepted product quote. If its products were already accepted,
    // the transport goes on a separate product quote so it still gets its own invoice.
    const linked = (await pgClient.query(
        `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT' AND COALESCE(status, '') <> 'REJECTED'
         ORDER BY created_at LIMIT 1`, [serviceQuoteId]
    )).rows[0];
    let targetId = linked?.quote_id || null;
    if (targetId && await isProductQuoteAccepted(pgClient, targetId)) targetId = null;
    if (!targetId) {
        const created = await pgClient.query(
            `INSERT INTO quotations (estimate_number, daily_rate, qty_days, transport_fee, sub_total, total_amount, quote_type,
                                     client_id, booking_id, linked_quote_id, terms_conditions)
             VALUES ($1, 0, 1, 0, 0, 0, 'PRODUCT', $2, $3, $4, $5) RETURNING quote_id`,
            [await generateUniqueEstimateNumber(), clientId, bookingId, linked ? null : serviceQuoteId,
                'Transport moved from a custom charge on the service quotation when the booking was created.']
        );
        targetId = created.rows[0].quote_id;
    }

    for (const line of linesRes.rows) {
        // The document-only extra-charge invoice is replaced by the product invoice.
        await pgClient.query(`DELETE FROM invoices WHERE line_item_id = $1 AND category = 'LINE_ITEM'`, [line.line_item_id]);
        await pgClient.query(
            `UPDATE quote_line_items
             SET quote_id = $2, item_type = 'PRODUCT', product_id = $3, description = $4, cost_price_snapshot = $5,
                 sort_order = (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM quote_line_items WHERE quote_id = $2)
             WHERE line_item_id = $1`,
            [line.line_item_id, targetId, prod.product_id, prod.name, prod.cost_price]
        );
    }
    await pgClient.query(
        `UPDATE quotations q SET sub_total = t.total, total_amount = t.total, updated_at = CURRENT_TIMESTAMP
         FROM (SELECT COALESCE(SUM(amount), 0) AS total FROM quote_line_items WHERE quote_id = $1) t WHERE q.quote_id = $1`,
        [targetId]
    );
    // Re-derive the service quotation's totals without the moved lines, as removing a custom charge does.
    await pgClient.query(
        `UPDATE quotations q
         SET sub_total = t.total, total_amount = t.total, transport_fee = t.transport, updated_at = CURRENT_TIMESTAMP
         FROM (
           SELECT COALESCE(SUM(amount), 0) AS total,
                  COALESCE((SELECT amount FROM quote_line_items WHERE quote_id = $1 AND LOWER(description) LIKE '%transport%'
                            ORDER BY sort_order LIMIT 1), 0) AS transport
           FROM quote_line_items WHERE quote_id = $1
         ) t WHERE q.quote_id = $1`,
        [serviceQuoteId]
    );
    return { converted: linesRes.rows.length, quoteIds: [targetId] };
}

// Booking conversion: the products on the booking's quotation (e.g. transport, the
// companion PRODUCT quotation) become invoices on the new booking, accepted here if
// the first payment didn't already do it, then paid from whatever wallet money is
// available to the booking. Runs inside the conversion's transaction. A failure to
// accept (for example a quoted rental unit is gone) never blocks the booking: it comes
// back as `warning` and the products can still be accepted from the Products page.
async function attachLinkedProductsToBooking(pgClient, { serviceQuoteId, bookingId, actorUserId = null }) {
    const result = { product_quote_id: null, accepted: false, converted_transport_lines: 0, drawn_from_wallet: 0, warning: null };

    // Old free-form transport lines first, so they join the products below.
    const legacy = await convertLegacyTransportLines(pgClient, { serviceQuoteId, bookingId });
    result.converted_transport_lines = legacy.converted;
    if (legacy.warning) result.warning = legacy.warning;

    const pqRes = await pgClient.query(
        `SELECT quote_id FROM quotations
         WHERE (linked_quote_id = $1 OR quote_id = ANY($2::uuid[])) AND quote_type = 'PRODUCT' AND COALESCE(status, '') <> 'REJECTED'
         ORDER BY created_at`,
        [serviceQuoteId, legacy.quoteIds]
    );
    const quoteIds = pqRes.rows.map((r) => r.quote_id);
    result.product_quote_id = quoteIds[0] || null;
    if (quoteIds.length === 0) return result;

    for (const productQuoteId of quoteIds) {
        // The booking's client is the billing client (a lead's account may have just been
        // created by this conversion).
        await pgClient.query(
            `UPDATE quotations q
             SET booking_id = COALESCE(q.booking_id, $1),
                 client_id = CASE WHEN q.client_id IS NULL AND q.walk_in_customer_id IS NULL THEN b.client_id ELSE q.client_id END
             FROM bookings b
             WHERE b.booking_id = $1 AND q.quote_id = $2`,
            [bookingId, productQuoteId]
        );

        if (await isProductQuoteAccepted(pgClient, productQuoteId)) {
            await linkProductQuoteToBooking(pgClient, { productQuoteId, bookingId });
            continue;
        }
        await pgClient.query('SAVEPOINT accept_linked_products');
        try {
            // Reads the booking_id set above, so its invoice is tied to the booking.
            await acceptProductQuoteCore(pgClient, productQuoteId, { actorUserId });
            await pgClient.query('RELEASE SAVEPOINT accept_linked_products');
            result.accepted = true;
        } catch (err) {
            await pgClient.query('ROLLBACK TO SAVEPOINT accept_linked_products');
            result.warning = `The quotation's products could not be invoiced automatically (${err.message}). Accept them from the Products page.`;
        }
    }

    result.drawn_from_wallet = await payBookingProductInvoicesFromWallet(pgClient, { booking_id: bookingId, verified_by: actorUserId });
    return result;
}
exports.attachLinkedProductsToBooking = attachLinkedProductsToBooking;
exports.convertLegacyTransportLines = convertLegacyTransportLines;
exports.acceptProductQuoteCore = acceptProductQuoteCore;
exports.AcceptQuoteError = AcceptQuoteError;
exports.billProductLine = billProductLine;
exports.loadBillableLines = loadBillableLines;
exports.bookingOfProductQuote = bookingOfProductQuote;
exports.unbilledLineIds = unbilledLineIds;
exports.isProductQuoteAccepted = isProductQuoteAccepted;

exports.acceptProductQuote = async (req, res) => {
    const pgClient = await db.pool.connect();
    const { quote_id } = req.params;

    try {
        await pgClient.query('BEGIN');
        const { createdAgreements, invoices, genericInvoice, createdVendorBills, bootstrap } = await acceptProductQuoteCore(pgClient, quote_id, {
            vendorPayments: (req.body || {}).vendor_payments || {},
            actorUserId: req.user?.user_id || null,
            dueDate: (req.body || {}).due_date || null,
        });
        await pgClient.query('COMMIT');

        // A lead's account was created here rather than at the payment that follows,
        // so the welcome message with their login goes out from here.
        sendClientWelcomeCredentials(bootstrap);

        await safeLog({
            actorUserId: req.user?.user_id,
            actorRole: extractActorRole(req.user?.role),
            actionType: 'PRODUCT_QUOTATION_ACCEPTED',
            entityType: 'QUOTATION',
            entityId: quote_id,
            details: {
                quote_id,
                rental_agreement_ids: createdAgreements.map(a => a.rental_agreement_id),
                generic_invoice_id: genericInvoice?.invoice_id || null,
                invoice_ids: invoices.map(i => i.invoice_id),
                vendor_bill_ids: createdVendorBills.map(b => b.vendor_bill_id),
            },
        });

        res.status(201).json({
            status: 'success',
            data: { rental_agreements: createdAgreements, invoice: genericInvoice, invoices, vendor_bills: createdVendorBills },
        });
    } catch (error) {
        await pgClient.query('ROLLBACK');
        if (error instanceof AcceptQuoteError) {
            return res.status(error.status).json({ message: error.message });
        }
        if (error instanceof RentalAgreementError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Accept Product Quote Error:', error);
        res.status(500).json({ message: 'Failed to accept quotation' });
    } finally {
        pgClient.release();
    }
};