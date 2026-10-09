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

## Serwer firmowy

Aplikacja działa wyłącznie na serwerze firmowym — bez chmury i usług zewnętrznych. Kierownik, programiści (także z domu, z telefonu) i goście wchodzą pod jeden adres HTTPS w domenie firmy. Instalacja, wymagania i zabezpieczenia: **`docs/DEPLOY.md`** (instrukcja dla IT), skrypty w `deploy/`, paczka: `npm run package` → `dist/cnc-team-serwer.zip`.

## Urlopy
- **Kalendarz urlopów** (Urlopy i absencje): miesiąc w kafelkach — kto i jaka nieobecność.
- **Wyjścia i odrabianie**: nad saldami kalendarz miesiąca — kto, którego dnia, na której zmianie wyszedł / odrabiał.
- **Pracownicy**: pod każdą osobą zestawienie na wybrany rok — urlop wypoczynkowy (wykorzystano / zostało / zaległy), na żądanie, siła wyższa, art. 188, inne nieobecności.

## Plan pracy i grafik (kierownik)
- **Plan pracy** — polecenia dla każdego programisty na dany dzień (kolejność, zadanie z projektu, czas); programista widzi tylko swoje i potwierdza przeczytanie; ocena i przeniesienie niedokończonych — kierownik.
- **Kalendarz** — kliknięcie zmiany: tryb pracy (standardowa / wydłużona np. 12 h / nieregularna / dzień dodatkowy), godziny, przeniesienie na inną osobę, **zamiana osób** między zmianami, usunięcie — zawsze z powodem w historii. Przyciski **Dzień dodatkowy / nadgodziny** (np. sobota, niedziela na nocnej zmianie) i **Zmiana trybu pracy** na okres przy brakach kadrowych.
- Dni dodatkowe są w kalendarzu kreskowane z plakietką **DOD**, zmiany wydłużone — **12h**, nieregularne — **NR**. Godziny na projektach w nadgodzinach (i ich udział %) pokazuje analiza projektu i miesiąca.

## Analiza i raporty (tylko kierownik)
- **Powrót do projektu (poprawki)** — przy zakończonym projekcie; analiza projektu pokazuje czas przed poprawkami, ile doszło w każdej rundzie (i o ile %), same poprawki łącznie i razem.

Po zakończeniu projektu: wykres przebiegu (godziny narastająco i postęp wobec planu, zadania plan vs wykonanie) oraz porównanie z podobnymi zakończonymi projektami — propozycje można odrzucać. Miesiąc wobec tego samego miesiąca rok wcześniej i cały rok wobec innych lat. Każdy widok można zapisać jako raport (z komentarzem), wydrukować / zapisać jako PDF, pobrać CSV i — według decyzji kierownika — udostępnić przełożonemu.

## Telefony

Programista otwiera adres firmowy w telefonie i dodaje skrót na ekran główny (PWA). Zgłasza spóźnienie, nieobecność, wyjście lub odrobienie — wpis powstaje dopiero po decyzji kierownika (Zgłoszenia pracowników). Szczegóły: **`docs/MOBILE.md`**.

Próba bez serwera (telefony w tej samej sieci Wi-Fi co komputer):

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
| `npm test` | Testy automatyczne (41 scenariuszy) |
| `npm run package` | Paczka instalacyjna dla IT: `dist/cnc-team-serwer.zip` |
| `npm run seed -- --reset` | Baza demonstracyjna od nowa (usuwa plik bazy!) |
| `npm run init-admin` | Pierwsze konto administratora w pustej bazie |
| `npm run backup [katalog]` | Kopia zapasowa — patrz `docs/BACKUP.md` |

## Struktura

```
server/            serwer HTTP, API, logika dziedzinowa
  migrations/      schemat bazy (migracje SQL)
  domain/          pracownicy, absencje, wyjścia, projekty, raporty, integracja
public/            interfejs (HTML/CSS/JS bez frameworka), tokens.css — wspólne tokeny wyglądu
deploy/            uruchamianie jako usługa (Windows, Linux), przykład reverse proxy
.github/           recenzja kodu przez GPT (narzędzie deweloperskie, nie część aplikacji)
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
- `docs/MOBILE.md` — telefony: skrót na ekranie głównym, prywatność
- `docs/DESIGN_TOKENS.md` — wygląd do odtworzenia w CNC Process
- `docs/screenshots/` — zrzuty kluczowych ekranów
- `DEPENDENCIES.md`, `INTEGRATIONS.md`, `REVIEW.md`
