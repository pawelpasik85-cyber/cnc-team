-- Powroty do zakończonego projektu (rundy poprawek): czas przed poprawkami, czas, który doszedł, i same poprawki
CREATE TABLE project_returns (
  id INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  round INTEGER NOT NULL,
  opened_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  cause TEXT,
  closed_date TEXT,
  close_note TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  closed_by INTEGER,
  closed_at TEXT,
  UNIQUE (project_id, round)
);
CREATE INDEX idx_project_returns_project ON project_returns(project_id);
ALTER TABLE tasks ADD COLUMN return_id INTEGER REFERENCES project_returns(id);
