# SauBol — каркас приложения

MVP-каркас личного медицинского архива: загрузка документов → OCR →
извлечение показателей через AI → медкарта с динамикой → AI-чат по своим данным.

## Стек

- **Frontend**: React (Vite) + Tailwind + React Router + Recharts
- **Backend**: Express + PostgreSQL (pg) + JWT-аутентификация
- **AI**: Anthropic API (извлечение биомаркеров из текста, чат с контекстом)
- **OCR**: tesseract.js (MVP; для продакшена лучше облачный OCR — см. `backend/services/ocr.js`)

## Структура

```
healthapp/
  backend/
    routes/        auth, documents, records (медкарта+биомаркеры), chat
    services/       ocr.js, ai.js
    middleware/     auth.js (JWT)
    db/             schema.sql, pool.js, migrate.js
    server.js
  frontend/
    src/
      pages/        Login, Register, Dashboard, Documents, MedCard, Chat
      components/    Layout.jsx (сайдбар-навигация)
      api/           client.js (обёртка над fetch)
```

## Пошаговая настройка (с нуля до рабочего сайта)

Ниже — весь путь: от распаковки архива до сайта, доступного по ссылке.
Схема та же, что и у Kaspi-дашборда (GitHub → Render + Vercel + Neon),
только новый репозиторий.

### Шаг 1. Распаковать и положить в GitHub

1. Распакуйте `saubol.zip` — получите папку `saubol/` с `backend/` и `frontend/`.
2. Создайте новый **пустой** репозиторий на github.com (например `saubol`).
3. У себя в терминале:
   ```bash
   cd saubol
   git init
   git add .
   git commit -m "Initial commit: SauBol MVP scaffold"
   git branch -M main
   git remote add origin https://github.com/ВАШ_АККАУНТ/saubol.git
   git push -u origin main
   ```
   (Если хотите, чтобы я сам это делал и пушил новые фичи — подключите
   GitHub-коннектор, когда будете за компьютером, и скажите продолжить оттуда.)

### Шаг 2. База данных — Neon (PostgreSQL)

1. Зайдите на neon.tech → создайте новый проект, например `saubol`.
2. Скопируйте **Connection string** (вида `postgres://user:pass@host/dbname`).
3. Сохраните его — понадобится в шаге 3 как `DATABASE_URL`.
4. Схему (`backend/db/schema.sql`) применять руками не нужно — выполните
   один раз локально (`npm run migrate`, см. ниже) или через встроенный
   SQL-редактор в Neon, вставив содержимое файла.

### Шаг 3. Backend — Render

1. На render.com → **New → Web Service** → подключите репозиторий `saubol`.
2. **Root Directory**: `backend`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. В разделе **Environment** добавьте переменные (из `backend/.env.example`):
   - `DATABASE_URL` — строка из Neon (шаг 2)
   - `JWT_SECRET` — любая длинная случайная строка
   - `ANTHROPIC_API_KEY` — ваш ключ Anthropic API
   - `FRONTEND_URL` — заполните после шага 4 (адрес Vercel), пока можно `*`
6. Разверните. После первого деплоя один раз выполните миграцию — локально
   с тем же `DATABASE_URL` (`npm run migrate`) или через Render Shell
   (`Shell` → `npm run migrate`).
7. Скопируйте адрес вида `https://saubol-XXXX.onrender.com` — понадобится
   фронтенду.

### Шаг 4. Frontend — Vercel

1. На vercel.com → **New Project** → тот же репозиторий `saubol`.
2. **Root Directory**: `frontend`
3. Framework Preset определится сам как Vite.
4. В **Environment Variables** добавьте `VITE_API_URL` = адрес backend из
   шага 3 (например `https://saubol-XXXX.onrender.com/api`) — и поправьте
   `frontend/src/api/client.js`, заменив `const BASE_URL = "/api"` на
   `const BASE_URL = import.meta.env.VITE_API_URL || "/api"`
   (локально прокси на `/api` продолжит работать через `vite.config.js`).
5. Разверните. Получите адрес вида `https://saubol-XXXX.vercel.app`.
6. Вернитесь в Render (шаг 3) и впишите этот адрес в `FRONTEND_URL` backend'а,
   чтобы CORS пропускал запросы именно с вашего фронтенда.

### Шаг 5. Проверка

Откройте адрес Vercel → зарегистрируйтесь → загрузите тестовый анализ
(PDF/JPG) в разделе «Документы» → через несколько секунд статус должен
смениться на «обработан», а показатели появиться в «Медкарте».

## Запуск локально (для разработки)

### 1. База данных
Используйте тот же `DATABASE_URL` из Neon (шаг 2 выше), либо локальный Postgres.

```bash
cd backend
cp .env.example .env   # заполните DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
npm install
npm run migrate
```

### 2. Backend

```bash
npm run dev   # запустится на http://localhost:4000
```

### 3. Frontend

```bash
cd ../frontend
npm install
npm run dev   # http://localhost:5173, прокси на /api уже настроен
```

Зарегистрируйтесь через `/register`, загрузите тестовый анализ в PDF/JPG —
он пройдёт OCR и AI извлечёт показатели автоматически.

## Что уже работает

- Регистрация / вход (JWT)
- Загрузка документов, асинхронный OCR + извлечение биомаркеров через Claude
- Медкарта: разделы (диагнозы, лекарства, рекомендации, аллергии) + график динамики показателя
- AI-чат, отвечающий с учётом ваших анализов и записей медкарты

## Что стоит доработать перед реальным использованием

1. **OCR точность** — tesseract.js слабее на бланках со сложной вёрсткой.
   Для продакшена: Google Vision / Yandex Vision / AWS Textract.
2. **Заполнение medcard_entries** — сейчас это ручной API-эндпоинт;
   стоит добавить автоматическое извлечение диагнозов/рекомендаций из
   документов через AI (аналогично `extractBiomarkers`).
3. **Шифрование данных** — для медицинских данных в проде нужно шифрование
   на уровне хранилища/полей и, в идеале, юридическая консультация по 152-ФЗ.
4. **Хранилище файлов** — сейчас файлы пишутся на локальный диск сервера;
   для Render/деплоя лучше S3-совместимое хранилище (файлы на Render не
   переживают рестарт).
5. **Мобильная версия / Apple Health** — потребует нативного слоя, веб не сможет.

## Деплой

По аналогии с Kaspi-дашбордом: backend → Render, frontend → Vercel,
база → Neon. Не забудьте выставить `FRONTEND_URL` в бэкенде и переменные
окружения в панели Render/Vercel.
