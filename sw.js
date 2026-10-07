// Aplikacja pracownika — service worker: szkielet aplikacji działa bez internetu.
// Dane (grafik, saldo, zgłoszenia) przechowuje sama aplikacja w pamięci telefonu i odświeża przy połączeniu;
// odpowiedzi chmury (supabase.co) nie są buforowane przez service worker.
'use strict';
const VERSION = 'cnc-pracownik-1.2';
const SHELL = ['./', 'index.html', 'app.css', 'tokens.css', 'config.js', 'icons.js', 'core.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
