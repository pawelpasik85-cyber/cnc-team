'use strict';
// Definicje API. Każda trasa deklaruje wymagane uprawnienie; odpowiedzi są filtrowane według roli.
const T = require('./time');
const core = require('./core');
const { HttpError, requireCap, can, verifyPassword, createSession, audit, forbidden, bad, notFound } = core;
const C = require('./domain/common');
const People = require('./domain/people');
const Abs = require('./domain/absences');
const X = require('./domain/exits');
const P = require('./domain/projects');
const R = require('./domain/reports');
const I = require('./domain/integration');
const Req = require('./domain/requests');

const ADMIN = 'write';
const isAdmin = (u) => u && u.role === 'admin';
function requireAdmin(u) { if (!isAdmin(u)) throw forbidden('Tylko administrator może wprowadzać i edytować dane.'); }
const int = (v) => (v === undefined || v === '' || v === null ? null : Number(v));

// ---------- Filtrowanie odpowiedzi według roli ----------
function redactEmployee(user, e) {
  if (user.role === 'admin') return e;
  const base = { id: e.id, first_name: e.first_name, last_name: e.last_name, color: e.color, active: e.active, machine_ids: e.machine_ids, competences: e.competences };
  if (user.role === 'supervisor') {
    return { ...base, employment_start: e.employment_start, employment_end: e.employment_end, terms: e.terms, current_terms: e.current_terms,
      initial_settlement_note: e.initial_settlement_note, initial_settlement_approved_at: e.initial_settlement_approved_at,
      ...(can(user, 'view.confidential') ? { hr_reference: e.hr_reference } : {}) };
  }
  return base;
}

// Widoczność kategorii: pelna — wszyscy widzą nazwę; podstawowa — pracownik widzi etykietę ogólną;
// poufna — etykietę ogólną widzą pracownik i przełożony bez uprawnienia do danych poufnych.
function categoryVisibleName(user, a) {
  if (a.visibility === 'pelna') return { name: a.category_name, short: a.short, icon: a.icon };
  const generic = { name: a.public_label, short: '•', icon: 'absence' };
  if (user.role === 'employee') return generic;
  if (a.visibility === 'poufna' && !can(user, 'view.confidential')) return generic;
  return { name: a.category_name, short: a.short, icon: a.icon };
}
function redactAbsence(user, a) {
  const vis = categoryVisibleName(user, a);
  const out = {
    id: a.id, employee_id: a.employee_id, status: a.status, start_date: a.start_date, end_date: a.end_date,
    start_local: a.start_at ? T.utcToLocal(a.start_at) : null, end_local: a.end_at ? T.utcToLocal(a.end_at) : null,
    category_label: vis.name, category_short: vis.short, icon: vis.icon,
  };
  if (user.role === 'employee') return out;
  Object.assign(out, { category_id: a.category_id, code: vis.name === a.category_name ? a.code : null, unit: a.unit, minutes: a.minutes, days: a.days,
    pool_year: a.pool_year, employee_request: a.employee_request, created_at: a.created_at, updated_at: a.updated_at });
  if (can(user, 'view.confidential')) Object.assign(out, { document_ref: a.document_ref, confidential_note: a.confidential_note, cancel_reason: a.cancel_reason });
  return out;
}
function redactExit(user, x) {
  const { confidential_note, document_ref, cancel_reason, ...rest } = x;
  if (can(user, 'view.confidential')) return x;
  return rest;
}
function employeeScope(user) {
  // Pracownik: dane salda tylko własne, chyba że firma włączyła podgląd zespołu.
  return user.role === 'employee' ? user.employee_id : null;
}

function wrapReport(rep) { return rep; }

// Pracownik widzi tylko projekty potrzebne do pracy: jest odpowiedzialny, ma w nich zadanie albo projekt jest na tablicy maszyn.
// null = bez ograniczeń (kierownik, przełożony lub ustawienie employee_sees_all_projects = tak).
function visibleProjects(db, user) {
  if (user.role !== 'employee') return null;
  if (C.getSetting(db, 'employee_sees_all_projects', 'nie') === 'tak') return null;
  const ids = new Set();
  for (const p of db.all('SELECT id, responsible_ids FROM projects')) if (JSON.parse(p.responsible_ids).includes(user.employee_id)) ids.add(p.id);
  for (const t of db.all('SELECT DISTINCT project_id FROM tasks WHERE assignee_id=?', user.employee_id)) ids.add(t.project_id);
  for (const b of db.all('SELECT project_id FROM machine_board WHERE project_id IS NOT NULL')) ids.add(b.project_id);
  return ids;
}
// Pracownik nie widzi wkładu (zmian) innych osób w projekt.
function projectForUser(user, p) {
  if (user.role !== 'employee') return p;
  const { contributions, ...rest } = p;
  return rest;
}
const TAK_NIE = ['employee_sees_team_balances', 'employee_sees_all_projects'];

