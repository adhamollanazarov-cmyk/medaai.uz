"""Общие помощники хендлеров: язык, меню, форматирование карточек."""
from aiogram.types import Message, CallbackQuery

import config
import db
import keyboards as kb
from i18n import t
from i18n_ui import region_name


async def resolve_lang(user) -> str:
    lang = await db.get_lang(user.id)
    if lang:
        return lang
    code = (getattr(user, "language_code", "") or "")
    return "uz" if code.startswith("uz") else config.DEFAULT_LANG


def is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


def miniapp_url(lang: str):
    base = config.MINIAPP_URL or (f"{config.PUBLIC_URL}/app" if config.PUBLIC_URL else "")
    if not base:
        return None
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}lang={lang}"


def money(n) -> str:
    return f"{int(n or 0):,}".replace(",", " ")


def doctor_text(doc: dict, lang: str) -> str:
    phone = doc.get("phone")
    return t(lang, "doctor_card",
             name=doc["name"], spec=doc["specialtyName"],
             exp=doc.get("experienceYears", 0), rating=doc.get("rating", 0),
             clinic=(doc.get("clinic") or {}).get("name", ""),
             address=(doc.get("clinic") or {}).get("address", ""),
             price=money(doc.get("priceUZS")),
             phone=t(lang, "doctor_phone_line", phone=phone) if phone else "",
             description=doc.get("description") or "")


def profile_text(p: dict | None, lang: str) -> str:
    if not p or not p.get("registered"):
        return t(lang, "profile_empty")
    unset = t(lang, "not_set")
    return t(lang, "profile_view",
             name=p.get("fullName") or p.get("name") or unset,
             age=p.get("ageGroup") or unset,
             region=region_name(p.get("region"), lang) if p.get("region") else unset,
             phone=p.get("phone") or unset)


async def show_menu(target: Message | CallbackQuery, lang: str, edit: bool = False):
    """Показать главное меню. edit=True — заменить текущее сообщение."""
    user_id = target.from_user.id
    markup = kb.main_menu(lang, is_admin(user_id), miniapp_url(lang))
    text = t(lang, "menu_title")
    if isinstance(target, CallbackQuery):
        if edit:
            try:
                await target.message.edit_text(text, reply_markup=markup)
                return
            except Exception:
                pass                       # сообщение могло быть фото — падать нельзя
        await target.message.answer(text, reply_markup=markup)
    else:
        await target.answer(text, reply_markup=markup)


async def safe_edit(cb: CallbackQuery, text: str, markup=None):
    """edit_text падает, если текст не изменился или сообщение — фото."""
    try:
        await cb.message.edit_text(text, reply_markup=markup)
    except Exception:
        await cb.message.answer(text, reply_markup=markup)
