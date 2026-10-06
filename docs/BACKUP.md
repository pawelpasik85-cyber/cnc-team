# Kopia zapasowa i odtworzenie

Wszystkie dane są w jednym pliku SQLite: `data/cnc-team.db` (lub ścieżka z `CNC_DB`). W trybie WAL obok mogą istnieć pliki `-wal` i `-shm` — **nie kopiuj samego pliku `.db` przy działającej aplikacji**. Używaj polecenia poniżej.

## Wykonanie kopii

```bash
npm run backup                         # → data/backup/cnc-team-RRRRMMDD-GGMMSS.db (znacznik czasu UTC)
npm run backup -- "D:\Kopie\CNC Team"  # → wskazany katalog (np. dysk sieciowy)
```

Skrypt używa `VACUUM INTO` (spójna kopia także przy działającej aplikacji) i od razu sprawdza kopię (`PRAGMA integrity_check`, liczba migracji).

Zalecenie: kopia codzienna (Harmonogram zadań Windows: akcja `npm run backup -- "D:\Kopie\CNC Team"`, katalog roboczy = folder aplikacji) oraz przed każdą aktualizacją aplikacji. Przechowuj kilka ostatnich kopii poza komputerem z aplikacją. Kopia zawiera dane osobowe i poufne — przechowuj ją w miejscu z ograniczonym dostępem.

## Odtworzenie

1. Zatrzymaj aplikację (Ctrl+C w oknie `npm start`).
2. Przenieś bieżące pliki `data/cnc-team.db`, `data/cnc-team.db-wal`, `data/cnc-team.db-shm` do osobnego katalogu (nie usuwaj).
3. Skopiuj wybraną kopię jako `data/cnc-team.db`.
4. Uruchom `npm start`. Migracje nowsze niż kopia zostaną zastosowane automatycznie; alerty przeliczą się przy starcie.
5. Zaloguj się i sprawdź ostatnie wpisy (Ustawienia → Historia zmian).

## Test odtworzenia

Raz na kwartał: odtwórz kopię na innym komputerze lub w innym katalogu (`CNC_DB=ścieżka-do-kopii npm start`, inny `PORT`) i sprawdź logowanie oraz ostatnie zamknięty miesiąc.
