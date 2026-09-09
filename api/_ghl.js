const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

export const GHL_CALENDAR_ID = process.env.GHL_CALENDAR_ID || 'vgGPyGGNGNmBGXwGNDHM';
export const GHL_APP_CALENDAR_ID = process.env.GHL_APP_CALENDAR_ID || 'OxRH5g7JiswQd2BSSpWN';
export const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || 'u3QaT76YAw3PJvfiuGkZ';
export const GHL_ASSIGNED_USER_ID = process.env.GHL_ASSIGNED_USER_ID || 'wrbiVrpfXVbAMAodROWY';

export function resolveCalendarId(requestedId) {
  const calendarId = String(requestedId || GHL_CALENDAR_ID);
  return [GHL_CALENDAR_ID, GHL_APP_CALENDAR_ID].includes(calendarId) ? calendarId : null;
}

export function getGhlToken() {
  return process.env.GHL_API_KEY || process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
}

export async function ghlRequest(path, options = {}) {
  const token = getGhlToken();
  if (!token) {
    const error = new Error('GoHighLevel integration is not configured');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Version: '2021-07-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `HighLevel request failed (${response.status})`);
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

export function normalizeSlots(data) {
  return Object.entries(data || {}).reduce((result, [date, value]) => {
    const slots = Array.isArray(value) ? value : value?.slots;
    if (Array.isArray(slots) && slots.length) result[date] = slots;
    return result;
  }, {});
}

export function safeErrorResponse(res, error, fallbackMessage) {
  console.error(fallbackMessage, error?.details || error);
  const status = error?.statusCode === 401 || error?.statusCode === 403
    ? 503
    : Math.min(Math.max(error?.statusCode || 500, 400), 599);
  const message = status === 503
    ? 'The calendar connection is temporarily unavailable.'
    : fallbackMessage;
  return res.status(status).json({ error: message });
}
