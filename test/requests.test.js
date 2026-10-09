'use strict';
// Zgłoszenia do weryfikacji, rola gościa, widoczność projektów dla pracownika, opóźnienie projektu, blokada logowania, opis zmian.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const P = require('../server/domain/projects');
const X = require('../server/domain/exits');

async function startServer(db) {
  const srv = createApp(db);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}/api` };
}
function client(base) {
  let cookie = '';
  const call = async (method, p, body) => {
    const h = {};
    if (method !== 'GET') h['X-CNC-Request'] = '1';
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
  return { call, login: (l, password = 'haslo-testowe-1') => call('POST', '/login', { login: l, password }) };
}

function world() {
  const w = makeWorld();
  const e = w.emp('Jan'); w.shifts(e, '2026-10-01', '2026-10-30');
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-01', '2026-10-30');
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'ewa', display_name: 'Ewa', role: 'employee', employee_id: e2, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  const tt = Object.fromEntries(w.db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  return { ...w, e, e2, tt };
}

test('zgłoszenia: pracownik tylko zgłasza, kierownik przyjmuje (wyjście, odrobienie) lub odrzuca; brak bezpośrednich zapisów', async () => {
  const w = world();
  const { srv, base } = await startServer(w.db);
  try {
    const jan = client(base); await jan.login('jan');
    const ewa = client(base); await ewa.login('ewa');
    const szef = client(base); await szef.login('szef');
    const adm = client(base); await adm.login('admin');

    // Pracownik nie może niczego wpisać bezpośrednio
    for (const [m, p, b] of [['POST', '/exits', { employee_id: w.e, start_date: '2026-10-06', start_time: '06:00', end_time: '06:40' }],
      ['POST', '/makeups', { employee_id: w.e }], ['POST', '/absences', { employee_id: w.e }], ['PATCH', '/tasks/1', { status: 'zakonczone' }],
      ['POST', '/time-entries', {}], ['POST', '/handovers', {}], ['PUT', '/board/M-HARTFORD', {}]]) {
      assert.equal((await jan.call(m, p, b)).status, 403, `${m} ${p}`);
    }
    // Walidacja i duplikaty
    assert.equal((await jan.call('POST', '/requests', { kind: 'spoznienie', date_from: '2026-10-06' })).status, 400);
    const r1 = await jan.call('POST', '/requests', { kind: 'spoznienie', date_from: '2026-10-06', time_to: '06:40', note: 'korek', client_id: 'abc-1' });
    assert.equal(r1.status, 200);
    const dup = await jan.call('POST', '/requests', { kind: 'spoznienie', date_from: '2026-10-06', time_to: '06:40', client_id: 'abc-1' });
    assert.equal(dup.data.id, r1.data.id); assert.equal(dup.data.duplicate, true);
    // Kierownik nie składa zgłoszeń w imieniu pracownika
    assert.equal((await adm.call('POST', '/requests', { kind: 'spoznienie', date_from: '2026-10-06', time_to: '06:40' })).status, 403);
    // Wycofanie własnego, nierozpatrzonego
    const r2 = await jan.call('POST', '/requests', { kind: 'nieobecnosc', date_from: '2026-10-08' });
    assert.equal((await ewa.call('POST', `/requests/${r2.data.id}/withdraw`)).status, 404, 'cudzego nie wycofa');
    assert.equal((await jan.call('POST', `/requests/${r2.data.id}/withdraw`)).data.status, 'wycofane');
    // Tylko kierownik decyduje
    assert.equal((await jan.call('POST', `/requests/${r1.data.id}/decide`, { decision: 'przyjete' })).status, 403);
    assert.equal((await szef.call('POST', `/requests/${r1.data.id}/decide`, { decision: 'przyjete' })).status, 403);
    assert.equal((await adm.call('POST', `/requests/${r1.data.id}/decide`, { decision: 'odrzucone' })).status, 400, 'odrzucenie wymaga wyjaśnienia');
    const d1 = await adm.call('POST', `/requests/${r1.data.id}/decide`, { decision: 'przyjete', target: { type: 'exit' } });
    assert.equal(d1.status, 200); assert.match(d1.data.result_ref, /^exit:/);
    const exits = X.listExits(w.db, { employeeId: w.e, month: '2026-10' });
    assert.equal(exits.length, 1); assert.equal(exits[0].minutes, 40); assert.match(exits[0].document_ref, /zgłoszenie pracownika #/);
    assert.equal((await adm.call('POST', `/requests/${r1.data.id}/decide`, { decision: 'przyjete', target: { type: 'exit' } })).status, 409, 'jedna decyzja');
    // Odrobienie po zmianie (14:00–14:40) → przyjęte jako odrabianie przypisane do wyjścia
    const r3 = await jan.call('POST', '/requests', { kind: 'odrobienie', date_from: '2026-10-07', time_from: '14:00', time_to: '14:40' });
    const d3 = await adm.call('POST', `/requests/${r3.data.id}/decide`, { decision: 'przyjete', target: { type: 'makeup' }, note: 'ok' });
    assert.equal(d3.status, 200, JSON.stringify(d3.data)); assert.match(d3.data.result_ref, /^makeup:/);
    assert.equal(X.monthBalances(w.db, '2026-10').find(b => b.employee_id === w.e).remaining_min, 0);
    // Odrobienie bez wyjścia do odrobienia — konflikt, zgłoszenie pozostaje nowe
    const r4 = await ewa.call('POST', '/requests', { kind: 'odrobienie', date_from: '2026-10-07', time_from: '14:00', time_to: '15:00' });
    assert.equal((await adm.call('POST', `/requests/${r4.data.id}/decide`, { decision: 'przyjete', target: { type: 'makeup' } })).status, 409);
    assert.equal(w.db.get('SELECT status FROM requests WHERE id=?', r4.data.id).status, 'nowe');
    const rej = await adm.call('POST', `/requests/${r4.data.id}/decide`, { decision: 'odrzucone', note: 'brak wyjścia do odrobienia' });
    assert.equal(rej.data.status, 'odrzucone');
    // Każdy widzi tylko swoje; przełożony podgląd wszystkich
    const mine = await jan.call('GET', '/requests');
    assert.ok(mine.data.every(r => r.employee_id === w.e)); assert.equal(mine.data.length, 3);
    assert.ok(mine.data.every(r => r.user_id === undefined));
    assert.equal((await szef.call('GET', '/requests')).data.length, 4);
    // Historia: kto zgłosił, kto zdecydował
    const hist = w.db.all(`SELECT action, user_id FROM audit_log WHERE entity='request' AND entity_id=? ORDER BY id`, String(r1.data.id));
    assert.deepEqual(hist.map(h => h.action), ['zgloszenie', 'przyjecie']);
    assert.notEqual(hist[0].user_id, hist[1].user_id);
  } finally { srv.close(); }
});

test('gość widzi wyłącznie status przypisanych projektów w realizacji — bez osób i innych danych', async () => {
  const w = world();
  const p1 = P.saveProject(w.db, w.admin, { order_no: 'ZL-1', part_no: 'DET-1', part_rev: 'A', machine_id: 'M-HARTFORD', start_date: '2026-10-01', due_date: '2026-10-11', responsible_ids: [w.e] });
  P.createTask(w.db, w.admin, { project_id: p1, type_id: w.tt.NX, title: 'Program NX', assignee_id: w.e, weight: 5 });
  P.createTask(w.db, w.admin, { project_id: p1, type_id: w.tt.WERYFIKACJA, title: 'Weryfikacja', weight: 5 });
  const p2 = P.saveProject(w.db, w.admin, { order_no: 'ZL-2', part_no: 'DET-2', part_rev: 'A', start_date: '2026-10-01', due_date: '2026-10-20' });
  const p3 = P.saveProject(w.db, w.admin, { order_no: 'ZL-3', part_no: 'DET-3', part_rev: 'A', status: 'zakonczony' });
  People.saveUser(w.db, w.admin, { login: 'klient', display_name: 'Klient', role: 'guest', password: 'haslo-testowe-1', guest_project_ids: [p1, p3] });
  const { srv, base } = await startServer(w.db);
  try {
    const g = client(base); await g.login('klient');
    const list = await g.call('GET', '/guest/projects');
    assert.equal(list.status, 200);
    assert.deepEqual(list.data.map(p => p.id), [p1], 'tylko przypisany i w realizacji');
    const txt = JSON.stringify(list.data);
    assert.ok(!/Jan|Ewa|Testowy|assignee|responsible|planned_min|contributions/.test(txt), 'bez osób i czasów');
    assert.equal(list.data[0].schedule.planned_percent, 50);
    for (const p of ['/today', '/projects', `/projects/${p1}`, `/projects/${p2}`, '/bootstrap', '/employees', '/schedule', '/events', '/board', '/handovers', '/requests', '/exits', '/balances']) {
      assert.equal((await g.call('GET', p)).status, 403, p);
    }
    assert.equal((await g.call('POST', '/requests', { kind: 'inne', date_from: '2026-10-06', note: 'x' })).status, 403);
    // Wersja firmowa: brak jakiejkolwiek integracji z chmurą
    const admc = client(base); await admc.login('admin');
    for (const p of ['/cloud/status', '/cloud/reports', '/cloud/preview']) assert.equal((await admc.call('GET', p)).status, 404, p);
    // Pracownik nie ma dostępu do widoku gościa
    const jan = client(base); await jan.login('jan');
    assert.equal((await jan.call('GET', '/guest/projects')).status, 403);
    // Kierownik widzi przypisania gościa
    const adm = client(base); await adm.login('admin');
    const users = (await adm.call('GET', '/users')).data;
    assert.deepEqual(users.find(u => u.login === 'klient').guest_project_ids.sort(), [p1, p3].sort());
  } finally { srv.close(); }
});

test('programista: tylko zgłoszenia, kalendarze i plan pracy — projekty i pozostałe dane tylko dla kierownika', async () => {
  const w = world();
  const p1 = P.saveProject(w.db, w.admin, { order_no: 'ZL-1', part_no: 'DET-1', part_rev: 'A' });
  P.createTask(w.db, w.admin, { project_id: p1, type_id: w.tt.NX, title: 'NX', assignee_id: w.e });
  const { srv, base } = await startServer(w.db);
  try {
    const jan = client(base); await jan.login('jan');
    for (const p of ['/projects', `/projects/${p1}`, '/board', '/handovers', '/today', '/exits', '/absences', '/leave/overview']) assert.equal((await jan.call('GET', p)).status, 403, p);
    for (const p of ['/bootstrap', '/schedule', '/events', '/calendar/machines', '/work-orders/my', '/requests', '/balances', '/me']) assert.equal((await jan.call('GET', p)).status, 200, p);
    // zakładka Pracownicy: tylko własny profil i własne urlopy
    assert.deepEqual((await jan.call('GET', '/employees')).data.map(e => e.id), [w.e]);
    assert.deepEqual((await jan.call('GET', '/leave/summary?year=2026')).data.map(e => e.employee_id), [w.e]);
  } finally { srv.close(); }
});

test('opóźnienie projektu w procentach: plan na dziś vs wykonanie, po terminie, brak danych', () => {
  const p = { start_date: '2026-10-01', due_date: '2026-10-11', status: 'aktywny' };
  const tasks = [{ weight: 2, status: 'zakonczone' }, { weight: 3, status: 'w_toku' }, { weight: 5, status: 'nowe' }, { weight: 4, status: 'anulowane' }];
  const s = P.scheduleStatus(p, tasks, '2026-10-06');
  assert.equal(s.planned_percent, 50); assert.equal(s.actual_percent, 20); assert.equal(s.delay_pct, 30); assert.equal(s.level, 'zagrozony');
  assert.equal(P.scheduleStatus(p, tasks, '2026-10-02').level, 'zgodnie', 'plan 10%, wykonanie 20% — przed planem');
  assert.equal(P.scheduleStatus(p, tasks, '2026-10-02').ahead_pct, 10);
  assert.equal(P.scheduleStatus(p, tasks, '2026-10-03', { warnPct: 5, alertPct: 15 }).level, 'zgodnie');
  assert.equal(P.scheduleStatus(p, tasks, '2026-10-04').level, 'opozniony', 'plan 30%, wykonanie 20%');
  const late = P.scheduleStatus(p, tasks, '2026-10-14');
  assert.equal(late.planned_percent, 100); assert.equal(late.overdue_days, 3); assert.equal(late.level, 'zagrozony');
  assert.equal(P.scheduleStatus({ ...p, due_date: null }, tasks, '2026-10-06').delay_pct, null);
  assert.match(P.scheduleStatus(p, [], '2026-10-06').note, /brak zadań/);
});

test('blokada logowania po serii błędnych haseł; opis zmian w historii', async () => {
  const w = world();
  const pid = P.saveProject(w.db, w.admin, { order_no: 'ZL-9', part_no: 'D-9', part_rev: 'A', due_date: '2026-11-01' });
  const { srv, base } = await startServer(w.db);
  try {
    const c = client(base);
    for (let i = 0; i < 5; i++) assert.equal((await c.login('jan', 'zle-haslo-xx')).status, 401);
    const locked = await c.login('jan');
    assert.equal(locked.status, 429); assert.match(locked.data.error, /Spróbuj ponownie za \d+ min/);
    assert.equal((await client(base).login('ewa')).status, 200, 'inne konto działa');
    assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE action='blokada_logowania' AND entity_id='jan'`));
    // Opis zmiany: które pole, było → jest, kto
    const adm = client(base); await adm.login('admin');
    const p = (await adm.call('GET', `/projects/${pid}`)).data;
    await adm.call('PUT', `/projects/${pid}`, { ...p, due_date: '2026-11-15', reason: 'przesunięcie przez klienta' });
    const h = (await adm.call('GET', `/audit?entity=project&entity_id=${pid}`)).data;
    const edit = h.find(a => a.action === 'edycja');
    assert.equal(edit.display_name, 'Admin'); assert.equal(edit.reason, 'przesunięcie przez klienta');
    assert.deepEqual(edit.changes.find(x => x.field === 'due_date'), { field: 'due_date', old: '2026-11-01', new: '2026-11-15' });
    assert.ok(!edit.changes.some(x => x.field === 'part_no'), 'tylko zmienione pola');
  } finally { srv.close(); }
});

