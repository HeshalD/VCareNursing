const db = require('../config/db');
const { generateStatementPDF } = require('../utils/statement');

exports.getClientStatement = async (req, res) => {
    const { client_id } = req.params;
    const { start_date, end_date } = req.body; 

    try {
        // 1. Get Opening Balance (All records before start_date)
        const openingBalRes = await db.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS opening_balance
            FROM transactions
            WHERE client_id = $1 AND created_at < $2
        `, [client_id, start_date]);
        
        const openingBalance = parseFloat(openingBalRes.rows[0].opening_balance);

        // 2. Get Transactions for the period
        const periodTransRes = await db.query(`
            SELECT 
                created_at as date,
                category as transactions, -- e.g., 'Invoice' or 'Payment Received'
                notes as details,
                transaction_type,
                amount
            FROM transactions
            WHERE client_id = $1 AND created_at >= $2 AND created_at <= $3
            ORDER BY created_at ASC
        `, [client_id, start_date, end_date]);

        const transactions = periodTransRes.rows;

        // 3. Process the Running Balance (Matching the PDF exactly)
        let currentBalance = openingBalance;
        let totalInvoiced = 0;
        let totalPaid = 0;

        const statementLines = transactions.map(t => {
            let debitAmount = 0;
            let creditAmount = 0;

            if (t.transaction_type === 'DEBIT') {
                debitAmount = t.amount;
                totalInvoiced += t.amount;
                currentBalance += t.amount; // Balance goes up when invoiced
            } else {
                creditAmount = t.amount;
                totalPaid += t.amount;
                currentBalance -= t.amount; // Balance goes down when paid
            }

            return {
                date: t.date,
                transactions: t.transactions,
                details: t.details,
                amount: debitAmount > 0 ? debitAmount : null,
                payments: creditAmount > 0 ? creditAmount : null,
                balance: currentBalance
            };
        });

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
    const { start_date, end_date } = req.body;

    try {
        // 1. Get Opening Balance (All records before start_date)
        const openingBalRes = await db.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'DEBIT' THEN amount ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN transaction_type = 'CREDIT' THEN amount ELSE 0 END), 0) AS opening_balance
            FROM transactions
            WHERE client_id = $1 AND created_at < $2
        `, [client_id, start_date]);
        
        const openingBalance = parseFloat(openingBalRes.rows[0].opening_balance);

        // 2. Get Transactions for the period
        const periodTransRes = await db.query(`
            SELECT 
                created_at as date,
                category as transactions,
                notes as details,
                transaction_type,
                amount
            FROM transactions
            WHERE client_id = $1 AND created_at >= $2 AND created_at <= $3
            ORDER BY created_at ASC
        `, [client_id, start_date, end_date]);

        const transactions = periodTransRes.rows;

        // 3. Process the Running Balance
        let currentBalance = openingBalance || 0;
        let totalInvoiced = 0;
        let totalPaid = 0;

        const statementLines = (transactions || []).map(t => {
            let debitAmount = 0;
            let creditAmount = 0;

            if (t.transaction_type === 'DEBIT') {
                debitAmount = parseFloat(t.amount) || 0;
                totalInvoiced += debitAmount;
                currentBalance += debitAmount;
            } else {
                creditAmount = parseFloat(t.amount) || 0;
                totalPaid += creditAmount;
                currentBalance -= creditAmount;
            }

            return {
                date: t.date,
                transactions: t.transactions,
                details: t.details,
                amount: debitAmount > 0 ? debitAmount : null,
                payments: creditAmount > 0 ? creditAmount : null,
                balance: currentBalance
            };
        });
        
        // 1. Fetch Client Name
        const clientRes = await db.query('SELECT full_name FROM client_profiles WHERE client_profile_id = $1', [client_id]);
        if (!clientRes.rows.length) {
            return res.status(404).json({ message: "Client not found." });
        }
        const clientName = clientRes.rows[0].full_name;

        // 2. Format the data perfectly for Handlebars
        const pdfData = {
            clientName: clientName,
            periodStart: new Date(start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            periodEnd: new Date(end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            summary: {
                openingBalance: parseFloat(openingBalance).toFixed(2),
                invoicedAmount: parseFloat(totalInvoiced).toFixed(2),
                amountPaid: parseFloat(totalPaid).toFixed(2),
                balanceDue: parseFloat(currentBalance).toFixed(2)
            },
            ledger: statementLines.map(line => ({
                date: new Date(line.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
                transactions: line.transactions,
                details: line.details || '',
                amount: line.amount ? parseFloat(line.amount).toFixed(2) : '',
                payments: line.payments ? parseFloat(line.payments).toFixed(2) : '',
                balance: parseFloat(line.balance).toFixed(2)
            }))
        };

        // 3. Generate the PDF
        const pdfBuffer = await generateStatementPDF(pdfData);

        // 4. Send it to the client as a downloadable file
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Statement_${clientName.replace(/\s+/g, '_')}.pdf"`,
            'Content-Length': pdfBuffer.length
        });

        res.status(200).send(pdfBuffer);

    } catch (error) {
        console.error("PDF Generation Error:", error);
        res.status(500).json({ message: "Failed to generate statement PDF." });
    }
};