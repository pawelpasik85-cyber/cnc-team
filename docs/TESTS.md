# Testy — instrukcja i wyniki

## Uruchomienie

```bash
npm test                                   # 45 testów, każdy na świeżej bazie w pamięci (jeden — w pliku tymczasowym)
npm test -- --test-reporter=spec           # czytelny raport
```

Testy nie potrzebują sieci ani danych demonstracyjnych; ustawiają własną datę „dzisiaj” (`CNC_TODAY`). Pliki: `test/settlements.test.js`, `test/absences.test.js`, `test/projects.test.js`, `test/api.test.js` (HTTP na losowym porcie), `test/mobile.test.js` (manifest, service worker, cookie Secure).

Zrzuty ekranów i kontrola błędów konsoli przeglądarki (opcjonalnie, wymaga Python + Playwright):
```bash
npm run seed -- --reset
CNC_TODAY=2026-10-06 npm start
python scripts/screenshots.py http://127.0.0.1:3000 docs/screenshots
```

## Wyniki (6.10.2026, Node.js 22.22.0, Linux)

**29 / 29 zaliczonych, 0 błędów** (runda 1 — telefony). Skrypt zrzutów: 25 ekranów komputera + 8 ekranów telefonu (Pixel 7, 412×915), aktywny service worker, manifest `standalone` z 3 ikonami, „Brak błędów konsoli”. Tryb https sprawdzony ręcznie: certyfikat z `npm run make-cert` weryfikuje się względem lokalnego CA (`openssl verify`), logowanie przez https ustawia cookie `Secure`, manifest serwowany jako `application/manifest+json`.

Kontrola, czy testy faktycznie wykrywają błędy: celowe wyłączenie blokady podwójnego rozliczenia (`exits.js`) oraz filtra „pracownik widzi tylko własne wyjścia” (`routes.js`) spowodowało niezaliczenie odpowiednich testów; po przywróceniu kodu — 26/26.

### Runda 2 — aplikacja pracownika i chmura (6.10.2026)
**40 / 40 zaliczonych.** Nowe: `test/cloud.test.js` (logowanie kierownika, synchronizacja, przyjęcie spóźnienia jako wyjście 40 min, odrzucenie z wyjaśnieniem, próba na sucho blokująca decyzję, odświeżenie sesji, brak sieci, publikacje bez danych poufnych) i `test/mobile-core.test.js` (walidacja, logowanie, kolejka offline bez duplikatów, własne saldo, kompletność zbudowanej strony) — na atrapie Supabase `test/fake-supabase.js`.
Prawdziwa baza: `supabase/tests/rls_check.sql` — 23 sprawdzenia uprawnień, wszystkie zgodne (test wykrył i pozwolił poprawić błąd 42702 w `decide_report`). Zrzuty aplikacji pracownika (Pixel 7) z kolejką offline: `docs/screenshots/40…46-pracownik-*.png`, bez błędów konsoli.

### Runda 3 — zgłoszenia do weryfikacji, gość, opóźnienie, serwer (7.10.2026)
**45 / 45 zaliczonych.** Nowe: `test/requests.test.js` — pracownik nie może niczego wpisać bezpośrednio (wyjścia, odrabianie, absencje, zadania, czas, przekazania, tablica → 403), składa zgłoszenia (walidacja, duplikat `client_id`), wycofuje tylko własne nierozpatrzone; decyzja tylko kierownika (przełożony i pracownik → 403), odrzucenie wymaga wyjaśnienia, jedna decyzja; przyjęcie spóźnienia tworzy wyjście 40 min, przyjęcie odrobienia — odrabianie przypisane do wyjścia (saldo 0), odrobienie bez wyjścia → 409 i zgłoszenie zostaje „nowe”; historia: zgłoszenie i decyzja z różnymi autorami. Gość: tylko przypisane projekty w realizacji, bez osób i czasów, 13 tras → 403. Pracownik widzi tylko swoje projekty (+ tablica maszyn), cudzy → 403, ustawienie „wszystkie”. Opóźnienie: plan 50% / wykonano 20% → 30%, poziomy, po terminie, brak danych. Blokada logowania po 5 błędach (429, inne konto działa, wpis w historii). Opis zmian: pole, było → jest, kto, powód.
Migracja 003 (przebudowa tabeli `users` dla roli gościa) sprawdzona na bazie z danymi: `PRAGMA foreign_key_check` bez błędów.
Zrzuty: `docs/screenshots/50…66` (kierownik, pracownik na komputerze i telefonie, gość, blokada logowania), skrypt `scripts/screenshots-v3.py` — bez błędów konsoli; sprawdza też, że pracownica nie otworzy nieprzypisanego projektu.

