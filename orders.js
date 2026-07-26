const express = require('express');
const { readData, writeData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
const FILE = 'orders.json';

// GET /api/orders - current user's own order history
router.get('/', requireAuth, (req, res) => {
  const orders = readData(FILE).filter(o => o.userId === req.user.id);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

// GET /api/orders/:id - a single order (owner or admin)
router.get('/:id', requireAuth, (req, res) => {
  const order = readData(FILE).find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to view this order.' });
  }
  res.json(order);
});

// --- Admin ---

// GET /api/orders/admin/all (admin only) - all orders, optional status filter
router.get('/admin/all', requireAuth, requireAdmin, (req, res) => {
  let orders = readData(FILE);
  if (req.query.status) orders = orders.filter(o => o.status === req.query.status);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

// PATCH /api/orders/:id/status (admin only) - update fulfillment status
router.patch('/:id/status', requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body;
  const valid = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
  }

  const orders = readData(FILE);
  const idx = orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found.' });

  orders[idx].status = status;
  orders[idx].updatedAt = new Date().toISOString();
  writeData(FILE, orders);
  res.json(orders[idx]);
});

module.exports = router;
