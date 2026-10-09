# Reguły obliczeń i źródła prawne

## Status weryfikacji przepisów — przeczytaj najpierw

Zgodnie z wymaganiem „przed kodowaniem ustawowych limitów sprawdź aktualne przepisy w oficjalnych źródłach” wyszukano źródła urzędowe (PIP, gov.pl / Zielona Linia, ZUS — lista niżej), **ale w tej sesji nie udało się pobrać i porównać ich treści** (pobranie stron wymagało zgody, która nie została udzielona). Dlatego:

- **każda reguła ustawowa w katalogu ma status „do potwierdzenia przez kadry”**, a w opisie podstawy prawnej dopisano tę informację;
- aplikacja **twardo egzekwuje** tylko reguły podane wprost w specyfikacji (siła wyższa i art. 188: 2 dni albo 16 h, jedna pula, bez przenoszenia; mieszanie jednostek zablokowane);
- pozostałe limity (np. 4 dni urlopu na żądanie, 5 dni urlopu opiekuńczego) dają **ostrzeżenie**, nie blokadę;
- wymiary zależne od stażu, rodzaju urlopu rodzicielskiego itp. wprowadza administrator z danych kadr; aplikacja ich nie wylicza.

Po weryfikacji przez kadry: Urlopy i absencje → Katalog kategorii → Edytuj → status „zweryfikowano” + data weryfikacji.

### Źródła zidentyfikowane do weryfikacji
- PIP — Zwolnienie od pracy (PDF): https://www.pip.gov.pl/files/126/Dla-pracownikow/1044/Zwolnienie-od-pracy.pdf
- PIP — siła wyższa w równoważnym systemie czasu pracy: https://www.pip.gov.pl/dla-pracodawcow/pytania-i-odpowiedzi/ile-godzin-zwolnienia-z-powodu-sily-wyzszej-przysluguje-pracownikowi-zatrudnionemu-w-rownowaznym-systemie-czasu-pracy
- OIP Olsztyn — zwolnienia z powodu siły wyższej: https://olsztyn.pip.gov.pl/aktualnosci/zwolnienia-od-pracy-z-powodu-sily-wyzszej
- Zielona Linia (gov.pl) — siła wyższa: https://zielonalinia.gov.pl/en/-/nowosc-w-kodeksie-pracy-zwolnienie-od-pracy-z-powodu-sily-wyzszej
- Zielona Linia — dodatkowy urlop na opiekę nad dzieckiem (art. 188): https://zielonalinia.gov.pl/dodatkowy-urlop-na-opieke-nad-dzieckiem/
- ZUS — siła wyższa, uzupełnienie wynagrodzenia: https://www.zus.pl/en/-/%E2%80%9Esi%C5%82a-wy%C5%BCsza-zasady-uzupe%C5%82nienia-wynagrodzenia-pracownika
- gov.pl — praca w niepełnym wymiarze: https://www.gov.pl/web/rodzina/praca-w-niepelnym-wymiarze
- Tekst jednolity Kodeksu pracy: ISAP, https://isap.sejm.gov.pl (Dz.U. — sprawdzić najnowszy tekst jednolity)

## Reguły zaimplementowane

### Grafik i czas
- Zmiana: koniec ≤ początek → koniec następnego dnia. `planned_min` = rzeczywisty upływ czasu (UTC) − przerwa niewliczana. Zmiana 22:00–06:00 w noc zmiany czasu: 540 min (jesień) / 420 min (wiosna).
- Zmiana należy do **dnia i miesiąca rozpoczęcia** (reguła firmy, `night_shift_month_rule`).
- Święta ustawowe generowane (algorytm Wielkanocy + daty stałe; Wigilia od 2025) — lista do potwierdzenia przez kadry. Zaplanowanie pracy w święto wymaga świadomego potwierdzenia.
- Nie przyjmuje się 8 h dziennie: normy z `employment_terms` z datą obowiązywania.

### Rozdział kategorii czasu
Czas zaplanowany (grafik) · obecność (ewidencja ręczna) · czas na zadaniach (wpisy czasu) · absencje (minuty wg grafiku) · odrabianie (osobna tabela) · nadgodziny (ewidencja ręczna). Żadna kategoria nie jest automatycznie przeliczana na inną. Dług do odrobienia **nie** jest liczony jako „norma miesiąca − obecność” — powstaje wyłącznie z zarejestrowanych wyjść prywatnych.

