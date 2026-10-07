'use strict';
// Grafik: tryby pracy (wydłużona 12 h, nieregularna, dzień dodatkowy), zamiana osób, zmiana trybu na okres, odpoczynek, nadgodziny w analizie.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const A = require('../server/domain/analytics');

function world() {
  const w = makeWorld({ today: '2026-10-20' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-05', '2026-10-09');           // I 06–14
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-05', '2026-10-09', 'III');  // III 22–06
  return { ...w, e, e2 };
}

test('dzień dodatkowy w sobotę na nocnej zmianie i w niedzielę (potwierdzenie), wymagany powód, nadgodziny = cała zmiana', () => {
  const w = world();
  throwsStatus(assert, () => People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', shift_template_id: w.tpl.III, mode: 'dodatkowa' }), 400, /powodu/);
  const r = People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', shift_template_id: w.tpl.III, mode: 'dodatkowa', reason: 'termin ZL-9' }, { withWarnings: true });
  const s = w.db.get('SELECT * FROM schedule_entries WHERE id=?', r.id);
  assert.equal(s.mode, 'dodatkowa'); assert.equal(s.overtime_min, 480);
  throwsStatus(assert, () => People.addScheduleEntry(w.db, w.admin, { employee_id: w.e2, work_date: '2026-10-11', shift_template_id: w.tpl.I, mode: 'dodatkowa', reason: 'braki' }), 409, /niedziela/);
  People.addScheduleEntry(w.db, w.admin, { employee_id: w.e2, work_date: '2026-10-11', shift_template_id: w.tpl.II, mode: 'dodatkowa', reason: 'braki', confirm_holiday: true });
});

test('zmiana trybu na okres 8 h → 12 h (nadgodziny ponad normę), odpoczynek 11 h, zamiana osób między zmianami', () => {
  const w = world();
  const r = People.bulkShiftMode(w.db, w.admin, { employee_ids: [w.e], from: '2026-10-05', to: '2026-10-07', start_time: '06:00', end_time: '18:00', mode: 'wydluzona', reason: 'braki kadrowe — L4 Ewy' });
  assert.equal(r.changed, 3);
  const s = w.db.all(`SELECT * FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN '2026-10-05' AND '2026-10-07'`, w.e);
  assert.ok(s.every(x => x.planned_min === 720 && x.overtime_min === 240 && x.mode === 'wydluzona'));
  // Ewa: nocna 22–06; dzienna 12 h tego samego dnia 06–18 po nocnej z poprzedniego dnia → brak 11 h odpoczynku
  const ewaMon = w.db.get(`SELECT id FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-07'`, w.e2).id;
  throwsStatus(assert, () => People.updateScheduleEntry(w.db, w.admin, ewaMon, { start_time: '10:00', end_time: '18:00', reason: 'test' }), 409, /odpoczynku/);
  // zamiana: Jan bierze nocną Ewy w piątek, Ewa poranną Jana
  const janFri = w.db.get(`SELECT id FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-09'`, w.e).id;
  const ewaFri = w.db.get(`SELECT id FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-09'`, w.e2).id;
  throwsStatus(assert, () => People.swapShifts(w.db, w.admin, { a_id: janFri, b_id: ewaFri, reason: 'zamiana na prośbę' }), 409, /odpoczynku/);
  People.swapShifts(w.db, w.admin, { a_id: janFri, b_id: ewaFri, reason: 'zamiana na prośbę', confirm_rest: true });
  assert.equal(w.db.get('SELECT employee_id FROM schedule_entries WHERE id=?', janFri).employee_id, w.e2);
  assert.equal(w.db.get('SELECT employee_id FROM schedule_entries WHERE id=?', ewaFri).employee_id, w.e);
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE action='zamiana_zmian' AND reason='zamiana na prośbę'`));
});

test('analiza: czas na projekcie w nadgodzinach i dniach dodatkowych (godziny i udział) w projekcie i miesiącu', () => {
  const w = world();
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-9', part_no: 'D', part_rev: 'A' });
  const t = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'NX', planned_min: 900 });
  People.bulkShiftMode(w.db, w.admin, { employee_ids: [w.e], from: '2026-10-05', to: '2026-10-05', start_time: '06:00', end_time: '18:00', mode: 'wydluzona', reason: 'braki' });
  People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', shift_template_id: w.tpl.I, mode: 'dodatkowa', reason: 'termin' });
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-10-05', active_min: 600 }); // 12 h zmiana, 4 h nadgodzin → 1/3
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-10-06', active_min: 300 }); // zwykła zmiana
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-10-10', active_min: 420 }); // sobota — dzień dodatkowy
  const h = P.projectDetail(w.db, pid, { withTimes: true }).hours;
  assert.equal(h.overtime_work_min, 200 + 420);
  assert.equal(h.overtime_share_pct, Math.round((620 / 1320) * 1000) / 10);
  const m = A.monthCompare(w.db, '2026-10');
  assert.equal(m.current.overtime.extra_days, 1);
  assert.equal(m.current.overtime.extended_shifts, 1);
  assert.equal(m.current.overtime.schedule_min, 240 + 480);
  assert.equal(m.current_kpi.overtime_work_min, 620);
  assert.equal(m.current.overtime.by_project[0].project_id, pid);
  assert.equal(m.current.overtime.by_project[0].extra_day_work_min, 420);
});

test('nadgodziny liczone z godzin na dobę (nie z etykiety trybu); szablon tylko gdy wybrany; bulk pomija dni dodatkowe', () => {
  const w = world();
  const mon = w.db.get(`SELECT id FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-05'`, w.e).id;
  // 12 h w trybie „standardowa” — nadal 4 h nadgodzin
  People.updateScheduleEntry(w.db, w.admin, mon, { start_time: '06:00', end_time: '18:00', reason: 'dłużej' });
  assert.equal(w.db.get('SELECT overtime_min FROM schedule_entries WHERE id=?', mon).overtime_min, 240);
  // zmiana samego powodu nie przywraca godzin szablonu
  People.updateScheduleEntry(w.db, w.admin, mon, { reason: 'poprawka opisu' });
  const s = w.db.get('SELECT planned_min, overtime_min FROM schedule_entries WHERE id=?', mon);
  assert.equal(s.planned_min, 720); assert.equal(s.overtime_min, 240);
  // dzień dzielony: dwie zmiany 6 h tego samego dnia = 4 h ponad normę
  const tue = w.db.get(`SELECT id FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-06'`, w.e).id;
  People.updateScheduleEntry(w.db, w.admin, tue, { start_time: '06:00', end_time: '12:00', mode: 'nieregularna', reason: 'dzień dzielony' });
  People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-06', start_time: '13:00', end_time: '19:00', mode: 'nieregularna', reason: 'dzień dzielony' });
  assert.equal(w.db.get(`SELECT SUM(overtime_min) m FROM schedule_entries WHERE employee_id=? AND work_date='2026-10-06'`, w.e).m, 240);
  // bulk nie zmienia dnia dodatkowego
  const sat = People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', shift_template_id: w.tpl.I, mode: 'dodatkowa', reason: 'termin' });
  const r = People.bulkShiftMode(w.db, w.admin, { employee_ids: [w.e], from: '2026-10-07', to: '2026-10-11', start_time: '06:00', end_time: '18:00', mode: 'wydluzona', reason: 'braki' });
  assert.equal(r.changed, 3); assert.match(r.skipped.map(x => x.reason).join(), /dzień dodatkowy/);
  const satRow = w.db.get('SELECT mode, overtime_min, reason FROM schedule_entries WHERE id=?', sat);
  assert.equal(satRow.mode, 'dodatkowa'); assert.equal(satRow.overtime_min, 480); assert.equal(satRow.reason, 'termin');
  // nocna z soboty na niedzielę — ostrzeżenie o godzinach w niedzielę
  const n = People.addScheduleEntry(w.db, w.admin, { employee_id: w.e2, work_date: '2026-10-10', shift_template_id: w.tpl.III, mode: 'dodatkowa', reason: 'termin' }, { withWarnings: true });
  assert.match(n.warnings.join(), /niedzielę/);
});

test('analiza: dzień dodatkowy obok zwykłej zmiany liczony proporcjonalnie; ewidencja nie dubluje grafiku; udział nadgodzin w pracy projektu', () => {
  const w = world();
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-7', part_no: 'D', part_rev: 'A' });
  const t = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'NX', planned_min: 900 });
  People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-05', start_time: '15:00', end_time: '19:00', mode: 'dodatkowa', reason: 'termin' });
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-10-05', active_min: 600 }); // 8 h + 4 h dodatkowo → 1/3
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-10-06', active_min: 600 });
  const sat = People.addScheduleEntry(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', shift_template_id: w.tpl.I, mode: 'dodatkowa', reason: 'termin' });
  const s = w.db.get('SELECT * FROM schedule_entries WHERE id=?', sat);
  void s; People.addAttendance(w.db, w.admin, { employee_id: w.e, kind: 'nadgodziny', start_date: '2026-10-10', start_time: '06:00', end_time: '14:00' });
  const m = A.monthCompare(w.db, '2026-10');
  const row = m.current.overtime.by_project[0];
  assert.equal(row.overtime_work_min, 200); assert.equal(row.extra_day_work_min, 200);
  assert.equal(row.worked_min, 1200); assert.equal(row.share_pct, 16.7);
  assert.equal(m.current.overtime.records_min, 0, 'wpis z ewidencji pokrywa się z dniem dodatkowym');
  assert.equal(m.current_kpi.overtime_min, 240 + 480);
});
