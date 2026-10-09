# Znane ograniczenia (wersja 0.7)

## Prawo i kadry
- **Przepisy niezweryfikowane w źródłach urzędowych w tej wersji** — wszystkie reguły ustawowe oznaczone „do potwierdzenia przez kadry” (szczegóły: `docs/RULES.md`).
- Limity dla niepełnego etatu i obniżonych norm (siła wyższa, art. 188) są proporcjonalną propozycją do potwierdzenia.
- Nie jest sprawdzany odpoczynek tygodniowy (35 h, art. 133), doba pracownicza ani normy dla szczególnych grup (np. kobiety w ciąży, osoby z niepełnosprawnością — dopuszczalność odpracowania). Sprawdzany jest tylko 11-godzinny odpoczynek dobowy między blokami pracy (wartość w ustawieniach).
- Limity zasiłku opiekuńczego, urlopów rodzicielskich, okolicznościowych itp. nie są egzekwowane (opis w katalogu).
- Aplikacja nie liczy wymiaru urlopu ze stażu, wynagrodzeń, zasiłków ani potrąceń.
- Pole notatki poufnej to tekst wolny — aplikacja ostrzega, ale technicznie nie uniemożliwi wpisania danych medycznych.

## Funkcje
- Powiadomienia tylko wewnątrz aplikacji; brak e-maili/Teams i brak wysyłki przy wyłączonej aplikacji. Alerty są przeliczane przy starcie i po zmianach.
- Obecność i nadgodziny tylko z ręcznej ewidencji; brak integracji z RCP.
- Brak automatycznego odczytu stanu maszyn; tablica maszyn jest wprowadzana ręcznie.
- Integracja z CNC Process tylko przez pliki JSON; odnośnik „Otwórz w CNC Process” działa po ustawieniu `cnc_process_url_template`.
- Wpis wyjścia obejmujący kilka zmian trzeba rozbić na osobne wpisy; urlop przekraczający saldo jednej puli trzeba podzielić.
- Minuty nieobecności to migawka grafiku z chwili zapisu — późniejsza zmiana grafiku nie przelicza istniejących wpisów (celowo, dla spójności historii); korekta = anulowanie z powodem i nowy wpis.
- Przerwa niewliczana jest odejmowana tylko od pełnej zmiany; przy wyjściu w trakcie zmiany liczy się rzeczywisty czas nieobecności.
- Wyszukiwanie/filtrowanie listy zdarzeń po maszynie i projekcie dotyczy przekazań zmian (nieobecności nie są przypisane do maszyn).
- Widok do wydruku/PDF korzysta z funkcji drukowania przeglądarki („Zapisz jako PDF”).
- Zrzuty ekranów wymagają opcjonalnego Pythona + Playwright (`scripts/screenshots.py`) — nie są potrzebne do działania aplikacji.

## Serwer firmowy i dostęp z domu
- Wymaga serwera od IT (`docs/DEPLOY.md`): adres HTTPS w domenie firmy opublikowany z internetu. Bez tego dostęp jest tylko w sieci, w której działa aplikacja.
- Brak logowania kontem Microsoft (SSO) — loginy i hasła są w aplikacji (zakłada je kierownik).
- Powiadomienia o nowym zgłoszeniu i o decyzji działają, gdy aplikacja jest otwarta (pasek, licznik, dźwięk, powiadomienie systemowe). Przy zamkniętej aplikacji brak e-maila i Web Push — do uzgodnienia z IT (SMTP).
- Opóźnienie projektu zakłada liniowy plan między datą rozpoczęcia a terminem; nie uwzględnia kalendarza pracy ani nierównych etapów.
- Bez internetu zgłoszenia nie da się wysłać (telefon nie przechowuje danych) — trzeba spróbować ponownie, gdy jest zasięg.

## Grafik i nadgodziny
- Nadgodziny liczone z grafiku (planu), nie z rzeczywistych godzin wejścia i wyjścia — brak integracji z RCP.
- Nie jest liczony system równoważny ani okres rozliczeniowy (nadgodziny średniotygodniowe); limit roczny jest tylko ostrzeżeniem — oba do potwierdzenia przez kadry.
- Przypisanie pracy do nadgodzin jest proporcjonalne w obrębie doby (wpis czasu nie ma godzin od–do).
- Zamiana osób dotyczy dwóch istniejących zmian; przeniesienie zmiany na inną osobę bez zamiany — przez edycję zmiany (pole „Osoba”).

## Analiza
- Porównania z poprzednimi latami mają sens od chwili, gdy zespół wpisuje czas pracy w aplikacji — wcześniejszych danych aplikacja nie ma (ewentualny import historii — do ustalenia).
- „Podobne projekty” to punktacja według rodziny detali, maszyny, typów zadań i skali planu — propozycje trzeba ocenić (dlatego można je odrzucać).
- Nieobecności na przełomie miesięcy dzielone proporcjonalnie do dni kalendarzowych (przybliżenie).
- PDF powstaje funkcją drukowania przeglądarki („Zapisz jako PDF”).

## Telefony
- Aplikacja na telefon to skrót/instalacja ze strony (PWA) — bez APK i sklepu z aplikacjami. Wymaga ważnego certyfikatu HTTPS.
- Brak trybu offline dla danych (celowo — dane osobowe nie są przechowywane na telefonach).
- Sesja trwa 12 h — po tym czasie telefon poprosi o ponowne logowanie.
- Nie testowano na fizycznych telefonach firmowych; zrzuty pochodzą z emulacji w przeglądarce.

## Technika
- `node:sqlite` jest w Node 22 oznaczony jako eksperymentalny (stabilny interfejs w praktyce; ostrzeżenie wyciszone w skryptach npm). Przy aktualizacji Node uruchom `npm test`.
- Jeden proces, jedna baza — przeznaczone dla jednego stanowiska / kilku użytkowników w sieci lokalnej. Hosting, HTTPS, SSO i SharePoint — do ustalenia (`INTEGRATIONS.md`).
- Interfejs testowany automatycznie tylko zrzutami ekranu (brak testów E2E klikających wszystkie formularze).
- Domyślny język formatów dat w przeglądarce może różnić się od pl-PL w polach `type=date` (zależnie od ustawień systemu).
