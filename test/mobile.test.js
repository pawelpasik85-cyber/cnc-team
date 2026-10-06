'use strict';
// Telefony: manifest aplikacji, service worker bez buforowania danych, bezpieczne cookie przy HTTPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');

async function serve(db, opts) {
  const srv = createApp(db, opts);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

test('manifest PWA: instalowalny, ikony istnieją, poprawny typ MIME', async () => {
  const w = makeWorld();
  const { srv, base } = await serve(w.db);
  try {
    const res = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/manifest\+json/);
    const m = await res.json();
    assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'pl'); assert.ok(m.start_url.startsWith('/'));
    assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.purpose === 'maskable'));
    for (const i of m.icons) {
      const r = await fetch(`${base}/${i.src}`);
      assert.equal(r.status, 200, i.src); assert.match(r.headers.get('content-type'), /image\/png/);
    }
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /rel="manifest"/); assert.match(html, /apple-touch-icon/); assert.match(html, /viewport-fit=cover/);
  } finally { srv.close(); }
});

test('service worker nie buforuje odpowiedzi API (dane osobowe zostają na serwerze)', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
  assert.match(sw, /if \(url\.pathname\.startsWith\('\/api\/'\)\) return;/);
  assert.ok(!/\/api\//.test(sw.match(/const SHELL = \[[\s\S]*?\];/)[0]), 'API nie jest na liście szkieletu');
  for (const f of sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1))) {
    if (f === '/') continue;
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', f)), `brak pliku szkieletu ${f}`);
  }
});

test('cookie sesji z flagą Secure w trybie HTTPS, bez niej lokalnie', async () => {
  for (const secure of [false, true]) {
    const w = makeWorld();
    const { srv, base } = await serve(w.db, { secure });
    try {
      const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CNC-Request': '1' }, body: JSON.stringify({ login: 'admin', password: 'haslo-testowe-1' }) });
      const c = res.headers.get('set-cookie');
      assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/);
      assert.equal(/;\s*Secure/.test(c), secure);
    } finally { srv.close(); }
  }
});
