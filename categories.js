const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');

const router = express.Router();
const FILE = 'categories.json';

// GET /api/categories
router.get('/', (req, res) => {
  res.json(readData(FILE));
});

// GET /api/categories/:id
router.get('/:id', (req, res) => {
  const category = readData(FILE).find(c => c.id === req.params.id);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  res.json(category);
});

// POST /api/categories (admin only)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, description, parentId, image } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });

  const categories = readData(FILE);
  const newCategory = {
    id: uuidv4(),
    name,
    slug: name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-'),
    description: description || '',
    parentId: parentId || null,
    image: image || null,
    createdAt: new Date().toISOString()
  };
  categories.push(newCategory);
  writeData(FILE, categories);
  res.status(201).json(newCategory);
});

// PUT /api/categories/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const categories = readData(FILE);
  const idx = categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Category not found.' });

  const { name, description, parentId, image } = req.body;
  if (name) {
    categories[idx].name = name;
    categories[idx].slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
  }
  if (description !== undefined) categories[idx].description = description;
  if (parentId !== undefined) categories[idx].parentId = parentId;
  if (image !== undefined) categories[idx].image = image;

  writeData(FILE, categories);
  res.json(categories[idx]);
});

// DELETE /api/categories/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const categories = readData(FILE);
  const filtered = categories.filter(c => c.id !== req.params.id);
  if (filtered.length === categories.length) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  writeData(FILE, filtered);
  res.json({ message: 'Category deleted.' });
});

module.exports = router;
