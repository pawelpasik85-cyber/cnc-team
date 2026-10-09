'use strict';
// Powroty do zakończonego projektu: czas przed poprawkami, czas, który doszedł w rundach poprawek, same poprawki łącznie.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const P = require('../server/domain/projects');
const A = require('../server/domain/analytics');
const Ret = require('../server/domain/returns');

test('powrót do projektu: rundy poprawek, podział czasu, zakończenie, zestawienie miesiąca', () => {
  const w = makeWorld({ today: '2026-10-25' });
  const e = w.emp('Jan');
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-5', part_no: 'D', part_rev: 'A', start_date: '2026-10-01' });
  const t1 = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'NX', planned_min: 400 });
  const t2 = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'Weryfikacja', planned_min: 200 });
  P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: e, work_date: '2026-10-05', active_min: 300, rework_min: 60, cause: 'blad_programowania' });
  P.addTimeEntry(w.db, w.admin, { task_id: t2, employee_id: e, work_date: '2026-10-06', active_min: 200 });
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { reason: 'klient zmienił fazy' }), 409, /po jego zakończeniu/);
  P.updateTask(w.db, w.admin, t1, { status: 'zakonczone', result_confirmation: 'ok' });
  P.updateTask(w.db, w.admin, t2, { status: 'zakonczone', result_confirmation: 'ok' });
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-05', reason: 'x' }), 400, /ostatni dzień pracy/);
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-30', reason: 'x' }), 400, /przyszłości/);
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-12' }), 400, /Powód/);
  const r1 = Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-12', reason: 'Klient zmienił fazowania', cause: 'zmiana_zakresu', task_title: 'Poprawki — runda 1', type_id: tt.NX, planned_min: 120 });
  assert.equal(r1.round, 1);
  assert.equal(w.db.get('SELECT return_id FROM tasks WHERE id=?', r1.task_id).return_id, r1.id);
  assert.equal(w.db.get('SELECT status FROM projects WHERE id=?', pid).status, 'aktywny');
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { reason: 'drugi' }), 409, /otwartą rundę/);
  P.addTimeEntry(w.db, w.admin, { task_id: r1.task_id, employee_id: e, work_date: '2026-10-12', active_min: 150 });
  throwsStatus(assert, () => P.addTimeEntry(w.db, w.admin, { task_id: r1.task_id, employee_id: e, work_date: '2026-10-03', active_min: 40 }), 400, /rundy poprawek 1/);
  throwsStatus(assert, () => P.saveProject(w.db, w.admin, { ...w.db.get('SELECT * FROM projects WHERE id=?', pid), status: 'zakonczony' }, pid), 409, /otwartą rundę/);
  // ponownie otwarte zadanie pierwotne w czasie rundy — czas też należy do rundy
  P.updateTask(w.db, w.admin, t2, { status: 'w_toku', reason: 'sprawdzenie po zmianie' });
  P.addTimeEntry(w.db, w.admin, { task_id: t2, employee_id: e, work_date: '2026-10-13', verify_min: 30 });
  throwsStatus(assert, () => Ret.closeReturn(w.db, w.admin, pid, {}), 409, /Najpierw zakończ/);
  P.updateTask(w.db, w.admin, t2, { status: 'zakonczone', result_confirmation: 'ok' });
  P.updateTask(w.db, w.admin, r1.task_id, { status: 'zakonczone', result_confirmation: 'fazy poprawione' });
  throwsStatus(assert, () => Ret.closeReturn(w.db, w.admin, pid, { closed_date: '2026-10-14' }), 400, /Co poprawiono/);
  throwsStatus(assert, () => Ret.closeReturn(w.db, w.admin, pid, { closed_date: '2027-06-01', note: 'x' }), 400, /przyszłości/);
  throwsStatus(assert, () => Ret.closeReturn(w.db, w.admin, pid, { closed_date: '2026-10-12', note: 'x' }), 400, /praca z 2026-10-13/);
  Ret.closeReturn(w.db, w.admin, pid, { closed_date: '2026-10-14', note: 'Fazy wg rev B' });
  // po zakończeniu rundy czasu nie dopisuje się do projektu poza rundą
  throwsStatus(assert, () => P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: e, work_date: '2026-10-16', active_min: 77 }), 400, /poza rundą/);
  throwsStatus(assert, () => P.addTimeEntry(w.db, w.admin, { task_id: r1.task_id, employee_id: e, work_date: '2026-10-16', active_min: 11 }), 400, /rundy poprawek 1/);
  assert.equal(w.db.get('SELECT status FROM projects WHERE id=?', pid).status, 'zakonczony');
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-13', reason: 'x' }), 400, /poprzedniej rundy/);
  const r2 = Ret.startReturn(w.db, w.admin, pid, { opened_date: '2026-10-20', reason: 'Kolizja oprawki', cause: 'blad_programowania', task_title: 'Poprawki — runda 2', type_id: tt.NX });
  P.addTimeEntry(w.db, w.admin, { task_id: r2.task_id, employee_id: e, work_date: '2026-10-20', rework_min: 50, cause: 'blad_programowania' });
  const s = Ret.returnsSummary(w.db, pid);
  assert.deepEqual(s.original, { worked_min: 560, rework_min: 60, clean_min: 500, first: '2026-10-05', last: '2026-10-06' });
  assert.deepEqual(s.rounds.map(r => r.worked_min), [180, 50]);
  assert.equal(s.added_min, 230); assert.equal(s.added_pct, 41.1);
  assert.equal(s.corrections_min, 60 + 230); assert.equal(s.total_min, 790);
  assert.equal(s.open.round, 2);
  const m = A.monthCompare(w.db, '2026-10');
  assert.equal(m.current_kpi.returns_min, 230);
  assert.equal(m.current.returns.by_project[0].project_id, pid);
  const pm = A.projectMetrics(w.db, pid);
  assert.equal(pm.returns_added_min, 230);
  assert.equal(pm.worked_min, 560, 'wskaźniki projektu = pierwotna realizacja');
  assert.equal(pm.planned_min, 600); assert.equal(pm.finish_date >= '2026-10-06' && pm.finish_date < '2026-10-12', true);
  assert.equal(m.current_kpi.projects_done, 1, 'projekt z rundami nadal liczony jako zakończony');
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='project' AND action='powrot_poprawki' AND reason='Kolizja oprawki'`));
});

test('powrót: nie dla projektu anulowanego / wstrzymanego', () => {
  const w = makeWorld({ today: '2026-10-25' });
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-6', part_no: 'D', part_rev: 'A', start_date: '2026-10-01' });
  const t1 = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'NX' });
  P.updateTask(w.db, w.admin, t1, { status: 'zakonczone', result_confirmation: 'ok' });
  P.saveProject(w.db, w.admin, { ...w.db.get('SELECT * FROM projects WHERE id=?', pid), status: 'anulowany' }, pid);
  throwsStatus(assert, () => Ret.startReturn(w.db, w.admin, pid, { reason: 'x' }), 409, /anulowany/);
});
