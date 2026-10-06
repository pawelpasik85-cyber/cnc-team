'use strict';
// Aplikacja pracownika: walidacja, logowanie, kolejka offline, brak duplikatów, widok danych.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../mobile/core.js');
const { createFakeSupabase } = require('./fake-supabase');

function memStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; }
const TODAY = '2026-10-06';

function setup() {
  const fake = createFakeSupabase({ now: () => new Date('2026-10-06T08:00:00Z') });
  fake.invite('jan@firma.pl', 'pracownik', 7, 'Jan Kowal');
  fake.invite('szef@firma.pl', 'kierownik', null, 'Szef');
  const storage = memStorage();
  const client = Core.createClient({ url: 'https://fake.supabase.co', key: 'k', fetchImpl: fake.fetchImpl, storage, today: () => TODAY });
  return { fake, storage, client };
}

test('walidacja zgłoszenia — czytelne komunikaty', () => {
  const v = (r) => Core.validateReport(r, TODAY);
  assert.deepEqual(v({ kind: 'nieobecnosc', date_from: '2026-10-07' }), []);
  assert.match(v({ kind: 'spoznienie', date_from: TODAY }).join(), /o której przyjdziesz/);
  assert.match(v({ kind: 'wyjscie', date_from: TODAY, time_from: '10:00' }).join(), /wyjścia i powrotu/);
  assert.match(v({ kind: 'nieobecnosc', date_from: '2026-08-01' }).join(), /31 dni wstecz/);
  assert.match(v({ kind: 'nieobecnosc', date_from: '2026-10-07', date_to: '2026-10-06' }).join(), /przed datą początku/);
  assert.match(v({ kind: 'nieobecnosc', date_from: '2026-10-07', date_to: '2027-01-30' }).join(), /60 dni/);
  assert.match(v({ kind: 'x', date_from: TODAY }).join(), /rodzaj/);
  assert.match(v({ kind: 'inne', date_from: TODAY, note: 'x'.repeat(501) }).join(), /500 znaków/);
});

test('logowanie: pierwsze ustawienie hasła, odmowa dla konta kierownika i bez zaproszenia', async () => {
  const { client } = setup();
  await assert.rejects(client.signIn('obcy@firma.pl', 'haslo-123456', { firstTime: true }), /nie ma zaproszenia/);
  await assert.rejects(client.signIn('jan@firma.pl', 'krotkie', { firstTime: true }), /8 znaków/);
  const me = await client.signIn('Jan@Firma.pl', 'haslo-123456', { firstTime: true });
  assert.equal(me.employee_ref, 7);
  client.signOut();
  await assert.rejects(client.signIn('jan@firma.pl', 'zle-haslo'), /Nieprawidłowy/);
  await client.signIn('jan@firma.pl', 'haslo-123456');
  const s2 = setup();
  await assert.rejects(s2.client.signIn('szef@firma.pl', 'haslo-szefa-1', { firstTime: true }), /konto kierownika/);
  assert.equal(s2.client.session(), null, 'sesja kierownika nie zostaje w aplikacji pracownika');
});

test('zgłoszenie bez internetu trafia do kolejki i wysyła się raz po połączeniu', async () => {
  const { fake, client } = setup();
  await client.signIn('jan@firma.pl', 'haslo-123456', { firstTime: true });
  fake.setOffline(true);
  const item = client.queueReport({ kind: 'spoznienie', date_from: TODAY, time_to: '06:40', note: ' korek ' });
  const f1 = await client.flush();
  assert.deepEqual({ sent: f1.sent, left: f1.left }, { sent: 0, left: 1 });
  let st = client.state();
  assert.equal(st.outboxCount, 1); assert.equal(st.reports[0].status, 'w_kolejce');
  fake.setOffline(false);
  await client.refresh();
  st = client.state();
  assert.equal(fake.reports.length, 1); assert.equal(fake.reports[0].note, 'korek'); assert.equal(fake.reports[0].client_id, item.client_id);
  assert.equal(st.outboxCount, 0); assert.equal(st.reports[0].status, 'nowe');
  // ponowne wysłanie tej samej pozycji (np. zerwane połączenie po zapisie) nie tworzy duplikatu
  await client.rpc('submit_report', { p: { client_id: item.client_id, kind: 'spoznienie', date_from: TODAY, time_to: '06:40' } });
  assert.equal(fake.reports.length, 1);
  // wycofanie
  await client.withdraw(fake.reports[0].id);
  assert.equal(fake.reports[0].status, 'wycofane');
});

