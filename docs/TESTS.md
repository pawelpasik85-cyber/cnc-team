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

### Runda 15 — przegląd maszyn (9.10.2026)
**56 / 56 zaliczonych.** Nowy test w `test/machine-calendar.test.js`: godziny i projekty zakończone na Hartford / Grimme w miesiącach, przyszłe miesiące = brak danych, ten sam okres rok wcześniej, zestawienie lat. Zrzuty `101`, `102`.

### Runda 16 — prośba o urlop (9.10.2026)
**57 / 57 zaliczonych.** Nowy test w `test/requests.test.js`: programista zaznacza rodzaj urlopu (nieznany rodzaj → 400), prośba nie tworzy urlopu, programista nie wpisze nieobecności ani nie zaakceptuje zgłoszenia (403). Programista widzi tylko własny profil i urlopy. Zrzuty `50`, `103`.

### Runda 17 — powiadomienia (9.10.2026)
**58 / 58 zaliczonych.** Nowy test `/notify`: kierownik — zgłoszenia czekające (z rodzajem urlopu), znikają po decyzji; programista — decyzja z wyjaśnieniem; przełożony — bez listy. Skrypt zrzutów: pasek i licznik w menu, nowe zgłoszenie programisty → komunikat bez odświeżania (`104`, `105`).

### Runda 18 — narzędzia i oprawki (12.10.2026)
**63 / 63 zaliczonych.** Nowy plik `test/tools.test.js` (5 testów): dopasowania z parametrów (trzpień oprawki ↔ głowica, zakres zacisku ↔ chwyt freza lub głowicy, gniazdo głowicy ↔ płytka bez rozróżniania wielkości liter i spacji, brak łączenia narzędzi różnych maszyn), stan poniżej minimum; walidacja według rodzaju (liczby całkowite, promień ≤ D/2, nieznana maszyna, interfejs oprawki zgodny z wrzecionem — BT50 nie do Grimme; bez maszyny przypisanie wg interfejsu); edycja częściowa nie kasuje pól; przyjęcie / wydanie zawsze z powodem, stan nie ujemny; wycofanie i przywrócenie z powodem i osobną akcją w historii; API — programista i przełożony tylko odczyt (403 na zapis), gość 403, wycofane widzi tylko kierownik. Poprawka przy okazji: zakończenie projektu w dniu otwarcia rundy poprawek liczone jest do pierwotnej realizacji (porównanie ze znacznikiem czasu otwarcia rundy); test zwrotów ma teraz ustalone znaczniki czasu. Przegląd niezależny: 9 uwag, wszystkie poprawione. Zrzuty `110`–`117` (w tym zapis edycji i nowej pozycji przez formularz).

### Runda 19 — dane frezu: ostrza i długości (12.10.2026)
**64 / 64 zaliczonych.** Nowy test: liczba ostrzy z, długość ostrza Lc i długość całkowita L obowiązkowe (Lc nieobowiązkowe dla fazownika), Lc ≤ L, długość użyteczna z szyjką l1 między Lc a L; pozycje zapisane wcześniej bez tych danych można wycofać, przywrócić i zmienić ich stan bez uzupełniania (edycja parametrów wymaga uzupełnienia). Rysunek frezu z linią wymiarową Lc / l1 / L i szyjką. Przegląd niezależny: 6 uwag, poprawione. Zrzuty `118`, `119`.

### Runda 20 — frezy przypisywane do oprawek ręcznie (13.10.2026)
**65 / 65 zaliczonych.** Na prośbę kierownika usunięte automatyczne dopasowanie frez ↔ oprawka (po średnicy chwytu); kierownik zaznacza oprawki w edycji frezu (tabela `tool_links`, migracja 013). Test: przypisanie widoczne w obie strony i zapisane w historii; tylko oprawki z wykazu i tylko do frezów; edycja bez listy nie zmienia przypisań; przypisanie do oprawki wycofanej zostaje (wraca po przywróceniu), nowej wycofanej nie można dodać; programista nie widzi numerów wycofanych oprawek. Głowice ↔ oprawki i płytki — nadal z parametrów. Przegląd niezależny: 6 uwag, 5 poprawionych; świadomie bez blokady „frez Hartforda w oprawce Grimme” — przypisanie należy do zespołu. Zrzuty `113`, `120`.

