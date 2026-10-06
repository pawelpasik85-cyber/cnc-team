'use strict';
// Serwer HTTP: routing, sesje, ochrona CSRF, idempotencja, pliki statyczne.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { HttpError, userFromSession } = require('./core');
const { buildRoutes } = require('./routes');
const T = require('./time');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const MAX_BODY = 5 * 1024 * 1024;

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function compile(pattern) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { re, keys };
}

// opts.tls = { cert, key } → serwer HTTPS (wymagany przez telefon dla pełnej aplikacji PWA); opts.secure → cookie z flagą Secure
function createApp(db, opts = {}) {
  const secure = !!(opts.tls || opts.secure);
  const routes = buildRoutes().map(r => ({ ...r, ...compile(r.path) }));

  function send(res, status, body, headers = {}) {
    const isStr = typeof body === 'string' || Buffer.isBuffer(body);
    const payload = isStr ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': isStr ? (headers['Content-Type'] || 'text/plain; charset=utf-8') : 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer', ...headers,
    });
    res.end(payload);
  }

  function serveStatic(req, res, urlPath) {
    let p = urlPath === '/' ? '/index.html' : urlPath;
    const file = path.normalize(path.join(PUBLIC_DIR, p));
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
    fs.readFile(file, (err, data) => {
      if (err) {
        // SPA: nieznane ścieżki → index.html
        if (!path.extname(p)) return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => e2 ? send(res, 404, 'Not found') : send(res, 200, d2, { 'Content-Type': MIME['.html'], 'Content-Security-Policy': CSP }));
        return send(res, 404, 'Not found');
      }
      send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': CSP });
    });
  }
  const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

  async function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Zbyt duże żądanie.')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
    const apiPath = url.pathname.slice(4);
    const route = routes.find(r => r.method === req.method && r.re.test(apiPath));
    if (!route) return send(res, 404, { error: 'Nieznany adres API.' });
    try {
      const cookies = parseCookies(req.headers.cookie);
      const user = userFromSession(db, cookies.cnc_session);
      const mutating = req.method !== 'GET';
      if (mutating && req.headers['x-cnc-request'] !== '1') throw new HttpError(403, 'Brak nagłówka ochrony CSRF.');
      if (!route.public && !user) throw new HttpError(401, 'Wymagane zalogowanie.');
      const m = route.re.exec(apiPath);
      const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const raw = mutating ? await readBody(req) : '';
      let body = {};
      if (raw && !route.rawBody) {
        try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'Niepoprawny JSON.'); }
      }
      // Ochrona przed podwójnym zapisem: ten sam klucz idempotencji → ta sama odpowiedź.
      const idem = mutating && user ? req.headers['idempotency-key'] : null;
      if (idem) {
        const prev = db.get('SELECT status, response FROM idempotency_keys WHERE key=? AND user_id=?', String(idem), user.id);
        if (prev) return send(res, prev.status, prev.response, { 'Content-Type': 'application/json; charset=utf-8', 'Idempotent-Replay': 'true' });
      }
      const ctx = { db, user, params, query: Object.fromEntries(url.searchParams), body, raw, req, res, cookies, secure };
      const result = await route.handler(ctx);
      if (result && result.__raw) {
        return send(res, result.status || 200, result.body, result.headers);
      }
      const status = result && result.__status ? result.__status : 200;
      const payload = result && result.__status ? result.data : (result === undefined ? { ok: true } : result);
      if (idem && status < 300) {
        db.run('INSERT OR IGNORE INTO idempotency_keys(key,user_id,status,response,created_at) VALUES (?,?,?,?,?)', String(idem), user.id, status, JSON.stringify(payload), T.nowIso());
      }
      send(res, status, payload, result && result.__headers ? result.__headers : {});
    } catch (e) {
      if (e instanceof HttpError || e.status) {
        return send(res, e.status, { error: e.message, details: e.details || null });
      }
      if (/UNIQUE constraint failed/.test(e.message)) return send(res, 409, { error: 'Taki wpis już istnieje (duplikat).' });
      console.error(e);
      send(res, 500, { error: 'Błąd serwera.' });
    }
  };
  return opts.tls ? https.createServer(opts.tls, handler) : http.createServer(handler);
}

module.exports = { createApp };
