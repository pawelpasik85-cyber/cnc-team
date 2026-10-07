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

### Godziny projektu
- **Przepracowano** = Σ czasu ludzi na zadaniach projektu: aktywna praca + weryfikacja/uruchomienie + poprawki (bez blokad/oczekiwania i czasu nieprzypisanego).
- **Plan** = Σ obowiązujących planów zadań (bez anulowanych); zadania bez planu są liczone osobno („bez planu: N zad.”).
- **Wynik** (wyróżniony): na zakończonych zadaniach — rzeczywiste − plan (h i %); czerwony = ponad plan, zielony = szybciej niż plan. Gdy nie ma zakończonych zadań: przekroczenie całego planu albo ile zostało z planu.
- **Prognoza całości** = zakończone (rzeczywiście) + otwarte (większa z wartości: plan albo już przepracowane).
- Widoczne dla kierownika i przełożonego; pracownik — gdy `employee_sees_project_hours = tak`; gość — nigdy.

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
