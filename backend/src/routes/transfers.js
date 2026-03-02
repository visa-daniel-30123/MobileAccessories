import express from 'express';
import { query, run } from '../config/db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const MAX_STOCK_PER_BRANCH = 200;

router.use(authMiddleware);

// Lista transferuri: admin vede toate; restul văd doar transferurile care includ magazinul lor (sursă sau destinație)
router.get('/', async (req, res) => {
  try {
    let sql = `SELECT t.*, 
        p.sku, p.name AS product_name,
        fb.name AS from_branch_name, fb.city AS from_city,
        tb.name AS to_branch_name, tb.city AS to_city
       FROM transfers t
       JOIN products p ON p.id = t.product_id
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id`;
    const params = [];

    if (req.user.role === 'admin') {
      // Admin: toate transferurile
    } else {
      const myBranchId = req.user.branch_id;
      if (myBranchId == null) {
        return res.json([]);
      }
      params.push(myBranchId, myBranchId);
      sql += ' WHERE (t.from_branch_id = $1 OR t.to_branch_id = $2)';
    }

    sql += ' ORDER BY t.created_at DESC';
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Creare transfer (manager: doar din/ către branch-ul lui)
router.post('/', express.json(), async (req, res) => {
  try {
    const { from_branch_id, to_branch_id, product_id, quantity, notes } = req.body;
    if (from_branch_id === to_branch_id) {
      return res.status(400).json({ error: 'Sursa și destinația trebuie să fie diferite' });
    }
    if (req.user.role !== 'admin') {
      const allowed = req.user.branch_id === parseInt(from_branch_id, 10) || req.user.branch_id === parseInt(to_branch_id, 10);
      if (!allowed) return res.status(403).json({ error: 'Nu puteți crea transfer între aceste sucursale' });
    }
    const stockCheck = await query(
      'SELECT quantity FROM stock WHERE branch_id = $1 AND product_id = $2',
      [from_branch_id, product_id]
    );
    if (!stockCheck.rows[0] || stockCheck.rows[0].quantity < quantity) {
      return res.status(400).json({ error: 'Stoc insuficient la sucursala sursă' });
    }
    const toBranchTotal = await query(
      'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE branch_id = $1',
      [to_branch_id]
    );
    const toCurrent = Number(toBranchTotal.rows[0]?.total ?? 0);
    if (toCurrent + quantity > MAX_STOCK_PER_BRANCH) {
      return res.status(400).json({
        error: `Magazinul destinație nu are capacitate. Stoc actual: ${toCurrent}, maxim permis: ${MAX_STOCK_PER_BRANCH} produse.`,
      });
    }
    const costRow = await query(
      'SELECT cost_per_unit FROM transfer_costs WHERE from_branch_id = $1 AND to_branch_id = $2',
      [from_branch_id, to_branch_id]
    );
    const costPerUnit = costRow.rows[0]?.cost_per_unit ?? 0;
    const cost_estimate = costPerUnit * quantity;

    const r = await query(
      `INSERT INTO transfers (from_branch_id, to_branch_id, product_id, quantity, cost_estimate, created_by, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent')
       RETURNING *`,
      [from_branch_id, to_branch_id, product_id, quantity, cost_estimate, req.user.id, notes || null]
    );
    const row = r.rows[0];
    const withNames = await query(
      `SELECT t.*, p.sku, p.name AS product_name, fb.name AS from_branch_name, tb.name AS to_branch_name
       FROM transfers t
       JOIN products p ON p.id = t.product_id
       JOIN branches fb ON fb.id = t.from_branch_id
       JOIN branches tb ON tb.id = t.to_branch_id
       WHERE t.id = $1`,
      [row.id]
    );
    res.status(201).json(withNames.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Actualizare status cerere transfer
// Flux:
// - cererea este creată cu status 'sent' (în așteptare)
// - magazinul DESTINAȚIE (to_branch) sau admin poate ACCEPTA / RESPINGE cererea
// - la ACCEPTARE se actualizează stocurile (scade la sursă, crește la destinație)
router.patch('/:id/status', express.json(), async (req, res) => {
  try {
    const { status, quantity } = req.body;
    const allowed = ['sent', 'accepted', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Status invalid' });
    }
    const existing = await query('SELECT * FROM transfers WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Transfer negăsit' });
    const t = existing.rows[0];
    const myBranch = req.user.branch_id;

    if (req.user.role !== 'admin') {
      // utilizatorul trebuie sa fie implicat in transfer
      if (t.to_branch_id !== myBranch && t.from_branch_id !== myBranch) {
        return res.status(403).json({ error: 'Nu aveți dreptul să modificați acest transfer' });
      }
      // doar magazinul destinatie (to_branch) poate ACCEPTA / RESPINGE cererea
      if ((status === 'accepted' || status === 'rejected') && t.to_branch_id !== myBranch) {
        return res.status(403).json({ error: 'Doar magazinul care primește poate accepta sau refuza cererea' });
      }
    }

    // Actualizam statusul; pentru accepted putem ajusta si cantitatea
    let effectiveQty = t.quantity;
    if (status === 'accepted' && quantity != null) {
      const q = parseInt(quantity, 10);
      if (!Number.isFinite(q) || q < 1 || q > t.quantity) {
        return res.status(400).json({ error: `Cantitate invalidă pentru acceptare (1 - ${t.quantity}).` });
      }
      effectiveQty = q;
    }

    run(
      'UPDATE transfers SET status = $1, quantity = $2, updated_at = datetime(\'now\') WHERE id = $3',
      [status, effectiveQty, req.params.id]
    );
    if (status === 'accepted') {
      const stockFrom = query(
        'SELECT quantity FROM stock WHERE branch_id = $1 AND product_id = $2',
        [t.from_branch_id, t.product_id]
      );
      if (!stockFrom.rows[0] || stockFrom.rows[0].quantity < effectiveQty) {
        run(
          'UPDATE transfers SET status = $1, updated_at = datetime(\'now\') WHERE id = $2',
          ['sent', req.params.id]
        );
        return res.status(400).json({ error: 'Stoc insuficient la magazinul care trimite' });
      }
      const toBranchTotal = query(
        'SELECT COALESCE(SUM(quantity), 0) AS total FROM stock WHERE branch_id = $1',
        [t.to_branch_id]
      );
      const toCurrent = Number(toBranchTotal.rows[0]?.total ?? 0);
      if (toCurrent + effectiveQty > MAX_STOCK_PER_BRANCH) {
        return res.status(400).json({
          error: `Magazinul nu are capacitate. Stoc actual: ${toCurrent}, maxim: ${MAX_STOCK_PER_BRANCH} produse.`,
        });
      }
      run(
        `UPDATE stock SET quantity = quantity - $1, updated_at = datetime('now') WHERE branch_id = $2 AND product_id = $3`,
        [effectiveQty, t.from_branch_id, t.product_id]
      );
      run(
        `INSERT INTO stock (branch_id, product_id, quantity, updated_at)
         VALUES ($1, $2, $3, datetime('now'))
         ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = stock.quantity + $3, updated_at = datetime('now')`,
        [t.to_branch_id, t.product_id, effectiveQty]
      );
    }
    const r = await query('SELECT * FROM transfers WHERE id = $1', [req.params.id]);
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sugestii: stoc mort -> sucursale unde s-a vandut in 30/60/90
router.get('/suggestions', async (req, res) => {
  try {
    const r = await query(
      `SELECT v.branch_id, v.product_id, v.quantity AS available, v.days_since_last_sale, v.is_dead_stock, v.avg_monthly_3m,
              b.name AS branch_name, p.sku, p.name AS product_name
       FROM v_stock_with_days_no_sale v
       JOIN branches b ON b.id = v.branch_id
       JOIN products p ON p.id = v.product_id
       WHERE v.is_dead_stock = 1 AND v.quantity > 0`
    );
    const deadStock = r.rows;
    const sales30 = await query(
      `SELECT s.branch_id, s.product_id, CAST(SUM(s.quantity) AS INTEGER) AS total_sold
       FROM sales s
       WHERE s.sold_at >= date('now', '-30 days')
       GROUP BY s.branch_id, s.product_id`
    );
    const byProduct = {};
    for (const row of sales30.rows) {
      const key = row.product_id;
      if (!byProduct[key]) byProduct[key] = [];
      byProduct[key].push({ branch_id: row.branch_id, total_sold: row.total_sold });
    }
    const suggestions = deadStock.map((d) => ({
      from_branch_id: d.branch_id,
      from_branch_name: d.branch_name,
      product_id: d.product_id,
      product_name: d.product_name,
      sku: d.sku,
      available: d.quantity,
      days_no_sale: d.days_since_last_sale,
      suggested_destinations: (byProduct[d.product_id] || []).sort((a, b) => b.total_sold - a.total_sold),
    }));
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
