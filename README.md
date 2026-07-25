# meda.ai — Doctolib для Узбекистана (Telegram) · v2

Пациент описывает симптомы в Telegram → AI подбирает специалиста → запись без звонков
в регистратуру. Клиника видит расписание и записи, пациент получает напоминания,
а владелец бота — аналитику. Интерфейс на **русском и узбекском**.

## Архитектура (два сервиса + общая БД)

```
┌────────────────────┐        ┌────────────────────┐
│  bot/  (Python)     │        │  api/  (Node.js)   │
│  aiogram 3.x        │        │  Express + Mini App │
│  • /start, /lang    │        │  • REST API         │
│  • /chat AI-диалог  │───────►│  • /api/chat (AI)   │
│  • напоминания 24ч  │        │  • /app  (пациент)  │
│  • /admin аналитика │        │  • /clinic (кабинет)│
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

## Что было объединено

Проект собран из двух репозиториев:

- **`meda.ai`** — основа: запись на приём, слоты, напоминания, дашборд клиники.
- **`Medical-bot`** — из него перенесён многошаговый AI-диалог. Исходный код
  лежит в `legacy/medical-bot-python/` **только для справки** — он не запускается
  и не участвует в сборке. Его схема (`users` / `doctors` / `analytics`)
  несовместима с текущей и намеренно не переносилась.

## Быстрый старт — Docker (рекомендуется)

```bash
cp .env.example .env         # впишите BOT_TOKEN, PUBLIC_URL, ADMIN_IDS
docker compose up --build
```

Compose поднимает Postgres, применяет миграции, засеивает демо-данные, запускает API и бота.
- Mini App пациента: `http://localhost:3000/app`
- Кабинет клиники: `http://localhost:3000/clinic` (код `clinic-demo-2026`)

## Запуск без Docker

Нужен запущенный PostgreSQL. Создайте БД и укажите `DATABASE_URL` в `.env`.

API (Node 18+):
```bash
cd api
npm install
npm run setup      # миграция + сид (node src/migrate.js && node src/seed.js)
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
| GET  | `/api/clinic/summary?clinicId=` | Сводка кабинета (токен) |
| POST | `/api/clinic/slots` | Добавить слот (токен) |
| POST | `/api/clinic/appointments/:id/status` | Статус приёма (токен) |

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
