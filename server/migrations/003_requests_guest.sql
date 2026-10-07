-- Migracja 3: zgłoszenia pracowników do weryfikacji, rola gościa, termin rozpoczęcia projektu, ochrona logowania.

-- Rola „guest” (gość — tylko status wskazanych projektów). SQLite nie zmienia CHECK, więc tabela jest przebudowana.
-- Klucze obce sprawdzane przy zatwierdzeniu migracji (po zmianie nazwy tabeli odwołania wskazują nową tabelę).
PRAGMA defer_foreign_keys = ON;
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','employee','guest')),
  employee_id INTEGER REFERENCES employees(id),
  can_view_confidential INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
INSERT INTO users_new(id, login, display_name, password_hash, role, employee_id, can_view_confidential, active, created_at)
  SELECT id, login, display_name, password_hash, role, employee_id, can_view_confidential, active, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Projekty widoczne dla danego gościa
CREATE TABLE guest_projects (
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  PRIMARY KEY (user_id, project_id)
);

-- Data rozpoczęcia projektu — podstawa planowanego postępu i opóźnienia
ALTER TABLE projects ADD COLUMN start_date TEXT;
UPDATE projects SET start_date = substr(created_at, 1, 10) WHERE start_date IS NULL;

-- Zgłoszenia pracowników (na serwerze firmowym). Pracownik niczego nie wpisuje bezpośrednio:
-- zgłoszenie czeka na decyzję kierownika; przyjęcie tworzy wpis z odnośnikiem do zgłoszenia.
CREATE TABLE requests (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('nieobecnosc','spoznienie','wyjscie','odrobienie','inne')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  time_from TEXT,
  time_to TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'nowe' CHECK (status IN ('nowe','przyjete','odrzucone','wycofane')),
  decision_note TEXT,
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  result_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, client_id)
);
CREATE INDEX ix_requests_status ON requests(status, created_at);
CREATE INDEX ix_requests_employee ON requests(employee_id, created_at);

-- Próby logowania (blokada po serii błędnych haseł)
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  ip TEXT,
  ok INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX ix_login_attempts ON login_attempts(login, at);
CREATE INDEX ix_login_attempts_ip ON login_attempts(ip, at);
