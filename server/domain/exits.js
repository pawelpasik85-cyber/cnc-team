'use strict';
// Wyjścia prywatne, odrabianie (z przypisaniem minut), rozliczenie i zamknięcie miesiąca, alerty.
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, reqInt, oneOf } = require('../core');
const C = require('./common');

// ---------- Wyjścia ----------
function exitAllocated(db, exitId, { approvedOnly = true } = {}) {
  return db.get(`SELECT COALESCE(SUM(al.minutes),0) s FROM makeup_allocations al JOIN makeups m ON m.id=al.makeup_id
     WHERE al.exit_id=? AND ${approvedOnly ? "m.status='zatwierdzone'" : "m.status!='odrzucone'"}`, exitId).s;
}

function decorateExit(db, x) {
  const settled = exitAllocated(db, x.id);
  const reserved = exitAllocated(db, x.id, { approvedOnly: false });
  const remaining = x.status === 'anulowane' ? 0 : x.minutes - settled;
  let state = x.status;
  if (x.status === 'zarejestrowane') state = remaining === 0 ? 'rozliczone' : (settled > 0 ? 'czesciowo_rozliczone' : 'do_odrobienia');
  if (x.hr_status) state = x.hr_status;
  return {
    ...x, settled_min: settled, pending_min: reserved - settled, remaining_min: remaining, state,
    start_local: T.utcToLocal(x.start_at), end_local: T.utcToLocal(x.end_at),
    allocations: db.all(`SELECT al.*, m.status AS makeup_status, m.work_date AS makeup_date FROM makeup_allocations al
       JOIN makeups m ON m.id=al.makeup_id WHERE al.exit_id=? ORDER BY al.id`, x.id),
  };
}

