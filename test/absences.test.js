'use strict';
// Urlop wypoczynkowy, korekty, siła wyższa i art. 188 (wybór jednostki), niezależne pule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const Abs = require('../server/domain/absences');

function setup(today = '2026-10-06') {
  const w = makeWorld({ today });
  const e = w.emp('Jan'); w.shifts(e, '2026-09-01', '2026-12-31');
  return { ...w, e };
}

test('urlop po 30 września: ostrzeżenie bez zerowania salda i bez kasowania uprawnienia', () => {
  const w = setup('2026-10-06');
  const p25 = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2025, entitlement_min: 960, reason: 'saldo z kadr', opening: true });
  Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2026, entitlement_min: 26 * 480, reason: 'wymiar z kadr' });
  const pools = Abs.listPools(w.db, w.e);
  const old = pools.find(p => p.id === p25);
  assert.equal(old.balance_min, 960, 'saldo nie jest zerowane');
  assert.equal(old.overdue.level, 'ostrzezenie');
  assert.match(old.overdue.text, /nie jest podstawą utraty/);
  assert.equal(w.db.get('SELECT COUNT(*) n FROM leave_ledger WHERE pool_id=?', p25).n, 1, 'brak automatycznych wpisów kasujących');
  // przed terminem — przypomnienie
  assert.equal(Abs.overdueStatus(2025, 960, '2026-09-01').level, 'przypomnienie');
  assert.equal(Abs.overdueStatus(2025, 0, '2026-10-06'), null);
});

test('wykorzystanie wg grafiku w godzinach, domyślnie najstarsza pula, urlop na żądanie z puli wypoczynkowej', () => {
  const w = setup();
  const p25 = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2025, entitlement_min: 960, reason: 'kadry', opening: true });
  const p26 = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2026, entitlement_min: 26 * 480, reason: 'kadry' });
  const a = Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.URLOP_WYP, status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-06' });
  const row = w.db.get('SELECT * FROM absences WHERE id=?', a.id);
  assert.equal(row.pool_id, p25); assert.equal(row.minutes, 960); assert.equal(row.days, 2);
  const onDemand = Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.URLOP_NA_ZADANIE, status: 'wykorzystana', start_date: '2026-10-07' });
  assert.equal(w.db.get('SELECT pool_id FROM absences WHERE id=?', onDemand.id).pool_id, p26, 'po wyczerpaniu najstarszej — kolejna pula');
  assert.equal(Abs.poolBalance(w.db, p26).balance_min, 26 * 480 - 480);
  // jawny wybór puli z niewystarczającym saldem
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.URLOP_WYP, status: 'planowana', start_date: '2026-10-12', pool_id: p25 }), 409, /Niewystarczające saldo/);
  // weekend bez grafiku nie zużywa urlopu
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.URLOP_WYP, status: 'planowana', start_date: '2026-10-10', end_date: '2026-10-11' }), 409, /Brak zmian/);
});

test('ręczna korekta puli: obowiązkowy powód, saldo przed i po, historia', () => {
  const w = setup();
  const p = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2026, entitlement_min: 12480, reason: 'kadry' });
  throwsStatus(assert, () => Abs.adjustPool(w.db, w.admin, p, { minutes: -480 }), 400, /Powód/);
  assert.deepEqual(Abs.previewAdjust(w.db, p, -480), { balance_before_min: 12480, balance_after_min: 12000 });
  const r = Abs.adjustPool(w.db, w.admin, p, { minutes: -480, reason: 'Korekta ewidencji wg kadr', hr_document_ref: 'KADRY/1' });
  assert.equal(r.balance_before_min, 12480); assert.equal(r.balance_after_min, 12000);
  Abs.adjustPool(w.db, w.admin, p, { kind: 'zmiana_uprawnienia', minutes: 480, reason: 'Zmiana stażu' });
  const ledger = w.db.all('SELECT kind, minutes, balance_before_min, balance_after_min, reason FROM leave_ledger WHERE pool_id=? ORDER BY id', p);
  assert.deepEqual(ledger.map(l => l.kind), ['uprawnienie', 'korekta_ewidencji', 'zmiana_uprawnienia']);
  assert.equal(ledger[2].balance_after_min, 12480);
  const audits = w.db.all(`SELECT action, reason FROM audit_log WHERE entity='leave_pool' AND entity_id=?`, String(p));
  assert.ok(audits.some(a => a.action === 'korekta_ewidencji' && a.reason === 'Korekta ewidencji wg kadr'));
});

