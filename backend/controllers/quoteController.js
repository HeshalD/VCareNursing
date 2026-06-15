const db = require('../config/db');
const html_to_pdf = require('html-pdf-node');
const estimateTemplate = require('../templates/estimateTemplate');
const { sendClientQuotation } = require('../utils/metaWhatsapp');
const cloudinary = require('cloudinary').v2;
const { logActivity } = require('../utils/activityLogger');

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

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
                   s.status as request_status, s.active_quote_id
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
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
                   s.status as request_status, s.active_quote_id,
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

    try {
        // 1. Fetch Quote & Patient Data
        const result = await db.query(`
            SELECT q.*, s.payer_name, s.payer_mobile, s.patient_name, s.service_type 
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            WHERE q.quote_id = $1
        `, [quote_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Quote not found" });
        }
        const data = result.rows[0];

        // 2. Generate PDF Buffer
        const html = estimateTemplate(data);
        const file = { content: html };
        const pdfBuffer = await html_to_pdf.generatePdf(file, { format: 'A4' });

        // 3. Upload Buffer to Cloudinary
        // We use a Promise to handle the stream upload
        const uploadToCloudinary = (buffer, fileName) => {
            return new Promise((resolve, reject) => {
                // Keep .pdf in public_id so the Cloudinary URL includes the extension
                // (required for WhatsApp/Twilio to detect the MIME type correctly)
                const publicId = fileName;
                
                cloudinary.uploader.upload(
                    `data:application/pdf;base64,${buffer.toString('base64')}`,
                    {
                        resource_type: "raw",
                        public_id: publicId,
                        folder: "estimates"
                    },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
            });
        };

        const cloudinaryResponse = await uploadToCloudinary(
            pdfBuffer,
            `Estimate_${data.estimate_number}.pdf`
        );
        const pdfUrl = cloudinaryResponse.secure_url;
        
        console.log('Cloudinary Debug - Upload response:', {
            url: pdfUrl,
            resource_type: cloudinaryResponse.resource_type,
            format: cloudinaryResponse.format,
            public_id: cloudinaryResponse.public_id
        });

        // 4. Send quotation template with PDF document header via Meta WhatsApp
        await sendClientQuotation(data.payer_mobile, data.payer_name, data.estimate_number, pdfUrl);

        // 7. Update Status
        await db.query("UPDATE quotations SET status = 'SENT' WHERE quote_id = $1", [quote_id]);

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
    const { request_id, line_items, terms_conditions } = req.body;

    try {
        if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
            return res.status(400).json({ message: 'At least one line item is required' });
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
                sub_total, total_amount, terms_conditions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;

        const quoteResult = await db.query(quoteQuery, [
            estimateNumber, request_id, registration_fee, daily_rate, qty_days, transport_fee,
            sub_total, sub_total, terms_conditions || 'The initial estimated amount is non-refundable.'
        ]);

        const quote_id = quoteResult.rows[0].quote_id;

        // Insert line items
        for (const item of processedItems) {
            await db.query(`
                INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [quote_id, item.item_type, item.description, item.quantity, item.unit_price, item.amount, item.sort_order]);
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
                        'sort_order', li.sort_order
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
                ) FILTER (WHERE li.line_item_id IS NOT NULL), '[]') as line_items
            FROM quotations q
            JOIN service_requests s ON q.request_id = s.request_id
            LEFT JOIN quote_line_items li ON q.quote_id = li.quote_id
            WHERE q.quote_id = $1
            GROUP BY q.quote_id, s.payer_name, s.payer_mobile, s.patient_name, s.service_type
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
                INSERT INTO quote_line_items (quote_id, item_type, description, quantity, unit_price, amount, sort_order)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [quote_id, item.item_type, item.description, quantity, unit_price, amount, item.sort_order || i]);
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
                        'sort_order', li.sort_order
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