### Nieobecności
- Minuty = suma `planned_min` zmian w zakresie dat (dzienne) albo część wspólna z grafikiem (godzinowe). Migawka zapisywana przy wpisie.
- Statusy planowana / wykorzystana / anulowana; anulowanie i zmiana wykorzystanego wpisu wymagają powodu; wykorzystanego nie da się cofnąć do planu.
- Kolizje: nieobecności nie mogą nakładać się na inne nieobecności, wyjścia ani odrabianie.
- Żadna kategoria nieobecności nie tworzy długu do odrobienia (blokada w katalogu).
- Brak obliczeń wynagrodzeń i zasiłków.

### Urlop wypoczynkowy (KP art. 152–154², 161, 167², 168 — do potwierdzenia)
- Osobne pule wg roku nabycia; wymiar/saldo początkowe/korekty wprowadza administrator z danych kadr.
- Wykorzystanie w minutach wg grafiku; prezentacja w dniach z jawnym przelicznikiem `leave_day_min` z warunków zatrudnienia.
- Domyślnie najstarsza pula z dostępnym saldem; można wskazać inną. Brak salda → odmowa (podziel wpis).
- Urlop na żądanie pomniejsza pulę wypoczynkową; > 4 dni w roku → ostrzeżenie.
- Zaległy urlop: przypomnienie do 30.09 roku następnego; po terminie **ostrzeżenie** — saldo i uprawnienie bez zmian, brak automatycznego „przedawnienia”.
- Korekta: rodzaj (korekta ewidencji / zmiana uprawnienia), zmiana w minutach (± h/min w formularzu), obowiązkowy powód, opcjonalny dokument, saldo przed i po (podgląd w formularzu i w księdze).

### Siła wyższa (art. 148¹) i opieka nad dzieckiem (art. 188)
- Wybór na pracownika i rok: nieustalony / dni / godziny. Ustala go **pierwsze faktyczne wykorzystanie** (zgodnie z wnioskiem pracownika — pole jednostki w formularzu).
- Wpisy planowane i anulowane nie ustalają wyboru. Po ustaleniu wpisy w innej jednostce są odrzucane.
- Standard (pełny etat, norma 480 min): limit 2 dni **albo** 960 min — jedna pula (dni liczone jako dni grafikowe).
- Niepełny etat / inna norma: propozycja proporcjonalna 960 × etat, oznaczona „wymaga potwierdzenia przez kadry”, ostrzeżenie przy wpisie; administrator może zapisać limit potwierdzony przez kadry (z podstawą).
- Nowy rok = nowy wybór i nowy limit; wpis nie może obejmować dwóch lat.
- Korekta pomyłki: wymaga powodu; odrzucana, jeśli istnieją wpisy w innej jednostce (zwracana lista).
- Pule siły wyższej i art. 188 są niezależne.

### Wyjścia prywatne i odrabianie (KP art. 151² + zasada firmy — do potwierdzenia)
- Minuty wyjścia = część wspólna z jedną zmianą z grafiku (wyjście poza grafikiem lub przez kilka zmian → odmowa).
- Brak pisemnego wniosku → ostrzeżenie: wpis administratora nie zastępuje wniosku.
- Odrabianie: poza grafikiem, bez kolizji z absencjami/wyjściami/innym odrabianiem, **11 h odpoczynku dobowego** między blokami pracy (grafik + odrabianie + nadgodziny), dzień wolny/święto tylko z uzasadnieniem, w miesiącu wyjścia, nie wcześniej niż wyjście.
- Przypisanie minut do jednego lub wielu wyjść; suma ≤ czas odrabiania; dla każdego wyjścia suma przypisań (także oczekujących) ≤ minuty wyjścia → brak podwójnego rozliczenia.
- Nadwyżka odrabiania nie jest przypisywana i **nie tworzy kredytu**. Nadgodziny nie są zamieniane w odrobienie.
- Saldo liczy tylko zatwierdzone odrabiania.
- Odpoczynek tygodniowy (art. 133) **nie** jest sprawdzany automatycznie — patrz ograniczenia.

