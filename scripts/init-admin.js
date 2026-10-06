'use strict';
// Tworzy pierwsze konto administratora w pustej bazie produkcyjnej.
// Użycie: CNC_ADMIN_LOGIN=kierownik CNC_ADMIN_PASSWORD='…' npm run init-admin
const { boot } = require('../server/index');
const { hashPassword } = require('../server/core');

const { db } = boot();
const login = process.env.CNC_ADMIN_LOGIN || 'kierownik';
const pw = process.env.CNC_ADMIN_PASSWORD;
if (!pw || pw.length < 10) {
  console.error('Ustaw zmienną CNC_ADMIN_PASSWORD (min. 10 znaków). Hasło nie jest zapisywane w kodzie.');
  process.exit(1);
}
if (db.get('SELECT 1 FROM users WHERE login=?', login)) { console.error('Konto już istnieje.'); process.exit(1); }
db.run(`INSERT INTO users(login,display_name,password_hash,role,can_view_confidential,active,created_at) VALUES (?,?,?,'admin',1,1,?)`,
  login, 'Kierownik', hashPassword(pw), new Date().toISOString());
console.log(`Utworzono administratora „${login}”.`);
