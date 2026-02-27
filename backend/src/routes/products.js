import express from 'express';
import { query } from '../config/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const r = await query(
      'SELECT id, sku, name, category FROM products ORDER BY name'
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, express.json(), async (req, res) => {
  try {
    const { sku, name, category } = req.body;
    const r = await query(
      `INSERT INTO products (sku, name, category) VALUES ($1, $2, $3)
       RETURNING id, sku, name, category`,
      [sku, name || '', category || '']
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'SKU deja existent' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
