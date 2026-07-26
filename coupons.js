const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
const FILE = 'coupons.json';

// POST /api/coupons/validate - check a coupon code against a cart subtotal
router.post('/validate', (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code is required.' });

  const coupons = readData(FILE);
  const coupon = coupons.find(c => c.code.toLowerCase() === code.toLowerCase() && c.active);
  if (!coupon) return res.status(404).json({ error: 'Invalid or inactive coupon code.' });

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'This coupon has expired.' });
  }
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    return res.status(400).json({ error: `Minimum order of ${coupon.minSubtotal} required for this coupon.` });
  }
  if (coupon.usageLimit && coupon.timesUsed >= coupon.usageLimit) {
    return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
  }

  let discount = 0;
  if (coupon.type === 'percent') {
    discount = (subtotal * coupon.value) / 100;
  } else if (coupon.type === 'fixed') {
    discount = Math.min(coupon.value, subtotal);
  }

  res.json({ valid: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount: Math.round(discount * 100) / 100 });
});

// GET /api/coupons (admin only) - list all
router.get('/', requireAuth, requireAdmin, (req, res) => {
  res.json(readData(FILE));
});

// POST /api/coupons (admin only)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { code, type, value, minSubtotal, usageLimit, expiresAt } = req.body;
  if (!code || !type || value === undefined) {
    return res.status(400).json({ error: 'Code, type, and value are required.' });
  }
  if (!['percent', 'fixed'].includes(type)) {
    return res.status(400).json({ error: "Type must be 'percent' or 'fixed'." });
  }

  const coupons = readData(FILE);
  if (coupons.find(c => c.code.toLowerCase() === code.toLowerCase())) {
    return res.status(409).json({ error: 'A coupon with this code already exists.' });
  }

  const newCoupon = {
    id: uuidv4(),
    code: code.toUpperCase(),
    type,
    value: parseFloat(value),
    minSubtotal: minSubtotal ? parseFloat(minSubtotal) : 0,
    usageLimit: usageLimit ? parseInt(usageLimit) : null,
    timesUsed: 0,
    expiresAt: expiresAt || null,
    active: true,
    createdAt: new Date().toISOString()
  };
  coupons.push(newCoupon);
  writeData(FILE, coupons);
  res.status(201).json(newCoupon);
});

// PUT /api/coupons/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const coupons = readData(FILE);
  const idx = coupons.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Coupon not found.' });

  const fields = ['type', 'value', 'minSubtotal', 'usageLimit', 'expiresAt', 'active'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) coupons[idx][f] = req.body[f];
  });

  writeData(FILE, coupons);
  res.json(coupons[idx]);
});

// DELETE /api/coupons/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const coupons = readData(FILE);
  const filtered = coupons.filter(c => c.id !== req.params.id);
  if (filtered.length === coupons.length) return res.status(404).json({ error: 'Coupon not found.' });
  writeData(FILE, filtered);
  res.json({ message: 'Coupon deleted.' });
});

module.exports = router;