### Runda 21 — gwintowniki i frezy do gwintów (13.10.2026)
**66 / 66 zaliczonych.** Uwaga kierownika: przy gwintowniku nie podaje się liczby ostrzy, potrzebny skok gwintu. Rozdzielone rodzaje: gwintownik (bez z) i frez do gwintów (z obowiązkowe); oba — skok gwintu P obowiązkowy (4 miejsca po przecinku dla gwintów calowych) i oznaczenie gwintu (np. M10x1). Migracja 014 przenosi dawne „gwintowniki” z liczbą ostrzy do frezów do gwintów. Rysunek: zwoje co skok, podpis „M8 P1,25”. Przegląd niezależny: 5 uwag, poprawione. Zrzuty `121`, `122`.

### Runda 22 — widok katalogowy narzędzi (13.10.2026)
**66 / 66 zaliczonych** (zmiana tylko w interfejsie). Wykaz jak katalog: jedno narzędzie w wierszu — rysunek (frez poziomo, z wymiarami Lc / l1 / L), nazwa, średnica, ostrza (przy gwintowniku skok), materiał, na końcu stan; pozostałe parametry po kliknięciu. Stan 0–1 szt czerwony, 2 szt żółty; zwijane podsumowanie „Mało na stanie”. Telefon: wiersz jako karta. Przegląd niezależny (z klikaniem w Playwright, tryb jasny/ciemny, 390 px): 3 uwagi + 2 drobne, poprawione (kolory w trybie ciemnym, nazwa jako przycisk dla klawiatury i czytnika ekranu, powrót fokusu po zamknięciu). Zrzuty `110`–`121`.

### Runda 23 — uwagi po obejrzeniu na telefonie (13.10.2026)
**66 / 66 zaliczonych.** Plan pracy podzielony na Hartford i Grimme, „Inna praca” jako sekcja dodawana tylko w razie potrzeby; zmiana kolejności poleceń w obrębie tej samej maszyny (test zaktualizowany: „inna praca” nie przeskakuje do Grimme). Rodzaje urlopu i nieobecności w jednolitych kolorach (kalendarz, kalendarz urlopów, karty, zgłoszenia, lista). Karta pracownika: tylko saldo do odrobienia, urlopy i nieobecności. Narzędzia: dane wyraźniej niż rysunek, na telefonie wiersz poziomo. Dane demo: zmiana I 06:00–14:00 dla wszystkich (bez etatu 7/8), polecenia w planie. Wersja pokazowa: logowanie własnym kontem (bez wyboru roli). Przegląd niezależny: 7 uwag, 6 poprawionych; 12-godzinna zmiana w danych demo zostaje celowo (zastępstwo za L4). Zrzuty `130`–`138`.

### Runda 24 — okienka w kalendarzu, stały podział planu, prośba o urlop (13.10.2026)
**66 / 66 zaliczonych** (zmiany w interfejsie). Kalendarz: kliknięcie nieobecności / zdarzenia otwiera okienko ze szczegółami (rodzaj w kolorze, termin, status; pracownik widzi tylko etykietę dopuszczoną przez serwer); kierownik i przełożony — kliknięcie tematu na maszynie otwiera okienko projektu (praca w tym dniu, postęp, otwarte zadania, opis). Plan pracy: Hartford i Grimme zawsze (także u programisty), „Inna praca” jako okno otwierane, z szybkim wpisaniem obowiązku. Zgłoś kierownikowi: „Urlop” — rodzaj, termin od – do albo liczba dni roboczych (weekendy i święta pomijane, początek przesuwany na dzień roboczy). Skrypt `scripts/screenshots-r24.py` sprawdza te ścieżki klikaniem. Przegląd niezależny: 6 uwag, poprawione (zamykanie okienka przy przejściu, długość uwagi, klawiatura, zablokowane zadania, urlop od weekendu, drobne). Zrzuty `140`–`146`.

### Runda 25 — menu programisty, prośba o urlop / zwolnienie (13.10.2026)
**66 / 66 zaliczonych.** Menu programisty: Mój profil, Kalendarz, Plan pracy, Zgłoś kierownikowi, Narzędzia i oprawki, Moje konto. „Zgłoś”: zamiast „Nieobecność” — „Urlop / zwolnienie” ze wszystkimi rodzajami jako kolorowe karty (kolory jak w profilu), przy każdym ile zostało; wykorzystane wyszarzone i niedostępne, ponad pozostałą pulę nie da się wysłać; dni albo godziny zgodnie z jednostką rodzaju (SW / art. 188 — jednostka ustalona po pierwszym użyciu), limity na rok z daty początku. Kafelki z grafiką w kolorach kalendarza; spóźnienie — osobny kolor. Przegląd niezależny: 6 uwag, poprawione. Skrypt `scripts/screenshots-r24.py` sprawdza to klikaniem (UŻ ponad limit, wezwanie tylko w godzinach, krew tylko w dniach, limity 2027). Zrzuty `145`, `147`, `148`.

