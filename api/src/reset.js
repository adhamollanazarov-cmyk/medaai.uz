// ОПАСНО: стирает врачей, клиники, слоты, записи и пациентов.
// Оставляет только справочник специальностей.
//
// Зачем: убрать демо-данные со старого сида перед запуском на реальных
// пациентах. Отдельным скриптом — чтобы это нельзя было сделать случайно,
// поставив seed в стартовую команду.
//
//   node src/reset.js --yes
//
// Без флага --yes скрипт только покажет, что будет удалено, и выйдет.
import { pool } from './pool.js';

const CONFIRMED = process.argv.includes('--yes');

async function main() {
  const c = await pool.connect();
  try {
    const { rows } = await c.query(`
      SELECT (SELECT count(*) FROM doctors)      AS doctors,
             (SELECT count(*) FROM clinics)      AS clinics,
             (SELECT count(*) FROM slots)        AS slots,
             (SELECT count(*) FROM appointments) AS appointments,
             (SELECT count(*) FROM patients)     AS patients,
             (SELECT count(*) FROM match_events) AS match_events`);
    const n = rows[0];
    console.log('Будет удалено:');
    console.log(`  врачей:      ${n.doctors}`);
    console.log(`  клиник:      ${n.clinics}`);
    console.log(`  слотов:      ${n.slots}`);
    console.log(`  записей:     ${n.appointments}`);
    console.log(`  пациентов:   ${n.patients}`);
    console.log(`  AI-подборов: ${n.match_events}`);
    console.log('  специальности сохраняются');

    if (!CONFIRMED) {
      console.log('\nНичего не удалено. Для подтверждения запустите: node src/reset.js --yes');
      return;
    }

    await c.query('BEGIN');
    // Порядок важен: сначала то, что ссылается на другие таблицы.
    await c.query('TRUNCATE match_events, appointments, slots, doctors, clinics, patients RESTART IDENTITY CASCADE');
    await c.query('COMMIT');
    console.log('\nГотово. База очищена, справочник специальностей на месте.');
    console.log('Дальше: в боте ⚙️ Админ-панель → 🏥 Клиники → добавьте клинику, затем врачей.');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('reset failed:', e.message); pool.end(); process.exit(1); });
