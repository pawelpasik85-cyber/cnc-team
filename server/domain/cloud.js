'use strict';
// Połączenie CNC Team (komputer kierownika) z chmurą aplikacji pracowników (Supabase).
// Do chmury trafiają wyłącznie: grafik zespołu (z etykietami ogólnymi nieobecności), własny grafik i saldo
// pracownika oraz decyzje w sprawie zgłoszeń. Notatki poufne, dokumenty, nazwy kategorii poufnych,
// pule urlopu i raporty efektywności NIE są wysyłane.
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, oneOf, reqInt } = require('../core');
const C = require('./common');
const Abs = require('./absences');
const X = require('./exits');
const People = require('./people');
const Req = require('./requests');
const config = require('../cloud-config');

const PUBLISH_DAYS_BACK = 7;
const PUBLISH_DAYS_AHEAD = 42;
const PULL_DAYS = 120;

class CloudError extends Error {
  constructor(message, status = 0) { super(message); this.status = status >= 400 && status < 500 ? 409 : 502; this.remoteStatus = status; }
}

function log(db, action, ok, message) {
  db.run('INSERT INTO cloud_log(at,action,ok,message) VALUES (?,?,?,?)', T.nowIso(), action, ok ? 1 : 0, message ? String(message).slice(0, 500) : null);
  db.run('DELETE FROM cloud_log WHERE id NOT IN (SELECT id FROM cloud_log ORDER BY id DESC LIMIT 200)');
}

function authMessage(status, body) {
  const raw = (body && (body.msg || body.message || body.error_description)) || '';
  const code = (body && (body.error_code || body.code)) || '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) return 'Nieprawidłowy e-mail lub hasło.';
  if (code === 'user_already_exists' || /already registered/i.test(raw)) return 'To konto już istnieje — zaloguj się.';
  if (code === 'weak_password' || /password should be/i.test(raw)) return 'Hasło jest za krótkie (minimum 6 znaków).';
  if (/nie ma zaproszenia|database error saving new user/i.test(raw) || code === 'unexpected_failure') return 'Ten adres e-mail nie ma zaproszenia do CNC Team.';
  return raw || `Błąd chmury (${status}).`;
}

