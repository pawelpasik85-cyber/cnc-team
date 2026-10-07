'use strict';
// Warstwa bazy danych: SQLite (wbudowany moduł node:sqlite), migracje i transakcje.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return wrap(db);
}

function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map(r => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  const pending = files.filter(f => !done.has(f));
  if (!pending.length) return;
  // Migracje mogą przebudowywać tabele (DROP/RENAME) — klucze obce wyłączone na czas migracji
  // (PRAGMA nie działa wewnątrz transakcji), a po nich pełna kontrola spójności.
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const f of pending) applyMigration(db, f);
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) throw new Error(`Migracje naruszyły klucze obce: ${JSON.stringify(broken.slice(0, 5))}`);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function applyMigration(db, f) {
  {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)').run(f, new Date().toISOString());
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migracja ${f} nie powiodła się: ${e.message}`);
    }
  }
}

// Cienka nakładka: get/all/run oraz zagnieżdżalna transakcja.
function wrap(raw) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) { s = raw.prepare(sql); cache.set(sql, s); }
    return s;
  };
  let depth = 0;
  const db = {
    raw,
    get: (sql, ...p) => stmt(sql).get(...p),
    all: (sql, ...p) => stmt(sql).all(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    exec: (sql) => raw.exec(sql),
    tx(fn) {
      if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
      raw.exec('BEGIN IMMEDIATE');
      depth = 1;
      try {
        const r = fn();
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally { depth = 0; }
    },
    close: () => raw.close(),
  };
  return db;
}

module.exports = { openDb };
