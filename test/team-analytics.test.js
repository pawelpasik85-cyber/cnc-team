'use strict';
// Analiza zespołu: programiści, detale (praca jednostkowa), struktura czasu — wyliczenia i dostęp tylko dla kierownika.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const TA = require('../server/domain/team-analytics');

function world() {
  const w = makeWorld({ today: '2026-10-20' });
  const jan = w.emp('Jan'), ewa = w.emp('Ewa');
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const mk = (order, family, machine, start, due, rows) => {
    const id = P.saveProject(w.db, w.admin, { order_no: order, part_no: 'D', part_rev: 'A', part_family: family, machine_id: machine, start_date: start, due_date: due });
    for (const [code, plan, who, entries, doneDate] of rows) {
      const t = P.createTask(w.db, w.admin, { project_id: id, type_id: tt[code], title: code, planned_min: plan, assignee_id: who });
      for (const [d, a, rw, bl] of entries) P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: who, work_date: d, active_min: a, rework_min: rw || 0, blocked_min: bl || 0, ...(rw || bl ? { cause: 'narzedzia' } : {}) });
      if (doneDate) { P.updateTask(w.db, w.admin, t, { status: 'zakonczone', result_confirmation: 'ok' }); w.db.run('UPDATE tasks SET completed_at=? WHERE id=?', `${doneDate}T10:00:00.000Z`, t); }
    }
    return id;
  };
  // Hartford: Jan, plan 300, wykonanie 360 (w tym 60 poprawek), termin dotrzymany
  mk('ZL-H', 'tacki', 'M-HARTFORD', '2026-10-01', '2026-10-10', [['NX', 300, jan, [['2026-10-01', 200], ['2026-10-02', 100, 60]], '2026-10-02']]);
  // Grimme: Ewa, plan 600, wykonanie 540, po terminie, z blokadą 30 min
  mk('ZL-G', 'wsporniki', 'M-GRIMME', '2026-10-01', '2026-10-03', [['NX', 600, ewa, [['2026-10-02', 300], ['2026-10-05', 240, 0, 30]], '2026-10-05']]);
  return { ...w, jan, ewa };
}

test('analiza zespołu: programiści — godziny na maszynach, dokładność planu, poprawki', () => {
  const w = world();
  const d = TA.teamAnalysis(w.db, 'programisci', '2026-10-01', '2026-10-20');
  const jan = d.rows.find(r => r.employee_id === w.jan), ewa = d.rows.find(r => r.employee_id === w.ewa);
  assert.equal(jan.worked_min, 360);
  assert.equal(jan.by_machine.find(m => m.machine_id === 'M-HARTFORD').worked_min, 360);
  assert.equal(jan.plan_diff_pct, 20);
  assert.equal(jan.rework_min, 60);
  assert.equal(ewa.worked_min, 540);
  assert.equal(ewa.plan_diff_pct, -10);
  assert.equal(ewa.blocked_min, 30);
  assert.equal(d.team_min, 900);
  // okres bez pracy
  assert.equal(TA.teamAnalysis(w.db, 'programisci', '2026-09-01', '2026-09-30').rows.length, 0);
});

test('analiza zespołu: detale — zakończone w okresie, średnie wg rodziny i maszyny, terminowość', () => {
  const w = world();
  const d = TA.teamAnalysis(w.db, 'detale', '2026-10-01', '2026-10-20');
  assert.equal(d.total.count, 2);
  assert.equal(d.total.on_time_pct, 50);
  const g = d.groups.find(x => x.part_family === 'wsporniki');
  assert.equal(g.avg_worked_min, 540); assert.equal(g.plan_diff_pct, -10);
  const h = d.machines.find(m => m.machine_id === 'M-HARTFORD');
  assert.equal(h.count, 1); assert.equal(h.plan_diff_pct, 20);
  // projekt zakończony 05.10 nie należy do okresu 01–04.10
  assert.equal(TA.teamAnalysis(w.db, 'detale', '2026-10-01', '2026-10-04').total.count, 1);
});

test('analiza zespołu: struktura czasu i przyczyny; walidacja okresu', () => {
  const w = world();
  const d = TA.teamAnalysis(w.db, 'struktura', '2026-10-01', '2026-10-20');
  assert.equal(d.kinds.worked_min, 900);
  assert.equal(d.kinds.rework_min, 60);
  assert.equal(d.kinds.blocked_min, 30);
  const nx = d.types.find(t => t.code === 'NX');
  assert.equal(nx.worked_min, 900);
  assert.deepEqual(d.causes.map(c => c.cause), ['narzedzia']);
  assert.throws(() => TA.teamAnalysis(w.db, 'struktura', '2026-10-20', '2026-10-01'), /późniejsza/);
  assert.throws(() => TA.teamAnalysis(w.db, 'struktura', '2026-1-1', '2026-10-01'), /RRRR/);
  assert.throws(() => TA.teamAnalysis(w.db, 'nic', '2026-10-01', '2026-10-02'), /Nieznany/);
});

test('analiza zespołu: tylko kierownik (przełożony i programista — 403)', async () => {
  const w = world();
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: w.jan, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Szef', role: 'supervisor', password: 'haslo-testowe-1' });
  const srv = createApp(w.db);
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const login = async (l) => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CNC-Request': '1' }, body: JSON.stringify({ login: l, password: 'haslo-testowe-1' }) });
    const c = (r.headers.get('set-cookie') || '').split(';')[0];
    return (p) => fetch(`${base}${p}`, { headers: { Cookie: c } });
  };
  try {
    const adm = await login('admin'), sup = await login('szef'), emp = await login('jan');
    const ok = await adm('/analytics/team?kind=programisci&from=2026-10-01&to=2026-10-20');
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).rows.length, 2);
    assert.equal((await adm('/analytics/team?kind=detale&from=2026-10-20&to=2026-10-01')).status, 400);
    assert.equal((await sup('/analytics/team?kind=programisci')).status, 403);
    assert.equal((await emp('/analytics/team?kind=programisci')).status, 403);
  } finally { srv.close(); }
});
