'use strict';
// Wspólne przygotowanie świata testowego: świeża baza, administrator, pracownicy, grafik.
const { openDb } = require('../server/db');
const { ensureReference } = require('../server/reference');
const { hashPassword } = require('../server/core');
const People = require('../server/domain/people');

function makeWorld({ file = ':memory:', today = '2026-10-06' } = {}) {
  process.env.CNC_TODAY = today;
  const db = openDb(file);
  ensureReference(db);
  for (const y of [2025, 2026, 2027]) People.ensureHolidays(db, y);
  db.run(`INSERT INTO users(login,display_name,password_hash,role,can_view_confidential,active,created_at) VALUES ('admin','Admin',?,'admin',1,1,?)`, hashPassword('haslo-testowe-1'), new Date().toISOString());
  const admin = db.get(`SELECT * FROM users WHERE login='admin'`);
  const emp = (first, fte = [1, 1], daily = 480) => {
    const id = People.saveEmployee(db, admin, { first_name: first, last_name: 'Testowy', color: '#336699', employment_start: '2020-01-01' });
    People.addTerms(db, admin, id, { valid_from: '2020-01-01', fte_num: fte[0], fte_den: fte[1], daily_norm_min: daily, weekly_norm_min: daily * 5, leave_day_min: daily });
    return id;
  };
  const tpl = Object.fromEntries(db.all('SELECT id, short FROM shift_templates').map(t => [t.short, t.id]));
  const cat = Object.fromEntries(db.all('SELECT id, code FROM absence_categories').map(c => [c.code, c.id]));
  const shifts = (employeeId, from, to, short = 'I', extra = {}) => People.generateSchedule(db, admin, { employee_id: employeeId, shift_template_id: tpl[short], from, to, ...extra });
  const shift = (employeeId, date, short = 'I', extra = {}) => People.addScheduleEntry(db, admin, { employee_id: employeeId, work_date: date, shift_template_id: tpl[short], ...extra });
  return { db, admin, emp, tpl, cat, shifts, shift };
}

// Oczekiwanie błędu HTTP o danym statusie (opcjonalnie z fragmentem komunikatu).
function throwsStatus(assert, fn, status, re) {
  assert.throws(fn, (e) => {
    assert.equal(e.status, status, `oczekiwano ${status}, otrzymano ${e.status}: ${e.message}`);
    if (re) assert.match(e.message, re);
    return true;
  });
}

module.exports = { makeWorld, throwsStatus };
