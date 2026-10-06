'use strict';
// Nieobecności, pule urlopu wypoczynkowego, roczny wybór jednostki (siła wyższa, art. 188).
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, reqInt, oneOf } = require('../core');
const C = require('./common');

// ---------- Katalog ----------
function saveCategory(db, user, body, id) {
  const d = {
    code: reqStr(body.code, 'Kod', { max: 40 }), name: reqStr(body.name, 'Nazwa', { max: 120 }),
    subtype: reqStr(body.subtype, 'Podtyp', { optional: true, max: 120 }),
    parent_code: reqStr(body.parent_code, 'Kategoria nadrzędna', { optional: true, max: 40 }),
    short: reqStr(body.short, 'Skrót', { max: 6 }), icon: reqStr(body.icon || 'absence', 'Ikona', { max: 30 }),
    unit: oneOf(body.unit, 'Jednostka', ['dni', 'godziny', 'dni_lub_godziny', 'minuty']),
    pool_kind: oneOf(body.pool_kind || null, 'Pula', ['wypoczynkowy', 'sila_wyzsza', 'opieka_188'], { optional: true }),
    limit_rule: reqStr(body.limit_rule, 'Zasada limitu', { optional: true }),
    limit_value: body.limit_value ? JSON.stringify(body.limit_value) : null,
    rule_valid_from: reqStr(body.rule_valid_from, 'Reguła od', { optional: true }),
    rule_valid_to: reqStr(body.rule_valid_to, 'Reguła do', { optional: true }),
    carryover_rule: reqStr(body.carryover_rule, 'Przenoszenie', { optional: true }),
    affects_schedule: reqStr(body.affects_schedule || 'zastepuje_grafik', 'Wpływ na grafik', { max: 60 }),
    creates_makeup_debt: body.creates_makeup_debt ? 1 : 0,
    requires_confirmation: reqStr(body.requires_confirmation, 'Wymagane potwierdzenie', { optional: true }),
    visibility: oneOf(body.visibility, 'Widoczność', ['pelna', 'podstawowa', 'poufna']),
    public_label: reqStr(body.public_label, 'Etykieta dla pracowników', { max: 60 }),
    legal_basis: reqStr(body.legal_basis, 'Podstawa prawna', { optional: true }),
    verified_at: reqStr(body.verified_at, 'Data weryfikacji', { optional: true }),
    verification_status: oneOf(body.verification_status || 'do_potwierdzenia_przez_kadry', 'Status weryfikacji',
      ['zweryfikowano', 'do_potwierdzenia_przez_kadry', 'regula_firmowa']),
    active: body.active === false ? 0 : 1, sort: reqInt(body.sort ?? 100, 'Kolejność'),
  };
  if (d.creates_makeup_debt) throw bad('Dług do odrobienia powstaje wyłącznie z wyjść prywatnych (osobny moduł).');
  const cols = Object.keys(d);
  return db.tx(() => {
    if (id) {
      const old = db.get('SELECT * FROM absence_categories WHERE id=?', id);
      if (!old) throw notFound();
      db.run(`UPDATE absence_categories SET ${cols.map(c => `${c}=?`).join(',')} WHERE id=?`, ...cols.map(c => d[c]), id);
      audit(db, user, 'absence_category', id, 'edycja', old, d, body.reason);
      return id;
    }
    if (db.get('SELECT 1 FROM absence_categories WHERE code=?', d.code)) throw conflict('Kod kategorii jest zajęty.');
    const r = db.run(`INSERT INTO absence_categories(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(c => d[c]));
    audit(db, user, 'absence_category', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

// ---------- Pule urlopu wypoczynkowego ----------
function poolBalance(db, poolId, { excludeAbsence } = {}) {
  const ledger = db.get('SELECT COALESCE(SUM(minutes),0) s FROM leave_ledger WHERE pool_id=?', poolId).s;
  const used = db.get(`SELECT COALESCE(SUM(minutes),0) s FROM absences WHERE pool_id=? AND status='wykorzystana' AND id != ?`, poolId, excludeAbsence || 0).s;
  const planned = db.get(`SELECT COALESCE(SUM(minutes),0) s FROM absences WHERE pool_id=? AND status='planowana' AND id != ?`, poolId, excludeAbsence || 0).s;
  return { granted_min: ledger, used_min: used, planned_min: planned, balance_min: ledger - used, available_min: ledger - used - planned };
}

function listPools(db, employeeId) {
  const today = T.today();
  const terms = C.termsAt(db, employeeId, today);
  return db.all('SELECT * FROM leave_pools WHERE employee_id=? ORDER BY acquisition_year', employeeId).map(p => {
    const b = poolBalance(db, p.id);
    return {
      ...p, ...b, day_conversion_min: terms ? terms.leave_day_min : null,
      ledger: db.all('SELECT * FROM leave_ledger WHERE pool_id=? ORDER BY id', p.id),
      overdue: overdueStatus(p.acquisition_year, b.balance_min, today),
    };
  });
}

// Zaległy urlop: przypomnienie do 30 września roku następnego po roku nabycia; po terminie ostrzeżenie.
// Saldo nigdy nie jest zerowane automatycznie.
function overdueStatus(acqYear, balanceMin, today) {
  if (balanceMin <= 0) return null;
  const y = Number(today.slice(0, 4));
  if (acqYear >= y) return null;
  const deadline = `${acqYear + 1}-09-30`;
  const pl = `30.09.${acqYear + 1}`;
  if (today <= deadline) return { level: 'przypomnienie', deadline, text: `Zaległy urlop z puli ${acqYear} należy udzielić do ${pl}.` };
  return {
    level: 'ostrzezenie', deadline,
    text: `Zaległy urlop z puli ${acqYear} nie został udzielony do ${pl}. Saldo i uprawnienie pozostają bez zmian — sprawę należy wyjaśnić z kadrami (upływ terminu nie jest podstawą utraty urlopu).`,
  };
}

function createPool(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  C.employeeOrThrow(db, employeeId);
  const year = reqInt(body.acquisition_year, 'Rok nabycia', { min: 2000, max: 2100 });
  const entitlement = reqInt(body.entitlement_min, 'Wymiar (min)', { min: 0, max: 100000 });
  const reason = reqStr(body.reason, 'Podstawa (dane kadr)');
  if (db.get('SELECT 1 FROM leave_pools WHERE employee_id=? AND acquisition_year=?', employeeId, year)) throw conflict('Pula dla tego roku już istnieje.');
  return db.tx(() => {
    const r = db.run('INSERT INTO leave_pools(employee_id,acquisition_year,note,created_at) VALUES (?,?,?,?)', employeeId, year, body.note || null, T.nowIso());
    const poolId = Number(r.lastInsertRowid);
    const kind = body.opening ? 'saldo_poczatkowe' : 'uprawnienie';
    db.run(`INSERT INTO leave_ledger(pool_id,kind,minutes,reason,hr_document_ref,balance_before_min,balance_after_min,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, poolId, kind, entitlement, reason, body.hr_document_ref || null, 0, entitlement, user.id, T.nowIso());
    audit(db, user, 'leave_pool', poolId, 'utworzenie', null, { employee_id: employeeId, year, kind, minutes: entitlement }, reason);
    return poolId;
  });
}

// Ręczna korekta / zmiana uprawnienia — osobne zdarzenie w historii z saldem przed i po.
function adjustPool(db, user, poolId, body) {
  const pool = db.get('SELECT * FROM leave_pools WHERE id=?', poolId);
  if (!pool) throw notFound('Nie znaleziono puli.');
  const kind = oneOf(body.kind || 'korekta_ewidencji', 'Rodzaj', ['korekta_ewidencji', 'zmiana_uprawnienia']);
  const delta = reqInt(body.minutes, 'Zmiana (min)', { min: -100000, max: 100000 });
  if (delta === 0) throw bad('Zmiana nie może być zerowa.');
  const reason = reqStr(body.reason, 'Powód');
  return db.tx(() => {
    const before = poolBalance(db, poolId).balance_min;
    const after = before + delta;
    const r = db.run(`INSERT INTO leave_ledger(pool_id,kind,minutes,reason,hr_document_ref,balance_before_min,balance_after_min,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, poolId, kind, delta, reason, body.hr_document_ref || null, before, after, user.id, T.nowIso());
    audit(db, user, 'leave_pool', poolId, kind, { balance_min: before }, { balance_min: after, delta }, reason);
    return { id: Number(r.lastInsertRowid), balance_before_min: before, balance_after_min: after };
  });
}

function previewAdjust(db, poolId, delta) {
  const before = poolBalance(db, poolId).balance_min;
  return { balance_before_min: before, balance_after_min: before + (Number(delta) || 0) };
}

// ---------- Wybór jednostki (siła wyższa / art. 188) ----------
const STD_LIMIT_DAYS = 2, STD_LIMIT_MIN = 16 * 60;

function unitChoice(db, employeeId, year, kind) {
  const row = db.get('SELECT * FROM unit_choices WHERE employee_id=? AND year=? AND kind=?', employeeId, year, kind);
  const terms = C.termsAt(db, employeeId, `${year}-12-31`) || C.termsAt(db, employeeId, T.today());
  const standard = terms && terms.fte_num === terms.fte_den && terms.daily_norm_min === 480;
  let limit_days = STD_LIMIT_DAYS, limit_min = STD_LIMIT_MIN, limit_confirmed = !!standard, limit_note = null;
  if (!standard) {
    // Niepełny etat / obniżona norma: propozycja proporcjonalna — WYMAGA potwierdzenia przez kadry.
    const fte = terms ? terms.fte_num / terms.fte_den : 1;
    limit_min = Math.round(STD_LIMIT_MIN * fte);
    limit_note = 'Limit godzinowy dla niepełnego etatu lub obniżonej normy wyliczony proporcjonalnie — wymaga potwierdzenia przez kadry.';
  }
  if (row && row.limit_min != null) { limit_min = row.limit_min; limit_confirmed = !!row.limit_confirmed; limit_note = row.limit_note; }
  if (row && row.limit_days != null) limit_days = row.limit_days;
  const usage = unitUsage(db, employeeId, year, kind);
  return {
    employee_id: employeeId, year, kind, unit: row ? row.unit : null, unit_label: row && row.unit ? row.unit : 'nieustalony',
    set_by_absence_id: row ? row.set_by_absence_id : null, set_at: row ? row.set_at : null,
    limit_days, limit_min, limit_confirmed, limit_note, ...usage,
  };
}

function unitUsage(db, employeeId, year, kind, excludeId = 0) {
  const rows = db.all(`SELECT a.* FROM absences a JOIN absence_categories c ON c.id=a.category_id
     WHERE a.employee_id=? AND c.pool_kind=? AND a.status!='anulowana' AND substr(a.start_date,1,4)=? AND a.id != ?`,
  employeeId, kind, String(year), excludeId);
  const s = { used_days: 0, used_min: 0, planned_days: 0, planned_min: 0 };
  for (const r of rows) {
    const key = r.status === 'wykorzystana' ? 'used' : 'planned';
    if (r.unit === 'dni') s[`${key}_days`] += r.days; else s[`${key}_min`] += r.minutes;
  }
  return s;
}

function checkUnitRules(db, a, cat, excludeId) {
  const year = Number(a.start_date.slice(0, 4));
  if (a.end_date.slice(0, 4) !== a.start_date.slice(0, 4)) throw bad('Wpis nie może obejmować dwóch lat — rozdziel go.');
  const ch = unitChoice(db, a.employee_id, year, cat.pool_kind);
  if (ch.unit && a.unit !== ch.unit) {
    throw conflict(`W roku ${year} pracownik wybrał jednostkę „${ch.unit}” dla „${cat.name}”. Mieszanie dni i godzin w jednym roku jest niedozwolone.`, { code: 'unit_mix' });
  }
  // Sprawdzenie wpisów planowanych: przy nieustalonej jednostce dopuszczamy oba warianty do czasu pierwszego wykorzystania,
  // ale wykorzystanie zablokuje się, jeżeli inne WYKORZYSTANE wpisy mają inną jednostkę.
  const u = unitUsage(db, a.employee_id, year, cat.pool_kind, excludeId);
  if (a.unit === 'dni') {
    if (u.used_min + u.planned_min > 0 && a.status === 'wykorzystana' && u.used_min > 0) throw conflict('Istnieją wykorzystane wpisy godzinowe w tym roku.', { code: 'unit_mix' });
    const total = u.used_days + u.planned_days + a.days;
    if (total > ch.limit_days) throw conflict(`Przekroczony roczny limit: ${total} z ${ch.limit_days} dni (łącznie z planowanymi).`, { code: 'limit' });
  } else {
    if (a.status === 'wykorzystana' && u.used_days > 0) throw conflict('Istnieją wykorzystane wpisy dniowe w tym roku.', { code: 'unit_mix' });
    const total = u.used_min + u.planned_min + a.minutes;
    if (total > ch.limit_min) throw conflict(`Przekroczony roczny limit: ${T.fmtHM(total)} z ${T.fmtHM(ch.limit_min)} (łącznie z planowanymi).`, { code: 'limit' });
  }
  return ch;
}

function lockUnitIfFirstUse(db, user, absenceId, a, cat) {
  const year = Number(a.start_date.slice(0, 4));
  const row = db.get('SELECT * FROM unit_choices WHERE employee_id=? AND year=? AND kind=?', a.employee_id, year, cat.pool_kind);
  if (row && row.unit) return;
  if (row) db.run('UPDATE unit_choices SET unit=?, set_by_absence_id=?, set_at=? WHERE id=?', a.unit, absenceId, T.nowIso(), row.id);
  else db.run('INSERT INTO unit_choices(employee_id,year,kind,unit,set_by_absence_id,set_at) VALUES (?,?,?,?,?,?)', a.employee_id, year, cat.pool_kind, a.unit, absenceId, T.nowIso());
  audit(db, user, 'unit_choice', `${a.employee_id}/${year}/${cat.pool_kind}`, 'ustalenie_jednostki', { unit: null }, { unit: a.unit, absence_id: absenceId }, 'pierwsze faktyczne wykorzystanie zgodnie z wnioskiem pracownika');
}

// Korekta pomyłki w wyborze jednostki: wymaga powodu; odrzucana, jeżeli istnieją wykorzystane wpisy w innej jednostce.
function correctUnitChoice(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  const year = reqInt(body.year, 'Rok', { min: 2000, max: 2100 });
  const kind = oneOf(body.kind, 'Rodzaj', ['sila_wyzsza', 'opieka_188']);
  const unit = oneOf(body.unit || null, 'Jednostka', ['dni', 'godziny'], { optional: true });
  const reason = reqStr(body.reason, 'Powód');
  const offending = db.all(`SELECT a.id, a.unit, a.start_date FROM absences a JOIN absence_categories c ON c.id=a.category_id
     WHERE a.employee_id=? AND c.pool_kind=? AND a.status!='anulowana' AND substr(a.start_date,1,4)=? AND (? IS NULL OR a.unit != ?)`,
  employeeId, kind, String(year), unit, unit);
  const blocking = unit ? offending : offending.filter(o => db.get('SELECT status FROM absences WHERE id=?', o.id).status === 'wykorzystana');
  if (blocking.length) {
    throw conflict('Nie można zmienić wyboru: istnieją wpisy w innej jednostce. Najpierw je skoryguj lub anuluj (z powodem).', { entries: blocking });
  }
  return db.tx(() => {
    const old = db.get('SELECT * FROM unit_choices WHERE employee_id=? AND year=? AND kind=?', employeeId, year, kind);
    if (old) db.run('UPDATE unit_choices SET unit=?, set_by_absence_id=NULL, set_at=? WHERE id=?', unit, T.nowIso(), old.id);
    else db.run('INSERT INTO unit_choices(employee_id,year,kind,unit,set_at) VALUES (?,?,?,?,?)', employeeId, year, kind, unit, T.nowIso());
    audit(db, user, 'unit_choice', `${employeeId}/${year}/${kind}`, 'korekta_jednostki', old, { unit }, reason);
    return unitChoice(db, employeeId, year, kind);
  });
}

function setUnitLimit(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Pracownik');
  const year = reqInt(body.year, 'Rok', { min: 2000, max: 2100 });
  const kind = oneOf(body.kind, 'Rodzaj', ['sila_wyzsza', 'opieka_188']);
  const limitMin = reqInt(body.limit_min, 'Limit (min)', { min: 0, max: 10000 });
  const limitDays = reqInt(body.limit_days, 'Limit (dni)', { min: 0, max: 30 });
  const reason = reqStr(body.reason, 'Powód / potwierdzenie kadr');
  return db.tx(() => {
    const old = db.get('SELECT * FROM unit_choices WHERE employee_id=? AND year=? AND kind=?', employeeId, year, kind);
    if (old) db.run('UPDATE unit_choices SET limit_min=?, limit_days=?, limit_confirmed=1, limit_note=? WHERE id=?', limitMin, limitDays, reason, old.id);
    else db.run('INSERT INTO unit_choices(employee_id,year,kind,limit_min,limit_days,limit_confirmed,limit_note) VALUES (?,?,?,?,?,1,?)', employeeId, year, kind, limitMin, limitDays, reason);
    audit(db, user, 'unit_choice', `${employeeId}/${year}/${kind}`, 'limit', old, { limit_min: limitMin, limit_days: limitDays }, reason);
    return unitChoice(db, employeeId, year, kind);
  });
}

// ---------- Nieobecności ----------
function computeAbsence(db, b, cat) {
  const a = {
    employee_id: b.employee_id, category_id: cat.id, status: b.status,
    start_date: b.start_date, end_date: b.end_date || b.start_date, start_at: null, end_at: null, unit: null, minutes: 0, days: 0,
  };
  T.assertDate(a.start_date); T.assertDate(a.end_date);
  if (a.end_date < a.start_date) throw bad('Data końca przed datą początku.');
  const hourly = cat.unit === 'godziny' || cat.unit === 'minuty' || (cat.unit === 'dni_lub_godziny' && b.unit === 'godziny');
  if (cat.unit === 'dni_lub_godziny') a.unit = oneOf(b.unit, 'Jednostka (zgodnie z wnioskiem pracownika)', ['dni', 'godziny']);
  else a.unit = hourly ? 'godziny' : 'dni';
  if (hourly) {
    a.start_at = T.localToUtc(a.start_date, reqStr(b.start_time, 'Od godz.'));
    a.end_at = T.localToUtc(a.end_date, reqStr(b.end_time, 'Do godz.'));
    if (a.end_at <= a.start_at) throw bad('Koniec musi być po początku.');
    a.minutes = C.scheduledOverlapMin(db, a.employee_id, a.start_at, a.end_at);
    a.days = new Set(C.scheduleIn(db, a.employee_id, a.start_at, a.end_at).map(s => s.work_date)).size;
    if (a.minutes === 0) throw conflict('Wskazane godziny nie obejmują czasu pracy wg grafiku.');
  } else {
    const rows = db.all('SELECT work_date, planned_min FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN ? AND ?', a.employee_id, a.start_date, a.end_date);
    a.minutes = rows.reduce((s, r) => s + r.planned_min, 0);
    a.days = new Set(rows.map(r => r.work_date)).size;
  }
  return a;
}

function validateAbsence(db, a, cat, excludeId) {
  const warnings = [];
  const emp = C.employeeOrThrow(db, a.employee_id);
  if (a.start_date < emp.employment_start) throw conflict('Data przed rozpoczęciem zatrudnienia.');
  for (const ym of new Set([T.monthOf(a.start_date), T.monthOf(a.end_date)])) C.assertMonthOpen(db, ym);
  const iv = C.absenceInterval(a);
  const cl = C.occupancyConflicts(db, a.employee_id, iv.start, iv.end, { absence: excludeId });
  if (cl.length) throw conflict(`Wpis nakłada się na: ${cl.map(c => c.label).join('; ')}.`, { conflicts: cl });
  if (cat.pool_kind === 'wypoczynkowy' || cat.pool_kind === 'sila_wyzsza' || cat.pool_kind === 'opieka_188') {
    if (a.minutes === 0) throw conflict('Brak zmian w grafiku w tym okresie — nie można rozliczyć wykorzystania wg grafiku.');
  }
  if (cat.verification_status === 'do_potwierdzenia_przez_kadry' && cat.limit_rule) {
    warnings.push(`Reguła limitu „${cat.name}” wymaga potwierdzenia przez kadry.`);
  }
  if (cat.limit_value) {
    const lv = JSON.parse(cat.limit_value);
    if (lv.max_days_per_year) {
      const used = db.get(`SELECT COALESCE(SUM(days),0) s FROM absences WHERE employee_id=? AND category_id=? AND status!='anulowana'
         AND substr(start_date,1,4)=? AND id != ?`, a.employee_id, cat.id, a.start_date.slice(0, 4), excludeId || 0).s;
      if (used + a.days > lv.max_days_per_year) warnings.push(`Uwaga: ${used + a.days} dni „${cat.name}” w roku — przekracza ${lv.max_days_per_year} (reguła do potwierdzenia).`);
    }
  }
  return warnings;
}

function pickPool(db, a, requestedPoolId, excludeId) {
  const pools = db.all('SELECT * FROM leave_pools WHERE employee_id=? ORDER BY acquisition_year', a.employee_id);
  if (!pools.length) throw conflict('Pracownik nie ma pul urlopu. Administrator musi wprowadzić wymiar na podstawie danych kadr.');
  let pool;
  if (requestedPoolId) {
    pool = pools.find(p => p.id === Number(requestedPoolId));
    if (!pool) throw bad('Wskazana pula nie należy do pracownika.');
  } else {
    pool = pools.find(p => poolBalance(db, p.id, { excludeAbsence: excludeId }).available_min > 0) || pools[pools.length - 1];
  }
  const bal = poolBalance(db, pool.id, { excludeAbsence: excludeId });
  if (a.status !== 'anulowana' && bal.available_min < a.minutes) {
    throw conflict(`Niewystarczające saldo puli ${pool.acquisition_year}: dostępne ${T.fmtHM(bal.available_min)}, potrzebne ${T.fmtHM(a.minutes)}. Wskaż inną pulę lub podziel wpis.`, { code: 'pool_balance' });
  }
  return pool.id;
}

function createAbsence(db, user, body) {
  const cat = db.get('SELECT * FROM absence_categories WHERE id=? AND active=1', reqInt(body.category_id, 'Kategoria'));
  if (!cat) throw bad('Nieznana lub nieaktywna kategoria.');
  const b = { ...body, employee_id: reqInt(body.employee_id, 'Pracownik'), status: oneOf(body.status || 'planowana', 'Status', ['planowana', 'wykorzystana']) };
  if (cat.code === 'WYJSCIE_PRYWATNE') throw bad('Wyjścia prywatne rejestruj w module „Wyjścia i odrabianie”.');
  const a = computeAbsence(db, b, cat);
  const warnings = validateAbsence(db, a, cat, 0);
  return db.tx(() => {
    if (cat.pool_kind === 'wypoczynkowy') a.pool_id = pickPool(db, a, body.pool_id, 0);
    if (cat.pool_kind === 'sila_wyzsza' || cat.pool_kind === 'opieka_188') {
      const ch = checkUnitRules(db, a, cat, 0);
      if (!ch.limit_confirmed && ch.limit_note) warnings.push(ch.limit_note);
    }
    const now = T.nowIso();
    const r = db.run(`INSERT INTO absences(employee_id,category_id,status,start_date,end_date,start_at,end_at,unit,minutes,days,pool_id,
       employee_request,document_ref,confidential_note,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.employee_id, a.category_id, a.status, a.start_date, a.end_date, a.start_at, a.end_at, a.unit, a.minutes, a.days, a.pool_id || null,
    body.employee_request ? 1 : 0, body.document_ref || null, body.confidential_note || null, user.id, now, now);
    const id = Number(r.lastInsertRowid);
    if (a.status === 'wykorzystana' && cat.pool_kind && cat.pool_kind !== 'wypoczynkowy') lockUnitIfFirstUse(db, user, id, a, cat);
    audit(db, user, 'absence', id, 'utworzenie', null, { ...a, pool_id: a.pool_id || null });
    return { id, warnings };
  });
}

// Zmiana statusu / danych. Wpisy wykorzystane i anulowanie wymagają powodu. Brak cichego usuwania.
function updateAbsence(db, user, id, body) {
  const old = db.get('SELECT * FROM absences WHERE id=?', id);
  if (!old) throw notFound();
  if (old.status === 'anulowana') throw conflict('Anulowany wpis jest zamknięty w historii — utwórz nowy.');
  const cat = db.get('SELECT * FROM absence_categories WHERE id=?', old.category_id);
  const newStatus = oneOf(body.status || old.status, 'Status', ['planowana', 'wykorzystana', 'anulowana']);
  if ((old.status === 'wykorzystana' || newStatus === 'anulowana') && !body.reason) throw bad('Zmiana wykorzystanego wpisu lub anulowanie wymaga powodu.');
  if (old.status === 'wykorzystana' && newStatus === 'planowana') throw conflict('Wykorzystanego wpisu nie można cofnąć do planu — anuluj z powodem i utwórz nowy.');
  for (const ym of new Set([T.monthOf(old.start_date), T.monthOf(old.end_date)])) C.assertMonthOpen(db, ym);
  if (newStatus === 'anulowana') {
    return db.tx(() => {
      db.run('UPDATE absences SET status=?, cancel_reason=?, updated_at=? WHERE id=?', 'anulowana', body.reason, T.nowIso(), id);
      audit(db, user, 'absence', id, 'anulowanie', old, { status: 'anulowana' }, body.reason);
      return { id, warnings: [] };
    });
  }
  const merged = {
    employee_id: old.employee_id, status: newStatus,
    start_date: body.start_date || old.start_date, end_date: body.end_date || old.end_date,
    unit: body.unit || old.unit,
    start_time: body.start_time || (old.start_at ? T.utcToLocal(old.start_at).time : undefined),
    end_time: body.end_time || (old.end_at ? T.utcToLocal(old.end_at).time : undefined),
  };
  const a = computeAbsence(db, merged, cat);
  const warnings = validateAbsence(db, a, cat, id);
  return db.tx(() => {
    a.pool_id = null;
    if (cat.pool_kind === 'wypoczynkowy') a.pool_id = pickPool(db, a, body.pool_id || old.pool_id, id);
    if (cat.pool_kind === 'sila_wyzsza' || cat.pool_kind === 'opieka_188') checkUnitRules(db, a, cat, id);
    db.run(`UPDATE absences SET status=?, start_date=?, end_date=?, start_at=?, end_at=?, unit=?, minutes=?, days=?, pool_id=?,
      employee_request=?, document_ref=?, confidential_note=?, updated_at=? WHERE id=?`,
    a.status, a.start_date, a.end_date, a.start_at, a.end_at, a.unit, a.minutes, a.days, a.pool_id,
    body.employee_request === undefined ? old.employee_request : (body.employee_request ? 1 : 0),
    body.document_ref === undefined ? old.document_ref : body.document_ref,
    body.confidential_note === undefined ? old.confidential_note : body.confidential_note, T.nowIso(), id);
    if (a.status === 'wykorzystana' && cat.pool_kind && cat.pool_kind !== 'wypoczynkowy') lockUnitIfFirstUse(db, user, id, a, cat);
    audit(db, user, 'absence', id, 'edycja', old, a, body.reason);
    return { id, warnings };
  });
}

function listAbsences(db, { from, to, employeeId, categoryId, status } = {}) {
  const w = ['1=1'], p = [];
  if (from) { w.push('a.end_date >= ?'); p.push(from); }
  if (to) { w.push('a.start_date <= ?'); p.push(to); }
  if (employeeId) { w.push('a.employee_id = ?'); p.push(employeeId); }
  if (categoryId) { w.push('a.category_id = ?'); p.push(categoryId); }
  if (status) { w.push('a.status = ?'); p.push(status); }
  return db.all(`SELECT a.*, c.code, c.name AS category_name, c.short, c.icon, c.visibility, c.public_label, c.pool_kind,
     lp.acquisition_year AS pool_year FROM absences a JOIN absence_categories c ON c.id=a.category_id
     LEFT JOIN leave_pools lp ON lp.id=a.pool_id WHERE ${w.join(' AND ')} ORDER BY a.start_date`, ...p);
}

module.exports = {
  saveCategory, poolBalance, listPools, overdueStatus, createPool, adjustPool, previewAdjust, unitChoice, correctUnitChoice,
  setUnitLimit, createAbsence, updateAbsence, listAbsences, STD_LIMIT_MIN,
};
