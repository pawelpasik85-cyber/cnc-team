'use strict';
// Narzędziownia: walidacja parametrów, dopasowania (oprawka ↔ głowica / frez, głowica ↔ płytka), stan z historią, dostęp.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld, throwsStatus } = require('./helpers');
const { createApp } = require('../server/app');
const People = require('../server/domain/people');
const Tools = require('../server/domain/tools');

const H = 'M-HARTFORD', G = 'M-GRIMME';
function world() {
  const w = makeWorld({ today: '2026-10-20' });
  const add = (kind, name, machine_id, params, extra = {}) => Tools.saveTool(w.db, w.admin, { kind, name, machine_id, params, ...extra }).id;
  const ids = {
    er32: add('oprawka', 'BT50-ER32', H, { interface: 'BT50', type: 'tulejkowa', clamp_min: 3, clamp_max: 20, collet: 'ER32' }),
    weldon20: add('oprawka', 'BT50-SLN20', H, { interface: 'BT50', type: 'weldon', clamp_min: 20 }),
    fmb22: add('oprawka', 'BT50-FMB22', H, { interface: 'BT50', type: 'trzpieniowa', arbor: 22 }),
    sf6g: add('oprawka', 'HSK40-SF06', G, { interface: 'HSK40', type: 'termo', clamp_min: 6, clamp_max: 6 }),
    head63: add('glowica', 'Głowica Ø63', H, { D: 63, z: 5, arbor: 22, insert_code: 'APMT1604' }),
    head25: add('glowica', 'Frez Ø25 chwyt 20', null, { D: 25, z: 3, shank: 20, insert_code: 'APMT 1135' }),
    apmt16: add('plytka', 'APMT1604PDER-M2', null, { shape: 'A', size: 16 }, { qty: 30, min_qty: 20 }),
    apmt11: add('plytka', 'apmt1135pder', null, { shape: 'A', size: 11 }, { qty: 5, min_qty: 20 }),
    vhm6: add('frez', 'VHM Ø6', null, { type: 'walcowo-czolowy', D: 6, z: 4, Lc: 13, L: 57 }),
    ball6h: add('frez', 'Kulisty Ø6 (Hartford)', H, { type: 'kulisty', D: 6, z: 2, shank: 6, Lc: 10, L: 60 }),
    big25: add('frez', 'VHM Ø25', null, { type: 'walcowo-czolowy', D: 25, z: 4, Lc: 40, L: 120 }),
  };
  return { ...w, ids };
}
const byName = (list) => Object.fromEntries(list.map(t => [t.name, t]));
const fitNames = (t) => t.fits.map(f => f.name).sort();

test('narzędzia: dopasowania z parametrów (trzpień, chwyt głowicy, gniazdo płytki, maszyna); frezy bez automatycznego dopasowania; stan poniżej minimum', () => {
  const w = world();
  const t = byName(Tools.listTools(w.db));
  assert.deepEqual(fitNames(t['BT50-FMB22']), ['Głowica Ø63']);
  assert.deepEqual(fitNames(t['Głowica Ø63']), ['APMT1604PDER-M2', 'BT50-FMB22']);
  assert.deepEqual(fitNames(t['BT50-SLN20']), ['Frez Ø25 chwyt 20'], 'Weldon Ø20 ↔ głowica z chwytem Ø20');
  assert.deepEqual(fitNames(t['Frez Ø25 chwyt 20']), ['BT50-ER32', 'BT50-SLN20', 'apmt1135pder'], 'gniazdo płytki bez rozróżniania wielkości liter i spacji');
  // frezy: oprawki nie są dobierane automatycznie (zespół przypisuje sam)
  assert.deepEqual(fitNames(t['VHM Ø6']), []);
  assert.deepEqual(fitNames(t['BT50-ER32']), ['Frez Ø25 chwyt 20'], 'oprawka bez automatycznie dobranych frezów');
  assert.deepEqual(fitNames(t['HSK40-SF06']), []);
  assert.equal(t.apmt1135pder.low, true); assert.equal(t['APMT1604PDER-M2'].low, false);
});

