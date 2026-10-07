'use strict';
// Analiza kierownika: przebieg projektu, podobne projekty z odrzucaniem, miesiąc vs rok wcześniej, rok vs lata, zapisane raporty i dostęp.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const A = require('../server/domain/analytics');

function world() {
  const w = makeWorld({ today: '2026-10-20' });
  const e = w.emp('Jan');
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  // Zakończony projekt z historią: zadania z planem, czas w różnych dniach, daty zakończenia
  const mk = (order, family, machine, start, due, rows) => {
    const id = P.saveProject(w.db, w.admin, { order_no: order, part_no: 'D', part_rev: 'A', part_family: family, machine_id: machine, start_date: start, due_date: due });
    for (const [code, plan, entries, doneDate] of rows) {
      const t = P.createTask(w.db, w.admin, { project_id: id, type_id: tt[code], title: code, planned_min: plan });
      for (const [d, a, rw] of entries) P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: e, work_date: d, active_min: a, rework_min: rw || 0, ...(rw ? { cause: 'zmiana_zakresu' } : {}) });
      if (doneDate) {
        P.updateTask(w.db, w.admin, t, { status: 'zakonczone', result_confirmation: 'ok' });
        w.db.run('UPDATE tasks SET completed_at=? WHERE id=?', `${doneDate}T10:00:00.000Z`, t);
      }
    }
    return id;
  };
  const base = mk('ZL-1', 'tacki', 'M-HARTFORD', '2026-10-01', '2026-10-10', [
    ['NX', 240, [['2026-10-01', 120], ['2026-10-02', 150, 30]], '2026-10-02'],
    ['WERYFIKACJA', 60, [['2026-10-05', 90]], '2026-10-05']]);
  const sim1 = mk('ZL-2', 'tacki', 'M-HARTFORD', '2025-10-01', '2025-10-10', [['NX', 200, [['2025-10-02', 200]], '2025-10-03'], ['WERYFIKACJA', 60, [['2025-10-06', 50]], '2025-10-06']]);
  const sim2 = mk('ZL-3', 'tacki', 'M-GRIMME', '2025-09-01', '2025-09-05', [['NX', 300, [['2025-09-02', 400]], '2025-09-04']]);
  const other = mk('ZL-4', 'wsporniki', 'M-GRIMME', '2025-08-01', '2025-08-05', [['TECHNOLOGIA', 120, [['2025-08-02', 100]], '2025-08-02']]);
  for (const id of [base, sim1, sim2, other]) w.db.run(`UPDATE projects SET status='zakonczony' WHERE id=?`, id);
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  return { ...w, e, base, sim1, sim2, other };
}

test('przebieg projektu: dzienne i narastające godziny, postęp wg zakończeń, zadania plan vs wykonanie', () => {
  const w = world();
  const pr = A.projectProcess(w.db, w.base);
  assert.equal(pr.complete, true);
  assert.equal(pr.summary.finish_date, '2026-10-05');
  assert.equal(pr.summary.duration_days, 5);
  assert.equal(pr.summary.due_delta_days, -5, '5 dni przed terminem');
  assert.equal(pr.summary.worked_min, 120 + 180 + 90);
  assert.equal(pr.summary.planned_min, 300);
  assert.equal(pr.summary.diff_pct, 30);
  assert.equal(pr.series.length, 5);
  assert.equal(pr.series[4].cum_min, 390);
  assert.deepEqual(pr.series.map(s => s.progress_pct), [0, 67, 67, 67, 100], 'NX waga 4 z 6 zakończone 2.10');
  assert.equal(pr.tasks.find(t => t.title === 'NX').diff_min, 60);
});

