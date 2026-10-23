// Garage Detailing Telegram bot (grammY). Run: BOT_TOKEN=... node bot/index.js
const { Bot, InlineKeyboard, Keyboard, session } = require('grammy');
const bookings = require('../shared/bookings');
const TEXTS = require('./texts');

const { business, catalog, LANGS } = bookings;
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('[bot] BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Bot(token);
bot.use(session({ initial: () => ({ lang: null, step: null, draft: {} }) }));

const langOf = (ctx) => {
  if (!ctx.session.lang) {
    const guess = String((ctx.from && ctx.from.language_code) || 'ru').slice(0, 2);
    ctx.session.lang = LANGS.includes(guess) ? guess : 'ru';
  }
  return ctx.session.lang;
};
const tx = (ctx) => TEXTS[langOf(ctx)];
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function mainMenu(ctx) {
  const m = tx(ctx).menu;
  return new InlineKeyboard()
    .text(m.book, 'm:book').row()
    .text(m.services, 'm:services').text(m.my, 'm:my').row()
    .text(m.contacts, 'm:contacts').text(m.faq, 'm:faq').row()
    .text(m.lang, 'm:lang');
}

function categoryKeyboard(ctx, prefix) {
  const l = langOf(ctx);
  const kb = new InlineKeyboard();
  catalog.categories.forEach((c) => kb.text(`${c.icon} ${c.name[l]}`, `${prefix}:${c.id}`).row());
  return kb;
}

function serviceLine(ctx, s) {
  const t = tx(ctx);
  return `${s.name[langOf(ctx)]} — ${t.from} ${fmt(s.priceFrom)} ${t.sum}`;
}

async function sendMenu(ctx, text) {
  await ctx.reply(text || tx(ctx).welcome(business.name), { reply_markup: mainMenu(ctx) });
}

function resetWizard(ctx) {
  ctx.session.step = null;
  ctx.session.draft = {};
}

/* ---------- start & language ---------- */
bot.command('start', async (ctx) => {
  resetWizard(ctx);
  ctx.session.lang = null;
  const kb = new InlineKeyboard().text('Русский', 'lang:ru').text("O'zbekcha", 'lang:uz').text('English', 'lang:en');
  await ctx.reply(TEXTS.ru.chooseLang, { reply_markup: kb });
});

bot.command('menu', async (ctx) => { resetWizard(ctx); await sendMenu(ctx); });

bot.callbackQuery(/^lang:(ru|uz|en)$/, async (ctx) => {
  ctx.session.lang = ctx.match[1];
  await ctx.answerCallbackQuery();
  await sendMenu(ctx);
});

/* ---------- menu actions ---------- */
bot.callbackQuery('m:lang', async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard().text('Русский', 'lang:ru').text("O'zbekcha", 'lang:uz').text('English', 'lang:en');
  await ctx.reply(TEXTS.ru.chooseLang, { reply_markup: kb });
});

bot.callbackQuery('m:services', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(tx(ctx).chooseCategory, { reply_markup: categoryKeyboard(ctx, 'sc') });
});

bot.callbackQuery(/^sc:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const l = langOf(ctx);
  const cat = catalog.categories.find((c) => c.id === ctx.match[1]);
  if (!cat) return;
  const lines = catalog.services.filter((s) => s.category === cat.id).map((s) => `• ${serviceLine(ctx, s)}`);
  const kb = new InlineKeyboard().text(tx(ctx).menu.book, `bc:${cat.id}`).row().text(tx(ctx).back, 'm:services');
  await ctx.reply(`${cat.icon} ${cat.name[l]}\n\n${lines.join('\n')}`, { reply_markup: kb });
});

bot.callbackQuery('m:contacts', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(tx(ctx).contacts(business, langOf(ctx)));
  if (business.mapQuery) await ctx.reply(`https://www.google.com/maps?q=${encodeURIComponent(business.mapQuery)}`);
});

bot.callbackQuery('m:faq', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(tx(ctx).faqText);
});