function createExit(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  C.employeeOrThrow(db, employeeId);
  const sd = reqStr(body.start_date, 'Data');
  const start_at = T.localToUtc(sd, reqStr(body.start_time, 'Od godz.'));
  const end_at = T.localToUtc(body.end_date || sd, reqStr(body.end_time, 'Do godz.'));
  if (end_at <= start_at) throw bad('Koniec wyjścia musi być po początku.');
  const status = oneOf(body.status || 'zarejestrowane', 'Status', ['planowane', 'zarejestrowane']);
  const shifts = C.scheduleIn(db, employeeId, start_at, end_at);
  if (shifts.length !== 1) {
    throw conflict(shifts.length ? 'Wyjście obejmuje kilka zmian — zarejestruj je osobno.' : 'Wyjście poza czasem pracy wg grafiku — brak minut do rozliczenia.');
  }
  const minutes = C.scheduledOverlapMin(db, employeeId, start_at, end_at);
  const workDate = shifts[0].work_date; // zmiana nocna → dzień i miesiąc rozpoczęcia zmiany
  const ym = T.monthOf(workDate);
  C.assertMonthOpen(db, ym);
  const cl = C.occupancyConflicts(db, employeeId, start_at, end_at);
  if (cl.length) throw conflict(`Wyjście nakłada się na: ${cl.map(c => c.label).join('; ')}.`, { conflicts: cl });
  const warnings = [];
  if (!body.written_request) warnings.push('Brak pisemnego wniosku pracownika. Wpis administratora nie zastępuje wniosku.');
  return db.tx(() => {
    const now = T.nowIso();
    const r = db.run(`INSERT INTO private_exits(employee_id,work_date,settlement_month,start_at,end_at,minutes,status,written_request,
      document_ref,settle_by_date,confidential_note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    employeeId, workDate, ym, start_at, end_at, minutes, status, body.written_request ? 1 : 0, body.document_ref || null,
    T.lastDayOfMonth(ym), body.confidential_note || null, user.id, now, now);
    const id = Number(r.lastInsertRowid);
    audit(db, user, 'private_exit', id, 'utworzenie', null, { employee_id: employeeId, work_date: workDate, start_at, end_at, minutes, status });
    recomputeAlerts(db);
    return { id, minutes, warnings };
  });
}

function updateExit(db, user, id, body) {
  const old = db.get('SELECT * FROM private_exits WHERE id=?', id);
  if (!old) throw notFound();
  C.assertMonthOpen(db, old.settlement_month);
  const reason = reqStr(body.reason, 'Powód zmiany');
  const status = oneOf(body.status || old.status, 'Status', ['planowane', 'zarejestrowane', 'anulowane']);
  if (old.status === 'anulowane') throw conflict('Anulowane wyjście jest zamknięte w historii.');
  if (status === 'anulowane' && exitAllocated(db, id, { approvedOnly: false }) > 0) {
    throw conflict('Do wyjścia przypisano odrabianie — nie można go anulować bez korekty odrabiania.');
  }
  return db.tx(() => {
    db.run(`UPDATE private_exits SET status=?, written_request=?, document_ref=?, confidential_note=?, cancel_reason=?, updated_at=? WHERE id=?`,
      status, body.written_request === undefined ? old.written_request : (body.written_request ? 1 : 0),
      body.document_ref === undefined ? old.document_ref : body.document_ref,
      body.confidential_note === undefined ? old.confidential_note : body.confidential_note,
      status === 'anulowane' ? reason : old.cancel_reason, T.nowIso(), id);
    audit(db, user, 'private_exit', id, status === 'anulowane' ? 'anulowanie' : 'edycja', old, { status }, reason);
    recomputeAlerts(db);
    return { id };
  });
}

function listExits(db, { employeeId, month } = {}) {
  const w = ['1=1'], p = [];
  if (employeeId) { w.push('employee_id=?'); p.push(employeeId); }
  if (month) { w.push('settlement_month=?'); p.push(month); }
  return db.all(`SELECT * FROM private_exits WHERE ${w.join(' AND ')} ORDER BY start_at`, ...p).map(x => decorateExit(db, x));
}

// ---------- Odrabianie ----------
// Sprawdza 11-godzinny odpoczynek dobowy (art. 132 KP — reguła oznaczona do potwierdzenia) między blokami pracy.
function restViolations(db, employeeId, start_at, end_at, excludeMakeup) {
  const minRest = C.getSettingInt(db, 'min_daily_rest_min', 660);
  const lo = new Date(Date.parse(start_at) - 3 * 86400e3).toISOString();
  const hi = new Date(Date.parse(end_at) + 3 * 86400e3).toISOString();
  const iv = [
    ...db.all('SELECT start_at, end_at FROM schedule_entries WHERE employee_id=? AND end_at > ? AND start_at < ?', employeeId, lo, hi),
    ...db.all(`SELECT start_at, end_at FROM makeups WHERE employee_id=? AND status!='odrzucone' AND id != ? AND end_at > ? AND start_at < ?`, employeeId, excludeMakeup || 0, lo, hi),
    ...db.all(`SELECT start_at, end_at FROM attendance_records WHERE employee_id=? AND kind='nadgodziny' AND end_at > ? AND start_at < ?`, employeeId, lo, hi),
    { start_at, end_at, mine: true },
  ].sort((a, b) => a.start_at.localeCompare(b.start_at));
  // łączenie przedziałów stykających się (przerwa < 1 min) w bloki pracy
  const blocks = [];
  for (const x of iv) {
    const last = blocks[blocks.length - 1];
    if (last && Date.parse(x.start_at) - Date.parse(last.end_at) < 60000) {
      if (x.end_at > last.end_at) last.end_at = x.end_at;
      last.mine = last.mine || x.mine;
    } else blocks.push({ ...x });
  }
  const i = blocks.findIndex(b => b.mine);
  const out = [];
  const prev = blocks[i - 1], next = blocks[i + 1];
  if (prev) { const gap = T.minutesBetween(prev.end_at, blocks[i].start_at); if (gap < minRest) out.push(`odpoczynek przed: ${T.fmtHM(gap)} (wymagane ${T.fmtHM(minRest)})`); }
  if (next) { const gap = T.minutesBetween(blocks[i].end_at, next.start_at); if (gap < minRest) out.push(`odpoczynek po: ${T.fmtHM(gap)} (wymagane ${T.fmtHM(minRest)})`); }
  return out;
}

function createMakeup(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  C.employeeOrThrow(db, employeeId);
  const sd = reqStr(body.start_date, 'Data');
  const start_at = T.localToUtc(sd, reqStr(body.start_time, 'Od godz.'));
  const end_at = T.localToUtc(body.end_date || sd, reqStr(body.end_time, 'Do godz.'));
  const minutes = T.minutesBetween(start_at, end_at);
  if (minutes <= 0) throw bad('Koniec odrabiania musi być po początku.');
  const ym = T.monthOf(sd);
  C.assertMonthOpen(db, ym);
  const clashShift = C.scheduleIn(db, employeeId, start_at, end_at);
  if (clashShift.length) throw conflict('Odrabianie nakłada się na zmianę z grafiku — czas zaplanowany nie jest odrabianiem.');
  const cl = C.occupancyConflicts(db, employeeId, start_at, end_at);
  if (cl.length) throw conflict(`Odrabianie nakłada się na: ${cl.map(c => c.label).join('; ')}.`, { conflicts: cl });
  const rest = restViolations(db, employeeId, start_at, end_at);
  if (rest.length) throw conflict(`Naruszenie odpoczynku dobowego: ${rest.join('; ')}.`, { code: 'rest' });
  const hasShiftThatDay = db.get('SELECT 1 FROM schedule_entries WHERE employee_id=? AND work_date=?', employeeId, sd);
  const hol = db.get('SELECT * FROM holidays WHERE date=?', sd);
  if (!hasShiftThatDay || hol) {
    if (!body.day_off_override_reason) {
      throw conflict('Dzień wolny od pracy wg grafiku (lub święto). Praca w dniu wolnym nie jest automatycznie zwykłym odrobieniem — podaj uzasadnienie zgodne z zasadami firmy i kadr.', { code: 'day_off' });
    }
  }
  const allocs = Array.isArray(body.allocations) ? body.allocations : [];
  if (!allocs.length) throw bad('Wskaż wyjście (lub kilka), do którego przypisujesz minuty odrabiania.');
  let sum = 0;
  const seen = new Set();
  for (const al of allocs) {
    const exitId = reqInt(al.exit_id, 'Wyjście');
    const m = reqInt(al.minutes, 'Minuty', { min: 1, max: 1440 });
    if (seen.has(exitId)) throw bad('To samo wyjście podano dwukrotnie.');
    seen.add(exitId);
    const x = db.get('SELECT * FROM private_exits WHERE id=?', exitId);
    if (!x || x.employee_id !== employeeId) throw bad('Wyjście nie należy do tego pracownika.');
    if (x.status !== 'zarejestrowane') throw conflict('Odrabiać można tylko zarejestrowane (nieanulowane, niezaplanowane) wyjście.');
    if (x.settlement_month !== ym) throw conflict(`Wyjście rozliczane jest w miesiącu ${x.settlement_month} (zasada firmy: miesiąc kalendarzowy).`);
    if (x.start_at > start_at) throw conflict('Odrabianie nie może poprzedzać wyjścia (brak kredytu z wcześniejszej pracy).');
    const already = exitAllocated(db, exitId, { approvedOnly: false });
    if (already + m > x.minutes) {
      throw conflict(`Podwójne rozliczenie: do wyjścia #${exitId} przypisano już ${T.fmtHM(already)} z ${T.fmtHM(x.minutes)}.`, { code: 'double' });
    }
    sum += m;
  }
  if (sum > minutes) throw conflict(`Przypisano ${T.fmtHM(sum)}, a odrabianie trwa ${T.fmtHM(minutes)}.`);
  const warnings = [];
  if (sum < minutes) warnings.push(`Nadwyżka ${T.fmtHM(minutes - sum)} nie jest przypisana i NIE tworzy kredytu do odrobienia.`);
  return db.tx(() => {
    const r = db.run(`INSERT INTO makeups(employee_id,work_date,settlement_month,start_at,end_at,minutes,status,day_off_override_reason,note,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, employeeId, sd, ym, start_at, end_at, minutes, 'oczekuje', body.day_off_override_reason || null, body.note || null, user.id, T.nowIso());
    const id = Number(r.lastInsertRowid);
    for (const al of allocs) db.run('INSERT INTO makeup_allocations(makeup_id,exit_id,minutes,created_at) VALUES (?,?,?,?)', id, Number(al.exit_id), Number(al.minutes), T.nowIso());
    audit(db, user, 'makeup', id, 'utworzenie', null, { employee_id: employeeId, start_at, end_at, minutes, allocations: allocs });
    if (body.approve) approveMakeup(db, user, id, { decision: 'zatwierdzone' });
    recomputeAlerts(db);
    return { id, minutes, warnings };
  });
}

function approveMakeup(db, user, id, body) {
  const m = db.get('SELECT * FROM makeups WHERE id=?', id);
  if (!m) throw notFound();
  C.assertMonthOpen(db, m.settlement_month);
  const decision = oneOf(body.decision, 'Decyzja', ['zatwierdzone', 'odrzucone']);
  if (m.status !== 'oczekuje') throw conflict('Decyzja w sprawie tego odrabiania została już podjęta.');
  if (decision === 'odrzucone' && !body.reason) throw bad('Odrzucenie wymaga powodu.');
  return db.tx(() => {
    db.run('UPDATE makeups SET status=?, approved_by=?, approved_at=? WHERE id=?', decision, user.id, T.nowIso(), id);
    audit(db, user, 'makeup', id, decision === 'zatwierdzone' ? 'zatwierdzenie' : 'odrzucenie', { status: m.status }, { status: decision }, body.reason);
    recomputeAlerts(db);
  });
}

function listMakeups(db, { employeeId, month } = {}) {
  const w = ['1=1'], p = [];
  if (employeeId) { w.push('employee_id=?'); p.push(employeeId); }
  if (month) { w.push('settlement_month=?'); p.push(month); }
  return db.all(`SELECT * FROM makeups WHERE ${w.join(' AND ')} ORDER BY start_at`, ...p).map(m => {
    const allocations = db.all('SELECT * FROM makeup_allocations WHERE makeup_id=?', m.id);
    const allocated = allocations.reduce((s, a) => s + a.minutes, 0);
    return { ...m, allocations, allocated_min: allocated, unallocated_min: m.minutes - allocated, start_local: T.utcToLocal(m.start_at), end_local: T.utcToLocal(m.end_at) };
  });
}

// ---------- Salda ----------
function monthBalances(db, ym) {
  const emps = db.all('SELECT id, first_name, last_name FROM employees ORDER BY last_name');
  return emps.map(e => {
    const exits = listExits(db, { employeeId: e.id, month: ym }).filter(x => x.status === 'zarejestrowane');
    const total = exits.reduce((s, x) => s + x.minutes, 0);
    const settled = exits.reduce((s, x) => s + x.settled_min, 0);
    return {
      employee_id: e.id, name: `${e.first_name} ${e.last_name}`, exits_min: total, settled_min: settled,
      remaining_min: total - settled, exits_count: exits.length,
      remaining_shifts: remainingShifts(db, e.id, ym),
    };
  });
}

function remainingShifts(db, employeeId, ym) {
  const t = T.today();
  const from = t > `${ym}-01` ? t : `${ym}-01`;
  return db.get('SELECT COUNT(*) n FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN ? AND ?', employeeId, from, T.lastDayOfMonth(ym)).n;
}

// ---------- Alerty ----------
// Wyzwalacze dla miesiąca M przy dodatnim saldzie:
//  dwa_dni_kalendarzowe: ostatni dzień − 2;
//  dwa_dni_robocze: data przedostatniej zmiany pracownika w M (gdy wypada wcześniej niż powyższa);
//  ostatni_dzien: ostatni dzień miesiąca;  zamkniecie: przy zamknięciu miesiąca.
// Klucz deduplikacji: rodzaj:pracownik:miesiąc. Uruchamiane przy starcie i po każdej zmianie.
function alertTriggers(db, employeeId, ym) {
  const last = T.lastDayOfMonth(ym);
  const cal = T.addDays(last, -2);
  const t = [{ kind: 'dwa_dni_kalendarzowe', date: cal }, { kind: 'ostatni_dzien', date: last }];
  const shifts = db.all('SELECT DISTINCT work_date FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date DESC LIMIT 2',
    employeeId, `${ym}-01`, last);
  if (shifts.length === 2 && shifts[1].work_date < cal) t.push({ kind: 'dwa_dni_robocze', date: shifts[1].work_date });
  return t;
}

const KIND_LABEL = {
  dwa_dni_kalendarzowe: '2 dni kalendarzowe do końca miesiąca', dwa_dni_robocze: '2 dni robocze wg grafiku do końca miesiąca',
  ostatni_dzien: 'ostatni dzień miesiąca', zamkniecie: 'zamknięcie miesiąca',
};

function recomputeAlerts(db, todayOverride) {
  const today = todayOverride || T.today();
  const months = new Set(db.all(`SELECT DISTINCT settlement_month m FROM private_exits WHERE status='zarejestrowane'`).map(r => r.m));
  const created = [];
  for (const ym of months) {
    if (C.monthStatus(db, ym) === 'zamkniety') continue;
    for (const b of monthBalances(db, ym)) {
      if (b.remaining_min <= 0) {
        db.run(`UPDATE alerts SET resolved_at=? WHERE employee_id=? AND year_month=? AND resolved_at IS NULL AND kind != 'zamkniecie'`, T.nowIso(), b.employee_id, ym);
        continue;
      }
      // saldo dodatnie: przywróć alerty rozwiązane wcześniej (np. po późno dodanym wyjściu)
      db.run(`UPDATE alerts SET resolved_at=NULL WHERE employee_id=? AND year_month=? AND kind != 'zamkniecie'`, b.employee_id, ym);
      for (const tr of alertTriggers(db, b.employee_id, ym)) {
        if (tr.date > today) continue;
        const key = `${tr.kind}:${b.employee_id}:${ym}`;
        const r = db.run(`INSERT OR IGNORE INTO alerts(dedup_key,kind,employee_id,year_month,trigger_date,message,created_at) VALUES (?,?,?,?,?,?,?)`,
          key, tr.kind, b.employee_id, ym, tr.date, `${b.name}: nierozliczone wyjścia prywatne w ${ym} (${KIND_LABEL[tr.kind]}).`, T.nowIso());
        if (r.changes) created.push(key);
      }
    }
  }
  return created;
}

function listAlerts(db, { employeeId, includeResolved } = {}) {
  const rows = db.all(`SELECT * FROM alerts WHERE (? IS NULL OR employee_id=?) ${includeResolved ? '' : 'AND resolved_at IS NULL'} ORDER BY trigger_date DESC, id DESC`,
    employeeId || null, employeeId || null);
  return rows.map(a => {
    const b = a.year_month ? monthBalances(db, a.year_month).find(x => x.employee_id === a.employee_id) : null;
    return { ...a, kind_label: KIND_LABEL[a.kind] || a.kind, remaining_min: b ? b.remaining_min : null, remaining_shifts: b ? b.remaining_shifts : null };
  });
}

// ---------- Zamknięcie miesiąca ----------
function monthReport(db, ym) {
  const balances = monthBalances(db, ym);
  return {
    year_month: ym, generated_at: T.nowIso(),
    rule: 'Wyjścia prywatne rozliczane w miesiącu kalendarzowym (ustawienie firmy). Raport nie zawiera obliczeń wynagrodzeń ani potrąceń.',
    employees: balances.map(b => ({
      ...b,
      status: b.remaining_min > 0 ? 'nierozliczone — do przekazania kadrom' : 'rozliczone',
      exits: listExits(db, { employeeId: b.employee_id, month: ym }).map(x => ({
        id: x.id, work_date: x.work_date, start: x.start_local, end: x.end_local, minutes: x.minutes, settled_min: x.settled_min,
        remaining_min: x.remaining_min, status: x.status, written_request: !!x.written_request, document_ref: x.document_ref,
      })),
      absences: db.all(`SELECT c.name, a.status, COUNT(*) n, SUM(a.minutes) minutes, SUM(a.days) days FROM absences a
        JOIN absence_categories c ON c.id=a.category_id WHERE a.employee_id=? AND a.status!='anulowana'
        AND a.start_date <= ? AND a.end_date >= ? GROUP BY c.name, a.status`, b.employee_id, T.lastDayOfMonth(ym), `${ym}-01`),
    })),
  };
}

function closeMonth(db, user, ym, body = {}) {
  if (!/^\d{4}-\d{2}$/.test(ym)) throw bad('Niepoprawny miesiąc.');
  if (C.monthStatus(db, ym) === 'zamkniety') throw conflict('Miesiąc jest już zamknięty.');
  const pending = db.get(`SELECT COUNT(*) n FROM makeups WHERE settlement_month=? AND status='oczekuje'`, ym).n;
  if (pending) throw conflict(`W miesiącu są odrabiania oczekujące na decyzję (${pending}). Zatwierdź lub odrzuć je przed zamknięciem.`);
  return db.tx(() => {
    recomputeAlerts(db);
    const report = monthReport(db, ym);
    const row = db.get('SELECT * FROM months WHERE year_month=?', ym);
    const version = (row ? row.version : 0) + 1;
    db.run(`INSERT INTO months(year_month,status,version,closed_at,closed_by) VALUES (?,?,?,?,?)
      ON CONFLICT(year_month) DO UPDATE SET status='zamkniety', version=excluded.version, closed_at=excluded.closed_at, closed_by=excluded.closed_by`,
    ym, 'zamkniety', version, T.nowIso(), user.id);
    db.run(`INSERT INTO month_reports(year_month,version,created_at,created_by,reason,report_json) VALUES (?,?,?,?,?,?)`,
      ym, version, T.nowIso(), user.id, body.reason || (version === 1 ? 'zamknięcie' : 'ponowne zamknięcie po korekcie'), JSON.stringify(report));
    for (const e of report.employees) {
      for (const x of e.exits) {
        if (x.status === 'zarejestrowane' && x.remaining_min > 0) db.run(`UPDATE private_exits SET hr_status='nierozliczone_do_kadr', updated_at=? WHERE id=?`, T.nowIso(), x.id);
      }
      if (e.remaining_min > 0) {
        db.run(`INSERT OR IGNORE INTO alerts(dedup_key,kind,employee_id,year_month,trigger_date,message,created_at) VALUES (?,?,?,?,?,?,?)`,
          `zamkniecie:${e.employee_id}:${ym}:v${version}`, 'zamkniecie', e.employee_id, ym, T.today(),
          `${e.name}: ${T.fmtHM(e.remaining_min)} nierozliczone przy zamknięciu ${ym} — do przekazania kadrom.`, T.nowIso());
      }
    }
    db.run(`UPDATE alerts SET resolved_at=? WHERE year_month=? AND kind != 'zamkniecie' AND resolved_at IS NULL`, T.nowIso(), ym);
    audit(db, user, 'month', ym, 'zamknięcie', row, { version }, body.reason);
    return { year_month: ym, version, report };
  });
}

function reopenMonth(db, user, ym, body) {
  const reason = reqStr(body.reason, 'Powód ponownego otwarcia');
  const row = db.get('SELECT * FROM months WHERE year_month=?', ym);
  if (!row || row.status !== 'zamkniety') throw conflict('Miesiąc nie jest zamknięty.');
  return db.tx(() => {
    db.run(`UPDATE months SET status='otwarty', reopen_reason=? WHERE year_month=?`, reason, ym);
    db.run(`UPDATE private_exits SET hr_status=NULL, updated_at=? WHERE settlement_month=? AND hr_status IS NOT NULL`, T.nowIso(), ym);
    db.run(`UPDATE alerts SET resolved_at=? WHERE year_month=? AND kind='zamkniecie' AND resolved_at IS NULL`, T.nowIso(), ym);
    audit(db, user, 'month', ym, 'ponowne_otwarcie', row, { status: 'otwarty' }, reason);
    recomputeAlerts(db);
    return { year_month: ym, status: 'otwarty' };
  });
}

function listMonthReports(db, ym) {
  return db.all('SELECT id, year_month, version, created_at, created_by, reason, report_json FROM month_reports WHERE year_month=? ORDER BY version', ym)
    .map(r => ({ ...r, report: JSON.parse(r.report_json), report_json: undefined }));
}

module.exports = {
  createExit, updateExit, listExits, createMakeup, approveMakeup, listMakeups, monthBalances, recomputeAlerts, listAlerts,
  closeMonth, reopenMonth, monthReport, listMonthReports, alertTriggers, restViolations, exitAllocated,
};
