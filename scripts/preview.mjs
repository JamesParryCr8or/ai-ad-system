import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import growthResearch from '../api/growth-research.js';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const routes = new Set(['/api/ghl-availability', '/api/ghl-book', '/api/growth-research']);
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/growth-research' && process.env.APIFY_API_KEY?.trim()) {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 5000) { res.writeHead(413).end(); return; }
      }
      req.body = body ? JSON.parse(body) : {};
      req.query = Object.fromEntries(url.searchParams);
      res.status = code => { res.statusCode = code; return res; };
      res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
      await growthResearch(req, res);
      return;
    }
    // Use deployed integrations when their credentials are not available locally.
    if (routes.has(url.pathname)) {
      if (!['GET', 'POST'].includes(req.method)) { res.writeHead(405).end(); return; }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const upstream = await fetch(`https://scale.cr8or.ai${url.pathname}${url.search}`, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      const data = await upstream.json().catch(() => ({ error: 'The calendar is temporarily unavailable.' }));
      res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
      return;
    }
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.')) || /^(api|src|scripts)([\\/]|$)/.test(relative)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(req.url.startsWith('/api/') ? 502 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: req.url.startsWith('/api/') ? 'The calendar is temporarily unavailable. Please try again.' : 'Not found' }));
  }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Preview: http://localhost:${process.env.PORT || 4173}/google-ads/`));
