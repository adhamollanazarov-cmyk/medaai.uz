import { pool } from './pool.js';
import { SPECIALTIES } from './specialties.js';

const CLINICS = [
  { id: 1, name: 'Shifo Med', address_ru: 'Ташкент, Юнусабад, ул. Амира Темура 12',
    address_uz: 'Toshkent, Yunusobod, Amir Temur koʻch. 12', phone: '+998 71 200-10-10' },
  { id: 2, name: 'Salomat Clinic', address_ru: 'Ташкент, Мирзо-Улугбек, ул. Буюк Ипак Йули 45',
    address_uz: 'Toshkent, Mirzo Ulugʻbek, Buyuk Ipak Yoʻli 45', phone: '+998 71 200-20-20' },
  { id: 3, name: 'Med City', address_ru: 'Ташкент, Чиланзар, ул. Бунёдкор 78',
    address_uz: 'Toshkent, Chilonzor, Bunyodkor koʻch. 78', phone: '+998 71 200-30-30' },
];

const DOCTORS = [
  { id: 1, clinicId: 1, name: 'Азиза Каримова', specialty: 'therapist', exp: 12, price: 90000, rating: 4.8 },
  { id: 2, clinicId: 1, name: 'Бекзод Рахимов', specialty: 'cardiologist', exp: 18, price: 150000, rating: 4.9 },
  { id: 3, clinicId: 1, name: 'Дилноза Юсупова', specialty: 'dentist', exp: 9, price: 120000, rating: 4.7 },
  { id: 4, clinicId: 1, name: 'Санжар Алиев', specialty: 'neurologist', exp: 15, price: 140000, rating: 4.8 },
  { id: 5, clinicId: 2, name: 'Гулнора Собирова', specialty: 'dermatologist', exp: 11, price: 110000, rating: 4.6 },
  { id: 6, clinicId: 2, name: 'Фаррух Нурматов', specialty: 'gastroenterologist', exp: 14, price: 130000, rating: 4.7 },
  { id: 7, clinicId: 2, name: 'Малика Тошева', specialty: 'pediatrician', exp: 20, price: 100000, rating: 4.9 },
  { id: 8, clinicId: 2, name: 'Икром Хамидов', specialty: 'ent', exp: 10, price: 100000, rating: 4.5 },
  { id: 9, clinicId: 3, name: 'Нигора Иброхимова', specialty: 'gynecologist', exp: 16, price: 140000, rating: 4.8 },
  { id: 10, clinicId: 3, name: 'Тимур Ашуров', specialty: 'orthopedist', exp: 13, price: 130000, rating: 4.6 },
  { id: 11, clinicId: 3, name: 'Шахло Мирзаева', specialty: 'ophthalmologist', exp: 8, price: 110000, rating: 4.7 },
  { id: 12, clinicId: 3, name: 'Отабек Юлдашев', specialty: 'endocrinologist', exp: 17, price: 150000, rating: 4.8 },
  { id: 13, clinicId: 1, name: 'Зарина Хакимова', specialty: 'therapist', exp: 6, price: 80000, rating: 4.5 },
  { id: 14, clinicId: 2, name: 'Рустам Каюмов', specialty: 'urologist', exp: 19, price: 140000, rating: 4.7 },
  { id: 15, clinicId: 3, name: 'Феруза Азимова', specialty: 'psychotherapist', exp: 12, price: 160000, rating: 4.9 },
];

function buildSlots(days = 7) {
  const slots = [];
  const hours = [9, 10, 11, 12, 14, 15, 16, 17];
  const now = new Date();
  for (const doc of DOCTORS) {
    for (let d = 0; d < days; d++) {
      const day = new Date(now); day.setDate(now.getDate() + d);
      if (day.getDay() === 0) continue;
      for (const h of hours) {
        if ((doc.id + h + d) % 3 === 0) continue;
        const dt = new Date(day); dt.setHours(h, 0, 0, 0);
        if (dt <= now) continue;
        slots.push({ doctorId: doc.id, datetime: dt.toISOString() });
      }
    }
  }
  return slots;
}

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('TRUNCATE match_events, appointments, slots, doctors, clinics, specialties, patients RESTART IDENTITY CASCADE');

    for (const s of SPECIALTIES) {
      await c.query('INSERT INTO specialties(code, name_ru, name_uz, emoji) VALUES ($1,$2,$3,$4)',
        [s.code, s.name_ru, s.name_uz, s.emoji]);
    }
    for (const cl of CLINICS) {
      await c.query('INSERT INTO clinics(id, name, address_ru, address_uz, phone) VALUES ($1,$2,$3,$4,$5)',
        [cl.id, cl.name, cl.address_ru, cl.address_uz, cl.phone]);
    }
    for (const d of DOCTORS) {
      await c.query(
        'INSERT INTO doctors(id, clinic_id, name, specialty, experience_years, price_uzs, rating) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [d.id, d.clinicId, d.name, d.specialty, d.exp, d.price, d.rating]);
    }
    // keep serial sequences in sync after explicit ids
    await c.query("SELECT setval('clinics_id_seq', (SELECT max(id) FROM clinics))");
    await c.query("SELECT setval('doctors_id_seq', (SELECT max(id) FROM doctors))");

    const slots = buildSlots(7);
    for (const s of slots) {
      await c.query('INSERT INTO slots(doctor_id, datetime) VALUES ($1,$2)', [s.doctorId, s.datetime]);
    }
    await c.query('COMMIT');
    console.log(`seed: ${CLINICS.length} clinics, ${DOCTORS.length} doctors, ${slots.length} slots.`);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

seed().then(() => pool.end()).catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
