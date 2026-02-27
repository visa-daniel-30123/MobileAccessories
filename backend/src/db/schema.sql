-- Schema SQLite: mall accesorii telefon
-- Baza unica, toate sucursalele in acelasi fisier

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT,
  transport_cost_per_unit REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(name, city)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  branch_id INTEGER REFERENCES branches(id),
  full_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock (
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  last_sale_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sold_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sales_branch_product_sold ON sales(branch_id, product_id, sold_at);

CREATE TABLE IF NOT EXISTS transfer_costs (
  from_branch_id INTEGER NOT NULL REFERENCES branches(id),
  to_branch_id INTEGER NOT NULL REFERENCES branches(id),
  cost_per_unit REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (from_branch_id, to_branch_id),
  CHECK (from_branch_id != to_branch_id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_branch_id INTEGER NOT NULL REFERENCES branches(id),
  to_branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'draft',
  cost_estimate REAL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_transfers_from_branch ON transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_branch ON transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

-- View: zile fara vanzare per (branch, product) + medie vanzari 3 luni
DROP VIEW IF EXISTS v_stock_with_days_no_sale;
CREATE VIEW v_stock_with_days_no_sale AS
SELECT
  s.branch_id,
  s.product_id,
  s.quantity,
  s.last_sale_at,
  s.updated_at,
  CAST(julianday('now') - julianday(COALESCE(s.last_sale_at, '1970-01-01')) AS INTEGER) AS days_since_last_sale,
  COALESCE(m.avg_monthly_3m, 0) AS avg_monthly_3m,
  CASE
    WHEN s.quantity > 0 AND (
      s.last_sale_at IS NULL
      OR (julianday('now') - julianday(s.last_sale_at)) >= 100
      OR s.quantity > COALESCE(m.avg_monthly_3m, 0)
    ) THEN 1
    ELSE 0
  END AS is_dead_stock
FROM stock s
LEFT JOIN (
  SELECT
    branch_id,
    product_id,
    (SUM(quantity) / 3.0) AS avg_monthly_3m
  FROM sales
  WHERE sold_at >= date('now','-90 days')
  GROUP BY branch_id, product_id
) m
  ON m.branch_id = s.branch_id AND m.product_id = s.product_id;
