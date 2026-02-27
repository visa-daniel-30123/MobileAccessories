import { query, run } from '../config/db.js';
import bcrypt from 'bcryptjs';

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDateInLastDays(days) {
  const dayOffset = randomBetween(0, days - 1);
  const hourOffset = randomBetween(0, 23);
  const ms = Date.now() - (dayOffset * 24 + hourOffset) * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

async function seed() {
  try {
    run(`
      INSERT OR IGNORE INTO branches (name, city, transport_cost_per_unit) VALUES
        ('București Centru', 'București', 0.5),
        ('București Nord', 'București', 0.5),
        ('Focșani', 'Focșani', 1.2),
        ('Ploiești', 'Ploiești', 0.8),
        ('Brașov', 'Brașov', 1.0)
    `);
    const branches = query('SELECT id FROM branches ORDER BY id');
    if (branches.rows.length === 0) throw new Error('Nu s-au creat sucursale');

    run(`
      INSERT OR IGNORE INTO products (sku, name, category) VALUES
        ('AC-001', 'Huse', 'Huse'),
        ('AC-002', 'Încărcătoare', 'Încărcătoare'),
        ('AC-003', 'Folie', 'Folie'),
        ('AC-004', 'Casti', 'Casti')
    `);
    run(`UPDATE products SET name = 'Huse', category = 'Huse' WHERE sku = 'AC-001'`);
    run(`UPDATE products SET name = 'Încărcătoare', category = 'Încărcătoare' WHERE sku = 'AC-002'`);
    run(`UPDATE products SET name = 'Folie', category = 'Folie' WHERE sku = 'AC-003'`);
    run(`UPDATE products SET name = 'Casti', category = 'Casti' WHERE sku = 'AC-004'`);

    const hash = await bcrypt.hash('admin123', 10);
    run(
      `INSERT OR IGNORE INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'admin', 'Administrator')`,
      ['admin@accesorii.ro', hash]
    );

    const managerHash = await bcrypt.hash('manager123', 10);
    const managers = [
      { email: 'manager.centru@accesorii.ro', branch_id: branches.rows[0].id, full_name: 'Manager București Centru' },
      { email: 'manager.nord@accesorii.ro', branch_id: branches.rows[1].id, full_name: 'Manager București Nord' },
      { email: 'manager.focsani@accesorii.ro', branch_id: branches.rows[2].id, full_name: 'Manager Focșani' },
      { email: 'manager.ploiesti@accesorii.ro', branch_id: branches.rows[3].id, full_name: 'Manager Ploiești' },
      { email: 'manager.brasov@accesorii.ro', branch_id: branches.rows[4].id, full_name: 'Manager Brașov' },
    ];
    for (const m of managers) {
      run(
        `INSERT OR IGNORE INTO users (email, password_hash, role, branch_id, full_name) VALUES ($1, $2, 'manager', $3, $4)`,
        [m.email, managerHash, m.branch_id, m.full_name]
      );
    }

    const products = query('SELECT id FROM products ORDER BY id');
    for (const b of branches.rows) {
      for (const p of products.rows) {
        run(
          `INSERT INTO stock (branch_id, product_id, quantity) VALUES ($1, $2, 50)
           ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = 50`,
          [b.id, p.id]
        );
      }
    }

    // Vanzari istorice random pe ultimele 4 luni (~120 zile),
    // ponderate in functie de oras (populatie / trafic):
    // Bucuresti Centru / Nord > Brasov > Ploiesti > Focsani.
    const branchInfo = query('SELECT id, name, city FROM branches').rows.map((b) => {
      let weight = 1;
      if (b.city === 'București' && b.name.includes('Centru')) weight = 3.0;
      else if (b.city === 'București') weight = 2.5;
      else if (b.name === 'Brașov') weight = 1.8;
      else if (b.name === 'Ploiești') weight = 1.3;
      else weight = 1.0; // Focșani sau altele
      return { ...b, weight };
    });

    const DAYS_BACK = 120;
    for (const b of branchInfo) {
      for (const p of products.rows) {
        for (let d = 0; d < DAYS_BACK; d++) {
          // Probabilitate de vânzare în ziua respectivă, scalata cu weight
          const baseProb = 0.15; // ~15% sanse / zi / produs
          const prob = baseProb * b.weight;
          if (Math.random() < prob) {
            const qty = randomBetween(1, 5);
            const soldAt = randomDateInLastDays(DAYS_BACK);
            run(
              `INSERT INTO sales (branch_id, product_id, quantity, sold_at) VALUES ($1, $2, $3, $4)`,
              [b.id, p.id, qty, soldAt]
            );
          }
        }
      }
    }

    // Actualizam last_sale_at in stock pe baza ultimei vanzari inregistrate
    run(`
      UPDATE stock
      SET last_sale_at = (
        SELECT MAX(sold_at)
        FROM sales s
        WHERE s.branch_id = stock.branch_id
          AND s.product_id = stock.product_id
      ),
      updated_at = datetime('now')
    `);

    // Exemplu dedicat: la Focșani, produsul "Folie" să fie stoc mort
    const focsani = branchInfo.find((b) => b.name === 'Focșani');
    const folie = query(`SELECT id FROM products WHERE name = 'Folie'`).rows[0];
    if (focsani && folie) {
      // Ștergem vânzările recente pentru această pereche și setăm ultima vânzare foarte veche,
      // dar lăsăm cantitatea de stoc la 50 ca să fie clar "stoc mort".
      run(
        `DELETE FROM sales WHERE branch_id = $1 AND product_id = $2`,
        [focsani.id, folie.id]
      );
      run(
        `UPDATE stock
         SET quantity = 50,
             last_sale_at = datetime('now', '-200 days'),
             updated_at = datetime('now')
         WHERE branch_id = $1 AND product_id = $2`,
        [focsani.id, folie.id]
      );
    }

    console.log('Seed finalizat.');
    console.log('Admin: admin@accesorii.ro / admin123');
    console.log('Manageri (parola: manager123):');
    console.log('  - manager.centru@accesorii.ro (București Centru)');
    console.log('  - manager.nord@accesorii.ro (București Nord)');
    console.log('  - manager.focsani@accesorii.ro (Focșani)');
    console.log('  - manager.ploiesti@accesorii.ro (Ploiești)');
    console.log('  - manager.brasov@accesorii.ro (Brașov)');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

seed();
