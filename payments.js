const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Stripe = require('stripe');
const { readData, writeData } = require('./db');
const { requireAuth } = require('./auth');
const { sendMail, orderConfirmationEmail } = require('./mailer');

const router = express.Router();

const ORDERS_FILE = 'orders.json';
const PRODUCTS_FILE = 'products.json';
const CARTS_FILE = 'carts.json';
const COUPONS_FILE = 'coupons.json';
const USERS_FILE = 'users.json';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Builds a priced order object from the user's current cart + optional coupon
function buildOrderFromCart(userId, couponCode) {
  const carts = readData(CARTS_FILE);
  const cart = carts.find(c => c.userId === userId);
  if (!cart || cart.items.length === 0) {
    throw { status: 400, message: 'Your cart is empty.' };
  }

  const products = readData(PRODUCTS_FILE);
  const items = [];
  let subtotal = 0;

  for (const item of cart.items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) throw { status: 400, message: `A product in your cart is no longer available.` };
    if (product.stock < item.quantity) {
      throw { status: 400, message: `Not enough stock for ${product.name}.` };
    }
    const lineTotal = product.price * item.quantity;
    subtotal += lineTotal;
    items.push({ productId: product.id, name: product.name, price: product.price, quantity: item.quantity });
  }

  let discount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const coupons = readData(COUPONS_FILE);
    const coupon = coupons.find(c => c.code.toLowerCase() === couponCode.toLowerCase() && c.active);
    if (coupon) {
      if (coupon.type === 'percent') discount = (subtotal * coupon.value) / 100;
      else if (coupon.type === 'fixed') discount = Math.min(coupon.value, subtotal);
      appliedCoupon = coupon.code;
    }
  }

  const total = Math.round((subtotal - discount) * 100) / 100;
  return { items, subtotal: Math.round(subtotal * 100) / 100, discount: Math.round(discount * 100) / 100, total, appliedCoupon };
}

// POST /api/payments/create-intent - creates a pending order + Stripe PaymentIntent
router.post('/create-intent', requireAuth, async (req, res) => {
  try {
    const { couponCode, shippingAddress } = req.body;
    const priced = buildOrderFromCart(req.user.id, couponCode);

    if (priced.total <= 0) {
      return res.status(400).json({ error: 'Order total must be greater than zero.' });
    }

    const orders = readData(ORDERS_FILE);
    const order = {
      id: uuidv4(),
      userId: req.user.id,
      items: priced.items,
      subtotal: priced.subtotal,
      discount: priced.discount,
      couponCode: priced.appliedCoupon,
      total: priced.total,
      shippingAddress: shippingAddress || null,
      status: 'pending_payment',
      paymentIntentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const stripe = getStripe();
    if (!stripe) {
      // Demo mode without Stripe configured: mark order pending and let admin confirm manually
      orders.push(order);
      writeData(ORDERS_FILE, orders);
      return res.status(201).json({
        order,
        demoMode: true,
        message: 'STRIPE_SECRET_KEY not set — order created in demo mode without real payment.'
      });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(priced.total * 100), // cents
      currency: 'usd',
      metadata: { orderId: order.id, userId: req.user.id }
    });

    order.paymentIntentId = intent.id;
    orders.push(order);
    writeData(ORDERS_FILE, orders);

    res.status(201).json({ order, clientSecret: intent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create payment intent.' });
  }
});

// Shared logic to finalize an order once payment is confirmed
function finalizeOrder(orderId) {
  const orders = readData(ORDERS_FILE);
  const idx = orders.findIndex(o => o.id === orderId);
  if (idx === -1) return null;
  if (orders[idx].status === 'paid') return orders[idx]; // already finalized

  const order = orders[idx];

  // decrement stock
  const products = readData(PRODUCTS_FILE);
  order.items.forEach(item => {
    const p = products.find(pr => pr.id === item.productId);
    if (p) p.stock = Math.max(0, p.stock - item.quantity);
  });
  writeData(PRODUCTS_FILE, products);

  // increment coupon usage
  if (order.couponCode) {
    const coupons = readData(COUPONS_FILE);
    const c = coupons.find(c => c.code === order.couponCode);
    if (c) {
      c.timesUsed = (c.timesUsed || 0) + 1;
      writeData(COUPONS_FILE, coupons);
    }
  }

  // clear the user's cart
  const carts = readData(CARTS_FILE);
  const cart = carts.find(c => c.userId === order.userId);
  if (cart) {
    cart.items = [];
    writeData(CARTS_FILE, carts);
  }

  order.status = 'paid';
  order.updatedAt = new Date().toISOString();
  orders[idx] = order;
  writeData(ORDERS_FILE, orders);

  // send confirmation email (best-effort, doesn't block)
  const users = readData(USERS_FILE);
  const user = users.find(u => u.id === order.userId);
  if (user) {
    const { subject, html } = orderConfirmationEmail(order);
    sendMail({ to: user.email, subject, html }).catch(e => console.error('Order email failed:', e));
  }

  return order;
}

// POST /api/payments/confirm-demo/:orderId - manual confirmation when Stripe isn't configured (demo mode)
router.post('/confirm-demo/:orderId', requireAuth, (req, res) => {
  if (process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: 'Stripe is configured — use the real payment flow instead.' });
  }
  const orders = readData(ORDERS_FILE);
  const order = orders.find(o => o.id === req.params.orderId && o.userId === req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const finalized = finalizeOrder(order.id);
  res.json(finalized);
});

// POST /api/payments/webhook - Stripe webhook (mounted with express.raw in server.js)
async function webhookHandler(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(400).send('Stripe not configured.');

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const orderId = intent.metadata && intent.metadata.orderId;
    if (orderId) finalizeOrder(orderId);
  } else if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const orderId = intent.metadata && intent.metadata.orderId;
    if (orderId) {
      const orders = readData(ORDERS_FILE);
      const idx = orders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        orders[idx].status = 'cancelled';
        writeData(ORDERS_FILE, orders);
      }
    }
  }

  res.json({ received: true });
}

module.exports = { router, webhookHandler };
