// CNC Team — service worker.
// Zasada prywatności: w pamięci telefonu przechowywany jest WYŁĄCZNIE szkielet aplikacji (HTML/CSS/JS/ikony).
// Odpowiedzi API (/api/*) — dane osobowe, absencje, rozliczenia — nigdy nie są buforowane.
'use strict';
const VERSION = 'cnc-team-shell-v13';
const SHELL = [
  '/', '/index.html', '/tokens.css', '/app.css', '/icons.js', '/brand.js', '/charts.js', '/ui.js', '/app.js', '/views-people.js', '/views-projects.js',
  '/views-reports.js', '/views-requests.js', '/views-analytics.js', '/views-plan.js', '/pwa.js', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // zawsze sieć, bez kopii
  if (event.request.method !== 'GET') return;
  // Szkielet: najpierw sieć (aktualna wersja), przy braku połączenia — kopia.
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(event.request, copy)); }
      return res;
    }).catch(() => caches.match(event.request).then(r => r || caches.match('/index.html')))
  );
});
