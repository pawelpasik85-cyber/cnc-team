'use strict';
// Testy przez HTTP: rozdzielenie ról w API i eksportach, CSRF, idempotencja, trwałość po restarcie.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');
const { openDb } = require('../server/db');
const People = require('../server/domain/people');
const X = require('../server/domain/exits');
const Abs = require('../server/domain/absences');

async function startServer(db) {
  const srv = createApp(db);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/api` };
}
function client(base) {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const h = { ...headers };
    if (method !== 'GET' && h['X-CNC-Request'] === undefined) h['X-CNC-Request'] = '1';
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return { call, login: (l) => call('POST', '/login', { login: l, password: 'haslo-testowe-1' }) };
}

function seedRoles(w) {
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-01', '2026-10-30');
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef2', display_name: 'Przełożony uprawniony', role: 'supervisor', can_view_confidential: true, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  X.createExit(w.db, w.admin, { employee_id: e2, start_date: '2026-10-05', start_time: '09:00', end_time: '10:00', confidential_note: 'NOTATKA-POUFNA', document_ref: 'DOK-1', written_request: true });
  Abs.createAbsence(w.db, w.admin, { employee_id: e2, category_id: w.cat.L4, status: 'wykorzystana', start_date: '2026-10-06', confidential_note: 'NOTATKA-L4' });
  return { e, e2 };
}

test('odmowa dostępu pracownika do raportów, API i eksportów; przełożony bez edycji; dane poufne', async () => {
  const w = makeWorld();
  const { e, e2 } = seedRoles(w);
  const { srv, base } = await startServer(w.db);
  try {
    const anon = client(base);
    assert.equal((await anon.call('GET', '/today')).status, 401);
    assert.equal((await anon.login('jan')).status, 200);
    assert.equal((await anon.call('POST', '/login', { login: 'jan', password: 'zle' })).status, 401);

    const emp = client(base); await emp.login('jan');
    for (const p of ['/reports/obecnosc', '/reports/plan_wykonanie', '/reports/obecnosc.csv', '/reports/wyjscia.csv', '/months/2026-10/report.csv',
      '/integration/cnc-process/export', '/audit', '/users', '/settings', '/leave/overview', '/leave/pools?employee_id=1', '/attendance', '/tasks/1/times', '/months', '/unit-choices']) {
      const r = await emp.call('GET', p);
      assert.equal(r.status, 403, `pracownik: GET ${p} → ${r.status}`);
    }
    for (const [m, p, b] of [['POST', '/absences', { employee_id: e, category_id: w.cat.L4, start_date: '2026-10-07' }], ['POST', '/exits', {}], ['POST', '/projects', {}],
      ['POST', '/schedule', {}], ['PUT', '/employees/1', {}], ['POST', '/months/2026-10/close', {}], ['POST', '/integration/cnc-process/import', '{}'], ['PUT', '/settings/company_name', { value: 'x' }]]) {
      const r = await emp.call(m, p, b);
      assert.equal(r.status, 403, `pracownik: ${m} ${p} → ${r.status}`);
    }
    // pracownik: tylko własne saldo, kalendarz bez szczegółów kategorii i notatek
    const bal = await emp.call('GET', '/balances?month=2026-10');
    assert.deepEqual(bal.data.map(b => b.employee_id), [e]);
    // programista: tylko zgłoszenia, kalendarze i plan pracy — listy wyjść, nieobecności, projektów, pracowników → 403
    for (const p of [`/exits?month=2026-10`, '/absences?from=2026-10-01&to=2026-10-31', '/projects', '/employees', '/board', '/handovers', '/today', '/makeups']) {
      assert.equal((await emp.call('GET', p)).status, 403, `pracownik: GET ${p}`);
    }
    const ev = await emp.call('GET', '/events?from=2026-10-01&to=2026-10-31');
    const txt = JSON.stringify(ev.data);
    assert.equal(ev.status, 200);
    assert.ok(!txt.includes('NOTATKA') && !txt.includes('Chorobowe') && txt.includes('Nieobecność'), 'w kalendarzu ogólna etykieta, bez notatek');
    assert.equal((await emp.call('GET', '/calendar/machines?from=2026-10-01&to=2026-10-31')).status, 200);
    const boot = JSON.stringify((await emp.call('GET', '/bootstrap')).data);
    assert.ok(!boot.includes('hr_reference') && !boot.includes('employment_start'));

    // przełożony: raporty tak, edycja nie, poufne tylko z uprawnieniem
    const sup = client(base); await sup.login('szef');
    assert.equal((await sup.call('GET', '/reports/plan_wykonanie')).status, 200);
    const csv = await sup.call('GET', '/reports/obecnosc.csv?from=2026-10-01&to=2026-10-31');
    assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal((await sup.call('POST', '/exits', { employee_id: e })).status, 403);
    assert.equal((await sup.call('GET', '/integration/cnc-process/export')).status, 403);
    const supExits = JSON.stringify((await sup.call('GET', '/exits?month=2026-10')).data);
    assert.ok(!supExits.includes('NOTATKA-POUFNA') && !supExits.includes('DOK-1'));
    const sup2 = client(base); await sup2.login('szef2');
    assert.ok(JSON.stringify((await sup2.call('GET', '/exits?month=2026-10')).data).includes('NOTATKA-POUFNA'));

    // CSRF: zapis bez nagłówka odrzucony nawet dla administratora
    const adm = client(base); await adm.login('admin');
    const noCsrf = await adm.call('POST', '/holidays', { date: '2026-12-31', name: 'Firmowe' }, { 'X-CNC-Request': '' });
    assert.equal(noCsrf.status, 403);
  } finally { srv.close(); }
});

test('ochrona przed podwójnym zapisem: ten sam klucz idempotencji tworzy jeden wpis', async () => {
  const w = makeWorld();
  const { e } = seedRoles(w);
  const { srv, base } = await startServer(w.db);
  try {
    const adm = client(base); await adm.login('admin');
    const body = { employee_id: e, start_date: '2026-10-08', start_time: '09:00', end_time: '09:30', written_request: true };
    const r1 = await adm.call('POST', '/exits', body, { 'Idempotency-Key': 'klucz-1' });
    const r2 = await adm.call('POST', '/exits', body, { 'Idempotency-Key': 'klucz-1' });
    assert.equal(r1.status, 200); assert.equal(r2.status, 200);
    assert.equal(r2.headers.get('idempotent-replay'), 'true');
    assert.equal(r1.data.id, r2.data.id);
    assert.equal(w.db.get('SELECT COUNT(*) n FROM private_exits WHERE work_date=?', '2026-10-08').n, 1);
    // drugi zapis bez klucza → kolizja (nakładanie)
    assert.equal((await adm.call('POST', '/exits', body)).status, 409);
  } finally { srv.close(); }
});

test('zapis po restarcie: dane w pliku bazy, migracje nie są powtarzane', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-team-'));
  const file = path.join(dir, 'test.db');
  try {
    const w = makeWorld({ file });
    const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-09');
    const ex = X.createExit(w.db, w.admin, { employee_id: e, start_date: '2026-10-05', start_time: '09:00', end_time: '10:30' });
    w.db.close();
    const db2 = openDb(file);
    assert.equal(db2.get('SELECT minutes FROM private_exits WHERE id=?', ex.id).minutes, 90);
    assert.equal(db2.get('SELECT COUNT(*) n FROM schedule_entries').n, 7);
    assert.equal(db2.get('SELECT COUNT(*) n FROM schema_migrations').n, require('node:fs').readdirSync(require('node:path').join(__dirname, '..', 'server', 'migrations')).filter(f => f.endsWith('.sql')).length);
    assert.ok(db2.get(`SELECT 1 FROM audit_log WHERE entity='private_exit'`));
    db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
