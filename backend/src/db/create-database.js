/**
 * SQLite: doar creează directorul pentru baza de date dacă nu există.
 * Baza în sine se creează la primul db:init.
 * Rulează: node src/db/create-database.js
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const dbPath = process.env.SQLITE_PATH || process.env.DATABASE_URL?.replace(/^file:\/\//, '') || path.join(__dirname, '../../data/db.sqlite');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  console.log('Director creat:', dir);
}
console.log('SQLite: baza de date va fi creata la npm run db:init:', dbPath);