test('narzędzia: walidacja parametrów według rodzaju', () => {
  const w = world();
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'wiertarka', name: 'x' }), 400);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'oprawka', name: 'x', params: { interface: 'BT50', type: 'trzpieniowa' } }), 400, /Trzpień/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'oprawka', name: 'x', params: { interface: 'BT50', type: 'tulejkowa', clamp_min: 10, clamp_max: 4 } }), 400, /mniejsze/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'glowica', name: 'x', params: { D: 50 } }), 400, /ostrzy/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'plytka', name: 'x', params: { shape: 'Q', size: 10 } }), 400);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'x', params: { type: 'kulisty', D: -2 } }), 400, /Średnica/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'x', machine_id: 'M-NIEMA', params: { type: 'kulisty', D: 6, z: 2, Lc: 10, L: 60 } }), 400, /maszyna/i);
  // rodzaju nie da się zmienić edycją
  Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'APMT1604PDER-M2', params: { shape: 'A', size: 16 } }, w.ids.apmt16);
  assert.equal(w.db.get('SELECT kind FROM tools WHERE id=?', w.ids.apmt16).kind, 'plytka');
  // przecinek dziesiętny
  const id = Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'Wiertło 8,5', params: { type: 'wiertlo', D: '8,5', angle: 140, z: 2, Lc: '40', L: 89 } }).id;
  assert.equal(JSON.parse(w.db.get('SELECT params FROM tools WHERE id=?', id).params).D, 8.5);
});

test('narzędzia: edycja częściowa nie kasuje pól; oprawka zgodna z wrzecionem maszyny; liczby całkowite; „aktywne” tylko tak/nie', () => {
  const w = world();
  Tools.saveTool(w.db, w.admin, { location: 'Szafa 9', manufacturer: 'Kelch', reason: 'opis' }, w.ids.er32);
  Tools.saveTool(w.db, w.admin, { location: 'Szafa 10' }, w.ids.er32);
  const r = w.db.get('SELECT * FROM tools WHERE id=?', w.ids.er32);
  assert.equal(r.machine_id, H); assert.equal(r.manufacturer, 'Kelch'); assert.equal(r.location, 'Szafa 10'); assert.equal(JSON.parse(r.params).collet, 'ER32');
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'oprawka', name: 'BT50 na Grimme', machine_id: G, params: { interface: 'BT50', type: 'termo', clamp_min: 6 } }), 400, /HSK40/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'oprawka', name: 'bez interfejsu', params: { type: 'termo', clamp_min: 6 } }), 400, /Interfejs/);
  const auto = Tools.saveTool(w.db, w.admin, { kind: 'oprawka', name: 'HSK-A40 ER16', params: { interface: 'HSK-A40', type: 'tulejkowa', clamp_min: 1, clamp_max: 10 } }).id;
  assert.equal(w.db.get('SELECT machine_id FROM tools WHERE id=?', auto).machine_id, G, 'przypisana wg interfejsu');
  const t = byName(Tools.listTools(w.db));
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'glowica', name: 'x', params: { D: 50, z: 2.5 } }), 400, /całkowita/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { active: 'false' }, w.ids.vhm6), 400, /aktywne/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'x', params: { type: 'torusowy', D: 6, r: 4, z: 4, Lc: 12, L: 57 } }), 400, /połowa/);
  // parametry nieużywane przez wybrany rodzaj nie są zapisywane (np. promień przy frezie walcowo-czołowym)
  const id = Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'y', params: { type: 'walcowo-czolowy', D: 6, r: 1, angle: 90, z: 4, Lc: 12, L: 57 } }).id;
  const pr = JSON.parse(w.db.get('SELECT params FROM tools WHERE id=?', id).params);
  assert.equal(pr.r, null); assert.equal(pr.angle, null);
});

