import asyncio
import logging
from datetime import timezone, timedelta

from aiogram import Bot, Dispatcher, F
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import CommandStart, Command
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    Message, CallbackQuery, BotCommand,
    InlineKeyboardMarkup, InlineKeyboardButton,
    WebAppInfo, MenuButtonWebApp,
)

import config
from i18n import t
import db
import analytics
import ai
import ui
import keyboards as kbd
import api_client as api
import handlers_profile
import handlers_catalog
import handlers_admin
from handlers_profile import start_registration

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("medauz-bot")

dp = Dispatcher()
TASHKENT = timezone(timedelta(hours=5))

# Порядок важен: специфичные роутеры идут раньше общего обработчика текста
# в этом модуле, иначе он перехватит ввод внутри FSM-диалогов.
dp.include_router(handlers_profile.router)
dp.include_router(handlers_catalog.router)
dp.include_router(handlers_admin.router)


# ---------- helpers ----------
# resolve_lang / miniapp_url живут в ui.py — они нужны и роутерам тоже.
resolve_lang = ui.resolve_lang
miniapp_url = ui.miniapp_url


def app_kb(lang: str):
    url = miniapp_url(lang)
    if not url:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=t(lang, "open_app"), web_app=WebAppInfo(url=url))]
    ])


async def set_menu(bot: Bot, chat_id, lang: str):
    url = miniapp_url(lang)
    if not url:
        return
    try:
        await bot.set_chat_menu_button(
            chat_id=chat_id,
            menu_button=MenuButtonWebApp(text=t(lang, "menu_app"), web_app=WebAppInfo(url=url)),
        )
    except Exception as e:
        log.warning("set_menu failed: %s", e)


def name_suffix(user) -> str:
    return f", {user.first_name}" if getattr(user, "first_name", None) else ""


# ---------- handlers ----------
@dp.message(CommandStart())
async def on_start(m: Message, state: FSMContext):
    await state.clear()
    # Язык спрашиваем явно: language_code в Telegram у многих узбекистанцев
    # стоит русский или английский, и угадывание ошибается.
    saved = await db.get_lang(m.from_user.id)
    if not saved:
        await m.answer(t(config.DEFAULT_LANG, "pick_lang"), reply_markup=kbd.lang_pick_kb())
        return
    await _after_start(m, state, saved)


async def _after_start(m: Message, state: FSMContext, lang: str):
    await db.ensure_patient(m.from_user.id, lang)
    await set_menu(m.bot, m.chat.id, lang)
    await m.answer(t(lang, "welcome", name=name_suffix(m.from_user)))

    # Новому пациенту сразу предлагаем анкету — потом запись займёт два нажатия.
    profile = await api.profile_get(m.from_user.id)
    if not (profile or {}).get("registered"):
        await start_registration(m, state, lang)
        return
    await ui.show_menu(m, lang)


@dp.message(Command("menu"))
async def on_menu(m: Message, state: FSMContext):
    lang = await resolve_lang(m.from_user)
    await state.clear()
    await ui.show_menu(m, lang)


@dp.callback_query(F.data == "nav:menu")
async def cb_menu(cq: CallbackQuery, state: FSMContext):
    lang = await resolve_lang(cq.from_user)
    await state.clear()
    await cq.answer()
    await ui.show_menu(cq, lang, edit=True)


@dp.callback_query(F.data == "chat:start")
async def cb_chat(cq: CallbackQuery, state: FSMContext):
    lang = await resolve_lang(cq.from_user)
    await state.clear()
    ai.start(cq.from_user.id)
    await cq.answer()
    await cq.message.answer(t(lang, "chat_start"))


@dp.message(Command("lang"))
async def on_lang(m: Message):
    lang = await resolve_lang(m.from_user)
    await m.answer(t(lang, "choose_lang"), reply_markup=kbd.lang_pick_kb())


@dp.callback_query(F.data.startswith("lang:"))
async def on_lang_pick(cb: CallbackQuery, state: FSMContext):
    lang = cb.data.split(":", 1)[1]
    await db.ensure_patient(cb.from_user.id, lang)
    await db.set_lang(cb.from_user.id, lang)
    # Язык един для бота и Mini App — сохраняем и в профиль.
    await api.profile_set(cb.from_user.id, lang=lang)
    await cb.answer()
    await set_menu(cb.bot, cb.message.chat.id, lang)
    await cb.message.answer(t(lang, "lang_set"))

    profile = await api.profile_get(cb.from_user.id)
    if not (profile or {}).get("registered"):
        await start_registration(cb, state, lang)
        return
    await ui.show_menu(cb, lang)


@dp.message(Command("help"))
async def on_help(m: Message):
    lang = await resolve_lang(m.from_user)
    await m.answer(t(lang, "help"))


