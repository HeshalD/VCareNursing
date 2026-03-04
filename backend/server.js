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
const migrateRoutes = require('./routes/migrateRoutes');

const startDailyInvoicing = require('./cron/dailyInvoicing');

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

// Middleware
// CORS setup – only permit origins configured via env or development host
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);

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
app.use('/api/migrate', migrateRoutes);

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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