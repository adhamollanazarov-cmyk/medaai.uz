import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import { pool, q } from './pool.js';
import { matchSpecialty } from './matcher.js';
import { specialtyName } from './specialties.js';

export const app = express();
app.use(cors());
app.use(express.json());

const DOCTOR_SELECT = `
  SELECT d.id, d.name, d.specialty, d.experience_years, d.price_uzs, d.rating::float AS rating,
         c.id AS clinic_id, c.name AS clinic_name, c.address_ru, c.address_uz, c.phone,
         (SELECT min(s.datetime) FROM slots s WHERE s.doctor_id = d.id AND NOT s.is_booked AND s.datetime > now()) AS next_slot,
         (SELECT count(*) FROM slots s WHERE s.doctor_id = d.id AND NOT s.is_booked AND s.datetime > now()) AS free_slots
  FROM doctors d JOIN clinics c ON c.id = d.clinic_id`;

function mapDoctor(r, lang = 'ru') {
  return {
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    specialtyName: specialtyName(r.specialty, lang),
    experienceYears: r.experience_years,
    priceUZS: r.price_uzs,
    rating: r.rating,
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
  const { rows } = await q(`${DOCTOR_SELECT} WHERE d.specialty = $1 ORDER BY d.rating DESC`, [result.specialty]);
  res.json({ ...result, matchEventId: ev.rows[0].id, doctors: rows.map((r) => mapDoctor(r, lang)) });
});

app.get('/api/doctors', async (req, res) => {
  const { specialty = null, clinicId = null, lang = 'ru' } = req.query;
  const { rows } = await q(
    `${DOCTOR_SELECT} WHERE ($1::text IS NULL OR d.specialty = $1)
       AND ($2::int IS NULL OR d.clinic_id = $2) ORDER BY d.rating DESC`,
    [specialty, clinicId ? Number(clinicId) : null]);
  res.json(rows.map((r) => mapDoctor(r, lang)));
});

app.get('/api/doctors/:id/slots', async (req, res) => {
  const { rows } = await q(
    `SELECT id, datetime FROM slots WHERE doctor_id = $1 AND NOT is_booked AND datetime > now() ORDER BY datetime`,
    [Number(req.params.id)]);
  res.json(rows.map((r) => ({ id: r.id, datetime: new Date(r.datetime).toISOString() })));
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

export function startServer() {
  return app.listen(config.port, () => {
    console.log(`meda.ai API → http://localhost:${config.port}  (app: /app, clinic: /clinic)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