### Alerty (miesiąc M, dodatnie saldo pracownika)
| Rodzaj | Data wyzwolenia |
|---|---|
| `dwa_dni_kalendarzowe` | ostatni dzień M − 2 |
| `dwa_dni_robocze` | data przedostatniej zmiany pracownika w M, **jeżeli wypada wcześniej** niż powyższa |
| `ostatni_dzien` | ostatni dzień M |
| `zamkniecie` | przy zamknięciu M (osobny alert na wersję) |

Przeliczane przy starcie aplikacji i po każdej zmianie wyjścia/odrabiania; deduplikacja kluczem; po wyzerowaniu salda rozwiązywane, po późnym wpisie przywracane. Powiadomienia tylko w aplikacji — brak wysyłki przy wyłączonej aplikacji.

### Zamknięcie miesiąca
Wymaga rozstrzygnięcia oczekujących odrabiań. Tworzy wersję zestawienia (JSON + CSV), nadaje wyjściom z saldem status „nierozliczone — do przekazania kadrom”, nie zmienia minut, nie przenosi salda, nie liczy potrąceń. Zamknięty miesiąc blokuje zapisy. Korekta: ponowne otwarcie z powodem → zmiany → ponowne zamknięcie (nowa wersja; poprzednia zachowana).

### Projekty i postęp
Dwa paski: przygotowanie programu i wykonanie detalu = Σ wag zakończonych zadań etapu / Σ wag zadań etapu (bez anulowanych). Brak zadań w etapie = brak danych. Zakończenie zadania wymaga potwierdzenia rezultatu. Pierwotny plan niezmienny, zmiany planu z powodem w historii.

### Centrum programowania i kalendarz maszyn
- Centrum programowania: obie maszyny (karta jak dotąd), pod każdą — aktualnie obrabiany projekt z kartą jak w „Projekty i zadania” (postęp, godziny, wynik, opóźnienie) i informacją, **kiedy i na której zmianie projekt się zaczął**: pierwszy wpis czasu pracy — dzień, osoba i jej zmiana z grafiku (gdy brak wpisów — data rozpoczęcia z projektu, oznaczona). Pod spodem pozostałe informacje.
- Kalendarz: na górze każdego dnia maszyny i projekty wykonywane tego dnia z oznaczeniem zmian (I / II / III — zmiana osoby, która wpisała czas na projekt; „poza grafikiem”, gdy nie miała zmiany). Źródło: wpisy czasu pracy. Widok: maszyny i ludzie / tylko maszyny / tylko ludzie.

### Zestawienia do druku (Analiza i raporty → Zestawienia do druku)
- Kierownik łączy kilka tematów: projekty (status, opóźnienie w %, termin, godziny wobec planu, poprawki, powroty), zapisane raporty (kluczowe liczby i komentarz) i własne tematy — do każdego przyczyna (lista przyczyn jak przy czasie pracy) i notatka, np. dlaczego było opóźnienie. Kolejność tematów dowolna.
- Dane tematu to migawka z chwili zapisu zestawienia; zmieniają się tylko po zaznaczeniu „odśwież”. Każdy zapis i usunięcie — w historii.
- Druk / PDF z przeglądarki; „Wyślij e-mailem” otwiera wiadomość z tekstem (długie skracane — pełna wersja jako PDF dołączany ręcznie); „Kopiuj tekst”.
- Przełożony widzi tylko zestawienia udostępnione; udostępnione zestawienie nie może zawierać raportu, którego przełożonemu nie udostępniono.

### Kalendarz wyjść i odrabiania (Wyjścia i odrabianie)
- Nad saldami: miesiąc w kafelkach — WP (wyjście prywatne) i OD (odrabianie) z inicjałami, zmianą (I / II / III lub godziny zmiany; „poza grafikiem”) i godzinami. Wyjście z nocnej zmiany — w dniu jej rozpoczęcia. Odrabianie oczekujące — przerywane obramowanie; wyjście odrobione — wyblakłe; anulowane i odrzucone niewidoczne.

