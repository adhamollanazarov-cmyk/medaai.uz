import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { pool, q } from './pool.js';
import { matchSpecialty } from './matcher.js';
import { chatReply, chatAvailable } from './chat.js';
import { specialtyName, SPECIALTY_BY_CODE } from './specialties.js';

export const app = express();
app.use(cors());
app.use(express.json());

// Express 4 не перехватывает отклонённые промисы в async-обработчиках: любая
// неожиданная ошибка БД превращается в unhandledRejection и роняет ВЕСЬ сервис,
// а не один запрос. Оборачиваем обработчики один раз здесь, вместо try/catch
// в каждом из двух десятков маршрутов.
for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
  const original = app[method].bind(app);
  app[method] = (path, ...handlers) => original(path, ...handlers.map((h) =>
    typeof h === 'function' && h.length < 4
      ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
      : h));
}

const DOCTOR_SELECT = `
  SELECT d.id, d.name, d.specialty, d.experience_years, d.price_uzs, d.rating::float AS rating,
         d.phone AS doctor_phone, d.description, d.photo_id, d.is_active,
         c.id AS clinic_id, c.name AS clinic_name, c.address_ru, c.address_uz, c.phone,
         (SELECT min(s.datetime) FROM slots s WHERE s.doctor_id = d.id AND NOT s.is_booked AND s.datetime > now()) AS next_slot,
         (SELECT count(*) FROM slots s WHERE s.doctor_id = d.id AND NOT s.is_booked AND s.datetime > now()) AS free_slots
  FROM doctors d JOIN clinics c ON c.id = d.clinic_id`;

// Patients must never see deactivated doctors; the clinic dashboard still does.
const ACTIVE_ONLY = `d.is_active IS NOT FALSE`;

function mapDoctor(r, lang = 'ru') {
  return {
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    specialtyName: specialtyName(r.specialty, lang),
    experienceYears: r.experience_years,
    priceUZS: r.price_uzs,
    rating: r.rating,
    phone: r.doctor_phone || null,
    description: r.description || null,
    // photo_id is a Telegram file_id — useless in an <img>, so we hand the
    // Mini App a proxy URL instead (see GET /api/doctors/:id/photo).
    photoUrl: r.photo_id ? `/api/doctors/${r.id}/photo` : null,
    isActive: r.is_active !== false,
    clinic: {
      id: r.clinic_id, name: r.clinic_name,
      address: lang === 'uz' ? r.address_uz : r.address_ru, phone: r.phone,
    },
    nextSlot: r.next_slot ? new Date(r.next_slot).toISOString() : null,
    freeSlots: Number(r.free_slots),
  };
}

const APPT_SELECT = `
  SELECT a.id, a.status, a.datetime, a.symptoms, a.patient_name, a.phone, a.created_at,
         d.name AS doctor, d.specialty, d.price_uzs,
         c.name AS clinic_name, c.address_ru, c.address_uz, c.phone AS clinic_phone
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  JOIN clinics c ON c.id = d.clinic_id`;

function mapAppt(r, lang = 'ru') {
  return {
    id: r.id, status: r.status,
    datetime: new Date(r.datetime).toISOString(),
    symptoms: r.symptoms, patientName: r.patient_name, phone: r.phone,
    doctor: r.doctor, specialty: r.specialty,
    specialtyName: specialtyName(r.specialty, lang), priceUZS: r.price_uzs,
    clinic: { name: r.clinic_name, address: lang === 'uz' ? r.address_uz : r.address_ru, phone: r.clinic_phone },
    createdAt: r.created_at,
  };
}

// ---------- patient API ----------
app.get('/api/health', async (req, res) => {
  try { await q('SELECT 1'); res.json({ ok: true, ts: Date.now() }); }
  catch { res.status(500).json({ ok: false, db: false }); }
});

app.get('/api/specialties', async (req, res) => {
  const { rows } = await q('SELECT id, code, name_ru, name_uz, emoji FROM specialties ORDER BY id');
  res.json(rows);
});

