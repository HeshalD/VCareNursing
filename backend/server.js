const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes')
const productRoutes = require('./routes/productRoutes')
const staffRoutes = require('./routes/staffRoutes')
const serviceRequestRoutes = require('./routes/serviceRequestRoutes')
const quoteRoutes = require('./routes/quoteRoutes')
const bookingRoutes = require('./routes/bookingRoutes')
const patientRoutes = require('./routes/patientRoutes')
const statementRoutes = require('./routes/statementRoutes')
const paymentRoutes = require('./routes/paymentRoutes')
const paymentSlipRoutes = require('./routes/paymentSlipRoutes')
const migrateRoutes = require('./routes/migrateRoutes');
const staffWalletRoutes = require('./routes/staffWalletRoutes');
const staffLeaveRoutes = require('./routes/staffLeaveRoutes');
const staffReviewRoutes = require('./routes/staffReviewRoutes')
const financesRoutes = require('./routes/financesRoutes')
const bankAccountRoutes = require('./routes/bankAccountRoutes');
const staffAssignmentRoutes = require('./routes/staffAssignmentRoutes');
const staffChangeRequestRoutes = require('./routes/staffChangeRequestRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const clientPaymentRoutes = require('./routes/clientPaymentRoutes');
const receiptRoutes = require('./routes/receiptRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const permissionsRoutes = require('./routes/permissionsRoutes');
const internalStaffRoutes = require('./routes/internalStaffRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const scheduledActionsRoutes = require('./routes/scheduledActionsRoutes');
const salespersonRoutes = require('./routes/salespersonRoutes');
const recruiterRoutes = require('./routes/recruiterRoutes');
const bulkImportRoutes = require('./routes/bulkImportRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const staffDocUploadRoutes = require('./routes/staffDocUploadRoutes');
const clientReceiptUploadRoutes = require('./routes/clientReceiptUploadRoutes');
const walkInCustomerRoutes = require('./routes/walkInCustomerRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const rentalRoutes = require('./routes/rentalRoutes');

const startDailyInvoicing = require('./cron/dailyInvoicing');
const startRentalInvoicing = require('./cron/rentalInvoicing');
const startRegFeeExpiry = require('./cron/regFeeExpiry');

const VERIFY_TOKEN = "nursing_verify_token";

require('dotenv').config();

// Auto-run database migration in production (only if not already migrated)
if (process.env.NODE_ENV === 'production' && process.env.AUTO_MIGRATE !== 'false') {
  console.log('Running database migration...');
  const migrate = require('./migrate');
  migrate()
    .then(() => {
      console.log('Database migration completed successfully');
    })
    .catch((error) => {
      console.error('Database migration failed:', error);
      // Don't exit the process, let the server continue
    });
}

const app = express();

// Start the daily invoicing cron job
startDailyInvoicing();

// Start the monthly recurring rental invoicing cron job
startRentalInvoicing();

// Start the registration-fee (membership) 365-day expiry cron job
startRegFeeExpiry();

// Middleware
// CORS setup – only permit origins configured via env or development host.
// CLIENT_URL may be a single origin or a comma-separated list
// (e.g. "https://vcarenursing.com,https://www.vcarenursing.com").
const envOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...envOrigins,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const corsOptions = {
  origin: (origin, callback) => {
    // allow requests with no origin (e.g., mobile apps, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json()); // Body parser

// Request Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/products', productRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/statement', statementRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/payment-slips', paymentSlipRoutes);
app.use('/api/migrate', migrateRoutes); 
app.use('/api/staff-wallet', staffWalletRoutes);
app.use('/api/staff-leave', staffLeaveRoutes);
app.use('/api/staff-reviews', staffReviewRoutes);

app.use('/api/finances', financesRoutes);
app.use('/api/bank-accounts', bankAccountRoutes);
app.use('/api/assignments', staffAssignmentRoutes);
app.use('/api/staff-change-requests', staffChangeRequestRoutes);
app.use('/api/activity-log', activityLogRoutes);
app.use('/api/client-payments', clientPaymentRoutes);
app.use('/api/payment-receipts', receiptRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/internal-staff', internalStaffRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/scheduled-actions', scheduledActionsRoutes);
app.use('/api/salespersons', salespersonRoutes);
app.use('/api/recruiters', recruiterRoutes);
app.use('/api/bulk-import', bulkImportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/staff', staffDocUploadRoutes);
app.use('/api/client-receipt-upload', clientReceiptUploadRoutes);
app.use('/api/walk-in-customers', walkInCustomerRoutes);
app.use('/api/product-invoices', invoiceRoutes);
app.use('/api/rentals', rentalRoutes);

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("Webhook verification request received");

  // Check token matches
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");

    return res.status(200).send(challenge);
  }

  console.log("Webhook verification failed");

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log("Incoming WhatsApp event:");

  console.dir(req.body, { depth: null });

  /*
    Example payload structure you will receive:
    - messages
    - statuses (delivered/read)
  */

  // IMPORTANT: Always respond 200 quickly
  res.sendStatus(200);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: err.message || 'Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});