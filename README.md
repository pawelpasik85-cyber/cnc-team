# CNC Team

Lokalna aplikacja webowa do zarządzania zespołem programistów frezarek CNC: grafik zmian, nieobecności, urlopy, wyjścia prywatne i odrabianie, rozliczenie miesiąca, projekty i zadania, tablica maszyn (Hartford 3X / Heidenhain, Grimme 5X / Sinumerik), przekazanie zmiany, raporty kierownicze i wymiana danych JSON z przyszłą aplikacją CNC Process.

Interfejs po polsku, strefa czasowa Europe/Warsaw, dane w lokalnej bazie SQLite (plik na dysku), bez płatnych usług i bez połączeń z kontami firmowymi.

## Wymagania

- **Node.js 22.13 lub nowszy** (LTS 22.x lub 24.x) — https://nodejs.org. Nic więcej: aplikacja nie ma zależności npm (baza `node:sqlite` jest wbudowana w Node.js).
- Przeglądarka: aktualny Edge, Chrome lub Firefox.

## Uruchomienie — dane demonstracyjne

```bash
cd cnc-team
npm run seed -- --reset      # tworzy data/cnc-team.db z fikcyjnymi danymi
npm start                     # http://127.0.0.1:3000
```

Konta demonstracyjne (hasło dla wszystkich: `demo-cnc-2026` — wyłącznie do demonstracji):

| Login | Rola |
|---|---|
| `kierownik` | Administrator (wprowadza i edytuje wszystkie dane) |
| `przelozony` | Przełożony (podgląd, raporty; bez dostępu do notatek poufnych) |
| `adam`, `bartosz`, `celina` | Pracownicy: podgląd swoich danych i projektów; spóźnienie, nieobecność, wyjście, odrobienie tylko **zgłaszają** do weryfikacji |
| `gosc` | Gość: wyłącznie status udostępnionego projektu (postęp, opóźnienie w %, etapy) |

Dane demonstracyjne są ustawione na „dzisiaj” = 6.10.2026. Aby zobaczyć je tak, jak na zrzutach ekranu, uruchom serwer z `CNC_TODAY=2026-10-06` (Windows PowerShell: `$env:CNC_TODAY="2026-10-06"; npm start`). Bez tej zmiennej aplikacja używa bieżącej daty.

## Serwer firmowy (zalecane)

Instalacja jako usługa na serwerze (Windows lub Linux), dostęp z domu przez firmowy adres HTTPS, kopie, zabezpieczenia: **`docs/DEPLOY.md`** (instrukcja dla IT), skrypty w `deploy/`.

## Aplikacja pracownika (z domu, na telefonie)

Pracownicy zgłaszają nieobecność, spóźnienie lub wyjście w aplikacji **CNC Team — pracownik**: https://pawelpasik85-cyber.github.io/cnc-team-app/ (strona i APK). Kierownik rozpatruje zgłoszenia w CNC Team → **Zgłoszenia pracowników**. Do chmury (Supabase) trafia tylko grafik, własne saldo i decyzje — szczegóły, uprawnienia i konfiguracja: **`docs/CLOUD.md`**.

## Telefony (dostęp kierownika do CNC Team)

Aplikacja działa na telefonach z przeglądarki i jako skrót / zainstalowana aplikacja na ekranie głównym (PWA); APK — po decyzji o hostingu. Szczegóły i instrukcja dla Androida i iPhone'a: **`docs/MOBILE.md`**.

```bash
npm run start:siec     # dostęp z telefonów w sieci firmowej (wypisuje adresy)
npm run make-cert      # opcjonalnie: https dla pełnej aplikacji na telefonie (wymaga openssl)
```

## Uruchomienie — baza produkcyjna (pusta)

```bash
# PowerShell
$env:CNC_ADMIN_PASSWORD="(min. 10 znaków)"; npm run init-admin
npm start
```

Następnie w aplikacji: Ustawienia → Konta i role, Pracownicy, Kalendarz → Generuj grafik, Urlopy i absencje → Pule urlopu (dane z kadr).

## Zmienne środowiskowe

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `HOST` | `127.0.0.1` | Adres nasłuchu. Domyślnie tylko ten komputer; `npm run start:siec` ustawia `0.0.0.0` (telefony w sieci firmowej). |
| `CNC_TLS_CERT`, `CNC_TLS_KEY` | `data/tls/cert.pem`, `key.pem` | Certyfikat HTTPS; jeśli pliki istnieją, serwer działa na https (`CNC_HTTPS=0` wyłącza) |
| `CNC_DB` | `data/cnc-team.db` | Plik bazy |
| `CNC_TODAY` | — | Stała data „dzisiaj” (testy, demonstracja) |

## Polecenia

| Polecenie | Działanie |
|---|---|
| `npm start` | Serwer aplikacji |
| `npm run start:siec` | Serwer dostępny dla telefonów w sieci lokalnej |
| `npm run make-cert` | Lokalny certyfikat HTTPS dla telefonów |
| `npm test` | Testy automatyczne (47 scenariuszy) |
| `node scripts/build-mobile.js` | Budowa aplikacji pracownika do `dist-mobile/` |
| `npm run seed -- --reset` | Baza demonstracyjna od nowa (usuwa plik bazy!) |
| `npm run init-admin` | Pierwsze konto administratora w pustej bazie |
| `npm run backup [katalog]` | Kopia zapasowa — patrz `docs/BACKUP.md` |

## Struktura

```
server/            serwer HTTP, API, logika dziedzinowa
  migrations/      schemat bazy (migracje SQL)
  domain/          pracownicy, absencje, wyjścia, projekty, raporty, integracja
public/            interfejs (HTML/CSS/JS bez frameworka), tokens.css — wspólne tokeny wyglądu
mobile/            aplikacja pracownika (PWA; ta sama w APK)
android-app/       powłoka Capacitor do budowy APK (tylko w GitHub Actions)
supabase/          migracje i test uprawnień chmury
deploy/            uruchamianie jako usługa (Windows, Linux), przykład reverse proxy
.github/           budowa strony i APK, recenzja GPT przy każdym pushu
scripts/           seed, init-admin, backup, zrzuty ekranów
test/              testy (node:test)
docs/              dokumentacja i zrzuty ekranów
```

## Dokumentacja

- `docs/ARCHITECTURE.md` — architektura, etapy, założenia
- `docs/DATA_MODEL.md` — model danych
- `docs/RULES.md` — reguły obliczeń i źródła prawne (ze statusem weryfikacji)
- `docs/PERMISSIONS.md` — macierz uprawnień
- `docs/TESTS.md` — instrukcja testów i wyniki
- `docs/BACKUP.md` — kopia zapasowa i odtworzenie
- `docs/LIMITATIONS.md` — znane ograniczenia
- `docs/INTEGRATION_JSON.md` — format wymiany z CNC Process
- `docs/DEPLOY.md` — instalacja na serwerze firmowym, dostęp z domu, zabezpieczenia (dla IT)
- `docs/CLOUD.md` — aplikacja pracownika, chmura, co jest wysyłane, konfiguracja
- `docs/MOBILE.md` — telefony: skrót, pełna aplikacja (https), APK
- `docs/DESIGN_TOKENS.md` — wygląd do odtworzenia w CNC Process
- `docs/screenshots/` — zrzuty kluczowych ekranów
- `DEPENDENCIES.md`, `INTEGRATIONS.md`, `REVIEW.md`
