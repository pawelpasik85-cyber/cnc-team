'use strict';
// Wyjścia prywatne, odrabianie, alerty, zmiana nocna, zmiana czasu, zamknięcie miesiąca.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const X = require('../server/domain/exits');
const Abs = require('../server/domain/absences');
const People = require('../server/domain/people');

function exitState(db, id) { return X.listExits(db, {}).find(x => x.id === id); }

test('odrabianie 90 → 45 → 0 minut', () => {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-05', start_time: '10:00', end_time: '11:30', written_request: true });
  assert.equal(ex.minutes, 90);
  const m1 = X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-05', start_time: '14:00', end_time: '14:45', allocations: [{ exit_id: ex.id, minutes: 45 }] });
  assert.equal(exitState(w.db, ex.id).remaining_min, 90, 'niezatwierdzone odrabianie nie rozlicza salda');
  X.approveMakeup(w.db, w.admin, m1.id, { decision: 'zatwierdzone' });
  let s = exitState(w.db, ex.id);
  assert.equal(s.remaining_min, 45); assert.equal(s.state, 'czesciowo_rozliczone');
  X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-06', start_time: '14:00', end_time: '14:45', allocations: [{ exit_id: ex.id, minutes: 45 }], approve: true });
  s = exitState(w.db, ex.id);
  assert.equal(s.remaining_min, 0); assert.equal(s.state, 'rozliczone');
  assert.equal(X.monthBalances(w.db, '2026-10').find(b => b.employee_id === e).remaining_min, 0);
});

test('kilka wyjść: brak podwójnego odrobienia tej samej minuty, brak kredytu z nadwyżki', () => {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const a = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-05', start_time: '09:00', end_time: '10:00', written_request: true });
  const b = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-06', start_time: '09:00', end_time: '09:30', written_request: true });
  // jedno odrabianie rozliczające dwa wyjścia
  X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-07', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: a.id, minutes: 40 }, { exit_id: b.id, minutes: 20 }], approve: true });
  // próba ponownego rozliczenia minut wyjścia a ponad jego długość (40 + 30 > 60)
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-08', start_time: '14:00', end_time: '14:30', allocations: [{ exit_id: a.id, minutes: 30 }] }), 409, /Podwójne rozliczenie/);
  // przypisanie więcej minut niż trwa odrabianie
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-08', start_time: '14:00', end_time: '14:10', allocations: [{ exit_id: b.id, minutes: 10 }, { exit_id: a.id, minutes: 20 }] }), 409);
  // oczekujące odrabianie też rezerwuje minuty
  X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-08', start_time: '14:00', end_time: '14:20', allocations: [{ exit_id: a.id, minutes: 20 }] });
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-09', start_time: '14:00', end_time: '14:05', allocations: [{ exit_id: a.id, minutes: 5 }] }), 409, /Podwójne/);
  // nadwyżka nie tworzy kredytu
  const over = X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-09', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: b.id, minutes: 10 }], approve: true });
  assert.ok(over.warnings.some(x => /NIE tworzy kredytu/.test(x)));
  const later = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-12', start_time: '09:00', end_time: '09:30', written_request: true });
  assert.equal(exitState(w.db, later.id).remaining_min, 30, 'późniejsze wyjście nie jest pomniejszane nadwyżką');
  // odrabianie przed wyjściem jest odrzucane
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-09', start_time: '15:00', end_time: '15:30', allocations: [{ exit_id: later.id, minutes: 30 }] }), 409, /poprzedzać/);
  // nadgodziny nie zamieniają się w odrobienie
  People.addAttendance(w.db, w.admin, { employee_id: e, kind: 'nadgodziny', start_date: '2026-10-13', start_time: '14:00', end_time: '16:00' });
  assert.equal(exitState(w.db, later.id).remaining_min, 30);
});

test('kolizje odrabiania z grafikiem, odpoczynkiem i dniem wolnym', () => {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-05', start_time: '09:00', end_time: '11:00', written_request: true });
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-06', start_time: '13:00', end_time: '14:30', allocations: [{ exit_id: ex.id, minutes: 30 }] }), 409, /zmianę z grafiku/);
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-06', start_time: '20:00', end_time: '21:00', allocations: [{ exit_id: ex.id, minutes: 60 }] }), 409, /odpoczynku/);
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-10', start_time: '08:00', end_time: '09:00', allocations: [{ exit_id: ex.id, minutes: 60 }] }), 409, /Dzień wolny/);
  const ok = X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-10', start_time: '08:00', end_time: '09:00', day_off_override_reason: 'Zgoda kierownika, uzgodnione z kadrami', allocations: [{ exit_id: ex.id, minutes: 60 }] });
  assert.ok(ok.id);
});

