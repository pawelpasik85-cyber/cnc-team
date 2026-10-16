// CNC Team działa tylko na komputerach stacjonarnych (od 0.18) — bez instalacji na telefonach (PWA).
// Ten plik zostaje wyłącznie po to, żeby przeglądarki, które wcześniej zainstalowały aplikację,
// usunęły zapamiętany szkielet i wyrejestrowały service worker. Nic nie jest buforowane.
'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(list => list.forEach(c => c.navigate && c.navigate(c.url).catch(() => {}))));
});
