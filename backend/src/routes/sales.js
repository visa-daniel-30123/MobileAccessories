import express from 'express';
import { query, run } from '../config/db.js';
import { authMiddleware } from '../middleware/auth.js';
import { updateLastSale } from './stock.js';

const router = express.Router();

router.use(authMiddleware);

// Raport vanzari 30 / 60 / 90 zile per (branch, product)
// Query params: branch_id (optional), days=30|60|90 (optional, default toate)
router.get('/report', async (req, res) => {
  try {
    const branchId = req.query.branch_id;
    const daysParam = req.query.days;
    if (req.user.role !== 'admin' && branchId && req.user.branch_id !== parseInt(branchId, 10)) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    const filterBranch = req.user.role === 'admin' ? (branchId ? [parseInt(branchId, 10)] : null) : [req.user.branch_id];

    const result = {};
    for (const d of [30, 60, 90]) {
      if (daysParam && daysParam !== 'all' && parseInt(daysParam, 10) !== d) continue;
      const params = [`-${d} days`];
      if (filterBranch?.length) params.push(filterBranch);
      const branchFilter = filterBranch?.length ? ' AND s.branch_id IN ($2)' : '';
      const r = await query(
        `SELECT s.branch_id, b.name AS branch_name, b.city,
                s.product_id, p.sku, p.name AS product_name,
                CAST(SUM(s.quantity) AS INTEGER) AS total_sold
         FROM sales s
         JOIN branches b ON b.id = s.branch_id
         JOIN products p ON p.id = s.product_id
         WHERE s.sold_at >= date('now', $1) ${branchFilter}
         GROUP BY s.branch_id, b.name, b.city, s.product_id, p.sku, p.name
         ORDER BY total_sold DESC`,
        params
      );
      result[`last_${d}_days`] = r.rows;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inregistrare vanzare (actualizeaza si last_sale_at la stoc)
router.post('/', express.json(), async (req, res) => {
  try {
    const { branch_id, product_id, quantity } = req.body;
    if (req.user.role !== 'admin' && req.user.branch_id !== parseInt(branch_id, 10)) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Cantitate invalidă' });
    }
    const check = await query(
      'SELECT quantity FROM stock WHERE branch_id = $1 AND product_id = $2',
      [branch_id, product_id]
    );
    if (!check.rows[0] || check.rows[0].quantity < quantity) {
      return res.status(400).json({ error: 'Stoc insuficient' });
    }
    run(
      'INSERT INTO sales (branch_id, product_id, quantity) VALUES ($1, $2, $3)',
      [branch_id, product_id, quantity]
    );
    run(
      'UPDATE stock SET quantity = quantity - $1, updated_at = datetime(\'now\') WHERE branch_id = $2 AND product_id = $3',
      [quantity, branch_id, product_id]
    );
    await updateLastSale(branch_id, product_id);
    const r = await query(
      'SELECT id, branch_id, product_id, quantity, sold_at FROM sales ORDER BY id DESC LIMIT 1'
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
