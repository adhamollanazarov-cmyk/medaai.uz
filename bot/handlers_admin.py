"""Админ-панель: добавление, редактирование и скрытие врачей, слоты, статистика.

Все изменения идут через API с админ-токеном — так одни и те же правила
валидации работают и для бота, и для веб-кабинета клиники.
"""
import logging
from datetime import datetime, timedelta

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

import analytics
import api_client as api
import keyboards as kb
import ui
from i18n import t
from keyboards import TASHKENT

log = logging.getLogger("medauz-bot.admin")
router = Router(name="admin")


class AddDoctor(StatesGroup):
    clinic = State()
    name = State()
    specialty = State()
    experience = State()
    price = State()
    phone = State()
    description = State()
    photo = State()


class EditDoctor(StatesGroup):
    value = State()


class AddSlot(StatesGroup):
    datetime_ = State()


def _guard(user_id: int) -> bool:
    return ui.is_admin(user_id)


@router.callback_query(F.data == "adm:menu")
async def cb_menu(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    await state.clear()
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "admin_menu"), kb.admin_menu_kb(lang))


@router.callback_query(F.data == "adm:stats")
async def cb_stats(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    await cb.answer()
    data = await analytics.gather()
    await ui.safe_edit(cb, analytics.format_report(data, lang), kb.back_menu(lang, "adm:menu"))


# ---------- добавление врача ----------
@router.callback_query(F.data == "adm:add")
async def cb_add(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    clinics = await api.clinics()
    await cb.answer()
    if not clinics:
        await ui.safe_edit(cb, t(lang, "api_error"), kb.back_menu(lang, "adm:menu"))
        return
    await state.set_state(AddDoctor.clinic)
    await ui.safe_edit(cb, t(lang, "adm_choose_clinic"), kb.clinics_kb(clinics, lang))


@router.callback_query(AddDoctor.clinic, F.data.startswith("adm:clinic:"))
async def cb_clinic(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await state.update_data(clinic_id=int(cb.data.split(":")[2]))
    await state.set_state(AddDoctor.name)
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "adm_ask_name"))


@router.message(AddDoctor.name)
async def on_name(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    name = (m.text or "").strip()
    if len(name) < 3:
        await m.answer(t(lang, "name_too_short"))
        return
    await state.update_data(name=name)
    await state.set_state(AddDoctor.specialty)
    specs = await api.specialties()
    await m.answer(t(lang, "adm_ask_spec"), reply_markup=kb.specialties_kb(specs, lang, "adm:spec"))


@router.callback_query(AddDoctor.specialty, F.data.startswith("adm:spec:"))
async def cb_spec(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await state.update_data(specialty=cb.data.split(":", 2)[2])
    await state.set_state(AddDoctor.experience)
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "adm_ask_exp"))


@router.message(AddDoctor.experience)
async def on_exp(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    n = _to_int(m.text)
    if n is None:
        await m.answer(t(lang, "adm_need_number"))
        return
    await state.update_data(experience=n)
    await state.set_state(AddDoctor.price)
    await m.answer(t(lang, "adm_ask_price"))


@router.message(AddDoctor.price)
async def on_price(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    n = _to_int(m.text)
    if n is None:
        await m.answer(t(lang, "adm_need_number"))
        return
    await state.update_data(price=n)
    await state.set_state(AddDoctor.phone)
    await m.answer(t(lang, "adm_ask_phone"), reply_markup=kb.skip_kb(lang, "adm:skip:phone"))


@router.message(AddDoctor.phone)
async def on_phone(m: Message, state: FSMContext):
    await state.update_data(phone=(m.text or "").strip())
    await _ask_desc(m, state, await ui.resolve_lang(m.from_user))


@router.callback_query(AddDoctor.phone, F.data == "adm:skip:phone")
async def cb_skip_phone(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await _ask_desc(cb.message, state, await ui.resolve_lang(cb.from_user))


async def _ask_desc(m: Message, state: FSMContext, lang: str):
    await state.set_state(AddDoctor.description)
    await m.answer(t(lang, "adm_ask_desc"), reply_markup=kb.skip_kb(lang, "adm:skip:desc"))


@router.message(AddDoctor.description)
async def on_desc(m: Message, state: FSMContext):
    await state.update_data(description=(m.text or "").strip())
    await _ask_photo(m, state, await ui.resolve_lang(m.from_user))


@router.callback_query(AddDoctor.description, F.data == "adm:skip:desc")
async def cb_skip_desc(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await _ask_photo(cb.message, state, await ui.resolve_lang(cb.from_user))


async def _ask_photo(m: Message, state: FSMContext, lang: str):
    await state.set_state(AddDoctor.photo)
    await m.answer(t(lang, "adm_ask_photo"), reply_markup=kb.skip_kb(lang, "adm:skip:photo"))


@router.message(AddDoctor.photo, F.photo)
async def on_photo(m: Message, state: FSMContext):
    # Берём самый большой размер — его же покажет мини-апп через прокси.
    await state.update_data(photo_id=m.photo[-1].file_id)
    await _save_doctor(m, m.from_user, state)


@router.callback_query(AddDoctor.photo, F.data == "adm:skip:photo")
async def cb_skip_photo(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await _save_doctor(cb.message, cb.from_user, state)


async def _save_doctor(m: Message, user, state: FSMContext):
    lang = await ui.resolve_lang(user)
    d = await state.get_data()
    await state.clear()
    res = await api.doctor_create(
        clinicId=d.get("clinic_id"), name=d.get("name"), specialty=d.get("specialty"),
        experienceYears=d.get("experience", 0), priceUZS=d.get("price", 0),
        phone=d.get("phone") or None, description=d.get("description") or None,
        photoId=d.get("photo_id"), lang=lang)
    if not res:
        await m.answer(t(lang, "api_error"))
        return
    await m.answer(t(lang, "adm_added", name=res["doctor"]["name"]),
                   reply_markup=kb.admin_menu_kb(lang))


# ---------- список и карточка ----------
async def _render_list(cb: CallbackQuery, lang: str):
    docs = await api.doctors_all(lang)
    if not docs:
        await ui.safe_edit(cb, t(lang, "no_doctors"), kb.back_menu(lang, "adm:menu"))
        return
    await ui.safe_edit(cb, t(lang, "adm_choose_doctor"), kb.admin_doctors_kb(docs, lang, "pick"))


@router.callback_query(F.data == "adm:list")
async def cb_list(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    await state.clear()
    await cb.answer()
    await _render_list(cb, lang)


@router.callback_query(F.data.startswith("adm:pick:"))
async def cb_pick(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    await cb.answer()
    await _render_card(cb, lang, int(cb.data.split(":")[2]))


async def _render_card(cb: CallbackQuery, lang: str, doc_id: int):
    docs = await api.doctors_all(lang)
    doc = next((d for d in docs if d["id"] == doc_id), None)
    if not doc:
        await ui.safe_edit(cb, t(lang, "api_error"), kb.back_menu(lang, "adm:list"))
        return
    text = t(lang, "adm_doctor_actions", name=doc["name"], spec=doc["specialtyName"],
             price=ui.money(doc["priceUZS"]),
             status=t(lang, "adm_active" if doc.get("isActive", True) else "adm_inactive"))
    await ui.safe_edit(cb, text, kb.admin_doctor_kb(doc, lang))


@router.callback_query(F.data.startswith("adm:del:"))
async def cb_del(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    await api.doctor_delete(int(cb.data.split(":")[2]))
    await cb.answer(t(lang, "adm_deleted"), show_alert=True)
    await _render_list(cb, lang)


@router.callback_query(F.data.startswith("adm:restore:"))
async def cb_restore(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    await api.doctor_update(int(cb.data.split(":")[2]), isActive=True)
    await cb.answer(t(lang, "adm_updated"), show_alert=True)
    await _render_list(cb, lang)


# ---------- редактирование ----------
FIELD_MAP = {"name": "name", "spec": "specialty", "exp": "experienceYears",
             "price": "priceUZS", "phone": "phone", "desc": "description", "photo": "photoId"}


@router.callback_query(F.data.startswith("adm:edit:"))
async def cb_edit(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    doc_id = int(cb.data.split(":")[2])
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "adm_choose_field"), kb.admin_fields_kb(lang, doc_id))


@router.callback_query(F.data.startswith("adm:field:"))
async def cb_field(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    _, _, code, doc_id = cb.data.split(":")
    await state.update_data(edit_doc=int(doc_id), edit_field=code)
    await cb.answer()
    if code == "spec":
        specs = await api.specialties()
        await ui.safe_edit(cb, t(lang, "adm_ask_spec"),
                           kb.specialties_kb(specs, lang, "adm:setspec"))
        return
    await state.set_state(EditDoctor.value)
    await ui.safe_edit(cb, t(lang, "adm_ask_value"))


@router.callback_query(F.data.startswith("adm:setspec:"))
async def cb_setspec(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    data = await state.get_data()
    await api.doctor_update(data["edit_doc"], specialty=cb.data.split(":", 2)[2])
    await state.clear()
    await cb.answer(t(lang, "adm_updated"), show_alert=True)
    await _render_card(cb, lang, data["edit_doc"])


@router.message(EditDoctor.value, F.photo)
async def on_edit_photo(m: Message, state: FSMContext):
    data = await state.get_data()
    if data.get("edit_field") != "photo":
        return
    await _apply_edit(m, state, m.photo[-1].file_id)


@router.message(EditDoctor.value)
async def on_edit_value(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    data = await state.get_data()
    raw = (m.text or "").strip()
    if data.get("edit_field") in ("exp", "price"):
        n = _to_int(raw)
        if n is None:
            await m.answer(t(lang, "adm_need_number"))
            return
        raw = n
    await _apply_edit(m, state, raw)


async def _apply_edit(m: Message, state: FSMContext, value):
    lang = await ui.resolve_lang(m.from_user)
    data = await state.get_data()
    await state.clear()
    field = FIELD_MAP.get(data.get("edit_field"))
    res = await api.doctor_update(data["edit_doc"], **{field: value})
    await m.answer(t(lang, "adm_updated") if res else t(lang, "api_error"),
                   reply_markup=kb.admin_menu_kb(lang))


# ---------- слоты ----------
@router.callback_query(F.data == "adm:slots")
async def cb_slots(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    if not _guard(cb.from_user.id):
        await cb.answer(t(lang, "not_admin"), show_alert=True)
        return
    docs = [d for d in await api.doctors_all(lang) if d.get("isActive", True)]
    await cb.answer()
    if not docs:
        await ui.safe_edit(cb, t(lang, "no_doctors"), kb.back_menu(lang, "adm:menu"))
        return
    await ui.safe_edit(cb, t(lang, "adm_choose_doctor"), kb.admin_doctors_kb(docs, lang, "slot"))


@router.callback_query(F.data.startswith("adm:slot:"))
async def cb_slot_doctor(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await state.update_data(slot_doctor=int(cb.data.split(":")[2]))
    await state.set_state(AddSlot.datetime_)
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "adm_ask_slot"))


@router.message(AddSlot.datetime_)
async def on_slot_dt(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    dt = _parse_dt((m.text or "").strip())
    if dt is None:
        await m.answer(t(lang, "adm_bad_datetime"))
        return
    if dt <= datetime.now(TASHKENT):
        await m.answer(t(lang, "adm_slot_past"))
        return
    data = await state.get_data()
    await state.clear()
    res = await api.slot_create(data["slot_doctor"], dt.isoformat())
    if not res:
        await m.answer(t(lang, "api_error"))
        return
    doc = await api.doctor(data["slot_doctor"], lang)
    await m.answer(t(lang, "adm_slot_added", when=dt.strftime("%d.%m %H:%M"),
                     doctor=(doc or {}).get("name", "")),
                   reply_markup=kb.admin_menu_kb(lang))


# ---------- утилиты ----------
def _to_int(text):
    try:
        return int(str(text).strip().replace(" ", ""))
    except (TypeError, ValueError):
        return None


def _parse_dt(text: str):
    """ДД.ММ ЧЧ:ММ → datetime в ташкентском времени. Год подбирается сам:
    если дата уже прошла, значит имеется в виду следующий год."""
    try:
        day, time_part = text.split()
        d, mo = (int(x) for x in day.split("."))
        h, mi = (int(x) for x in time_part.split(":"))
    except (ValueError, AttributeError):
        return None
    now = datetime.now(TASHKENT)
    try:
        dt = datetime(now.year, mo, d, h, mi, tzinfo=TASHKENT)
    except ValueError:
        return None
    if dt < now - timedelta(days=1):
        try:
            dt = dt.replace(year=now.year + 1)
        except ValueError:
            return None
    return dt

