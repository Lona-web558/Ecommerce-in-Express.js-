const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { readData, writeData } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const upload = require('./upload');

const router = express.Router();
const FILE = 'products.json';

// GET /api/products - list with search, filter, sort, pagination
// query: ?search=&category=&minPrice=&maxPrice=&sort=price_asc|price_desc|newest&page=1&limit=12
router.get('/', (req, res) => {
  let products = readData(FILE);
  const { search, category, minPrice, maxPrice, sort, page = 1, limit = 12 } = req.query;

  if (search) {
    const q = search.toLowerCase();
    products = products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
    );
  }
  if (category) {
    products = products.filter(p => p.categoryId === category);
  }
  if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
  if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));

  if (sort === 'price_asc') products.sort((a, b) => a.price - b.price);
  else if (sort === 'price_desc') products.sort((a, b) => b.price - a.price);
  else if (sort === 'newest') products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = products.length;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));
  const start = (pageNum - 1) * limitNum;
  const paginated = products.slice(start, start + limitNum);

  res.json({
    products: paginated,
    pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
  });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const product = readData(FILE).find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(product);
});

// POST /api/products (admin only)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, description, price, compareAtPrice, categoryId, stock, sku, images, attributes } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Name and price are required.' });
  }

  const products = readData(FILE);
  const newProduct = {
    id: uuidv4(),
    name,
    description: description || '',
    price: parseFloat(price),
    compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : null,
    categoryId: categoryId || null,
    sku: sku || `SKU-${Date.now()}`,
    stock: stock !== undefined ? parseInt(stock) : 0,
    images: images || [],
    attributes: attributes || {},
    ratingAverage: 0,
    ratingCount: 0,
    active: true,
    createdAt: new Date().toISOString()
  };
  products.push(newProduct);
  writeData(FILE, products);
  res.status(201).json(newProduct);
});

// PUT /api/products/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const products = readData(FILE);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found.' });

  const fields = ['name', 'description', 'price', 'compareAtPrice', 'categoryId', 'sku', 'images', 'attributes', 'active'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) products[idx][f] = req.body[f];
  });
  if (req.body.price !== undefined) products[idx].price = parseFloat(req.body.price);

  writeData(FILE, products);
  res.json(products[idx]);
});

// PATCH /api/products/:id/inventory (admin only) - adjust stock
router.patch('/:id/inventory', requireAuth, requireAdmin, (req, res) => {
  const { stock, adjust } = req.body; // set absolute `stock` or relative `adjust`
  const products = readData(FILE);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found.' });

  if (stock !== undefined) {
    products[idx].stock = parseInt(stock);
  } else if (adjust !== undefined) {
    products[idx].stock = Math.max(0, (products[idx].stock || 0) + parseInt(adjust));
  } else {
    return res.status(400).json({ error: 'Provide either stock or adjust.' });
  }

  writeData(FILE, products);
  res.json({ id: products[idx].id, stock: products[idx].stock });
});

// DELETE /api/products/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const products = readData(FILE);
  const filtered = products.filter(p => p.id !== req.params.id);
  if (filtered.length === products.length) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  writeData(FILE, filtered);
  res.json({ message: 'Product deleted.' });
});

// POST /api/products/upload-image (admin only) - image upload for a product
router.post('/upload-image', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded.' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
