// Wersja stacjonarna: wyrejestrowanie dawnego service workera (instalacja PWA z wersji ≤ 0.17) i usunięcie jego kopii plików.
'use strict';
(function () {
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
  } catch (e) { /* brak obsługi — nic do sprzątania */ }
})();