// Czytelny opis zmiany: pola, które się zmieniły (stara → nowa wartość).
const SKIP_FIELDS = new Set(['updated_at', 'created_at', 'password_hash']);
function describeChanges(oldJson, newJson) {
  let o = null, n = null;
  try { o = oldJson ? JSON.parse(oldJson) : null; } catch { o = null; }
  try { n = newJson ? JSON.parse(newJson) : null; } catch { n = null; }
  if (!n || typeof n !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(n)) {
    if (SKIP_FIELDS.has(k)) continue;
    const before = o && typeof o === 'object' ? o[k] : undefined;
    if (JSON.stringify(before ?? null) === JSON.stringify(v ?? null)) continue;
    out.push({ field: k, old: before === undefined ? null : before, new: v ?? null });
  }
  return out.slice(0, 30);
}
function auditRows(rows) {
  return rows.map(a => ({ ...a, changes: describeChanges(a.old_value, a.new_value) }));
}

function buildRoutes() {
  const r = [];
  const add = (method, path, handler, opts = {}) => r.push({ method, path, handler, ...opts });

  // ---------- Logowanie ----------
  add('POST', '/login', ({ db, body, secure, ip }) => {
    const login = String(body.login || '').trim().slice(0, 80);
    const max = C.getSettingInt(db, 'login_max_failures', 5);
    const lockMin = C.getSettingInt(db, 'login_lock_min', 15);
    const now = Date.now();
    const since = new Date(now - lockMin * 60e3).toISOString();
    // Liczą się błędy od ostatniego udanego logowania w oknie blokady.
    const fails = (col, val) => db.get(`SELECT COUNT(*) n, MIN(at) first FROM login_attempts WHERE ${col}=? AND ok=0 AND at>?
      AND at > COALESCE((SELECT MAX(at) FROM login_attempts WHERE ${col}=? AND ok=1), '')`, val, since, val);
    const byLogin = fails('login', login);
    const byIp = ip ? fails('ip', ip) : { n: 0 };
    if (byLogin.n >= max || byIp.n >= max * 4) {
      const first = byLogin.n >= max ? byLogin.first : byIp.first;
      const wait = Math.max(1, Math.ceil((Date.parse(first) + lockMin * 60e3 - now) / 60e3));
      throw new HttpError(429, `Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za ${wait} min.`);
    }
    const u = db.get('SELECT * FROM users WHERE login=?', login);
    const ok = !!(u && u.active && verifyPassword(String(body.password || ''), u.password_hash));
    db.run('INSERT INTO login_attempts(login, ip, ok, at) VALUES (?,?,?,?)', login, ip || null, ok ? 1 : 0, new Date(now).toISOString());
    db.run('DELETE FROM login_attempts WHERE at < ?', new Date(now - 30 * 86400e3).toISOString());
    if (!ok) {
      if (byLogin.n + 1 >= max) audit(db, null, 'session', login, 'blokada_logowania', null, { ip: ip || null, failures: byLogin.n + 1 }, `blokada na ${lockMin} min po błędnych hasłach`);
      throw new HttpError(401, 'Nieprawidłowy login lub hasło.');
    }
    const token = createSession(db, u.id);
    audit(db, u, 'session', u.id, 'logowanie', null, null);
    return { __status: 200, data: { ok: true }, __headers: { 'Set-Cookie': `cnc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}` } };
  }, { public: true });
  add('POST', '/logout', ({ db, cookies }) => {
    db.run('DELETE FROM sessions WHERE token=?', cookies.cnc_session || '');
    return { __status: 200, data: { ok: true }, __headers: { 'Set-Cookie': 'cnc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' } };
  });
  add('GET', '/me', ({ user }) => ({ ...user, caps: capsOf(user), today: T.today(), timezone: T.TZ }));
  add('POST', '/me/password', ({ db, user, body }) => {
    const u = db.get('SELECT * FROM users WHERE id=?', user.id);
    if (!verifyPassword(String(body.old_password || ''), u.password_hash)) throw bad('Nieprawidłowe obecne hasło.');
    if (String(body.new_password || '').length < 10) throw bad('Nowe hasło musi mieć co najmniej 10 znaków.');
    db.run('UPDATE users SET password_hash=? WHERE id=?', core.hashPassword(String(body.new_password)), user.id);
    audit(db, user, 'user', user.id, 'zmiana_hasla', null, null);
  });

  // ---------- Dane referencyjne ----------
  add('GET', '/bootstrap', ({ db, user }) => ({
    machines: db.all('SELECT * FROM machines ORDER BY sort'),
    task_types: db.all('SELECT * FROM task_types ORDER BY sort'),
    shift_templates: db.all('SELECT * FROM shift_templates ORDER BY start_time'),
    categories: db.all('SELECT * FROM absence_categories ORDER BY sort').map(c => user.role === 'employee'
      ? { id: c.id, public_label: c.public_label, visibility: c.visibility, ...(c.visibility === 'pelna' ? { name: c.name, short: c.short, icon: c.icon } : {}) }
      : c),
    employees: People.listEmployees(db).map(e => redactEmployee(user, e)),
    holidays: db.all('SELECT * FROM holidays ORDER BY date'),
    settings: Object.fromEntries(db.all('SELECT key, value FROM settings').filter(s => isAdmin(user) || ['company_name', 'exit_settlement_period', 'cnc_process_url_template'].includes(s.key)).map(s => [s.key, s.value])),
    months: db.all('SELECT year_month, status, version FROM months'),
    causes: P.CAUSES,
  }));

  // ---------- Pracownicy ----------
  add('GET', '/employees', ({ db, user }) => People.listEmployees(db).map(e => redactEmployee(user, e)));
  add('POST', '/employees', ({ db, user, body }) => { requireAdmin(user); return { id: People.saveEmployee(db, user, body) }; });
  add('PUT', '/employees/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: People.saveEmployee(db, user, body, Number(params.id)) }; });
  add('POST', '/employees/:id/terms', ({ db, user, body, params }) => { requireAdmin(user); return { id: People.addTerms(db, user, Number(params.id), body) }; });
  add('POST', '/employees/:id/approve-initial', ({ db, user, params }) => { requireAdmin(user); People.approveInitialSettlement(db, user, Number(params.id)); });

  // ---------- Konta ----------
  add('GET', '/users', ({ db, user }) => {
    requireAdmin(user);
    return db.all('SELECT id, login, display_name, role, employee_id, can_view_confidential, active, created_at FROM users ORDER BY id')
      .map(u => ({ ...u, guest_project_ids: u.role === 'guest' ? db.all('SELECT project_id FROM guest_projects WHERE user_id=?', u.id).map(r => r.project_id) : [] }));
  });
  add('POST', '/users', ({ db, user, body }) => { requireAdmin(user); return { id: People.saveUser(db, user, body) }; });
  add('PUT', '/users/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: People.saveUser(db, user, body, Number(params.id)) }; });

  // ---------- Grafik ----------
  add('GET', '/schedule', ({ db, user, query }) => {
    requireCap(user, 'view.calendar');
    const from = query.from || `${T.today().slice(0, 7)}-01`; const to = query.to || T.lastDayOfMonth(from.slice(0, 7));
    T.assertDate(from); T.assertDate(to);
    return People.listSchedule(db, from, to, int(query.employee_id)).map(s => user.role === 'employee' ? { id: s.id, employee_id: s.employee_id, work_date: s.work_date, start_local: s.start_local, end_local: s.end_local, shift_template_id: s.shift_template_id, planned_min: s.planned_min } : s);
  });
  add('POST', '/schedule', ({ db, user, body }) => { requireAdmin(user); return { id: People.addScheduleEntry(db, user, body) }; });
  add('POST', '/schedule/generate', ({ db, user, body }) => { requireAdmin(user); return People.generateSchedule(db, user, body); });
  add('DELETE', '/schedule/:id', ({ db, user, params, body, query }) => { requireAdmin(user); People.deleteScheduleEntry(db, user, Number(params.id), body.reason || query.reason); });
  add('POST', '/shift-templates', ({ db, user, body }) => { requireAdmin(user); return { id: People.saveShiftTemplate(db, user, body) }; });
  add('PUT', '/shift-templates/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: People.saveShiftTemplate(db, user, body, Number(params.id)) }; });
  add('POST', '/holidays', ({ db, user, body }) => { requireAdmin(user); People.saveHoliday(db, user, body); });
  add('GET', '/attendance', ({ db, user, query }) => {
    requireCap(user, 'view.reports');
    return db.all('SELECT * FROM attendance_records WHERE (? IS NULL OR employee_id=?) ORDER BY start_at DESC LIMIT 500', int(query.employee_id), int(query.employee_id))
      .map(a => ({ ...a, start_local: T.utcToLocal(a.start_at), end_local: T.utcToLocal(a.end_at) }));
  });
  add('POST', '/attendance', ({ db, user, body }) => { requireAdmin(user); return { id: People.addAttendance(db, user, body) }; });

  // ---------- Nieobecności ----------
  add('POST', '/absence-categories', ({ db, user, body }) => { requireAdmin(user); return { id: Abs.saveCategory(db, user, body) }; });
  add('PUT', '/absence-categories/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: Abs.saveCategory(db, user, body, Number(params.id)) }; });
  add('GET', '/absences', ({ db, user, query }) => {
    requireCap(user, 'view.calendar');
    const list = Abs.listAbsences(db, { from: query.from, to: query.to, employeeId: int(query.employee_id), categoryId: user.role === 'employee' ? null : int(query.category_id), status: query.status });
    return list.filter(a => user.role !== 'employee' || a.status !== 'anulowana').map(a => redactAbsence(user, a));
  });
  add('POST', '/absences', ({ db, user, body }) => { requireAdmin(user); return Abs.createAbsence(db, user, body); });
  add('PATCH', '/absences/:id', ({ db, user, body, params }) => { requireAdmin(user); return Abs.updateAbsence(db, user, Number(params.id), body); });

  // ---------- Urlop wypoczynkowy ----------
  add('GET', '/leave/pools', ({ db, user, query }) => { requireCap(user, 'view.leave.all'); const id = int(query.employee_id); if (!id) throw bad('Wskaż pracownika.'); return Abs.listPools(db, id); });
  add('GET', '/leave/overview', ({ db, user }) => {
    requireCap(user, 'view.leave.all');
    return db.all('SELECT id, first_name, last_name FROM employees WHERE active=1 ORDER BY last_name').map(e => ({ employee_id: e.id, name: `${e.first_name} ${e.last_name}`, pools: Abs.listPools(db, e.id).map(p => ({ ...p, ledger: undefined })) }));
  });
  add('POST', '/leave/pools', ({ db, user, body }) => { requireAdmin(user); return { id: Abs.createPool(db, user, body) }; });
  add('GET', '/leave/pools/:id/preview', ({ db, user, params, query }) => { requireAdmin(user); return Abs.previewAdjust(db, Number(params.id), int(query.minutes)); });
  add('POST', '/leave/pools/:id/adjust', ({ db, user, params, body }) => { requireAdmin(user); return Abs.adjustPool(db, user, Number(params.id), body); });

  // ---------- Wybór jednostki (siła wyższa / art. 188) ----------
  add('GET', '/unit-choices', ({ db, user, query }) => {
    requireCap(user, 'view.leave.all');
    const year = int(query.year) || Number(T.today().slice(0, 4));
    const emps = query.employee_id ? [{ id: int(query.employee_id) }] : db.all('SELECT id FROM employees WHERE active=1');
    return emps.flatMap(e => ['sila_wyzsza', 'opieka_188'].map(k => Abs.unitChoice(db, e.id, year, k)));
  });
  add('POST', '/unit-choices/correct', ({ db, user, body }) => { requireAdmin(user); return Abs.correctUnitChoice(db, user, body); });
  add('POST', '/unit-choices/limit', ({ db, user, body }) => { requireAdmin(user); return Abs.setUnitLimit(db, user, body); });

  // ---------- Wyjścia i odrabianie ----------
  add('GET', '/exits', ({ db, user, query }) => {
    let emp = int(query.employee_id);
    if (user.role === 'employee') {
      if (C.getSetting(db, 'employee_sees_team_balances', 'nie') !== 'tak' || !emp) emp = user.employee_id;
      return X.listExits(db, { employeeId: emp, month: query.month }).map(x => ({ id: x.id, employee_id: x.employee_id, work_date: x.work_date, start_local: x.start_local, end_local: x.end_local, minutes: x.minutes, settled_min: x.settled_min, remaining_min: x.remaining_min, state: x.state, settle_by_date: x.settle_by_date, settlement_month: x.settlement_month }));
    }
    requireCap(user, 'view.balances.all');
    return X.listExits(db, { employeeId: emp, month: query.month }).map(x => redactExit(user, x));
  });
  add('POST', '/exits', ({ db, user, body }) => { requireAdmin(user); return X.createExit(db, user, body); });
  add('PATCH', '/exits/:id', ({ db, user, body, params }) => { requireAdmin(user); return X.updateExit(db, user, Number(params.id), body); });
  add('GET', '/makeups', ({ db, user, query }) => {
    let emp = int(query.employee_id);
    if (user.role === 'employee') emp = user.employee_id; else requireCap(user, 'view.balances.all');
    return X.listMakeups(db, { employeeId: emp, month: query.month }).map(m => user.role === 'employee' ? { ...m, note: undefined, day_off_override_reason: undefined } : m);
  });
  add('POST', '/makeups', ({ db, user, body }) => { requireAdmin(user); return X.createMakeup(db, user, body); });
  add('POST', '/makeups/:id/decision', ({ db, user, body, params }) => { requireAdmin(user); X.approveMakeup(db, user, Number(params.id), body); });
  add('GET', '/balances', ({ db, user, query }) => {
    const ym = query.month || T.today().slice(0, 7);
    const all = X.monthBalances(db, ym);
    if (user.role === 'employee') {
      if (C.getSetting(db, 'employee_sees_team_balances', 'nie') === 'tak') return all;
      return all.filter(b => b.employee_id === user.employee_id);
    }
    requireCap(user, 'view.balances.all');
    return all;
  });

  // ---------- Alerty ----------
  add('GET', '/alerts', ({ db, user, query }) => {
    if (user.role === 'employee') return X.listAlerts(db, { employeeId: user.employee_id }).map(a => ({ id: a.id, kind_label: a.kind_label, year_month: a.year_month, trigger_date: a.trigger_date, remaining_min: a.remaining_min, remaining_shifts: a.remaining_shifts, message: a.message }));
    requireCap(user, 'view.alerts');
    return X.listAlerts(db, { includeResolved: query.all === '1' });
  });
  add('POST', '/alerts/:id/read', ({ db, user, params }) => { requireAdmin(user); db.run('UPDATE alerts SET read_at=? WHERE id=?', T.nowIso(), Number(params.id)); });

  // ---------- Miesiące ----------
  add('GET', '/months', ({ db, user }) => {
    requireCap(user, 'view.months');
    const known = new Set(db.all('SELECT DISTINCT settlement_month m FROM private_exits').map(x => x.m));
    for (const m of db.all('SELECT year_month FROM months')) known.add(m.year_month);
    known.add(T.today().slice(0, 7));
    return [...known].sort().reverse().map(ym => ({ year_month: ym, ...(db.get('SELECT status, version, closed_at, reopen_reason FROM months WHERE year_month=?', ym) || { status: 'otwarty', version: 0 }) }));
  });
  add('GET', '/months/:ym/preview', ({ db, user, params }) => { requireCap(user, 'view.months'); return redactMonthReport(user, X.monthReport(db, params.ym)); });
  add('POST', '/months/:ym/close', ({ db, user, params, body }) => { requireAdmin(user); const r = X.closeMonth(db, user, params.ym, body); return { year_month: r.year_month, version: r.version }; });
  add('POST', '/months/:ym/reopen', ({ db, user, params, body }) => { requireAdmin(user); return X.reopenMonth(db, user, params.ym, body); });
  add('GET', '/months/:ym/reports', ({ db, user, params }) => { requireCap(user, 'view.months'); return X.listMonthReports(db, params.ym).map(v => ({ ...v, report: redactMonthReport(user, v.report) })); });
  add('GET', '/months/:ym/report.csv', ({ db, user, params, query }) => {
    requireCap(user, 'export.reports');
    const versions = X.listMonthReports(db, params.ym);
    const v = query.version ? versions.find(x => x.version === Number(query.version)) : versions[versions.length - 1];
    const rep = redactMonthReport(user, v ? v.report : X.monthReport(db, params.ym));
    const rows = [];
    for (const e of rep.employees) for (const x of e.exits) rows.push({ name: e.name, status: e.status, work_date: x.work_date, start: `${x.start.date} ${x.start.time}`, end: `${x.end.date} ${x.end.time}`, minutes: x.minutes, settled: x.settled_min, remaining: x.remaining_min, written_request: x.written_request ? 'tak' : 'nie', document_ref: x.document_ref ?? '' });
    const csv = R.toCsv({ title: `Zestawienie wyjść prywatnych ${params.ym} (wersja ${v ? v.version : 'robocza'})`, definition: rep.rule,
      columns: [['name', 'Pracownik'], ['status', 'Status'], ['work_date', 'Dzień zmiany'], ['start', 'Od'], ['end', 'Do'], ['minutes', 'Minuty', 'min'], ['settled', 'Odrobiono', 'min'], ['remaining', 'Nierozliczone', 'min'], ['written_request', 'Pisemny wniosek'], ['document_ref', 'Dokument']], rows });
    return { __raw: true, body: csv, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rozliczenie-${params.ym}.csv"` } };
  });

  // ---------- Projekty ----------
  add('GET', '/projects', ({ db, user, query }) => {
    requireCap(user, 'view.projects');
    const vis = visibleProjects(db, user);
    return P.listProjects(db, { withTimes: can(user, 'view.efficiency'), machineId: query.machine_id, status: query.status, employeeId: int(query.employee_id) })
      .filter(p => !vis || vis.has(p.id)).map(p => projectForUser(user, p));
  });
  add('GET', '/projects/:id', ({ db, user, params }) => {
    requireCap(user, 'view.projects');
    const vis = visibleProjects(db, user);
    if (vis && !vis.has(params.id)) throw forbidden('Ten projekt nie jest przypisany do Ciebie.');
    return projectForUser(user, P.projectDetail(db, params.id, { withTimes: can(user, 'view.efficiency') }));
  });
  add('POST', '/projects', ({ db, user, body }) => { requireAdmin(user); return { id: P.saveProject(db, user, body) }; });
  add('PUT', '/projects/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: P.saveProject(db, user, body, params.id) }; });
  // Historia projektu wraz z jego zadaniami: kto, kiedy, co zmienił (było → jest), z jakim opisem.
  add('GET', '/projects/:id/history', ({ db, user, params }) => {
    requireAdmin(user);
    const taskIds = db.all('SELECT id FROM tasks WHERE project_id=?', params.id).map(t => String(t.id));
    const ph = taskIds.map(() => '?').join(',') || "''";
    return auditRows(db.all(`SELECT a.*, u.display_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
      WHERE (a.entity IN ('project','tech_data') AND a.entity_id=?) OR (a.entity='task' AND a.entity_id IN (${ph}))
      ORDER BY a.id DESC LIMIT 500`, params.id, ...taskIds));
  });
  add('POST', '/projects/:id/nc-revision', ({ db, user, body, params }) => { requireAdmin(user); return P.setNcRevision(db, user, params.id, body); });
  add('POST', '/projects/:id/tech-data', ({ db, user, body, params }) => { requireAdmin(user); return P.addManualTechData(db, user, params.id, body); });
  add('POST', '/tasks', ({ db, user, body }) => { requireAdmin(user); return { id: P.createTask(db, user, body) }; });
  add('PATCH', '/tasks/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: P.updateTask(db, user, Number(params.id), body) }; });
  add('POST', '/tasks/:id/plan', ({ db, user, body, params }) => { requireAdmin(user); P.changeTaskPlan(db, user, Number(params.id), body); });
  add('POST', '/tasks/:id/explanations', ({ db, user, body, params }) => { requireAdmin(user); return { id: P.addExplanation(db, user, Number(params.id), body) }; });
  add('GET', '/tasks/:id/times', ({ db, user, params }) => { requireCap(user, 'view.efficiency'); return P.taskTimes(db, Number(params.id)); });
  add('POST', '/time-entries', ({ db, user, body }) => { requireAdmin(user); return { id: P.addTimeEntry(db, user, body) }; });
  add('POST', '/task-types', ({ db, user, body }) => { requireAdmin(user); return { id: P.saveTaskType(db, user, body) }; });
  add('PUT', '/task-types/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: P.saveTaskType(db, user, body, Number(params.id)) }; });
  add('POST', '/machines', ({ db, user, body }) => { requireAdmin(user); return { id: P.saveMachine(db, user, body) }; });
  add('PUT', '/machines/:id', ({ db, user, body, params }) => { requireAdmin(user); return { id: P.saveMachine(db, user, body, params.id) }; });

  // ---------- Tablica maszyn i przekazania ----------
  add('GET', '/board', ({ db, user }) => { requireCap(user, 'view.board'); return P.board(db); });
  add('PUT', '/board/:machineId', ({ db, user, body, params }) => { requireAdmin(user); P.updateBoard(db, user, params.machineId, body); });
  add('GET', '/handovers', ({ db, user, query }) => {
    requireCap(user, 'view.handovers');
    const vis = visibleProjects(db, user);
    return P.listHandovers(db, { projectId: query.project_id, machineId: query.machine_id }).filter(h => !vis || vis.has(h.project_id));
  });
  add('POST', '/handovers', ({ db, user, body }) => { requireAdmin(user); return { id: P.createHandover(db, user, body) }; });

  // ---------- Lista zdarzeń (kalendarz + filtry) ----------
  add('GET', '/events', ({ db, user, query }) => {
    requireCap(user, 'view.calendar');
    const from = query.from || `${T.today().slice(0, 7)}-01`; const to = query.to || T.lastDayOfMonth(from.slice(0, 7));
    T.assertDate(from); T.assertDate(to);
    const emp = int(query.employee_id); const kind = query.kind || '';
    const out = [];
    if (!kind || kind === 'nieobecnosc') {
      for (const a of Abs.listAbsences(db, { from, to, employeeId: emp, categoryId: user.role === 'employee' ? null : int(query.category_id) })) {
        if (user.role === 'employee' && a.status === 'anulowana') continue;
        const x = redactAbsence(user, a);
        out.push({ kind: 'nieobecnosc', date: a.start_date, end_date: a.end_date, employee_id: a.employee_id, label: x.category_label, short: x.category_short, icon: x.icon, status: a.status, id: a.id, minutes: user.role === 'employee' ? undefined : a.minutes });
      }
    }
    const ownOnly = user.role === 'employee' && C.getSetting(db, 'employee_sees_team_balances', 'nie') !== 'tak';
    if (!kind || kind === 'wyjscie') {
      for (const x of db.all(`SELECT * FROM private_exits WHERE work_date BETWEEN ? AND ? AND (? IS NULL OR employee_id=?)`, from, to, emp, emp)) {
        if (ownOnly && x.employee_id !== user.employee_id) continue;
        out.push({ kind: 'wyjscie', date: x.work_date, employee_id: x.employee_id, label: 'Wyjście prywatne', short: 'WP', icon: 'exit', status: x.status, id: x.id, minutes: x.minutes, time: `${T.utcToLocal(x.start_at).time}–${T.utcToLocal(x.end_at).time}` });
      }
    }
    if (!kind || kind === 'odrabianie') {
      for (const m of db.all(`SELECT * FROM makeups WHERE work_date BETWEEN ? AND ? AND (? IS NULL OR employee_id=?)`, from, to, emp, emp)) {
        if (ownOnly && m.employee_id !== user.employee_id) continue;
        out.push({ kind: 'odrabianie', date: m.work_date, employee_id: m.employee_id, label: 'Odrabianie', short: 'OD', icon: 'makeup', status: m.status, id: m.id, minutes: m.minutes, time: `${T.utcToLocal(m.start_at).time}–${T.utcToLocal(m.end_at).time}` });
      }
    }
    if (!kind || kind === 'przekazanie') {
      const vis = visibleProjects(db, user);
      for (const h of P.listHandovers(db, { projectId: query.project_id, machineId: query.machine_id })) {
        if (vis && !vis.has(h.project_id)) continue;
        if (h.shift_date < from || h.shift_date > to) continue;
        if (emp && h.from_employee_id !== emp && h.to_employee_id !== emp) continue;
        out.push({ kind: 'przekazanie', date: h.shift_date, employee_id: h.from_employee_id, label: `Przekazanie ${h.order_no} ${h.part_no}`, short: 'PZ', icon: 'handover', id: h.id, project_id: h.project_id, machine_id: h.machine_id });
      }
    }
    let list = out;
    if (query.project_id) list = list.filter(e => e.project_id === query.project_id);
    if (query.machine_id) list = list.filter(e => e.machine_id === query.machine_id);
    return list.sort((a, b) => a.date.localeCompare(b.date));
  });

  // ---------- Pulpit „Dzisiaj” ----------
  add('GET', '/today', ({ db, user }) => {
    const d = T.today();
    const shifts = People.listSchedule(db, T.addDays(d, -1), d).filter(s => s.work_date === d || s.end_at > T.localToUtc(d, '00:00'))
      .map(s => ({ employee_id: s.employee_id, work_date: s.work_date, start: s.start_local, end: s.end_local, shift_template_id: s.shift_template_id }));
    const absToday = Abs.listAbsences(db, { from: d, to: d }).filter(a => a.status !== 'anulowana').map(a => redactAbsence(user, a));
    const vis = visibleProjects(db, user);
    const out = { today: d, shifts, absences: absToday, board: P.board(db), handovers: P.listHandovers(db, {}).filter(h => !vis || vis.has(h.project_id)).slice(0, 5) };
    if (user.role === 'employee') {
      out.my_requests = Req.listRequests(db, { employeeId: user.employee_id, limit: 5 }).map(r => ({ id: r.id, kind: r.kind, date_from: r.date_from, date_to: r.date_to, status: r.status, decision_note: r.decision_note }));
      out.my_balance = X.monthBalances(db, d.slice(0, 7)).find(b => b.employee_id === user.employee_id) || null;
      out.alerts = X.listAlerts(db, { employeeId: user.employee_id }).map(a => ({ kind_label: a.kind_label, message: a.message, remaining_min: a.remaining_min }));
    } else {
      out.alerts = X.listAlerts(db, {});
      out.balances = X.monthBalances(db, d.slice(0, 7)).filter(b => b.remaining_min > 0);
      out.leave_reminders = db.all('SELECT id, first_name, last_name FROM employees WHERE active=1').flatMap(e => Abs.listPools(db, e.id).filter(p => p.overdue).map(p => ({ employee_id: e.id, name: `${e.first_name} ${e.last_name}`, year: p.acquisition_year, balance_min: p.balance_min, ...p.overdue })));
      out.pending_makeups = db.get(`SELECT COUNT(*) n FROM makeups WHERE status='oczekuje'`).n;
      out.pending_requests = db.get(`SELECT COUNT(*) n FROM requests WHERE status='nowe'`).n;
      const ss = P.scheduleSettings(db);
      out.delayed_projects = db.all(`SELECT id FROM projects WHERE status='aktywny'`).map(r => P.projectDetail(db, r.id, { withTimes: false }))
        .filter(p => p.schedule.level === 'opozniony' || p.schedule.level === 'zagrozony')
        .map(p => ({ id: p.id, order_no: p.order_no, part_no: p.part_no, due_date: p.due_date, ...p.schedule, thresholds: ss }));
      out.blocked_projects = db.all(`SELECT id, order_no, part_no, block_reason FROM projects WHERE blocked=1 AND status='aktywny'`);
    }
    return out;
  });

  // ---------- Raporty ----------
  add('GET', '/reports/:name', ({ db, user, params, query }) => {
    const name = params.name.replace(/\.csv$/, '');
    const def = R.REPORTS[name];
    if (!def) throw notFound('Nieznany raport.');
    requireCap(user, def.cap);
    const rep = def.fn(db, query);
    if (params.name.endsWith('.csv')) {
      requireCap(user, 'export.reports');
      audit(db, user, 'export', name, 'eksport_csv', null, { query });
      return { __raw: true, body: R.toCsv(rep), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="raport-${name}.csv"` } };
    }
    return wrapReport(rep);
  });

  // ---------- Integracja z CNC Process ----------
  add('GET', '/integration/cnc-process/export', ({ db, user }) => {
    requireAdmin(user);
    const data = I.exportForCncProcess(db);
    audit(db, user, 'export', 'cnc-process', 'eksport_json', null, { projects: data.projects.length });
    return { __raw: true, body: JSON.stringify(data, null, 2), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="cnc-team-exchange.json"' } };
  });
  add('POST', '/integration/cnc-process/import', ({ db, user, raw, query }) => { requireAdmin(user); return I.importFromCncProcess(db, user, raw, { dryRun: query.dry_run === '1' }); }, { rawBody: true });
  add('GET', '/integration/imports', ({ db, user }) => { requireAdmin(user); return db.all('SELECT * FROM tech_imports ORDER BY id DESC'); });

  // ---------- Zgłoszenia pracowników (do weryfikacji przez kierownika) ----------
  add('GET', '/requests', ({ db, user, query }) => {
    if (user.role === 'employee') {
      return Req.listRequests(db, { employeeId: user.employee_id, limit: 100 }).map(({ user_id, client_id, decided_by, ...r }) => r);
    }
    requireCap(user, 'view.balances.all');
    return Req.listRequests(db, { status: query.status || null, employeeId: int(query.employee_id) });
  });
  add('POST', '/requests', ({ db, user, body }) => { requireCap(user, 'request.create'); return Req.createRequest(db, user, body); });
  add('POST', '/requests/:id/withdraw', ({ db, user, params }) => { requireCap(user, 'request.create'); return Req.withdrawRequest(db, user, Number(params.id)); });
  add('POST', '/requests/:id/decide', ({ db, user, params, body }) => { requireAdmin(user); return Req.decideRequest(db, user, Number(params.id), body); });

  // ---------- Gość: status przypisanych projektów w realizacji ----------
  add('GET', '/guest/projects', ({ db, user }) => {
    if (user.role !== 'guest') throw forbidden();
    return db.all(`SELECT gp.project_id FROM guest_projects gp JOIN projects p ON p.id=gp.project_id
      WHERE gp.user_id=? AND p.status IN ('aktywny','wstrzymany') ORDER BY p.priority, p.due_date`, user.id).map(r => P.guestStatus(db, r.project_id));
  });

  // ---------- Chmura: aplikacja pracowników ----------
  add('GET', '/cloud/status', ({ user, cloud }) => { requireAdmin(user); return cloud.status(); });
  add('POST', '/cloud/login', async ({ user, cloud, body }) => { requireAdmin(user); return cloud.login(user, body); });
  add('POST', '/cloud/logout', ({ user, cloud }) => { requireAdmin(user); cloud.logout(user); });
  add('POST', '/cloud/sync', async ({ user, cloud }) => { requireAdmin(user); return cloud.sync('reczna'); });
  add('GET', '/cloud/reports', ({ user, cloud, query }) => { requireAdmin(user); return cloud.listReports({ status: query.status }); });
  add('POST', '/cloud/reports/:id/decide', async ({ user, cloud, params, body }) => { requireAdmin(user); return cloud.decide(user, params.id, body); });
  add('GET', '/cloud/preview', ({ user, cloud }) => { requireAdmin(user); return cloud.buildPublications(); });

  // ---------- Ustawienia i historia ----------
  add('GET', '/settings', ({ db, user }) => { requireAdmin(user); return db.all('SELECT * FROM settings ORDER BY key'); });
  add('PUT', '/settings/:key', ({ db, user, params, body }) => {
    requireAdmin(user);
    const old = db.get('SELECT * FROM settings WHERE key=?', params.key);
    if (!old) throw notFound('Nieznane ustawienie.');
    const value = String(body.value ?? '');
    if (/_min$|_pct$/.test(params.key) && !/^\d+$/.test(value)) throw bad('Wartość musi być liczbą całkowitą.');
    if (TAK_NIE.includes(params.key) && !['tak', 'nie'].includes(value)) throw bad('Dozwolone: tak / nie.');
    db.run('UPDATE settings SET value=? WHERE key=?', value, params.key);
    audit(db, user, 'setting', params.key, 'edycja', old.value, value, body.reason);
  });
  add('GET', '/audit', ({ db, user, query }) => {
    requireAdmin(user);
    return auditRows(db.all(`SELECT a.*, u.display_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE (? IS NULL OR entity=?) AND (? IS NULL OR entity_id=?)
      AND (? IS NULL OR a.user_id=?) ORDER BY a.id DESC LIMIT 300`, query.entity || null, query.entity || null, query.entity_id || null, query.entity_id || null,
    int(query.user_id), int(query.user_id)));
  });
  return r;
}

function redactMonthReport(user, rep) {
  if (can(user, 'view.confidential')) return rep;
  return { ...rep, employees: rep.employees.map(e => ({ ...e, exits: e.exits.map(x => ({ ...x, document_ref: undefined })) })) };
}

function capsOf(user) {
  const caps = ['view.calendar', 'view.projects', 'view.board', 'view.handovers', 'view.employees.profile', 'view.balances.all', 'view.balances.own', 'view.leave.all',
    'view.reports', 'view.efficiency', 'export.reports', 'view.alerts', 'view.months', 'view.confidential', 'request.create', 'view.guest'];
  const out = caps.filter(c => can(user, c));
  if (user.role === 'admin') out.push('write');
  return out;
}

module.exports = { buildRoutes, redactAbsence, ADMIN };
