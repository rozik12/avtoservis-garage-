# Garage Detailing — сайт и Telegram-бот

Автосервис, детейлинг и мойка в Ташкенте (ул. Чуст, 10). Сайт на трёх языках (RU / UZ / EN),
онлайн-запись и Telegram-бот с общей базой данных.

```
data/            услуги, цены и данные о компании (единственный источник правды)
web/             статический сайт (Netlify)
netlify/functions/  /api/slots и /api/booking
bot/             Telegram-бот (grammY, Railway)
shared/          общая логика записи: слоты, проверка, Supabase, уведомления
supabase/        схема базы
```

## Что нужно заполнить перед запуском

1. **`data/services.json`** — цены ПРИМЕРНЫЕ, замените реальным прайсом.
2. **`data/business.json`** — проверьте график работы (сейчас Пн–Пт 09–22 по данным справочника),
   добавьте `telegram`, `instagram`, `botUsername`.
3. **Логотип** — положите файл `web/logo.png`, сайт подхватит его сам.

## Запуск

### 1. База данных (Supabase)
Выполните `supabase/schema.sql` в SQL-редакторе проекта. Из настроек возьмите `SUPABASE_URL`
и `service_role`-ключ (хранить только на сервере).

### 2. Telegram-бот
1. Создайте бота у @BotFather, получите `BOT_TOKEN`.
2. Узнайте `ADMIN_CHAT_ID` (напишите боту @userinfobot или добавьте бота в группу).
3. Railway: новый сервис из этого репозитория, команда запуска `npm start`,
   переменные из `.env.example`.

### 3. Сайт (Netlify)
Подключите репозиторий: build command и publish dir уже заданы в `netlify.toml`.
Переменные окружения те же (`SUPABASE_*`, `BOT_TOKEN`, `ADMIN_CHAT_ID`, по желанию `RESEND_*`).

### Локально
```bash
npm install
cp .env.example .env   # заполнить
npm test
node scripts/build-web.js
npx netlify dev        # сайт + функции
node --env-file=.env bot/index.js
```

## Как работает запись
- Свободные слоты считаются из `data/business.json` (часы, дни, шаг 60 мин) минус занятые в базе.
- Один слот = одна запись (уникальный индекс в базе), поэтому двойной брони не будет.
- Новая заявка (с сайта или из бота) уходит администратору в Telegram и, если настроен Resend, на почту.
- Бот в 18:00 по Ташкенту напоминает клиентам о завтрашнем визите.
