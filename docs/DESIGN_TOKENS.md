# Wygląd — tokeny wspólne z CNC Process

Źródło prawdy: `public/tokens.css`. CNC Process powinien skopiować ten plik i używać tych samych zmiennych.

## Charakter
Centrum programowania w narzędziowni: chłodna, stalowa paleta, grafitowy panel nawigacji, jeden akcent w kolorze chłodziwa (turkus). Delikatna siatka techniczna 24 px w tle treści. Bez gradientów ozdobnych, bez cieni pod kartami, animacji brak (poza standardowymi stanami przycisków). Element charakterystyczny: **karta maszyny jak tabliczka znamionowa** — grafitowa kolumna z dużym oznaczeniem osi (3X / 5X), nazwą sterowania i ikoną, obok dane w układzie etykieta–wartość oddzielone przerywaną linią.

## Kolory (jasny / ciemny)
| Token | Jasny | Ciemny | Użycie |
|---|---|---|---|
| `--c-graphite` | #23282d | #111417 | panel nawigacji, kolumna osi |
| `--c-steel` | #8a949e | #8a949e | drugorzędne słupki, obrysy |
| `--c-steel-light` | #dde2e6 | #2b3238 | nagłówki tabel, tory pasków |
| `--c-paper` | #f3f5f6 | #16191c | tło treści |
| `--c-surface` | #ffffff | #1f2428 | panele |
| `--c-accent` | #0f8b8d | #2bb3b1 | akcent, przyciski główne, postęp przygotowania |
| `--c-info` | #2563a8 | #6ea8e8 | postęp wykonania |
| `--c-warn` / `--c-danger` / `--c-ok` | #b86e00 / #b3261e / #2e7d4f | jaśniejsze | stany |

Tryb ciemny: automatycznie wg systemu albo przełącznik „Motyw” (atrybut `data-theme` na `<html>`).

## Typografia
- `--f-sans`: Bahnschrift (Windows, krój DIN-podobny) → DIN Alternate → Roboto Condensed → Segoe UI → system-ui. Bez pobierania czcionek (praca offline).
- `--f-mono`: tylko numery zleceń, programy NC i rewizje (Cascadia Mono / Consolas).
- Cyfry tabelaryczne (`font-variant-numeric: tabular-nums`) w całej aplikacji.
- Skala: 0.78 / 0.875 / 1 / 1.25 / 1.6 / 2.4 rem. Etykiety zdaniowe, bez wersalików.

## Znaczenie bez polegania na kolorze
- Pracownik: kolor **i** kółko z inicjałami.
- Typ zdarzenia: ikona + skrót + nazwa (np. ikona walizki + „UW Urlop wypoczynkowy”).
- Status: etykieta tekstowa w znaczniku; wpis planowany — obrys przerywany, anulowany — przekreślenie.
- Czas zawsze „X h YY min”, brak danych zawsze tekstem „brak danych”.

## Ikony
Własne ikony SVG (obrys 1.7, `currentColor`, siatka 24): frez (`cutter`), wrzeciono (`spindle`), detal (`part`), osie XYZ (`axes`), program NC (`nc`) i ikony nawigacji — `public/icons.js`. Nie kopiują logotypów ani interfejsów NX / Heidenhain / Siemens.

## Komponenty
Panel (`.panel`, promień 6 px, obrys 1 px), tabela z przyklejonym nagłówkiem, znacznik (`.tag`), pasek postępu (`.bar` — dwa oddzielne: przygotowanie/wykonanie), tabliczka maszyny (`.plate`), komunikat (`.notice`), okno formularza (`dialog`), wykres słupkowy SVG zawsze z tabelą danych i definicją wskaźnika.