### Kalendarz urlopów (Urlopy i absencje → Kalendarz urlopów)
- Miesiąc w kafelkach: skrót nieobecności i inicjały osoby; przerywane obramowanie = planowana; weekendy i święta kreskowane (pokazują tylko wpisy jednodniowe z tego dnia, bez środka wielodniowego L4). Kategorie poufne — ogólna etykieta dla osób bez uprawnienia.
- Zestawienie urlopów na wybrany rok — w zakładce **Pracownicy**, pod profilem każdej osoby (tylko kierownik i przełożony): **urlop wypoczynkowy** — zostało = zaległy na początek roku + wymiar roku − wykorzystano w roku (minuty wg grafiku, dni = minuty ÷ przelicznik dnia urlopu); zaplanowane pokazywane osobno, nie są odejmowane. **Urlop na żądanie** — wykorzystano z limitu (4), „zostało” nie więcej niż saldo UW. **Siła wyższa, art. 188** — wykorzystanie i limit w wybranej jednostce. **Inne nieobecności** — dni (wpisy dzienne) i godziny (wpisy godzinowe) w roku.
- Wpisy liczone w roku dnia rozpoczęcia; urlop wypoczynkowy na przełomie roku wpisuje się jako dwa wpisy.

### Powroty do projektu (rundy poprawek) — tylko kierownik
- Po zakończeniu projektu (wszystkie zadania zakończone albo status „zakończony”) kierownik może otworzyć **powrót do projektu** — rundę poprawek z powodem i przyczyną (np. zmiana zakresu, błąd programowania); opcjonalnie od razu zadanie poprawek. Jedna otwarta runda naraz; projekty anulowane i wstrzymane — nie. Dzień powrotu nie wcześniej niż ostatni dzień pracy i nie w przyszłości.
- **Przypisanie czasu**: zadanie założone w czasie rundy należy do tej rundy (czas tylko z dni rundy); praca na zadaniach pierwotnych w okresie rundy (od dnia powrotu do zakończenia) też należy do rundy. Po zakończeniu rundy czasu nie dopisuje się do projektu poza rundą (trzeba otworzyć kolejny powrót).
- **Czas przed poprawkami** = praca przed pierwszym powrotem (z poprawkami zrobionymi w trakcie realizacji). **Doszło** = praca w rundach (osobno dla każdej, z % wobec czasu przed poprawkami). **Same poprawki** = poprawki w trakcie realizacji + cała praca w rundach. **Razem** = przed + doszło.
- Zakończenie rundy wymaga zakończenia wszystkich zadań projektu i opisu „co poprawiono”; data nie wcześniejsza niż ostatnia praca w rundzie i nie w przyszłości. Projekt wraca do statusu „zakończony”; ręczna zmiana statusu w trakcie rundy jest zablokowana.
- Czas trwania, termin, godziny wobec planu i porównanie z podobnymi projektami liczone są dla **pierwotnej realizacji**; rundy pokazywane osobno (kolumna „Po powrotach”). Projekt z rundami liczy się jako zakończony w miesiącu pierwszego zakończenia. W zestawieniu miesięcznym wskaźnik „Powroty do projektów” = praca w rundach w danym miesiącu (zawiera się też w „Poprawkach” w części wpisanej jako poprawki — nie sumować).

