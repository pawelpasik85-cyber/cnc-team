'use strict';
// Chmura: logowanie kierownika, synchronizacja, przyjmowanie zgłoszeń, publikacje bez danych poufnych.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeWorld } = require('./helpers');
const { createFakeSupabase } = require('./fake-supabase');
const { createCloud } = require('../server/domain/cloud');
const People = require('../server/domain/people');
const Abs = require('../server/domain/absences');
const X = require('../server/domain/exits');

async function setup() {
  const w = makeWorld({ today: '2026-10-06' });
  const e1 = w.emp('Jan'); w.shifts(e1, '2026-10-01', '2026-10-30');
  const e2 = w.emp('Ewa'); w.shifts(e2, '2026-10-01', '2026-10-30', 'II');
  People.saveEmployee(w.db, w.admin, { ...w.db.get('SELECT * FROM employees WHERE id=?', e1), competences: [], machine_ids: [], email: 'Jan@Firma.pl' }, e1);
  const fake = createFakeSupabase({ now: () => new Date('2026-10-06T08:00:00Z') });
  fake.invite('szef@firma.pl', 'kierownik', null, 'Kierownik');
  const cloud = createCloud(w.db, { fetchImpl: fake.fetchImpl, url: 'https://fake.supabase.co', key: 'sb_publishable_test' });
  return { ...w, e1, e2, fake, cloud };
}

// pracownik w aplikacji: rejestracja i zgłoszenie (bezpośrednio przez API atrapy)
async function employeeSubmits(fake, email, report) {
  const call = async (path, body, token) => {
    const r = await fake.fetchImpl(`https://fake.supabase.co${path}`, { method: 'POST', headers: { apikey: 'k', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { ok: r.ok, data: JSON.parse(await r.text()) };
  };
  if (!fake.users.has(email)) await call('/auth/v1/signup', { email, password: 'haslo-pracownika' });
  const t = await call('/auth/v1/token?grant_type=password', { email, password: 'haslo-pracownika' });
  return (await call('/rest/v1/rpc/submit_report', { p: { client_id: require('node:crypto').randomUUID(), ...report } }, t.data.access_token)).data;
}

test('logowanie kierownika: tylko zaproszone konto z rolą kierownika', async () => {
  const s = await setup();
  await assert.rejects(s.cloud.login(s.admin, { email: 'obcy@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' }), /nie ma zaproszenia/);
  await assert.rejects(s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'krotkie', mode: 'signup' }), /co najmniej 10/);
  const st = await s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' });
  assert.equal(st.connected, true); assert.equal(st.email, 'szef@firma.pl');
  // konto pracownika nie może synchronizować jako kierownik
  s.fake.invite('jan@firma.pl', 'pracownik', s.e1, 'Jan');
  await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'inne', date_from: '2026-10-06' });
  const c2 = createCloud(s.db, { fetchImpl: s.fake.fetchImpl, url: 'https://fake.supabase.co', key: 'k' });
  await assert.rejects(c2.login(s.admin, { email: 'jan@firma.pl', password: 'haslo-pracownika' }), /roli kierownika/);
  assert.equal(s.db.get('SELECT COUNT(*) n FROM cloud_auth').n, 0, 'sesja pracownika nie zostaje zapisana');
});

test('synchronizacja: zaproszenia, pobranie zgłoszeń, publikacje bez danych poufnych', async () => {
  const s = await setup();
  await s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' });
  Abs.createAbsence(s.db, s.admin, { employee_id: s.e2, category_id: s.cat.L4, status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-07', confidential_note: 'TAJNE-ZDROWIE', document_ref: 'e-ZLA-1' });
  X.createExit(s.db, s.admin, { employee_id: s.e1, start_date: '2026-10-05', start_time: '09:00', end_time: '10:00', confidential_note: 'TAJNE-WYJSCIE', document_ref: 'DOK-9' });
  const r1 = await s.cloud.sync();
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.invites.map(i => i.email).sort(), ['jan@firma.pl', 'szef@firma.pl'], 'zaproszony tylko pracownik z adresem e-mail');
  const team = s.fake.publications.get('zespol|0|grafik').data;
  const teamTxt = JSON.stringify(team);
  assert.ok(team.zmiany.length > 30 && team.pracownicy.length === 2);
  assert.ok(!teamTxt.includes('Chorobowe') && !teamTxt.includes('L4') && !teamTxt.includes('TAJNE') && !teamTxt.includes('e-ZLA'));
  assert.ok(team.nieobecnosci.some(n => n.e === s.e2 && n.etykieta === 'Nieobecność'));
  const all = JSON.stringify([...s.fake.publications.values()]);
  for (const bad of ['TAJNE', 'DOK-9', 'e-ZLA', 'hr_reference', 'planned_min', 'document_ref', 'confidential']) assert.ok(!all.includes(bad), `publikacja zawiera ${bad}`);
  const mine = s.fake.publications.get(`osobiste|${s.e1}|moje`).data;
  assert.equal(mine.saldo.find(x => x.miesiac === '2026-10').pozostalo_min, 60);
  assert.equal(s.fake.publications.get(`osobiste|${s.e2}|moje`).data.saldo.find(x => x.miesiac === '2026-10').pozostalo_min, 0);
  // pracownik zgłasza → kolejna synchronizacja pobiera
  await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'spoznienie', date_from: '2026-10-07', time_to: '06:40', note: 'korek na A4' });
  const r2 = await s.cloud.sync();
  assert.equal(r2.added, 1);
  assert.equal(s.cloud.listReports({ status: 'nowe' }).length, 1);
});

