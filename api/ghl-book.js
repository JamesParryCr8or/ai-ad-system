import {
  GHL_ASSIGNED_USER_ID,
  GHL_CALENDAR_ID,
  GHL_LOCATION_ID,
  ghlRequest,
  normalizeSlots,
  safeErrorResponse,
} from './_ghl.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s().-]{7,24}$/;

function clean(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const firstName = clean(req.body?.firstName, 80);
  const lastName = clean(req.body?.lastName, 80);
  const email = clean(req.body?.email, 180).toLowerCase();
  const phone = clean(req.body?.phone, 30);
  const notes = clean(req.body?.notes, 2000);
  const timezone = clean(req.body?.timezone, 80) || 'Europe/London';
  const startTime = clean(req.body?.startTime, 80);
  const consent = req.body?.consent === true;

  if (!firstName || !lastName || !EMAIL_PATTERN.test(email) || !PHONE_PATTERN.test(phone)) {
    return res.status(400).json({ error: 'Please enter valid contact details.' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Please confirm the consent statement.' });
  }

  const start = new Date(startTime);
  if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Please choose an available future time.' });
  }

  try {
    // Recheck immediately before booking so a stale browser tab cannot reserve a taken slot.
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const slotParams = new URLSearchParams({
      startDate: String(dayStart.getTime()),
      endDate: String(dayEnd.getTime()),
      timezone,
    });
    const availability = normalizeSlots(
      await ghlRequest(`/calendars/${GHL_CALENDAR_ID}/free-slots?${slotParams}`),
    );
    const availableStarts = Object.values(availability).flat().map((slot) => new Date(slot).getTime());
    if (!availableStarts.includes(start.getTime())) {
      return res.status(409).json({ error: 'That time has just been taken. Please choose another slot.' });
    }

    let contactId;
    try {
      const contactData = await ghlRequest('/contacts/', {
        method: 'POST',
        body: JSON.stringify({
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          email,
          phone,
          locationId: GHL_LOCATION_ID,
          timezone,
          source: 'CR8OR website calendar',
        }),
      });
      contactId = contactData?.contact?.id;
    } catch (error) {
      // Locations that block duplicate contacts return the existing ID in the error metadata.
      contactId = error?.details?.meta?.contactId
        || error?.details?.contactId
        || error?.details?.data?.contactId;
      if (!contactId) {
        console.error('HighLevel contact stage failed', error?.details || error);
        if (error?.statusCode === 401 || error?.statusCode === 403) {
          return res.status(503).json({
            error: 'Booking setup is missing contact permission. Please try again shortly.',
            code: 'GHL_CONTACT_PERMISSION',
          });
        }
        throw error;
      }
    }
    if (!contactId) throw new Error('HighLevel did not return a contact ID');

    const endTime = new Date(start.getTime() + 30 * 60 * 1000).toISOString();
    let appointment;
    try {
      appointment = await ghlRequest('/calendars/events/appointments', {
        method: 'POST',
        body: JSON.stringify({
          calendarId: GHL_CALENDAR_ID,
          locationId: GHL_LOCATION_ID,
          contactId,
          assignedUserId: GHL_ASSIGNED_USER_ID,
          title: `${firstName} ${lastName} — Exploration Call`,
          description: [notes, 'Website consent confirmed: yes'].filter(Boolean).join('\n\n'),
          startTime,
          endTime,
          appointmentStatus: 'confirmed',
          ignoreDateRange: false,
          ignoreFreeSlotValidation: false,
          toNotify: true,
        }),
      });
    } catch (error) {
      console.error('HighLevel appointment stage failed', error?.details || error);
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        return res.status(503).json({
          error: 'Booking setup is missing appointment permission. Please try again shortly.',
          code: 'GHL_APPOINTMENT_PERMISSION',
        });
      }
      throw error;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      appointmentId: appointment.id,
      startTime: appointment.startTime || startTime,
      endTime: appointment.endTime || endTime,
    });
  } catch (error) {
    return safeErrorResponse(res, error, 'We could not complete the booking. Please try again.');
  }
}
