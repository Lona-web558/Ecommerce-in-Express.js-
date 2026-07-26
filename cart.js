const express = require('express');
const { readData, writeData } = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();
const CART_FILE = 'carts.json';
const PRODUCTS_FILE = 'products.json';

function getCart(userId) {
  const carts = readData(CART_FILE);
  let cart = carts.find(c => c.userId === userId);
  if (!cart) {
    cart = { userId, items: [], updatedAt: new Date().toISOString() };
    carts.push(cart);
    writeData(CART_FILE, carts);
  }
  return cart;
}

function saveCart(cart) {
  const carts = readData(CART_FILE);
  const idx = carts.findIndex(c => c.userId === cart.userId);
  cart.updatedAt = new Date().toISOString();
  if (idx === -1) carts.push(cart);
  else carts[idx] = cart;
  writeData(CART_FILE, carts);
}

function enrichCart(cart) {
  const products = readData(PRODUCTS_FILE);
  const items = cart.items.map(item => {
    const product = products.find(p => p.id === item.productId);
    return {
      productId: item.productId,
      quantity: item.quantity,
      product: product ? {
        name: product.name,
        price: product.price,
        images: product.images,
        stock: product.stock
      } : null
    };
  });
  const subtotal = items.reduce((sum, i) => sum + (i.product ? i.product.price * i.quantity : 0), 0);
  return { items, subtotal: Math.round(subtotal * 100) / 100 };
}

// GET /api/cart
router.get('/', requireAuth, (req, res) => {
  const cart = getCart(req.user.id);
  res.json(enrichCart(cart));
});

// POST /api/cart/items - add item { productId, quantity }
router.post('/items', requireAuth, (req, res) => {
  const { productId, quantity = 1 } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId is required.' });

  const products = readData(PRODUCTS_FILE);
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.stock < quantity) return res.status(400).json({ error: 'Not enough stock available.' });

  const cart = getCart(req.user.id);
  const existing = cart.items.find(i => i.productId === productId);
  if (existing) existing.quantity += parseInt(quantity);
  else cart.items.push({ productId, quantity: parseInt(quantity) });

  saveCart(cart);
  res.status(201).json(enrichCart(cart));
});

// PUT /api/cart/items/:productId - set quantity
router.put('/items/:productId', requireAuth, (req, res) => {
  const { quantity } = req.body;
  if (quantity === undefined) return res.status(400).json({ error: 'quantity is required.' });

  const cart = getCart(req.user.id);
  const item = cart.items.find(i => i.productId === req.params.productId);
  if (!item) return res.status(404).json({ error: 'Item not in cart.' });

  if (parseInt(quantity) <= 0) {
    cart.items = cart.items.filter(i => i.productId !== req.params.productId);
  } else {
    item.quantity = parseInt(quantity);
  }

  saveCart(cart);
  res.json(enrichCart(cart));
});

// DELETE /api/cart/items/:productId
router.delete('/items/:productId', requireAuth, (req, res) => {
  const cart = getCart(req.user.id);
  cart.items = cart.items.filter(i => i.productId !== req.params.productId);
  saveCart(cart);
  res.json(enrichCart(cart));
});

// DELETE /api/cart - clear entire cart
router.delete('/', requireAuth, (req, res) => {
  const cart = getCart(req.user.id);
  cart.items = [];
  saveCart(cart);
  res.json(enrichCart(cart));
});

module.exports = router;
