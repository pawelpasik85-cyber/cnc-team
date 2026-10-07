# REVIEW.md — pakiet do niezależnego przeglądu (ChatGPT)

Prośba: przejrzyj krytycznie aplikację CNC Team pod kątem poprawności reguł, bezpieczeństwa uprawnień, integralności danych i zgodności ze specyfikacją. Wskaż konkretne błędy (plik, funkcja, scenariusz odtworzenia) i oceń ich wagę. Uwagi zostaną sprawdzone przez autora — może się z nimi nie zgodzić, jeśli są nietrafne — a poprawki zweryfikowane testami.

## Jak uruchomić
Node.js ≥ 22.13, bez `npm install`:
```bash
npm test                          # 47 testów
npm run seed -- --reset           # dane fikcyjne
CNC_TODAY=2026-10-06 npm start    # http://127.0.0.1:3000, hasło demo: demo-cnc-2026 (kierownik / przelozony / adam)
```

## Mapa kodu (od czego zacząć)
| Plik | Co sprawdzić |
|---|---|
| `server/domain/exits.js` | Wyjścia, odrabianie (`createMakeup`: kolizje, odpoczynek, alokacje, brak kredytu), alerty (`alertTriggers`, `recomputeAlerts`), zamknięcie miesiąca (`closeMonth`, `reopenMonth`) |
| `server/domain/absences.js` | Pule urlopu (`poolBalance`, `pickPool`, `adjustPool`), zaległy urlop (`overdueStatus`), siła wyższa / art. 188 (`unitChoice`, `checkUnitRules`, `lockUnitIfFirstUse`, `correctUnitChoice`) |
| `server/time.js` | Europe/Warsaw i DST (`localToUtc` — godziny niejednoznaczne/nieistniejące) |
| `server/routes.js` + `server/core.js` | Uprawnienia, filtrowanie pól poufnych, CSRF, eksporty |
| `server/app.js` | Sesje, idempotencja, CSP |
| `server/domain/projects.js`, `reports.js`, `integration.js` | Postęp wagowy, raporty (brak danych ≠ 0), import/eksport JSON |
| `server/migrations/001_init.sql` | Schemat |

Dokumentacja: `docs/RULES.md` (reguły + status weryfikacji prawnej), `docs/PERMISSIONS.md`, `docs/DATA_MODEL.md`, `docs/LIMITATIONS.md`, `docs/TESTS.md`.

