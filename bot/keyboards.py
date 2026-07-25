"""Инлайн-клавиатуры бота.

Соглашение по callback_data: "<раздел>:<действие>[:<аргумент>]".
Telegram ограничивает callback_data 64 байтами, поэтому в них кладём только
идентификаторы, а не тексты.
"""
from datetime import timezone, timedelta

from aiogram.types import (
    InlineKeyboardMarkup, InlineKeyboardButton,
    ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove,
    WebAppInfo,
)

from i18n import t
from i18n_ui import AGE_GROUPS, REGIONS

TASHKENT = timezone(timedelta(hours=5))


def _rows(buttons, per_row=2):
    return [buttons[i:i + per_row] for i in range(0, len(buttons), per_row)]


def main_menu(lang: str, is_admin: bool, app_url: str | None) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=t(lang, "btn_find"), callback_data="cat:specs")],
        [InlineKeyboardButton(text=t(lang, "btn_chat"), callback_data="chat:start"),
         InlineKeyboardButton(text=t(lang, "btn_appts"), callback_data="appt:list")],
        [InlineKeyboardButton(text=t(lang, "btn_profile"), callback_data="prof:view")],
    ]
    if app_url:
        rows.append([InlineKeyboardButton(text=t(lang, "btn_open_app"), web_app=WebAppInfo(url=app_url))])
    if is_admin:
        rows.append([InlineKeyboardButton(text=t(lang, "btn_admin"), callback_data="adm:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def back_menu(lang: str, back_cb: str = "nav:menu") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=t(lang, "btn_back"), callback_data=back_cb),
        InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu"),
    ]])


def specialties_kb(specs: list, lang: str, prefix: str = "cat:spec") -> InlineKeyboardMarkup:
    btns = [InlineKeyboardButton(
        text=f"{s.get('emoji') or ''} {s['name_uz'] if lang == 'uz' else s['name_ru']}".strip(),
        callback_data=f"{prefix}:{s['code']}") for s in specs]
    rows = _rows(btns, 2)
    if prefix == "cat:spec":
        rows.append([InlineKeyboardButton(text=t(lang, "btn_all_doctors"), callback_data="cat:spec:all")])
        rows.append([InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def doctors_kb(docs: list, lang: str, back_cb: str = "cat:specs") -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=f"{d['name']} · ★ {d['rating']}",
                                  callback_data=f"cat:doc:{d['id']}")] for d in docs[:30]]
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data=back_cb)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def doctor_card_kb(doc: dict, lang: str, back_cb: str) -> InlineKeyboardMarkup:
    rows = []
    if doc.get("freeSlots"):
        rows.append([InlineKeyboardButton(text=t(lang, "btn_book"),
                                          callback_data=f"book:slots:{doc['id']}")])
    phone = doc.get("phone") or (doc.get("clinic") or {}).get("phone")
    if phone:
        # tel: открывает набор номера прямо из Telegram
        rows.append([InlineKeyboardButton(text=t(lang, "btn_call"),
                                          url=f"tel:{phone.replace(' ', '')}")])
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data=back_cb)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def slots_kb(slots: list, lang: str, doctor_id: int) -> InlineKeyboardMarkup:
    btns = []
    for s in slots[:40]:
        dt = _parse(s["datetime"])
        btns.append(InlineKeyboardButton(text=dt.strftime("%d.%m %H:%M"),
                                         callback_data=f"book:slot:{s['id']}"))
    rows = _rows(btns, 3)
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data=f"cat:doc:{doctor_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def phone_request_kb(lang: str) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=t(lang, "btn_share_phone"), request_contact=True)]],
        resize_keyboard=True, one_time_keyboard=True)


def remove_kb() -> ReplyKeyboardRemove:
    return ReplyKeyboardRemove()


def skip_kb(lang: str, cb: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=t(lang, "btn_skip"), callback_data=cb)]])


def age_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=_rows(
        [InlineKeyboardButton(text=a, callback_data=f"prof:age:{a}") for a in AGE_GROUPS], 3))


def regions_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=_rows(
        [InlineKeyboardButton(text=(uz if lang == "uz" else ru), callback_data=f"prof:reg:{code}")
         for code, ru, uz in REGIONS], 2))