test('narzędzia: frez definiują liczba ostrzy, długość ostrza i długość całkowita (obowiązkowe), długość użyteczna z szyjką', () => {
  const w = world();
  const f = (params) => () => Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'F', params: { type: 'walcowo-czolowy', D: 8, ...params } });
  throwsStatus(assert, f({ Lc: 16, L: 63 }), 400, /ostrzy/);
  throwsStatus(assert, f({ z: 4, L: 63 }), 400, /Długość ostrza/);
  throwsStatus(assert, f({ z: 4, Lc: 16 }), 400, /Długość całkowita/);
  throwsStatus(assert, f({ z: 4, Lc: 70, L: 63 }), 400, /większa niż długość całkowita/);
  throwsStatus(assert, f({ z: 4, Lc: 16, reach: 12, L: 63 }), 400, /krótsza/);
  throwsStatus(assert, f({ z: 4, Lc: 16, reach: 70, L: 63 }), 400, /użyteczna nie może być większa/);
  const id = f({ z: 4, Lc: 16, reach: 40, L: 100 })().id;
  const pr = JSON.parse(w.db.get('SELECT params FROM tools WHERE id=?', id).params);
  assert.deepEqual([pr.z, pr.Lc, pr.reach, pr.L], [4, 16, 40, 100]);
  // pozycja zapisana przed wprowadzeniem obowiązkowych długości: wycofanie / przywrócenie / stan działają bez uzupełniania parametrów
  const now = new Date().toISOString();
  const old = Number(w.db.run(`INSERT INTO tools(kind,name,params,qty,min_qty,active,created_at,updated_at) VALUES ('frez','stary','{"type":"walcowo-czolowy","D":6}',1,0,1,?,?)`, now, now).lastInsertRowid);
  Tools.saveTool(w.db, w.admin, { active: false, reason: 'zużyty' }, old);
  Tools.saveTool(w.db, w.admin, { active: true, reason: 'pomyłka' }, old);
  Tools.adjustStock(w.db, w.admin, old, { delta: 1, reason: 'zwrot' });
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { params: { type: 'walcowo-czolowy', D: 6 } }, old), 400, /ostrzy/);
  // fazownik — długość ostrza nieobowiązkowa
  Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'Faz', params: { type: 'fazownik', D: 10, z: 4, L: 60, angle: 90 } });
});

test('narzędzia: ręczne przypisanie frezu do oprawek (w obie strony, w historii); tylko aktywne oprawki; edycja bez listy nie zmienia przypisań', () => {
  const w = world();
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.head63] }, w.ids.vhm6), 400, /tylko oprawki/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { holder_ids: 'x' }, w.ids.vhm6), 400);
  Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.sf6g, w.ids.er32, w.ids.er32] }, w.ids.vhm6);
  let t = byName(Tools.listTools(w.db));
  assert.deepEqual(fitNames(t['VHM Ø6']), ['BT50-ER32', 'HSK40-SF06']);
  assert.deepEqual(t['VHM Ø6'].holder_ids.sort(), [w.ids.er32, w.ids.sf6g].sort());
  assert.deepEqual(fitNames(t['HSK40-SF06']), ['VHM Ø6']);
  const a = w.db.get(`SELECT old_value, new_value FROM audit_log WHERE entity='tool' AND entity_id=? ORDER BY id DESC LIMIT 1`, String(w.ids.vhm6));
  assert.match(a.new_value, /oprawki/);
  Tools.saveTool(w.db, w.admin, { location: 'Szafa 1' }, w.ids.vhm6);
  assert.equal(byName(Tools.listTools(w.db))['VHM Ø6'].fits.length, 2, 'edycja bez listy oprawek nie kasuje przypisań');
  Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.sf6g] }, w.ids.vhm6);
  assert.deepEqual(fitNames(byName(Tools.listTools(w.db))['VHM Ø6']), ['HSK40-SF06']);
  Tools.saveTool(w.db, w.admin, { active: false, reason: 'pęknięta' }, w.ids.sf6g);
  assert.deepEqual(fitNames(byName(Tools.listTools(w.db))['VHM Ø6']), [], 'wycofana oprawka nie jest pokazywana');
  assert.deepEqual(byName(Tools.listTools(w.db))['VHM Ø6'].holder_ids, [], 'bez numerów wycofanych oprawek');
  // edycja frezu z listą bez wycofanej oprawki nie kasuje przypisania do niej; po przywróceniu wraca
  Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.er32] }, w.ids.vhm6);
  Tools.saveTool(w.db, w.admin, { active: true, reason: 'naprawiona' }, w.ids.sf6g);
  assert.deepEqual(fitNames(byName(Tools.listTools(w.db))['VHM Ø6']), ['BT50-ER32', 'HSK40-SF06']);
  // nowa wycofana oprawka — odrzucona
  Tools.saveTool(w.db, w.admin, { active: false, reason: 'zgubiona' }, w.ids.fmb22);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.er32, w.ids.fmb22] }, w.ids.vhm6), 400, /wycofana/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { holder_ids: [true] }, w.ids.vhm6), 400, /numerów/);
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { holder_ids: [w.ids.er32] }, w.ids.head63), 400, /tylko do frezów/);
});

