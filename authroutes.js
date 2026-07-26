const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');
const { requireAuth, JWT_SECRET } = require('./auth');

const router = express.Router();
const FILE = 'users.json';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sanitize(user) {
  const { password, ...safe } = user;
  return safe;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const users = readData(FILE);
    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      name,
      email,
      password: hashed,
      role: 'customer',
      addresses: [],
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeData(FILE, users);

    const token = signToken(newUser);
    res.status(201).json({ token, user: sanitize(newUser) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const users = readData(FILE);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken(user);
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const users = readData(FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: sanitize(user) });
});

// PUT /api/auth/me - update profile / addresses
router.put('/me', requireAuth, (req, res) => {
  const users = readData(FILE);
  const idx = users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const { name, addresses } = req.body;
  if (name) users[idx].name = name;
  if (addresses) users[idx].addresses = addresses;
  writeData(FILE, users);

  res.json({ user: sanitize(users[idx]) });
});

module.exports = router;
