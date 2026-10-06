'use strict';
// Kopia zapasowa spójna transakcyjnie (VACUUM INTO) — można wykonywać przy działającej aplikacji.
// Użycie: npm run backup            → data/backup/cnc-team-RRRRMMDD-GGMMSS.db
//         npm run backup -- D:\kopie → wskazany katalog
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = process.env.CNC_DB || path.join(__dirname, '..', 'data', 'cnc-team.db');
const dir = process.argv[2] || path.join(path.dirname(DB_FILE), 'backup');
if (!fs.existsSync(DB_FILE)) { console.error(`Brak bazy: ${DB_FILE}`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = path.join(dir, `cnc-team-${stamp}.db`);
const db = new DatabaseSync(DB_FILE);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
const check = new DatabaseSync(target);
const ok = check.prepare('PRAGMA integrity_check').get();
const n = check.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n;
check.close();
console.log(`Kopia: ${target}  (integrity_check: ${Object.values(ok)[0]}, migracje: ${n})`);
