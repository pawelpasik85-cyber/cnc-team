'use strict';
// Fikcyjne dane demonstracyjne. Uruchamiać na PUSTEJ bazie: npm run seed  (lub: npm run seed -- --reset)
// Wszystkie osoby, zlecenia i detale są fikcyjne. Hasło demo jest jawne celowo i służy wyłącznie do demonstracji.
const fs = require('node:fs');
const path = require('node:path');

const DB_FILE = process.env.CNC_DB || path.join(__dirname, '..', 'data', 'cnc-team.db');
if (process.argv.includes('--reset')) for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
process.env.CNC_TODAY = process.env.CNC_TODAY || '2026-10-06';

const { boot } = require('../server/index');
const { seedDemo } = require('./seed-lib');
const { db } = boot(DB_FILE);
if (db.get('SELECT COUNT(*) n FROM users').n) { console.error('Baza zawiera już konta. Użyj --reset, aby utworzyć bazę demonstracyjną od nowa.'); process.exit(1); }
seedDemo(db);
console.log('Dane demonstracyjne gotowe. Konta: kierownik, przelozony, adam, bartosz, celina, gosc — hasło: demo-cnc-2026');