### Tryby pracy, zamiany i nadgodziny (do potwierdzenia przez kadry)
- Każda zmiana w grafiku ma tryb: **standardowa**, **wydłużona** (np. 12 h przy brakach kadrowych), **nieregularna**, **dzień dodatkowy / nadgodziny** (np. sobota lub niedziela na nocnej zmianie). Tryb inny niż standardowy wymaga powodu; każda zmiana godzin, trybu, osoby, zamiana i usunięcie trafia do historii z autorem i powodem.
- **Nadgodziny liczone na dobę pracownika** (dzień rozpoczęcia zmiany): dzień dodatkowy — cała zmiana; pozostałe zmiany tego dnia — wszystko ponad dobową normę z warunków zatrudnienia (`employment_terms.daily_norm_min`), niezależnie od nazwy trybu. Dzień dzielony (dwie zmiany jednego dnia) liczony łącznie.
- **Odpoczynek dobowy 11 h** sprawdzany między zmianami z różnych dni; skrócenie tylko ze świadomym potwierdzeniem (wyjątki art. 132 § 2 KP — do potwierdzenia przez kadry). Niedziela / święto w dniu rozpoczęcia wymaga potwierdzenia; zmiana nocna przechodząca w niedzielę lub święto daje ostrzeżenie (godziny w dniu wolnym do rozliczenia).
- **Limit roczny** nadgodzin z ustawienia `overtime_year_limit_min` (domyślnie 150 h) — tylko ostrzeżenie przy zapisie; obowiązujący limit i rozliczenie (dodatki, dni wolne za nadgodziny) — do potwierdzenia przez kadry.
- **Zamiana osób** między dwiema zmianami (± 7 dni): sprawdzane nakładanie i odpoczynek obu osób, nadgodziny przeliczane dla obu; wyjście prywatne zarejestrowane na zmianie blokuje zamianę.
- **Zmiana trybu na okres** (do 93 dni, wybrane osoby i dni tygodnia) zmienia istniejące zmiany; dni dodatkowe i zmiany, których nie da się zmienić, są pomijane i wypisane.
- **Praca na projektach w nadgodzinach** = Σ wpisów czasu (aktywna + weryfikacja + poprawki) × (nadgodziny doby ÷ planowany czas zmian tej doby); część z dni dodatkowych analogicznie. Wpis czasu z nocnej zmiany należy do dnia jej rozpoczęcia. Pokazywane: w projekcie (godziny i % pracy projektu), w miesiącu (dni dodatkowe, zmiany wydłużone, nadgodziny z grafiku, praca w nadgodzinach i jej udział, podział na projekty) i w porównaniu rok do roku. Ręczne wpisy nadgodzin w ewidencji pokrywające się ze zmianą z nadgodzinami nie są liczone drugi raz.

### Plan pracy (polecenia na zmianę)
- Kierownik wypisuje każdemu programiście polecenia na dany dzień (kolejność, zadanie i projekt lub dowolna treść, planowany czas). Ostrzeżenia: brak zmiany w grafiku, nieobecność, obciążenie ponad długość zmiany.
- Programista widzi tylko swoje polecenia i może jedynie potwierdzić przeczytanie; zmiana treści przez kierownika wymaga ponownego potwierdzenia.
- Ocena wykonania (wykonane / częściowo / niewykonane / anulowane) — tylko kierownik; „częściowo” i „niewykonane” wymagają opisu, anulowanie — powodu. Niedokończone polecenia można przenieść na kolejny dzień (bez duplikatów, z odnośnikiem do oryginału).

### Godziny projektu
- **Przepracowano** = Σ czasu ludzi na zadaniach projektu: aktywna praca + weryfikacja/uruchomienie + poprawki (bez blokad/oczekiwania i czasu nieprzypisanego).
- **Plan** = Σ obowiązujących planów zadań (bez anulowanych); zadania bez planu są liczone osobno („bez planu: N zad.”).
- **Wynik** (wyróżniony): na zakończonych zadaniach — rzeczywiste − plan (h i %); czerwony = ponad plan, zielony = szybciej niż plan. Gdy nie ma zakończonych zadań: przekroczenie całego planu albo ile zostało z planu.
- **Prognoza całości** = zakończone (rzeczywiście) + otwarte (większa z wartości: plan albo już przepracowane).
- Widoczne dla kierownika i przełożonego; pracownik — gdy `employee_sees_project_hours = tak`; gość — nigdy.

