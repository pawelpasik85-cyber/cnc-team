'use strict';
// Wersja stacjonarna (od 0.18): bez instalacji na telefonach, sprzątanie dawnego service workera, bezpieczne cookie przy HTTPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');

async function serve(db, opts) {
  const srv = createApp(db, opts);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

test('wersja stacjonarna: brak instalacji na telefonach (manifest PWA), sprzątanie dawnego service workera', async () => {
  const w = makeWorld();
  const { srv, base } = await serve(w.db);
  try {
    const html = await (await fetch(`${base}/`)).text();
    assert.ok(!/rel="manifest"/.test(html) && !/apple-touch-icon/.test(html) && !/pwa\.js/.test(html), 'bez manifestu i skrótu na telefon');
    assert.match(html, /cleanup-sw\.js/);
    assert.equal((await fetch(`${base}/manifest.webmanifest`)).status, 404);
    const sw = await (await fetch(`${base}/sw.js`)).text();
    assert.match(sw, /registration\.unregister\(\)/); assert.match(sw, /caches\.delete/);
    assert.ok(!/addEventListener\('fetch'/.test(sw), 'service worker niczego nie buforuje ani nie przechwytuje');
    const icon = await fetch(`${base}/icons/icon-192.png`);
    assert.equal(icon.status, 200, 'ikona powiadomień i karty przeglądarki');
  } finally { srv.close(); }
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
