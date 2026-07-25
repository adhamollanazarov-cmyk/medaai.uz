STR = {
    "ru": {
        "welcome": (
            "Здравствуйте{name}! 👋\n\n"
            "Это *meda.ai* — запись к врачу без звонков в регистратуру.\n"
            "Опишите, что вас беспокоит — приложение подберёт нужного специалиста "
            "и покажет свободное время."
        ),
        "open_app": "🩺 Открыть meda.ai",
        "menu_app": "meda.ai",
        "choose_lang": "Выберите язык / Tilni tanlang",
        "lang_set": "Язык переключён на русский. Нажмите кнопку ниже, чтобы начать.",
        "help": (
            "Команды:\n"
            "/start — начать и открыть приложение\n"
            "/chat — AI-консультация: подберу специалиста по симптомам\n"
            "/stop — завершить консультацию\n"
            "/lang — сменить язык\n"
            "/help — помощь\n\n"
            "Внутри приложения: опишите симптомы → выберите врача → запишитесь."
        ),
        "no_public_url": (
            "⚠️ Mini App пока не настроен (не задан PUBLIC_URL). "
            "Задайте HTTPS-адрес в .env — и кнопка заработает."
        ),
        "reminder": (
            "⏰ Напоминание: завтра у вас приём.\n"
            "{specialty} — {doctor}\n🏥 {clinic}\n🗓 {when}\n\n"
            "Если планы изменились, отмените запись в приложении."
        ),
        "not_admin": "Команда доступна только администратору.",
        "chat_start": (
            "💬 *AI-консультация*\n\n"
            "Опишите, что вас беспокоит. Задам пару уточняющих вопросов "
            "и подскажу, к какому специалисту обратиться.\n\n"
            "_Это не диагноз. При тяжёлых симптомах звоните 103._\n"
            "Выйти — /stop"
        ),
        "chat_stopped": "Консультация завершена. Нажмите /chat, чтобы начать заново.",
        "chat_not_active": "Сейчас консультация не идёт. Начните её командой /chat.",
        "chat_result": "🩺 Рекомендуем специалиста: *{specialty}*",
        "chat_doctor": "• *{name}* — ★ {rating}, {price} сум\n  🏥 {clinic}",
        "chat_book_hint": "Открыть приложение, чтобы выбрать время и записаться:",
        "chat_no_doctors": "Врачей этого профиля пока нет в системе.",
        "chat_error": "Не удалось получить ответ. Попробуйте ещё раз чуть позже.",
        "chat_hint": "💬 Нужна помощь с выбором врача? Нажмите /chat.",
    },
    "uz": {
        "welcome": (
            "Assalomu alaykum{name}! 👋\n\n"
            "Bu *meda.ai* — registraturaga qoʻngʻiroq qilmasdan shifokorga yozilish.\n"
            "Sizni nima bezovta qilayotganini yozing — ilova kerakli mutaxassisni "
            "tanlab, boʻsh vaqtni koʻrsatadi."
        ),
        "open_app": "🩺 meda.ai ochish",
        "menu_app": "meda.ai",
        "choose_lang": "Tilni tanlang / Выберите язык",
        "lang_set": "Til oʻzbekchaga oʻzgartirildi. Boshlash uchun quyidagi tugmani bosing.",
        "help": (
            "Buyruqlar:\n"
            "/start — boshlash va ilovani ochish\n"
            "/chat — AI-konsultatsiya: belgilar boʻyicha mutaxassis tanlayman\n"
            "/stop — konsultatsiyani yakunlash\n"
            "/lang — tilni oʻzgartirish\n"
            "/help — yordam\n\n"
            "Ilova ichida: belgilarni yozing → shifokorni tanlang → yoziling."
        ),
        "no_public_url": (
            "⚠️ Mini App hali sozlanmagan (PUBLIC_URL yoʻq). "
            ".env faylida HTTPS manzilni kiriting — tugma ishlaydi."
        ),
        "reminder": (
            "⏰ Eslatma: ertaga qabulingiz bor.\n"
            "{specialty} — {doctor}\n🏥 {clinic}\n🗓 {when}\n\n"
            "Rejalar oʻzgargan boʻlsa, ilovada bekor qiling."
        ),
        "not_admin": "Buyruq faqat administrator uchun.",
        "chat_start": (
            "💬 *AI-konsultatsiya*\n\n"
            "Sizni nima bezovta qilayotganini yozing. Bir necha savol beraman "
            "va qaysi mutaxassisga borish kerakligini aytaman.\n\n"
            "_Bu tashxis emas. Ogʻir belgilarda 103 ga qoʻngʻiroq qiling._\n"
            "Chiqish — /stop"
        ),
        "chat_stopped": "Konsultatsiya yakunlandi. Qaytadan boshlash uchun /chat.",
        "chat_not_active": "Hozir konsultatsiya ketmayapti. /chat buyrugʻi bilan boshlang.",
        "chat_result": "🩺 Tavsiya etilgan mutaxassis: *{specialty}*",
        "chat_doctor": "• *{name}* — ★ {rating}, {price} soʻm\n  🏥 {clinic}",
        "chat_book_hint": "Vaqt tanlab yozilish uchun ilovani oching:",
        "chat_no_doctors": "Bu yoʻnalish boʻyicha hozircha shifokor yoʻq.",
        "chat_error": "Javob olinmadi. Birozdan soʻng qayta urinib koʻring.",
        "chat_hint": "💬 Shifokor tanlashda yordam kerakmi? /chat bosing.",
    },
}


def t(lang: str, key: str, **kwargs) -> str:
    d = STR.get(lang, STR["ru"])
    s = d.get(key, STR["ru"].get(key, key))
    return s.format(**kwargs) if kwargs else s
