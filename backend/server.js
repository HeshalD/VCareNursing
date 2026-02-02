const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes')
const productRoutes = require('./routes/productRoutes')
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Body parser

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/products', productRoutes)


// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: err.message || 'Server Error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});