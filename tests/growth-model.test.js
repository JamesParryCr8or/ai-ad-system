import test from 'node:test';
import assert from 'node:assert/strict';
import { forecast, researchMetrics } from '../src/growth-model.js';
import handler, { publicIPv4 } from '../api/growth-research.js';

const base = { mode: 'ecommerce', budget: 3000, volume: 20000, cpc: 2, share: 40, ctr: 6, cvr: 3, close: 20, value: 150, margin: 60 };
test('forecast caps clicks and spend at available demand', () => {
  const r = forecast(base);
  assert.equal(r.clicks, 480); assert.equal(r.spend, 960); assert.equal(r.unused, 2040);
  assert.equal(r.revenue, 2160); assert.equal(r.contribution, 336);
});
test('budget-limited lead funnel applies close rate and separates CPL from CPA', () => {
  const r = forecast({ ...base, budget: 200, mode: 'leads' });
  assert.equal(r.clicks, 100); assert.equal(r.conversions, 3);
  assert.ok(Math.abs(r.sales - 0.6) < 1e-9); assert.ok(r.cpa > r.cpl);
});
test('zero costs and rates produce no infinities or manufactured acquisitions', () => {
  for (const input of [{ cpc: 0 }, { budget: 0 }, { cvr: 0 }, { volume: 0 }]) {
    const r = forecast({ ...base, ...input });
    assert.equal(r.sales, 0); assert.equal(r.cpa, null);
    assert.ok(Object.values(r).every(v => v === null || Number.isFinite(v)));
  }
});
test('unknown keyword metrics remain missing and CPC is weighted by measured volume', () => {
  const r = researchMetrics([{ volume: 100, cpc: 2 }, { volume: 300, cpc: 4 }, { volume: null, cpc: null }, { volume: 100, cpc: null }], 0.75);
  assert.equal(r.volume, 500); assert.equal(r.cpc, 2.625); assert.equal(r.missing, 2);
  assert.equal(researchMetrics([{ volume: 100, cpc: null }]).cpc, null);
});
test('scenario conversion probability never exceeds 100 percent', () => {
  const r = forecast({ ...base, cvr: 100 }, 1.2);
  assert.equal(r.conversions, r.clicks);
});
test('website reads reject local and private address ranges', () => {
  for (const ip of ['127.0.0.1', '10.2.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.1.1', '0.0.0.0', '224.1.1.1']) assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
function response() {
  return { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
}
test('API requires signed jobs and caps actor inputs and per-run spend', async () => {
  const oldKey = process.env.APIFY_API_KEY; const oldFetch = global.fetch;
  process.env.APIFY_API_KEY = 'unit-test-key';
  try {
    let call;
    global.fetch = async (url, options) => { call = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ data: { id: 'test-run' } }) }; };
    const req = { method: 'POST', headers: { host: 'localhost' }, body: { keywords: ['Laser hair growth'], geo: 'gb', ideas: true }, socket: { remoteAddress: 'test' } };
    const res = response(); await handler(req, res);
    assert.equal(res.code, 202); assert.match(call.url, /maxTotalChargeUsd=0.30/);
    assert.equal(call.body.maxIdeas, 20); assert.equal(call.body.aiVolume, false);
    assert.ok(!res.data.job.includes('unit-test-key'));
    const bad = response(); await handler({ method: 'GET', headers: {}, query: { job: res.data.job + 'tampered' } }, bad);
    assert.equal(bad.code, 400);
    const excessive = response(); await handler({ ...req, body: { ...req.body, keywords: Array(11).fill('test') } }, excessive);
    assert.equal(excessive.code, 400);
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.APIFY_API_KEY; else process.env.APIFY_API_KEY = oldKey; }
});
