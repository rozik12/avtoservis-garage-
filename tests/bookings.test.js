const test = require('node:test');
const assert = require('node:assert');
const b = require('../shared/bookings');

test('normalizePhone accepts local and international formats', () => {
  assert.strictEqual(b.normalizePhone('90 123-45-67'), '+998901234567');
  assert.strictEqual(b.normalizePhone('+998 90 123 45 67'), '+998901234567');
  assert.strictEqual(b.normalizePhone('998901234567'), '+998901234567');
  assert.strictEqual(b.normalizePhone('123'), null);
  assert.strictEqual(b.normalizePhone(''), null);
});

test('allSlots covers opening hours in one-hour steps', () => {
  const slots = b.allSlots();
  assert.strictEqual(slots[0], '09:00');
  assert.strictEqual(slots[slots.length - 1], '21:00');
});

test('workingDates never includes weekends', () => {
  for (const d of b.workingDates()) {
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    assert.ok(b.business.workDays.includes(day), d);
  }
});

test('createBooking rejects bad input before touching the database', async () => {
  const good = { serviceId: 'diagnostics', date: b.workingDates()[1], time: '10:00', name: 'Ali', phone: '901234567' };
  const cases = [
    [{ ...good, serviceId: 'nope' }, 'bad_service'],
    [{ ...good, date: '2020-01-01' }, 'bad_date'],
    [{ ...good, time: '03:00' }, 'bad_time'],
    [{ ...good, name: 'A' }, 'bad_name'],
    [{ ...good, phone: '12' }, 'bad_phone'],
  ];
  for (const [input, code] of cases) {
    await assert.rejects(b.createBooking(input), (e) => e.userCode === code);
  }
});

test('every service belongs to a known category', () => {
  const ids = new Set(b.catalog.categories.map((c) => c.id));
  b.catalog.services.forEach((s) => assert.ok(ids.has(s.category), s.id));
});