### Analiza kierownika (tylko administrator)
- **Przebieg projektu**: dzienne i narastające godziny pracy (aktywna + weryfikacja + poprawki) wobec planu rozłożonego liniowo od daty rozpoczęcia do terminu; postęp schodkowo wg dat zakończenia zadań (wagi) wobec planu na dzień; każde zadanie: wykonanie wobec planu. Czas trwania = od daty rozpoczęcia do ostatniego zakończenia zadania; „wobec terminu” = dni po (+) lub przed (−) terminem.
- **Podobne projekty**: tylko zakończone; punkty — ta sama rodzina detali 3, ta sama maszyna 2, wspólne typy zadań do 3 (podobieństwo zbiorów), skala planu 0,5–2× 1; próg ≥ 2, najwyżej 6 propozycji. Kierownik może **odrzucić** propozycję (z powodem) — nie jest pokazywana ani wliczana do średniej; może ją przywrócić. Obie czynności są w historii.
- **Miesiąc** wobec tego samego miesiąca rok wcześniej: przepracowane godziny, poprawki, blokady, zakończone zadania i projekty (projekt zakończony = ostatnie zakończenie zadania w miesiącu), odchylenie od planu zakończonych zadań (z sum), nieobecności (minuty wg grafiku, wpisy na przełomie miesięcy proporcjonalnie do dni), wyjścia prywatne, nadgodziny; podział na maszyny i osoby. „Lepiej/gorzej”: mniej poprawek, blokad, nieobecności, wyjść, nadgodzin i mniejsze odchylenie = lepiej; więcej zakończonych zadań i projektów = lepiej; godziny pracy — bez oceny.
- **Rok** wobec wybranych lat: te same wskaźniki miesiąc po miesiącu (miesiące przyszłe = brak danych, nie zero) i sumy roczne.
- **Zapisany raport** = migawka danych z chwili zapisu (późniejsze zmiany jej nie zmieniają) + komentarz kierownika; druk / PDF z przeglądarki, CSV. Przełożony widzi wyłącznie raporty, które kierownik mu udostępnił.

### Opóźnienie projektu (w %)
- **Plan na dziś** = upływ czasu od daty rozpoczęcia do terminu projektu (liniowo, 0–100%).
- **Wykonano** = Σ wag zakończonych zadań / Σ wag wszystkich zadań (bez anulowanych), oba etapy razem.
- **Opóźnienie** = plan na dziś − wykonano (punkty procentowe), gdy dodatnie; w przeciwnym razie „przed planem o X%”.
- Poziomy: *zgodnie z planem* (opóźnienie ≤ 5), *opóźniony* (> 5), *zagrożony* (> 15 albo po terminie, gdy nie wykonano 100%) — progi w ustawieniach `project_delay_warn_pct`, `project_delay_alert_pct`.
- Dodatkowo: liczba dni po terminie i liczba zadań po swoich terminach.
- Brak daty rozpoczęcia, terminu albo zadań = „brak danych” (nie zero). Założenie liniowego planu jest uproszczeniem — przy nierównych etapach lepszą miarą są terminy zadań (pokazywane osobno).

### Zgłoszenia pracowników do weryfikacji
- Pracownik **nie wpisuje** spóźnień, wyjść, odrabiania ani postępu prac. Składa zgłoszenie: spóźnienie (godzina przyjścia), nieobecność (dni), wyjście (od–do), odrobienie (dzień, od–do), inna sprawa (opis). Zgłoszenie najwyżej 31 dni wstecz, najwyżej 60 dni.
- Decyzję podejmuje wyłącznie kierownik (administrator): przyjęcie z wyborem sposobu rozliczenia (wyjście prywatne, kategoria nieobecności, odrabianie, bez wpisu) albo odrzucenie z wyjaśnieniem. Jedna decyzja na zgłoszenie; wpis powstaje w tej samej transakcji co decyzja i przechodzi wszystkie walidacje (kolizje, odpoczynek, zamknięty miesiąc) — jeśli walidacja się nie powiedzie, zgłoszenie pozostaje nierozpatrzone.
- Spóźnienie przyjęte „do odrobienia” = wyjście od początku zmiany do godziny przyjścia. Odrobienie przyjęte = odrabianie zatwierdzone, przypisane kolejno do najstarszych nierozliczonych wyjść z tego samego miesiąca (sprzed odrabiania); nadwyżka nie tworzy kredytu.
- Pracownik może wycofać zgłoszenie, dopóki nie zostało rozpatrzone. Każdy krok (zgłoszenie, wycofanie, decyzja) jest w historii z autorem.

### Raporty efektywności
Odchylenie = rzeczywisty czas aktywny − plan obowiązujący (oraz %). Oznaczenie „odchylenie wymagające wyjaśnienia”, gdy > 60 min **i** > 20% (ustawienia). Brak planu lub wpisów czasu = „brak danych”, nie zero; raport pokazuje liczebność próbki i kompletność. Trendy: mediana odchylenia w grupach typ × rodzina × trudność, z uwagą przy próbce < 3. Absencje nie wpływają na wskaźnik; czas maszyny nie jest czasem programisty; brak ocen typu „celowo opóźnia”.
