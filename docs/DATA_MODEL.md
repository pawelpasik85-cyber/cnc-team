# Model danych

Schemat: `server/migrations/001_init.sql`. Konwencje: czasy trwania w **minutach (INTEGER)**; chwile w UTC (`*_at`, ISO 8601); daty kalendarzowe Europe/Warsaw (`*_date`, `YYYY-MM-DD`); miesiące `YYYY-MM`.

## Ludzie i czas pracy

| Tabela | Opis | Kluczowe pola |
|---|---|---|
| `employees` | Profil pracownika | imię, nazwisko, `color`, `active`, okres zatrudnienia, `competences`, `machine_ids` (JSON), dane początkowe rozliczeń + zatwierdzenie, `hr_reference` (poufne) |
| `employment_terms` | Etat i normy **z datą obowiązywania** | `valid_from`, `fte_num/fte_den`, `daily_norm_min`, `weekly_norm_min`, `leave_day_min` (przelicznik prezentacji urlopu w dniach) |
| `users`, `sessions` | Konta i sesje | `role` (admin/supervisor/employee), `employee_id`, `can_view_confidential` |
| `shift_templates` | Szablony zmian | godziny lokalne, przerwa niewliczana |
| `schedule_entries` | Grafik | `work_date` (dzień rozpoczęcia = przypisanie do miesiąca), `start_at/end_at` UTC, `planned_min` (z DST) |
| `holidays` | Święta i dni wolne | `kind`: ustawowe / firmowe |
| `attendance_records` | Ręczna ewidencja obecności i nadgodzin | `kind`: obecnosc / nadgodziny — **oddzielone** od odrabiania |

## Nieobecności i urlopy

| Tabela | Opis |
|---|---|
| `absence_categories` | Katalog rozszerzalny bez zmiany kodu: nazwa, podtyp, kategoria nadrzędna, skrót, ikona, jednostka, rodzaj puli, zasada i wartości limitu, okres obowiązywania reguły, przenoszenie, wpływ na grafik, wymagane potwierdzenie, widoczność + etykieta publiczna, podstawa prawna, data i status weryfikacji |
| `absences` | Wpis nieobecności: status `planowana / wykorzystana / anulowana`, zakres dat lub godzin, `unit` (dni/godziny), `minutes` i `days` wg grafiku (migawka przy zapisie), `pool_id`, wniosek pracownika, dokument i notatka (poufne), powód anulowania |
| `leave_pools` | Pula urlopu wypoczynkowego na **rok nabycia** |
| `leave_ledger` | Księga puli: `uprawnienie`, `saldo_poczatkowe`, `korekta_ewidencji`, `zmiana_uprawnienia` — z powodem, dokumentem kadr, saldem przed i po. Wykorzystanie NIE jest wpisem księgi — wynika z `absences` (rozdział wykorzystania od korekty i uprawnienia). |
| `unit_choices` | Roczny wybór jednostki (siła wyższa / art. 188): `unit` (null = nieustalony), absencja, która go ustaliła, limit i potwierdzenie limitu przez kadry |

Saldo puli = Σ księga − Σ minut wykorzystanych; dostępne = saldo − Σ minut planowanych.

## Wyjścia prywatne i rozliczenie

| Tabela | Opis |
|---|---|
| `private_exits` | Wyjście: `work_date` zmiany, `settlement_month`, minuty wg grafiku, status (`planowane/zarejestrowane/anulowane`), `hr_status` (`nierozliczone_do_kadr` po zamknięciu), pisemny wniosek + referencja dokumentu, termin rozliczenia, notatka poufna |
| `makeups` | Odrabianie: czas, status (`oczekuje/zatwierdzone/odrzucone`), zatwierdzający, uzasadnienie pracy w dniu wolnym |
| `makeup_allocations` | Przypisanie minut odrabiania do konkretnego wyjścia (wiele do wielu) |
| `months`, `month_reports` | Status miesiąca i **wersje** zestawienia (JSON) — każda ponowna zamknięcie tworzy nową wersję |
| `alerts` | Alerty z kluczem deduplikacji `rodzaj:pracownik:miesiąc` |

Saldo wyjścia = minuty − Σ przypisań z **zatwierdzonych** odrabiań. Przypisania z oczekujących odrabiań rezerwują minuty (blokada podwójnego rozliczenia).

## Projekty i maszyny

| Tabela | Opis |
|---|---|
| `machines` | Stabilny identyfikator (`M-HARTFORD`, `M-GRIMME`), osie, sterowanie, model (do uzupełnienia) |
| `projects` | Stabilny identyfikator `PRJ-RRRR-NNNN`, zlecenie, detal, rewizja, rodzina, maszyna, termin, priorytet, folder, odpowiedzialni, obowiązujący program NC i rewizja, blokada; unikalność (zlecenie, detal, rewizja) |
| `task_types` | Typy zadań z etapem (przygotowanie/wykonanie) i wagą domyślną; rozszerzalne |
| `tasks` | Zadanie: operacja, zakres, trudność, rodzina, etap, waga, **pierwotny** i obowiązujący plan, rezultat oczekiwany i potwierdzony, termin, osoba, blokada |
| `task_plan_changes` | Historia zmian planu z powodem |
| `task_time_entries` | Czas ludzi: aktywna praca, weryfikacja i uruchomienie, poprawki, blokady i oczekiwanie, nieprzypisany; przyczyna |
| `task_explanations` | Wyjaśnienie odchylenia i wniosek administratora |
| `machine_board` | Karta maszyny (wprowadzana ręcznie) |
| `handovers` | Przekazanie zmiany |
| `requests` | Zgłoszenie pracownika do weryfikacji: rodzaj, dni, godziny, uwaga, status (nowe/przyjęte/odrzucone/wycofane), decyzja, kto i kiedy zdecydował, odnośnik do utworzonego wpisu; unikalne (konto, `client_id`) |
| `guest_projects` | Projekty widoczne dla konta gościa |
| `login_attempts` | Próby logowania (blokada po serii błędnych haseł), czyszczone po 30 dniach |
| `tech_data`, `tech_imports` | Dane technologiczne z CNC Process lub ręczne (jawnie oznaczone), znacznik `stale` dla nieaktualnej rewizji NC; historia importów z hashem pliku |

## Historia i integralność

- `audit_log`: kto, kiedy, obiekt, akcja, **opis/powód**, stara i nowa wartość (JSON) — dla każdego zapisu. Interfejs pokazuje czytelnie zmienione pola („termin: 01.11 → 15.11”), także w historii projektu wraz z jego zadaniami.
- `projects.start_date`: data rozpoczęcia — podstawa planu na dziś i opóźnienia w %.
- `users.role`: admin / supervisor / employee / **guest**.
- `idempotency_keys`: ochrona przed podwójnym zapisem (ten sam klucz → ta sama odpowiedź).
- Brak cichego usuwania: absencje, wyjścia, odrabiania są anulowane/odrzucane z powodem. Usuwać można tylko zmianę z grafiku (z powodem, gdy miesiąc otwarty i bez wyjść na tej zmianie).
- Zamknięty miesiąc blokuje zapisy w grafiku, absencjach, wyjściach i odrabianiu tego miesiąca.

## Wspólne identyfikatory z CNC Process

zlecenie (`order_no`), detal (`part_no`), rewizja detalu (`part_rev`), maszyna (`machine_id`), operacja (`operation_id`), program NC (`nc_program`), rewizja NC (`nc_rev`). Dozwolone znaki: litery, cyfry, `. _ - /`.