### Runda 26 — zwarty katalog narzędzi, symbole zgłoszeń (13.10.2026)
**66 / 66 zaliczonych** (zmiany w interfejsie). Narzędzia: wiersz z rysunkiem z lewej, nazwą i stanem w prawym górnym rogu, pod spodem jedna linia danych (np. Ø12 · 4 ostrza · VHM · TiN); tak samo oprawki, głowice i płytki. Zgłoszenia: kolorowy symbol rodzaju (jak na kafelkach i w kalendarzu) i pasek koloru w wierszu — u programisty („Moje zgłoszenia”) i u kierownika. Przegląd niezależny: 3 uwagi (ostrzeżenie „poniżej minimum”, odmiana „ostrza”, puste wartości), poprawione. Zrzuty `113`, `116`, `150`, `151`.

### Runda 27 — filtr rodzaju narzędzi, gwintowniki maszynowe / do otworów przelotowych (13.10.2026)
**66 / 66 zaliczonych** (test gwintownika rozszerzony: wykonanie maszynowy / ręczny, otwory przelotowe / nieprzelotowe / uniwersalny, nieznana wartość → 400, frez do gwintów bez rodzaju otworu). Filtr „Rodzaj” w wyszukiwarce narzędzi: frezy (walcowo-czołowy, kulisty, torusowy, fazownik, wiertło, gwintownik, frez do gwintów), oprawki (ER, Weldon, termo, hydrauliczna, trzpieniowa), płytki (kształt) — z liczbą pozycji. Przegląd niezależny: 2 uwagi, poprawione. Zrzuty `152`–`154`.

### Runda 28 — Centrum programowania: karta maszyny z pełną informacją o projekcie (13.10.2026)
**66 / 66 zaliczonych** (test API: `/today` zwraca `active_projects` z priorytetem, terminem i stanem planu, bez zadań i opisów; programista nadal 403). Jedna karta na maszynę: parametry maszyny, aktualny projekt (nazwa, rodzina, opis), status planu i priorytet, pasek „wykonano / pozostało” ze znacznikiem planu na dziś, rozpoczęcie (dzień, zmiana, osoba), czas trwania (kalendarzowy i roboczy), termin z liczbą dni, przewidywany koniec, czas programowania (plan, rzeczywisty, pozostało / ponad plan, prognoza, nadgodziny), czas maszyny z danych technologicznych oraz dane z karty maszyny (etap, program NC, osoba, następne zadanie, kolejny program, blokada, odpowiedzialni). Pod maszynami panel „Terminy, priorytety i opóźnienia” dla wszystkich aktywnych projektów. Przegląd niezależny: 1 uwaga średnia (przepełnienie listy przy 761–1185 px) i 6 drobnych — poprawione. Skrypt `scripts/screenshots-r28.py` (1440 / 1024 / 412 px, przełożony). Zrzuty `160`, `161`, `162`.

### Runda 29 — duża zmiana: menu, analiza zespołu, PDF / PNG, motyw „Industrial” (15.10.2026)
**71 / 71 zaliczonych.** Nowe testy: `test/team-analytics.test.js` (programiści — godziny na maszynach, plan wobec wykonania, poprawki, blokady; detale — zakończone w okresie, średnie wg rodziny i maszyny, terminowość, granice okresu; struktura czasu i przyczyny; walidacja okresu; `/analytics/team` tylko kierownik — przełożony i programista 403) oraz w `test/requests.test.js` — zgłoszenia i plan pracy programisty domyślnie wyłączone (403 na serwerze), włączane ustawieniem. Pliki PDF z 7 widoków sprawdzone `qpdf --check` i `pdfinfo` (A4, wiele stron, powtarzany nagłówek tabeli). Przegląd niezależny: 3 uwagi średnie (osoby, które odeszły, znikały z analizy; ciemny motyw przeciekał do wydruku; zbyt długi obraz PNG zapisywał pusty plik) i 9 drobnych (data 31.02, porównanie czasów maszyny, odmiana „dzień / dni”, „detal / detale”, przecinki dziesiętne, martwy kod, szerokości kolumn, nagłówek raportu miesięcznego, pasek telefonu) — poprawione. Skrypty: `scripts/screenshots-r29.py`, `scripts/export-r29.py`. Zrzuty `170`–`176`.

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
