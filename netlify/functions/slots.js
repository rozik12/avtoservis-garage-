const { freeSlots, workingDates } = require('../../shared/bookings');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

// GET /api/slots            -> { dates: ["2026-10-26", ...] }
// GET /api/slots?date=...   -> { date, slots: ["09:00", ...] }
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  const date = event.queryStringParameters && event.queryStringParameters.date;
  try {
    if (!date) return json(200, { dates: workingDates() });
    return json(200, { date, slots: await freeSlots(date) });
  } catch (err) {
    console.error('[slots]', err.message);
    return json(500, { error: 'server_error' });
  }
};
