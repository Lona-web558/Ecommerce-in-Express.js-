const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
const FILE = 'reviews.json';
const PRODUCTS_FILE = 'products.json';

function recalcProductRating(productId) {
  const reviews = readData(FILE).filter(r => r.productId === productId && r.approved);
  const products = readData(PRODUCTS_FILE);
  const idx = products.findIndex(p => p.id === productId);
  if (idx === -1) return;

  if (reviews.length === 0) {
    products[idx].ratingAverage = 0;
    products[idx].ratingCount = 0;
  } else {
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    products[idx].ratingAverage = Math.round(avg * 10) / 10;
    products[idx].ratingCount = reviews.length;
  }
  writeData(PRODUCTS_FILE, products);
}

// GET /api/reviews/product/:productId - approved reviews for a product
router.get('/product/:productId', (req, res) => {
  const reviews = readData(FILE).filter(r => r.productId === req.params.productId && r.approved);
  res.json(reviews);
});

// POST /api/reviews - submit a review (requires login, requires having purchased -- soft check)
router.post('/', requireAuth, (req, res) => {
  const { productId, rating, comment } = req.body;
  if (!productId || rating === undefined) {
    return res.status(400).json({ error: 'productId and rating are required.' });
  }
  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  const products = readData(PRODUCTS_FILE);
  if (!products.find(p => p.id === productId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const reviews = readData(FILE);
  if (reviews.find(r => r.productId === productId && r.userId === req.user.id)) {
    return res.status(409).json({ error: 'You have already reviewed this product.' });
  }

  const newReview = {
    id: uuidv4(),
    productId,
    userId: req.user.id,
    userName: req.user.name || 'Anonymous',
    rating: parseInt(rating),
    comment: comment || '',
    approved: true, // set to false here and require admin approval if moderation is desired
    createdAt: new Date().toISOString()
  };
  reviews.push(newReview);
  writeData(FILE, reviews);
  recalcProductRating(productId);

  res.status(201).json(newReview);
});

// DELETE /api/reviews/:id (owner or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const reviews = readData(FILE);
  const review = reviews.find(r => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found.' });

  if (review.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to delete this review.' });
  }

  writeData(FILE, reviews.filter(r => r.id !== req.params.id));
  recalcProductRating(review.productId);
  res.json({ message: 'Review deleted.' });
});

// GET /api/reviews (admin only) - moderation queue
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(readData(FILE));
});

// PATCH /api/reviews/:id/approve (admin only)
router.patch('/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const reviews = readData(FILE);
  const idx = reviews.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found.' });

  reviews[idx].approved = req.body.approved !== undefined ? !!req.body.approved : true;
  writeData(FILE, reviews);
  recalcProductRating(reviews[idx].productId);
  res.json(reviews[idx]);
});

module.exports = router;
