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
  };
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
              competences=?, machine_ids=?, initial_settlement_note=?, hr_reference=? WHERE id=?`,
      data.first_name, data.last_name, data.color, data.active, data.employment_start, data.employment_end,
      data.competences, data.machine_ids, data.initial_settlement_note, data.hr_reference, id);
      audit(db, user, 'employee', id, 'edycja', old, data, body.reason);
      return id;
    }
    const r = db.run(`INSERT INTO employees(first_name,last_name,color,active,employment_start,employment_end,competences,
            machine_ids,initial_settlement_note,hr_reference,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    data.first_name, data.last_name, data.color, data.active, data.employment_start, data.employment_end,
    data.competences, data.machine_ids, data.initial_settlement_note, data.hr_reference, T.nowIso());
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

function addScheduleEntry(db, user, body, { allowHoliday = false } = {}) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  const emp = C.employeeOrThrow(db, employeeId);
  const workDate = reqStr(body.work_date, 'Data');
  let startTime = body.start_time, endTime = body.end_time, breakMin = body.break_min ?? 0;
  let tplId = body.shift_template_id ? reqInt(body.shift_template_id, 'Szablon zmiany') : null;
  if (tplId) {
    const tpl = db.get('SELECT * FROM shift_templates WHERE id=?', tplId);
    if (!tpl) throw bad('Nieznany szablon zmiany.');
    startTime = startTime || tpl.start_time; endTime = endTime || tpl.end_time;
    breakMin = body.break_min ?? tpl.break_min;
  }
  breakMin = reqInt(breakMin, 'Przerwa', { min: 0, max: 240 });
  const sh = buildShift(workDate, startTime, endTime, breakMin);
  C.assertMonthOpen(db, T.monthOf(workDate));
  if (workDate < emp.employment_start || (emp.employment_end && workDate > emp.employment_end)) {
    throw conflict('Data poza okresem zatrudnienia.');
  }
  const hol = db.get('SELECT * FROM holidays WHERE date=?', workDate);
  if (hol && !allowHoliday && !body.confirm_holiday) {
    throw conflict(`${workDate} to dzień wolny (${hol.name}). Potwierdź świadomie zaplanowanie pracy.`, { code: 'holiday' });
  }
  const clash = C.scheduleIn(db, employeeId, sh.start_at, sh.end_at);
  if (clash.length) throw conflict('Zmiana nakłada się na inną zmianę w grafiku tego pracownika.', { ids: clash.map(c => c.id) });
  return db.tx(() => {
    const r = db.run(`INSERT INTO schedule_entries(employee_id,work_date,start_at,end_at,break_min,planned_min,shift_template_id,note,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, employeeId, workDate, sh.start_at, sh.end_at, breakMin, sh.planned_min, tplId, body.note || null, T.nowIso());
    const id = Number(r.lastInsertRowid);
    audit(db, user, 'schedule', id, 'utworzenie', null, { employee_id: employeeId, work_date: workDate, ...sh, break_min: breakMin });
    return id;
  });
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
  const used = db.get(`SELECT COUNT(*) n FROM private_exits WHERE employee_id=? AND status!='anulowane' AND start_at < ? AND end_at > ?`, s.employee_id, s.end_at, s.start_at).n;
  if (used) throw conflict('Na tej zmianie zarejestrowano wyjście prywatne — najpierw je anuluj lub skoryguj.');
  db.tx(() => {
    db.run('DELETE FROM schedule_entries WHERE id=?', id);
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
    role: oneOf(body.role, 'Rola', ['admin', 'supervisor', 'employee']),
    employee_id: body.employee_id ? reqInt(body.employee_id, 'Pracownik') : null,
    can_view_confidential: body.can_view_confidential ? 1 : 0, active: body.active === false ? 0 : 1,
  };
  if (d.role === 'employee' && !d.employee_id) throw bad('Konto pracownika musi być powiązane z profilem pracownika.');
  if (d.role !== 'supervisor') d.can_view_confidential = d.role === 'admin' ? 1 : 0;
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
        if (String(body.password).length < 8) throw bad('Hasło musi mieć co najmniej 8 znaków.');
        db.run('UPDATE users SET password_hash=? WHERE id=?', hashPassword(String(body.password)), id);
        db.run('DELETE FROM sessions WHERE user_id=?', id);
      }
      audit(db, user, 'user', id, 'edycja', old, { ...d, password_changed: !!body.password });
      return id;
    }
    if (!body.password || String(body.password).length < 8) throw bad('Hasło musi mieć co najmniej 8 znaków.');
    if (db.get('SELECT 1 FROM users WHERE login=?', d.login)) throw conflict('Login jest zajęty.');
    const r = db.run(`INSERT INTO users(login,display_name,password_hash,role,employee_id,can_view_confidential,active,created_at)
      VALUES (?,?,?,?,?,?,?,?)`, d.login, d.display_name, hashPassword(String(body.password)), d.role, d.employee_id, d.can_view_confidential, d.active, T.nowIso());
    audit(db, user, 'user', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

module.exports = {
  listEmployees, saveEmployee, approveInitialSettlement, addTerms, saveShiftTemplate, buildShift, addScheduleEntry,
  generateSchedule, deleteScheduleEntry, listSchedule, addAttendance, ensureHolidays, polishHolidays, saveHoliday, saveUser, easter,
};
