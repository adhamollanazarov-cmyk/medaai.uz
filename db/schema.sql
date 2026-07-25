-- meda.ai shared schema (PostgreSQL). Used by both the Node API and the aiogram bot.

CREATE TABLE IF NOT EXISTS specialties (
  id       SERIAL PRIMARY KEY,
  code     TEXT UNIQUE NOT NULL,
  name_ru  TEXT NOT NULL,
  name_uz  TEXT NOT NULL,
  emoji    TEXT
);

CREATE TABLE IF NOT EXISTS clinics (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  address_ru  TEXT,
  address_uz  TEXT,
  phone       TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
  id                SERIAL PRIMARY KEY,
  clinic_id         INT REFERENCES clinics(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  specialty         TEXT REFERENCES specialties(code),
  experience_years  INT DEFAULT 0,
  price_uzs         INT DEFAULT 0,
  rating            NUMERIC(2,1) DEFAULT 0
);

-- Telegram users (patients). Persisted on first booking / interaction.
CREATE TABLE IF NOT EXISTS patients (
  tg_id       TEXT PRIMARY KEY,
  name        TEXT,
  phone       TEXT,
  lang        TEXT DEFAULT 'ru',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slots (
  id         SERIAL PRIMARY KEY,
  doctor_id  INT REFERENCES doctors(id) ON DELETE CASCADE,
  datetime   TIMESTAMPTZ NOT NULL,
  is_booked  BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS appointments (
  id             SERIAL PRIMARY KEY,
  doctor_id      INT REFERENCES doctors(id),
  slot_id        INT REFERENCES slots(id),
  datetime       TIMESTAMPTZ NOT NULL,
  patient_tg_id  TEXT,
  patient_name   TEXT,
  phone          TEXT,
  symptoms       TEXT,
  status         TEXT DEFAULT 'confirmed',   -- confirmed | completed | no_show | cancelled
  reminder_sent  BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Every AI symptom-match, so we can measure "symptom search -> booking" conversion.
CREATE TABLE IF NOT EXISTS match_events (
  id              SERIAL PRIMARY KEY,
  tg_id           TEXT,
  text            TEXT,
  specialty       TEXT,
  confidence      NUMERIC,
  source          TEXT,
  lang            TEXT,
  booked          BOOLEAN DEFAULT FALSE,
  appointment_id  INT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_status  ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appt_created ON appointments(created_at);
CREATE INDEX IF NOT EXISTS idx_appt_dt      ON appointments(datetime);
CREATE INDEX IF NOT EXISTS idx_slots_doc    ON slots(doctor_id, is_booked);
CREATE INDEX IF NOT EXISTS idx_match_created ON match_events(created_at);

-- ===== v3: доктор-карточка и профиль пациента =====
-- Добавлено при слиянии со старым ботом: телефон/описание/фото врача и
-- анкета пациента. ADD COLUMN IF NOT EXISTS — безопасно на боевой базе,
-- существующие данные не затрагиваются.

ALTER TABLE doctors  ADD COLUMN IF NOT EXISTS phone       TEXT;
ALTER TABLE doctors  ADD COLUMN IF NOT EXISTS description TEXT;
-- Telegram file_id: врач добавляется фото прямо в боте.
-- Mini App получает картинку через прокси GET /api/doctors/:id/photo.
ALTER TABLE doctors  ADD COLUMN IF NOT EXISTS photo_id    TEXT;
-- Врача не удаляют физически (иначе осыпятся прошлые записи) — деактивируют.
ALTER TABLE doctors  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS full_name     TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS age_group     TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS region        TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(is_active, specialty);
