'use strict';
// Projekty, postęp, raporty przy niepełnych danych, wymiana danych z CNC Process.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const P = require('../server/domain/projects');
const R = require('../server/domain/reports');
const I = require('../server/domain/integration');
const X = require('../server/domain/exits');
const Abs = require('../server/domain/absences');

function world() {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-1', part_no: 'DET-1', part_rev: 'B', part_family: 'tacki NGK', machine_id: 'M-HARTFORD' });
  P.setNcRevision(w.db, w.admin, pid, { nc_program: 'PRG1', nc_rev: '03' });
  return { ...w, e, tt, pid };
}

test('postęp z wag zakończonych zadań; zakończenie wymaga potwierdzenia rezultatu; plan pierwotny zachowany', () => {
  const w = world();
  const t1 = P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.NX, title: 'NX', planned_min: 240, assignee_id: w.e });
  P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.WERYFIKACJA, title: 'Weryfikacja', planned_min: 60 });
  P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.URUCHOMIENIE, title: 'Uruchomienie', planned_min: 60 });
  let p = P.projectDetail(w.db, w.pid, { withTimes: true });
  assert.equal(p.progress_program.percent, 0); assert.equal(p.progress_execution.percent, 0);
  throwsStatus(assert, () => P.updateTask(w.db, w.admin, t1, { status: 'zakonczone' }), 400, /Potwierdzenie rezultatu/);
  P.updateTask(w.db, w.admin, t1, { status: 'zakonczone', result_confirmation: 'Program wygenerowany' });
  p = P.projectDetail(w.db, w.pid, { withTimes: true });
  assert.equal(p.progress_program.percent, 67, 'waga 4 z 6'); assert.equal(p.progress_execution.percent, 0);
  throwsStatus(assert, () => P.changeTaskPlan(w.db, w.admin, t1, { planned_min: 300 }), 400, /Powód/);
  P.changeTaskPlan(w.db, w.admin, t1, { planned_min: 300, reason: 'zmiana zakresu' });
  const t = w.db.get('SELECT original_planned_min, planned_min FROM tasks WHERE id=?', t1);
  assert.deepEqual({ ...t }, { original_planned_min: 240, planned_min: 300 });
  // wkład kolejnych osób zachowany
  const e2 = w.emp('Ewa');
  P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: w.e, work_date: '2026-10-05', active_min: 100 });
  P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: e2, work_date: '2026-10-05', active_min: 120, rework_min: 30, cause: 'zmiana_zakresu' });
  throwsStatus(assert, () => P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: e2, work_date: '2026-10-06', rework_min: 30 }), 400, /przyczyny/);
  assert.equal(P.projectDetail(w.db, w.pid, { withTimes: true }).contributions.length, 2);
  // widok pracownika bez planów czasu
  const emp = P.projectDetail(w.db, w.pid, { withTimes: false });
  assert.equal(emp.tasks[0].planned_min, undefined); assert.equal(emp.contributions[0].work_min, undefined);
});

test('raport przy niepełnych danych: brak danych ≠ zero, kompletność i liczebność próbki', () => {
  const w = world();
  const t1 = P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.NX, title: 'Z czasem', planned_min: 100, assignee_id: w.e });
  const t2 = P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.NX, title: 'Bez czasu', planned_min: 100, assignee_id: w.e });
  P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.NX, title: 'Bez planu', assignee_id: w.e });
  P.addTimeEntry(w.db, w.admin, { task_id: t1, employee_id: w.e, work_date: '2026-10-05', active_min: 200 });
  for (const t of [t1, t2]) P.updateTask(w.db, w.admin, t, { status: 'zakonczone', result_confirmation: 'ok' });
  // L4 nie zmienia wskaźnika efektywności
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.L4, status: 'wykorzystana', start_date: '2026-10-06', end_date: '2026-10-09' });
  const rep = R.REPORTS.plan_wykonanie.fn(w.db, {});
  assert.equal(rep.sample, 2);
  assert.match(rep.completeness, /^1\/2/);
  const r1 = rep.rows.find(r => r.task_id === t1), r2 = rep.rows.find(r => r.task_id === t2);
  assert.equal(r1.deviation_min, 100); assert.equal(r1.deviation_pct, 100); assert.equal(r1.flag, 'odchylenie wymagające wyjaśnienia');
  assert.equal(r2.actual_active_min, null, 'brak danych, nie zero'); assert.equal(r2.deviation_min, null); assert.equal(r2.flag, 'brak danych');
  assert.ok(!JSON.stringify(rep).includes('celowo'));
  assert.match(R.toCsv(rep), /brak danych/);
  const att = R.REPORTS.obecnosc.fn(w.db, { from: '2026-10-01', to: '2026-10-31' });
  const row = att.rows[0];
  assert.equal(row.attendance_min, null); assert.equal(row.attendance_source, 'brak ewidencji');
  // wykres zawsze z definicją i tabelą danych
  for (const [name, def] of Object.entries(R.REPORTS)) {
    const r = def.fn(w.db, { from: '2026-10-01', to: '2026-10-31' });
    assert.ok(r.definition && r.columns.length && Array.isArray(r.rows) && r.sample !== undefined && r.completeness, name);
  }
});

