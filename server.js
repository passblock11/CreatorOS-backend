require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const snapchatRoutes = require('./routes/snapchat');
const instagramRoutes = require('./routes/instagram');
const postRoutes = require('./routes/posts');
const stripeRoutes = require('./routes/stripe');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const aiRoutes = require('./routes/ai');
const mediaLibraryRoutes = require('./routes/mediaLibrary');

const app = express();

connectDB();

// Trust proxy for rate limiting behind reverse proxy (Vercel, Heroku, etc.)
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));

// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// Apply body parsers to all routes EXCEPT the file upload route
app.use((req, res, next) => {
  // Skip body parsing ONLY for the actual file upload endpoint
  if (req.path === '/api/upload/media') {
    return next();
  }
  express.json()(req, res, next);
});

app.use((req, res, next) => {
  // Skip body parsing ONLY for the actual file upload endpoint
  if (req.path === '/api/upload/media') {
    return next();
  }
  express.urlencoded({ extended: true })(req, res, next);
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Creator OS API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/snapchat', snapchatRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/media-library', mediaLibraryRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
