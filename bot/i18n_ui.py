# Строки интерфейса бота (меню, каталог, запись, профиль, админка).
# Вынесено отдельно от i18n.py, чтобы тот остался читаемым: здесь их много.
# i18n.py подмешивает этот словарь в STR при импорте.

AGE_GROUPS = ["0-17", "18-25", "26-40", "41-60", "60+"]

REGIONS = [
    ("tashkent", "Ташкент", "Toshkent"),
    ("tash_reg", "Ташкентская обл.", "Toshkent vil."),
    ("samarkand", "Самарканд", "Samarqand"),
    ("bukhara", "Бухара", "Buxoro"),
    ("andijan", "Андижан", "Andijon"),
    ("fergana", "Фергана", "Fargʻona"),
    ("namangan", "Наманган", "Namangan"),
    ("kashkadarya", "Кашкадарья", "Qashqadaryo"),
    ("surkhandarya", "Сурхандарья", "Surxondaryo"),
    ("jizzakh", "Джизак", "Jizzax"),
    ("sirdarya", "Сырдарья", "Sirdaryo"),
    ("navoi", "Навои", "Navoiy"),
    ("khorezm", "Хорезм", "Xorazm"),
    ("karakalpakstan", "Каракалпакстан", "Qoraqalpogʻiston"),
]


def region_name(code: str, lang: str) -> str:
    for c, ru, uz in REGIONS:
        if c == code:
            return uz if lang == "uz" else ru
    return code


