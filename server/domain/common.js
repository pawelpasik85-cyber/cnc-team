'use strict';
// Funkcje pomocnicze dziedziny: ustawienia, blokada zamkniętych miesięcy, przedziały zajętości.
const { conflict, notFound } = require('../core');
const T = require('../time');

function getSetting(db, key, fallback = null) {
  const r = db.get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : fallback;
}
function getSettingInt(db, key, fallback) {
  const v = getSetting(db, key, null);
  return v === null ? fallback : parseInt(v, 10);
}

function monthStatus(db, ym) {
  const r = db.get('SELECT * FROM months WHERE year_month = ?', ym);
  return r ? r.status : 'otwarty';
}
function assertMonthOpen(db, ym) {
  if (monthStatus(db, ym) === 'zamkniety') {
    throw conflict(`Miesiąc ${ym} jest zamknięty. Korekta wymaga ponownego otwarcia miesiąca z podaniem powodu.`);
  }
}

function employeeOrThrow(db, id) {
  const e = db.get('SELECT * FROM employees WHERE id = ?', id);
  if (!e) throw notFound('Nie znaleziono pracownika.');
  return e;
}

// Warunki zatrudnienia obowiązujące w danym dniu
function termsAt(db, employeeId, date) {
  return db.get(`SELECT * FROM employment_terms WHERE employee_id = ? AND valid_from <= ?
                 ORDER BY valid_from DESC LIMIT 1`, employeeId, date) || null;
}

// Przedział całych dni lokalnych → [start, end) w UTC
function dayRangeInterval(startDate, endDate) {
  return { start: T.localToUtc(startDate, '00:00'), end: T.localToUtc(T.addDays(endDate, 1), '00:00') };
}

function absenceInterval(a) {
  if (a.start_at && a.end_at) return { start: a.start_at, end: a.end_at };
  return dayRangeInterval(a.start_date, a.end_date);
}

// Zajętość pracownika poza grafikiem: nieobecności, wyjścia, odrabianie.
// Zwraca listę kolizji z przedziałem [start,end).
function occupancyConflicts(db, employeeId, start, end, exclude = {}) {
  const out = [];
  const lo = T.addDays(T.utcToLocal(start).date, -40);
  const hi = T.addDays(T.utcToLocal(end).date, 40);
  for (const a of db.all(`SELECT a.*, c.name AS cat FROM absences a JOIN absence_categories c ON c.id = a.category_id
       WHERE a.employee_id = ? AND a.status != 'anulowana' AND a.end_date >= ? AND a.start_date <= ?`, employeeId, lo, hi)) {
    if (exclude.absence === a.id) continue;
    const iv = absenceInterval(a);
    if (T.overlapMin(start, end, iv.start, iv.end) > 0) out.push({ type: 'nieobecność', id: a.id, label: `${a.cat} ${a.start_date}–${a.end_date}` });
  }
  for (const x of db.all(`SELECT * FROM private_exits WHERE employee_id = ? AND status != 'anulowane' AND start_at < ? AND end_at > ?`, employeeId, end, start)) {
    if (exclude.exit === x.id) continue;
    out.push({ type: 'wyjście prywatne', id: x.id, label: `wyjście ${T.utcToLocal(x.start_at).date} ${T.utcToLocal(x.start_at).time}–${T.utcToLocal(x.end_at).time}` });
  }
  for (const m of db.all(`SELECT * FROM makeups WHERE employee_id = ? AND status != 'odrzucone' AND start_at < ? AND end_at > ?`, employeeId, end, start)) {
    if (exclude.makeup === m.id) continue;
    out.push({ type: 'odrabianie', id: m.id, label: `odrabianie ${T.utcToLocal(m.start_at).date} ${T.utcToLocal(m.start_at).time}–${T.utcToLocal(m.end_at).time}` });
  }
  return out;
}

function scheduleIn(db, employeeId, start, end) {
  return db.all(`SELECT * FROM schedule_entries WHERE employee_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`, employeeId, end, start);
}

// Minuty pracy wg grafiku w przedziale (z odjęciem przerwy proporcjonalnie — przerwa wliczona do czasu pracy
// nie jest odejmowana; break_min dotyczy przerw niewliczanych i jest odejmowany tylko od całej zmiany).
function scheduledOverlapMin(db, employeeId, start, end) {
  let sum = 0;
  for (const s of scheduleIn(db, employeeId, start, end)) {
    const ov = T.overlapMin(start, end, s.start_at, s.end_at);
    const full = T.minutesBetween(s.start_at, s.end_at);
    sum += ov >= full ? s.planned_min : Math.min(ov, s.planned_min);
  }
  return sum;
}

const fmt = T.fmtHM;

module.exports = {
  getSetting, getSettingInt, monthStatus, assertMonthOpen, employeeOrThrow, termsAt, dayRangeInterval,
  absenceInterval, occupancyConflicts, scheduleIn, scheduledOverlapMin, fmt,
};
