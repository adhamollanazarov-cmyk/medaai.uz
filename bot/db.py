import asyncpg
from config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(dsn=DATABASE_URL, min_size=1, max_size=5)
    return _pool


async def close_db():
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    assert _pool is not None, "DB pool not initialised"
    return _pool


# ---- users (patients) ----
async def ensure_patient(tg_id: int, lang: str = "ru"):
    # Register the Telegram user on first interaction (persisted in Postgres).
    await pool().execute(
        """INSERT INTO patients(tg_id, lang) VALUES ($1, $2)
           ON CONFLICT (tg_id) DO NOTHING""",
        str(tg_id), lang,
    )


async def get_lang(tg_id: int):
    row = await pool().fetchrow("SELECT lang FROM patients WHERE tg_id = $1", str(tg_id))
    return row["lang"] if row else None


async def set_lang(tg_id: int, lang: str):
    await pool().execute(
        """INSERT INTO patients(tg_id, lang, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (tg_id) DO UPDATE SET lang = $2, updated_at = now()""",
        str(tg_id), lang,
    )


# ---- reminders (24h before appointment) ----
async def due_reminders():
    return await pool().fetch(
        """
        SELECT a.id, a.datetime, a.patient_tg_id,
               COALESCE(p.lang, 'ru') AS lang,
               d.name AS doctor, s.name_ru AS spec_ru, s.name_uz AS spec_uz,
               c.name AS clinic
        FROM appointments a
        JOIN doctors d ON d.id = a.doctor_id
        JOIN clinics c ON c.id = d.clinic_id
        LEFT JOIN specialties s ON s.code = d.specialty
        LEFT JOIN patients p ON p.tg_id = a.patient_tg_id
        WHERE a.status = 'confirmed' AND NOT a.reminder_sent
          AND a.patient_tg_id IS NOT NULL
          AND a.datetime > now() AND a.datetime <= now() + interval '24 hours'
        """
    )


async def mark_reminded(appt_id: int):
    await pool().execute("UPDATE appointments SET reminder_sent = TRUE WHERE id = $1", appt_id)