app.post('/api/match', async (req, res) => {
  const { text, lang = 'ru', tgId = null } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'empty_text' });
  const result = await matchSpecialty(text, lang);
  const ev = await q(
    `INSERT INTO match_events(tg_id, text, specialty, confidence, source, lang)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [tgId, String(text).slice(0, 500), result.specialty, result.confidence, result.source, lang]);
  const { rows } = await q(`${DOCTOR_SELECT} WHERE d.specialty = $1 AND ${ACTIVE_ONLY} ORDER BY d.rating DESC`, [result.specialty]);
  res.json({ ...result, matchEventId: ev.rows[0].id, doctors: rows.map((r) => mapDoctor(r, lang)) });
});

// Multi-turn triage chat. The client keeps the transcript and posts it back each
// turn (the API stays stateless). While `done` is false the assistant is still
// asking questions; once it commits to a specialty we log a match_event and
// return doctors in exactly the same shape as /api/match, so the Mini App can
// hand off to the existing slots → booking flow with no extra code.
app.post('/api/chat', async (req, res) => {
  const { history, lang = 'ru', tgId = null } = req.body || {};
  if (!Array.isArray(history) || !history.length) return res.status(400).json({ error: 'empty_history' });

  let result;
  try {
    result = await chatReply(history, lang);
  } catch (e) {
    console.error('chat error:', e.message);
    return res.status(500).json({ error: 'server' });
  }

  if (!result.specialty) return res.json({ ...result, matchEventId: null, doctors: [] });

  const firstUser = history.find((m) => m && m.role === 'user')?.content || '';
  const ev = await q(
    `INSERT INTO match_events(tg_id, text, specialty, confidence, source, lang)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [tgId, String(firstUser).slice(0, 500), result.specialty, result.confidence, `chat-${result.source}`, lang]);
  const { rows } = await q(`${DOCTOR_SELECT} WHERE d.specialty = $1 AND ${ACTIVE_ONLY} ORDER BY d.rating DESC`, [result.specialty]);
  res.json({ ...result, matchEventId: ev.rows[0].id, doctors: rows.map((r) => mapDoctor(r, lang)) });
});

// Lets the Mini App hide the chat tab when no LLM key is configured.
app.get('/api/chat/status', (req, res) => res.json({ llm: chatAvailable() }));

app.get('/api/doctors', async (req, res) => {
  const { specialty = null, clinicId = null, lang = 'ru' } = req.query;
  const { rows } = await q(
    `${DOCTOR_SELECT} WHERE ($1::text IS NULL OR d.specialty = $1)
       AND ($2::int IS NULL OR d.clinic_id = $2) AND ${ACTIVE_ONLY} ORDER BY d.rating DESC`,
    [specialty, clinicId ? Number(clinicId) : null]);
  res.json(rows.map((r) => mapDoctor(r, lang)));
});

app.get('/api/doctors/:id/slots', async (req, res) => {
  const { rows } = await q(
    `SELECT id, datetime FROM slots WHERE doctor_id = $1 AND NOT is_booked AND datetime > now() ORDER BY datetime`,
    [Number(req.params.id)]);
  res.json(rows.map((r) => ({ id: r.id, datetime: new Date(r.datetime).toISOString() })));
});

