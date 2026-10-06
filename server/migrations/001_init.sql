-- CNC Team — schemat początkowy.
-- Konwencje: czas trwania w minutach (INTEGER), chwile w UTC (ISO 8601, kolumny *_at),
-- daty kalendarzowe Europe/Warsaw jako 'YYYY-MM-DD' (kolumny *_date), miesiące 'YYYY-MM'.

PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  color TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  employment_start TEXT NOT NULL,
  employment_end TEXT,
  competences TEXT NOT NULL DEFAULT '[]',      -- JSON: lista kompetencji
  machine_ids TEXT NOT NULL DEFAULT '[]',      -- JSON: obsługiwane maszyny
  initial_settlement_note TEXT,               -- dane początkowe rozliczeń (opis)
  initial_settlement_approved_at TEXT,
  initial_settlement_approved_by INTEGER,
  hr_reference TEXT,                           -- poufne: referencja kadrowa
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','employee')),
  employee_id INTEGER REFERENCES employees(id),
  can_view_confidential INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Etat i normy z datą obowiązywania
CREATE TABLE employment_terms (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  valid_from TEXT NOT NULL,
  fte_num INTEGER NOT NULL,          -- licznik wymiaru etatu, np. 1
  fte_den INTEGER NOT NULL,          -- mianownik, np. 1 (1/2 → 1 i 2)
  daily_norm_min INTEGER NOT NULL,   -- dobowa norma czasu pracy (np. 480)
  weekly_norm_min INTEGER NOT NULL,  -- tygodniowa norma (np. 2400)
  leave_day_min INTEGER NOT NULL,    -- przelicznik prezentacji urlopu: 1 dzień = X minut
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (employee_id, valid_from)
);

