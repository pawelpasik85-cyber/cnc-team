# Instalacja na serwerze firmowym (instrukcja dla IT)

CNC Team to jedna aplikacja Node.js z bazą SQLite w jednym pliku. Nie ma zależności npm, nie pobiera niczego z internetu w czasie działania i nie łączy się z usługami zewnętrznymi (wyjątek: opcjonalna aplikacja pracowników w chmurze — `docs/CLOUD.md`, domyślnie wyłączona).

## Wymagania

| | Minimum |
|---|---|
| System | Windows Server 2019+ lub Linux (dowolna dystrybucja z Node.js) |
| Node.js | LTS 22.13 lub nowszy (testowane: 22.22) — https://nodejs.org |
| Zasoby | 1 vCPU, 1 GB RAM (aplikacja ok. 65 MB), kilka GB dysku |
| Sieć | 1 port TCP (domyślnie 3000) — tylko dla reverse proxy albo sieci firmowej |
| Koszt | 0 zł (bez licencji) |

## Instalacja — Windows

1. Zainstaluj Node.js LTS (instalator `.msi`, dla wszystkich użytkowników).
2. Rozpakuj aplikację, np. do `C:\CNC-Team` (z GitHub: *Code → Download ZIP* lub `git clone`).
3. Utwórz folder danych poza folderem aplikacji, np. `D:\CNC-Team-dane` (dostęp tylko dla administratorów i konta usługi).
4. Popraw ścieżki i ustawienia w `deploy\windows\cnc-team-start.cmd` i `deploy\windows\cnc-team-backup.cmd`.
5. Pierwsze konto administratora (PowerShell w folderze aplikacji):
   ```powershell
   $env:CNC_DB="D:\CNC-Team-dane\cnc-team.db"; $env:CNC_ADMIN_PASSWORD="(min. 10 znaków)"; npm run init-admin
   ```
6. Jako administrator: `powershell -ExecutionPolicy Bypass -File deploy\windows\install-tasks.ps1` — rejestruje zadanie „CNC Team” (start z systemem, ponowienie po awarii, konto SYSTEM) i „CNC Team kopia” (codziennie 02:30).
7. Sprawdź: `http://localhost:3000` na serwerze; dziennik: `D:\CNC-Team-dane\cnc-team.db.log`.

## Instalacja — Linux

`deploy/linux/cnc-team.service` (systemd, osobne konto `cncteam`, zapis tylko do `/var/lib/cnc-team`) oraz przykład reverse proxy `deploy/linux/nginx-cnc-team.conf`. Kopia: `cron` → `cd /opt/cnc-team && CNC_DB=/var/lib/cnc-team/cnc-team.db node scripts/backup.js /var/backups/cnc-team`.

## Dostęp z domu (telefony programistów, gość)

Wybór należy do IT — aplikacja obsługuje oba warianty:

**A. Adres HTTPS w internecie przez firmowy reverse proxy** (np. `https://cnc-team.firma.pl`)
- Proxy (IIS z ARR, nginx, Apache, zapora z publikacją aplikacji) kończy HTTPS i przekazuje ruch na `http://serwer:3000`.
- W aplikacji ustaw `CNC_TRUST_PROXY=1`. Nagłówki `X-Forwarded-For` / `X-Forwarded-Proto` są honorowane **tylko** od proxy na tym samym serwerze (127.0.0.1) albo z adresów w `CNC_PROXY_IPS`; adresem klienta jest ostatni wpis `X-Forwarded-For` (dopisany przez proxy). Cookie dostaje flagę `Secure` przy `X-Forwarded-Proto: https`.
- Port 3000 ma być dostępny tylko dla proxy (`HOST=127.0.0.1`, gdy proxy jest na tym samym serwerze, albo reguła zapory).
- Bezpieczniejsza odmiana: **Microsoft Entra Application Proxy** — logowanie kontem firmowym przed dostępem do aplikacji, bez otwierania portów przychodzących (wymaga licencji Entra ID P1/P2).

**B. Aplikacja pracowników w chmurze** (Supabase, UE) — serwer tylko wysyła dane na zewnątrz, bez portów przychodzących; wymaga zgody firmy na usługę zewnętrzną. Szczegóły: `docs/CLOUD.md`.

Telefon: pracownik otwiera adres w przeglądarce i wybiera „Dodaj do ekranu głównego” (PWA). Aplikacja nie przechowuje na telefonie żadnych danych — tylko szkielet strony (`public/sw.js`).

## Zabezpieczenia wbudowane

- Hasła: scrypt, minimum 10 znaków; sesja 12 h w cookie `HttpOnly; SameSite=Strict` (+ `Secure` przy HTTPS).
- Blokada logowania: po 5 błędnych hasłach dla pary konto + adres IP logowanie z tego adresu jest blokowane na 15 min (ustawienia `login_max_failures`, `login_lock_min`), a adres próbujący wielu kont — po 20 błędach. Osoba z zewnątrz nie zablokuje więc kierownika logującego się z innego adresu. Blokada trafia do historii zmian. Zgadywanie rozproszone na wiele adresów ogranicza długość hasła (min. 10 znaków) i scrypt; przy publikacji w internecie zalecane uwierzytelnienie przed aplikacją (Entra Application Proxy).
- Ochrona CSRF (wymagany nagłówek), nagłówki CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`; brak buforowania odpowiedzi API.
- Uprawnienia egzekwowane na serwerze (`docs/PERMISSIONS.md`): programista tylko zgłasza do weryfikacji, gość widzi wyłącznie status wskazanych projektów.
- Historia zmian: każda zmiana z autorem, datą, opisem i wartościami przed/po; nie da się jej edytować z aplikacji.

## Aktualizacja aplikacji

1. Kopia: `deploy\windows\cnc-team-backup.cmd` (lub zadanie „CNC Team kopia”).
2. Zatrzymaj zadanie „CNC Team”, podmień pliki aplikacji (folder danych zostaje), uruchom zadanie ponownie.
3. Migracje bazy wykonują się automatycznie przy starcie (w transakcji — błąd = brak zmian).

## Zmienne środowiskowe

| Zmienna | Znaczenie |
|---|---|
| `HOST`, `PORT` | Adres i port nasłuchu (domyślnie `127.0.0.1:3000`) |
| `CNC_DB` | Plik bazy (zalecane poza folderem aplikacji) |
| `CNC_TRUST_PROXY=1` | Aplikacja za reverse proxy (adres klienta z `X-Forwarded-For`) |
| `CNC_PROXY_IPS` | Adresy proxy na innym serwerze (po przecinku) |
| `CNC_SECURE_COOKIE=1` | Wymuś flagę `Secure` cookie |
| `CNC_TLS_CERT`, `CNC_TLS_KEY` | HTTPS bezpośrednio w aplikacji (gdy bez proxy) |
| `CNC_CLOUD_SYNC_MS` | Odstęp synchronizacji z aplikacją w chmurze (domyślnie 120000; 0 = wyłączona) |
