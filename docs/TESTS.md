# Testy — instrukcja i wyniki

## Uruchomienie

```bash
npm test                                   # 41 testów, każdy na świeżej bazie w pamięci (jeden — w pliku tymczasowym)
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

### Runda 2 — aplikacja pracownika w chmurze (6.10.2026)
Zastąpiona w wersji 0.4: aplikacja działa wyłącznie na serwerze firmowym, integracja z chmurą i jej testy zostały usunięte.

### Runda 3 — zgłoszenia do weryfikacji, gość, opóźnienie, serwer (7.10.2026)
**45 / 45 zaliczonych.** Nowe: `test/requests.test.js` — pracownik nie może niczego wpisać bezpośrednio (wyjścia, odrabianie, absencje, zadania, czas, przekazania, tablica → 403), składa zgłoszenia (walidacja, duplikat `client_id`), wycofuje tylko własne nierozpatrzone; decyzja tylko kierownika (przełożony i pracownik → 403), odrzucenie wymaga wyjaśnienia, jedna decyzja; przyjęcie spóźnienia tworzy wyjście 40 min, przyjęcie odrobienia — odrabianie przypisane do wyjścia (saldo 0), odrobienie bez wyjścia → 409 i zgłoszenie zostaje „nowe”; historia: zgłoszenie i decyzja z różnymi autorami. Gość: tylko przypisane projekty w realizacji, bez osób i czasów, 13 tras → 403. Pracownik widzi tylko swoje projekty (+ tablica maszyn), cudzy → 403, ustawienie „wszystkie”. Opóźnienie: plan 50% / wykonano 20% → 30%, poziomy, po terminie, brak danych. Blokada logowania po 5 błędach (429, inne konto działa, wpis w historii). Opis zmian: pole, było → jest, kto, powód.
Niezależny przegląd (osobny agent, bez udziału w budowie) znalazł m.in. krytyczny błąd: migracja 003 nie przechodziła na używanej bazie (sesje → FOREIGN KEY constraint failed). Poprawione (migracje z wyłączonymi kluczami obcymi + `PRAGMA foreign_key_check`), dodano test aktualizacji bazy z kontami, sesjami i historią — na starym kodzie test nie przechodzi, na nowym przechodzi. Także: odrobienie uwzględnia odrabiania oczekujące, blokada na parę konto + adres (brak blokowania kierownika przez osobę z zewnątrz), nagłówki proxy tylko od zaufanego proxy (ostatni wpis X-Forwarded-For), opis zmian ustawień, odrzucenie nietypowych rodzajów zgłoszeń i dat > 180 dni naprzód. Razem w rundzie 3: 47 / 47.
Zrzuty: `docs/screenshots/50…66` (kierownik, pracownik na komputerze i telefonie, gość, blokada logowania), skrypt `scripts/screenshots-v3.py` — bez błędów konsoli; sprawdza też, że pracownica nie otworzy nieprzypisanego projektu.

### Runda 4 — wersja wyłącznie na serwer firmowy (7.10.2026)
**36 / 36 zaliczonych** (usunięto 11 testów integracji z chmurą i aplikacji w chmurze). Nowe sprawdzenia: brak tras `/api/cloud/*` (404), migracja 004 usuwa tabele chmury z istniejącej bazy, blokada logowania nie daje się obejść zmiennym portem dopisywanym przez IIS do `X-Forwarded-For`. Paczka `npm run package` rozpakowana w pustym katalogu — testy 36/36, brak odwołań do usług zewnętrznych w kodzie (`server/`, `public/` bez adresów http/https poza przestrzenią nazw SVG).

### Runda 6 — analiza i raporty kierownika (7.10.2026)
**41 / 41 zaliczonych.** Nowe: `test/analytics.test.js` — przebieg projektu (dni, narastające godziny, postęp wg zakończeń, czas trwania, termin), podobne projekty (punktacja, kolejność, odrzucenie z powodem → poza listą i średnią, przywrócenie, wpis w historii), miesiąc wobec roku wcześniej (wskaźniki, różnice, zakończone projekty), rok wobec lat (sumy, miesiące, przyszłe miesiące = brak danych), dostęp przez HTTP (analiza: przełożony i pracownik 403; raport zapisany: przełożony widzi tylko udostępniony, nie może zmieniać; migawka nie zmienia się po zmianie danych). Zrzuty `67…74` (miesiąc, rok, przebieg projektu z odrzuceniem propozycji, zapisane raporty, raport, wydruk, widok przełożonego, telefon) — bez błędów konsoli; skrypt sprawdza też, że przełożony dostaje 403 na danych analizy.

### Runda 7 — plan pracy (7.10.2026)
**44 / 44 zaliczonych.** Nowe: `test/orders.test.js` — polecenia z zadaniem i maszyną z projektu, kolejność, ostrzeżenia (brak zmiany, obciążenie 113%), ocena wymaga opisu / powodu, przeniesienie niedokończonych bez duplikatów; dostęp: programista widzi tylko swoje, potwierdza tylko swoje, nie tworzy i nie ocenia (403), przełożony tylko podgląd, gość 403; zmiana treści kasuje potwierdzenie.

### Runda 8 — tryby pracy, zamiany, dni dodatkowe i nadgodziny (7.10.2026)
**49 / 49 zaliczonych.** Nowe: `test/shifts.test.js` — dzień dodatkowy (sobota noc, niedziela z potwierdzeniem, wymagany powód), zmiana trybu na okres 8 → 12 h, odpoczynek 11 h, zamiana osób, nadgodziny liczone z godzin na dobę (także dla trybu „standardowa” i dnia dzielonego), szablon nie nadpisuje godzin przy edycji samego powodu, zmiana trybu na okres pomija dni dodatkowe, ostrzeżenie o nocnej zmianie przechodzącej w niedzielę, praca w nadgodzinach w projekcie i miesiącu (proporcjonalnie, udział w pracy projektu), brak podwójnego liczenia wpisów ewidencji. Niezależny przegląd znalazł 12 uwag (m.in. nadgodziny zależne od etykiety trybu, zmiana trybu na okres przerabiająca dni dodatkowe, szablon przywracający godziny, podwójne liczenie z ewidencją, niewłaściwy procent w tabeli projektów) — poprawione i pokryte testami. Zrzuty `75…83` (plan pracy, kalendarz z oznaczeniami, edycja zmiany, zamiana, zmiana trybu, analiza nadgodzin, projekt, telefon) — bez błędów konsoli.

### Runda 9 — analiza tylko dla kierownika (9.10.2026)
**50 / 50 zaliczonych.** Nowe: `test/analytics-privacy.test.js` — programista, gość i przełożony dostają 403 na każdej trasie analizy (przebieg projektu, miesiąc, rok, CSV, odrzucanie propozycji, zapis i usuwanie raportów); programista i gość nie widzą zapisanych raportów; przełożony widzi wyłącznie raport udostępniony (prywatny → 404); dane o nadgodzinach w projekcie widzi tylko kierownik, nawet gdy programiści mają włączony podgląd godzin projektu.


### Runda 10 — powroty do projektu (9.10.2026)
**52 / 52 zaliczonych.** Nowe: `test/returns.test.js` — powrót tylko po zakończeniu (nie dla anulowanych), daty (nie przed ostatnią pracą, nie w przyszłości), runda z zadaniem poprawek, ponownie otwarte zadanie pierwotne w rundzie, czas przed poprawkami / doszło (z %) / same poprawki / razem, zakończenie wymaga zakończonych zadań i opisu, druga runda, blokada wpisów czasu poza rundą i zadań rundy poza jej okresem, blokada ręcznej zmiany statusu w trakcie rundy, wskaźnik miesiąca, projekt nadal zakończony w miesiącu pierwszego zakończenia, wskaźniki projektu dla pierwotnej realizacji; dostęp: programista, przełożony i gość nie otwierają rund i nie widzą ich powodów. Niezależny przegląd: 11 uwag (m.in. czas po zamknięciu rundy liczony do rundy, przesuwanie zakończenia projektu do innego miesiąca, zawyżanie porównań z podobnymi projektami, brak opisu przy zamknięciu, widoczność dla przełożonego) — poprawione i pokryte testami. Zrzuty `84…87`.

### Runda 11 — kalendarz urlopów (9.10.2026)
**53 / 53 zaliczonych.** Nowy test w `test/absences.test.js`: zestawienie — zaległy na początek roku + wymiar − wykorzystano, stan poprzedniego roku niezależny od późniejszych wpisów, urlop na żądanie, inne nieobecności (dni i godziny osobno), urlop na przełomie roku odrzucany (dwa wpisy), przełożony widzi kategorię poufną pod ogólną etykietą, programista 403. Niezależny przegląd: 8 uwag (m.in. niespójne „wykorzystano/zostało”, godziny liczone jako dni, ukryte wpisy w pracującą sobotę, walidacja miesiąca) — poprawione. Zrzuty `88…90`.

### Runda 12 — zestawienia do druku (9.10.2026)
**54 / 54 zaliczonych.** Nowy test w `test/analytics-privacy.test.js`: zestawienie z projektem (migawka: dni po terminie), notatką i przyczyną; migawka niezmienna po zmianie danych, odświeżana na żądanie; walidacja (pusty, zła przyczyna, duplikat, nieistniejący projekt, zły temat); udostępnione zestawienie nie przyjmie nieudostępnionego raportu; przełożony widzi tylko udostępnione (prywatne → 404, zapis → 403); programista 403. Niezależny przegląd: 8 uwag (m.in. ujawnienie nieudostępnionego raportu przez zestawienie, za długi link e-mail, numery znikające w druku, ponowne dodanie tematu ze starymi danymi) — poprawione. Zrzuty `95…98`.

### Runda 13 — nowa organizacja (9.10.2026)
**54 / 54 zaliczonych.** Zmienione testy dostępu: programista dostaje 403 na projekty, pracowników, tablicę maszyn, przekazania, Centrum programowania, wyjścia, nieobecności; 200 na grafik, zdarzenia (ogólne etykiety), kalendarz maszyn, własne polecenia, zgłoszenia i własne saldo. Skrypt zrzutów sprawdza, że programistka nie otworzy innych widoków (przekierowanie do planu pracy) i nie ma ich w menu. Zrzuty: Centrum programowania z projektami pod maszynami (`56`), kalendarz z maszynami (`76`, `77`, `99`), lista zdarzeń w Pracownikach (`100`).

### Runda 14 — oba tematy w każdym dniu kalendarza (9.10.2026)
**55 / 55 zaliczonych.** Nowy `test/machine-calendar.test.js`: każdego dnia obie maszyny; praca ze zmianą z wpisów, dzień bez wpisów = w toku, dziś i dalej = projekt z karty maszyny, brak przed pierwszą pracą i po zakończeniu projektu.

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
