import express from 'express';
import { query, run } from '../config/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
const MAX_STOCK_PER_BRANCH = 200;

router.use(authMiddleware);

// Stoc actual: optional branch_id (admin vede toate, manager doar branch-ul lui)
router.get('/', async (req, res) => {
  try {
    const branchId = req.query.branch_id;
    const useView = req.query.dead_only === 'true';
    if (req.user.role !== 'admin' && branchId && req.user.branch_id !== parseInt(branchId, 10)) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    const filterBranch = req.user.role === 'admin' ? (branchId ? [parseInt(branchId, 10)] : null) : [req.user.branch_id];
    const table = 'v_stock_with_days_no_sale';
    const select =
      's.branch_id, s.product_id, s.quantity, s.last_sale_at, s.updated_at, s.days_since_last_sale, s.avg_monthly_3m, s.is_dead_stock';

    let sql = `SELECT ${select}, p.sku, p.name AS product_name, p.category, b.name AS branch_name, b.city
               FROM ${table} s
               JOIN products p ON p.id = s.product_id
               JOIN branches b ON b.id = s.branch_id`;
    const params = [];
    const conditions = [];
    if (filterBranch && filterBranch.length) {
      params.push(filterBranch);
      conditions.push(`s.branch_id IN ($${params.length})`);
    }
    if (useView) conditions.push('s.is_dead_stock = 1');
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY b.name, p.name';

    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizare last_sale_at la stoc (cand se inregistreaza vanzare)
async function updateLastSale(branchId, productId) {
  run(
    `UPDATE stock SET last_sale_at = datetime('now'), updated_at = datetime('now')
     WHERE branch_id = $1 AND product_id = $2`,
    [branchId, productId]
  );
}

// Set/upsert stoc (admin sau manager pentru branch-ul lui). Maxim 200 produse per magazin (toate tipurile la un loc).
router.put('/', express.json(), async (req, res) => {
  try {
    const { branch_id, product_id, quantity } = req.body;
    if (req.user.role !== 'admin' && req.user.branch_id !== parseInt(branch_id, 10)) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    const currentRow = await query(
      'SELECT quantity FROM stock WHERE branch_id = $1 AND product_id = $2',
      [branch_id, product_id]
    );
    const branchTotal = await query(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE branch_id = $1',
      [branch_id]
    );
    const total = Number(branchTotal.rows[0]?.total ?? 0);
    const currentProduct = Number(currentRow.rows[0]?.quantity ?? 0);
    const newTotal = total - currentProduct + parseInt(quantity, 10);
    if (newTotal > MAX_STOCK_PER_BRANCH) {
      return res.status(400).json({
        error: `Capacitate depășită. Maxim ${MAX_STOCK_PER_BRANCH} produse per magazin. Stoc total după modificare: ${newTotal}.`,
      });
    }
    run(
      `INSERT INTO stock (branch_id, product_id, quantity, updated_at)
       VALUES ($1, $2, $3, datetime('now'))
       ON CONFLICT (branch_id, product_id)
       DO UPDATE SET quantity = $3, updated_at = datetime('now')`,
      [branch_id, product_id, quantity]
    );
    const r = await query(
      `SELECT s.*, p.sku, p.name AS product_name, b.name AS branch_name
       FROM stock s JOIN products p ON p.id = s.product_id JOIN branches b ON b.id = s.branch_id
       WHERE s.branch_id = $1 AND s.product_id = $2`,
      [branch_id, product_id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Primire stoc: adaugă cantitate la stocul existent. Respectă maxim 200 produse per magazin.
router.post('/receive', express.json(), async (req, res) => {
  try {
    const { branch_id, product_id, quantity } = req.body;
    const addQty = parseInt(quantity, 10);
    if (!addQty || addQty < 1) {
      return res.status(400).json({ error: 'Cantitate invalidă' });
    }
    if (req.user.role !== 'admin' && req.user.branch_id !== parseInt(branch_id, 10)) {
      return res.status(403).json({ error: 'Nu aveți acces la această sucursală' });
    }
    const currentRow = await query(
      'SELECT quantity FROM stock WHERE branch_id = $1 AND product_id = $2',
      [branch_id, product_id]
    );
    const currentProduct = Number(currentRow.rows[0]?.quantity ?? 0);
    const branchTotal = await query(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE branch_id = $1',
      [branch_id]
    );
    const total = Number(branchTotal.rows[0]?.total ?? 0);
    const newTotal = total + addQty;
    if (newTotal > MAX_STOCK_PER_BRANCH) {
      return res.status(400).json({
        error: `Capacitate depășită. Maxim ${MAX_STOCK_PER_BRANCH} produse per magazin. După primire stocul total ar fi: ${newTotal}.`,
      });
    }
    run(
      `INSERT INTO stock (branch_id, product_id, quantity, updated_at)
       VALUES ($1, $2, $3, datetime('now'))
       ON CONFLICT (branch_id, product_id)
       DO UPDATE SET quantity = stock.quantity + $3, updated_at = datetime('now')`,
      [branch_id, product_id, addQty]
    );
    const r = await query(
      `SELECT s.*, p.sku, p.name AS product_name, b.name AS branch_name
       FROM stock s JOIN products p ON p.id = s.product_id JOIN branches b ON b.id = s.branch_id
       WHERE s.branch_id = $1 AND s.product_id = $2`,
      [branch_id, product_id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { updateLastSale };
export default router;
