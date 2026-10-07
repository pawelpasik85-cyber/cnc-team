-- Migracja 7: plan pracy — polecenia kierownika dla programistów na dzień / zmianę.
CREATE TABLE work_orders (
  id INTEGER PRIMARY KEY,
  work_date TEXT NOT NULL,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  seq INTEGER NOT NULL,                       -- kolejność wykonania
  title TEXT NOT NULL,
  details TEXT,
  project_id TEXT REFERENCES projects(id),
  task_id INTEGER REFERENCES tasks(id),
  machine_id TEXT REFERENCES machines(id),
  planned_min INTEGER,
  status TEXT NOT NULL DEFAULT 'zaplanowane' CHECK (status IN ('zaplanowane','wykonane','czesciowo','niewykonane','anulowane')),
  result_note TEXT,
  ack_at TEXT,                                -- potwierdzenie przeczytania przez programistę
  closed_by INTEGER REFERENCES users(id),
  closed_at TEXT,
  carried_from INTEGER REFERENCES work_orders(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_work_orders_day ON work_orders(work_date, employee_id, seq);
