# meda.ai — Doctolib для Узбекистана (Telegram) · v2

Пациент описывает симптомы в Telegram → AI подбирает специалиста → запись без звонков
в регистратуру. Клиника видит расписание и записи, пациент получает напоминания,
а владелец бота — аналитику. Интерфейс на **русском и узбекском**.

## Архитектура (два сервиса + общая БД)

```
┌────────────────────┐        ┌────────────────────┐
│  bot/  (Python)     │        │  api/  (Node.js)   │
│  aiogram 3.x        │        │  Express + Mini App │
│  • каталог + запись │───────►│  • REST API         │
│  • /chat AI-диалог  │───────►│  • /api/chat (AI)   │
│  • анкета пациента  │        │  • /app  (пациент)  │
│  • админка врачей   │───────►│  • /api/clinic/*    │
│  • напоминания 24ч  │        │  • /clinic (кабинет)│
└─────────┬──────────┘        └─────────┬──────────┘
          │        общий Postgres        │
          └───────────►  db  ◄───────────┘
                 db/schema.sql
```

- **Бот — на aiogram (Python).** API и Mini App — на Node.js. Оба сервиса работают с
  **одной базой PostgreSQL** (схема в `db/schema.sql`).
- Данные **сохраняются в Postgres**: пользователи (`patients`), врачи, клиники, слоты,
  записи, а также события AI-подбора (`match_events`) для аналитики конверсии.

## Два режима AI

| | Как работает | Где |
|---|---|---|
| **Быстрый подбор** (`/api/match`) | одно сообщение → специальность | вкладка «Запись» |
| **AI-консультация** (`/api/chat`) | диалог: 2–3 уточняющих вопроса → специальность | вкладка «Консультация», `/chat` в боте |

Оба используют одни и те же `LLM_*` из `.env` и один список специальностей
(`api/src/specialties.js`), поэтому промпт и коды не расходятся.

**Без ключа `LLM_API_KEY` ничего не ломается:** быстрый подбор работает офлайн по
ключевым словам, а консультация мягко деградирует до того же офлайн-подбора
(во вкладках Mini App она при этом скрыта — см. `/api/chat/status`).

Бот не ходит в LLM напрямую — он вызывает `/api/chat` у Node API. Так остаётся
один промпт, один набор кодов специальностей и один журнал `match_events`.

## Что умеет бот

Всё то же, что Mini App, но прямо в переписке — приложение открывать не обязательно.

| | Бот | Mini App | Кабинет клиники |
|---|---|---|---|
| Подбор врача по симптомам | ✅ `/chat` | ✅ | — |
| Каталог врачей по специальностям | ✅ | ✅ | — |
| Карточка врача с фото и телефоном | ✅ | ✅ | ✅ |
| Запись на приём | ✅ | ✅ | — |
| Мои записи / отмена | ✅ | ✅ | ✅ |
| Анкета пациента | ✅ | — | — |
| Добавить / изменить / скрыть врача | ✅ | — | просмотр |
| Добавить время приёма | ✅ | — | ✅ |
| Статистика | ✅ `/admin` | — | ✅ |

Бот не ходит в базу за врачами и бронями — он вызывает те же эндпоинты API, что и
Mini App. Транзакция брони (блокировка слота) живёт в одном месте, поэтому двойной
записи на один слот не бывает, кто бы её ни делал.

Фото врача загружается в боте и хранится как Telegram `file_id`. Бот пересылает его
напрямую, а Mini App получает картинку через прокси `GET /api/doctors/:id/photo` —
браузер `file_id` использовать не умеет.

Врачей **не удаляют физически**, а скрывают (`is_active = false`): иначе вместе с
врачом осыпались бы прошлые записи пациентов и статистика клиники.

## Что было объединено

Проект собран из двух репозиториев:

- **`meda.ai`** — основа: запись на приём, слоты, напоминания, дашборд клиники.
- **`Medical-bot`** — из него перенесены многошаговый AI-диалог, каталог врачей
  в переписке, анкета пациента и админка врачей с фото. Исходный код
  лежит в `legacy/medical-bot-python/` **только для справки** — он не запускается
  и не участвует в сборке. Его схема (`users` / `doctors` / `analytics`)
  несовместима с текущей и намеренно не переносилась.

## Быстрый старт — Docker (рекомендуется)

```bash
cp .env.example .env         # впишите BOT_TOKEN, PUBLIC_URL, ADMIN_IDS
docker compose up --build
```

Compose поднимает Postgres, применяет миграции, заполняет справочник специальностей
и запускает API с ботом. **Демо-врачей больше нет** — заводите своих через бота.
- Mini App пациента: `http://localhost:3000/app`
- Кабинет клиники: `http://localhost:3000/clinic` (код `clinic-demo-2026`)

## Запуск без Docker

Нужен запущенный PostgreSQL. Создайте БД и укажите `DATABASE_URL` в `.env`.

API (Node 18+):
```bash
cd api
npm install
npm run setup      # миграция + справочник специальностей (демо-врачей нет)
npm start          # http://localhost:3000
```

Бот (Python 3.11+):
```bash
cd bot
pip install -r requirements.txt
python bot.py
```

### Telegram-бот
1. Токен у **@BotFather** → `BOT_TOKEN` в `.env`.
2. Mini App должен быть по HTTPS. Локально: `npx localtunnel --port 3000`, адрес → `PUBLIC_URL`.
3. `/start` покажет **inline-кнопку «Открыть meda.ai»** (web_app), плюс настроится кнопка-меню бота.
4. `/chat` запускает AI-консультацию прямо в переписке, `/stop` — завершает.
   Боту нужен доступ к API: `PUBLIC_URL` (или `http://localhost:3000` по умолчанию).

