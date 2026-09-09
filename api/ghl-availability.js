import {
  GHL_CALENDAR_ID,
  ghlRequest,
  normalizeSlots,
  safeErrorResponse,
} from './_ghl.js';

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startDate = Number(req.query.startDate);
  const endDate = Number(req.query.endDate);
  const timezone = String(req.query.timezone || 'Europe/London');

  if (!Number.isFinite(startDate) || !Number.isFinite(endDate) || endDate <= startDate) {
    return res.status(400).json({ error: 'A valid date range is required.' });
  }
  if (endDate - startDate > MAX_RANGE_MS) {
    return res.status(400).json({ error: 'Availability can be requested for up to 31 days.' });
  }
  if (!/^[A-Za-z_+\-/]+$/.test(timezone)) {
    return res.status(400).json({ error: 'Invalid timezone.' });
  }

  try {
    const params = new URLSearchParams({
      startDate: String(startDate),
      endDate: String(endDate),
      timezone,
    });
    const data = await ghlRequest(`/calendars/${GHL_CALENDAR_ID}/free-slots?${params}`);

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ slots: normalizeSlots(data), timezone });
  } catch (error) {
    return safeErrorResponse(res, error, 'Unable to load calendar availability.');
  }
}