test('przyjęcie spóźnienia jako wyjście do odrobienia; odrzucenie z wyjaśnieniem', async () => {
  const s = await setup();
  await s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' });
  await s.cloud.sync();
  const late = await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'spoznienie', date_from: '2026-10-07', time_to: '06:40' });
  const out = await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'wyjscie', date_from: '2026-10-08', time_from: '10:00', time_to: '11:30' });
  await s.cloud.sync();
  const d1 = await s.cloud.decide(s.admin, late.id, { decision: 'przyjete', target: { type: 'exit', written_request: true } });
  assert.match(d1.cnc_ref, /^exit:\d+$/);
  const exit = s.db.get('SELECT * FROM private_exits WHERE id=?', Number(d1.cnc_ref.split(':')[1]));
  assert.equal(exit.minutes, 40, 'od początku zmiany 06:00 do przyjścia 06:40');
  assert.equal(exit.written_request, 1); assert.match(exit.document_ref, /zgłoszenie w aplikacji/);
  const remote = s.fake.reports.find(r => r.id === late.id);
  assert.equal(remote.status, 'przyjete'); assert.equal(remote.cnc_ref, d1.cnc_ref);
  await assert.rejects(s.cloud.decide(s.admin, late.id, { decision: 'odrzucone', note: 'x' }), /już rozpatrzone/);
  await assert.rejects(s.cloud.decide(s.admin, out.id, { decision: 'odrzucone' }), /wyjaśnienia/);
  await s.cloud.decide(s.admin, out.id, { decision: 'odrzucone', note: 'Termin pokrywa się z uruchomieniem na Hartfordzie' });
  assert.equal(s.fake.reports.find(r => r.id === out.id).status, 'odrzucone');
  // pracownik widzi swoje saldo po publikacji
  await s.cloud.sync();
  assert.equal(s.fake.publications.get(`osobiste|${s.e1}|moje`).data.saldo.find(x => x.miesiac === '2026-10').pozostalo_min, 40);
});

test('próba na sucho: błąd wpisu lokalnego nie wysyła decyzji do chmury', async () => {
  const s = await setup();
  await s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' });
  await s.cloud.sync();
  // wyjście poza grafikiem (sobota)
  const r = await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'wyjscie', date_from: '2026-10-10', time_from: '10:00', time_to: '11:00' });
  await s.cloud.sync();
  await assert.rejects(s.cloud.decide(s.admin, r.id, { decision: 'przyjete', target: { type: 'exit' } }), /poza czasem pracy/);
  assert.equal(s.fake.reports.find(x => x.id === r.id).status, 'nowe', 'decyzja nie została wysłana');
  assert.equal(s.db.get('SELECT COUNT(*) n FROM private_exits').n, 0);
  // nieobecność wg wybranej kategorii
  const ab = await employeeSubmits(s.fake, 'jan@firma.pl', { kind: 'nieobecnosc', date_from: '2026-10-12', date_to: '2026-10-13', note: 'sprawy rodzinne' });
  await s.cloud.sync();
  const d = await s.cloud.decide(s.admin, ab.id, { decision: 'przyjete', target: { type: 'absence', category_id: s.cat.INNE_USPRAW } });
  const a = s.db.get('SELECT * FROM absences WHERE id=?', Number(d.cnc_ref.split(':')[1]));
  assert.equal(a.status, 'planowana'); assert.equal(a.days, 2); assert.equal(a.employee_request, 1);
});

test('odświeżenie sesji i brak połączenia', async () => {
  const s = await setup();
  await s.cloud.login(s.admin, { email: 'szef@firma.pl', password: 'dlugie-haslo-1', mode: 'signup' });
  s.db.run(`UPDATE cloud_auth SET expires_at='2000-01-01T00:00:00Z'`);
  s.fake.expireAll();
  const r = await s.cloud.sync();
  assert.equal(r.ok, true, 'sesja odświeżona tokenem odświeżania');
  s.fake.setOffline(true);
  await assert.rejects(s.cloud.sync(), /Brak połączenia z chmurą/);
  const st = s.cloud.status();
  assert.equal(st.last_sync.ok, false); assert.equal(st.connected, true, 'brak sieci nie wylogowuje');
});
