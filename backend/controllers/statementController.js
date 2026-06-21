const db = require('../config/db');
const { generateStatementPDF } = require('../utils/statement');
const { uploadBufferToS3 } = require('../config/s3Config');
const { sendClientBookingStatement } = require('../utils/metaWhatsapp');
const { logActivity } = require('../utils/activityLogger');

async function getActorName(userId) {
    const result = await db.query('SELECT full_name FROM staff_profiles WHERE user_id = $1', [userId]);
    return result.rows[0]?.full_name || 'Admin';
}

async function saveStatementRecord({ client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url, delivery_method, generated_by, statement_source }) {
    try {
        await db.query(
            `INSERT INTO saved_statements
               (client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url, delivery_method, generated_by, statement_source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [client_id, period_start, period_end, opening_balance, total_invoiced, total_paid, balance_due, pdf_url || null, delivery_method, generated_by || null, statement_source || 'BOOKING']
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
            balanceDue: parseFloat(currentBalance || 0).toFixed(2)
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

exports.deleteStatement = async (req, res) => {
    const { statement_id } = req.params;
    try {
        const infoRes = await db.query(
            `SELECT ss.client_id, ss.statement_source, cp.full_name AS client_name
             FROM saved_statements ss
             LEFT JOIN client_profiles cp ON cp.client_profile_id = ss.client_id
             WHERE ss.statement_id = $1`,
            [statement_id]
        );
        if (!infoRes.rows.length) {
            return res.status(404).json({ message: 'Statement not found.' });
        }
        const info = infoRes.rows[0];

        await db.query('DELETE FROM saved_statements WHERE statement_id = $1', [statement_id]);

        res.status(200).json({ status: 'success', message: 'Statement deleted.' });

        getActorName(req.user?.user_id).then(actorName => logActivity({
            actorUserId: req.user?.user_id,
            actorName,
            actorRole: Array.isArray(req.user?.role) ? req.user.role[0] : String(req.user?.role),
            actionType: 'STATEMENT_DELETED',
            entityType: 'STATEMENT',
            entityId: String(statement_id),
            details: { client_id: info.client_id, client_name: info.client_name, statement_source: info.statement_source || 'BOOKING' },
        })).catch(err => console.error('Activity log failed (deleteStatement):', err.message));
    } catch (error) {
        console.error('deleteStatement error:', error);
        return res.status(500).json({ message: 'Failed to delete statement.' });
    }
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
            statement_source: req.body?.statement_source || 'BOOKING',
        });

        const actionType = req.body?.action_intent === 'generate' ? 'STATEMENT_GENERATED' : 'STATEMENT_DOWNLOADED';
        getActorName(req.user?.user_id).then(actorName => logActivity({
            actorUserId: req.user?.user_id,
            actorName,
            actorRole: Array.isArray(req.user?.role) ? req.user.role[0] : String(req.user?.role),
            actionType,
            entityType: 'CLIENT',
            entityId: String(client_id),
            details: { period_start: start_date, period_end: end_date, client_name: clientName, statement_source: req.body?.statement_source || 'BOOKING' },
        })).catch(err => console.error('Activity log failed (downloadClientStatement):', err.message));

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

exports.resendStatementFromHistory = async (req, res) => {
    const { statement_id } = req.params;

    try {
        const stmtRes = await db.query(
            `SELECT ss.*, cp.full_name AS client_name, u.mobile_number AS client_mobile
             FROM saved_statements ss
             JOIN client_profiles cp ON cp.client_profile_id = ss.client_id
             JOIN users u ON u.user_id = cp.user_id
             WHERE ss.statement_id = $1`,
            [statement_id]
        );

        if (!stmtRes.rows.length) {
            return res.status(404).json({ message: 'Statement record not found.' });
        }

        const stmt = stmtRes.rows[0];

        // Best-effort: find most recent booking for this client to get context for the template
        const bookingRes = await db.query(
            `SELECT b.booking_code, p.full_name AS patient_name
             FROM bookings b
             LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
             WHERE b.client_id = $1
             ORDER BY b.start_date DESC
             LIMIT 1`,
            [stmt.client_id]
        );
        const bookingCode = bookingRes.rows[0]?.booking_code || 'N/A';
        const patientName = bookingRes.rows[0]?.patient_name || 'N/A';

        let pdfUrl = stmt.pdf_url;

        // If this was a download-only record (no stored PDF), generate and upload now
        if (!pdfUrl) {
            const payload = await buildStatementPayload(stmt.client_id, stmt.period_start, stmt.period_end);
            const pdfBuffer = await generateStatementPDF(payload.pdfData);
            const pdfKey = `statements/Statement_${stmt.client_id}_${Date.now()}.pdf`;
            pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');
            await db.query('UPDATE saved_statements SET pdf_url = $1 WHERE statement_id = $2', [pdfUrl, statement_id]);
        }

        const fmtAmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const periodStart = new Date(stmt.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const periodEnd = new Date(stmt.period_end).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const filename = `Statement_${bookingCode}_${stmt.client_name.replace(/\s+/g, '_')}.pdf`;

        await sendClientBookingStatement(
            stmt.client_mobile,
            stmt.client_name,
            periodStart,
            periodEnd,
            bookingCode,
            patientName,
            fmtAmt(stmt.total_invoiced),
            fmtAmt(stmt.total_paid),
            fmtAmt(stmt.balance_due),
            pdfUrl,
            filename
        );

        getActorName(req.user?.user_id).then(actorName => logActivity({
            actorUserId: req.user?.user_id,
            actorName,
            actorRole: Array.isArray(req.user?.role) ? req.user.role[0] : String(req.user?.role),
            actionType: 'STATEMENT_SENT_WHATSAPP',
            entityType: 'CLIENT',
            entityId: String(stmt.client_id),
            details: { period_start: stmt.period_start, period_end: stmt.period_end, client_name: stmt.client_name, statement_id, booking_code: bookingCode },
        })).catch(err => console.error('Activity log failed (resendStatementFromHistory):', err.message));

        return res.status(200).json({ status: 'success', message: 'Statement sent via WhatsApp', data: { pdf_link: pdfUrl } });
    } catch (error) {
        console.error('Error resending statement via WhatsApp:', error);
        return res.status(500).json({ message: 'Failed to resend statement via WhatsApp' });
    }
};

exports.sendClientStatementToWhatsApp = async (req, res) => {
    const { client_id } = req.params;
    const { start_date, end_date } = normalizeDateRange(req);
    const booking_id = req.body?.booking_id || null;

    try {
        const { clientName, clientMobile, openingBalance, totalInvoiced, totalPaid, currentBalance, pdfData } = await buildStatementPayload(client_id, start_date, end_date);

        // Fetch booking context for the template
        let bookingCode = 'N/A';
        let patientName = 'N/A';
        if (booking_id) {
            const bookingRes = await db.query(
                `SELECT b.booking_code, p.full_name AS patient_name
                 FROM bookings b
                 LEFT JOIN patient_profiles p ON b.patient_id = p.patient_id
                 WHERE b.booking_id = $1`,
                [booking_id]
            );
            if (bookingRes.rows.length) {
                bookingCode = bookingRes.rows[0].booking_code || 'N/A';
                patientName = bookingRes.rows[0].patient_name || 'N/A';
            }
        }

        const pdfBuffer = await generateStatementPDF(pdfData);
        const pdfKey = `statements/Statement_${client_id}_${Date.now()}.pdf`;
        const pdfUrl = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf');

        const fmtAmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const filename = `Statement_${bookingCode}_${clientName.replace(/\s+/g, '_')}.pdf`;

        await sendClientBookingStatement(
            clientMobile,
            clientName,
            pdfData.periodStart,
            pdfData.periodEnd,
            bookingCode,
            patientName,
            fmtAmt(totalInvoiced),
            fmtAmt(totalPaid),
            fmtAmt(currentBalance),
            pdfUrl,
            filename
        );

        saveStatementRecord({
            client_id,
            period_start: start_date,
            period_end: end_date,
            opening_balance: openingBalance,
            total_invoiced: totalInvoiced,
            total_paid: totalPaid,
            balance_due: currentBalance,
            pdf_url: pdfUrl,
            delivery_method: 'WHATSAPP',
            generated_by: req.user?.user_id || null,
            statement_source: req.body?.statement_source || 'BOOKING',
        });

        getActorName(req.user?.user_id).then(actorName => logActivity({
            actorUserId: req.user?.user_id,
            actorName,
            actorRole: Array.isArray(req.user?.role) ? req.user.role[0] : String(req.user?.role),
            actionType: 'STATEMENT_SENT_WHATSAPP',
            entityType: 'CLIENT',
            entityId: String(client_id),
            details: { period_start: start_date, period_end: end_date, client_name: clientName, booking_id, booking_code: bookingCode },
        })).catch(err => console.error('Activity log failed (sendClientStatementToWhatsApp):', err.message));

        return res.status(200).json({
            status: 'success',
            message: 'Statement generated and sent via WhatsApp',
            data: { pdf_link: pdfUrl }
        });
    } catch (error) {
        console.error('Error sending statement via WhatsApp:', error);
        return res.status(500).json({ message: 'Failed to send statement via WhatsApp' });
    }
};