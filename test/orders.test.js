'use strict';
// Plan pracy: polecenia kierownika na zmianę — tworzenie, ostrzeżenia, kolejność, ocena, przeniesienie, potwierdzenie przeczytania, dostęp.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const O = require('../server/domain/orders');

function world() {
  const w = makeWorld({ today: '2026-10-06' });
  const e = w.emp('Jan'); w.shifts(e, '2026-10-05', '2026-10-09');
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-05', '2026-10-09', 'II');
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'ewa', display_name: 'Ewa', role: 'employee', employee_id: e2, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'klient', display_name: 'Gość', role: 'guest', password: 'haslo-testowe-1' });
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-9', part_no: 'D', part_rev: 'A', machine_id: 'M-GRIMME' });
  const tid = P.createTask(w.db, w.admin, { project_id: pid, type_id: tt.NX, title: 'Programowanie 5X' });
  return { ...w, e, e2, pid, tid };
}

test('polecenia: zadanie i maszyna z projektu, kolejność, ostrzeżenia o grafiku i obciążeniu, ocena, przeniesienie', () => {
  const w = world();
  const a = O.createOrder(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-06', task_id: w.tid, planned_min: 300 });
  const o1 = w.db.get('SELECT * FROM work_orders WHERE id=?', a.id);
  assert.equal(o1.title, 'Programowanie 5X'); assert.equal(o1.project_id, w.pid); assert.equal(o1.machine_id, 'M-GRIMME'); assert.equal(o1.seq, 1);
  const b = O.createOrder(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-06', title: 'Weryfikacja programu OP20', planned_min: 240 });
  assert.match(b.warnings.join(), /przekracza długość zmiany/);
  const c = O.createOrder(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-10', title: 'Sobota' });
  assert.match(c.warnings.join(), /nie ma w tym dniu zmiany/);
  throwsStatus(assert, () => O.createOrder(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-06' }), 400, /Wpisz polecenie/);
  O.moveOrder(w.db, w.admin, b.id, 'up');
  assert.deepEqual(w.db.all(`SELECT id FROM work_orders WHERE work_date='2026-10-06' ORDER BY seq`).map(r => r.id), [b.id, a.id]);
  const day = O.dayPlan(w.db, '2026-10-06').employees.find(x => x.employee_id === w.e);
  assert.equal(day.planned_min, 540); assert.equal(day.shift_min, 480); assert.equal(day.load_pct, 113); assert.equal(day.unread, 2);
  throwsStatus(assert, () => O.updateOrder(w.db, w.admin, a.id, { status: 'czesciowo' }), 400, /co zostało/);
  O.updateOrder(w.db, w.admin, a.id, { status: 'czesciowo', result_note: 'Zostały fazy zewnętrzne' });
  throwsStatus(assert, () => O.updateOrder(w.db, w.admin, a.id, { title: 'inna treść' }), 409);
  O.updateOrder(w.db, w.admin, b.id, { status: 'wykonane' });
  const r = O.carryOver(w.db, w.admin, { from_date: '2026-10-06', to_date: '2026-10-07' });
  assert.equal(r.copied, 1, 'tylko niedokończone');
  const moved = w.db.get(`SELECT * FROM work_orders WHERE work_date='2026-10-07'`);
  assert.equal(moved.carried_from, a.id); assert.match(moved.details, /Zostały fazy zewnętrzne/);
  assert.equal(O.carryOver(w.db, w.admin, { from_date: '2026-10-06', to_date: '2026-10-07' }).copied, 0, 'bez duplikatów');
  throwsStatus(assert, () => O.updateOrder(w.db, w.admin, c.id, { status: 'anulowane' }), 400, /powodu/);
  O.updateOrder(w.db, w.admin, c.id, { status: 'anulowane', reason: 'brak materiału' });
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='work_order' AND action='anulowanie' AND reason='brak materiału'`));
});

test('dostęp: programista widzi tylko swoje i tylko potwierdza przeczytanie; zmiana treści wymaga ponownego potwierdzenia', async () => {
  const w = world();
  const a = O.createOrder(w.db, w.admin, { employee_id: w.e, work_date: '2026-10-06', task_id: w.tid });
  O.createOrder(w.db, w.admin, { employee_id: w.e2, work_date: '2026-10-06', title: 'Dla Ewy' });
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
  try {
    const jan = await client('jan'), ewa = await client('ewa'), szef = await client('szef'), gosc = await client('klient'), adm = await client('admin');
    const mine = (await jan('GET', '/work-orders/my?from=2026-10-06&to=2026-10-07')).data;
    assert.deepEqual(mine.map(o => o.employee_id), [w.e]);
    assert.equal((await jan('GET', '/work-orders/day?date=2026-10-06')).status, 403);
    assert.equal((await jan('POST', '/work-orders', { employee_id: w.e, work_date: '2026-10-06', title: 'sam sobie' })).status, 403);
    assert.equal((await jan('PATCH', `/work-orders/${a.id}`, { status: 'wykonane' })).status, 403);
    assert.equal((await ewa('POST', `/work-orders/${a.id}/ack`)).status, 403, 'cudzego nie potwierdzi');
    assert.ok((await jan('POST', `/work-orders/${a.id}/ack`)).data.ack_at);
    assert.equal((await jan('GET', `/projects/${w.pid}`)).status, 403, 'projekty — tylko kierownik; treść polecenia wystarcza programiście');
    assert.equal((await szef('GET', '/work-orders/day?date=2026-10-06')).status, 200);
    assert.equal((await szef('POST', '/work-orders', { employee_id: w.e, work_date: '2026-10-06', title: 'x' })).status, 403);
    assert.equal((await gosc('GET', '/work-orders/day?date=2026-10-06')).status, 403);
    assert.equal((await gosc('GET', '/work-orders/my')).status, 403);
    await adm('PATCH', `/work-orders/${a.id}`, { details: 'Nowa uwaga: oprawka HSK40' });
    assert.equal(w.db.get('SELECT ack_at FROM work_orders WHERE id=?', a.id).ack_at, null, 'zmieniona treść — ponowne potwierdzenie');
    assert.equal((await jan('GET', '/work-orders/my?from=2026-10-06&to=2026-10-06')).data.length, 1);
  } finally { srv.close(); }
});