test('podobne projekty: punktacja, średnia, odrzucenie i przywrócenie propozycji z historią', () => {
  const w = world();
  let s = A.similarProjects(w.db, w.base);
  assert.deepEqual(s.similar.map(x => x.id), [w.sim1, w.sim2], 'ta sama rodzina + maszyna wyżej; inna rodzina odpada');
  assert.ok(s.similar[0].why.some(x => /rodzina/.test(x)));
  assert.equal(s.average.count, 2);
  A.rejectSimilar(w.db, w.admin, w.base, w.sim2, { reason: 'inna technologia mocowania' });
  s = A.similarProjects(w.db, w.base);
  assert.deepEqual(s.similar.map(x => x.id), [w.sim1]);
  assert.equal(s.rejected[0].id, w.sim2); assert.equal(s.rejected[0].rejected.reason, 'inna technologia mocowania');
  assert.equal(s.average.worked_min, 250, 'średnia bez odrzuconego');
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='project_comparison' AND action='odrzucenie_propozycji'`));
  A.restoreSimilar(w.db, w.admin, w.base, w.sim2);
  assert.equal(A.similarProjects(w.db, w.base).similar.length, 2);
});

test('miesiąc wobec tego samego miesiąca rok wcześniej; rok wobec innych lat', () => {
  const w = world();
  const m = A.monthCompare(w.db, '2026-10');
  assert.equal(m.previous.year_month, '2025-10');
  assert.equal(m.current_kpi.worked_min, 390); assert.equal(m.previous_kpi.worked_min, 250);
  assert.deepEqual(m.delta.worked_min, { diff: 140, pct: 56 });
  assert.equal(m.current_kpi.rework_min, 30);
  assert.equal(m.current_kpi.tasks_done, 2); assert.equal(m.current_kpi.projects_done, 1);
  assert.equal(m.current_kpi.tasks_diff_pct, 30);
  const y = A.yearCompare(w.db, 2026, [2025]);
  assert.equal(y.years[0].totals.worked_min, 390);
  assert.equal(y.years[1].totals.worked_min, 250 + 400 + 100);
  assert.equal(y.years[1].months[8].worked_min, 400, 'wrzesień 2025');
  assert.equal(y.years[1].totals.tasks_diff_pct, Math.round(((750 - 680) / 680) * 100));
  assert.ok(y.available.includes(2025));
  assert.equal(y.years[0].months[11].worked_min, null, 'grudzień 2026 jeszcze nie nastąpił — brak danych, nie zero');
  assert.equal(y.years[1].months[11].worked_min, 0);
});

test('dostęp: analiza tylko dla kierownika; raport zapisany i udostępniony widzi przełożony; pracownik nic', async () => {
  const w = world();
  const srv = createApp(w.db);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const client = async (login) => {
    let cookie = '';
    const call = async (method, p, body) => {
      const res = await fetch(base + p, { method, headers: { ...(method !== 'GET' ? { 'X-CNC-Request': '1' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const t = await res.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
      return { status: res.status, data: d };
    };
    await call('POST', '/login', { login, password: 'haslo-testowe-1' });
    return call;
  };
  try {
    const adm = await client('admin'), szef = await client('szef'), jan = await client('jan');
    for (const p of [`/analytics/projects/${w.base}`, '/analytics/month?ym=2026-10', '/analytics/year?year=2026', '/analytics/export.csv?kind=miesiac&ref=2026-10']) {
      assert.equal((await adm(p === p ? 'GET' : 'GET', p)).status, 200, p);
      assert.equal((await szef('GET', p)).status, 403, `przełożony ${p}`);
      assert.equal((await jan('GET', p)).status, 403, `pracownik ${p}`);
    }
    const csv = await adm('GET', '/analytics/export.csv?kind=rok&ref=2026&compare=2025');
    assert.match(csv.data, /2025-09/);
    assert.equal((await szef('POST', `/analytics/projects/${w.base}/similar/${w.sim2}/reject`, { reason: 'x' })).status, 403);
    const r1 = await adm('POST', '/saved-reports', { kind: 'miesiac', ref: '2026-10', note: 'Dla dyrektora' });
    const r2 = await adm('POST', '/saved-reports', { kind: 'projekt', ref: w.base, shared: true });
    assert.equal((await szef('GET', '/saved-reports')).data.map(r => r.id).join(), String(r2.data.id), 'przełożony widzi tylko udostępniony');
    assert.equal((await szef('GET', `/saved-reports/${r1.data.id}`)).status, 404);
    assert.equal((await szef('GET', `/saved-reports/${r2.data.id}`)).data.data.process.summary.worked_min, 390);
    assert.equal((await szef('PATCH', `/saved-reports/${r2.data.id}`, { shared: false })).status, 403);
    await adm('PATCH', `/saved-reports/${r1.data.id}`, { shared: true });
    assert.equal((await szef('GET', '/saved-reports')).data.length, 2);
    assert.equal((await jan('GET', '/saved-reports')).status, 403);
    // migawka: późniejsze zmiany nie zmieniają zapisanego raportu
    w.db.run(`UPDATE task_time_entries SET active_min = active_min + 600 WHERE work_date = '2026-10-01'`);
    assert.equal((await adm('GET', `/saved-reports/${r1.data.id}`)).data.data.current_kpi.worked_min, 390);
    assert.equal((await adm('GET', '/analytics/month?ym=2026-10')).data.current_kpi.worked_min, 990);
  } finally { srv.close(); }
});

test('przegląd: bieżący miesiąc i rok porównywane do tego samego dnia; długi projekt próbkowany co tydzień do pełnej sumy', () => {
  const w = world(); // dziś 2026-10-20
  const m = A.monthCompare(w.db, '2026-10');
  assert.deepEqual(m.partial, { until_day: 20 });
  assert.equal(m.previous.to, '2025-10-20');
  assert.throws(() => A.monthCompare(w.db, '2026-11'), /nie zaczął/);
  assert.equal(A.monthCompare(w.db, '2026-09').partial, null);
  const y = A.yearCompare(w.db, 2026, ['2025', '2025', 'x']);
  assert.deepEqual(y.years.map(x => x.year), [2026, 2025], 'lata bez powtórzeń');
  assert.deepEqual(y.period, { ytd: true, until: '10-20' });
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-L', part_no: 'D', part_rev: 'A', start_date: '2025-01-01', due_date: '2026-06-01' });
  const t = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'długie', planned_min: 100 });
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2025-01-02', active_min: 60 });
  P.addTimeEntry(w.db, w.admin, { task_id: t, employee_id: w.e, work_date: '2026-09-01', active_min: 60 });
  P.updateTask(w.db, w.admin, t, { status: 'zakonczone', result_confirmation: 'ok' });
  w.db.run('UPDATE tasks SET completed_at=? WHERE id=?', '2026-09-01T10:00:00.000Z', t);
  const pr = A.projectProcess(w.db, pid);
  assert.equal(pr.step_days, 7);
  assert.equal(pr.series[pr.series.length - 1].date, '2026-09-01');
  assert.equal(pr.series[pr.series.length - 1].cum_min, 120, 'ostatni punkt = pełna suma');
  assert.equal(pr.series[pr.series.length - 1].plan_progress_pct, 100);
});
