import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Works whether the API is deployed as its own root (api/db/schema.sql — e.g. Railway
// with Root Directory = api) or from the repo root (db/schema.sql).
const CANDIDATES = [
  config.paths.schema,
  path.resolve(__dirname, '..', 'db', 'schema.sql'),
  path.resolve(__dirname, '..', '..', 'db', 'schema.sql'),
];

async function migrate() {
  const schemaPath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!schemaPath) throw new Error(`schema.sql not found. Looked in:\n  ${CANDIDATES.join('\n  ')}`);
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log(`migrate: schema applied from ${schemaPath}`);
}

migrate().then(() => pool.end()).catch((e) => { console.error('migrate failed:', e.message); process.exit(1); });
