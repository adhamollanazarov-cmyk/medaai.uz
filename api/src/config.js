import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// load root .env (../../.env) then local
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://medauz:medauz@localhost:5432/medauz',
  clinicToken: process.env.CLINIC_DASHBOARD_TOKEN || 'clinic-demo-2026',
  // Needed ONLY to serve doctor photos: they are uploaded in the bot and stored
  // as Telegram file_id, which the browser cannot resolve on its own.
  botToken: process.env.BOT_TOKEN || '',
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
  },
  paths: {
    root: path.resolve(__dirname, '..'),
    public: path.resolve(__dirname, '..', 'public'),
    schema: path.resolve(__dirname, '..', 'db', 'schema.sql'),
  },
};
