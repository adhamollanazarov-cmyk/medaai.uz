// Наполняет ТОЛЬКО справочник специальностей.
//
// Демо-врачей, клиник и слотов здесь намеренно нет: их заводит владелец через
// админ-панель бота (⚙️ Админ-панель → 🏥 Клиники / ➕ Добавить врача). Раньше
// сид вставлял 15 выдуманных докторов, и перед запуском на реальных пациентах
// их приходилось вычищать руками.
//
// Скрипт безопасен для повторного запуска: ничего не удаляет, названия
// специальностей обновляет, врачей и записи не трогает.
// Чтобы стереть данные, есть отдельный явный скрипт — src/reset.js.
//
//   node src/seed.js
import { pool } from './pool.js';
import { SPECIALTIES } from './specialties.js';

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const s of SPECIALTIES) {
      await c.query(
        `INSERT INTO specialties(code, name_ru, name_uz, emoji) VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE
           SET name_ru = EXCLUDED.name_ru,
               name_uz = EXCLUDED.name_uz,
               emoji   = EXCLUDED.emoji`,
        [s.code, s.name_ru, s.name_uz, s.emoji]);
    }
    // Sequence мог отстать, если строки когда-то вставляли с явными id.
    await c.query(
      "SELECT setval('specialties_id_seq', GREATEST((SELECT COALESCE(max(id),1) FROM specialties), 1))");
    await c.query('COMMIT');

    const { rows } = await c.query('SELECT count(*)::int AS n FROM clinics');
    console.log(`seed: справочник специальностей — ${SPECIALTIES.length} шт.`);
    if (rows[0].n === 0) {
      console.log('Клиник пока нет. Добавьте первую в боте: ⚙️ Админ-панель → 🏥 Клиники.');
    }
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

seed()
  .then(() => pool.end())
  .catch((e) => { console.error('seed failed:', e.message); pool.end(); process.exit(1); });
