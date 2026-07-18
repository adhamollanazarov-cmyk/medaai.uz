# Деплой meda.ai: Railway + Vercel

Кто что хостит:

```
        VERCEL                         RAILWAY
 ┌─────────────────────┐      ┌──────────────────────────┐
 │ Mini App (статика)  │      │  PostgreSQL (база)        │
 │  /webapp  /dashboard│      │  Node API  (api/)         │
 │  /api/*  ──proxy──▶  ──────▶  Python bot (bot/)        │
 └─────────────────────┘      └──────────────────────────┘
   HTTPS + CDN                   персистентные сервисы
```

- **Vercel** — только фронтенд Mini App. Запросы `/api/*` он проксирует на Railway
  (в браузере один домен → CORS не нужен).
- **Railway** — база PostgreSQL, Node API и Python-бот (оба долгоживущие процессы).

## Что понадобится
- Аккаунты: GitHub, Railway, Vercel (везде есть бесплатный тариф).
- Код в GitHub-репозитории (запуш этот проект).
- `BOT_TOKEN` от **@BotFather** и свой Telegram ID от **@userinfobot** (для `ADMIN_IDS`).

> Порядок шагов важен: `vercel.json` требует URL API (Railway), а боту нужен URL Vercel.
> Поэтому: сначала API на Railway → потом Vercel → потом бот.

---

## Шаг 0. Запушить код в GitHub
```bash
cd medauz
git init && git add . && git commit -m "meda.ai"
git branch -M main
git remote add origin https://github.com/USERNAME/medauz.git
git push -u origin main
```

## Шаг 1. Railway — PostgreSQL + API
1. **New Project → Deploy from GitHub repo** → выберите репозиторий.
2. **Add PostgreSQL:** в проекте *New → Database → Add PostgreSQL*. Railway создаст
   базу и переменную `DATABASE_URL` в сервисе Postgres.
3. Откройте сервис приложения (из репозитория) → **Settings**:
   - **Root Directory** = `api`
   - Railway сам подхватит `api/railway.json` (старт: `node src/migrate.js && node src/server.js`).
4. **Variables** этого сервиса:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (ссылка на сервис Postgres)
   - `CLINIC_DASHBOARD_TOKEN` = свой код доступа для кабинета клиники
   - (опц.) `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`
   - `PORT` задавать не нужно — Railway подставит его сам, сервер его читает.
5. **Networking → Generate Domain** → получите публичный адрес API,
   например `https://medauz-api.up.railway.app`. Запишите его.
6. **Засеять демо-данные один раз** (сид делает TRUNCATE, в старт-команду его не ставим!):
   в сервисе API → *⋯ → Run a command* (one-off): `node src/seed.js`.
   Либо локально: `DATABASE_URL="<тот же URL>" node api/src/seed.js`.

## Шаг 2. Vercel — Mini App (фронтенд)
1. В файле `api/public/vercel.json` замените
   `https://REPLACE-WITH-RAILWAY-API.up.railway.app` на реальный домен API из шага 1.5,
   закоммитьте и запушьте.
2. Vercel → **Add New → Project** → импортируйте тот же репозиторий.
3. **Root Directory** = `api/public`. Framework Preset = **Other** (это статика,
   build command и output оставьте пустыми).
4. **Deploy** → получите адрес, например `https://medauz.vercel.app`.
   - Mini App пациента: `https://medauz.vercel.app/webapp`
   - Кабинет клиники: `https://medauz.vercel.app/dashboard`

## Шаг 3. Railway — Python-бот
1. В том же Railway-проекте: **New → GitHub Repo** → тот же репозиторий (второй сервис).
2. **Settings → Root Directory** = `bot` (Railway подхватит `bot/railway.json`,
   старт: `python bot.py`, зависимости из `requirements.txt`).
3. **Variables** сервиса бота:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `BOT_TOKEN` = токен от @BotFather
   - `ADMIN_IDS` = ваш Telegram ID (можно несколько через запятую)
   - `MINIAPP_URL` = `https://medauz.vercel.app/webapp` (адрес из шага 2.4)
4. **Deploy.**

## Шаг 4. Проверка
1. Откройте бота в Telegram → `/start` → нажмите **«Открыть meda.ai»** →
   Mini App (с Vercel) → пройдите путь «симптом → подбор → запись».
2. `/admin` → должна прийти аналитика (только если ваш ID в `ADMIN_IDS`).

---

## Частые вопросы
- **Почему сид отдельно, а не в старте?** `node src/seed.js` делает `TRUNCATE` — он
  сотрёт записи. Запускайте вручную только при первичной настройке. Миграция
  (`migrate.js`) безопасна (`CREATE TABLE IF NOT EXISTS`) и идёт при каждом старте.
- **Обновления.** `git push` → Railway и Vercel передеплоят автоматически.
- **CORS-ошибки?** Проверьте, что `destination` в `vercel.json` указывает на реальный
  домен Railway API и что путь `/api/:path*` совпадает.
- **Кнопка Mini App не появляется.** Значит у бота пустой `MINIAPP_URL` и `PUBLIC_URL`.
  Задайте `MINIAPP_URL` и передеплойте бота.
- **Только Railway, без Vercel.** Можно хостить всё на Railway: тогда Mini App отдаёт
  сам API по `/app`, а боту достаточно `PUBLIC_URL=https://medauz-api.up.railway.app`
  (без `MINIAPP_URL`). Vercel нужен ради быстрого CDN-фронтенда и отдельного домена.

## Стоимость (ориентир)
- Railway: стартовый кредит/Hobby-план покрывает Postgres + два небольших сервиса.
- Vercel: план Hobby (бесплатный) для статики и прокси.