/* ---------- my bookings ---------- */
bot.callbackQuery('m:my', async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = tx(ctx);
  try {
    const rows = await bookings.listUserBookings(ctx.from.id);
    if (!rows.length) return ctx.reply(t.myEmpty);
    const kb = new InlineKeyboard();
    const lines = rows.map((b) => {
      const s = bookings.findService(b.service_id);
      kb.text(t.cancelBooking(b.id), `cx:${b.id}`).row();
      return `#${b.id} — ${s ? s.name[langOf(ctx)] : b.service_id}\n📅 ${b.booking_date} ${String(b.booking_time).slice(0, 5)}`;
    });
    await ctx.reply(`${t.myTitle}\n\n${lines.join('\n\n')}`, { reply_markup: kb });
  } catch (err) {
    console.error('[my]', err.message);
    await ctx.reply(t.error);
  }
});

bot.callbackQuery(/^cx:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = tx(ctx);
  try {
    const ok = await bookings.cancelBooking(ctx.match[1], ctx.from.id);
    await ctx.reply(ok ? t.bookingCancelled(ctx.match[1]) : t.error);
  } catch (err) {
    console.error('[cancel]', err.message);
    await ctx.reply(t.error);
  }
});

/* ---------- booking wizard ---------- */
bot.callbackQuery('m:book', async (ctx) => {
  await ctx.answerCallbackQuery();
  resetWizard(ctx);
  await ctx.reply(tx(ctx).chooseCategory, { reply_markup: categoryKeyboard(ctx, 'bc') });
});

async function askService(ctx, categoryId) {
  const kb = new InlineKeyboard();
  catalog.services.filter((s) => s.category === categoryId).forEach((s) => kb.text(serviceLine(ctx, s), `bs:${s.id}`).row());
  kb.text(tx(ctx).back, 'm:book');
  await ctx.reply(tx(ctx).chooseService, { reply_markup: kb });
}

bot.callbackQuery(/^bc:(\w+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  resetWizard(ctx);
  await askService(ctx, ctx.match[1]);
});

bot.callbackQuery(/^bs:([\w-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const service = bookings.findService(ctx.match[1]);
  if (!service) return;
  ctx.session.draft = { serviceId: service.id };
  const kb = new InlineKeyboard();
  bookings.workingDates().forEach((d, i) => { kb.text(d.slice(5).replace('-', '.'), `bd:${d}`); if (i % 3 === 2) kb.row(); });
  kb.row().text(tx(ctx).cancel, 'wiz:cancel');
  await ctx.reply(tx(ctx).chooseDate, { reply_markup: kb });
});

bot.callbackQuery(/^bd:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = tx(ctx);
  if (!ctx.session.draft.serviceId) return sendMenu(ctx);
  try {
    const slots = await bookings.freeSlots(ctx.match[1]);
    if (!slots.length) return ctx.reply(t.noSlots);
    ctx.session.draft.date = ctx.match[1];
    const kb = new InlineKeyboard();
    slots.forEach((s, i) => { kb.text(s, `bt:${s}`); if (i % 4 === 3) kb.row(); });
    kb.row().text(t.cancel, 'wiz:cancel');
    await ctx.reply(t.chooseTime(ctx.match[1]), { reply_markup: kb });
  } catch (err) {
    console.error('[slots]', err.message);
    await ctx.reply(t.error);
  }
});

bot.callbackQuery(/^bt:(\d{2}:\d{2})$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.draft.date) return sendMenu(ctx);
  ctx.session.draft.time = ctx.match[1];
  ctx.session.step = 'name';
  await ctx.reply(tx(ctx).askName, { reply_markup: { remove_keyboard: true } });
});

bot.callbackQuery('wiz:cancel', async (ctx) => {
  await ctx.answerCallbackQuery();
  resetWizard(ctx);
  await sendMenu(ctx, tx(ctx).wizardCancelled);
});

