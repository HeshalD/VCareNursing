const db = require('../config/db');
const { generateStatementPDF } = require('../utils/statement');
const cloudinary = require('cloudinary').v2;
const { sendWhatsAppMessage } = require('../utils/whatsapp');

async function saveStatementRecord({ client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url, delivery_method, generated_by }) {
    try {
        await db.query(
            `INSERT INTO saved_statements
               (client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url, delivery_method, generated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url || null, delivery_method, generated_by || null]
        );
    } catch (err) {
        console.error('saveStatementRecord failed (non-fatal):', err.message);
    }
}

const normalizeDateRange = (req) => {
    const rawStart = req.query.start_date || req.body?.start_date;
    const rawEnd = req.query.end_date || req.body?.end_date;

    return {
        start_date: rawStart || '1970-01-01T00:00:00Z',
        end_date: rawEnd || new Date().toISOString()
    };
};

const buildStatementPayload = async (client_id, start_date, end_date) => {
    // Compute opening sums separately so balance = payments - invoices
    const openingSumsRes = await db.query(`
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS opening_payments,
            COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS opening_invoices
        FROM transactions
        WHERE client_id = $1 AND created_at < $2
    `, [client_id, start_date]);

    const openingPayments = parseFloat(openingSumsRes.rows[0].opening_payments || 0);
    const openingInvoices = parseFloat(openingSumsRes.rows[0].opening_invoices || 0);
    // Opening balance defined as payments - invoices
    const openingBalance = openingPayments - openingInvoices;
    let runningBalance = openingBalance;

    const periodTransRes = await db.query(`
        SELECT
            transaction_id,
            created_at as date,
            category,
            notes,
            transaction_type,
            amount,
            booking_id
        FROM transactions
        WHERE client_id = $1 AND created_at >= $2 AND created_at <= $3
        ORDER BY created_at ASC
    `, [client_id, start_date, end_date]);

    const transactions = periodTransRes.rows || [];
    let totalInvoiced = 0;
    let totalPaid = 0;

    const statementLines = transactions.map((t) => {
        const amt = parseFloat(t.amount || 0);
        let invoiceAmount = 0;
        let paymentAmount = 0;
        let rowType = 'UNKNOWN';

        if (t.category === 'SERVICE_INVOICE' || t.transaction_type === 'DEBIT') {
            invoiceAmount = amt;
            totalInvoiced += invoiceAmount;
            runningBalance -= invoiceAmount; // payments - invoices
            rowType = 'INVOICE';
        } else if (t.category === 'BOOKING_PAYMENT' || t.transaction_type === 'CREDIT') {
            paymentAmount = amt;
            totalPaid += paymentAmount;
            runningBalance += paymentAmount;
            rowType = 'PAYMENT';
        }

        return {
            transaction_id: t.transaction_id,
            date: t.date,
            row_type: rowType,
            transactions: t.category,
            details: t.notes,
            booking_id: t.booking_id || null,
            amount_invoiced: invoiceAmount || 0,
            amount_paid: paymentAmount || 0,
            balance: runningBalance
        };
    });

    const clientRes = await db.query(
        `SELECT cp.full_name, u.mobile_number
         FROM client_profiles cp
         JOIN users u ON cp.user_id = u.user_id
         WHERE cp.client_profile_id = $1`,
        [client_id]
    );

    if (!clientRes.rows.length) {
        throw new Error('Client not found.');
    }

    const clientRow = clientRes.rows[0];
    const currentBalance = runningBalance;

    const pdfData = {
        clientName: clientRow.full_name,
        periodStart: new Date(start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        periodEnd: new Date(end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        summary: {
            openingBalance: parseFloat(openingBalance || 0).toFixed(2),
            invoicedAmount: parseFloat(totalInvoiced || 0).toFixed(2),
            amountPaid: parseFloat(totalPaid || 0).toFixed(2),
            balance: parseFloat(currentBalance || 0).toFixed(2)
        },
        ledger: statementLines.map((line) => ({
            date: new Date(line.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            transactions: line.transactions,
            details: line.details || '',
            amount: line.amount_invoiced ? parseFloat(line.amount_invoiced).toFixed(2) : '',
            payments: line.amount_paid ? parseFloat(line.amount_paid).toFixed(2) : '',
            balance: parseFloat(line.balance).toFixed(2),
            booking_id: line.booking_id,
            transaction_id: line.transaction_id,
            row_type: line.row_type
        }))
    };

    return {
        clientName: clientRow.full_name,
        clientMobile: clientRow.mobile_number,
        openingBalance,
        totalInvoiced,
        totalPaid,
        currentBalance,
        statementLines,
        pdfData
    };
};

exports.getSavedStatements = async (req, res) => {
    const { client_id, page = 1, limit = 50 } = req.query;
    try {
        const params = [];
        const conditions = [];

        if (client_id) {
            params.push(client_id);
            conditions.push(`ss.client_id = $${params.length}`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
        const offset = (pageNum - 1) * limitNum;

        const [rows, countRes] = await Promise.all([
            db.query(
                `SELECT ss.*, cp.full_name AS client_name
                 FROM saved_statements ss
                 LEFT JOIN client_profiles cp ON cp.client_profile_id = ss.client_id
                 ${whereClause}
                 ORDER BY ss.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limitNum, offset]
            ),
            db.query(
                `SELECT COUNT(*) FROM saved_statements ss ${whereClause}`,
                params
            ),
        ]);

        return res.status(200).json({
            status: 'success',
            data: rows.rows,
            total: parseInt(countRes.rows[0].count),
        });
    } catch (error) {
        console.error('getSavedStatements error:', error);
        return res.status(500).json({ message: 'Failed to fetch saved statements.' });
    }
};

