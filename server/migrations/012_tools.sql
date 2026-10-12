-- Narzędziownia: oprawki, głowice frezujące, płytki skrawające i frezy — parametry (JSON), stan magazynowy, maszyna (interfejs oprawki)
CREATE TABLE tools (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('oprawka','glowica','plytka','frez')),
  code TEXT,                 -- numer własny / pozycja w magazynie (np. T12)
  name TEXT NOT NULL,        -- oznaczenie, np. APMT1604PDER-M2, BT50-ER32-100
  manufacturer TEXT,
  catalog_no TEXT,
  machine_id TEXT REFERENCES machines(id),
  params TEXT NOT NULL DEFAULT '{}',
  qty INTEGER NOT NULL DEFAULT 0,
  min_qty INTEGER NOT NULL DEFAULT 0,
  location TEXT,
  note TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ix_tools_kind ON tools(kind, active);
