const db = require('../config/db');
const html_to_pdf = require('html-pdf-node');
const estimateTemplate = require('../templates/estimateTemplate');
const { sendWhatsAppMessage, checkMessageStatus } = require('../utils/whatsapp');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.createQuotation = async (req, res) => {
    const { request_id, daily_rate, qty_days, transport_fee } = req.body;

    try {
        // 1. Setup constants based on Sample Estimate 
        const regFee = 10000.00;
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
                // Remove .pdf extension from fileName for public_id
                const publicId = fileName.replace('.pdf', '');
                
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

        // 4. Send WhatsApp Document
        // NOTE: Ensure your sendWhatsAppOtp utility is updated to accept document objects
        const whatsappMsg = `Hi ${data.payer_name}, please find the official estimate for ${data.patient_name} attached below.`;

        const messageResponse = await sendWhatsAppMessage(data.payer_mobile, whatsappMsg, {
            type: "document",
            link: pdfUrl, // The Cloudinary URL
            filename: `${data.estimate_number}.pdf`
        });
        const messageSid = messageResponse.sid;

        // 4.5. Check message status after a short delay
        setTimeout(async () => {
            try {
                const messageStatus = await checkMessageStatus(messageSid);
                console.log('WhatsApp Debug - Final message status:', messageStatus);
            } catch (error) {
                console.log('WhatsApp Debug - Could not check final status:', error.message);
            }
        }, 5000); // Check after 5 seconds

        // 5. Update Status
        await db.query("UPDATE quotations SET status = 'SENT' WHERE quote_id = $1", [quote_id]);
        
        // 6. Update service request status to PENDING and set active_quote_id
        await db.query("UPDATE service_requests SET status = 'PENDING', active_quote_id = $1 WHERE request_id = $2", [quote_id, data.request_id]);

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