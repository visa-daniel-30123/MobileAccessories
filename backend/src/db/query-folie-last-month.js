import { query } from '../config/db.js';

const sql = `
SELECT COALESCE(SUM(s.quantity), 0) AS total
FROM sales s
JOIN branches b ON b.id = s.branch_id
JOIN products p ON p.id = s.product_id
WHERE b.name = 'Focșani'
  AND p.name = 'Folie'
  AND s.sold_at >= date('now','-30 days')
`;

const run = async () => {
  const r = await query(sql);
  console.log(r.rows[0]?.total ?? 0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

