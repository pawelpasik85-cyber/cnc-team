# CNC Team na telefonach

CNC Team to aplikacja instalowalna (PWA): ten sam kod działa w przeglądarce komputera, jako skrót na ekranie głównym telefonu, a później może być zapakowany jako APK. Interfejs ma osobny układ dla telefonu: górny pasek z menu, dolna nawigacja (Dzisiaj, Kalendarz, Projekty, Maszyny, Więcej), kalendarz jako lista dni, tabele jako karty, formularze na pełny ekran, duże pola dotykowe.

Telefon nie przechowuje danych: zapamiętywany jest tylko wygląd aplikacji, a każde saldo, nieobecność czy projekt są pobierane z serwera przy otwarciu. Bez połączenia aplikacja pokazuje komunikat „Brak połączenia z serwerem”.

## Warunek dla wszystkich wariantów

Telefony muszą widzieć komputer z aplikacją:
- telefon i komputer w tej samej sieci firmowej (Wi-Fi), komputer włączony;
- na komputerze: `npm run start:siec` — aplikacja wypisze adresy dla telefonów, np. `http://192.168.1.20:3000`;
- zapora Windows musi przepuszczać port 3000 (przy pierwszym uruchomieniu Windows zapyta — wybierz „sieci prywatne”; w sieci zarządzanej przez IT może być potrzebna reguła od IT);
- stały adres komputera (rezerwacja DHCP u IT), inaczej skrót na telefonach przestanie działać po zmianie adresu.

Poza siecią firmową (dane komórkowe) aplikacja nie będzie dostępna — to wymaga decyzji o hostingu lub VPN.

## Wariant A — skrót na ekranie głównym (od razu, bez certyfikatu)

1. Na komputerze: `npm run start:siec`.
2. Na telefonie w Chrome otwórz adres z konsoli (`http://…:3000`) i zaloguj się.
3. Menu ⋮ → **Dodaj do ekranu głównego**. (iPhone: Safari → Udostępnij → Do ekranu początkowego.)

Ikona otwiera aplikację w przeglądarce. **Ograniczenie**: połączenie nie jest szyfrowane — hasła i dane przechodzą przez Wi-Fi jawnym tekstem. Używaj tylko do próby albo w zaufanej sieci.

## Wariant B — pełna aplikacja w sieci firmowej (zalecany)

Szyfrowane połączenie (https) z lokalnym certyfikatem. Aplikacja otwiera się w osobnym oknie, bez paska przeglądarki, a Chrome proponuje **Zainstaluj aplikację**.

1. Na komputerze (raz): `npm run make-cert` — wymaga programu `openssl` (w Windows jest w Git for Windows: `C:\Program Files\Git\usr\bin`). Powstaje `data/tls/cnc-team-ca.crt` (certyfikat do telefonów) i certyfikat serwera dla bieżących adresów komputera. Jeśli komputer ma inną nazwę lub adres widziany z telefonów, dopisz je: `npm run make-cert -- 192.168.1.20 cnc-pc`.
2. `npm run start:siec` — aplikacja sama wykryje certyfikat i uruchomi się pod `https://…:3000`.
3. Na każdym telefonie zainstaluj `cnc-team-ca.crt` (przekaż plik np. kablem lub mailem firmowym):
   - **Android**: Ustawienia → Bezpieczeństwo → Szyfrowanie i dane logowania → Zainstaluj certyfikat → **Certyfikat CA** (nazwy menu różnią się między producentami).
   - **iPhone**: otwórz plik → Ustawienia → Pobrany profil → Zainstaluj, potem Ustawienia → Ogólne → To urządzenie → Ustawienia zaufania certyfikatów → włącz „CNC Team - lokalny CA”.
4. Otwórz `https://…:3000` → Chrome: ⋮ → **Zainstaluj aplikację** (iPhone: Safari → Do ekranu początkowego). W menu aplikacji jest też przycisk „Skrót na telefonie” z instrukcją.

Bezpieczeństwo: plik `data/tls/ca.key` pozwala wystawiać certyfikaty, którym ufają telefony — nie kopiuj go na telefony, nie wysyłaj mailem, trzymaj tylko na komputerze z aplikacją (jest pomijany w paczce i w `.gitignore`). Certyfikat serwera ważny 397 dni — potem ponownie `npm run make-cert` (CA zostaje, telefonów nie trzeba konfigurować drugi raz). W firmie z działem IT prostsze może być użycie certyfikatu firmowego: wskaż pliki zmiennymi `CNC_TLS_CERT` i `CNC_TLS_KEY`.

## Wariant C — APK dla Androida (po decyzji o hostingu)

APK powstaje z tej samej aplikacji jako „Trusted Web Activity” — bezpłatnymi, otwartymi narzędziami PWABuilder lub Bubblewrap (Google). Warunki:
- stały adres **https** z certyfikatem zaufanym przez telefony (hosting firmowy lub publiczny — do ustalenia);
- plik weryfikacyjny `/.well-known/assetlinks.json` na serwerze (dodam przy budowie APK);
- instalacja: ręcznie z pliku (trzeba zezwolić na instalację z nieznanych źródeł) albo przez zarządzanie urządzeniami IT / prywatny sklep firmowy. Publikacja w Google Play wymaga jednorazowej opłaty za konto dewelopera — nie jest potrzebna dla użytku wewnętrznego.

APK nie dodaje funkcji względem wariantu B — daje tylko ikonę „z instalatora”. Dla iPhone'ów odpowiednikiem jest wariant B (Apple nie instaluje APK; aplikacja w App Store to osobny, płatny proces).

## Co sprawdzono

- Widoki telefonu na ekranie 412×915 (Android): zrzuty `docs/screenshots/30…37-telefon-*.png`.
- Manifest, ikony, rejestracja service workera (test automatyczny + kontrola w przeglądarce).
- Tryb https: certyfikat z `make-cert` weryfikuje się względem lokalnego CA, logowanie ustawia cookie `Secure`.
- Nie sprawdzono na fizycznych telefonach firmowych — instalacja certyfikatu i zachowanie konkretnych wersji Androida/iOS wymagają próby na miejscu.
