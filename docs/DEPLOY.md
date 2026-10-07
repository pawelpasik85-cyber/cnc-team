# Instalacja na serwerze firmowym (instrukcja dla IT)

CNC Team to jedna aplikacja Node.js z bazą SQLite w jednym pliku. Działa **wyłącznie na serwerze firmowym**: nie ma zależności npm, nie pobiera niczego z internetu i nie łączy się z żadną usługą zewnętrzną (chmura, GitHub, CDN). Wszyscy użytkownicy — kierownik, programiści (także z domu, z telefonu) i goście — korzystają z jednego adresu HTTPS w domenie firmy.

```
Telefon / komputer (firma lub dom)
   │ https://cnc-team.<domena-firmy>  (certyfikat firmy)
   ▼
IIS na serwerze (reverse proxy, port 443) ──► CNC Team (Node.js, 127.0.0.1:3000) ──► C:\CNC-Team-dane\cnc-team.db
```

## Czego potrzebujemy od IT

| # | Element | Szczegóły |
|---|---|---|
| 1 | Maszyna wirtualna | Windows Server 2019 lub nowszy, 2 vCPU, 4 GB RAM, 20 GB dysku (aplikacja zużywa ok. 65 MB RAM i kilka MB danych — zapas na system i IIS) |
| 2 | Node.js | LTS 22.13 lub nowszy (https://nodejs.org, instalator `.msi`, bezpłatny) |
| 3 | IIS jako reverse proxy | IIS + bezpłatne moduły Microsoft „URL Rewrite” i „Application Request Routing”; konfiguracja: `deploy\windows\iis-web.config` |
| 4 | Adres i certyfikat | Nazwa w domenie firmy, np. `cnc-team.<domena-firmy>`, w DNS wewnętrznym i publicznym; ważny certyfikat HTTPS (firmowy lub publiczny — nie samopodpisany, inaczej telefony nie zainstalują aplikacji) |
| 5 | Dostęp z internetu | Publikacja portu **443** tego serwera z internetu (NAT / reguła zapory) — tylko 443, port 3000 pozostaje lokalny |
| 6 | Kopia zapasowa | Folder `C:\CNC-Team-dane` (baza + kopie dzienne z zadania „CNC Team kopia”) objęty firmową kopią serwera |
| 7 | Uprawnienia | Konto administratora serwera do instalacji (jednorazowo) i do podmiany plików przy aktualizacji |

Koszt licencji: 0 zł. Aplikacja nie wymaga kont Microsoft 365, domeny AD ani poczty — konta użytkowników są w aplikacji (zakłada je kierownik).

## Instalacja (ok. 1 h)

1. Zainstaluj Node.js LTS (dla wszystkich użytkowników) oraz IIS z modułami URL Rewrite i ARR.
2. Rozpakuj paczkę `cnc-team-serwer.zip` do `C:\CNC-Team` (folder z `package.json`).
3. Utwórz `C:\CNC-Team-dane` — dostęp tylko dla administratorów i konta SYSTEM (dane osobowe).
4. Pierwsze konto kierownika (PowerShell w `C:\CNC-Team`):
   ```powershell
   $env:CNC_DB="C:\CNC-Team-dane\cnc-team.db"; $env:CNC_ADMIN_PASSWORD="(min. 10 znaków)"; npm run init-admin
   ```
   Login i hasło przekaż kierownikowi (zmieni hasło po pierwszym logowaniu: Ustawienia → Moje konto).
5. Jako administrator: `powershell -ExecutionPolicy Bypass -File C:\CNC-Team\deploy\windows\install-tasks.ps1` — rejestruje zadanie „CNC Team” (start z systemem, ponowienie po awarii, konto SYSTEM) i „CNC Team kopia” (codziennie 02:30).
6. IIS: nowa witryna z wiązaniem HTTPS 443 dla `cnc-team.<domena-firmy>` i certyfikatem; katalog główny = pusty folder z plikiem `deploy\windows\iis-web.config` zapisanym jako `web.config`. W ARR włącz proxy (*Server Proxy Settings → Enable proxy*), w URL Rewrite dodaj zmienną serwera `HTTP_X_FORWARDED_PROTO` (*View Server Variables → Add*).
7. Sprawdź z telefonu poza siecią firmy: `https://cnc-team.<domena-firmy>` → strona logowania CNC Team.

Dziennik aplikacji: `C:\CNC-Team-dane\cnc-team.db.log`. Ustawienia uruchomienia: `deploy\windows\cnc-team-start.cmd`.

## Zabezpieczenia wbudowane

- Aplikacja nasłuchuje tylko na `127.0.0.1` — z sieci i z internetu dostępna wyłącznie przez IIS z HTTPS.
- Hasła: scrypt, minimum 10 znaków; sesja 12 h w cookie `HttpOnly; Secure; SameSite=Strict`.
- Blokada logowania: po 5 błędnych hasłach dla pary konto + adres IP — 15 min blokady z tego adresu; adres próbujący wielu kont — po 20 błędach. Osoba z zewnątrz nie zablokuje kierownika logującego się z innego adresu. Blokady są w historii zmian. Adres klienta brany z nagłówka IIS (ostatni wpis `X-Forwarded-For`, bez portu) tylko dla połączeń z 127.0.0.1.
- Ochrona CSRF, nagłówki CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`; odpowiedzi API nie są buforowane (także na telefonach).
- Role egzekwowane na serwerze (`docs/PERMISSIONS.md`): programista tylko zgłasza do weryfikacji, gość widzi wyłącznie status wskazanych projektów, kierownik decyduje. Każda zmiana w historii z autorem, datą, opisem i wartościami przed/po.

## Kopia i odtworzenie

Zadanie „CNC Team kopia” tworzy codziennie spójną kopię (`VACUUM INTO`, sprawdzaną `integrity_check`) w `C:\CNC-Team-dane\kopie`. Odtworzenie: `docs/BACKUP.md`.

## Aktualizacja aplikacji

1. Uruchom zadanie „CNC Team kopia”.
2. Zatrzymaj zadanie „CNC Team”, podmień pliki w `C:\CNC-Team` na nową paczkę (folder `C:\CNC-Team-dane` zostaje bez zmian), uruchom zadanie ponownie.
3. Zmiany bazy (migracje) wykonują się automatycznie przy starcie, każda w transakcji z kontrolą spójności — błąd = brak zmian i komunikat w dzienniku.

## Zmienne (w `cnc-team-start.cmd`)

| Zmienna | Wartość |
|---|---|
| `HOST`, `PORT` | `127.0.0.1`, `3000` |
| `CNC_DB` | `C:\CNC-Team-dane\cnc-team.db` |
| `CNC_TRUST_PROXY` | `1` — adres klienta od IIS (blokada logowania) |
| `CNC_SECURE_COOKIE` | `1` — cookie sesji tylko przez HTTPS |

Jeśli standardem IT jest Linux, odpowiedniki są w `deploy/linux` (usługa systemd i reverse proxy nginx).