test('siła wyższa: dni albo godziny, blokada mieszania i limit 2 dni / 16 h', () => {
  const w = setup();
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-01', '2026-10-30');
  // pracownik 1: dni
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'wykorzystana', start_date: '2026-10-05' });
  assert.equal(Abs.unitChoice(w.db, w.e, 2026, 'sila_wyzsza').unit, 'dni');
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'planowana', start_date: '2026-10-06', start_time: '06:00', end_time: '08:00' }), 409, /Mieszanie/);
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'wykorzystana', start_date: '2026-10-06' });
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'planowana', start_date: '2026-10-07' }), 409, /limit/);
  // pracownik 2: godziny — jedna pula 16 h
  Abs.createAbsence(w.db, w.admin, { employee_id: e2, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'wykorzystana', start_date: '2026-10-05', start_time: '06:00', end_time: '14:00' });
  Abs.createAbsence(w.db, w.admin, { employee_id: e2, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'wykorzystana', start_date: '2026-10-06', start_time: '06:00', end_time: '14:00' });
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: e2, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'planowana', start_date: '2026-10-07', start_time: '06:00', end_time: '07:00' }), 409, /limit/);
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: e2, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'planowana', start_date: '2026-10-08' }), 409, /Mieszanie/);
  // korekta pomyłki: odrzucona, gdy istnieją wpisy w innej jednostce
  throwsStatus(assert, () => Abs.correctUnitChoice(w.db, w.admin, { employee_id: e2, year: 2026, kind: 'sila_wyzsza', unit: 'dni', reason: 'pomyłka' }), 409);
  throwsStatus(assert, () => Abs.correctUnitChoice(w.db, w.admin, { employee_id: e2, year: 2026, kind: 'sila_wyzsza', unit: 'dni' }), 400, /Powód/);
});

test('anulowanie pierwszego planowanego wpisu nie blokuje wyboru jednostki', () => {
  const w = setup();
  const planned = Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'planowana', start_date: '2026-10-05' });
  assert.equal(Abs.unitChoice(w.db, w.e, 2026, 'sila_wyzsza').unit, null, 'plan nie ustala jednostki');
  Abs.updateAbsence(w.db, w.admin, planned.id, { status: 'anulowana', reason: 'pracownik zrezygnował' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'wykorzystana', start_date: '2026-10-06', start_time: '10:00', end_time: '12:00' });
  const ch = Abs.unitChoice(w.db, w.e, 2026, 'sila_wyzsza');
  assert.equal(ch.unit, 'godziny'); assert.equal(ch.used_min, 120);
  // anulowanie wymaga powodu; anulowany wpis zostaje w historii
  const row = w.db.get('SELECT status, cancel_reason FROM absences WHERE id=?', planned.id);
  assert.deepEqual({ ...row }, { status: 'anulowana', cancel_reason: 'pracownik zrezygnował' });
});

test('nowy rok: nowy wybór jednostki i nowy limit, bez przenoszenia', () => {
  const w = setup();
  w.shifts(w.e, '2027-01-04', '2027-01-29');
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'wykorzystana', start_date: '2026-10-05' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'wykorzystana', start_date: '2027-01-05', start_time: '06:00', end_time: '14:00' });
  const c27 = Abs.unitChoice(w.db, w.e, 2027, 'sila_wyzsza');
  assert.equal(c27.unit, 'godziny'); assert.equal(c27.limit_min, 960); assert.equal(c27.used_min, 480);
  assert.equal(Abs.unitChoice(w.db, w.e, 2026, 'sila_wyzsza').unit, 'dni');
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'planowana', start_date: '2026-12-21', end_date: '2027-01-04' }), 400, /dwóch lat/);
});

test('niezależne pule: siła wyższa, art. 188 i urlop wypoczynkowy wg roku nabycia', () => {
  const w = setup();
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.SILA_WYZSZA, unit: 'dni', status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-06' });
  // art. 188 ma własny wybór (godziny) i własny limit
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.OPIEKA_188, unit: 'godziny', status: 'wykorzystana', start_date: '2026-10-07', start_time: '06:00', end_time: '14:00' });
  assert.equal(Abs.unitChoice(w.db, w.e, 2026, 'opieka_188').unit, 'godziny');
  assert.equal(Abs.unitChoice(w.db, w.e, 2026, 'sila_wyzsza').used_days, 2);
  const p25 = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2025, entitlement_min: 480, reason: 'kadry' });
  const p26 = Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2026, entitlement_min: 960, reason: 'kadry' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.URLOP_WYP, status: 'wykorzystana', start_date: '2026-10-08', pool_id: p26 });
  assert.equal(Abs.poolBalance(w.db, p25).balance_min, 480, 'wskazanie innej puli nie zmienia najstarszej');
  assert.equal(Abs.poolBalance(w.db, p26).balance_min, 480);
  // siła wyższa i opieka nie tworzą długu do odrobienia
  assert.equal(w.db.get('SELECT COUNT(*) n FROM private_exits').n, 0);
});

test('niepełny etat: proporcjonalny limit godzinowy oznaczony do potwierdzenia przez kadry', () => {
  const w = makeWorld();
  const e = w.emp('Ala', [1, 2], 240); w.shifts(e, '2026-10-01', '2026-10-30', 'I', { start_time: '06:00', end_time: '10:00' });
  const ch = Abs.unitChoice(w.db, e, 2026, 'sila_wyzsza');
  assert.equal(ch.limit_min, 480); assert.equal(ch.limit_confirmed, false); assert.match(ch.limit_note, /kadry/);
  const r = Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'planowana', start_date: '2026-10-05', start_time: '06:00', end_time: '08:00' });
  assert.ok(r.warnings.some(x => /kadry/.test(x)));
  Abs.setUnitLimit(w.db, w.admin, { employee_id: e, year: 2026, kind: 'sila_wyzsza', limit_min: 480, limit_days: 2, reason: 'Potwierdzone przez kadry pismem 1/2026' });
  assert.equal(Abs.unitChoice(w.db, e, 2026, 'sila_wyzsza').limit_confirmed, true);
});

