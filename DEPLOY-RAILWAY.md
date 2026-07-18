# Деплой meda.ai — всё на Railway (без Vercel)

Самый короткий путь: один Railway-проект, три компонента. Node-API сам отдаёт
Mini App (`/app`) и кабинет клиники (`/clinic`) — отдельный фронтенд не нужен.

```
                 RAILWAY (один проект)
 ┌──────────────┬───────────────────────┬──────────────────┐
 │ PostgreSQL   │  API (api/)           │  bot (bot/)       │
 │ (база)       │  REST + Mini App /app │  aiogram, Python  │
 └──────────────┴───────────────────────┴──────────────────┘
```

## Что нужно заранее
- Аккаунты GitHub и Railway (есть бесплатный тариф).
- Проект залит в GitHub-репозиторий.
- `BOT_TOKEN` от @BotFather и свой Telegram ID от @userinfobot.

## Шаг 1. Проект и база
1. Railway → **New Project → Deploy from GitHub repo** → выбери репозиторий.
2. В проекте: **New → Database → Add PostgreSQL**. Railway создаст переменную
   `DATABASE_URL` в сервисе базы.

## Шаг 2. Сервис API (он же отдаёт Mini App)
1. Открой сервис из репозитория → **Settings → Root Directory = `api`**
   (подхватится `api/railway.json`: `node src/migrate.js && node src/server.js`).
2. **Variables:**
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `CLINIC_DASHBOARD_TOKEN` = свой код доступа для кабинета
   - (опц.) `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
   - `PORT` задавать не нужно — Railway подставит сам.
3. **Networking → Generate Domain** → получишь HTTPS-адрес, например
   `https://medauz-api.up.railway.app`. Запиши — он же и адрес Mini App.
4. **Засей данные один раз** (сид делает TRUNCATE, в старт не ставим):
   сервис API → **⋯ → Run a command** → `node src/seed.js`.

Проверка: открой `https://…up.railway.app/app` в браузере — должен открыться Mini App.

## Шаг 3. Сервис бота
1. В том же проекте: **New → GitHub Repo** → тот же репозиторий (второй сервис).
2. **Settings → Root Directory = `bot`** (подхватится `bot/railway.json`: `python bot.py`).
3. **Variables:**
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `BOT_TOKEN` = токен от @BotFather
   - `ADMIN_IDS` = твой Telegram ID (можно несколько через запятую)
   - `PUBLIC_URL` = адрес API из шага 2.3 (напр. `https://medauz-api.up.railway.app`)
   - `MINIAPP_URL` — НЕ нужен (бот сам добавит `/app` к `PUBLIC_URL`)
4. Deploy.

## Шаг 4. Проверка
- Telegram → бот → `/start` → кнопка **«Открыть meda.ai»** → путь «симптом → запись».
- `/admin` → аналитика (если твой ID в `ADMIN_IDS`).

## Заметки
- **Порядок:** сначала API (нужен его домен для `PUBLIC_URL`), потом бот.
- **Обновления:** `git push` → Railway передеплоит автоматически.
- **Миграция** идёт при каждом старте (безопасно, `CREATE TABLE IF NOT EXISTS`),
  **сид** — только вручную один раз.
- Когда захочешь быстрый CDN-фронтенд и отдельный домен — вынесешь Mini App на
  Vercel по гайду `DEPLOY.md` (там же `vercel.json` и `MINIAPP_URL`).