test('błędne zgłoszenie nie trafia do kolejki', async () => {
  const { client } = setup();
  await client.signIn('jan@firma.pl', 'haslo-123456', { firstTime: true });
  assert.throws(() => client.queueReport({ kind: 'wyjscie', date_from: TODAY }), /wyjścia i powrotu/);
  assert.equal(client.state().outboxCount, 0, 'błędne zgłoszenie nie trafia do kolejki');
});

test('stan: moje zmiany i saldo z publikacji; dane innych tylko z grafiku zespołu', async () => {
  const { fake, client } = setup();
  await client.signIn('jan@firma.pl', 'haslo-123456', { firstTime: true });
  fake.publications.set('zespol|0|grafik', { scope: 'zespol', employee_ref: 0, kind: 'grafik', data: {
    wygenerowano: '2026-10-06T07:00:00Z', pracownicy: [{ ref: 7, imie: 'Jan', nazwisko: 'Kowal', kolor: '#123456' }, { ref: 8, imie: 'Ewa', nazwisko: 'Nowak', kolor: '#654321' }],
    zmiany: [{ e: 7, d: '2026-10-05', od: '06:00', do: '14:00' }, { e: 7, d: '2026-10-07', od: '06:00', do: '14:00', zm: 'I' }, { e: 8, d: '2026-10-07', od: '14:00', do: '22:00' }],
    nieobecnosci: [{ e: 7, od: '2026-10-07', do: '2026-10-07', etykieta: 'Urlop' }], swieta: [] } });
  fake.publications.set('osobiste|7|moje', { scope: 'osobiste', employee_ref: 7, kind: 'moje', data: { saldo: [{ miesiac: '2026-10', pozostalo_min: 45, zmian_do_konca: 19, wyjscia: [] }], nieobecnosci: [] } });
  fake.publications.set('osobiste|8|moje', { scope: 'osobiste', employee_ref: 8, kind: 'moje', data: { saldo: [{ miesiac: '2026-10', pozostalo_min: 999 }] } });
  await client.refresh();
  const st = client.state();
  assert.equal(st.mine.saldo[0].pozostalo_min, 45, 'własne saldo, nie cudze');
  const mine = client.myShifts(st);
  assert.deepEqual(mine.map(z => z.d), ['2026-10-07'], 'tylko przyszłe zmiany pracownika');
  assert.equal(mine[0].nieobecnosc.etykieta, 'Urlop');
  assert.equal(Core.hm(45), '0 h 45 min');
});

test('budowanie aplikacji pracownika: komplet plików szkieletu, wersja wstawiona', () => {
  const out = path.join(require('node:os').tmpdir(), `cnc-mobile-${process.pid}`);
  require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-mobile.js'), out], { env: { ...process.env, BUILD_ID: 'test123' } });
  const sw = fs.readFileSync(path.join(out, 'sw.js'), 'utf8');
  assert.match(sw, /cnc-pracownik-test123/);
  for (const f of sw.match(/const SHELL = \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1))) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(out, f)), `brak ${f}`);
  }
  assert.match(fs.readFileSync(path.join(out, 'config.js'), 'utf8'), /version: 'test123'/);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(out, m[1])), `brak ${m[1]}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons) assert.ok(fs.existsSync(path.join(out, i.src)));
  fs.rmSync(out, { recursive: true, force: true });
});
