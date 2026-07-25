"""Тонкий клиент к Node API.

Бот сознательно НЕ ходит в базу напрямую за врачами и бронями: транзакция
бронирования (блокировка слота, защита от гонки) живёт в api/src/server.js,
и дублировать её в Python — верный способ получить двойные записи.
Прямой доступ к БД остаётся только там, где логики нет (см. db.py).

Все функции возвращают None вместо исключения, если API недоступен — хендлеры
показывают пользователю понятную ошибку вместо трейсбека.
"""
import logging
from typing import Any

import aiohttp

import config

log = logging.getLogger("medauz-bot.api")

TIMEOUT = aiohttp.ClientTimeout(total=20)


async def _request(method: str, path: str, *, admin: bool = False, **kw) -> Any:
    url = f"{config.API_BASE}{path}"
    headers = {"x-clinic-token": config.CLINIC_TOKEN} if admin else {}
    try:
        async with aiohttp.ClientSession(timeout=TIMEOUT) as s:
            async with s.request(method, url, headers=headers, **kw) as r:
                if r.status >= 400:
                    body = await r.text()
                    log.warning("%s %s → %s %s", method, path, r.status, body[:200])
                    return None
                return await r.json()
    except Exception as e:
        log.warning("API недоступен (%s %s): %s", method, url, e)
        return None


# ---------- публичное ----------
async def specialties():
    return await _request("GET", "/api/specialties") or []


async def doctors(specialty: str | None = None, lang: str = "ru"):
    path = f"/api/doctors?lang={lang}" + (f"&specialty={specialty}" if specialty else "")
    return await _request("GET", path) or []


async def doctor(doctor_id: int, lang: str = "ru"):
    return await _request("GET", f"/api/doctors/{doctor_id}?lang={lang}")


async def slots(doctor_id: int):
    return await _request("GET", f"/api/doctors/{doctor_id}/slots") or []


async def book(*, doctor_id: int, slot_id: int, tg_id: int, name: str,
               phone: str, symptoms: str = "", lang: str = "ru"):
    """Возвращает (ok, данные). ok=False при занятом слоте или ошибке."""
    url = f"{config.API_BASE}/api/appointments"
    payload = {"doctorId": doctor_id, "slotId": slot_id, "tgId": str(tg_id),
               "name": name, "phone": phone, "symptoms": symptoms, "lang": lang}
    try:
        async with aiohttp.ClientSession(timeout=TIMEOUT) as s:
            async with s.post(url, json=payload) as r:
                data = await r.json()
                # 409 — слот успели занять, пока пользователь выбирал
                return (r.status == 200, data if isinstance(data, dict) else {})
    except Exception as e:
        log.warning("бронирование не удалось: %s", e)
        return (False, {})


async def appointments(tg_id: int, lang: str = "ru"):
    return await _request("GET", f"/api/appointments?tgId={tg_id}&lang={lang}") or []


async def cancel(appointment_id: int):
    return await _request("POST", f"/api/appointments/{appointment_id}/cancel", json={})


# ---------- профиль ----------
async def profile_get(tg_id: int):
    return await _request("GET", f"/api/patients/{tg_id}")


async def profile_set(tg_id: int, **fields):
    return await _request("POST", f"/api/patients/{tg_id}", json=fields)


# ---------- админ ----------
async def clinics():
    return await _request("GET", "/api/clinic/clinics", admin=True) or []


async def doctors_all(lang: str = "ru"):
    return await _request("GET", f"/api/clinic/doctors/all?lang={lang}", admin=True) or []


async def doctor_create(**fields):
    return await _request("POST", "/api/clinic/doctors", admin=True, json=fields)


async def doctor_update(doctor_id: int, **fields):
    return await _request("PATCH", f"/api/clinic/doctors/{doctor_id}", admin=True, json=fields)


async def doctor_delete(doctor_id: int):
    return await _request("DELETE", f"/api/clinic/doctors/{doctor_id}", admin=True)


async def slot_create(doctor_id: int, datetime_iso: str):
    return await _request("POST", "/api/clinic/slots", admin=True,
                          json={"doctorId": doctor_id, "datetime": datetime_iso})