// Single doctor card — used by the bot's catalogue.
app.get('/api/doctors/:id', async (req, res) => {
  const { lang = 'ru' } = req.query;
  const { rows } = await q(`${DOCTOR_SELECT} WHERE d.id = $1 AND ${ACTIVE_ONLY}`, [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(mapDoctor(rows[0], lang));
});

// Doctor photos are uploaded in the bot and stored as a Telegram file_id.
// A browser cannot use a file_id, so we resolve it through the Telegram API and
// stream the bytes back. Requires BOT_TOKEN to be set on the API service too.
app.get('/api/doctors/:id/photo', async (req, res) => {
  if (!config.botToken) return res.status(404).end();
  const { rows } = await q('SELECT photo_id FROM doctors WHERE id = $1', [Number(req.params.id)]);
  const fileId = rows[0]?.photo_id;
  if (!fileId) return res.status(404).end();
  try {
    const meta = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const info = await meta.json();
    const filePath = info?.result?.file_path;
    if (!filePath) return res.status(404).end();
    const file = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${filePath}`);
    if (!file.ok) return res.status(404).end();
    res.set('Content-Type', file.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');   // file_id is stable
    res.send(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    console.error('photo proxy failed:', e.message);
    res.status(502).end();
  }
});

// ---------- patient profile (filled in via the bot) ----------
app.get('/api/patients/:tgId', async (req, res) => {
  const { rows } = await q(
    `SELECT tg_id, name, full_name, phone, lang, age_group, region, is_registered
     FROM patients WHERE tg_id = $1`, [String(req.params.tgId)]);
  if (!rows.length) return res.json({ registered: false });
  const p = rows[0];
  res.json({
    registered: p.is_registered === true,
    tgId: p.tg_id, name: p.name, fullName: p.full_name, phone: p.phone,
    lang: p.lang, ageGroup: p.age_group, region: p.region,
  });
});

app.post('/api/patients/:tgId', async (req, res) => {
  const { fullName = null, ageGroup = null, region = null, phone = null, lang = 'ru' } = req.body || {};
  const { rows } = await q(
    `INSERT INTO patients(tg_id, full_name, age_group, region, phone, lang, is_registered, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,now())
     ON CONFLICT (tg_id) DO UPDATE SET
       full_name = COALESCE($2, patients.full_name),
       age_group = COALESCE($3, patients.age_group),
       region    = COALESCE($4, patients.region),
       phone     = COALESCE($5, patients.phone),
       lang      = $6, is_registered = TRUE, updated_at = now()
     RETURNING full_name, age_group, region, phone`,
    [String(req.params.tgId), fullName, ageGroup, region, phone, lang]);
  res.json({ ok: true, profile: rows[0] });
});

app.post('/api/appointments', async (req, res) => {
  const { doctorId, slotId, tgId = null, name = '', phone, symptoms = '', lang = 'ru', matchEventId = null } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone_required' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const slot = await c.query('SELECT id, doctor_id, is_booked FROM slots WHERE id = $1 FOR UPDATE', [slotId]);
    if (!slot.rows.length || slot.rows[0].doctor_id !== Number(doctorId)) { await c.query('ROLLBACK'); return res.status(400).json({ error: 'bad_slot' }); }
    if (slot.rows[0].is_booked) { await c.query('ROLLBACK'); return res.status(409).json({ error: 'slot_taken' }); }
    await c.query('UPDATE slots SET is_booked = TRUE WHERE id = $1', [slotId]);
    const appt = await c.query(
      `INSERT INTO appointments(doctor_id, slot_id, datetime, patient_tg_id, patient_name, phone, symptoms, status)
       VALUES ($1,$2,(SELECT datetime FROM slots WHERE id=$2),$3,$4,$5,$6,'confirmed') RETURNING id`,
      [doctorId, slotId, tgId, name, phone, symptoms]);
    if (tgId) {
      await c.query(
        `INSERT INTO patients(tg_id, name, phone, lang, updated_at) VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (tg_id) DO UPDATE SET name = COALESCE(NULLIF($2,''), patients.name), phone = $3, lang = $4, updated_at = now()`,
        [String(tgId), name, phone, lang]);
    }
    if (matchEventId) {
      await c.query('UPDATE match_events SET booked = TRUE, appointment_id = $1 WHERE id = $2', [appt.rows[0].id, matchEventId]);
    }
    await c.query('COMMIT');
    const full = await q(`${APPT_SELECT} WHERE a.id = $1`, [appt.rows[0].id]);
    res.json({ ok: true, appointment: mapAppt(full.rows[0], lang) });
  } catch (e) {
    await c.query('ROLLBACK'); console.error('book error:', e.message);
    res.status(500).json({ error: 'server' });
  } finally { c.release(); }
});

app.get('/api/appointments', async (req, res) => {
  const { tgId, lang = 'ru' } = req.query;
  if (!tgId) return res.status(400).json({ error: 'tgId_required' });
  const { rows } = await q(`${APPT_SELECT} WHERE a.patient_tg_id = $1 ORDER BY a.datetime DESC`, [String(tgId)]);
  res.json(rows.map((r) => mapAppt(r, lang)));
});

app.post('/api/appointments/:id/cancel', async (req, res) => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const a = await c.query('SELECT slot_id FROM appointments WHERE id = $1', [Number(req.params.id)]);
    if (!a.rows.length) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'not_found' }); }
    await c.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [Number(req.params.id)]);
    await c.query('UPDATE slots SET is_booked = FALSE WHERE id = $1', [a.rows[0].slot_id]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: 'server' }); }
  finally { c.release(); }
});

// ---------- clinic dashboard API ----------
function checkClinic(req, res, next) {
  const token = req.query.token || req.headers['x-clinic-token'] || (req.body && req.body.token);
  if (token !== config.clinicToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/api/clinic/clinics', checkClinic, async (req, res) => {
  const { rows } = await q('SELECT id, name FROM clinics ORDER BY id');
  res.json(rows);
});

app.get('/api/clinic/summary', checkClinic, async (req, res) => {
  const clinicId = Number(req.query.clinicId);
  const { rows } = await q(
    `SELECT
       (SELECT count(*) FROM doctors WHERE clinic_id = $1) AS doctors,
       count(*) AS total,
       count(*) FILTER (WHERE a.status='confirmed') AS confirmed,
       count(*) FILTER (WHERE a.status='completed') AS completed,
       count(*) FILTER (WHERE a.status='cancelled') AS cancelled,
       count(*) FILTER (WHERE a.status='no_show') AS no_show,
       count(*) FILTER (WHERE a.datetime::date = now()::date AND a.status <> 'cancelled') AS today
     FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE d.clinic_id = $1`, [clinicId]);
  const r = rows[0];
  res.json({ doctors: +r.doctors, total: +r.total, confirmed: +r.confirmed, completed: +r.completed,
    cancelled: +r.cancelled, noShow: +r.no_show, today: +r.today });
});

app.get('/api/clinic/appointments', checkClinic, async (req, res) => {
  const clinicId = Number(req.query.clinicId); const lang = req.query.lang || 'ru';
  const { rows } = await q(`${APPT_SELECT} WHERE d.clinic_id = $1 ORDER BY a.datetime`, [clinicId]);
  res.json(rows.map((r) => mapAppt(r, lang)));
});

app.get('/api/clinic/doctors', checkClinic, async (req, res) => {
  const clinicId = Number(req.query.clinicId); const lang = req.query.lang || 'ru';
  const { rows } = await q(`${DOCTOR_SELECT} WHERE d.clinic_id = $1 ORDER BY d.rating DESC`, [clinicId]);
  res.json(rows.map((r) => mapDoctor(r, lang)));
});

// ---------- doctor management (used by the bot's admin panel and the dashboard) ----------
// Deactivated doctors are included here on purpose, so the admin can restore them.
app.get('/api/clinic/doctors/all', checkClinic, async (req, res) => {
  const clinicId = req.query.clinicId ? Number(req.query.clinicId) : null;
  const lang = req.query.lang || 'ru';
  const { rows } = await q(
    `${DOCTOR_SELECT} WHERE ($1::int IS NULL OR d.clinic_id = $1) ORDER BY d.is_active DESC, d.name`,
    [clinicId]);
  res.json(rows.map((r) => mapDoctor(r, lang)));
});

app.post('/api/clinic/doctors', checkClinic, async (req, res) => {
  const { clinicId, name, specialty, experienceYears = 0, priceUZS = 0,
          rating = 0, phone = null, description = null, photoId = null } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name_required' });
  if (!SPECIALTY_BY_CODE[specialty]) return res.status(400).json({ error: 'bad_specialty' });
  const cl = await q('SELECT id FROM clinics WHERE id = $1', [Number(clinicId)]);
  if (!cl.rows.length) return res.status(400).json({ error: 'bad_clinic' });
  const { rows } = await q(
    `INSERT INTO doctors(clinic_id, name, specialty, experience_years, price_uzs, rating,
                         phone, description, photo_id, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE) RETURNING id`,
    [Number(clinicId), String(name).trim(), specialty, Number(experienceYears) || 0,
     Number(priceUZS) || 0, Number(rating) || 0, phone, description, photoId]);
  const full = await q(`${DOCTOR_SELECT} WHERE d.id = $1`, [rows[0].id]);
  res.json({ ok: true, doctor: mapDoctor(full.rows[0], req.body.lang || 'ru') });
});

app.patch('/api/clinic/doctors/:id', checkClinic, async (req, res) => {
  const id = Number(req.params.id);
  const map = {
    name: 'name', specialty: 'specialty', experienceYears: 'experience_years',
    priceUZS: 'price_uzs', rating: 'rating', phone: 'phone',
    description: 'description', photoId: 'photo_id', isActive: 'is_active',
    clinicId: 'clinic_id',
  };
  const sets = []; const vals = [];
  for (const [key, col] of Object.entries(map)) {
    if (!(key in (req.body || {}))) continue;
    if (key === 'specialty' && !SPECIALTY_BY_CODE[req.body.specialty]) {
      return res.status(400).json({ error: 'bad_specialty' });
    }
    vals.push(req.body[key]);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
  vals.push(id);
  const upd = await q(`UPDATE doctors SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals);
  if (!upd.rows.length) return res.status(404).json({ error: 'not_found' });
  const full = await q(`${DOCTOR_SELECT} WHERE d.id = $1`, [id]);
  res.json({ ok: true, doctor: mapDoctor(full.rows[0], req.body.lang || 'ru') });
});

// Soft delete: a hard DELETE would cascade away past appointments and break
// both the patient's history and the clinic's statistics.
app.delete('/api/clinic/doctors/:id', checkClinic, async (req, res) => {
  const id = Number(req.params.id);
  const upd = await q('UPDATE doctors SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
  if (!upd.rows.length) return res.status(404).json({ error: 'not_found' });
  // Убираем будущее свободное время, чтобы к скрытому врачу никто не записался.
  // Слот, на который когда-то была запись (даже отменённая), удалять нельзя:
  // на него ссылается appointments.slot_id, и удаление роняет запрос.
  const freed = await q(
    `DELETE FROM slots
      WHERE doctor_id = $1 AND NOT is_booked AND datetime > now()
        AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = slots.id)
      RETURNING id`, [id]);
  res.json({ ok: true, freedSlots: freed.rowCount });
});

app.post('/api/clinic/slots', checkClinic, async (req, res) => {
  const { doctorId, datetime } = req.body || {};
  if (!doctorId || !datetime || isNaN(new Date(datetime))) return res.status(400).json({ error: 'bad_input' });
  const { rows } = await q('INSERT INTO slots(doctor_id, datetime) VALUES ($1,$2) RETURNING id, datetime',
    [Number(doctorId), new Date(datetime).toISOString()]);
  res.json({ ok: true, slot: rows[0] });
});

app.post('/api/clinic/appointments/:id/status', checkClinic, async (req, res) => {
  const { status } = req.body || {};
  const allowed = ['confirmed', 'completed', 'no_show', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'bad_status' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const a = await c.query('SELECT slot_id FROM appointments WHERE id = $1', [Number(req.params.id)]);
    if (!a.rows.length) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'not_found' }); }
    await c.query('UPDATE appointments SET status = $1 WHERE id = $2', [status, Number(req.params.id)]);
    if (status === 'cancelled') await c.query('UPDATE slots SET is_booked = FALSE WHERE id = $1', [a.rows[0].slot_id]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) { await c.query('ROLLBACK'); res.status(500).json({ error: 'server' }); }
  finally { c.release(); }
});

// ---------- static ----------
app.use('/app', express.static(path.join(config.paths.public, 'webapp')));
app.use('/clinic', express.static(path.join(config.paths.public, 'dashboard')));
app.get('/', (req, res) => res.redirect('/app'));

// Последний рубеж: отвечаем 500 на один запрос и продолжаем работать.
app.use((err, req, res, next) => {
  console.error(`route error ${req.method} ${req.path}:`, err.message);
  if (!res.headersSent) res.status(500).json({ error: 'server' });
});

// Сервис не должен умирать из-за фоновой ошибки (например, в прокси фото).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));

const SCHEMA_CANDIDATES = [
  config.paths.schema,
  path.resolve(config.paths.root, 'db', 'schema.sql'),
  path.resolve(config.paths.root, '..', 'db', 'schema.sql'),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Apply the schema on boot (idempotent: CREATE TABLE IF NOT EXISTS), waiting for
// the database to become reachable. Keeps everything in ONE long-running process.
async function ensureSchema(retries = 12) {
  for (let i = 1; i <= retries; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch (e) {
      const why = e.message || (Array.isArray(e.errors) && e.errors.map((x) => x.code || x.message).join('; ')) || e.code || String(e);
      console.log(`waiting for database (${i}/${retries}) → ${why}`);
      if (i === retries) throw e;
      await sleep(3000);
    }
  }
  const schemaPath = SCHEMA_CANDIDATES.find((p) => fs.existsSync(p));
  if (schemaPath) {
    await pool.query(fs.readFileSync(schemaPath, 'utf8'));
    console.log(`schema ensured from ${schemaPath}`);
  } else {
    console.warn('schema.sql not found — skipping auto-migrate');
  }
}

export async function startServer() {
  await ensureSchema();
  return app.listen(config.port, () => {
    console.log(`meda.ai API → http://localhost:${config.port}  (app: /app, clinic: /clinic)`);
  });
}

startServer().catch((e) => { console.error('startup failed:', e.message || e); process.exit(1); });