test('migracja 003 na używanej bazie (konta, sesje, historia) — dane i klucze obce zachowane', () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { DatabaseSync } = require('node:sqlite');
  const { openDb } = require('../server/db');
  const { hashPassword } = require('../server/core');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-mig-'));
  const file = path.join(dir, 'stara.db');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const f of ['001_init.sql', '002_cloud.sql']) {
    raw.exec(fs.readFileSync(path.join(__dirname, '..', 'server', 'migrations', f), 'utf8'));
    raw.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(f, new Date().toISOString());
  }
  const now = new Date().toISOString();
  raw.prepare(`INSERT INTO users(login,display_name,password_hash,role,can_view_confidential,active,created_at) VALUES ('szef','Szef',?, 'admin',1,1,?)`).run(hashPassword('haslo-testowe-1'), now);
  raw.prepare(`INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES ('t1',1,?,?)`).run(now, now);
  raw.prepare(`INSERT INTO audit_log(at,user_id,entity,entity_id,action) VALUES (?,1,'session','1','logowanie')`).run(now);
  raw.prepare(`INSERT INTO projects(id,order_no,part_no,part_rev,due_date,created_at,updated_at) VALUES ('PRJ-1','Z','D','A','2026-01-10','2026-02-01T10:00:00Z','2026-02-01T10:00:00Z')`).run();
  raw.close();
  const db = openDb(file);
  assert.equal(db.get('SELECT COUNT(*) n FROM sessions').n, 1);
  assert.equal(db.get('SELECT role FROM users WHERE id=1').role, 'admin');
  assert.deepEqual(db.all('PRAGMA foreign_key_check'), []);
  assert.equal(db.get('PRAGMA foreign_keys').foreign_keys, 1, 'klucze obce znów włączone');
  assert.equal(db.get(`SELECT start_date FROM projects WHERE id='PRJ-1'`).start_date, '2026-01-10', 'start nie później niż termin');
  assert.match(db.get(`SELECT sql FROM sqlite_master WHERE name='users'`).sql, /'guest'/);
  assert.equal(db.get(`SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'cloud_%'`).n, 0, 'brak tabel chmury (wersja firmowa)');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('przegląd: odrobienie omija wyjście zajęte przez oczekujące odrabianie; blokada konto+adres; zaufane proxy; nietypowy rodzaj', async () => {
  const w = world();
  const s1 = X.createExit(w.db, w.admin, { employee_id: w.e, start_date: '2026-10-01', start_time: '07:00', end_time: '08:00' });
  X.createExit(w.db, w.admin, { employee_id: w.e, start_date: '2026-10-02', start_time: '07:00', end_time: '08:00' });
  X.createMakeup(w.db, w.admin, { employee_id: w.e, start_date: '2026-10-01', start_time: '14:00', end_time: '15:00', allocations: [{ exit_id: s1.id, minutes: 60 }] });
  const Req = require('../server/domain/requests');
  const jan = w.db.get(`SELECT * FROM users WHERE login='jan'`);
  const r = Req.createRequest(w.db, jan, { kind: 'odrobienie', date_from: '2026-10-05', time_from: '14:00', time_to: '15:00' });
  const d = Req.decideRequest(w.db, w.admin, r.id, { decision: 'przyjete', target: { type: 'makeup' } });
  assert.match(d.result_ref, /^makeup:/);
  assert.throws(() => Req.createRequest(w.db, jan, { kind: 'constructor', date_from: '2026-10-05' }), /rodzaj/);
  assert.throws(() => Req.createRequest(w.db, jan, { kind: 'nieobecnosc', date_from: '2027-12-01' }), /naprzód/);

  const srv = createApp(w.db, { trustProxy: true });
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  try {
    const post = (body, xff) => fetch(`${base}/login`, { method: 'POST', headers: { 'X-CNC-Request': '1', 'Content-Type': 'application/json', ...(xff ? { 'X-Forwarded-For': xff } : {}) }, body: JSON.stringify(body) });
    // atakujący z adresu 203.0.113.9 blokuje tylko siebie — kierownik z innego adresu loguje się dalej
    for (let i = 0; i < 5; i++) await post({ login: 'admin', password: 'zle-haslo-zz' }, '203.0.113.9');
    assert.equal((await post({ login: 'admin', password: 'haslo-testowe-1' }, '203.0.113.9')).status, 429);
    assert.equal((await post({ login: 'admin', password: 'haslo-testowe-1' }, '198.51.100.7')).status, 200);
    // klient dopisuje fałszywy adres na początku — liczy się ostatni (wpisany przez proxy)
    assert.equal((await post({ login: 'admin', password: 'haslo-testowe-1' }, '1.2.3.4, 203.0.113.9')).status, 429);
    // IIS dopisuje port — zmienny port nie omija blokady
    assert.equal((await post({ login: 'admin', password: 'haslo-testowe-1' }, '203.0.113.9:51234')).status, 429);
  } finally { srv.close(); }
  // historia ustawień: zmiana wartości widoczna jako pole „value”
  const { srv: s2, base: b2 } = await startServer(w.db);
  try {
    const adm = client(b2); assert.equal((await adm.login('admin')).status, 200);
    await adm.call('PUT', '/settings/employee_sees_all_projects', { value: 'tak' });
    const h = (await adm.call('GET', '/audit?entity=setting&entity_id=employee_sees_all_projects')).data;
    assert.deepEqual(h[0].changes, [{ field: 'value', old: 'nie', new: 'tak' }]);
  } finally { s2.close(); }
});
