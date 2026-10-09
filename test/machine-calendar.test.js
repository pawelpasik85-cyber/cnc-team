'use strict';
// Kalendarz maszyn: w każdym dniu oba tematy — praca z wpisów czasu (ze zmianą), dzień bez wpisów = projekt w toku, dziś i dalej = projekt z karty maszyny.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const P = require('../server/domain/projects');

test('kalendarz maszyn: praca / w toku / obecnie / brak dla obu maszyn każdego dnia', () => {
  const w = makeWorld({ today: '2026-10-08' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-05', '2026-10-09', 'II');
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const ph = P.saveProject(w.db, w.admin, { order_no: 'ZL-H', part_no: 'D', part_rev: 'A', machine_id: 'M-HARTFORD' });
  const t = P.createTask(w.db, w.admin, { project_id: ph, type_id: tt.NX, title: 'NX' });
  const pg = P.saveProject(w.db, w.admin, { order_no: 'ZL-G', part_no: 'D', part_rev: 'A', machine_id: 'M-GRIMME' });
  P.updateBoard(w.db, w.admin, 'M-GRIMME', { project_id: pg });
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: e, work_date: '2026-10-05', active_min: 120 });
  const cal = P.machineCalendar(w.db, '2026-10-04', '2026-10-09');
  const at = (d, m) => cal.find(x => x.date === d && x.machine_id === m);
  assert.equal(cal.length, 12, 'każdego dnia obie maszyny');
  assert.equal(at('2026-10-04', 'M-HARTFORD').mode, 'brak');
  const h5 = at('2026-10-05', 'M-HARTFORD');
  assert.equal(h5.mode, 'praca'); assert.equal(h5.items[0].order_no, 'ZL-H'); assert.deepEqual(h5.items[0].shifts.map(s => s.short), ['II']);
  assert.equal(at('2026-10-06', 'M-HARTFORD').mode, 'w_toku');
  assert.equal(at('2026-10-06', 'M-GRIMME').mode, 'brak', 'przeszłość bez wpisów i bez historii');
  assert.equal(at('2026-10-08', 'M-GRIMME').mode, 'obecnie'); assert.equal(at('2026-10-09', 'M-GRIMME').items[0].order_no, 'ZL-G');
  // projekt zakończony nie jest pokazywany jako „w toku” po dniu zakończenia
  P.updateTask(w.db, w.admin, t, { status: 'zakonczone', result_confirmation: 'ok' });
  P.saveProject(w.db, w.admin, { ...w.db.get('SELECT * FROM projects WHERE id=?', ph), status: 'zakonczony' }, ph);
  w.db.run(`UPDATE tasks SET completed_at='2026-10-05T12:00:00Z' WHERE id=?`, t);
  assert.equal(P.machineCalendar(w.db, '2026-10-06', '2026-10-06').find(x => x.machine_id === 'M-HARTFORD').mode, 'brak');
});
