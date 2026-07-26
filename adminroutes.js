const express = require('express');
const { readData, writeData } = require('../utils/db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();

// POST /api/admin/bootstrap - promote a user to admin using the server's ADMIN_KEY
// Use this once to create your first admin, then keep the key secret.
router.post('/bootstrap', (req, res) => {
  const { adminKey, email } = req.body;
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key.' });
  }
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const users = readData('users.json');
  const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: 'No account found with that email. Register first, then bootstrap.' });

  users[idx].role = 'admin';
  writeData('users.json', users);
  res.json({ message: `${email} is now an admin.` });
});

// GET /api/admin/users (admin only)
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = readData('users.json').map(({ password, ...safe }) => safe);
  res.json(users);
});

// PATCH /api/admin/users/:id/role (admin only)
router.patch('/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['customer', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Role must be 'customer' or 'admin'." });
  }
  const users = readData('users.json');
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  users[idx].role = role;
  writeData('users.json', users);
  const { password, ...safe } = users[idx];
  res.json(safe);
});

// GET /api/admin/dashboard (admin only) - quick summary widget
router.get('/dashboard', requireAuth, requireAdmin, (req, res) => {
  const products = readData('products.json');
  const orders = readData('orders.json');
  const users = readData('users.json');

  const paidOrders = orders.filter(o => ['paid', 'processing', 'shipped', 'delivered'].includes(o.status));
  const revenue = paidOrders.reduce((sum, o) => sum + o.total, 0);
  const lowStock = products.filter(p => p.stock <= 5).map(p => ({ id: p.id, name: p.name, stock: p.stock }));

  res.json({
    totalRevenue: Math.round(revenue * 100) / 100,
    totalOrders: orders.length,
    paidOrders: paidOrders.length,
    pendingOrders: orders.filter(o => o.status === 'pending_payment').length,
    totalProducts: products.length,
    totalCustomers: users.filter(u => u.role === 'customer').length,
    lowStockAlerts: lowStock
  });
});

module.exports = router;
