// Rejestracja aplikacji instalowalnej (PWA). Service worker działa tylko w bezpiecznym kontekście (HTTPS lub localhost);
// przez zwykłe http w sieci firmowej telefon utworzy skrót na ekranie głównym otwierający przeglądarkę.
'use strict';
(function () {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { /* aplikacja działa także bez SW */ }));
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    document.documentElement.dataset.installable = '1';
    const b = document.getElementById('installBtn');
    if (b) b.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => { deferred = null; toast('Zainstalowano CNC Team na tym urządzeniu.'); });
  // Przycisk „Zainstaluj” w menu (pokazywany tylko, gdy przeglądarka na to pozwala)
  document.addEventListener('click', async (e) => {
    const btnEl = e.target.closest('#installBtn');
    if (!btnEl) return;
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btnEl.classList.add('hidden'); }
    else showInstallHelp();
  });
  window.showInstallHelp = function () {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    openForm({
      title: 'Skrót na ekranie głównym', submitLabel: 'Rozumiem', fields: [], submit: async () => {},
      intro: ios
        ? '<ol><li>Otwórz CNC Team w <b>Safari</b>.</li><li>Stuknij <b>Udostępnij</b> (kwadrat ze strzałką).</li><li>Wybierz <b>Do ekranu początkowego</b> → <b>Dodaj</b>.</li></ol>'
        : '<ol><li>Otwórz CNC Team w <b>Chrome</b>.</li><li>Stuknij <b>⋮</b> (menu w prawym górnym rogu).</li><li>Wybierz <b>Zainstaluj aplikację</b> albo <b>Dodaj do ekranu głównego</b>.</li></ol>' +
          (window.isSecureContext ? '' : '<p class="notice small">Połączenie nie jest szyfrowane (http) — telefon utworzy skrót otwierający przeglądarkę. Pełna aplikacja w osobnym oknie wymaga adresu https (patrz docs/MOBILE.md).</p>'),
    });
  };
})();
