-- Migracja 5: analiza zakończonych projektów i zapisane raporty kierownika.

-- Propozycje „podobnych projektów” odrzucone przez kierownika (nie są brane do porównań i średnich).
CREATE TABLE project_comparison_rejections (
  project_id TEXT NOT NULL REFERENCES projects(id),
  other_project_id TEXT NOT NULL REFERENCES projects(id),
  reason TEXT,
  rejected_by INTEGER NOT NULL REFERENCES users(id),
  rejected_at TEXT NOT NULL,
  PRIMARY KEY (project_id, other_project_id)
);

-- Raporty zapisane przez kierownika (migawka danych z chwili zapisu). Udostępnienie przełożonemu — decyzja kierownika.
CREATE TABLE saved_reports (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('projekt','miesiac','rok')),
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  data TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_saved_reports ON saved_reports(created_at);