test('nakładające się wpisy są odrzucane', () => {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  throwsStatus(assert, () => w.shift(e, '2026-10-05', 'I'), 409, /nakłada się/);
  Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.L4, status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-07' });
  throwsStatus(assert, () => Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.BEZPLATNY, status: 'planowana', start_date: '2026-10-07', end_date: '2026-10-08' }), 409, /nakłada/);
  throwsStatus(assert, () => X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-06', start_time: '09:00', end_time: '10:00' }), 409, /nakłada/);
  X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-08', start_time: '09:00', end_time: '10:00' });
  throwsStatus(assert, () => X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-08', start_time: '09:30', end_time: '10:30' }), 409, /nakłada/);
});

test('koniec miesiąca w weekend: wyzwalacze alertów i brak duplikatów', () => {
  const w = makeWorld({ today: '2027-01-10' });
  const e = w.emp('Jan'); w.shifts(e, '2027-01-04', '2027-01-29');
  // 31.01.2027 to niedziela; ostatnie zmiany: czw 28.01 i pt 29.01
  const tr = X.alertTriggers(w.db, e, '2027-01');
  assert.deepEqual(tr.map(t => [t.kind, t.date]).sort(), [['dwa_dni_kalendarzowe', '2027-01-29'], ['dwa_dni_robocze', '2027-01-28'], ['ostatni_dzien', '2027-01-31']].sort());
  X.createExit(w.db, w.admin, { employee_id: e, start_date: '2027-01-12', start_time: '09:00', end_time: '10:00', written_request: true });
  assert.equal(X.recomputeAlerts(w.db, '2027-01-27').length, 0);
  assert.deepEqual(X.recomputeAlerts(w.db, '2027-01-28'), [`dwa_dni_robocze:${e}:2027-01`]);
  assert.deepEqual(X.recomputeAlerts(w.db, '2027-01-29'), [`dwa_dni_kalendarzowe:${e}:2027-01`]);
  assert.deepEqual(X.recomputeAlerts(w.db, '2027-01-29'), [], 'brak duplikatów');
  assert.deepEqual(X.recomputeAlerts(w.db, '2027-01-31'), [`ostatni_dzien:${e}:2027-01`]);
  assert.equal(w.db.get('SELECT COUNT(*) n FROM alerts').n, 3);
  // październik 2026 kończy się w sobotę — przedostatnia zmiana (29.10) nie wypada wcześniej niż 29.10
  const w2 = makeWorld();
  const e2 = w2.emp('Ola'); w2.shifts(e2, '2026-10-01', '2026-10-30');
  assert.deepEqual(X.alertTriggers(w2.db, e2, '2026-10').map(t => t.kind).sort(), ['dwa_dni_kalendarzowe', 'ostatni_dzien']);
});

test('późno dodane wyjście uruchamia zaległe alerty; rozliczenie je zamyka', () => {
  const w = makeWorld({ today: '2026-10-31' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  assert.equal(X.recomputeAlerts(w.db).length, 0);
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-30', start_time: '12:00', end_time: '13:00', written_request: true });
  const active = X.listAlerts(w.db, {});
  assert.deepEqual(active.map(a => a.kind).sort(), ['dwa_dni_kalendarzowe', 'ostatni_dzien']);
  assert.equal(active[0].remaining_min, 60);
  X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-30', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: ex.id, minutes: 60 }], approve: true });
  assert.equal(X.listAlerts(w.db, {}).length, 0, 'alerty rozwiązane po rozliczeniu');
});

test('zmiana nocna na granicy miesiąca należy do miesiąca rozpoczęcia', () => {
  const w = makeWorld();
  const e = w.emp('Jan');
  w.shift(e, '2026-10-31', 'III');
  const s = w.db.get('SELECT * FROM schedule_entries WHERE employee_id=?', e);
  assert.equal(s.work_date, '2026-10-31'); assert.equal(s.planned_min, 480);
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-11-01', start_time: '01:00', end_time: '02:00', written_request: true });
  const row = w.db.get('SELECT * FROM private_exits WHERE id=?', ex.id);
  assert.equal(row.work_date, '2026-10-31'); assert.equal(row.settlement_month, '2026-10'); assert.equal(row.settle_by_date, '2026-10-31');
});

test('zmiana czasu: zmiana nocna 9 h jesienią, 7 h wiosną, rzeczywiste minuty wyjścia', () => {
  const w = makeWorld();
  const e = w.emp('Jan');
  w.shift(e, '2026-10-24', 'III');
  w.shift(e, '2027-03-27', 'III');
  const [autumn, spring] = w.db.all('SELECT planned_min FROM schedule_entries WHERE employee_id=? ORDER BY work_date', e).map(r => r.planned_min);
  assert.equal(autumn, 540); assert.equal(spring, 420);
  // 25.10.2026: 02:00 (pierwsze wystąpienie, CEST) → 03:00 CET = 120 minut rzeczywistych
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-25', start_time: '02:00', end_time: '03:00', written_request: true });
  assert.equal(ex.minutes, 120);
});

test('brak długu do odrobienia przy L4 i urlopie', () => {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  Abs.createPool(w.db, w.admin, { employee_id: e, acquisition_year: 2026, entitlement_min: 26 * 480, reason: 'kadry' });
  Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.L4, status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-09' });
  Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.URLOP_WYP, status: 'wykorzystana', start_date: '2026-10-12', end_date: '2026-10-13' });
  Abs.createAbsence(w.db, w.admin, { employee_id: e, category_id: w.cat.SILA_WYZSZA, unit: 'godziny', status: 'wykorzystana', start_date: '2026-10-14', start_time: '06:00', end_time: '08:00' });
  const b = X.monthBalances(w.db, '2026-10').find(x => x.employee_id === e);
  assert.equal(b.remaining_min, 0); assert.equal(b.exits_count, 0);
  assert.equal(X.recomputeAlerts(w.db, '2026-10-31').length, 0);
});

