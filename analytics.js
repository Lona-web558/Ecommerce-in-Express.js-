const express = require('express');
const { readData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();

const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

// GET /api/analytics/sales?days=30 (admin only) - revenue & order count per day
router.get('/sales', requireAuth, requireAdmin, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const orders = readData('orders.json').filter(o => PAID_STATUSES.includes(o.status));

  const buckets = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, revenue: 0, orders: 0 };
  }

  orders.forEach(o => {
    const key = o.createdAt.slice(0, 10);
    if (buckets[key]) {
      buckets[key].revenue += o.total;
      buckets[key].orders += 1;
    }
  });

  const series = Object.values(buckets).map(b => ({ ...b, revenue: Math.round(b.revenue * 100) / 100 }));
  const totalRevenue = series.reduce((s, b) => s + b.revenue, 0);
  const totalOrders = series.reduce((s, b) => s + b.orders, 0);

  res.json({
    series,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    averageOrderValue: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0
  });
});

// GET /api/analytics/top-products?limit=10 (admin only)
router.get('/top-products', requireAuth, requireAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const orders = readData('orders.json').filter(o => PAID_STATUSES.includes(o.status));

  const tally = {};
  orders.forEach(o => {
    o.items.forEach(item => {
      if (!tally[item.productId]) tally[item.productId] = { productId: item.productId, name: item.name, unitsSold: 0, revenue: 0 };
      tally[item.productId].unitsSold += item.quantity;
      tally[item.productId].revenue += item.price * item.quantity;
    });
  });

  const top = Object.values(tally)
    .map(t => ({ ...t, revenue: Math.round(t.revenue * 100) / 100 }))
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);

  res.json(top);
});

// GET /api/analytics/customers (admin only) - top customers by spend
router.get('/customers', requireAuth, requireAdmin, (req, res) => {
  const orders = readData('orders.json').filter(o => PAID_STATUSES.includes(o.status));
  const users = readData('users.json');

  const tally = {};
  orders.forEach(o => {
    if (!tally[o.userId]) tally[o.userId] = { userId: o.userId, orders: 0, totalSpent: 0 };
    tally[o.userId].orders += 1;
    tally[o.userId].totalSpent += o.total;
  });

  const result = Object.values(tally)
    .map(t => {
      const user = users.find(u => u.id === t.userId);
      return { ...t, totalSpent: Math.round(t.totalSpent * 100) / 100, name: user ? user.name : 'Unknown', email: user ? user.email : '' };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  res.json(result);
});

module.exports = router;
