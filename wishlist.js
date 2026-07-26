const express = require('express');
const { readData, writeData } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
const WISHLIST_FILE = 'wishlists.json';
const PRODUCTS_FILE = 'products.json';

function getWishlist(userId) {
  const lists = readData(WISHLIST_FILE);
  let list = lists.find(w => w.userId === userId);
  if (!list) {
    list = { userId, productIds: [] };
    lists.push(list);
    writeData(WISHLIST_FILE, lists);
  }
  return list;
}

function saveWishlist(list) {
  const lists = readData(WISHLIST_FILE);
  const idx = lists.findIndex(w => w.userId === list.userId);
  if (idx === -1) lists.push(list);
  else lists[idx] = list;
  writeData(WISHLIST_FILE, lists);
}

// GET /api/wishlist
router.get('/', requireAuth, (req, res) => {
  const list = getWishlist(req.user.id);
  const products = readData(PRODUCTS_FILE);
  const items = list.productIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean);
  res.json({ items });
});

// POST /api/wishlist/:productId
router.post('/:productId', requireAuth, (req, res) => {
  const products = readData(PRODUCTS_FILE);
  const product = products.find(p => p.id === req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const list = getWishlist(req.user.id);
  if (!list.productIds.includes(req.params.productId)) {
    list.productIds.push(req.params.productId);
    saveWishlist(list);
  }
  res.status(201).json({ productIds: list.productIds });
});

// DELETE /api/wishlist/:productId
router.delete('/:productId', requireAuth, (req, res) => {
  const list = getWishlist(req.user.id);
  list.productIds = list.productIds.filter(id => id !== req.params.productId);
  saveWishlist(list);
  res.json({ productIds: list.productIds });
});

module.exports = router;
