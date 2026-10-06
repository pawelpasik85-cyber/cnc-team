# Architektura i etapy

## Architektura

```
Przeglądarka (SPA: public/*.js, bez frameworka)
   │  fetch /api/* (JSON), cookie sesji HttpOnly + SameSite=Strict, nagłówek X-CNC-Request, Idempotency-Key
   ▼
Serwer Node.js (server/app.js — node:http)
   ├─ routes.js       trasy API, sprawdzanie roli, filtrowanie odpowiedzi wg roli (redakcja pól poufnych)
   ├─ domain/*.js     reguły: grafik, absencje i pule, wyjścia/odrabianie/zamknięcie miesiąca, projekty, raporty, integracja
   ├─ core.js         błędy, macierz uprawnień, audyt, hasła (scrypt), sesje
   ├─ time.js         Europe/Warsaw, zmiana czasu, daty kalendarzowe
   └─ db.js           SQLite (node:sqlite), migracje, transakcje
   ▼
data/cnc-team.db (plik SQLite, tryb WAL)
```

Wybór stosu: aplikacja lokalna dla kilku osób → jeden proces Node.js i jeden plik bazy. Zero zależności npm (mniej licencji, brak łańcucha dostaw, łatwa instalacja na stanowisku kierownika). Interfejs bez frameworka — kilka plików JS ładowanych bezpośrednio, bez budowania.

Zasada: **uprawnienia egzekwuje serwer**. Każda trasa zapisu wymaga roli administratora; trasy odczytu sprawdzają uprawnienie (macierz w `docs/PERMISSIONS.md`) i filtrują pola (notatki poufne, dokumenty, nazwy kategorii poufnych, plany czasu). Interfejs ukrywa niedostępne przyciski tylko dla wygody.

## Etapy realizacji (wykonane w tej wersji)

1. Fundament: baza i migracje, role i sesje, audyt, pracownicy i warunki zatrudnienia z datą obowiązywania, szablony zmian, grafik (zmiany przez północ, święta, DST).
2. Absencje: rozszerzalny katalog, pule urlopu wg roku nabycia z księgą korekt, wybór jednostki dla siły wyższej i art. 188.
3. Wyjścia prywatne i odrabianie z przypisaniem minut, alerty, zamknięcie miesiąca z wersjami raportu.
4. Projekty, zadania z wagami, dwa paski postępu, czas ludzi, tablica maszyn, przekazanie zmiany.
5. Raporty kierownicze z definicjami, tabelami, CSV i widokiem do druku; wymiana JSON z CNC Process.
6. Testy, zrzuty ekranów, dokumentacja, pakiet do przeglądu.

## Przyjęte założenia

| Założenie | Uzasadnienie / jak zmienić |
|---|---|
| Zmiana nocna i wszystko, co się na niej dzieje (wyjście), należy do **dnia i miesiąca rozpoczęcia** zmiany. | Ustawienie `night_shift_month_rule` (obecnie tylko ta wartość jest zaimplementowana). |
| Wyjścia prywatne rozliczane w **miesiącu kalendarzowym** — zasada firmy. | Ustawienie `exit_settlement_period`; termin rozliczenia = ostatni dzień miesiąca. |
| Odrabianie: poza grafikiem, nie wcześniej niż wyjście, w tym samym miesiącu, z zachowaniem 11 h odpoczynku dobowego; praca w dniu wolnym tylko z uzasadnieniem. | Ograniczenie zachowawcze; patrz `docs/RULES.md`. |
| Minuty wyjścia/absencji godzinowej = część wspólna z grafikiem (rzeczywisty upływ czasu, z DST). | Przerwy niewliczane (`break_min`) odejmowane tylko przy pełnej zmianie. |
| Godzina niejednoznaczna przy zmianie czasu (jesień 02:00–02:59) = pierwsze wystąpienie; nieistniejąca (wiosna) = przesunięcie o +1 h. | `server/time.js`. |
| Wymiar urlopu, salda początkowe i limity dla niepełnego etatu wprowadza administrator na podstawie danych kadr. | Aplikacja nie liczy stażu ani wymiaru. |
| Pracownik widzi tylko **własne** saldo do odrobienia. | Ustawienie `employee_sees_team_balances` = `tak` pokazuje salda zespołu. |
| Przełożony domyślnie **nie** widzi notatek poufnych; uprawnienie nadaje administrator w koncie. | Ustawienia → Konta i role. |
| Obecność nie jest liczona automatycznie — bez ewidencji ręcznej raport pokazuje „brak danych”. | Brak integracji z RCP. |
| Strefa czasowa serwera nie ma znaczenia — wszystkie obliczenia w Europe/Warsaw. | |

## Bezpieczeństwo (lokalny prototyp)

- Hasła: scrypt z solą; sesja 12 h w tabeli `sessions`; cookie HttpOnly, SameSite=Strict.
- CSRF: każdy zapis wymaga nagłówka `X-CNC-Request: 1` (nie do wysłania z obcej strony bez CORS).
- CSP bez skryptów inline; nagłówki `X-Frame-Options`, `nosniff`.
- Serwer domyślnie nasłuchuje tylko na `127.0.0.1`. Przed udostępnieniem w sieci: HTTPS (reverse proxy), polityka haseł, ewentualnie Entra ID (`INTEGRATIONS.md`).
