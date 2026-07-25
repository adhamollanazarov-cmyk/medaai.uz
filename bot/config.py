import os
from dotenv import load_dotenv

# Load root .env (../.env) then local .env if present.
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, "..", ".env"))
load_dotenv()


def _admin_ids(raw: str):
    ids = set()
    for part in (raw or "").replace(";", ",").split(","):
        part = part.strip()
        if part.isdigit():
            ids.add(int(part))
    return ids


BOT_TOKEN = os.getenv("BOT_TOKEN", "")
PUBLIC_URL = (os.getenv("PUBLIC_URL", "") or "").rstrip("/")
# Full URL to the Mini App (e.g. Vercel: https://xxx.vercel.app/webapp).
# If empty, falls back to PUBLIC_URL + "/app".
MINIAPP_URL = (os.getenv("MINIAPP_URL", "") or "").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://medauz:medauz@localhost:5432/medauz")
ADMIN_IDS = _admin_ids(os.getenv("ADMIN_IDS", ""))
DEFAULT_LANG = os.getenv("DEFAULT_LANG", "ru")

# Адрес Node API. Бот ходит в него за врачами, слотами и бронями, чтобы не
# дублировать бизнес-логику (транзакция брони живёт только в API).
API_BASE = (os.getenv("API_BASE", "") or PUBLIC_URL or "http://localhost:3000").rstrip("/")

# Тот же токен, что у кабинета клиники: им бот авторизует админские операции.
CLINIC_TOKEN = os.getenv("CLINIC_DASHBOARD_TOKEN", "clinic-demo-2026")