async function askConfirm(ctx) {
  const t = tx(ctx);
  const d = ctx.session.draft;
  const s = bookings.findService(d.serviceId);
  const text = [
    t.confirmTitle,
    `🔧 ${s.name[langOf(ctx)]}`,
    `📅 ${d.date} ${d.time}`,
    `👤 ${d.name}`,
    `📞 ${d.phone}`,
    d.car ? `🚗 ${d.car}` : null,
  ].filter(Boolean).join('\n');
  await ctx.reply(text, { reply_markup: new InlineKeyboard().text(t.confirm, 'wiz:ok').text(t.cancel, 'wiz:cancel') });
}

bot.callbackQuery('wiz:ok', async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = tx(ctx);
  const d = ctx.session.draft;
  if (!d.serviceId || !d.date || !d.time || !d.name || !d.phone) return sendMenu(ctx);
  try {
    const booking = await bookings.createBooking({ ...d, source: 'telegram', lang: langOf(ctx), telegramId: ctx.from.id });
    await bookings.notifyAdmin(booking);
    resetWizard(ctx);
    await sendMenu(ctx, t.done(booking.id));
  } catch (err) {
    if (err.userCode === 'slot_taken') {
      ctx.session.draft.time = null;
      return ctx.reply(t.slotTaken, { reply_markup: new InlineKeyboard().text(t.menu.book, 'm:book') });
    }
    console.error('[confirm]', err.message);
    await ctx.reply(t.error);
  }
});

/* ---------- text & contact input for the wizard ---------- */
bot.on('message:contact', async (ctx) => {
  if (ctx.session.step !== 'phone') return;
  await acceptPhone(ctx, ctx.message.contact.phone_number);
});

async function acceptPhone(ctx, raw) {
  const phone = bookings.normalizePhone(raw);
  if (!phone) return ctx.reply(tx(ctx).badPhone);
  ctx.session.draft.phone = phone;
  ctx.session.step = 'car';
  await ctx.reply(tx(ctx).askCar, { reply_markup: { remove_keyboard: true } });
}

bot.on('message:text', async (ctx) => {
  const t = tx(ctx);
  const text = ctx.message.text.trim();
  switch (ctx.session.step) {
    case 'name':
      if (text.length < 2) return ctx.reply(t.badName);
      ctx.session.draft.name = text.slice(0, 80);
      ctx.session.step = 'phone';
      return ctx.reply(t.askPhone, { reply_markup: new Keyboard().requestContact(t.sharePhone).oneTime().resized() });
    case 'phone':
      return acceptPhone(ctx, text);
    case 'car':
      ctx.session.draft.car = text === '-' ? '' : text.slice(0, 80);
      ctx.session.step = null;
      return askConfirm(ctx);
    default:
      return sendMenu(ctx);
  }
});

/* ---------- daily reminder (18:00 Tashkent time) ---------- */
let lastReminderDay = null;
async function runReminders() {
  const now = bookings.tashkentNow();
  const today = bookings.isoDate(now);
  if (now.getUTCHours() !== 18 || lastReminderDay === today) return;
  lastReminderDay = today;
  const tomorrow = bookings.isoDate(new Date(now.getTime() + 24 * 3600 * 1000));
  try {
    const rows = await bookings.dueReminders(tomorrow);
    for (const b of rows) {
      const lang = LANGS.includes(b.lang) ? b.lang : 'ru';
      const s = bookings.findService(b.service_id);
      try {
        await bot.api.sendMessage(b.telegram_id, TEXTS[lang].reminder(s ? s.name[lang] : b.service_id, b.booking_date, String(b.booking_time).slice(0, 5)));
        await bookings.markReminded(b.id);
      } catch (err) {
        console.error('[reminder]', b.id, err.message);
      }
    }
  } catch (err) {
    console.error('[reminders]', err.message);
  }
}
setInterval(runReminders, 10 * 60 * 1000);

bot.catch((err) => console.error('[bot]', err.message));

bot.api.setMyCommands([
  { command: 'start', description: 'Start / Boshlash / Старт' },
  { command: 'menu', description: 'Menu / Menyu / Меню' },
]).catch(() => {});

bot.start({ onStart: (me) => console.log(`[bot] @${me.username} started`) });

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
