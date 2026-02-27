import express from 'express';
import { query } from '../config/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const r = await query(
      'SELECT id, name, city, address, transport_cost_per_unit, created_at FROM branches ORDER BY name'
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await query(
      'SELECT id, name, city, address, transport_cost_per_unit FROM branches WHERE id = $1',
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Sucursală negăsită' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, express.json(), async (req, res) => {
  try {
    const { name, city, address, transport_cost_per_unit } = req.body;
    const r = await query(
      `INSERT INTO branches (name, city, address, transport_cost_per_unit)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, city, address, transport_cost_per_unit, created_at`,
      [name, city || '', address || '', transport_cost_per_unit ?? 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/transfer-costs', async (req, res) => {
  try {
    const r = await query(
      `SELECT from_branch_id, to_branch_id, cost_per_unit
       FROM transfer_costs
       WHERE from_branch_id = $1`,
      [req.params.id]
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
