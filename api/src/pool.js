import pg from 'pg';
import { config } from './config.js';

// pg parses standard URLs incl. unix-socket form: postgresql://user@/db?host=/socket/dir
export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const q = (text, params) => pool.query(text, params);

pool.on('error', (err) => console.error('pg pool error:', err.message));
