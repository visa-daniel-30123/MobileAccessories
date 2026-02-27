import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  exec(sql);
  console.log('Schema SQLite initializata.');
}

initDb().catch((e) => { console.error(e); process.exit(1); });
