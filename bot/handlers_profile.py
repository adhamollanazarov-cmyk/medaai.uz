"""Анкета пациента: ФИО → возраст → регион.

Заполняется один раз, потом подставляется при записи, чтобы не спрашивать
имя и телефон каждый раз.
"""
from aiogram import Router, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import Message, CallbackQuery

import api_client as api
import db
import keyboards as kb
import ui
from i18n import t

router = Router(name="profile")


class Reg(StatesGroup):
    full_name = State()
    age = State()
    region = State()


async def start_registration(msg_or_cb, state: FSMContext, lang: str):
    await state.set_state(Reg.full_name)
    text = t(lang, "reg_intro") + "\n\n" + t(lang, "ask_name")
    if isinstance(msg_or_cb, CallbackQuery):
        await msg_or_cb.message.answer(text)
    else:
        await msg_or_cb.answer(text)


@router.callback_query(F.data == "prof:view")
async def cb_view(cb: CallbackQuery):
    lang = await ui.resolve_lang(cb.from_user)
    profile = await api.profile_get(cb.from_user.id)
    await cb.answer()
    await ui.safe_edit(cb, ui.profile_text(profile, lang), kb.profile_kb(lang))


@router.callback_query(F.data == "prof:edit")
async def cb_edit(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await cb.answer()
    await start_registration(cb, state, lang)


@router.message(Reg.full_name)
async def on_name(m: Message, state: FSMContext):
    lang = await ui.resolve_lang(m.from_user)
    name = (m.text or "").strip()
    if len(name) < 3:
        await m.answer(t(lang, "name_too_short"))
        return
    await state.update_data(full_name=name)
    await state.set_state(Reg.age)
    await m.answer(t(lang, "ask_age"), reply_markup=kb.age_kb(lang))


@router.callback_query(Reg.age, F.data.startswith("prof:age:"))
async def on_age(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    await state.update_data(age_group=cb.data.split(":")[2])
    await state.set_state(Reg.region)
    await cb.answer()
    await ui.safe_edit(cb, t(lang, "ask_region"), kb.regions_kb(lang))


@router.callback_query(Reg.region, F.data.startswith("prof:reg:"))
async def on_region(cb: CallbackQuery, state: FSMContext):
    lang = await ui.resolve_lang(cb.from_user)
    data = await state.get_data()
    await state.clear()
    saved = await api.profile_set(
        cb.from_user.id,
        fullName=data.get("full_name"), ageGroup=data.get("age_group"),
        region=cb.data.split(":")[2], lang=lang)
    await cb.answer()
    if saved is None:
        await cb.message.answer(t(lang, "api_error"))
        return
    await db.ensure_patient(cb.from_user.id, lang)
    await ui.safe_edit(cb, t(lang, "profile_saved"))
    await ui.show_menu(cb, lang)