## Pytania do recenzenta (obszary ryzyka, które autor sam wskazuje)
1. **Przepisy**: reguły ustawowe nie zostały porównane z tekstem jednolitym w tej wersji (status „do potwierdzenia przez kadry”). Czy któraś zakodowana reguła lub opis w `server/reference.js` jest niezgodny z aktualnym prawem (stan 2026)? Szczególnie: art. 148¹ i 188 dla niepełnego etatu, urlop uzupełniający macierzyński (numer artykułu), Wigilia jako dzień wolny, zakres zwolnienia krwiodawców.
2. **Odrabianie**: czy zasady (poza grafikiem, ten sam miesiąc, nie przed wyjściem, 11 h odpoczynku między blokami pracy, dzień wolny tylko z uzasadnieniem) są wystarczające i nie za restrykcyjne? Odpoczynek tygodniowy nie jest sprawdzany.
3. **Wyzwalacz „dwa dni robocze”** zinterpretowano jako datę przedostatniej zmiany pracownika w miesiącu (gdy wypada wcześniej niż „koniec − 2 dni”). Czy to trafna interpretacja specyfikacji?
4. **Wybór jednostki SW/188**: blokada zapisywana przy pierwszym wykorzystaniu i nie zdejmowana automatycznie po anulowaniu tego wpisu (wymaga korekty z powodem). Czy to właściwe?
5. **Zamknięcie miesiąca**: czy stan „nierozliczone — do przekazania kadrom” i ponowne otwarcie zachowują pełną historię? Czy można obejść blokadę zamkniętego miesiąca jakąkolwiek trasą API?
6. **Uprawnienia**: czy istnieje trasa, przez którą pracownik lub przełożony bez uprawnienia odczyta notatkę poufną, dokument, nazwę kategorii poufnej, plan czasu albo cudze saldo (sprawdź też `/today`, `/events`, `/bootstrap`, `/projects/:id`)?
7. **DST**: przypadki brzegowe w `localToUtc` i zmianach przez północ w nocy zmiany czasu.
8. **Integralność**: brak transakcji wokół jakiejś złożonej operacji? Wyścigi przy równoległych żądaniach (jeden proces, SQLite `BEGIN IMMEDIATE`)?
9. **Telefony (runda 1)**: `public/sw.js` — czy na pewno żadna odpowiedź `/api` nie trafia do pamięci telefonu? `docs/MOBILE.md` — czy instrukcja instalacji lokalnego CA i ostrzeżenie o http są wystarczające? `server/index.js` — tryb `start:siec` i wykrywanie certyfikatu.
10. **Chmura (runda 2)**: `supabase/*.sql` — czy RLS i funkcje SECURITY DEFINER nie pozwalają pracownikowi na więcej niż własne dane? `server/domain/cloud.js` — kolejność próba na sucho → decyzja w chmurze → wpis lokalny; `buildPublications` — czy nic poufnego nie wycieka? `mobile/core.js` — kolejka offline i duplikaty.
11. **Runda 3 — zaufanie i role**: `server/domain/requests.js` (pracownik tylko zgłasza; `decideRequest` tworzy wpis w tej samej transakcji), `server/app.js` (`GUEST_ALLOWED` — czy gość ma dostęp tylko do statusu?), `server/routes.js` (`visibleProjects`, blokada logowania w `/login`, `describeChanges`), migracja `003_requests_guest.sql` (przebudowa `users` z `defer_foreign_keys`). Czy jest trasa, przez którą pracownik zmieni dane bez decyzji kierownika albo zobaczy projekt, do którego nie jest przypisany? Czy definicja opóźnienia (`scheduleStatus`) jest sensowna?
12. **Interfejs**: dostępność (kontrast, klawiatura, znaczenie nie tylko kolorem), czytelność dla kierownika.

## Co świadomie NIE zostało zrobione
Brak CAM/analizy ścieżek/czasu obróbki; brak wynagrodzeń, zasiłków, potrąceń; brak wysyłki powiadomień poza aplikacją; brak integracji Entra/SharePoint/Teams (opis: `INTEGRATIONS.md`); brak automatycznego odczytu maszyn; brak wdrożenia.

## Format odpowiedzi
Dla każdej uwagi: **waga** (krytyczna / istotna / drobna), **miejsce**, **opis i scenariusz odtworzenia**, **proponowana poprawka**. Osobno: uwagi prawne z odnośnikiem do przepisu.

## Historia przeglądów
| Runda | Data | Wynik |
|---|---|---|
| 0 | 2026-10-06 | Wersja 0.1 przygotowana do przeglądu; testy 26/26 |
| 1 | 2026-10-06 | Dodano telefony: PWA, układ mobilny, tryb sieci firmowej, https; testy 29/29 |
| 2 | 2026-10-06 | Aplikacja pracownika (PWA/APK) + Supabase, zgłoszenia i publikacje; testy 40/40, RLS 23/23. Od tej rundy recenzja GPT działa automatycznie przy każdym pushu (po dodaniu sekretu) |
| 3 | 2026-10-07 | Wersja na serwer firmowy: zgłoszenia do weryfikacji (pracownik nic nie wpisuje sam), rola gościa, opóźnienie projektu w %, widoczność projektów pracownika, blokada logowania, czytelna historia zmian, instrukcja dla IT; niezależny przegląd i poprawki; testy 47/47 |
