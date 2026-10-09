-- Zestawienia do druku / wysyłki: kilka tematów (projekty, zapisane raporty) z notatką kierownika — m.in. przyczyną opóźnienia
CREATE TABLE report_bundles (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  intro TEXT,
  items TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ kind, ref, cause, note, snapshot }]
  shared INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
