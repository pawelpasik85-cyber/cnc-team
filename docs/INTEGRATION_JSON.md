# Wymiana danych CNC Team ↔ CNC Process (JSON, wersja 1.0)

Podział odpowiedzialności:
- **CNC Team**: pracownicy, grafik, absencje, przydział zadań, czas ludzi.
- **CNC Process**: dane technologiczne, czas NX, estymacja czasu maszyny, rzeczywisty czas obróbki, ograniczenia ustawienia.

Wspólne identyfikatory: `order_no`, `part_no`, `part_rev`, `machine_id`, `operation_id`, `nc_program`, `nc_rev` (znaki: litery, cyfry, `. _ - /`, maks. 64). Czas zawsze w **minutach całkowitych**.

## Eksport z CNC Team → CNC Process

`GET /api/integration/cnc-process/export` (tylko administrator; Ustawienia → Wymiana z CNC Process).

```json
{
  "format": "cnc-team.exchange",
  "version": "1.0",
  "generated_at": "2026-10-06T10:00:00.000Z",
  "timezone": "Europe/Warsaw",
  "units": { "time": "min" },
  "machines": [ { "id": "M-HARTFORD", "name": "Hartford", "axes": 3, "control": "Heidenhain", "model": null } ],
  "projects": [ {
    "project_id": "PRJ-2026-0001", "order_no": "ZL-26-0412", "part_no": "NGK-TR-118", "part_rev": "C",
    "part_family": "tacki NGK", "machine_id": "M-HARTFORD", "due_date": "2026-10-16", "status": "aktywny",
    "current_nc": { "nc_program": "TR118_OP10", "nc_rev": "03" },
    "operations": ["OP10"]
  } ]
}
```

Eksport **nie zawiera**: pracowników i przypisań osób, absencji, L4, wyjść, dokumentów kadrowych, notatek, planów i czasu ludzi, raportów efektywności (test: `test/projects.test.js`).

## Import CNC Process → CNC Team

`POST /api/integration/cnc-process/import` (tylko administrator), `?dry_run=1` — walidacja bez zapisu.

```json
{
  "format": "cnc-process.techdata",
  "version": "1.0",
  "generated_at": "2026-10-06T08:00:00Z",
  "units": { "time": "min" },
  "items": [ {
    "order_no": "ZL-26-0412", "part_no": "NGK-TR-118", "part_rev": "C", "machine_id": "M-HARTFORD",
    "operation_id": "OP10", "nc_program": "TR118_OP10", "nc_rev": "03",
    "nx_time_min": 95, "machine_est_min": 110, "machine_actual_min": null,
    "updated_at": "2026-10-06T07:55:00Z"
  } ]
}
```

Walidacja (całość odrzucana przy którymkolwiek błędzie, z listą błędów):
- `format` = `cnc-process.techdata`, `version` ∈ {`1.0`}, `units.time` = `min`;
- identyfikatory obecne i poprawne; projekt istnieje dla (zlecenie, detal, rewizja detalu); `machine_id` (jeśli podany) istnieje i zgadza się z projektem;
- czasy: liczby całkowite ≥ 0 lub `null`, co najmniej jeden podany;
- brak duplikatów (zlecenie, detal, rewizja, operacja, program, rewizja NC) w pliku;
- ten sam plik (hash SHA-256) nie może być zaimportowany dwukrotnie.

Rewizje NC: pozycja z rewizją równą obowiązującej w projekcie → aktualna; inna rewizja → zapisana jako **nieaktualna** (ostrzeżenie). Zmiana obowiązującej rewizji w CNC Team oznacza wcześniejsze estymacje jako nieaktualne.

Import zapisuje wyłącznie do `tech_data` i `tech_imports` — nie modyfikuje grafiku, absencji, wyjść, odrabiań, pul urlopu ani czasu ludzi (test porównuje liczności tabel przed i po).

Bez integracji projekt pokazuje „Brak danych”; wpisy ręczne są oznaczone „dane ręczne”.

## Wersjonowanie

Zmiana niekompatybilna → nowa wartość `version` (np. `2.0`) i dopisanie jej do `SUPPORTED_VERSIONS` w `server/domain/integration.js` wraz z obsługą.
