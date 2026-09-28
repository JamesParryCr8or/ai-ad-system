import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/ghl-book.js';

const originalFetch = globalThis.fetch;
const originalStripeKey = process.env.STRIPE_SECRET_API_KEY;
const originalGhlKey = process.env.GHL_API_KEY;
const startTime = new Date(Date.now() + 3 * 86400000).toISOString();
const nextHalfHour = new Date(new Date(startTime).getTime() + 30 * 60000).toISOString();
const sessionId = `cs_test_${'a'.repeat(24)}`;

function response() {
  return {
    statusCode: 200,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request() {
  return {
    method: 'POST',
    body: {
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
      phone: '+447700900123', consent: true, startTime, timezone: 'Europe/London',
      bookingPurpose: 'website-exploration', websiteSessionId: sessionId,
    },
  };
}

test('website call requires payment and reserves a full hour', async () => {
  process.env.STRIPE_SECRET_API_KEY = 'test-only';
  process.env.GHL_API_KEY = 'test-only';
  let paid = false;
  let appointment;
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.includes('/checkout/sessions/')) return { ok: true, json: async () => ({
      metadata: { offer: 'bespoke-website-49' }, currency: 'gbp', amount_total: 4900,
      status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid',
    }) };
    if (path.includes('/free-slots')) return { ok: true, json: async () => ({
      'future-day': { slots: [startTime, nextHalfHour] },
    }) };
    if (path.includes('/contacts/upsert')) return { ok: true, json: async () => ({ contact: { id: 'contact-1' } }) };
    if (path.includes('/calendars/events/appointments')) {
      appointment = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 'appointment-1' }) };
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    const unpaid = response();
    await handler(request(), unpaid);
    assert.equal(unpaid.statusCode, 403);
    assert.equal(appointment, undefined);

    paid = true;
    const booked = response();
    await handler(request(), booked);
    assert.equal(booked.statusCode, 200);
    assert.equal(new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime(), 60 * 60000);
    assert.match(appointment.title, /Website Exploration Call/);
    assert.equal(appointment.ignoreFreeSlotValidation, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStripeKey === undefined) delete process.env.STRIPE_SECRET_API_KEY;
    else process.env.STRIPE_SECRET_API_KEY = originalStripeKey;
    if (originalGhlKey === undefined) delete process.env.GHL_API_KEY;
    else process.env.GHL_API_KEY = originalGhlKey;
  }
});