exports.getClientTransactions = async (req, res) => {
    const { client_id } = req.params;

    try {
        const clientRes = await db.query(
            `SELECT cp.full_name, u.mobile_number
             FROM client_profiles cp
             JOIN users u ON cp.user_id = u.user_id
             WHERE cp.client_profile_id = $1`,
            [client_id]
        );

        if (!clientRes.rows.length) {
            return res.status(404).json({ message: 'Client not found.' });
        }

        const transactionsRes = await db.query(
            `SELECT
                transaction_id,
                payment_tracking_id,
                booking_id,
                quote_id,
                category,
                transaction_type,
                amount,
                payment_method,
                bank_account_id,
                cheque_number,
                cheque_date,
                reference_number,
                receipt_url,
                verified_by,
                status,
                notes,
                created_at
             FROM transactions
             WHERE client_id = $1
             ORDER BY created_at DESC, transaction_id DESC`,
            [client_id]
        );

        const totalCredits = transactionsRes.rows.reduce((sum, row) => {
            return row.transaction_type === 'CREDIT' ? sum + parseFloat(row.amount || 0) : sum;
        }, 0);

        const totalDebits = transactionsRes.rows.reduce((sum, row) => {
            return row.transaction_type === 'DEBIT' ? sum + parseFloat(row.amount || 0) : sum;
        }, 0);

        return res.status(200).json({
            status: 'success',
            client: {
                client_id,
                full_name: clientRes.rows[0].full_name,
                mobile_number: clientRes.rows[0].mobile_number
            },
            summary: {
                transaction_count: transactionsRes.rowCount,
                total_credits: totalCredits,
                total_debits: totalDebits,
                net_balance: totalCredits - totalDebits
            },
            data: transactionsRes.rows
        });
    } catch (error) {
        console.error('Client transactions fetch error:', {
            client_id,
            error_message: error.message,
            error_code: error.code
        });
        return res.status(500).json({ message: 'Failed to fetch client transactions.' });
    }
};

exports.getClientStatement = async (req, res) => {
    const { client_id } = req.params;
    const { start_date, end_date } = normalizeDateRange(req);

    try {
        const { openingBalance, totalInvoiced, totalPaid, currentBalance, statementLines } = await buildStatementPayload(client_id, start_date, end_date);

        // 4. Send formatted data to frontend or PDF generator
        res.status(200).json({
            account_summary: {
                opening_balance: openingBalance,
                invoiced_amount: totalInvoiced,
                amount_paid: totalPaid,
                balance_due: currentBalance
            },
            ledger: statementLines
        });

    } catch (error) {
        console.error("Statement generation error:", error);
        res.status(500).json({ message: "Failed to generate statement." });
    }
};