CREATE TABLE machines (
  id TEXT PRIMARY KEY,               -- stabilny identyfikator, np. M-HARTFORD
  name TEXT NOT NULL,
  axes INTEGER NOT NULL,
  control TEXT NOT NULL,
  model TEXT,                        -- dokładny model — do uzupełnienia
  notes TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE shift_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  start_time TEXT NOT NULL,          -- 'HH:MM' czasu lokalnego
  end_time TEXT NOT NULL,
  break_min INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Grafik: zmiana należy do dnia (i miesiąca) rozpoczęcia — work_date.
CREATE TABLE schedule_entries (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  break_min INTEGER NOT NULL DEFAULT 0,
  planned_min INTEGER NOT NULL,
  shift_template_id INTEGER REFERENCES shift_templates(id),
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ix_sched_emp_date ON schedule_entries(employee_id, work_date);

CREATE TABLE holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ustawowe','firmowe'))
);

-- Ewidencja obecności i nadgodzin wprowadzana ręcznie (brak automatycznego odczytu)
CREATE TABLE attendance_records (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('obecnosc','nadgodziny')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

-- Katalog nieobecności — rozszerzalny bez zmiany kodu
CREATE TABLE absence_categories (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subtype TEXT,
  parent_code TEXT,
  short TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'absence',
  unit TEXT NOT NULL CHECK (unit IN ('dni','godziny','dni_lub_godziny','minuty')),
  pool_kind TEXT CHECK (pool_kind IN ('wypoczynkowy','sila_wyzsza','opieka_188')),
  limit_rule TEXT,                   -- opis zasady limitu
  limit_value TEXT,                  -- JSON z wartościami liczbowymi (jeśli kodowane)
  rule_valid_from TEXT,
  rule_valid_to TEXT,
  carryover_rule TEXT,
  affects_schedule TEXT NOT NULL DEFAULT 'zastepuje_grafik',
  creates_makeup_debt INTEGER NOT NULL DEFAULT 0,
  requires_confirmation TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('pelna','podstawowa','poufna')),
  public_label TEXT NOT NULL,        -- etykieta widoczna dla pracowników
  legal_basis TEXT,
  verified_at TEXT,
  verification_status TEXT NOT NULL DEFAULT 'do_potwierdzenia_przez_kadry',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Pule urlopu wypoczynkowego wg roku nabycia
CREATE TABLE leave_pools (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  acquisition_year INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (employee_id, acquisition_year)
);

-- Księga puli: uprawnienie, saldo początkowe, korekta ewidencji (wykorzystanie wynika z absences)
CREATE TABLE leave_ledger (
  id INTEGER PRIMARY KEY,
  pool_id INTEGER NOT NULL REFERENCES leave_pools(id),
  kind TEXT NOT NULL CHECK (kind IN ('uprawnienie','saldo_poczatkowe','korekta_ewidencji','zmiana_uprawnienia')),
  minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  hr_document_ref TEXT,
  balance_before_min INTEGER NOT NULL,
  balance_after_min INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE absences (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  category_id INTEGER NOT NULL REFERENCES absence_categories(id),
  status TEXT NOT NULL CHECK (status IN ('planowana','wykorzystana','anulowana')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_at TEXT,                     -- dla wpisów godzinowych
  end_at TEXT,
  unit TEXT CHECK (unit IN ('dni','godziny')),
  minutes INTEGER NOT NULL,          -- minuty wg grafiku (migawka w chwili zapisu)
  days INTEGER NOT NULL,             -- dni grafikowe w zakresie
  pool_id INTEGER REFERENCES leave_pools(id),
  employee_request INTEGER NOT NULL DEFAULT 0,  -- czy jest wniosek pracownika
  document_ref TEXT,                 -- poufne
  confidential_note TEXT,            -- poufne (bez diagnoz!)
  cancel_reason TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_abs_emp ON absences(employee_id, start_date);

-- Roczny wybór jednostki: siła wyższa / opieka art. 188
CREATE TABLE unit_choices (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  year INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sila_wyzsza','opieka_188')),
  unit TEXT CHECK (unit IN ('dni','godziny')),
  set_by_absence_id INTEGER REFERENCES absences(id),
  set_at TEXT,
  limit_days INTEGER,
  limit_min INTEGER,
  limit_confirmed INTEGER NOT NULL DEFAULT 0,  -- czy limit potwierdzony przez kadry
  limit_note TEXT,
  UNIQUE (employee_id, year, kind)
);

CREATE TABLE private_exits (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  settlement_month TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planowane','zarejestrowane','anulowane')),
  hr_status TEXT CHECK (hr_status IN ('nierozliczone_do_kadr')),
  written_request INTEGER NOT NULL DEFAULT 0,
  document_ref TEXT,
  settle_by_date TEXT NOT NULL,
  confidential_note TEXT,
  cancel_reason TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE makeups (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  settlement_month TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('oczekuje','zatwierdzone','odrzucone')),
  approved_by INTEGER,
  approved_at TEXT,
  day_off_override_reason TEXT,
  note TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE makeup_allocations (
  id INTEGER PRIMARY KEY,
  makeup_id INTEGER NOT NULL REFERENCES makeups(id),
  exit_id INTEGER NOT NULL REFERENCES private_exits(id),
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  created_at TEXT NOT NULL,
  UNIQUE (makeup_id, exit_id)
);

CREATE TABLE months (
  year_month TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('otwarty','zamkniety')),
  version INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  closed_by INTEGER,
  reopen_reason TEXT
);

CREATE TABLE month_reports (
  id INTEGER PRIMARY KEY,
  year_month TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  reason TEXT,
  report_json TEXT NOT NULL,
  UNIQUE (year_month, version)
);

CREATE TABLE alerts (
  id INTEGER PRIMARY KEY,
  dedup_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  year_month TEXT,
  trigger_date TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  resolved_at TEXT
);

-- Projekty i zadania
CREATE TABLE projects (
  id TEXT PRIMARY KEY,               -- stabilny identyfikator, np. PRJ-2026-0001
  order_no TEXT NOT NULL,
  part_no TEXT NOT NULL,
  part_rev TEXT NOT NULL,
  part_family TEXT,
  machine_id TEXT REFERENCES machines(id),
  due_date TEXT,
  priority INTEGER NOT NULL DEFAULT 3,  -- 1 najwyższy
  folder_link TEXT,
  responsible_ids TEXT NOT NULL DEFAULT '[]',
  nc_program TEXT,                   -- obowiązujący program NC
  nc_rev TEXT,                       -- obowiązująca rewizja NC
  status TEXT NOT NULL DEFAULT 'aktywny' CHECK (status IN ('aktywny','wstrzymany','zakonczony','anulowany')),
  blocked INTEGER NOT NULL DEFAULT 0,
  block_reason TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (order_no, part_no, part_rev)
);

CREATE TABLE task_types (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('przygotowanie','wykonanie')),
  default_weight INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  type_id INTEGER NOT NULL REFERENCES task_types(id),
  operation_id TEXT,                 -- stabilny identyfikator operacji (wspólny z CNC Process)
  title TEXT NOT NULL,
  scope TEXT,
  difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  part_family TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('przygotowanie','wykonanie')),
  weight INTEGER NOT NULL CHECK (weight > 0),
  original_planned_min INTEGER,      -- pierwotny plan aktywnego czasu (niezmienny)
  planned_min INTEGER,               -- obowiązujący plan
  expected_result TEXT,
  due_date TEXT,
  assignee_id INTEGER REFERENCES employees(id),
  status TEXT NOT NULL CHECK (status IN ('nowe','w_toku','zablokowane','zakonczone','anulowane')),
  block_reason TEXT,
  result_confirmation TEXT,
  completed_at TEXT,
  confirmed_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_plan_changes (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  old_planned_min INTEGER,
  new_planned_min INTEGER,
  reason TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  changed_at TEXT NOT NULL
);

CREATE TABLE task_time_entries (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  work_date TEXT NOT NULL,
  active_min INTEGER NOT NULL DEFAULT 0,
  verify_min INTEGER NOT NULL DEFAULT 0,
  rework_min INTEGER NOT NULL DEFAULT 0,
  blocked_min INTEGER NOT NULL DEFAULT 0,
  unassigned_min INTEGER NOT NULL DEFAULT 0,
  cause TEXT CHECK (cause IN ('brak_dokumentacji','zmiana_zakresu','narzedzia','maszyna','decyzja_zewnetrzna','blad_programowania','inne')),
  note TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE task_explanations (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  explanation TEXT NOT NULL,
  conclusion TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE machine_board (
  machine_id TEXT PRIMARY KEY REFERENCES machines(id),
  project_id TEXT REFERENCES projects(id),
  stage TEXT,
  assignee_id INTEGER REFERENCES employees(id),
  next_task_id INTEGER REFERENCES tasks(id),
  next_program_status TEXT NOT NULL DEFAULT 'brak' CHECK (next_program_status IN ('brak','w_przygotowaniu','gotowy','zweryfikowany')),
  expected_end_at TEXT,
  expected_end_source TEXT,
  block_reason TEXT,
  updated_by INTEGER,
  updated_at TEXT
);

CREATE TABLE handovers (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  machine_id TEXT REFERENCES machines(id),
  from_employee_id INTEGER REFERENCES employees(id),
  to_employee_id INTEGER REFERENCES employees(id),
  shift_date TEXT NOT NULL,
  done_text TEXT NOT NULL,
  remaining_text TEXT NOT NULL,
  nc_program TEXT,
  nc_rev TEXT,
  stopped_at_text TEXT,
  tooling_notes TEXT,
  checklist TEXT NOT NULL DEFAULT '[]',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Dane technologiczne (źródło: CNC Process lub wpis ręczny)
CREATE TABLE tech_data (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  operation_id TEXT NOT NULL,
  nc_program TEXT NOT NULL,
  nc_rev TEXT NOT NULL,
  nx_time_min INTEGER,
  machine_est_min INTEGER,
  machine_actual_min INTEGER,
  source TEXT NOT NULL CHECK (source IN ('reczne','cnc_process')),
  source_updated_at TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  import_id INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, operation_id, nc_program, nc_rev, source)
);

CREATE TABLE tech_imports (
  id INTEGER PRIMARY KEY,
  file_hash TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  format_version TEXT NOT NULL,
  imported_by INTEGER NOT NULL,
  imported_at TEXT NOT NULL,
  summary TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER,
  entity TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX ix_audit_entity ON audit_log(entity, entity_id);

CREATE TABLE idempotency_keys (
  key TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  status INTEGER NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);
