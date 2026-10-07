# Zależności

Aplikacja **nie ma zależności npm** (`package.json` bez `dependencies`). Nie wymaga płatnych usług, abonamentów, kont chmurowych ani okresów próbnych.

| Zależność | Zastosowanie | Licencja | Koszt | Ograniczenia |
|---|---|---|---|---|
| Node.js ≥ 22.13 (LTS) | Środowisko uruchomieniowe serwera, w tym `node:http`, `node:crypto`, `node:test` | MIT (oraz licencje komponentów Node.js) | 0 zł | `node:sqlite` w Node 22 ma status eksperymentalny — przy aktualizacji Node uruchomić testy |
| SQLite (wbudowany w Node.js jako `node:sqlite`) | Trwała baza danych w pliku | Public Domain | 0 zł | Jeden plik, jeden proces zapisujący — wystarczające dla zespołu kierownika |
| Przeglądarka (Edge / Chrome / Firefox) | Interfejs | — | 0 zł | Wymagane: `dialog`, `fetch`, ES2020 |
| Krój Bahnschrift (Windows) | Typografia, jeśli dostępny w systemie | Część systemu Windows — nie jest dystrybuowany z aplikacją | 0 zł | Na innych systemach używany jest krój zastępczy |
| Ikony SVG | Własne, w kodzie aplikacji (`public/icons.js`) | Kod projektu | 0 zł | — |

## Opcjonalne — tylko dla https na telefonach

| Narzędzie | Zastosowanie | Licencja | Koszt |
|---|---|---|---|
| OpenSSL (np. z Git for Windows) | `npm run make-cert` — lokalny CA i certyfikat serwera | Apache-2.0 | 0 zł |

## Opcjonalne narzędzia deweloperskie (nie są potrzebne do działania)

| Narzędzie | Zastosowanie | Licencja | Koszt |
|---|---|---|---|
| Python 3 + Playwright (`pip install playwright`, `playwright install chromium`) | `scripts/screenshots.py` — zrzuty ekranów i wykrywanie błędów konsoli | Apache-2.0 (Playwright), PSF (Python) | 0 zł |
| Python 3 + Pillow | `scripts/make-icons.py` — ponowne wygenerowanie ikon aplikacji (gotowe ikony są w `public/icons`) | MIT-CMU (Pillow) | 0 zł |