## Админ-аналитика (в самом боте)

Впишите свой Telegram ID в `ADMIN_IDS` (через запятую; узнать id — у @userinfobot).
Команды `/admin` или `/stats` покажут прямо в чате:

- пользователей всего и новых за 7 дней;
- записи по статусам (подтверждено / завершено / неявка / отменено);
- долю неявок (no-show %);
- **конверсию «симптом → запись»** (по `match_events`);
- график записей за 7 дней (спарклайн);
- топ специальностей и топ клиник.

Для не-админов команда недоступна.

## Схема БД (`api/db/schema.sql`)

`specialties`, `clinics`, `doctors`, `patients` (пользователи Telegram), `slots`,
`appointments`, `match_events` (каждый AI-подбор + флаг конверсии).

## Основные API-эндпоинты

| Метод | Путь | Назначение |
|------|------|-----------|
| POST | `/api/match` | Симптомы → специальность + врачи (+ логирует match_event) |
| GET  | `/api/doctors` | Врачи (фильтр по специальности/клинике) |
| GET  | `/api/doctors/:id/slots` | Свободные слоты |
| POST | `/api/appointments` | Запись (+ отмечает конверсию) |
| GET  | `/api/appointments?tgId=` | Записи пациента |
| POST | `/api/appointments/:id/cancel` | Отмена |
| POST | `/api/chat` | Многошаговая AI-консультация (диалог) |
| GET  | `/api/chat/status` | Настроен ли LLM-ключ |
| GET  | `/api/doctors/:id` | Карточка врача |
| GET  | `/api/doctors/:id/photo` | Фото врача (прокси Telegram file_id) |
| GET/POST | `/api/patients/:tgId` | Анкета пациента |
| GET  | `/api/clinic/summary?clinicId=` | Сводка кабинета (токен) |
| GET  | `/api/clinic/doctors/all` | Все врачи, включая скрытых (токен) |
| POST | `/api/clinic/doctors` | Добавить врача (токен) |
| PATCH | `/api/clinic/doctors/:id` | Изменить врача (токен) |
| DELETE | `/api/clinic/doctors/:id` | Скрыть врача (токен) |
| POST | `/api/clinic/slots` | Добавить слот (токен) |
| POST | `/api/clinic/appointments/:id/status` | Статус приёма (токен) |

## Первый запуск на реальных данных

Врачи и клиники **не приходят из сида** — их заводит владелец через бота:

1. `⚙️ Админ-панель → 🏥 Клиники → ➕ Добавить клинику` — название и адрес
   спрашиваются на двух языках.
2. `⚙️ Админ-панель → ➕ Добавить врача` — клиника, имя, специальность, стаж,
   цена, телефон, описание (RU и UZ) и фото.
3. `⚙️ Админ-панель → 🕒 Добавить время` — слоты приёма в формате `ДД.ММ ЧЧ:ММ`.

Если база уже засеяна старыми демо-врачами, очистите её:

```bash
node src/reset.js          # покажет, что будет удалено
node src/reset.js --yes    # удалит
```

`reset.js` стирает врачей, клиники, слоты, записи и пациентов, но **сохраняет
справочник специальностей**. Отдельным скриптом — чтобы это нельзя было
случайно поставить в стартовую команду.

## Языки

Русский и узбекский — везде: интерфейс бота и Mini App, справочник специальностей,
названия и адреса клиник, описания врачей, AI-консультация.

- Бот спрашивает язык **явно при первом `/start`** (угадывание по `language_code`
  ошибается: у многих в Узбекистане стоит русский или английский).
- Выбор сохраняется в профиле и общий для бота и Mini App: переключили в
  приложении — бот тоже перейдёт на этот язык.
- Если у врача заполнено описание только на одном языке, показывается оно —
  пустая карточка хуже карточки на втором языке.

## Что дальше
Онлайн-оплата (Payme/Click/Uzum), верификация телефона через `requestContact`,
роли и полноценная авторизация клиник, Alembic-миграции, экспорт аналитики.

---

# meda.ai — Oʻzbekiston uchun Doctolib (Telegram) · v2 (UZ)

Bemor Telegramda belgilarini yozadi → AI mutaxassisni tanlaydi → registraturaga
qoʻngʻiroqsiz yoziladi. Interfeys **rus va oʻzbek** tillarida.

## Arxitektura
Bot — **aiogram (Python)**, API va Mini App — **Node.js**. Ikkala servis bitta
**PostgreSQL** bazasi bilan ishlaydi (`db/schema.sql`). Foydalanuvchilar, shifokorlar,
klinikalar, yozuvlar va AI-tanlov hodisalari (`match_events`) bazada saqlanadi.

## Ishga tushirish (Docker)
```bash
cp .env.example .env      # BOT_TOKEN, PUBLIC_URL, ADMIN_IDS
docker compose up --build
```
- Bemor Mini App: `http://localhost:3000/app`
- Klinika kabineti: `http://localhost:3000/clinic` (kod `clinic-demo-2026`)

## Docker'siz
API: `cd api && npm install && npm run setup && npm start`
Bot: `cd bot && pip install -r requirements.txt && python bot.py`

## Admin analitikasi
`ADMIN_IDS` ga oʻz Telegram ID'ingizni yozing. `/admin` yoki `/stats` — foydalanuvchilar,
statuslar boʻyicha yozuvlar, no-show %, **belgi→yozuv konversiyasi**, 7 kunlik grafik,
top mutaxassislik va klinikalar. Admin boʻlmaganlarga buyruq berkitilgan.
