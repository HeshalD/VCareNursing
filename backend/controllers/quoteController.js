const db = require('../config/db');
const html_to_pdf = require('html-pdf-node');
const estimateTemplate = require('../templates/estimateTemplate');
const { sendClientQuotation, sendClientProductQuotation, sendClientInvoice } = require('../utils/metaWhatsapp');
const { uploadBufferToS3 } = require('../config/s3Config');
const { logActivity } = require('../utils/activityLogger');
const { createRentalAgreementCore, RentalAgreementError } = require('./rentalController');

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
    const { request_id, daily_rate, qty_days, transport_fee, registration_fee } = req.body;

    try {
        // 1. Setup constants based on Sample Estimate 
        const regFee = (registration_fee !== undefined && registration_fee !== '' && registration_fee !== null) ? parseFloat(registration_fee) : 0;
        const days = qty_days || 7;
        const transport = transport_fee || 1000.00; // Based on sample 

        // 2. Calculate Totals 
        const item2Amount = daily_rate * days;
        const subTotal = regFee + item2Amount + transport;

        // Generate a unique estimate number (e.g., EST-1001)
        const estimateNumber = `EST-${Math.floor(1000 + Math.random() * 9000)}`;

        // 3. Insert into Database
        const query = `
            INSERT INTO quotations (
                estimate_number, request_id, registration_fee, 
                daily_rate, qty_days, transport_fee, 
                sub_total, total_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;

        const result = await db.query(query, [
            estimateNumber, request_id, regFee,
            daily_rate, days, transport,
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
            SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
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
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
                   s.status as request_status, s.active_quote_id, s.client_id as request_client_id,
                   pq.quote_id as product_quote_id,
                   COALESCE((
                       SELECT SUM(amount_received)
                       FROM payment_tracking pt
                       WHERE pt.quote_id = q.quote_id AND pt.status = 'VERIFIED'
                   ), 0) as total_paid,
                   COALESCE((
                       SELECT COUNT(*)
                       FROM payment_tracking pt
                       WHERE pt.quote_id = q.quote_id
                   ), 0) as payment_count
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
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
                   sr.patient_name, 
                   sr.service_type,
                   sr.status as request_status,
                   sr.created_at as request_created_at,
                   cp.full_name as client_name,
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
            SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
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
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            WHERE q.quote_id = $1
            GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type
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
        const html = estimateTemplate(data);
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

        res.status(200).json({
            status: 'success',
            message: 'PDF Estimate generated, uploaded, and sent via WhatsApp',
            pdf_link: pdfUrl
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
            `SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
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
             LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
             WHERE q.quote_id = $1
             GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type`,
            [quote_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Quote not found' });
        }
        const data = result.rows[0];
        if (product_quote_id) {
            await mergeProductQuoteIntoData(data, product_quote_id);
        }
        const html = estimateTemplate(data);
        const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
        const pdfKey = `estimates/Estimate_${data.estimate_number}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');
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

exports.createModularQuotation = async (req, res) => {
    const {
        request_id, line_items, terms_conditions, quote_type, client_id, walk_in_customer_id, linked_quote_id,
    } = req.body;
    const isProductQuote = quote_type === 'PRODUCT';

    try {
        if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
            return res.status(400).json({ message: 'At least one line item is required' });
        }

        if (isProductQuote) {
            if (!client_id && !walk_in_customer_id) {
                return res.status(400).json({ message: 'A PRODUCT quote requires either client_id or walk_in_customer_id' });
            }
        } else if (!request_id) {
            return res.status(400).json({ message: 'request_id is required for SERVICE quotes' });
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
                sort_order: item.sort_order !== undefined ? item.sort_order : index
            };
        });

        // Generate estimate number
        const estimateNumber = `EST-${Math.floor(1000 + Math.random() * 9000)}`;

        // Extract legacy values for backwards compatibility
        const registration_fee = processedItems.find(i =>
            i.description.toLowerCase().includes('registration')
        )?.amount || 0;

        const dailyRateItem = processedItems.find(i =>
            i.description.toLowerCase().includes('daily') || i.description.toLowerCase().includes('care rate')
        );
        const daily_rate = dailyRateItem?.unit_price || 0;
        const qty_days = dailyRateItem?.quantity || 1;

        const transport_fee = processedItems.find(i =>
            i.description.toLowerCase().includes('transport')
        )?.amount || 0;

        // Insert quotation
        const quoteQuery = `
            INSERT INTO quotations (
                estimate_number, request_id, registration_fee, daily_rate, qty_days, transport_fee,
                sub_total, total_amount, terms_conditions, quote_type, client_id, walk_in_customer_id, linked_quote_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *;
        `;

        const quoteResult = await db.query(quoteQuery, [
            estimateNumber, isProductQuote ? null : request_id, registration_fee, daily_rate, qty_days, transport_fee,
            sub_total, sub_total, terms_conditions || 'The initial estimated amount is non-refundable.',
            isProductQuote ? 'PRODUCT' : 'SERVICE',
            isProductQuote ? (client_id || null) : null,
            isProductQuote ? (walk_in_customer_id || null) : null,
            isProductQuote ? (linked_quote_id || null) : null,
        ]);

        const quote_id = quoteResult.rows[0].quote_id;

        // Insert line items — rental terms only apply to (and are only stored
        // for) items referencing a RENTAL product; harmless nulls otherwise.
        for (const item of processedItems) {
            await db.query(`
                INSERT INTO quote_line_items (
                    quote_id, item_type, description, quantity, unit_price, amount, sort_order, product_id,
                    rental_billing_type, rental_start_date, rental_end_date, deposit_amount, unit_id,
                    is_registration_fee, salesperson_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, [
                quote_id, item.item_type, item.description, item.quantity, item.unit_price, item.amount, item.sort_order, item.product_id || null,
                item.rental_billing_type || null,
                item.rental_start_date || null,
                item.rental_billing_type === 'ONE_TIME' ? (item.rental_end_date || null) : null,
                parseFloat(item.deposit_amount) || 0,
                item.unit_id || null,
                !!item.is_registration_fee,
                item.salesperson_id || null,
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
                        'unit_code', ru.unit_code
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

        res.status(201).json({
            status: 'success',
            data: completeQuote.rows[0]
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
            SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
                s.client_id as request_client_id,
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
                        'is_registration_fee', li.is_registration_fee
                    ) ORDER BY li.sort_order
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            LEFT JOIN quotations pq ON pq.linked_quote_id = q.quote_id AND pq.quote_type = 'PRODUCT'
            WHERE q.quote_id = $1
            GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type, s.client_id, pq.quote_id
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

    try {
        await db.query('BEGIN');

        // Delete existing line items
        await db.query('DELETE FROM quote_line_items WHERE quote_id = $1', [quote_id]);

        // Recalculate and insert new line items
        let sub_total = 0;
        for (let i = 0; i < line_items.length; i++) {
            const item = line_items[i];
            const quantity = parseFloat(item.quantity) || 1;
            const unit_price = parseFloat(item.unit_price) || 0;
            const amount = item.item_type === 'DISCOUNT'
                ? -(Math.abs(quantity * unit_price))
                : quantity * unit_price;

            sub_total += amount;

            await db.query(`
                INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order, is_registration_fee, salesperson_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [quote_id, item.item_type, item.description, quantity, unit_price, amount, item.sort_order || i, !!item.is_registration_fee, item.salesperson_id || null]);
        }

        // Update quotation totals
        await db.query(`
            UPDATE quotations 
            SET sub_total = $1, total_amount = $1, terms_conditions = $2, updated_at = CURRENT_TIMESTAMP
            WHERE quote_id = $3
        `, [sub_total, terms_conditions, quote_id]);

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
                        'is_registration_fee', li.is_registration_fee
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
            'SELECT product_id, name, price FROM products WHERE product_id = $1 AND is_available = true',
            [product_id]
        );
        if (productResult.rows.length === 0) {
            return res.status(404).json({ message: 'Product not found or unavailable' });
        }
        const product = productResult.rows[0];
        const qty = parseFloat(quantity) || 1;
        const amount = qty * parseFloat(product.price);

        const estimateNumber = `EST-${Math.floor(1000 + Math.random() * 9000)}`;

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
            `INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, product_id)
             VALUES ($1, 'PRODUCT', $2, $3, $4, $5, $6)`,
            [quote_id, product.name, qty, product.price, amount, product_id]
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
                   cp.full_name as client_name, u.mobile_number as client_mobile,
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
            GROUP BY q.quote_id, cp.full_name, u.mobile_number, wc.full_name, wc.mobile_number
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
                   cp.full_name as client_name, u.mobile_number as client_mobile,
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
                   ), 0) as total_deposit_amount
            FROM quotations q
            LEFT JOIN client_profiles cp ON q.client_id = cp.client_profile_id
            LEFT JOIN users u ON cp.user_id = u.user_id
            LEFT JOIN walk_in_customers wc ON q.walk_in_customer_id = wc.walk_in_customer_id
            LEFT JOIN quotations sq ON sq.quote_id = q.linked_quote_id
            WHERE ${conditions.join(' AND ')}
            ORDER BY q.created_at DESC
        `, params);

        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error('List Product Quotes Error:', error);
        res.status(500).json({ message: 'Failed to fetch product quotes' });
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
               cp.full_name as client_name, u.mobile_number as client_mobile,
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
        GROUP BY q.quote_id, cp.full_name, u.mobile_number, wc.full_name, wc.mobile_number
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
async function ensureCombinedInvoice(serviceQuoteId) {
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

    if (row.invoice_code && row.invoice_pdf_url) {
        // Total may include a linked product quote's items — recompute for
        // the return value without touching the already-generated PDF.
        const productLink = await db.query(
            `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
            [serviceQuoteId]
        );
        let totalAmount = parseFloat(row.total_amount) || 0;
        if (productLink.rows.length > 0) {
            const stub = { total_amount: totalAmount };
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
        SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type,
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
        LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
        WHERE q.quote_id = $1
        GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type
    `, [serviceQuoteId]);
    if (result.rows.length === 0) return null;
    const data = result.rows[0];

    const productLink = await db.query(
        `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
        [serviceQuoteId]
    );
    if (productLink.rows.length > 0) {
        await mergeProductQuoteIntoData(data, productLink.rows[0].quote_id);
    }

    const codeResult = await db.query(
        `SELECT 'INV-' || LPAD(nextval('invoice_code_seq')::text, 6, '0') AS code`
    );
    const invoice_code = codeResult.rows[0].code;

    data.document_label = 'Invoice';
    data.document_number = invoice_code;

    const html = estimateTemplate(data);
    const pdfBuffer = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });
    const pdfKey = `invoices/Invoice_${invoice_code}_${Date.now()}.pdf`;
    const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

    await db.query(
        `UPDATE quotations SET invoice_code = $1, invoice_pdf_url = $2, invoice_generated_at = NOW() WHERE quote_id = $3`,
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

// GET /api/quotes/invoices/list — every SERVICE quote that has had a
// combined Invoice generated (see ensureCombinedInvoice), for the admin
// "Combined Invoices" view. Recomputes each row's total the same way the
// cached branch of ensureCombinedInvoice does, so a linked PRODUCT quote's
// items are reflected even though quotations.total_amount itself only ever
// holds the SERVICE quote's own amount.
exports.listCombinedInvoices = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT q.quote_id, q.estimate_number, q.total_amount, q.invoice_code,
                   q.invoice_pdf_url, q.invoice_generated_at,
                   s.payer_name, s.payer_mobile
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            WHERE q.invoice_code IS NOT NULL AND q.invoice_pdf_url IS NOT NULL
            ORDER BY q.invoice_generated_at DESC
        `);

        const rows = await Promise.all(result.rows.map(async (row) => {
            const productLink = await db.query(
                `SELECT quote_id FROM quotations WHERE linked_quote_id = $1 AND quote_type = 'PRODUCT'`,
                [row.quote_id]
            );
            let total_amount = parseFloat(row.total_amount) || 0;
            if (productLink.rows.length > 0) {
                const stub = { total_amount };
                await mergeProductQuoteIntoData(stub, productLink.rows[0].quote_id).catch(() => {});
                total_amount = parseFloat(stub.total_amount) || total_amount;
            }
            return { ...row, total_amount };
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
            return res.status(404).json({ message: 'Quote not found' });
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
        const html = estimateTemplate(data);
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

        const html = estimateTemplate(data);
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
exports.acceptProductQuote = async (req, res) => {
    const pgClient = await db.pool.connect();
    const { quote_id } = req.params;

    try {
        await pgClient.query('BEGIN');

        const quoteResult = await pgClient.query(
            `SELECT * FROM quotations WHERE quote_id = $1 AND quote_type = 'PRODUCT' FOR UPDATE`,
            [quote_id]
        );
        if (quoteResult.rows.length === 0) {
            await pgClient.query('ROLLBACK');
            return res.status(404).json({ message: 'Product quote not found' });
        }
        const quote = quoteResult.rows[0];

        const alreadyAccepted = await pgClient.query(
            `SELECT 1 FROM invoices WHERE quote_id = $1
             UNION ALL SELECT 1 FROM rental_agreements WHERE quote_id = $1 LIMIT 1`,
            [quote_id]
        );
        if (alreadyAccepted.rows.length > 0) {
            await pgClient.query('ROLLBACK');
            return res.status(409).json({ message: 'This quote has already been accepted' });
        }

        const lineItemsResult = await pgClient.query(
            `SELECT li.*, p.product_type FROM quote_line_items li
             LEFT JOIN products p ON li.product_id = p.product_id
             WHERE li.quote_id = $1`,
            [quote_id]
        );
        if (lineItemsResult.rows.length === 0) {
            await pgClient.query('ROLLBACK');
            return res.status(400).json({ message: 'This quote has no line items' });
        }

        const rentalItems = lineItemsResult.rows.filter(li => li.product_type === 'RENTAL');
        const otherItems = lineItemsResult.rows.filter(li => li.product_type !== 'RENTAL');

        const createdAgreements = [];
        for (const item of rentalItems) {
            const { agreement, invoice } = await createRentalAgreementCore(pgClient, {
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
                createdBy: req.user?.user_id,
            });
            createdAgreements.push({ ...agreement, invoice });
        }

        let genericInvoice = null;
        const otherItemsTotal = otherItems.reduce((sum, li) => sum + parseFloat(li.amount), 0);
        if (otherItemsTotal > 0) {
            const invoiceResult = await pgClient.query(
                `INSERT INTO invoices (category, client_id, walk_in_customer_id, quote_id, amount, created_by)
                 VALUES ('PRODUCT', $1, $2, $3, $4, $5)
                 RETURNING *`,
                [quote.client_id, quote.walk_in_customer_id, quote_id, otherItemsTotal, req.user?.user_id || null]
            );
            genericInvoice = invoiceResult.rows[0];
        }

        await pgClient.query(`UPDATE quotations SET status = 'ACCEPTED' WHERE quote_id = $1`, [quote_id]);

        await pgClient.query('COMMIT');

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
            },
        });

        res.status(201).json({
            status: 'success',
            data: { rental_agreements: createdAgreements, invoice: genericInvoice },
        });
    } catch (error) {
        await pgClient.query('ROLLBACK');
        if (error instanceof RentalAgreementError) {
            return res.status(error.status).json({ message: error.message });
        }
        console.error('Accept Product Quote Error:', error);
        res.status(500).json({ message: 'Failed to accept quotation' });
    } finally {
        pgClient.release();
    }
};