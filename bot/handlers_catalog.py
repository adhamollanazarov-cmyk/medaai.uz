"""Каталог врачей, запись на приём и «Мои записи» прямо в переписке."""
import re

from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

import api_client as api
import keyboards as kb
import ui
from i18n import t

router = Router(name="catalog")

PHONE_RE = re.compile(r"[\d+][\d\s\-()]{7,}")


class Booking(StatesGroup):
    phone = State()
    symptoms = State()


# ---------- каталог ----------
@router.callback_query(F.data == "cat:specs")
async def cb_specs(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    specs = await api.specialties()
    await cb.answer()
    if not specs:
        await ui.safe_edit(cb, t(lang, "api_error"), kb.back_menu(lang))
        return
    await ui.safe_edit(cb, t(lang, "choose_spec"), kb.specialties_kb(specs, lang))


@router.callback_query(F.data.startswith("cat:spec:"))
async def cb_doctors(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    code = cb.data.split(":", 2)[2]
    docs = await api.doctors(None if code == "all" else code, lang)
    await state.update_data(back_list=cb.data)     # чтобы «Назад» вернулось сюда
    await cb.answer()
    if not docs:
        await ui.safe_edit(cb, t(lang, "no_doctors"), kb.back_menu(lang, "cat:specs"))
        return
    await ui.safe_edit(cb, t(lang, "doctors_title", n=len(docs)),
                       kb.doctors_kb(docs, lang, "cat:specs"))


@router.callback_query(F.data.startswith("cat:doc:"))
async def cb_doctor(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    doc = await api.doctor(int(cb.data.split(":")[2]), lang)
    await cb.answer()
    if not doc:
        await ui.safe_edit(cb, t(lang, "api_error"), kb.back_menu(lang, "cat:specs"))
        return
    data = await state.get_data()
    back = data.get("back_list", "cat:specs")
    text = ui.doctor_text(doc, lang)
    markup = kb.doctor_card_kb(doc, lang, back)
    # Фото приходит как Telegram file_id — отправляем картинкой, если оно есть.
    if doc.get("photoUrl"):
        photo_id = await _photo_file_id(doc["id"])
        if photo_id:
            try:
                await cb.message.answer_photo(photo_id, caption=text, reply_markup=markup)
                return
            except Exception:
                pass                       # file_id мог протухнуть — покажем текстом
    await ui.safe_edit(cb, text, markup)


async def _photo_file_id(doctor_id: int) -> str | None:
    """file_id хранится в БД; API отдаёт наружу только прокси-URL для браузера,
    а боту удобнее переслать сам file_id — так Telegram не качает файл заново."""
    import db
    try:
        row = await db.pool().fetchrow("SELECT photo_id FROM doctors WHERE id = $1", doctor_id)
        return row["photo_id"] if row else None
    except Exception:
        return None


# ---------- запись ----------
@router.callback_query(F.data.startswith("book:slots:"))
async def cb_slots(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    doctor_id = int(cb.data.split(":")[2])
    slots = await api.slots(doctor_id)
    await cb.answer()
    if not slots:
        await cb.message.answer(t(lang, "no_slots"))
        return
    await state.update_data(doctor_id=doctor_id)
    await cb.message.answer(t(lang, "choose_slot"), reply_markup=kb.slots_kb(slots, lang, doctor_id))


@router.callback_query(F.data.startswith("book:slot:"))
async def cb_pick_slot(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await state.update_data(slot_id=int(cb.data.split(":")[2]))
    await cb.answer()

    # Телефон из профиля — тогда не спрашиваем его снова.
    profile = await api.profile_get(cb.from_user.id) or {}
    if profile.get("phone"):
        await state.update_data(phone=profile["phone"], name=profile.get("fullName") or "")
        await state.set_state(Booking.symptoms)
        await cb.message.answer(t(lang, "ask_symptoms"),
                                reply_markup=kb.skip_kb(lang, "book:skipsym"))
        return
    await state.update_data(name=profile.get("fullName") or cb.from_user.first_name or "")
    await state.set_state(Booking.phone)
    await cb.message.answer(t(lang, "ask_phone"), reply_markup=kb.phone_request_kb(lang))


@router.message(Booking.phone, F.contact)
async def on_contact(m: Message, state: FSMContext):
    await _got_phone(m, state, m.contact.phone_number)


@router.message(Booking.phone)
async def on_phone_text(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    text = (m.text or "").strip()
    if not PHONE_RE.fullmatch(text) or len(re.sub(r"\D", "", text)) < 9:
        await m.answer(t(lang, "phone_invalid"))
        return
    await _got_phone(m, state, text)


async def _got_phone(m: Message, state: FSMContext, phone: str):
    lang = await ui.resolve_lang(m.from_user)
    await state.update_data(phone=phone)
    await api.profile_set(m.from_user.id, phone=phone, lang=lang)   # запомним на будущее
    await state.set_state(Booking.symptoms)
    await m.answer(t(lang, "ask_symptoms"), reply_markup=kb.remove_kb())
    await m.answer("…", reply_markup=kb.skip_kb(lang, "book:skipsym"))


@router.callback_query(F.data == "book:skipsym")
async def cb_skip_symptoms(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await _finish(cb.message, cb.from_user, state, "")


@router.message(Booking.symptoms)
async def on_symptoms(m: Message, state: FSMContext):
    await _finish(m, m.from_user, state, (m.text or "").strip())


async def _finish(message: Message, user, state: FSMContext, symptoms: str):
    lang = await ui.resolve_lang(user)
    data = await state.get_data()
    await state.clear()
    ok, res = await api.book(
        doctor_id=data.get("doctor_id"), slot_id=data.get("slot_id"), tg_id=user.id,
        name=data.get("name") or (user.first_name or ""), phone=data.get("phone", ""),
        symptoms=symptoms, lang=lang)
    if not ok:
        err = (res or {}).get("error")
        await message.answer(t(lang, "slot_taken") if err == "slot_taken" else t(lang, "booking_error"),
                             reply_markup=kb.remove_kb())
        return
    a = res["appointment"]
    await message.answer(
        t(lang, "booking_done", spec=a["specialtyName"], doctor=a["doctor"],
          clinic=a["clinic"]["name"], when=kb.local(a["datetime"]), price=ui.money(a["priceUZS"])),
        reply_markup=kb.remove_kb())
    await ui.show_menu(message, lang)


# ---------- мои записи ----------
@router.callback_query(F.data == "appt:list")
async def cb_appts(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    appts = await api.appointments(cb.from_user.id, lang)
    await cb.answer()
    if not appts:
        await ui.safe_edit(cb, t(lang, "appts_empty"), kb.back_menu(lang))
        return
    icons = {"confirmed": "st_confirmed", "cancelled": "st_cancelled",
             "completed": "st_completed", "no_show": "st_no_show"}
    lines = [t(lang, "appt_line", status=t(lang, icons.get(a["status"], "st_confirmed")),
               doctor=a["doctor"], spec=a["specialtyName"],
               clinic=a["clinic"]["name"], when=kb.local(a["datetime"])) for a in appts]
    await ui.safe_edit(cb, "\n\n".join(lines), kb.appointments_kb(appts, lang))


@router.callback_query(F.data.startswith("appt:cancel:"))
async def cb_cancel(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    await api.cancel(int(cb.data.split(":")[2]))
    await cb.answer(t(lang, "cancel_done"), show_alert=True)
    await cb_appts(cb)
