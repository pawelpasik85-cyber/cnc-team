'use strict';
// Pracownicy, warunki zatrudnienia, szablony zmian, grafik, święta, ewidencja obecności, konta.
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, reqInt, oneOf, hashPassword } = require('../core');
const C = require('./common');

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function listEmployees(db) {
  return db.all('SELECT * FROM employees ORDER BY last_name, first_name').map(e => ({
    ...e, competences: JSON.parse(e.competences), machine_ids: JSON.parse(e.machine_ids),
    terms: db.all('SELECT * FROM employment_terms WHERE employee_id = ? ORDER BY valid_from', e.id),
    current_terms: C.termsAt(db, e.id, T.today()),
  }));
}

function saveEmployee(db, user, body, id) {
  const data = {
    first_name: reqStr(body.first_name, 'Imię', { max: 80 }),
    last_name: reqStr(body.last_name, 'Nazwisko', { max: 80 }),
    color: reqStr(body.color, 'Kolor', { max: 7 }),
    active: body.active === false || body.active === 0 ? 0 : 1,
    employment_start: reqStr(body.employment_start, 'Początek zatrudnienia'),
    employment_end: reqStr(body.employment_end, 'Koniec zatrudnienia', { optional: true }),
    competences: JSON.stringify(Array.isArray(body.competences) ? body.competences.map(String) : []),
    machine_ids: JSON.stringify(Array.isArray(body.machine_ids) ? body.machine_ids.map(String) : []),
    initial_settlement_note: reqStr(body.initial_settlement_note, 'Dane początkowe', { optional: true }),
    hr_reference: reqStr(body.hr_reference, 'Referencja kadrowa', { optional: true }),
    email: reqStr(body.email, 'E-mail (aplikacja pracownika)', { optional: true, max: 120 }),
  };
  if (data.email) {
    data.email = data.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw bad('Niepoprawny adres e-mail.');
  }
  if (!COLOR_RE.test(data.color)) throw bad('Kolor musi mieć postać #RRGGBB.');
  T.assertDate(data.employment_start);
  if (data.employment_end) T.assertDate(data.employment_end);
  for (const m of JSON.parse(data.machine_ids)) {
    if (!db.get('SELECT 1 FROM machines WHERE id = ?', m)) throw bad(`Nieznana maszyna: ${m}`);
  }
  return db.tx(() => {
    if (id) {
      const old = C.employeeOrThrow(db, id);
      db.run(`UPDATE employees SET first_name=?, last_name=?, color=?, active=?, employment_start=?, employment_end=?,
              competences=?, machine_ids=?, initial_settlement_note=?, hr_reference=?, email=? WHERE id=?`,
      data.first_name, data.last_name, data.color, data.active, data.employment_start, data.employment_end,
      data.competences, data.machine_ids, data.initial_settlement_note, data.hr_reference, data.email, id);
      audit(db, user, 'employee', id, 'edycja', old, data, body.reason);
      return id;
    }
    const r = db.run(`INSERT INTO employees(first_name,last_name,color,active,employment_start,employment_end,competences,
            machine_ids,initial_settlement_note,hr_reference,email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    data.first_name, data.last_name, data.color, data.active, data.employment_start, data.employment_end,
    data.competences, data.machine_ids, data.initial_settlement_note, data.hr_reference, data.email, T.nowIso());
    const newId = Number(r.lastInsertRowid);
    audit(db, user, 'employee', newId, 'utworzenie', null, data);
    return newId;
  });
}

function approveInitialSettlement(db, user, id) {
  const old = C.employeeOrThrow(db, id);
  db.run('UPDATE employees SET initial_settlement_approved_at=?, initial_settlement_approved_by=? WHERE id=?', T.nowIso(), user.id, id);
  audit(db, user, 'employee', id, 'zatwierdzenie_danych_poczatkowych', { approved_at: old.initial_settlement_approved_at }, { approved_by: user.id });
}

function addTerms(db, user, employeeId, body) {
  C.employeeOrThrow(db, employeeId);
  const d = {
    valid_from: reqStr(body.valid_from, 'Obowiązuje od'),
    fte_num: reqInt(body.fte_num, 'Etat — licznik', { min: 1, max: 100 }),
    fte_den: reqInt(body.fte_den, 'Etat — mianownik', { min: 1, max: 100 }),
    daily_norm_min: reqInt(body.daily_norm_min, 'Norma dobowa (min)', { min: 1, max: 1440 }),
    weekly_norm_min: reqInt(body.weekly_norm_min, 'Norma tygodniowa (min)', { min: 1, max: 10080 }),
    leave_day_min: reqInt(body.leave_day_min, 'Przelicznik dnia urlopu (min)', { min: 1, max: 1440 }),
    note: reqStr(body.note, 'Uwagi', { optional: true }),
  };
  T.assertDate(d.valid_from);
  if (d.fte_num > d.fte_den) throw bad('Wymiar etatu nie może przekraczać 1.');
  if (db.get('SELECT 1 FROM employment_terms WHERE employee_id=? AND valid_from=?', employeeId, d.valid_from)) {
    throw conflict('Istnieją już warunki zatrudnienia od tej daty.');
  }
  return db.tx(() => {
    const r = db.run(`INSERT INTO employment_terms(employee_id,valid_from,fte_num,fte_den,daily_norm_min,weekly_norm_min,leave_day_min,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, employeeId, d.valid_from, d.fte_num, d.fte_den, d.daily_norm_min, d.weekly_norm_min, d.leave_day_min, d.note, T.nowIso());
    audit(db, user, 'employment_terms', Number(r.lastInsertRowid), 'utworzenie', null, { employee_id: employeeId, ...d }, body.reason);
    return Number(r.lastInsertRowid);
  });
}

// ---- Szablony zmian ----
function saveShiftTemplate(db, user, body, id) {
  const d = {
    name: reqStr(body.name, 'Nazwa', { max: 60 }), short: reqStr(body.short, 'Skrót', { max: 6 }),
    start_time: reqStr(body.start_time, 'Początek'), end_time: reqStr(body.end_time, 'Koniec'),
    break_min: reqInt(body.break_min ?? 0, 'Przerwa niewliczana (min)', { min: 0, max: 240 }),
    active: body.active === false ? 0 : 1,
  };
  T.assertTime(d.start_time); T.assertTime(d.end_time);
  return db.tx(() => {
    if (id) {
      const old = db.get('SELECT * FROM shift_templates WHERE id=?', id);
      if (!old) throw notFound();
      db.run('UPDATE shift_templates SET name=?,short=?,start_time=?,end_time=?,break_min=?,active=? WHERE id=?',
        d.name, d.short, d.start_time, d.end_time, d.break_min, d.active, id);
      audit(db, user, 'shift_template', id, 'edycja', old, d);
      return id;
    }
    const r = db.run('INSERT INTO shift_templates(name,short,start_time,end_time,break_min,active) VALUES (?,?,?,?,?,?)',
      d.name, d.short, d.start_time, d.end_time, d.break_min, d.active);
    audit(db, user, 'shift_template', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

// ---- Grafik ----
// Zmiana przechodząca przez północ: koniec ≤ początek → koniec następnego dnia.
// Zmiana należy do dnia i miesiąca ROZPOCZĘCIA (ustawienie night_shift_month_rule).
function buildShift(workDate, startTime, endTime, breakMin) {
  T.assertDate(workDate); T.assertTime(startTime); T.assertTime(endTime);
  const endDate = endTime <= startTime ? T.addDays(workDate, 1) : workDate;
  const start_at = T.localToUtc(workDate, startTime);
  const end_at = T.localToUtc(endDate, endTime);
  const gross = T.minutesBetween(start_at, end_at);
  if (gross <= 0 || gross > 16 * 60) throw bad('Niepoprawny czas trwania zmiany.');
  if (breakMin >= gross) throw bad('Przerwa dłuższa niż zmiana.');
  return { start_at, end_at, planned_min: gross - breakMin };
}

const SHIFT_MODES = ['standardowa', 'wydluzona', 'nieregularna', 'dodatkowa'];
const MODE_LABEL = { standardowa: 'standardowa', wydluzona: 'wydłużona', nieregularna: 'nieregularna', dodatkowa: 'dzień dodatkowy / nadgodziny' };

// Nadgodziny liczone na dobę pracownika (nie na pojedynczą zmianę): dzień dodatkowy — cała zmiana;
// pozostałe zmiany tego dnia — wszystko ponad normę dobową z warunków zatrudnienia, niezależnie od etykiety trybu.
function dailyNorm(db, employeeId, workDate) {
  const terms = C.termsAt(db, employeeId, workDate);
  return terms && terms.daily_norm_min ? terms.daily_norm_min : 480;
}
function recomputeDayOvertime(db, employeeId, workDate) {
  const norm = dailyNorm(db, employeeId, workDate);
  let used = 0;
  for (const r of db.all('SELECT id, mode, planned_min, overtime_min FROM schedule_entries WHERE employee_id=? AND work_date=? ORDER BY start_at', employeeId, workDate)) {
    let ot;
    if (r.mode === 'dodatkowa') ot = r.planned_min;
    else { const within = Math.max(0, Math.min(r.planned_min, norm - used)); used += r.planned_min; ot = r.planned_min - within; }
    if (ot !== r.overtime_min) db.run('UPDATE schedule_entries SET overtime_min=? WHERE id=?', ot, r.id);
  }
}
function dayOvertime(db, employeeId, workDate) {
  return db.get('SELECT COALESCE(SUM(overtime_min),0) m FROM schedule_entries WHERE employee_id=? AND work_date=?', employeeId, workDate).m;
}

// Odpoczynek dobowy (11 h, art. 132 KP) między sąsiednimi zmianami tego pracownika z innych dni
// (zmiany tego samego dnia — dzień dzielony / dzień dodatkowy po zmianie — liczą się jako jedna doba pracy)
function restGaps(db, employeeId, startAt, endAt, excludeId = 0, workDate = '') {
  const minRest = C.getSettingInt(db, 'min_daily_rest_min', 660);
  const prev = db.get('SELECT end_at, work_date FROM schedule_entries WHERE employee_id=? AND id != ? AND work_date != ? AND end_at <= ? ORDER BY end_at DESC LIMIT 1', employeeId, excludeId, workDate, startAt);
  const next = db.get('SELECT start_at, work_date FROM schedule_entries WHERE employee_id=? AND id != ? AND work_date != ? AND start_at >= ? ORDER BY start_at LIMIT 1', employeeId, excludeId, workDate, endAt);
  const out = [];
  if (prev) { const g = T.minutesBetween(prev.end_at, startAt); if (g < minRest) out.push(`odpoczynek po zmianie z ${prev.work_date}: ${T.fmtHM(g)} (wymagane ${T.fmtHM(minRest)})`); }
  if (next) { const g = T.minutesBetween(endAt, next.start_at); if (g < minRest) out.push(`odpoczynek przed zmianą z ${next.work_date}: ${T.fmtHM(g)} (wymagane ${T.fmtHM(minRest)})`); }
  return out;
}

// Ostrzeżenie o rocznym limicie — liczone po zapisie, z faktycznego stanu grafiku
function overtimeYearWarning(db, employeeId, year) {
  const limit = C.getSettingInt(db, 'overtime_year_limit_min', 9000);
  const total = db.get(`SELECT COALESCE(SUM(overtime_min),0) s FROM schedule_entries WHERE employee_id=? AND substr(work_date,1,4)=?`, employeeId, String(year)).s;
  if (total <= limit) return null;
  const e = db.get('SELECT first_name, last_name FROM employees WHERE id=?', employeeId);
  return `Nadgodziny w roku ${year}${e ? ` (${e.first_name} ${e.last_name})` : ''}: ${T.fmtHM(total)} — powyżej limitu ${T.fmtHM(limit)} (do potwierdzenia przez kadry).`;
}

// Szablon nadaje godziny tylko wtedy, gdy został wybrany w żądaniu; bez pola szablonu zostają dotychczasowe godziny zmiany.
function resolveShiftTimes(db, body, base = {}) {
  let startTime = body.start_time || null, endTime = body.end_time || null;
  let breakMin = body.break_min ?? null;
  const given = body.shift_template_id !== undefined && body.shift_template_id !== null && body.shift_template_id !== '';
  const tplId = given ? reqInt(body.shift_template_id, 'Szablon zmiany') : (body.shift_template_id === undefined ? base.shift_template_id ?? null : null);
  if (given) {
    const tpl = db.get('SELECT * FROM shift_templates WHERE id=?', tplId);
    if (!tpl) throw bad('Nieznany szablon zmiany.');
    startTime = startTime || tpl.start_time; endTime = endTime || tpl.end_time;
    breakMin = breakMin ?? tpl.break_min;
  }
  startTime = startTime || (base.start_at ? T.utcToLocal(base.start_at).time : null);
  endTime = endTime || (base.end_at ? T.utcToLocal(base.end_at).time : null);
  breakMin = reqInt(breakMin ?? base.break_min ?? 0, 'Przerwa', { min: 0, max: 240 });
  if (!startTime || !endTime) throw bad('Podaj godziny zmiany albo wybierz szablon.');
  return { startTime, endTime, breakMin, tplId };
}

// Wspólne kontrole: zatrudnienie, święto/niedziela, nakładanie, odpoczynek; zwraca ostrzeżenia
function checkShift(db, emp, workDate, sh, body, excludeId = 0) {
  C.assertMonthOpen(db, T.monthOf(workDate));
  if (workDate < emp.employment_start || (emp.employment_end && workDate > emp.employment_end)) throw conflict('Data poza okresem zatrudnienia.');
  const hol = db.get('SELECT * FROM holidays WHERE date=?', workDate);
  const sunday = T.weekday(workDate) === 7;
  if ((hol || sunday) && !body.confirm_holiday) {
    throw conflict(`${workDate} to ${hol ? `dzień wolny (${hol.name})` : 'niedziela'}. Potwierdź świadomie zaplanowanie pracy.`, { code: 'holiday' });
  }
  const clash = C.scheduleIn(db, emp.id, sh.start_at, sh.end_at).filter(c => c.id !== excludeId);
  if (clash.length) throw conflict('Zmiana nakłada się na inną zmianę w grafiku tego pracownika.', { ids: clash.map(c => c.id) });
  const rest = restGaps(db, emp.id, sh.start_at, sh.end_at, excludeId, workDate);
  if (rest.length && !body.confirm_rest) throw conflict(`Naruszenie odpoczynku dobowego: ${rest.join('; ')}. Zaznacz świadome potwierdzenie (np. akcja ratownicza, art. 132 § 2 KP — do potwierdzenia przez kadry).`, { code: 'rest' });
  const warnings = [];
  // zmiana nocna przechodząca w niedzielę / święto: godziny w dniu wolnym — ostrzeżenie do rozliczenia
  const endLocal = T.utcToLocal(sh.end_at);
  if (endLocal.date > workDate && endLocal.time !== '00:00') {
    const h2 = db.get('SELECT * FROM holidays WHERE date=?', endLocal.date);
    if (h2 || T.weekday(endLocal.date) === 7) warnings.push(`Zmiana z ${workDate} trwa do ${endLocal.time} w ${h2 ? `dniu wolnym (${h2.name})` : 'niedzielę'} ${endLocal.date} — godziny w dniu wolnym do rozliczenia przez kadry.`);
  }
  if (rest.length) warnings.push(`Świadomie skrócony odpoczynek: ${rest.join('; ')}.`);
  if (sh.planned_min > 12 * 60) warnings.push(`Zmiana dłuższa niż 12 h (${T.fmtHM(sh.planned_min)}).`);
  return warnings;
}

function addScheduleEntry(db, user, body, { allowHoliday = false, withWarnings = false } = {}) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  const emp = C.employeeOrThrow(db, employeeId);
  const workDate = reqStr(body.work_date, 'Data');
  const mode = oneOf(body.mode || 'standardowa', 'Tryb pracy', SHIFT_MODES);
  const reason = reqStr(body.reason, 'Powód', { optional: true, max: 300 });
  if (mode !== 'standardowa' && !reason) throw bad('Dzień dodatkowy i zmiana trybu pracy wymagają powodu (np. braki kadrowe, termin projektu).');
  const t = resolveShiftTimes(db, body);
  const sh = buildShift(workDate, t.startTime, t.endTime, t.breakMin);
  const warnings = checkShift(db, emp, workDate, sh, allowHoliday ? { ...body, confirm_holiday: true } : body);
  const id = db.tx(() => {
    const before = dayOvertime(db, employeeId, workDate);
    const r = db.run(`INSERT INTO schedule_entries(employee_id,work_date,start_at,end_at,break_min,planned_min,shift_template_id,note,mode,overtime_min,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`, employeeId, workDate, sh.start_at, sh.end_at, t.breakMin, sh.planned_min, t.tplId, body.note || null, mode, reason, T.nowIso());
    const nid = Number(r.lastInsertRowid);
    recomputeDayOvertime(db, employeeId, workDate);
    audit(db, user, 'schedule', nid, 'utworzenie', null, { employee_id: employeeId, work_date: workDate, ...sh, break_min: t.breakMin, mode, nadgodziny_dnia_min: dayOvertime(db, employeeId, workDate), nadgodziny_dnia_przed_min: before }, reason);
    return nid;
  });
  if (dayOvertime(db, employeeId, workDate)) { const ow = overtimeYearWarning(db, employeeId, workDate.slice(0, 4)); if (ow) warnings.push(ow); }
  return withWarnings ? { id, warnings } : id;
}

function exitsOnShift(db, s) {
  return db.get(`SELECT COUNT(*) n FROM private_exits WHERE employee_id=? AND status!='anulowane' AND start_at < ? AND end_at > ?`, s.employee_id, s.end_at, s.start_at).n;
}

// Zmiana godzin / trybu / przeniesienie na inną osobę lub dzień — zawsze z powodem
function updateScheduleEntry(db, user, id, body) {
  const old = db.get('SELECT * FROM schedule_entries WHERE id=?', id);
  if (!old) throw notFound();
  C.assertMonthOpen(db, T.monthOf(old.work_date));
  const reason = reqStr(body.reason, 'Powód zmiany', { max: 300 });
  const employeeId = body.employee_id ? reqInt(body.employee_id, 'Pracownik') : old.employee_id;
  const emp = C.employeeOrThrow(db, employeeId);
  const workDate = body.work_date ? reqStr(body.work_date, 'Data') : old.work_date;
  const mode = oneOf(body.mode || old.mode, 'Tryb pracy', SHIFT_MODES);
  const t = resolveShiftTimes(db, body, old);
  const sh = buildShift(workDate, t.startTime, t.endTime, t.breakMin);
  const timesChanged = sh.start_at !== old.start_at || sh.end_at !== old.end_at || employeeId !== old.employee_id;
  if (timesChanged && exitsOnShift(db, old)) throw conflict('Na tej zmianie zarejestrowano wyjście prywatne — najpierw je anuluj lub skoryguj.');
  const warnings = checkShift(db, emp, workDate, sh, body, id);
  // powód trybu (widoczny w grafiku) zmienia się tylko przy zmianie trybu; powód każdej zmiany trafia do historii
  const modeReason = mode !== old.mode || !old.reason ? reason : old.reason;
  db.tx(() => {
    db.run(`UPDATE schedule_entries SET employee_id=?, work_date=?, start_at=?, end_at=?, break_min=?, planned_min=?, shift_template_id=?, mode=?, reason=?, updated_at=? WHERE id=?`,
      employeeId, workDate, sh.start_at, sh.end_at, t.breakMin, sh.planned_min, t.tplId, mode, modeReason, T.nowIso(), id);
    recomputeDayOvertime(db, old.employee_id, old.work_date);
    recomputeDayOvertime(db, employeeId, workDate);
    const now = db.get('SELECT * FROM schedule_entries WHERE id=?', id);
    const pick = (x) => ({ employee_id: x.employee_id, work_date: x.work_date, start_at: x.start_at, end_at: x.end_at, break_min: x.break_min, planned_min: x.planned_min, shift_template_id: x.shift_template_id, mode: x.mode, overtime_min: x.overtime_min });
    audit(db, user, 'schedule', id, employeeId !== old.employee_id ? 'zmiana_osoby' : 'zmiana_trybu', pick(old), pick(now), reason);
  });
  if (dayOvertime(db, employeeId, workDate)) { const ow = overtimeYearWarning(db, employeeId, workDate.slice(0, 4)); if (ow) warnings.push(ow); }
  return { id, warnings };
}

// Zamiana osób między dwiema zmianami (np. Jan bierze nocną Ewy, Ewa — poranną Jana)
function swapShifts(db, user, body) {
  const a = db.get('SELECT * FROM schedule_entries WHERE id=?', reqInt(body.a_id, 'Zmiana 1'));
  const b = db.get('SELECT * FROM schedule_entries WHERE id=?', reqInt(body.b_id, 'Zmiana 2'));
  if (!a || !b) throw notFound('Nie znaleziono zmiany.');
  if (a.employee_id === b.employee_id) throw bad('Wybierz zmiany dwóch różnych osób.');
  const reason = reqStr(body.reason, 'Powód zamiany', { max: 300 });
  for (const s of [a, b]) { C.assertMonthOpen(db, T.monthOf(s.work_date)); if (exitsOnShift(db, s)) throw conflict(`Na zmianie z ${s.work_date} zarejestrowano wyjście prywatne — najpierw je skoryguj.`); }
  const warnings = [];
  return db.tx(() => {
    // tymczasowo zwalniamy obie zmiany, żeby sprawdzić nakładanie po zamianie
    db.run('UPDATE schedule_entries SET employee_id=? WHERE id=?', b.employee_id, a.id);
    db.run('UPDATE schedule_entries SET employee_id=? WHERE id=?', a.employee_id, b.id);
    for (const [s, emp] of [[a, b.employee_id], [b, a.employee_id]]) {
      const e = C.employeeOrThrow(db, emp);
      warnings.push(...checkShift(db, e, s.work_date, s, body, s.id));
      db.run('UPDATE schedule_entries SET updated_at=? WHERE id=?', T.nowIso(), s.id);
    }
    for (const s of [a, b]) { recomputeDayOvertime(db, a.employee_id, s.work_date); recomputeDayOvertime(db, b.employee_id, s.work_date); }
    // osobny wpis historii dla każdej zmiany, żeby był widoczny w historii tej zmiany
    for (const [s, other] of [[a, b], [b, a]]) {
      const now = db.get('SELECT employee_id, overtime_min FROM schedule_entries WHERE id=?', s.id);
      audit(db, user, 'schedule', s.id, 'zamiana_zmian', { employee_id: s.employee_id, overtime_min: s.overtime_min }, { employee_id: now.employee_id, overtime_min: now.overtime_min, zamiana_ze_zmiana: other.id }, reason);
    }
    for (const emp of [a.employee_id, b.employee_id]) for (const y of new Set([a.work_date.slice(0, 4), b.work_date.slice(0, 4)])) { const ow = overtimeYearWarning(db, emp, y); if (ow) warnings.push(ow); }
    return { swapped: [a.id, b.id], warnings: [...new Set(warnings)] };
  });
}

// Zmiana trybu pracy na okres (np. 8 h → 12 h z powodu braków kadrowych) dla istniejących zmian w grafiku
function bulkShiftMode(db, user, body) {
  const ids = (Array.isArray(body.employee_ids) ? body.employee_ids : [body.employee_id]).filter(Boolean).map(Number);
  if (!ids.length) throw bad('Wybierz pracownika.');
  const from = reqStr(body.from, 'Od'), to = reqStr(body.to, 'Do');
  T.assertDate(from); T.assertDate(to);
  if (to < from || T.dateRange(from, to).length > 93) throw bad('Zakres do 93 dni.');
  const reason = reqStr(body.reason, 'Powód', { max: 300 });
  const weekdays = Array.isArray(body.weekdays) && body.weekdays.length ? body.weekdays.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  const changed = [], skipped = [];
  for (const empId of ids) {
    for (const s of db.all('SELECT * FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY start_at', empId, from, to)) {
      if (!weekdays.includes(T.weekday(s.work_date))) continue;
      if (s.mode === 'dodatkowa') { skipped.push({ id: s.id, work_date: s.work_date, employee_id: empId, reason: 'dzień dodatkowy — zmień go pojedynczo w kalendarzu' }); continue; }
      try {
        const r = db.tx(() => updateScheduleEntry(db, user, s.id, { ...(body.shift_template_id ? { shift_template_id: body.shift_template_id } : {}), start_time: body.start_time, end_time: body.end_time, break_min: body.break_min, mode: body.mode, reason, confirm_holiday: body.confirm_holiday, confirm_rest: body.confirm_rest }));
        changed.push({ id: s.id, work_date: s.work_date, employee_id: empId, warnings: r.warnings });
      } catch (e) {
        if (e.status === 409 || e.status === 400) skipped.push({ id: s.id, work_date: s.work_date, employee_id: empId, reason: e.message }); else throw e;
      }
    }
  }
  return { changed: changed.length, skipped, warnings: [...new Set(changed.flatMap(c => c.warnings))] };
}

// Generowanie grafiku dla zakresu dat wg dni tygodnia (święta pomijane).
function generateSchedule(db, user, body) {
  const from = reqStr(body.from, 'Od'), to = reqStr(body.to, 'Do');
  T.assertDate(from); T.assertDate(to);
  if (to < from) throw bad('Zakres dat odwrotny.');
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays.map(Number) : [1, 2, 3, 4, 5];
  const created = [], skipped = [];
  db.tx(() => {
    for (const d of T.dateRange(from, to)) {
      if (!weekdays.includes(T.weekday(d))) continue;
      if (db.get('SELECT 1 FROM holidays WHERE date=?', d)) { skipped.push({ date: d, reason: 'święto/dzień wolny' }); continue; }
      try {
        created.push(addScheduleEntry(db, user, { ...body, work_date: d }));
      } catch (e) {
        if (e.status === 409) skipped.push({ date: d, reason: e.message }); else throw e;
      }
    }
  });
  return { created: created.length, skipped };
}

function deleteScheduleEntry(db, user, id, reason) {
  const s = db.get('SELECT * FROM schedule_entries WHERE id=?', id);
  if (!s) throw notFound();
  C.assertMonthOpen(db, T.monthOf(s.work_date));
  if (!reason) throw bad('Usunięcie zmiany z grafiku wymaga powodu.');
  const used = exitsOnShift(db, s);
  if (used) throw conflict('Na tej zmianie zarejestrowano wyjście prywatne — najpierw je anuluj lub skoryguj.');
  db.tx(() => {
    db.run('DELETE FROM schedule_entries WHERE id=?', id);
    recomputeDayOvertime(db, s.employee_id, s.work_date);
    audit(db, user, 'schedule', id, 'usunięcie', s, null, reason);
  });
}

function listSchedule(db, from, to, employeeId) {
  const rows = employeeId
    ? db.all('SELECT * FROM schedule_entries WHERE work_date BETWEEN ? AND ? AND employee_id=? ORDER BY start_at', from, to, employeeId)
    : db.all('SELECT * FROM schedule_entries WHERE work_date BETWEEN ? AND ? ORDER BY start_at', from, to);
  return rows.map(s => ({ ...s, start_local: T.utcToLocal(s.start_at), end_local: T.utcToLocal(s.end_at) }));
}

// ---- Ewidencja obecności / nadgodziny (wpis ręczny administratora) ----
function addAttendance(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  C.employeeOrThrow(db, employeeId);
  const kind = oneOf(body.kind, 'Rodzaj', ['obecnosc', 'nadgodziny']);
  const sd = reqStr(body.start_date, 'Data od'); const ed = reqStr(body.end_date || body.start_date, 'Data do');
  const start_at = T.localToUtc(sd, reqStr(body.start_time, 'Od godz.'));
  const end_at = T.localToUtc(ed, reqStr(body.end_time, 'Do godz.'));
  const minutes = T.minutesBetween(start_at, end_at);
  if (minutes <= 0) throw bad('Koniec musi być po początku.');
  C.assertMonthOpen(db, T.monthOf(sd));
  const dup = db.get(`SELECT id FROM attendance_records WHERE employee_id=? AND kind=? AND start_at < ? AND end_at > ?`, employeeId, kind, end_at, start_at);
  if (dup) throw conflict('Wpis nakłada się na istniejący wpis tego samego rodzaju.');
  return db.tx(() => {
    const r = db.run(`INSERT INTO attendance_records(employee_id,work_date,kind,start_at,end_at,minutes,note,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, employeeId, sd, kind, start_at, end_at, minutes, body.note || null, user.id, T.nowIso());
    audit(db, user, 'attendance', Number(r.lastInsertRowid), 'utworzenie', null, { employee_id: employeeId, kind, start_at, end_at, minutes });
    return Number(r.lastInsertRowid);
  });
}

// ---- Święta ----
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Dni ustawowo wolne (ustawa o dniach wolnych od pracy; Wigilia od 2025 r.) — lista do potwierdzenia przez kadry.
function polishHolidays(y) {
  const e = easter(y);
  const list = [
    [`${y}-01-01`, 'Nowy Rok'], [`${y}-01-06`, 'Święto Trzech Króli'], [e, 'Wielkanoc'],
    [T.addDays(e, 1), 'Poniedziałek Wielkanocny'], [`${y}-05-01`, 'Święto Pracy'], [`${y}-05-03`, 'Święto Konstytucji 3 Maja'],
    [T.addDays(e, 49), 'Zesłanie Ducha Świętego'], [T.addDays(e, 60), 'Boże Ciało'], [`${y}-08-15`, 'Wniebowzięcie NMP'],
    [`${y}-11-01`, 'Wszystkich Świętych'], [`${y}-11-11`, 'Narodowe Święto Niepodległości'],
    [`${y}-12-25`, 'Boże Narodzenie (1. dzień)'], [`${y}-12-26`, 'Boże Narodzenie (2. dzień)'],
  ];
  if (y >= 2025) list.push([`${y}-12-24`, 'Wigilia Bożego Narodzenia']);
  return list;
}
function ensureHolidays(db, year) {
  for (const [d, n] of polishHolidays(year)) db.run('INSERT OR IGNORE INTO holidays(date,name,kind) VALUES (?,?,?)', d, n, 'ustawowe');
}
function saveHoliday(db, user, body) {
  const date = reqStr(body.date, 'Data'); T.assertDate(date);
  const name = reqStr(body.name, 'Nazwa', { max: 100 });
  const kind = oneOf(body.kind || 'firmowe', 'Rodzaj', ['ustawowe', 'firmowe']);
  db.tx(() => {
    const old = db.get('SELECT * FROM holidays WHERE date=?', date);
    db.run('INSERT INTO holidays(date,name,kind) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET name=excluded.name, kind=excluded.kind', date, name, kind);
    audit(db, user, 'holiday', date, old ? 'edycja' : 'utworzenie', old, { date, name, kind });
  });
}

// ---- Konta ----
function saveUser(db, user, body, id) {
  const d = {
    login: reqStr(body.login, 'Login', { max: 40 }), display_name: reqStr(body.display_name, 'Nazwa', { max: 80 }),
    role: oneOf(body.role, 'Rola', ['admin', 'supervisor', 'employee', 'guest']),
    employee_id: body.employee_id ? reqInt(body.employee_id, 'Pracownik') : null,
    can_view_confidential: body.can_view_confidential ? 1 : 0, active: body.active === false ? 0 : 1,
  };
  if (d.role === 'employee' && !d.employee_id) throw bad('Konto pracownika musi być powiązane z profilem pracownika.');
  if (d.role !== 'supervisor') d.can_view_confidential = d.role === 'admin' ? 1 : 0;
  if (d.role === 'guest') d.employee_id = null;
  const guestProjects = d.role === 'guest' && Array.isArray(body.guest_project_ids) ? [...new Set(body.guest_project_ids.map(String))] : null;
  if (guestProjects) for (const pid of guestProjects) if (!db.get('SELECT 1 FROM projects WHERE id=?', pid)) throw bad(`Nieznany projekt ${pid}.`);
  const setGuestProjects = (uid) => {
    if (d.role !== 'guest') { db.run('DELETE FROM guest_projects WHERE user_id=?', uid); return; }
    if (!guestProjects) return;
    db.run('DELETE FROM guest_projects WHERE user_id=?', uid);
    for (const pid of guestProjects) db.run('INSERT INTO guest_projects(user_id, project_id) VALUES (?,?)', uid, pid);
  };
  return db.tx(() => {
    if (id) {
      const old = db.get('SELECT id,login,display_name,role,employee_id,can_view_confidential,active FROM users WHERE id=?', id);
      if (!old) throw notFound();
      if (old.role === 'admin' && (d.role !== 'admin' || !d.active)) {
        const admins = db.get(`SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1`).n;
        if (admins <= 1) throw conflict('Nie można odebrać roli ostatniemu aktywnemu administratorowi.');
      }
      db.run('UPDATE users SET login=?,display_name=?,role=?,employee_id=?,can_view_confidential=?,active=? WHERE id=?',
        d.login, d.display_name, d.role, d.employee_id, d.can_view_confidential, d.active, id);
      if (body.password) {
        if (String(body.password).length < 10) throw bad('Hasło musi mieć co najmniej 10 znaków.');
        db.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(String(body.password)), id);
        db.run('DELETE FROM sessions WHERE user_id=?', id);
      }
      const oldProjects = db.all('SELECT project_id FROM guest_projects WHERE user_id=? ORDER BY project_id', id).map(r => r.project_id);
      setGuestProjects(id);
      audit(db, user, 'user', id, 'edycja', { ...old, guest_projects: oldProjects },
        { ...d, password_changed: !!body.password, guest_projects: db.all('SELECT project_id FROM guest_projects WHERE user_id=? ORDER BY project_id', id).map(r => r.project_id) }, body.reason);
      return id;
    }
    if (!body.password || String(body.password).length < 10) throw bad('Hasło musi mieć co najmniej 10 znaków.');
    if (db.get('SELECT 1 FROM users WHERE login=?', d.login)) throw conflict('Login jest zajęty.');
    const r = db.run(`INSERT INTO users(login,display_name,password_hash,role,employee_id,can_view_confidential,active,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, d.login, d.display_name, hashPassword(String(body.password)), d.role, d.employee_id, d.can_view_confidential, d.active, T.nowIso());
    setGuestProjects(Number(r.lastInsertRowid));
    audit(db, user, 'user', Number(r.lastInsertRowid), 'utworzenie', null, { ...d, guest_projects: guestProjects || [] });
    return Number(r.lastInsertRowid);
  });
}

module.exports = {
  listEmployees, saveEmployee, approveInitialSettlement, addTerms, saveShiftTemplate, buildShift, addScheduleEntry,
  generateSchedule, deleteScheduleEntry, listSchedule, updateScheduleEntry, swapShifts, bulkShiftMode, SHIFT_MODES, MODE_LABEL, recomputeDayOvertime, dailyNorm, addAttendance, ensureHolidays, polishHolidays, saveHoliday, saveUser, easter,
};
