require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/authroutes');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const couponRoutes = require('./routes/coupons');
const cartRoutes = require('./routes/cart');
const wishlistRoutes = require('./routes/wishlist');
const reviewRoutes = require('./routes/reviews');
const orderRoutes = require('./routes/orders');
const { router: paymentRoutes, webhookHandler } = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure data + uploads directories exist (first run)
const DATA_DIR = path.join(__dirname);
const UPLOAD_DIR = path.join(__dirname);
[DATA_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
['users', 'products', 'categories', 'orders', 'coupons', 'reviews', 'carts', 'wishlists'].forEach(name => {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');
});

app.use(cors());

// Stripe webhook needs the RAW body for signature verification,
// so it must be registered before the global express.json() parser.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname)));

// --- API routes ---
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the storefront and admin panel HTML for any non-API route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Storefront:  http://localhost:${PORT}/`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin`);
});