UI = {
    "ru": {
        # --- главное меню ---
        "menu_title": "Главное меню",
        "btn_find": "🔍 Найти врача",
        "btn_appts": "📅 Мои записи",
        "btn_chat": "💬 AI-консультация",
        "btn_profile": "👤 Профиль",
        "btn_admin": "⚙️ Админ-панель",
        "btn_open_app": "🩺 Открыть приложение",
        "btn_back": "◀️ Назад",
        "btn_menu": "🏠 В меню",
        "btn_skip": "Пропустить",
        "btn_cancel_action": "✖️ Отмена",
        "cancelled": "Отменено.",

        # --- каталог ---
        "choose_spec": "Выберите специальность:",
        "btn_all_doctors": "📋 Все врачи",
        "no_doctors": "Врачей пока нет.",
        "doctors_title": "Найдено врачей: {n}",
        "doctor_card": (
            "*{name}*\n"
            "{spec} · опыт {exp} лет · ★ {rating}\n"
            "🏥 {clinic}\n"
            "📍 {address}\n"
            "💰 {price} сум\n"
            "{phone}{description}"
        ),
        "doctor_phone_line": "📞 {phone}\n",
        "btn_book": "📅 Записаться",
        "btn_call": "📞 Позвонить",
        "free_slots": "Свободного времени: {n}",

        # --- запись ---
        "choose_slot": "Выберите время приёма:",
        "no_slots": "У этого врача нет свободного времени.",
        "ask_phone": "Отправьте номер телефона кнопкой ниже или введите вручную:",
        "btn_share_phone": "📱 Отправить номер",
        "phone_invalid": "Похоже, это не номер. Введите в формате +998 XX XXX XX XX.",
        "ask_symptoms": "Кратко опишите причину обращения (или пропустите):",
        "booking_done": (
            "✅ *Вы записаны!*\n\n"
            "{spec} — {doctor}\n🏥 {clinic}\n🗓 {when}\n💰 {price} сум\n\n"
            "Напомним за день до приёма."
        ),
        "slot_taken": "Это время только что заняли. Выберите другое.",
        "booking_error": "Не удалось записать. Попробуйте ещё раз.",

        # --- мои записи ---
        "appts_empty": "У вас пока нет записей.",
        "appt_line": "{status} *{doctor}*\n{spec} · 🏥 {clinic}\n🗓 {when}",
        "btn_cancel_appt": "Отменить запись",
        "cancel_done": "Запись отменена.",
        "st_confirmed": "🟢",
        "st_cancelled": "⚪️",
        "st_completed": "✅",
        "st_no_show": "🔴",

        # --- профиль ---
        "reg_intro": "Давайте познакомимся — это займёт полминуты.",
        "ask_name": "Как вас зовут? (Фамилия Имя)",
        "name_too_short": "Слишком короткое имя. Введите полностью.",
        "ask_age": "Выберите возрастную группу:",
        "ask_region": "Выберите регион:",
        "profile_saved": "✅ Профиль сохранён. Теперь запись займёт пару нажатий.",
        "profile_view": (
            "👤 *Ваш профиль*\n\n"
            "Имя: {name}\nВозраст: {age}\nРегион: {region}\nТелефон: {phone}"
        ),
        "profile_empty": "Профиль пока не заполнен.",
        "btn_edit_profile": "✏️ Изменить",
        "not_set": "не указано",

        # --- админка ---
        "admin_menu": "⚙️ *Админ-панель*",
        "btn_adm_add": "➕ Добавить врача",
        "btn_adm_list": "📋 Врачи",
        "btn_adm_slots": "🕒 Добавить время",
        "btn_adm_stats": "📊 Статистика",
        "adm_choose_clinic": "Выберите клинику:",
        "adm_ask_name": "Имя врача (Фамилия Имя):",
        "adm_ask_spec": "Специальность:",
        "adm_ask_exp": "Стаж в годах (число):",
        "adm_ask_price": "Цена приёма в сумах (число):",
        "adm_ask_phone": "Телефон врача (или пропустите):",
        "adm_ask_desc": "Короткое описание (или пропустите):",
        "adm_ask_photo": "Пришлите фото врача (или пропустите):",
        "adm_need_number": "Нужно число. Попробуйте ещё раз.",
        "adm_added": "✅ Врач *{name}* добавлен.",
        "adm_updated": "✅ Обновлено.",
        "adm_deleted": "🗑 Врач скрыт из каталога. Прошлые записи сохранены.",
        "adm_choose_doctor": "Выберите врача:",
        "adm_doctor_actions": "*{name}*\n{spec} · {price} сум\nСтатус: {status}",
        "adm_active": "активен",
        "adm_inactive": "скрыт",
        "btn_adm_edit": "✏️ Изменить",
        "btn_adm_del": "🗑 Скрыть",
        "btn_adm_restore": "♻️ Вернуть",
        "adm_choose_field": "Что изменить?",
        "f_name": "Имя",
        "f_spec": "Специальность",
        "f_exp": "Стаж",
        "f_price": "Цена",
        "f_phone": "Телефон",
        "f_desc": "Описание",
        "f_photo": "Фото",
        "adm_ask_value": "Введите новое значение:",
        "adm_ask_slot": (
            "Введите дату и время приёма в формате *ДД.ММ ЧЧ:ММ*\n"
            "Например: 05.08 14:30"
        ),
        "adm_bad_datetime": "Не разобрал дату. Формат: ДД.ММ ЧЧ:ММ",
        "adm_slot_past": "Это время уже прошло.",
        "adm_slot_added": "✅ Время {when} добавлено для {doctor}.",
        "api_error": "Сервис временно недоступен. Попробуйте позже.",
    },

    "uz": {
        "menu_title": "Asosiy menyu",
        "btn_find": "🔍 Shifokor topish",
        "btn_appts": "📅 Mening yozuvlarim",
        "btn_chat": "💬 AI-konsultatsiya",
        "btn_profile": "👤 Profil",
        "btn_admin": "⚙️ Admin panel",
        "btn_open_app": "🩺 Ilovani ochish",
        "btn_back": "◀️ Orqaga",
        "btn_menu": "🏠 Menyuga",
        "btn_skip": "Oʻtkazib yuborish",
        "btn_cancel_action": "✖️ Bekor qilish",
        "cancelled": "Bekor qilindi.",

        "choose_spec": "Mutaxassislikni tanlang:",
        "btn_all_doctors": "📋 Barcha shifokorlar",
        "no_doctors": "Hozircha shifokorlar yoʻq.",
        "doctors_title": "Topildi: {n} ta shifokor",
        "doctor_card": (
            "*{name}*\n"
            "{spec} · tajriba {exp} yil · ★ {rating}\n"
            "🏥 {clinic}\n"
            "📍 {address}\n"
            "💰 {price} soʻm\n"
            "{phone}{description}"
        ),
        "doctor_phone_line": "📞 {phone}\n",
        "btn_book": "📅 Yozilish",
        "btn_call": "📞 Qoʻngʻiroq",
        "free_slots": "Boʻsh vaqt: {n}",

        "choose_slot": "Qabul vaqtini tanlang:",
        "no_slots": "Bu shifokorda boʻsh vaqt yoʻq.",
        "ask_phone": "Telefon raqamingizni tugma orqali yuboring yoki qoʻlda kiriting:",
        "btn_share_phone": "📱 Raqamni yuborish",
        "phone_invalid": "Bu raqamga oʻxshamaydi. +998 XX XXX XX XX koʻrinishida kiriting.",
        "ask_symptoms": "Murojaat sababini qisqacha yozing (yoki oʻtkazib yuboring):",
        "booking_done": (
            "✅ *Siz yozildingiz!*\n\n"
            "{spec} — {doctor}\n🏥 {clinic}\n🗓 {when}\n💰 {price} soʻm\n\n"
            "Qabuldan bir kun oldin eslatamiz."
        ),
        "slot_taken": "Bu vaqt hozirgina band boʻldi. Boshqasini tanlang.",
        "booking_error": "Yozib boʻlmadi. Qayta urinib koʻring.",

        "appts_empty": "Sizda hali yozuvlar yoʻq.",
        "appt_line": "{status} *{doctor}*\n{spec} · 🏥 {clinic}\n🗓 {when}",
        "btn_cancel_appt": "Yozuvni bekor qilish",
        "cancel_done": "Yozuv bekor qilindi.",
        "st_confirmed": "🟢",
        "st_cancelled": "⚪️",
        "st_completed": "✅",
        "st_no_show": "🔴",

        "reg_intro": "Keling tanishamiz — yarim daqiqa vaqt oladi.",
        "ask_name": "Ismingiz nima? (Familiya Ism)",
        "name_too_short": "Juda qisqa. Toʻliq kiriting.",
        "ask_age": "Yosh guruhini tanlang:",
        "ask_region": "Viloyatni tanlang:",
        "profile_saved": "✅ Profil saqlandi. Endi yozilish bir necha bosishda.",
        "profile_view": (
            "👤 *Sizning profilingiz*\n\n"
            "Ism: {name}\nYosh: {age}\nViloyat: {region}\nTelefon: {phone}"
        ),
        "profile_empty": "Profil hali toʻldirilmagan.",
        "btn_edit_profile": "✏️ Oʻzgartirish",
        "not_set": "koʻrsatilmagan",

        "admin_menu": "⚙️ *Admin panel*",
        "btn_adm_add": "➕ Shifokor qoʻshish",
        "btn_adm_list": "📋 Shifokorlar",
        "btn_adm_slots": "🕒 Vaqt qoʻshish",
        "btn_adm_stats": "📊 Statistika",
        "adm_choose_clinic": "Klinikani tanlang:",
        "adm_ask_name": "Shifokor ismi (Familiya Ism):",
        "adm_ask_spec": "Mutaxassislik:",
        "adm_ask_exp": "Tajriba (yil, raqam):",
        "adm_ask_price": "Qabul narxi (soʻm, raqam):",
        "adm_ask_phone": "Shifokor telefoni (yoki oʻtkazib yuboring):",
        "adm_ask_desc": "Qisqa tavsif (yoki oʻtkazib yuboring):",
        "adm_ask_photo": "Shifokor rasmini yuboring (yoki oʻtkazib yuboring):",
        "adm_need_number": "Raqam kerak. Qayta urinib koʻring.",
        "adm_added": "✅ Shifokor *{name}* qoʻshildi.",
        "adm_updated": "✅ Yangilandi.",
        "adm_deleted": "🗑 Shifokor katalogdan yashirildi. Eski yozuvlar saqlandi.",
        "adm_choose_doctor": "Shifokorni tanlang:",
        "adm_doctor_actions": "*{name}*\n{spec} · {price} soʻm\nHolat: {status}",
        "adm_active": "faol",
        "adm_inactive": "yashirilgan",
        "btn_adm_edit": "✏️ Oʻzgartirish",
        "btn_adm_del": "🗑 Yashirish",
        "btn_adm_restore": "♻️ Qaytarish",
        "adm_choose_field": "Nimani oʻzgartiramiz?",
        "f_name": "Ism",
        "f_spec": "Mutaxassislik",
        "f_exp": "Tajriba",
        "f_price": "Narx",
        "f_phone": "Telefon",
        "f_desc": "Tavsif",
        "f_photo": "Rasm",
        "adm_ask_value": "Yangi qiymatni kiriting:",
        "adm_ask_slot": (
            "Qabul sana va vaqtini *KK.OO SS:DD* koʻrinishida kiriting\n"
            "Masalan: 05.08 14:30"
        ),
        "adm_bad_datetime": "Sanani tushunmadim. Format: KK.OO SS:DD",
        "adm_slot_past": "Bu vaqt allaqachon oʻtib ketgan.",
        "adm_slot_added": "✅ {when} vaqti {doctor} uchun qoʻshildi.",
        "api_error": "Xizmat vaqtincha ishlamayapti. Keyinroq urinib koʻring.",
    },
}
