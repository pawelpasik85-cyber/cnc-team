-- Migracja 2 (lokalna): połączenie z chmurą — aplikacja pracowników.

-- Adres e-mail pracownika do zaproszenia do aplikacji (konto firmowe lub prywatne — decyzja pracownika i firmy).
ALTER TABLE employees ADD COLUMN email TEXT;

-- Sesja kierownika w chmurze (tokeny). Nie jest pokazywana w ustawieniach ani eksportowana.
CREATE TABLE cloud_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Lokalna kopia zgłoszeń z chmury (do pracy bez połączenia i historii decyzji).
CREATE TABLE cloud_reports (
  id TEXT PRIMARY KEY,
  employee_ref INTEGER NOT NULL,
  kind TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  time_from TEXT,
  time_to TEXT,
  note TEXT,
  status TEXT NOT NULL,
  decision_note TEXT,
  cnc_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  local_error TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX ix_cloud_reports_status ON cloud_reports(status, created_at);

CREATE TABLE cloud_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  ok INTEGER NOT NULL,
  message TEXT
);
