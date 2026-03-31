const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const authRoutes = require('./routes/auth_simple');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const requestRoutes = require('./routes/requests');
const providerRoutes = require('./routes/providers');
const paymentRoutes = require('./routes/payments');
const ratingRoutes = require('./routes/ratings');
const webhookRoutes = require('./routes/webhook');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parsing (must come before routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// WhatsApp webhook — registered BEFORE rate limiter so Meta is never blocked
app.use('/api/webhook', webhookRoutes);

// Rate limiting (for all other routes)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Compression and logging
app.use(compression());
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/ratings', ratingRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
