'use strict';
// Analiza i raporty są wyłącznie dla kierownika: programista i gość nie widzą niczego (403), przełożony — tylko raporty udostępnione.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const A = require('../server/domain/analytics');

test('analiza: programista, gość i przełożony bez dostępu do danych analizy; nadgodziny projektu tylko u kierownika', async () => {
  const w = makeWorld({ today: '2026-10-20' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-05', '2026-10-09');
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'klient', display_name: 'Gość', role: 'guest', password: 'haslo-testowe-1' });
  w.db.run(`UPDATE settings SET value='tak' WHERE key='employee_sees_project_hours'`);
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-1', part_no: 'D', part_rev: 'A', responsible_ids: [e] });
  const tid = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'NX', planned_min: 600, assignee_id: e });
  People.addScheduleEntry(w.db, w.admin, { employee_id: e, work_date: '2026-10-10', shift_template_id: w.tpl.I, mode: 'dodatkowa', reason: 'termin' });
  P.addTimeEntry(w.db, w.admin, { task_id: tid, employee_id: e, work_date: '2026-10-10', active_min: 300 });
  const shared = A.saveReport(w.db, w.admin, { kind: 'miesiac', ref: '2026-10', title: 'Dla przełożonego', shared: true });
  const priv = A.saveReport(w.db, w.admin, { kind: 'miesiac', ref: '2026-10', title: 'Tylko moje' });
  const srv = createApp(w.db);
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
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
  const sid = (r) => (r && (r.id || r)) ;
  const routes = [
    ['GET', `/analytics/projects/${pid}`], ['GET', '/analytics/month?ym=2026-10'], ['GET', '/analytics/year?year=2026'],
    ['GET', '/analytics/export.csv?kind=miesiac&ref=2026-10'], ['POST', `/analytics/projects/${pid}/similar/${pid}/reject`, { reason: 'x' }],
    ['POST', '/saved-reports', { kind: 'miesiac', ref: '2026-10', title: 'x' }], ['DELETE', `/saved-reports/${sid(shared)}`],
  ];
  try {
    const jan = await client('jan'), szef = await client('szef'), gosc = await client('klient'), adm = await client('admin');
    for (const [who, call] of [['programista', jan], ['gość', gosc], ['przełożony', szef]]) {
      for (const [m, p, b] of routes) assert.equal((await call(m, p, b)).status, 403, `${who}: ${m} ${p}`);
    }
    for (const call of [jan, gosc]) {
      assert.equal((await call('GET', '/saved-reports')).status, 403);
      assert.equal((await call('GET', `/saved-reports/${sid(shared)}`)).status, 403);
    }
    const list = (await szef('GET', '/saved-reports')).data;
    assert.deepEqual(list.map(r => r.title), ['Dla przełożonego'], 'przełożony widzi tylko udostępnione');
    assert.equal((await szef('GET', `/saved-reports/${sid(priv)}`)).status, 404);
    const pj = (await jan('GET', `/projects/${pid}`)).data;
    assert.ok(pj.hours, 'programista widzi godziny projektu (ustawienie firmy)');
    assert.equal(pj.hours.overtime_work_min, undefined, 'ale nie dane o nadgodzinach');
    assert.equal((await szef('GET', `/projects/${pid}`)).data.hours.overtime_work_min, undefined);
    assert.equal((await adm('GET', `/projects/${pid}`)).data.hours.overtime_work_min, 300);
    assert.equal((await adm('GET', '/analytics/month?ym=2026-10')).status, 200);
  } finally { srv.close(); }
});