function createCloud(db, { fetchImpl = globalThis.fetch, url = config.url, key = config.key } = {}) {
  const base = url.replace(/\/$/, '');

  async function http(method, path, { body, token, headers = {} } = {}) {
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new CloudError('Brak połączenia z chmurą (internet lub serwer niedostępny).', 0);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = path.startsWith('/auth/') ? authMessage(res.status, data) : ((data && (data.message || data.msg)) || `Błąd chmury (${res.status}).`);
      throw new CloudError(msg, res.status);
    }
    return data;
  }

  function session() { return db.get('SELECT * FROM cloud_auth WHERE id=1') || null; }
  function saveSession(t) {
    const now = T.nowIso();
    db.run(`INSERT INTO cloud_auth(id,email,access_token,refresh_token,expires_at,user_id,updated_at) VALUES (1,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email, access_token=excluded.access_token, refresh_token=excluded.refresh_token,
      expires_at=excluded.expires_at, user_id=excluded.user_id, updated_at=excluded.updated_at`,
    t.user.email, t.access_token, t.refresh_token, new Date(Date.now() + t.expires_in * 1000).toISOString(), t.user.id, now);
  }

  async function token() {
    const s = session();
    if (!s) throw new CloudError('Kierownik nie jest zalogowany do chmury (Ustawienia → Aplikacja pracowników).', 401);
    if (Date.parse(s.expires_at) - Date.now() > 60e3) return s.access_token;
    try {
      const t = await http('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
      saveSession(t);
      return t.access_token;
    } catch (e) {
      if (e.remoteStatus >= 400 && e.remoteStatus < 500) {
        db.run('DELETE FROM cloud_auth WHERE id=1');
        throw new CloudError('Sesja w chmurze wygasła — zaloguj się ponownie (Ustawienia → Aplikacja pracowników).', 401);
      }
      throw e;
    }
  }

  const rpc = async (name, args) => http('POST', `/rest/v1/rpc/${name}`, { body: args, token: await token() });
  const select = async (pathQuery) => http('GET', `/rest/v1/${pathQuery}`, { token: await token() });

  // ---------- Logowanie kierownika ----------
  async function login(user, body) {
    const email = reqStr(body.email, 'E-mail', { max: 120 }).toLowerCase();
    const password = reqStr(body.password, 'Hasło', { max: 200 });
    const mode = oneOf(body.mode || 'login', 'Tryb', ['login', 'signup']);
    if (mode === 'signup') {
      if (password.length < 10) throw bad('Hasło kierownika musi mieć co najmniej 10 znaków.');
      await http('POST', '/auth/v1/signup', { body: { email, password } });
    }
    const t = await http('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
    saveSession(t);
    // tylko konto z rolą kierownika może synchronizować
    const me = await select(`members?select=role,display_name&user_id=eq.${encodeURIComponent(t.user.id)}`);
    if (!Array.isArray(me) || !me.length || me[0].role !== 'kierownik') {
      db.run('DELETE FROM cloud_auth WHERE id=1');
      throw new CloudError('To konto nie ma roli kierownika w chmurze CNC Team.', 403);
    }
    audit(db, user, 'cloud', 'session', 'logowanie_chmura', null, { email });
    log(db, 'logowanie', true, email);
    return status();
  }

  function logout(user) {
    db.run('DELETE FROM cloud_auth WHERE id=1');
    audit(db, user, 'cloud', 'session', 'wylogowanie_chmura', null, null);
  }

  function status() {
    const s = session();
    const last = db.get(`SELECT * FROM cloud_log WHERE action='synchronizacja' ORDER BY id DESC LIMIT 1`);
    return {
      url: base, connected: !!s, email: s ? s.email : null,
      last_sync: last ? { at: last.at, ok: !!last.ok, message: last.message } : null,
      pending_reports: db.get(`SELECT COUNT(*) n FROM cloud_reports WHERE status='nowe'`).n,
      log: db.all('SELECT * FROM cloud_log ORDER BY id DESC LIMIT 20'),
    };
  }

  // ---------- Zgłoszenia ----------
  async function pullReports() {
    const since = new Date(Date.now() - PULL_DAYS * 86400e3).toISOString();
    const rows = await select(`reports?select=id,employee_ref,kind,date_from,date_to,time_from,time_to,note,status,decision_note,cnc_ref,created_at,updated_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc`);
    let added = 0;
    db.tx(() => {
      for (const r of rows || []) {
        const had = db.get('SELECT id FROM cloud_reports WHERE id=?', r.id);
        db.run(`INSERT INTO cloud_reports(id,employee_ref,kind,date_from,date_to,time_from,time_to,note,status,decision_note,cnc_ref,created_at,updated_at,synced_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status, decision_note=excluded.decision_note,
          cnc_ref=excluded.cnc_ref, updated_at=excluded.updated_at, synced_at=excluded.synced_at`,
        r.id, r.employee_ref, r.kind, r.date_from, r.date_to, r.time_from, r.time_to, r.note, r.status, r.decision_note, r.cnc_ref,
        r.created_at, r.updated_at, T.nowIso());
        if (!had) added++;
      }
    });
    return { received: (rows || []).length, added };
  }

  function listReports({ status: st } = {}) {
    const rows = st ? db.all('SELECT * FROM cloud_reports WHERE status=? ORDER BY created_at DESC', st)
      : db.all('SELECT * FROM cloud_reports ORDER BY (status=\'nowe\') DESC, created_at DESC LIMIT 300');
    return rows.map(r => ({ ...r, employee_known: !!db.get('SELECT 1 FROM employees WHERE id=?', r.employee_ref) }));
  }

  // Zamiana zgłoszenia na wpis lokalny — wspólna logika z zgłoszeniami na serwerze (domain/requests.js).
  function buildLocalEntry(user, r, target) {
    const label = `zgłoszenie w aplikacji ${r.id.slice(0, 8)} z ${T.utcToLocal(r.created_at).date}`;
    return Req.buildLocalEntry(db, user, { ...r, employee_id: r.employee_ref, label }, target);
  }

  async function decide(user, id, body) {
    const r = db.get('SELECT * FROM cloud_reports WHERE id=?', id);
    if (!r) throw notFound('Nie znaleziono zgłoszenia.');
    if (r.status !== 'nowe') throw conflict('Zgłoszenie zostało już rozpatrzone lub wycofane.');
    if (!db.get('SELECT 1 FROM employees WHERE id=?', r.employee_ref)) throw conflict('Zgłoszenie dotyczy pracownika, którego nie ma w CNC Team.');
    const decision = oneOf(body.decision, 'Decyzja', ['przyjete', 'odrzucone']);
    const note = body.note ? String(body.note).slice(0, 500) : null;
    if (decision === 'odrzucone' && !note) throw bad('Odrzucenie wymaga krótkiego wyjaśnienia dla pracownika.');
    const target = decision === 'przyjete' ? (body.target || { type: 'none' }) : { type: 'none' };
    oneOf(target.type, 'Sposób rozliczenia', ['exit', 'absence', 'makeup', 'none']);
    // 1) próba na sucho: wpis lokalny musi przejść wszystkie walidacje, zanim decyzja trafi do chmury
    const DRY = Symbol('dry');
    try { db.tx(() => { buildLocalEntry(user, r, target); throw DRY; }); } catch (e) { if (e !== DRY) throw e; }
    // 2) decyzja w chmurze (jedna decyzja — serwer odrzuca ponowną)
    await rpc('decide_report', { report_id: id, decision, note, ref: null });
    // 3) wpis lokalny + zapis decyzji
    let result = null, localError = null;
    try { result = db.tx(() => buildLocalEntry(user, r, target)); } catch (e) { localError = e.message; }
    db.run('UPDATE cloud_reports SET status=?, decision_note=?, cnc_ref=?, local_error=?, updated_at=? WHERE id=?',
      decision, note, result ? result.ref : null, localError, T.nowIso(), id);
    if (result) { try { await rpc('set_report_ref', { report_id: id, ref: result.ref }); } catch { /* odnośnik jest informacyjny */ } }
    audit(db, user, 'cloud_report', id, decision === 'przyjete' ? 'przyjecie_zgloszenia' : 'odrzucenie_zgloszenia', { status: 'nowe' },
      { status: decision, target, cnc_ref: result ? result.ref : null, local_error: localError }, note);
    log(db, 'decyzja', !localError, `${id.slice(0, 8)} ${decision}${localError ? ` — błąd wpisu lokalnego: ${localError}` : ''}`);
    return { status: decision, cnc_ref: result ? result.ref : null, warnings: result ? result.warnings : [], local_error: localError };
  }

  // ---------- Publikacja ----------
  function buildPublications(today = T.today()) {
    const from = T.addDays(today, -PUBLISH_DAYS_BACK), to = T.addDays(today, PUBLISH_DAYS_AHEAD);
    const employees = db.all('SELECT id, first_name, last_name, color FROM employees WHERE active=1 ORDER BY last_name');
    const tpl = new Map(db.all('SELECT id, short, name FROM shift_templates').map(t => [t.id, t]));
    const shifts = People.listSchedule(db, from, to).map(s => ({
      e: s.employee_id, d: s.work_date, od: s.start_local.time, do: s.end_local.time, min: s.planned_min,
      zm: s.shift_template_id ? tpl.get(s.shift_template_id).short : null,
    }));
    const absences = Abs.listAbsences(db, { from, to }).filter(a => a.status !== 'anulowana');
    const team = {
      od: from, do: to, wygenerowano: T.nowIso(),
      pracownicy: employees.map(e => ({ ref: e.id, imie: e.first_name, nazwisko: e.last_name, kolor: e.color })),
      zmiany: shifts,
      // nieobecności zespołu: wyłącznie etykiety ogólne (np. „Nieobecność”), bez kategorii i notatek
      nieobecnosci: absences.map(a => ({ e: a.employee_id, od: a.start_date, do: a.end_date, etykieta: a.public_label, status: a.status })),
      swieta: db.all('SELECT date, name FROM holidays WHERE date BETWEEN ? AND ?', from, to).map(h => ({ d: h.date, nazwa: h.name })),
    };
    const items = [{ scope: 'zespol', kind: 'grafik', data: team }];
    const months = [...new Set([T.monthOf(T.addDays(today, -PUBLISH_DAYS_BACK)), T.monthOf(today)])];
    for (const e of employees) {
      const saldo = months.map(ym => {
        const b = X.monthBalances(db, ym).find(x => x.employee_id === e.id);
        const exits = X.listExits(db, { employeeId: e.id, month: ym }).filter(x => x.status !== 'anulowane').map(x => ({
          dzien: x.work_date, od: x.start_local.time, do: x.end_local.time, min: x.minutes, odrobiono: x.settled_min, pozostalo: x.remaining_min, stan: x.state,
        }));
        return { miesiac: ym, status_miesiaca: C.monthStatus(db, ym), pozostalo_min: b ? b.remaining_min : 0, zmian_do_konca: b ? b.remaining_shifts : 0, wyjscia: exits };
      });
      const own = absences.filter(a => a.employee_id === e.id).map(a => ({
        od: a.start_date, do: a.end_date, nazwa: a.category_name, status: a.status, min: a.minutes,
      }));
      items.push({ scope: 'osobiste', employee_ref: e.id, kind: 'moje', data: { saldo, nieobecnosci: own, wygenerowano: T.nowIso() } });
    }
    return items;
  }

  async function publish() {
    const items = buildPublications();
    await rpc('publish', { items });
    return { items: items.length };
  }

  // ---------- Zaproszenia ----------
  async function syncInvites() {
    const emps = db.all(`SELECT id, first_name, last_name, email FROM employees WHERE active=1 AND email IS NOT NULL AND email != ''`);
    if (emps.length) {
      await rpc('set_invites', { items: emps.map(e => ({ email: e.email, role: 'pracownik', employee_ref: e.id, display_name: `${e.first_name} ${e.last_name}` })) });
    }
    return rpc('list_invites', {});
  }

  async function sync(trigger = 'reczna') {
    try {
      const pulled = await pullReports();
      const pub = await publish();
      const invites = await syncInvites();
      const msg = `zgłoszenia: ${pulled.received} (nowe ${pulled.added}), publikacje: ${pub.items}, konta: ${invites.filter(i => i.registered).length}/${invites.length}`;
      log(db, 'synchronizacja', true, `${trigger}: ${msg}`);
      return { ok: true, ...pulled, published: pub.items, invites };
    } catch (e) {
      log(db, 'synchronizacja', false, `${trigger}: ${e.message}`);
      throw e;
    }
  }

  return { login, logout, status, pullReports, listReports, decide, buildPublications, publish, syncInvites, sync, session, CloudError };
}

module.exports = { createCloud, CloudError, PUBLISH_DAYS_AHEAD };