test('zamknięcie i korekta miesiąca: saldo zachowane, wersje raportu', () => {
  const w = makeWorld({ today: '2026-11-02' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-20', start_time: '09:00', end_time: '10:30', written_request: true });
  const pending = X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-21', start_time: '14:00', end_time: '14:30', allocations: [{ exit_id: ex.id, minutes: 30 }] });
  throwsStatus(assert, () => X.closeMonth(w.db, w.admin, '2026-10'), 409, /oczekujące/);
  X.approveMakeup(w.db, w.admin, pending.id, { decision: 'zatwierdzone' });
  const c1 = X.closeMonth(w.db, w.admin, '2026-10', { reason: 'koniec miesiąca' });
  assert.equal(c1.version, 1);
  let row = w.db.get('SELECT * FROM private_exits WHERE id=?', ex.id);
  assert.equal(row.hr_status, 'nierozliczone_do_kadr'); assert.equal(row.minutes, 90, 'minuty nie są kasowane');
  assert.equal(exitState(w.db, ex.id).remaining_min, 60, 'nie udaje wyzerowania');
  assert.equal(w.db.get(`SELECT COUNT(*) n FROM private_exits WHERE settlement_month='2026-11'`).n, 0, 'brak przeniesienia do kolejnego miesiąca');
  assert.ok(w.db.get(`SELECT 1 FROM alerts WHERE kind='zamkniecie' AND employee_id=?`, e));
  const rep1 = X.listMonthReports(w.db, '2026-10')[0].report;
  assert.equal(rep1.employees.find(x => x.employee_id === e).status, 'nierozliczone — do przekazania kadrom');
  // edycje w zamkniętym miesiącu zablokowane
  throwsStatus(assert, () => X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-22', start_time: '09:00', end_time: '09:30' }), 409, /zamknięty/);
  throwsStatus(assert, () => X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-22', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: ex.id, minutes: 60 }] }), 409, /zamknięty/);
  throwsStatus(assert, () => X.reopenMonth(w.db, w.admin, '2026-10', {}), 400, /Powód/);
  X.reopenMonth(w.db, w.admin, '2026-10', { reason: 'Późno dostarczony wniosek o odrobienie' });
  assert.equal(w.db.get('SELECT hr_status FROM private_exits WHERE id=?', ex.id).hr_status, null);
  X.createMakeup(w.db, w.admin, { employee_id: e, start_date: '2026-10-22', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: ex.id, minutes: 60 }], approve: true });
  const c2 = X.closeMonth(w.db, w.admin, '2026-10', { reason: 'po korekcie' });
  assert.equal(c2.version, 2);
  const versions = X.listMonthReports(w.db, '2026-10');
  assert.equal(versions.length, 2);
  assert.equal(versions[0].report.employees.find(x => x.employee_id === e).remaining_min, 60, 'poprzednia wersja zachowana');
  assert.equal(versions[1].report.employees.find(x => x.employee_id === e).remaining_min, 0);
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='month' AND action='ponowne_otwarcie' AND reason LIKE 'Późno%'`));
});