test('narzędzia: gwintownik bez liczby ostrzy, ze skokiem gwintu; frez do gwintów — ostrza i skok', () => {
  const w = world();
  const save = (params) => Tools.saveTool(w.db, w.admin, { kind: 'frez', name: 'G', params: { D: 10, Lc: 20, L: 90, ...params } }).id;
  const pr = (id) => JSON.parse(w.db.get('SELECT params FROM tools WHERE id=?', id).params);
  throwsStatus(assert, () => save({ type: 'gwintownik' }), 400, /Skok gwintu/);
  throwsStatus(assert, () => save({ type: 'gwintownik', pitch: 0 }), 400, /Skok gwintu/);
  const tap = save({ type: 'gwintownik', pitch: '1,5', thread: 'M10', z: 4 });
  assert.equal(pr(tap).pitch, 1.5); assert.equal(pr(tap).thread, 'M10');
  assert.equal(pr(tap).z, null, 'liczba ostrzy nie jest zapisywana przy gwintowniku');
  throwsStatus(assert, () => save({ type: 'frez-gwintowy', pitch: 1.5 }), 400, /ostrzy/);
  throwsStatus(assert, () => save({ type: 'frez-gwintowy', z: 3 }), 400, /Skok gwintu/);
  const tm = save({ type: 'frez-gwintowy', z: 3, pitch: 1.5, thread: 'M10' });
  assert.deepEqual([pr(tm).z, pr(tm).pitch], [3, 1.5]);
  assert.equal(pr(save({ type: 'gwintownik', pitch: 1.95380 })).pitch, 1.9538, 'skok calowy z 4 miejscami');
  // migracja 014: dawny „gwintownik / frez do gwintów” z liczbą ostrzy → frez do gwintów; gwintownik bez ostrzy bez zmian
  const now = new Date().toISOString();
  const ins = (params) => Number(w.db.run(`INSERT INTO tools(kind,name,params,created_at,updated_at) VALUES ('frez','dawny',?,?,?)`, JSON.stringify(params), now, now).lastInsertRowid);
  const oldMill = ins({ type: 'gwintownik', D: 7.8, z: 3 }), oldTap = ins({ type: 'gwintownik', D: 8, z: null });
  w.db.exec(require('fs').readFileSync(require('path').join(__dirname, '../server/migrations/014_thread_mills.sql'), 'utf8'));
  assert.equal(pr(oldMill).type, 'frez-gwintowy'); assert.equal(pr(oldTap).type, 'gwintownik');
  // inne frezy nie mają skoku ani oznaczenia gwintu
  const em = save({ type: 'walcowo-czolowy', z: 4, pitch: 1.5, thread: 'M10' });
  assert.equal(pr(em).pitch, null); assert.equal(pr(em).thread, null);
});

