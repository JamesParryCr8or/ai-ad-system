import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve4 } from 'node:dns/promises';
import https from 'node:https';
import { load } from 'cheerio';

const ACTOR = 'eDlqVN04IqlJpom0Z';
const limits = new Map();
const cache = new Map();
const countries = new Set(['gb', 'us', 'au', 'ca', 'ie', 'nz']);
const key = () => process.env.APIFY_API_KEY?.trim();
const sign = value => createHmac('sha256', key()).update(value).digest('base64url');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

async function apify(route, options = {}) {
  const response = await fetch(`https://api.apify.com/v2/${route}`, {
    ...options, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw fail('Keyword research is temporarily unavailable. Please try again later.', 502);
  return response.json();
}

function rateLimit(req) {
  const now = Date.now();
  for (const [id, item] of limits) if (item.reset < now) limits.delete(id);
  const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0];
  for (const [id, max] of [[ip, 6], ['global', 50]]) {
    const item = limits.get(id) || { count: 0, reset: now + 3600000 };
    if (item.count >= max) throw fail('Research limit reached. Please try again in an hour; your forecast still works.', 429);
    item.count++;
    limits.set(id, item);
  }
}

export function publicIPv4(address) {
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

async function websiteHtml(input, redirects = 0) {
  let url;
  try { url = new URL(input.includes('://') ? input : `https://${input}`); } catch { throw fail('Enter a valid public website address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !url.hostname.includes('.')) throw fail('Enter a public HTTPS website address.');
  const addresses = await resolve4(url.hostname).catch(() => []);
  if (!addresses.length || addresses.some(ip => !publicIPv4(ip))) throw fail('This website address cannot be checked.');
  // Pin DNS resolution to the validated public address, including each redirect.
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'CR8OR-Growth-Planner/1.0', Accept: 'text/html', 'Accept-Encoding': 'identity' }, lookup: (_host, options, callback) => callback(null, options?.all ? [{ address: addresses[0], family: 4 }] : addresses[0], 4) }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (redirects >= 3 || !response.headers.location) return reject(fail('This website redirects too often. Enter keywords instead.'));
        return resolve(websiteHtml(new URL(response.headers.location, url).href, redirects + 1));
      }
      if (response.statusCode !== 200 || !response.headers['content-type']?.includes('text/html')) {
        response.resume(); return reject(fail('This website could not be read. Enter your keywords instead.'));
      }
      let length = 0;
      const chunks = [];
      response.on('data', chunk => { length += chunk.length; if (length > 1000000) request.destroy(fail('This page is too large. Enter keywords instead.')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    request.setTimeout(8000, () => request.destroy(fail('This website took too long to respond. Enter keywords instead.')));
    request.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw fail('Request origin is not allowed.', 403);
      if (JSON.stringify(req.body || {}).length > 5000) throw fail('Please shorten your keyword list.');
      const body = req.body || {};
      if (body.action === 'website') {
        rateLimit(req);
        if (typeof body.website !== 'string' || body.website.length > 500) throw fail('Enter a website address.');
        const $ = load(await websiteHtml(body.website));
        const suggestions = [...new Set($('h1, h2, title').map((_i, el) => $(el).text().split(/[|\u2013\u2014]/)[0].replace(/\s+/g, ' ').trim()).get())]
          .filter(text => text.length >= 4 && text.length <= 70 && !/^(home|welcome|menu|contact|newsletter|subscribe|reviews|testimonials|frequently asked)/i.test(text)).slice(0, 8);
        return res.json({ keywords: suggestions });
      }
      if (!key()) throw fail('Keyword research is being connected. You can still model growth with your own figures.', 503);
      if (!Array.isArray(body.keywords) || !body.keywords.length || body.keywords.length > 10 || body.keywords.some(k => typeof k !== 'string' || !k.trim() || k.length > 80)) throw fail('Enter between 1 and 10 keywords, up to 80 characters each.');
      if (!countries.has(body.geo)) throw fail('Choose a supported country.');
      const keywords = [...new Set(body.keywords.map(k => k.trim().toLowerCase()))];
      const cacheId = JSON.stringify([keywords.slice().sort(), body.geo, Boolean(body.ideas)]);
      const existing = cache.get(cacheId);
      if (existing && existing.expires > Date.now()) return res.status(202).json({ job: existing.job });
      rateLimit(req);
      const { data } = await apify(`acts/${ACTOR}/runs?timeout=120&memory=256&maxTotalChargeUsd=0.30`, {
        method: 'POST', body: JSON.stringify({ keywords, mode: body.ideas ? 'ideas' : 'metrics', maxIdeas: 20, geo: body.geo, language: 'en', network: 'GOOGLE_SEARCH', aiVolume: false, maxConcurrency: 1 }),
      });
      const payload = Buffer.from(JSON.stringify({ id: data.id, geo: body.geo, expires: Date.now() + 3600000 })).toString('base64url');
      const job = `${payload}.${sign(payload)}`;
      for (const [id, item] of cache) if (item.expires < Date.now()) cache.delete(id);
      cache.set(cacheId, { job, expires: Date.now() + 1800000 });
      return res.status(202).json({ job });
    }
    if (!key()) throw fail('Keyword research is temporarily unavailable.', 503);
    const token = String(req.query.job || '');
    const [payload, signature] = token.split('.');
    if (token.length > 1000 || !payload || !signature) throw fail('Invalid research session.');
    const expected = sign(payload);
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw fail('Invalid research session.');
    const job = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (job.expires < Date.now()) throw fail('Research session expired. Please search again.');
    const { data } = await apify(`actor-runs/${job.id}`);
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) throw fail('The keyword provider could not finish this search. Please try fewer keywords.', 502);
    if (data.status !== 'SUCCEEDED') return res.status(202).json({ status: 'running' });
    const rows = await apify(`datasets/${data.defaultDatasetId}/items?clean=true&limit=20`);
    const metric = n => n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? null : Math.max(0, Number(n));
    return res.json({ status: 'complete', geo: job.geo, currency: 'USD', fetchedAt: data.finishedAt, rows: rows.map(row => ({ keyword: String(row.keyword || '').slice(0, 100), volume: metric(row.search_volume), cpc: metric(row.cpc), competition: String(row.competition || 'Unknown'), lowBid: metric(row.low_top_of_page_bid), highBid: metric(row.high_top_of_page_bid), source: row.source === 'fallback' ? 'Provider fallback' : 'Apify keyword metrics', monthly: Array.isArray(row.monthly_searches) ? row.monthly_searches.slice(-12).map(m => ({ year: m.year, month: m.month, volume: metric(m.monthly_searches) })) : [] })) });
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.status ? error.message : 'Research is unavailable right now. Please try again or enter your own figures.' });
  }
}
