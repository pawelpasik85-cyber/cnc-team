-- Migracja 4: wersja firmowa działa wyłącznie na serwerze firmowym — bez chmury.
-- Usunięcie tabel po wcześniejszej integracji z aplikacją w chmurze (sesja, kopie zgłoszeń, dziennik).
DROP TABLE IF EXISTS cloud_auth;
DROP INDEX IF EXISTS ix_cloud_reports_status;
DROP TABLE IF EXISTS cloud_reports;
DROP TABLE IF EXISTS cloud_log;