test('zestawienie urlopów: wykorzystano / zostało (z zaległym), urlop na żądanie, inne nieobecności; poufne kategorie ukryte', async () => {
  const w = setup('2026-10-06');
  const cat = Object.fromEntries(w.db.all('SELECT id, code FROM absence_categories').map(c => [c.code, c.id]));
  Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2025, entitlement_min: 960, reason: 'saldo z kadr', opening: true });
  Abs.createPool(w.db, w.admin, { employee_id: w.e, acquisition_year: 2026, entitlement_min: 26 * 480, reason: 'wymiar z kadr' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.URLOP_WYP, status: 'wykorzystana', start_date: '2026-09-07', end_date: '2026-09-08', employee_request: true });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.URLOP_WYP, status: 'wykorzystana', start_date: '2026-09-09', end_date: '2026-09-11', employee_request: true });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.URLOP_NA_ZADANIE, status: 'wykorzystana', start_date: '2026-09-14', end_date: '2026-09-14', employee_request: true });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.URLOP_WYP, status: 'planowana', start_date: '2026-10-19', end_date: '2026-10-20', employee_request: true });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.L4, status: 'wykorzystana', start_date: '2026-09-21', end_date: '2026-09-22' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.NIEUSPRAW, status: 'wykorzystana', start_date: '2026-09-23', end_date: '2026-09-23' });
  const s = Abs.leaveSummary(w.db, 2026).find(x => x.employee_id === w.e);
  assert.equal(s.leave.used_days, 6); assert.equal(s.leave.planned_days, 2);
  assert.equal(s.leave.entitlement_min, 26 * 480); assert.equal(s.leave.start_balance_min, 960, 'zaległy na początek roku');
  assert.equal(s.leave.remaining_min, 960 + 26 * 480 - 6 * 480, 'zaległy + wymiar − wykorzystano');
  // poprzedni rok: stan z tamtego roku, nie dzisiejszy
  const s25 = Abs.leaveSummary(w.db, 2025).find(x => x.employee_id === w.e);
  assert.equal(s25.leave.used_min, 0); assert.equal(s25.leave.remaining_min, 960);
  // urlop na przełomie roku — dwa wpisy
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.URLOP_WYP, status: 'planowana', start_date: '2026-12-28', end_date: '2027-01-04' }), 400, /przełomie roku/);
  assert.equal(s.on_demand.used_days, 1); assert.equal(s.on_demand.limit_days, 4);
  assert.deepEqual(s.other.map(o => [o.code, o.used_days]), [['L4', 2], ['NIEUSPRAW', 1]]);
  // nieobecność godzinowa liczona w godzinach, nie jako dzień
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: cat.BADANIA_PROFIL, status: 'wykorzystana', start_date: '2026-09-24', end_date: '2026-09-24', start_time: '08:00', end_time: '09:00' });
  const bp = Abs.leaveSummary(w.db, 2026).find(x => x.employee_id === w.e).other.find(o => o.code === 'BADANIA_PROFIL');
  assert.equal(bp.used_days, 0); assert.equal(bp.used_min, 60);
  // przez API: przełożony bez uprawnienia do danych poufnych widzi ogólną etykietę; programista — 403
  const People = require('../server/domain/people');
  const { createApp } = require('../server/app');
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: w.e, password: 'haslo-testowe-1' });
  const srv = createApp(w.db); await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const login = async (l) => { const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'X-CNC-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ login: l, password: 'haslo-testowe-1' }) }); return r.headers.get('set-cookie').split(';')[0]; };
  try {
    const szef = await login('szef'), jan = await login('jan');
    const sv = await (await fetch(`${base}/leave/summary?year=2026`, { headers: { Cookie: szef } })).json();
    const names = sv.find(x => x.employee_id === w.e).other.map(o => o.name);
    assert.ok(names.some(n => /Chorobowe/.test(n)));
    assert.ok(!names.some(n => /nieusprawiedliwiona/i.test(n)), 'kategoria poufna pod ogólną etykietą');
    const own = await (await fetch(`${base}/leave/summary?year=2026`, { headers: { Cookie: jan } })).json();
    assert.deepEqual(own.map(x => x.employee_id), [w.e], 'programista widzi tylko swoje urlopy');
    assert.ok(own[0].other.some(o => /Chorobowe/.test(o.name)) && !own[0].other.some(o => /nieusprawiedliwiona/i.test(o.name)), 'własne L4 z nazwą, kategoria poufna ogólnie');
  } finally { srv.close(); }
});