test('narzędzia: przyjęcie / wydanie z powodem w historii, stan nie ujemny, wycofanie wymaga powodu', () => {
  const w = world();
  throwsStatus(assert, () => Tools.adjustStock(w.db, w.admin, w.ids.apmt11, { delta: 10 }), 400, /Powód/);
  throwsStatus(assert, () => Tools.adjustStock(w.db, w.admin, w.ids.apmt11, { delta: 0, reason: 'x' }), 400);
  throwsStatus(assert, () => Tools.adjustStock(w.db, w.admin, w.ids.apmt11, { delta: -6, reason: 'zużycie' }), 400, /ujemny/);
  assert.equal(Tools.adjustStock(w.db, w.admin, w.ids.apmt11, { delta: 20, reason: 'dostawa FV 12/10' }).qty, 25);
  Tools.adjustStock(w.db, w.admin, w.ids.apmt11, { delta: -2, reason: 'zużyte krawędzie — Hartford' });
  const log = w.db.all(`SELECT action, reason FROM audit_log WHERE entity='tool' AND entity_id=? ORDER BY id`, String(w.ids.apmt11));
  assert.deepEqual(log.map(l => l.action), ['utworzenie', 'przyjecie', 'wydanie']);
  assert.equal(log[2].reason, 'zużyte krawędzie — Hartford');
  const t = w.db.get('SELECT * FROM tools WHERE id=?', w.ids.vhm6);
  const body = { name: t.name, params: JSON.parse(t.params), active: false };
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, body, w.ids.vhm6), 400, /Powód wycofania/);
  Tools.saveTool(w.db, w.admin, { ...body, reason: 'złamany' }, w.ids.vhm6);
  assert.equal(Tools.listTools(w.db).some(x => x.id === w.ids.vhm6), false);
  assert.equal(Tools.listTools(w.db, { all: true }).some(x => x.id === w.ids.vhm6), true);
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='tool' AND action='wycofanie' AND reason='złamany'`));
  throwsStatus(assert, () => Tools.saveTool(w.db, w.admin, { active: true }, w.ids.vhm6), 400, /przywrócenia/);
  Tools.saveTool(w.db, w.admin, { active: true, reason: 'po ostrzeniu' }, w.ids.vhm6);
  assert.ok(w.db.get(`SELECT 1 FROM audit_log WHERE entity='tool' AND action='przywrocenie' AND reason='po ostrzeniu'`));
  Tools.saveTool(w.db, w.admin, { location: 'Szafa 3' }, w.ids.vhm6);
  assert.equal(w.db.get(`SELECT action FROM audit_log WHERE entity='tool' ORDER BY id DESC LIMIT 1`).action, 'edycja');
});

test('narzędzia: programista i przełożony tylko odczyt (403 na zapis), gość bez dostępu; wycofane tylko u kierownika', async () => {
  const w = world();
  const e = w.emp('Jan');
  People.saveUser(w.db, w.admin, { login: 'jan', display_name: 'Jan', role: 'employee', employee_id: e, password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'szef', display_name: 'Przełożony', role: 'supervisor', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'klient', display_name: 'Gość', role: 'guest', password: 'haslo-testowe-1' });
  People.saveUser(w.db, w.admin, { login: 'kier', display_name: 'Kierownik', role: 'admin', password: 'haslo-testowe-1' });
  const t = w.db.get('SELECT * FROM tools WHERE id=?', w.ids.big25);
  Tools.saveTool(w.db, w.admin, { name: t.name, params: JSON.parse(t.params), active: false, reason: 'wycofany' }, w.ids.big25);
  const srv = createApp(w.db);
  await new Promise(res => srv.listen(0, '127.0.0.1', res));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const client = async (login) => {
    let cookie = '';
    const call = async (method, p, body) => {
      const res = await fetch(base + p, { method, headers: { ...(method !== 'GET' ? { 'X-CNC-Request': '1' } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const txt = await res.text(); let d; try { d = JSON.parse(txt); } catch { d = txt; }
      return { status: res.status, data: d };
    };
    await call('POST', '/login', { login, password: 'haslo-testowe-1' });
    return call;
  };
  try {
    const newTool = { kind: 'frez', name: 'X', params: { type: 'kulisty', D: 4, z: 2, Lc: 8, L: 50 } };
    for (const login of ['jan', 'szef']) {
      const c = await client(login);
      const r = await c('GET', '/tools?all=1');
      assert.equal(r.status, 200, login);
      assert.ok(r.data.length > 5);
      assert.equal(r.data.some(x => x.id === w.ids.big25), false, `${login}: wycofane niewidoczne`);
      assert.equal((await c('POST', '/tools', newTool)).status, 403, login);
      assert.equal((await c('PUT', `/tools/${w.ids.vhm6}`, { name: 'Y', params: { type: 'kulisty', D: 4, z: 2, Lc: 8, L: 50 } })).status, 403, login);
      assert.equal((await c('POST', `/tools/${w.ids.vhm6}/stock`, { delta: 5, reason: 'x' })).status, 403, login);
    }
    const g = await client('klient');
    assert.equal((await g('GET', '/tools')).status, 403);
    const k = await client('kier');
    assert.equal((await k('GET', '/tools?all=1')).data.some(x => x.id === w.ids.big25), true);
    assert.equal((await k('POST', '/tools', newTool)).status, 200);
    assert.equal((await k('POST', `/tools/${w.ids.vhm6}/stock`, { delta: 5, reason: 'dostawa' })).data.qty, 5);
  } finally { srv.close(); }
});
