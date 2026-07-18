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
    },
}


def t(lang: str, key: str, **kwargs) -> str:
    d = STR.get(lang, STR["ru"])
    s = d.get(key, STR["ru"].get(key, key))
    return s.format(**kwargs) if kwargs else s
