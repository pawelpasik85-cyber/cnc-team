# Wygląd — tokeny wspólne z CNC Process

Źródło prawdy: `public/tokens.css`. CNC Process powinien skopiować ten plik i używać tych samych zmiennych.

## Charakter (od 0.17 — motyw „Industrial”)
Wzór: grafika kierownika „CNC Trends” — hala w granacie, panele HUD z błękitną poświatą, pomarańczowy akcent. Tło: granat z siatką 40 px i dwiema poświatami (błękit u góry, pomarańcz u dołu). Panele: półprzezroczysty granat z obrysem i cieniem. Duże białe tytuły z pomarańczową kreską pod spodem, etykiety wersalikami. Karta maszyny zachowuje kolumnę osi (3X / 5X) w kolorze maszyny i delikatną poświatę tego koloru. Motyw jasny (przycisk „Motyw”) — te same zasady na jasnym tle; wydruk zawsze jasny. Warstwa wyglądu dotyczy tylko ekranu (`@media screen`).

## Kolory
| Token | Industrial (domyślny) | Jasny | Użycie |
|---|---|---|---|
| `--c-graphite` | #060b15 | #0b1424 | menu boczne |
| `--c-paper` | #08101d | #eef2f7 | tło strony |
| `--c-surface` | #0f1a2c | #ffffff | panele |
| `--c-line` | #22344e | #d3dbe5 | obrysy, linie tabel |
| `--c-ink` / `--c-ink-soft` | #e9f0f8 / #94a6be | #14202f / #4d5b6c | tekst |
| `--c-accent` | #ff7a1a | #e2620c | akcent: przyciski główne, aktywne menu, kreski tytułów |
| `--c-glow` | #2f8cff | #1d6fd6 | poświata HUD, ikony menu |
| `--c-warn` / `--c-danger` / `--c-ok` | #f2a33a / #ff6257 / #3ccf86 | #b86e00 / #b3261e / #2e7d4f | stany |
| `--series-1..4` | #3987e5, #e8680f, #199e70, #b88208 | #2a78d6, #e2620c, #1baf7a, #c98500 | serie wykresów (sprawdzone walidatorem palety: CVD, kontrast, jasność) |

Maszyny bez zmian: Hartford — szarości (`--m-mid` #8a949e), Grimme — błękit (#2a7de0). Motyw zapamiętywany na urządzeniu (`localStorage`, atrybut `data-theme` na `<html>`).

## Raporty w plikach (PDF / PNG)
Rysowane na płótnie w tym samym stylu: granatowy nagłówek z pomarańczową linią, białe tło treści (czytelne po wydruku), kafelki z kolorowym paskiem, słupki w kolorach maszyn i serii, tabele z granatowym nagłówkiem. Kod: `public/report-export.js`.

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


## Motywy maszyn i grafika 2.5D (wersja 0.5)
- **Hartford 3X** — stal i szarości: `--m-dark #3c434b`, `--m-mid #77818c`, `--m-light #c9d0d7`.
- **Grimme 5X** — błękit: `--m-dark #0c3a78`, `--m-mid #1d6fd6`, `--m-light #74b6fb`.
- Klasy `.theme-hartford` / `.theme-grimme` (`public/tokens.css`) ustawiają zmienne `--m-*`; motyw wybierany po identyfikatorze maszyny, a dla nowych maszyn po liczbie osi (≥ 5 → błękit).
- Emblematy i logo: SVG w rzucie izometrycznym (`public/brand.js` — `machineEmblem`, `appLogo`), bez plików graficznych. Ikony PWA generuje `scripts/make-icons.py` z tego samego logo.
- Paski 3D: tor wklęsły (cień wewnętrzny), wypełnienie z gradientem jasny → średni → ciemny i odblaskiem u góry; etap wykonania z ukośnym prążkowaniem. Wynik godzin: kafel z gradientem — zielony (w planie), czerwony (ponad plan), w kolorze maszyny (brak danych do oceny); przekroczenie na pasku godzin — czerwone prążki za znacznikiem planu.