## Pokrycie wymaganych scenariuszy

| Wymagany scenariusz | Test (plik → nazwa) |
|---|---|
| odrabianie 90 → 45 → 0 minut | settlements → „odrabianie 90 → 45 → 0 minut” |
| kilka wyjść i brak podwójnego odrobienia | settlements → „kilka wyjść: brak podwójnego odrobienia…, brak kredytu z nadwyżki” (także: nadgodziny ≠ odrobienie, odrabianie przed wyjściem odrzucone) |
| nakładające się wpisy | settlements → „nakładające się wpisy są odrzucane”; „kolizje odrabiania z grafikiem, odpoczynkiem i dniem wolnym” |
| koniec miesiąca w weekend | settlements → „koniec miesiąca w weekend: wyzwalacze alertów i brak duplikatów” (styczeń 2027 — niedziela; październik 2026 — sobota) |
| późno dodane wyjście i alarm | settlements → „późno dodane wyjście uruchamia zaległe alerty; rozliczenie je zamyka” |
| zmiana nocna na granicy miesiąca | settlements → „zmiana nocna na granicy miesiąca należy do miesiąca rozpoczęcia” |
| zmiana czasu | settlements → „zmiana czasu: zmiana nocna 9 h jesienią, 7 h wiosną, rzeczywiste minuty wyjścia” |
| urlop po 30 września bez automatycznego zerowania | absences → „urlop po 30 września: ostrzeżenie bez zerowania salda…” |
| ręczna korekta i zachowanie historii | absences → „ręczna korekta puli: obowiązkowy powód, saldo przed i po, historia” |
| brak długu przy L4 i urlopie | settlements → „brak długu do odrobienia przy L4 i urlopie” (także siła wyższa) |
| dni/godziny siły wyższej i blokada mieszania | absences → „siła wyższa: dni albo godziny, blokada mieszania i limit 2 dni / 16 h” |
| anulowanie pierwszego planowanego wpisu | absences → „anulowanie pierwszego planowanego wpisu nie blokuje wyboru jednostki” |
| nowy wybór jednostki w kolejnym roku | absences → „nowy rok: nowy wybór jednostki i nowy limit, bez przenoszenia” |
| niezależne pule uprawnień | absences → „niezależne pule: siła wyższa, art. 188 i urlop wypoczynkowy wg roku nabycia” |
| zamknięcie i korekta miesiąca | settlements → „zamknięcie i korekta miesiąca: saldo zachowane, wersje raportu” |
| odmowa dostępu pracownika do raportów, API i eksportów | api → „odmowa dostępu pracownika…; przełożony bez edycji; dane poufne” (15 tras GET i 8 tras zapisu, CSRF, 401) |
| zapis po restarcie | api → „zapis po restarcie: dane w pliku bazy, migracje nie są powtarzane” |
| raport przy niepełnych danych | projects → „raport przy niepełnych danych: brak danych ≠ zero, kompletność i liczebność próbki” |
| import technologiczny dla właściwej i starej rewizji NC | projects → „import technologiczny: właściwa i stara rewizja NC, walidacja, duplikaty, brak wpływu na rozliczenia” |
| brak poufnych danych w eksporcie do CNC Process | projects → „eksport do CNC Process bez danych osobowych i poufnych” |

| telefony (dodatkowe) | mobile → manifest PWA i ikony; service worker nie buforuje API; cookie Secure w trybie HTTPS |

Dodatkowe: niepełny etat (limit do potwierdzenia przez kadry), postęp wagowy i potwierdzenie rezultatu, pierwotny plan, CSV (wstrzyknięcie formuł), idempotencja zapisu.

## Czego testy nie obejmują
Interfejs jest sprawdzany zrzutami ekranów i brakiem błędów konsoli, bez klikania wszystkich formularzy (brak testów E2E). Przepisy prawa nie są testem — patrz `docs/RULES.md`.

## Po uwagach z przeglądu
Po wprowadzeniu poprawek: `npm test` (całość trwa kilka sekund) oraz ponowny skrypt zrzutów dla zmienionych ekranów; wynik dopisać w tej sekcji.