test('CSV: ochrona przed wstrzyknięciem formuł', () => {
  const csv = R.toCsv({ title: 't', definition: 'd', columns: [['a', 'A']], rows: [{ a: '=HYPERLINK("x")' }, { a: -5 }] });
  assert.match(csv, /'=HYPERLINK/); assert.match(csv, /\r\n-5\r\n/);
});

test('import technologiczny: właściwa i stara rewizja NC, walidacja, duplikaty, brak wpływu na rozliczenia', () => {
  const w = world();
  X.createExit(w.db, w.admin, { employee_id: w.e, start_date: '2026-10-05', start_time: '09:00', end_time: '10:00' });
  const before = ['private_exits', 'makeups', 'absences', 'leave_ledger', 'schedule_entries', 'task_time_entries'].map(t => w.db.get(`SELECT COUNT(*) n FROM ${t}`).n);
  const base = { format: 'cnc-process.techdata', version: '1.0', units: { time: 'min' }, generated_at: '2026-10-06T08:00:00Z' };
  const item = (rev, extra = {}) => ({ order_no: 'ZL-1', part_no: 'DET-1', part_rev: 'B', machine_id: 'M-HARTFORD', operation_id: 'OP10', nc_program: 'PRG1', nc_rev: rev, nx_time_min: 95, machine_est_min: 110, machine_actual_min: null, ...extra });
  const ok = JSON.stringify({ ...base, items: [item('03'), item('02', { nx_time_min: 80 })] });
  const dry = I.importFromCncProcess(w.db, w.admin, ok, { dryRun: true });
  assert.equal(dry.dry_run, true); assert.equal(w.db.get('SELECT COUNT(*) n FROM tech_data').n, 0);
  const r = I.importFromCncProcess(w.db, w.admin, ok);
  assert.equal(r.current, 1); assert.equal(r.stale, 1); assert.ok(r.warnings.some(x => /NIEAKTUALNA/.test(x)));
  const rows = w.db.all(`SELECT nc_rev, stale, source FROM tech_data ORDER BY nc_rev`);
  assert.deepEqual(rows.map(x => [x.nc_rev, x.stale, x.source]), [['02', 1, 'cnc_process'], ['03', 0, 'cnc_process']]);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, ok), 409, /duplikat/);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, JSON.stringify({ ...base, version: '2.0', items: [item('03')] })), 400);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, JSON.stringify({ ...base, units: { time: 's' }, items: [item('03')] })), 400);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, JSON.stringify({ ...base, items: [item('04'), item('04')] })), 400);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, JSON.stringify({ ...base, items: [item('04', { order_no: 'NIEZNANE' })] })), 400);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, JSON.stringify({ ...base, items: [item('04', { nx_time_min: 1.5 })] })), 400);
  throwsStatus(assert, () => I.importFromCncProcess(w.db, w.admin, '{zły json'), 400);
  // zmiana rewizji NC → poprzednia estymacja nieaktualna
  const ch = P.setNcRevision(w.db, w.admin, w.pid, { nc_program: 'PRG1', nc_rev: '04', reason: 'korekta programu' });
  assert.equal(ch.marked_stale, 1);
  assert.equal(w.db.get(`SELECT stale FROM tech_data WHERE nc_rev='03'`).stale, 1);
  const after = ['private_exits', 'makeups', 'absences', 'leave_ledger', 'schedule_entries', 'task_time_entries'].map(t => w.db.get(`SELECT COUNT(*) n FROM ${t}`).n);
  assert.deepEqual(after, before, 'import nie zmienia rozliczeń zespołu');
});

test('eksport do CNC Process bez danych osobowych i poufnych', () => {
  const w = world();
  const sensitive = 'SPRAWA-POUFNA-XYZ';
  X.createExit(w.db, w.admin, { employee_id: w.e, start_date: '2026-10-05', start_time: '09:00', end_time: '10:00', confidential_note: sensitive, document_ref: 'DOK-KADRY-123' });
  Abs.createAbsence(w.db, w.admin, { employee_id: w.e, category_id: w.cat.L4, status: 'wykorzystana', start_date: '2026-10-06', confidential_note: sensitive, document_ref: 'e-ZLA-999' });
  w.db.run(`UPDATE employees SET hr_reference='HR-REF-777' WHERE id=?`, w.e);
  P.createTask(w.db, w.admin, { project_id: w.pid, type_id: w.tt.NX, title: 'NX', operation_id: 'OP10', planned_min: 100, assignee_id: w.e });
  const out = JSON.stringify(I.exportForCncProcess(w.db));
  for (const bad of ['Jan', 'Testowy', sensitive, 'DOK-KADRY-123', 'e-ZLA', 'HR-REF-777', 'L4', 'Chorobowe', 'planned_min', 'employee', 'assignee', 'efektywn']) {
    assert.ok(!out.includes(bad), `eksport zawiera „${bad}”`);
  }
  const data = JSON.parse(out);
  assert.equal(data.format, 'cnc-team.exchange'); assert.equal(data.units.time, 'min');
  assert.deepEqual(data.projects[0].operations, ['OP10']);
  assert.deepEqual(data.projects[0].current_nc, { nc_program: 'PRG1', nc_rev: '03' });
});
