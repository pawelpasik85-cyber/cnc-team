# Znane ograniczenia (wersja 0.1)

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

## Aplikacja pracownika i chmura
- Szczegóły i ryzyka: `docs/CLOUD.md` (dane na prywatnych kontach kierownika, usypianie darmowego projektu, synchronizacja tylko przy działającym CNC Team, brak powiadomień push o decyzji, odebranie dostępu przez SQL).

## Telefony
- Dostęp tylko w sieci, w której jest komputer z aplikacją, i tylko gdy komputer jest włączony. Poza firmą — wymaga decyzji o hostingu/VPN.
- Przez http (bez certyfikatu) telefon tworzy jedynie skrót do przeglądarki, a ruch nie jest szyfrowany. Pełna aplikacja wymaga https (lokalny CA z `make-cert` lub certyfikat firmowy).
- APK nie jest zbudowany — wymaga stałego adresu https (`docs/MOBILE.md`, wariant C).
- Brak trybu offline dla danych (celowo — dane osobowe nie są przechowywane na telefonach).
- Sesja trwa 12 h — po tym czasie telefon poprosi o ponowne logowanie.
- Nie testowano na fizycznych telefonach firmowych; zrzuty pochodzą z emulacji w przeglądarce.

## Technika
- `node:sqlite` jest w Node 22 oznaczony jako eksperymentalny (stabilny interfejs w praktyce; ostrzeżenie wyciszone w skryptach npm). Przy aktualizacji Node uruchom `npm test`.
- Jeden proces, jedna baza — przeznaczone dla jednego stanowiska / kilku użytkowników w sieci lokalnej. Hosting, HTTPS, SSO i SharePoint — do ustalenia (`INTEGRATIONS.md`).
- Interfejs testowany automatycznie tylko zrzutami ekranu (brak testów E2E klikających wszystkie formularze).
- Domyślny język formatów dat w przeglądarce może różnić się od pl-PL w polach `type=date` (zależnie od ustawień systemu).
