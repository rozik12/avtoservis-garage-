const { createBooking, notifyAdmin } = require('../../shared/bookings');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const USER_ERRORS = new Set(['bad_service', 'bad_date', 'bad_time', 'bad_name', 'bad_phone', 'slot_taken']);

// POST /api/booking  { serviceId, date, time, name, phone, car?, comment?, lang?, website? }
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'bad_json' });
  }

  // Honeypot: real visitors never fill the hidden "website" field.
  if (input.website) return json(200, { ok: true });

  try {
    const booking = await createBooking({ ...input, source: 'web' });
    await notifyAdmin(booking);
    return json(200, { ok: true, id: booking.id });
  } catch (err) {
    if (USER_ERRORS.has(err.userCode)) return json(400, { error: err.userCode });
    console.error('[booking]', err.message);
    return json(500, { error: 'server_error' });
  }
};
