'use strict';
// Zgłoszenia pracowników do weryfikacji. Pracownik nie wpisuje spóźnień, wyjść ani odrabiania samodzielnie —
// składa zgłoszenie, a kierownik je przyjmuje (tworząc wpis) albo odrzuca z wyjaśnieniem.
// Decyzja kierownika i utworzony wpis zapisywane są w jednej transakcji (wszystko albo nic).
const T = require('../time');
const { bad, conflict, notFound, forbidden, audit, reqInt, oneOf } = require('../core');
const Abs = require('./absences');
const X = require('./exits');

const KINDS = {
  nieobecnosc: 'Nieobecność', spoznienie: 'Spóźnienie', wyjscie: 'Wyjście w trakcie zmiany',
  odrobienie: 'Odrobienie czasu', inne: 'Inna sprawa',
};
// Rodzaje nieobecności, o które programista może poprosić (zaznacza — przyjęcie i wpis wyłącznie przez kierownika)
const WANTED = ['URLOP_WYP', 'URLOP_NA_ZADANIE', 'L4', 'OPIEKA_ZUS', 'OPIEKA_188', 'SILA_WYZSZA', 'OKOL_SLUB', 'OKOL_NARODZINY', 'OKOL_ZGON_BLISKI',
  'OKOL_SLUB_DZIECKA', 'OKOL_ZGON_DALSZY', 'BEZPLATNY', 'KREW', 'BADANIA_PROFIL', 'SZKOLENIOWY', 'WEZWANIE', 'WOJSKO', 'INNE_USTAWOWE'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_BACK_DAYS = 31;
const MAX_SPAN_DAYS = 60;
const MAX_AHEAD_DAYS = 180;

function validate(body, today = T.today()) {
  const r = {
    kind: body.kind, date_from: body.date_from, date_to: body.date_to || body.date_from,
    time_from: body.time_from || null, time_to: body.time_to || null,
    note: body.note == null || String(body.note).trim() === '' ? null : String(body.note).trim(),
    wanted_code: body.kind === 'nieobecnosc' && body.wanted_code ? String(body.wanted_code) : null,
  };
  const errors = [];
  if (typeof r.kind !== 'string' || !Object.hasOwn(KINDS, r.kind)) errors.push('Wybierz rodzaj zgłoszenia.');
  if (!DATE_RE.test(r.date_from || '')) errors.push('Podaj dzień.');
  else {
    if (!DATE_RE.test(r.date_to || '')) errors.push('Niepoprawna data końca.');
    else if (r.date_to < r.date_from) errors.push('Data końca jest przed datą początku.');
    else if ((Date.parse(r.date_to) - Date.parse(r.date_from)) / 86400e3 > MAX_SPAN_DAYS) errors.push(`Zgłoszenie może obejmować najwyżej ${MAX_SPAN_DAYS} dni.`);
    if (r.date_from < T.addDays(today, -MAX_BACK_DAYS)) errors.push(`Zgłoszenie może dotyczyć najwyżej ${MAX_BACK_DAYS} dni wstecz.`);
    if (r.date_from > T.addDays(today, MAX_AHEAD_DAYS)) errors.push(`Zgłoszenie może dotyczyć najwyżej ${MAX_AHEAD_DAYS} dni naprzód.`);
  }
  for (const k of ['time_from', 'time_to']) if (r[k] && !TIME_RE.test(r[k])) errors.push('Niepoprawna godzina (GG:MM).');
  if (r.kind === 'spoznienie' && !r.time_to) errors.push('Podaj, o której przyjdziesz do pracy.');
  if (r.kind === 'wyjscie' && (!r.time_from || !r.time_to)) errors.push('Podaj godzinę wyjścia i powrotu.');
  if (r.kind === 'odrobienie') {
    if (!r.time_from || !r.time_to) errors.push('Podaj, od której do której odrabiasz.');
    if (r.date_to !== r.date_from) errors.push('Odrobienie zgłaszasz osobno dla każdego dnia.');
  }
  if (r.kind === 'inne' && !r.note) errors.push('Opisz sprawę w uwadze.');
  if (r.wanted_code && !WANTED.includes(r.wanted_code)) errors.push('Nieznany rodzaj nieobecności.');
  if (r.note && r.note.length > 500) errors.push('Uwaga może mieć najwyżej 500 znaków.');
  if (errors.length) throw bad(errors.join(' '), { errors });
  return r;
}

function createRequest(db, user, body) {
  if (user.role !== 'employee' || !user.employee_id) throw forbidden('Zgłoszenia składa pracownik ze swojego konta.');
  const r = validate(body);
  const clientId = body.client_id ? String(body.client_id).slice(0, 64) : null;
  if (clientId) {
    const prev = db.get('SELECT id, status FROM requests WHERE user_id=? AND client_id=?', user.id, clientId);
    if (prev) return { id: prev.id, status: prev.status, duplicate: true };
  }
  return db.tx(() => {
    const now = T.nowIso();
    const res = db.run(`INSERT INTO requests(employee_id,user_id,client_id,kind,date_from,date_to,time_from,time_to,note,wanted_code,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'nowe',?,?)`, user.employee_id, user.id, clientId, r.kind, r.date_from, r.date_to, r.time_from, r.time_to, r.note, r.wanted_code, now, now);
    const id = Number(res.lastInsertRowid);
    audit(db, user, 'request', id, 'zgloszenie', null, { ...r, employee_id: user.employee_id }, 'zgłoszenie pracownika do weryfikacji');
    return { id, status: 'nowe' };
  });
}

function listRequests(db, { employeeId, status, limit = 300 } = {}) {
  const w = ['1=1'], p = [];
  if (employeeId) { w.push('r.employee_id=?'); p.push(employeeId); }
  if (status) { w.push('r.status=?'); p.push(status); }
  return db.all(`SELECT r.*, u.display_name AS decided_by_name FROM requests r LEFT JOIN users u ON u.id=r.decided_by
    WHERE ${w.join(' AND ')} ORDER BY CASE r.status WHEN 'nowe' THEN 0 ELSE 1 END, r.created_at DESC LIMIT ?`, ...p, limit);
}

function withdrawRequest(db, user, id) {
  const r = db.get('SELECT * FROM requests WHERE id=?', id);
  if (!r || r.user_id !== user.id) throw notFound('Nie znaleziono zgłoszenia.');
  if (r.status !== 'nowe') throw conflict('Można wycofać tylko zgłoszenie, które nie zostało jeszcze rozpatrzone.');
  db.tx(() => {
    db.run(`UPDATE requests SET status='wycofane', updated_at=? WHERE id=?`, T.nowIso(), id);
    audit(db, user, 'request', id, 'wycofanie', { status: 'nowe' }, { status: 'wycofane' }, 'wycofane przez pracownika');
  });
  return { id, status: 'wycofane' };
}

// Odrobienie: minuty przypisywane kolejno do najstarszych nierozliczonych wyjść z tego samego miesiąca.
function autoAllocations(db, employeeId, date, startTime, endTime) {
  const startAt = T.localToUtc(date, startTime);
  const endAt = T.localToUtc(endTime <= startTime ? T.addDays(date, 1) : date, endTime);
  let left = T.minutesBetween(startAt, endAt);
  const out = [];
  const exits = X.listExits(db, { employeeId, month: T.monthOf(date) })
    .filter(x => x.status === 'zarejestrowane' && x.start_at <= startAt)
    // wolne minuty = wyjście − wszystkie przypisania (także odrabiania oczekujące na zatwierdzenie)
    .map(x => ({ ...x, free: x.minutes - X.exitAllocated(db, x.id, { approvedOnly: false }) }))
    .filter(x => x.free > 0)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  for (const x of exits) {
    if (left <= 0) break;
    const m = Math.min(left, x.free);
    out.push({ exit_id: x.id, minutes: m });
    left -= m;
  }
  return out;
}

// r: { label, employee_id, kind, date_from, date_to, time_from, time_to }
// target: { type: 'exit'|'absence'|'makeup'|'none', category_id, unit, written_request, day_off_reason }
function buildLocalEntry(db, user, r, target) {
  const ref = r.label;
  if (target.type === 'none') return null;
  const firstShift = () => {
    const sh = db.get('SELECT * FROM schedule_entries WHERE employee_id=? AND work_date=? ORDER BY start_at LIMIT 1', r.employee_id, r.date_from);
    if (!sh) throw conflict(`Brak zmiany w grafiku pracownika w dniu ${r.date_from}.`);
    return sh;
  };
  if (target.type === 'exit') {
    let start = r.time_from, end = r.time_to;
    if (r.kind === 'spoznienie') { start = T.utcToLocal(firstShift().start_at).time; end = r.time_to || r.time_from; }
    if (!start || !end) throw bad('Zgłoszenie nie zawiera godzin — wybierz inny sposób rozliczenia.');
    const endDate = end <= start ? T.addDays(r.date_from, 1) : r.date_from;
    const res = X.createExit(db, user, {
      employee_id: r.employee_id, start_date: r.date_from, start_time: start, end_date: endDate, end_time: end,
      status: 'zarejestrowane', written_request: !!target.written_request, document_ref: ref,
    });
    return { ref: `exit:${res.id}`, warnings: res.warnings || [] };
  }
  if (target.type === 'makeup') {
    if (!r.time_from || !r.time_to) throw bad('Zgłoszenie odrobienia musi mieć godziny.');
    const allocations = autoAllocations(db, r.employee_id, r.date_from, r.time_from, r.time_to);
    if (!allocations.length) throw conflict('Pracownik nie ma w tym miesiącu nierozliczonego wyjścia sprzed tego odrobienia — nie ma czego odrabiać.');
    const res = X.createMakeup(db, user, {
      employee_id: r.employee_id, start_date: r.date_from, start_time: r.time_from,
      end_date: r.time_to <= r.time_from ? T.addDays(r.date_from, 1) : r.date_from, end_time: r.time_to,
      allocations, day_off_override_reason: target.day_off_reason || undefined, note: ref, approve: true,
    });
    return { ref: `makeup:${res.id}`, warnings: res.warnings || [] };
  }
  if (target.type === 'absence') {
    const cat = db.get('SELECT * FROM absence_categories WHERE id=?', reqInt(target.category_id, 'Kategoria'));
    if (!cat) throw bad('Nieznana kategoria.');
    const hourly = cat.unit === 'godziny' || cat.unit === 'minuty' || (cat.unit === 'dni_lub_godziny' && (target.unit || (r.time_from ? 'godziny' : 'dni')) === 'godziny');
    let startTime = r.time_from, endTime = r.time_to;
    if (hourly && r.kind === 'spoznienie') { startTime = T.utcToLocal(firstShift().start_at).time; endTime = r.time_to || r.time_from; }
    if (hourly && (!startTime || !endTime)) throw bad('Ta kategoria rozlicza godziny, a zgłoszenie nie ma godzin.');
    const endDate = hourly && endTime <= startTime ? T.addDays(r.date_from, 1) : r.date_to;
    const res = Abs.createAbsence(db, user, {
      employee_id: r.employee_id, category_id: cat.id, status: r.date_to <= T.today() ? 'wykorzystana' : 'planowana',
      unit: cat.unit === 'dni_lub_godziny' ? (hourly ? 'godziny' : 'dni') : undefined,
      start_date: r.date_from, end_date: endDate, start_time: hourly ? startTime : undefined, end_time: hourly ? endTime : undefined,
      employee_request: true, document_ref: ref,
    });
    return { ref: `absence:${res.id}`, warnings: res.warnings || [] };
  }
  throw bad('Nieznany sposób rozliczenia zgłoszenia.');
}

const TARGETS = ['exit', 'absence', 'makeup', 'none'];

function decideRequest(db, user, id, body) {
  const r = db.get('SELECT * FROM requests WHERE id=?', id);
  if (!r) throw notFound('Nie znaleziono zgłoszenia.');
  if (r.status !== 'nowe') throw conflict('Zgłoszenie zostało już rozpatrzone lub wycofane.');
  const decision = oneOf(body.decision, 'Decyzja', ['przyjete', 'odrzucone']);
  const note = body.note ? String(body.note).trim().slice(0, 500) : null;
  if (decision === 'odrzucone' && !note) throw bad('Odrzucenie wymaga krótkiego wyjaśnienia dla pracownika.');
  const target = decision === 'przyjete' ? (body.target || { type: 'none' }) : { type: 'none' };
  oneOf(target.type, 'Sposób rozliczenia', TARGETS);
  const label = `zgłoszenie pracownika #${r.id} z ${T.utcToLocal(r.created_at).date}`;
  return db.tx(() => {
    const result = buildLocalEntry(db, user, { ...r, label }, target);
    db.run(`UPDATE requests SET status=?, decision_note=?, decided_by=?, decided_at=?, result_ref=?, updated_at=? WHERE id=?`,
      decision, note, user.id, T.nowIso(), result ? result.ref : null, T.nowIso(), id);
    audit(db, user, 'request', id, decision === 'przyjete' ? 'przyjecie' : 'odrzucenie', { status: 'nowe' },
      { status: decision, target, result_ref: result ? result.ref : null }, note || (decision === 'przyjete' ? 'przyjęte przez kierownika' : null));
    return { id, status: decision, result_ref: result ? result.ref : null, warnings: result ? result.warnings : [] };
  });
}

module.exports = { WANTED, KINDS, validate, createRequest, listRequests, withdrawRequest, decideRequest, buildLocalEntry, autoAllocations };