exports.downloadClientStatement = async (req, res) => {
    const { client_id } = req.params;
    const { start_date, end_date } = normalizeDateRange(req);

    // Set a timeout for the entire request
    const requestTimeout = setTimeout(() => {
        console.error("❌ Request timeout after 60 seconds");
        if (!res.headersSent) {
            res.status(408).json({ message: "Request timeout - PDF generation took too long" });
        }
    }, 60000); // 60 seconds

    try {
        console.log("🚀 Starting PDF generation for client:", client_id);
        console.time("database-queries");
        
        const { clientName, clientMobile, openingBalance, totalInvoiced, totalPaid, currentBalance, statementLines, pdfData } = await buildStatementPayload(client_id, start_date, end_date);
        console.timeEnd("database-queries");

        console.time("pdf-generation");
        console.log("📄 Starting PDF generation...");
        
        // 3. Generate the PDF
        const pdfBuffer = await generateStatementPDF(pdfData);
        
        console.timeEnd("pdf-generation");
        console.log("✅ PDF generated, size:", pdfBuffer.length, "bytes");

        // Clear the timeout since we succeeded
        clearTimeout(requestTimeout);

        console.time("response-send");
        // 4. Send it to the client as a downloadable file
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Statement_${clientName.replace(/\s+/g, '_')}.pdf"`,
            'Content-Length': pdfBuffer.length
        });

        res.status(200).send(pdfBuffer);
        console.timeEnd("response-send");
        console.log("🎉 PDF sent successfully!");

        saveStatementRecord({
            client_id,
            period_start: start_date,
            period_end: end_date,
            opening_balance: openingBalance,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            balance_due: currentBalance,
            pdf_url: null,
            delivery_method: 'DOWNLOAD',
            generated_by: req.user?.user_id || null,
        });

    } catch (error) {
        clearTimeout(requestTimeout);
        console.error("❌ PDF Generation Error:", error);
        
        if (!res.headersSent) {
            if (error.message === 'PDF generation timeout') {
                res.status(408).json({ message: "PDF generation timed out. Please try again." });
            } else {
                res.status(500).json({ message: "Failed to generate statement PDF." });
            }
        }
    }
};

exports.sendClientStatementToWhatsApp = async (req, res) => {
    const { client_id } = req.params;
    const { start_date, end_date } = normalizeDateRange(req);

    try {
        const { clientName, clientMobile, openingBalance, totalInvoiced, totalPaid, currentBalance, pdfData } = await buildStatementPayload(client_id, start_date, end_date);

        const pdfBuffer = await generateStatementPDF(pdfData);
        const pdfUpload = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload(
                `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
                {
                    resource_type: 'raw',
                    folder: 'statements',
                    public_id: `Statement_${client_id}_${Date.now()}`
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
        });

        const message = await sendWhatsAppMessage(
            clientMobile,
            `Hi ${clientName}, your statement for ${pdfData.periodStart} to ${pdfData.periodEnd} is attached.`,
            {
                type: 'document',
                link: pdfUpload.secure_url,
                filename: `Statement_${clientName.replace(/\s+/g, '_')}.pdf`
            }
        );

        saveStatementRecord({
            client_id,
            period_start: start_date,
            period_end: end_date,
            opening_balance: openingBalance,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            balance_due: currentBalance,
            pdf_url: pdfUpload.secure_url,
            delivery_method: 'WHATSAPP',
            generated_by: req.user?.user_id || null,
        });

        return res.status(200).json({
            status: 'success',
            message: 'Statement generated and sent via WhatsApp',
            data: {
                pdf_link: pdfUpload.secure_url,
                whatsapp_message_sid: message.sid
            }
        });
    } catch (error) {
        console.error('Error sending statement via WhatsApp:', error);
        return res.status(500).json({ message: 'Failed to send statement via WhatsApp' });
    }
};