@dp.message(Command("admin", "stats"))
async def on_admin(m: Message):
    lang = await resolve_lang(m.from_user)
    if m.from_user.id not in config.ADMIN_IDS:
        await m.answer(t(lang, "not_admin"))
        return
    data = await analytics.gather()
    await m.answer(analytics.format_report(data, lang))


# ---------- AI consultation ----------
@dp.message(Command("chat"))
async def on_chat(m: Message):
    lang = await resolve_lang(m.from_user)
    await db.ensure_patient(m.from_user.id, lang)
    ai.start(m.from_user.id)
    await m.answer(t(lang, "chat_start"))


@dp.message(Command("stop"))
async def on_stop(m: Message):
    lang = await resolve_lang(m.from_user)
    if ai.active(m.from_user.id):
        ai.reset(m.from_user.id)
        await m.answer(t(lang, "chat_stopped"))
    else:
        await m.answer(t(lang, "chat_not_active"))


def _fmt_money(n) -> str:
    return f"{int(n or 0):,}".replace(",", " ")


async def _send_chat_result(m: Message, lang: str, data: dict):
    """Показать рекомендацию и подходящих врачей. Кнопки ведут в ту же карточку
    врача, что и каталог, — оттуда работает обычная запись на приём."""
    await m.answer(t(lang, "chat_result", specialty=data.get("name") or ""))
    doctors = data.get("doctors") or []
    if not doctors:
        await m.answer(t(lang, "chat_no_doctors"))
        return
    lines = [
        t(lang, "chat_doctor",
          name=d.get("name", ""), rating=d.get("rating", 0),
          price=_fmt_money(d.get("priceUZS")),
          clinic=(d.get("clinic") or {}).get("name", ""))
        for d in doctors[:5]
    ]
    rows = [[InlineKeyboardButton(text=f"📅 {d['name']}", callback_data=f"cat:doc:{d['id']}")]
            for d in doctors[:5]]
    rows.append([InlineKeyboardButton(text=t(lang, "btn_menu"), callback_data="nav:menu")])
    await m.answer("\n\n".join(lines) + "\n\n" + t(lang, "chat_book_hint"),
                   reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@dp.message(F.text & ~F.text.startswith("/"))
async def on_text(m: Message):
    lang = await resolve_lang(m.from_user)
    await db.ensure_patient(m.from_user.id, lang)

    # Inside an active consultation every message goes to the AI.
    if ai.active(m.from_user.id):
        await m.bot.send_chat_action(m.chat.id, "typing")
        data = await ai.send(m.from_user.id, m.text, lang)
        if data is None:
            await m.answer(t(lang, "chat_error"))
            return
        if data.get("reply"):
            await m.answer(data["reply"])
        if data.get("done"):
            await _send_chat_result(m, lang, data)
        return

    # Вне консультации — просто показываем меню и подсказываем про /chat.
    await m.answer(t(lang, "chat_hint"))
    await ui.show_menu(m, lang)


# ---------- reminders ----------
async def reminders_loop(bot: Bot):
    while True:
        try:
            for r in await db.due_reminders():
                lang = r["lang"] or "ru"
                spec = r["spec_uz"] if lang == "uz" else r["spec_ru"]
                when = r["datetime"].astimezone(TASHKENT).strftime("%d.%m %H:%M")
                text = t(lang, "reminder", specialty=spec or "", doctor=r["doctor"],
                         clinic=r["clinic"], when=when)
                try:
                    await bot.send_message(int(r["patient_tg_id"]), text)
                    await db.mark_reminded(r["id"])
                except Exception as e:
                    log.warning("reminder send failed for %s: %s", r["patient_tg_id"], e)
        except Exception as e:
            log.error("reminders_loop error: %s", e)
        await asyncio.sleep(600)  # every 10 minutes


async def on_startup(bot: Bot):
    await bot.set_my_commands([
        BotCommand(command="start", description="Открыть meda.ai / meda.ai ochish"),
        BotCommand(command="menu", description="Меню / Menyu"),
        BotCommand(command="chat", description="AI-консультация / AI-konsultatsiya"),
        BotCommand(command="stop", description="Завершить консультацию / Konsultatsiyani yakunlash"),
        BotCommand(command="lang", description="Сменить язык / Tilni oʻzgartirish"),
        BotCommand(command="help", description="Помощь / Yordam"),
    ])
    if config.MINIAPP_URL or config.PUBLIC_URL:
        await set_menu(bot, None, "ru")


async def main():
    if not config.BOT_TOKEN:
        log.error("BOT_TOKEN is empty — set it in .env to run the bot.")
        return
    await db.init_db()
    bot = Bot(token=config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN))
    await on_startup(bot)
    asyncio.create_task(reminders_loop(bot))
    try:
        await dp.start_polling(bot)
    finally:
        await db.close_db()


if __name__ == "__main__":
    asyncio.run(main())