def appointments_kb(appts: list, lang: str) -> InlineKeyboardMarkup:
    from datetime import datetime
    rows = []
    now = datetime.now(timezone.utc)
    for a in appts:
        if a["status"] == "confirmed" and _parse(a["datetime"]) > now:
            rows.append([InlineKeyboardButton(
                text=f"{t(lang, 'btn_cancel_appt')}: {a['doctor']}",
                callback_data=f"appt:cancel:{a['id']}")])
    rows.append([InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def profile_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(lang, "btn_edit_profile"), callback_data="prof:edit")],
        [InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu")]])


# ---------- админка ----------
def admin_menu_kb(lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(lang, "btn_adm_add"), callback_data="adm:add")],
        [InlineKeyboardButton(text=t(lang, "btn_adm_list"), callback_data="adm:list")],
        [InlineKeyboardButton(text=t(lang, "btn_adm_clinics"), callback_data="adm:clinics")],
        [InlineKeyboardButton(text=t(lang, "btn_adm_slots"), callback_data="adm:slots")],
        [InlineKeyboardButton(text=t(lang, "btn_adm_stats"), callback_data="adm:stats")],
        [InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu")]])


def clinics_kb(clinics: list, lang: str) -> InlineKeyboardMarkup:
    """Выбор клиники при добавлении врача."""
    rows = [[InlineKeyboardButton(text=c["name"], callback_data=f"adm:clinic:{c['id']}")] for c in clinics]
    rows.append([InlineKeyboardButton(text=t(lang, "btn_cancel_action"), callback_data="adm:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def clinics_manage_kb(clinics: list, lang: str) -> InlineKeyboardMarkup:
    """Управление клиниками: список + кнопка добавления."""
    rows = [[InlineKeyboardButton(text=c["name"], callback_data=f"adm:cl:{c['id']}")] for c in clinics]
    rows.append([InlineKeyboardButton(text=t(lang, "btn_adm_clinic_add"), callback_data="adm:cladd")])
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data="adm:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def clinic_card_kb(clinic_id: int, lang: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(lang, "adm_clinic_del"), callback_data=f"adm:cldel:{clinic_id}")],
        [InlineKeyboardButton(text=t(lang, "btn_back"), callback_data="adm:clinics")]])


def lang_pick_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🇷🇺 Русский", callback_data="lang:ru"),
        InlineKeyboardButton(text="🇺🇿 Oʻzbek", callback_data="lang:uz"),
    ]])


def admin_doctors_kb(docs: list, lang: str, action: str) -> InlineKeyboardMarkup:
    """action: 'pick' — карточка врача, 'slot' — добавить время."""
    rows = []
    for d in docs[:40]:
        mark = "" if d.get("isActive", True) else "⚪️ "
        rows.append([InlineKeyboardButton(text=f"{mark}{d['name']} · {d['specialtyName']}",
                                          callback_data=f"adm:{action}:{d['id']}")])
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data="adm:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_doctor_kb(doc: dict, lang: str) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=t(lang, "btn_adm_edit"), callback_data=f"adm:edit:{doc['id']}")]]
    if doc.get("isActive", True):
        rows.append([InlineKeyboardButton(text=t(lang, "btn_adm_del"), callback_data=f"adm:del:{doc['id']}")])
    else:
        rows.append([InlineKeyboardButton(text=t(lang, "btn_adm_restore"), callback_data=f"adm:restore:{doc['id']}")])
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data="adm:list")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_fields_kb(lang: str, doctor_id: int) -> InlineKeyboardMarkup:
    fields = [("name", "f_name"), ("spec", "f_spec"), ("exp", "f_exp"),
              ("price", "f_price"), ("phone", "f_phone"),
              ("desc_ru", "f_desc_ru"), ("desc_uz", "f_desc_uz"), ("photo", "f_photo")]
    rows = _rows([InlineKeyboardButton(text=t(lang, key), callback_data=f"adm:field:{code}:{doctor_id}")
                  for code, key in fields], 2)
    rows.append([InlineKeyboardButton(text=t(lang, "btn_back"), callback_data=f"adm:pick:{doctor_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _parse(iso: str):
    from datetime import datetime
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def local(iso: str) -> str:
    return _parse(iso).astimezone(TASHKENT).strftime("%d.%m %H:%M")
