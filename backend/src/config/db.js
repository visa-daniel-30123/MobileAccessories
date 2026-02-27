import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// SQLite: cale fisier (ex: ./data/db.sqlite sau absoluta)
const dbPath = process.env.SQLITE_PATH || process.env.DATABASE_URL?.replace(/^file:\/\//, '') || path.join(__dirname, '../../data/db.sqlite');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Convertește placeholders PostgreSQL ($1, $2) în ? pentru SQLite
// Dacă un parametru e array, se expandează în (?,?,?) pentru IN (...)
function toSqliteParams(sql, params = []) {
  if (!params.length) return [sql, []];
  const newParams = [];
  const newSql = sql.replace(/\$(\d+)/g, (_, n) => {
    const i = parseInt(n, 10) - 1;
    if (params[i] === undefined) return '?';
    if (Array.isArray(params[i])) {
      newParams.push(...params[i]);
      return '(' + params[i].map(() => '?').join(', ') + ')';
    }
    newParams.push(params[i]);
    return '?';
  });
  return [newSql, newParams];
}

export function query(text, params = []) {
  const [sql, bindings] = toSqliteParams(text, params);
  const stmt = db.prepare(sql);
  const rows = stmt.all(...bindings);
  return { rows };
}

export function run(text, params = []) {
  const [sql, bindings] = toSqliteParams(text, params);
  return db.prepare(sql).run(...bindings);
}

export function exec(sql) {
  return db.exec(sql);
}

export default db;
