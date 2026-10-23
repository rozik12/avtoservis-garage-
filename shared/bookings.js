// Booking logic shared by the Netlify functions (website) and the Telegram bot.
// Plain CommonJS, Node >= 18 (global fetch). Talks to Supabase through its REST API.
// JSON is loaded with require() so the Netlify bundler inlines it into the function.
const business = require('../data/business.json');
const catalog = require('../data/services.json');

const LANGS = ['ru', 'uz', 'en'];
const pad = (n) => String(n).padStart(2, '0');

function isoDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Tashkent is UTC+5 all year (no DST), so "today in Tashkent" is a fixed offset from UTC.
function tashkentNow() {
  return new Date(Date.now() + 5 * 3600 * 1000);
}

function workingDates() {
  const start = tashkentNow();
  const out = [];
  for (let i = 0; i <= business.bookingDaysAhead; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    if (business.workDays.includes(d.getUTCDay())) out.push(isoDate(d));
  }
  return out;
}

function allSlots() {
  const out = [];
  for (let m = business.openHour * 60; m + business.slotMinutes <= business.closeHour * 60; m += business.slotMinutes) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out;
}

function isBookableDate(date) {
  return workingDates().includes(date);
}

function findService(id) {
  return catalog.services.find((s) => s.id === id) || null;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length === 12 && digits.startsWith('998')) return `+${digits}`;
  return null;
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set');
  return { url: url.replace(/\/$/, ''), key };
}

async function sb(pathAndQuery, options = {}) {
  const { url, key } = supabaseConfig();
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((body && body.message) || `Supabase error ${res.status}`);
    err.status = res.status;
    err.code = body && body.code;
    throw err;
  }
  return body;
}

async function takenSlots(date) {
  const rows = await sb(`bookings?select=booking_time&booking_date=eq.${date}&status=in.(new,confirmed)`);
  return rows.map((r) => String(r.booking_time).slice(0, 5));
}

async function freeSlots(date) {
  if (!isBookableDate(date)) return [];
  const taken = new Set(await takenSlots(date));
  const nowT = tashkentNow();
  const today = isoDate(nowT);
  const nowMinutes = nowT.getUTCHours() * 60 + nowT.getUTCMinutes();
  return allSlots().filter((t) => {
    if (taken.has(t)) return false;
    if (date !== today) return true;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m > nowMinutes + 30;
  });
}

// Validates the input and inserts the booking. Throws an Error with .userCode for expected failures.
async function createBooking(input) {
  const fail = (userCode) => Object.assign(new Error(userCode), { userCode });

  const service = findService(input.serviceId);
  if (!service) throw fail('bad_service');
  const date = cleanText(input.date, 10);
  const time = cleanText(input.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isBookableDate(date)) throw fail('bad_date');
  if (!allSlots().includes(time)) throw fail('bad_time');
  const name = cleanText(input.name, 80);
  if (name.length < 2) throw fail('bad_name');
  const phone = normalizePhone(input.phone);
  if (!phone) throw fail('bad_phone');

  const row = {
    source: input.source === 'telegram' ? 'telegram' : 'web',
    lang: LANGS.includes(input.lang) ? input.lang : 'ru',
    service_id: service.id,
    booking_date: date,
    booking_time: time,
    name,
    phone,
    car: cleanText(input.car, 80) || null,
    comment: cleanText(input.comment, 300) || null,
    telegram_id: input.telegramId || null,
  };

  try {
    const [saved] = await sb('bookings', { method: 'POST', body: JSON.stringify(row) });
    return saved;
  } catch (err) {
    if (err.code === '23505') throw fail('slot_taken');
    throw err;
  }
}

async function listUserBookings(telegramId) {
  return sb(
    `bookings?select=*&telegram_id=eq.${Number(telegramId)}&status=in.(new,confirmed)&order=booking_date.asc,booking_time.asc&limit=10`
  );
}

async function cancelBooking(id, telegramId) {
  const rows = await sb(`bookings?id=eq.${Number(id)}&telegram_id=eq.${Number(telegramId)}&status=in.(new,confirmed)`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  });
  return rows.length > 0;
}

// Bookings for the given date that came from Telegram and have not been reminded yet.
async function dueReminders(date) {
  return sb(`bookings?select=*&booking_date=eq.${date}&status=in.(new,confirmed)&reminded=eq.false&telegram_id=not.is.null`);
}

async function markReminded(id) {
  await sb(`bookings?id=eq.${Number(id)}`, { method: 'PATCH', body: JSON.stringify({ reminded: true }) });
}

function bookingSummary(b) {
  const service = findService(b.service_id);
  const serviceName = service ? service.name.ru : b.service_id;
  return [
    `🆕 Новая запись #${b.id} (${b.source})`,
    `🔧 ${serviceName}`,
    `📅 ${b.booking_date} ${String(b.booking_time).slice(0, 5)}`,
    `👤 ${b.name}`,
    `📞 ${b.phone}`,
    b.car ? `🚗 ${b.car}` : null,
    b.comment ? `💬 ${b.comment}` : null,
  ].filter(Boolean).join('\n');
}

// Best-effort notifications: a failed notification must never fail the booking itself.
async function notifyAdmin(booking) {
  const text = bookingSummary(booking);
  const jobs = [];

  if (process.env.BOT_TOKEN && process.env.ADMIN_CHAT_ID) {
    jobs.push(
      fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.ADMIN_CHAT_ID, text }),
      })
    );
  }
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL_TO) {
    jobs.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.NOTIFY_EMAIL_FROM || 'Garage Detailing <onboarding@resend.dev>',
          to: [process.env.NOTIFY_EMAIL_TO],
          subject: `Новая запись #${booking.id}`,
          text,
        }),
      })
    );
  }
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => r.status === 'rejected' && console.error('[notifyAdmin]', r.reason && r.reason.message));
}

module.exports = {
  business,
  catalog,
  LANGS,
  workingDates,
  allSlots,
  freeSlots,
  findService,
  normalizePhone,
  createBooking,
  listUserBookings,
  cancelBooking,
  notifyAdmin,
  bookingSummary,
  dueReminders,
  markReminded,
  tashkentNow,
  isoDate,
};
