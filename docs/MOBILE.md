# CNC Team na telefonach

Programiści, kierownik i gość korzystają z tej samej aplikacji na serwerze firmowym — z komputera albo z telefonu, w firmie i z domu, pod jednym adresem HTTPS w domenie firmy (np. `https://cnc-team.<firma>.pl`). Nie ma osobnej aplikacji do pobrania ani usług zewnętrznych.

## Skrót na ekranie głównym (instalacja)

1. Telefon: otwórz adres CNC Team w przeglądarce i zaloguj się.
2. Android (Chrome): menu ⋮ → **Zainstaluj aplikację** / **Dodaj do ekranu głównego**. iPhone (Safari): Udostępnij → **Do ekranu początkowego**.
3. Ikona CNC Team otwiera aplikację w osobnym oknie, bez paska przeglądarki.

Warunek: ważny certyfikat HTTPS (wystawia IT, `docs/DEPLOY.md`). Bez HTTPS telefon zrobi tylko zwykły skrót do przeglądarki, a hasła szłyby nieszyfrowane — dlatego wersja firmowa zakłada wyłącznie HTTPS.

## Układ na telefonie

Górny pasek z menu i dolna nawigacja: pracownik — Dzisiaj, **Zgłoś**, Kalendarz, Projekty; kierownik — Dzisiaj, Kalendarz, Projekty, Maszyny; gość — Status projektów. Kalendarz jako lista dni, tabele jako karty, formularze na pełny ekran, duże pola dotykowe.

## Prywatność

Telefon nie przechowuje danych: zapamiętywany jest tylko wygląd aplikacji (`public/sw.js`), a każde saldo, zgłoszenie czy projekt jest pobierane z serwera przy otwarciu. Bez połączenia aplikacja pokazuje komunikat „Brak połączenia z serwerem” — zgłoszenie trzeba wysłać, gdy jest internet.

## Praca bez serwera (tylko do prób)

`npm run start:siec` uruchamia aplikację na zwykłym komputerze dla telefonów w tej samej sieci Wi-Fi (`npm run make-cert` — lokalny certyfikat). To tryb testowy; docelowo aplikacja działa na serwerze firmowym.

## Co sprawdzono

Zrzuty z emulacji telefonu (Pixel 7, 412×915): `docs/screenshots/30…37`, `59…61`, `64`; aktywny service worker, manifest `standalone`, brak błędów konsoli. Nie testowano na fizycznych telefonach firmowych.
