'use strict';
// Plan pracy: polecenia kierownika dla programistów na dzień / zmianę.
// Kierownik rozpisuje polecenia (kolejność, projekt, zadanie, maszyna, opis, przewidywany czas) i ocenia wykonanie;
// programista widzi wyłącznie swoje polecenia i może tylko potwierdzić ich przeczytanie.
const T = require('../time');
const { bad, conflict, notFound, forbidden, audit, reqStr, reqInt, oneOf } = require('../core');
const C = require('./common');
const People = require('./people');

const STATUSES = ['zaplanowane', 'wykonane', 'czesciowo', 'niewykonane', 'anulowane'];
const OPEN = ['zaplanowane'];

function decorate(db, rows) {
  return rows.map(o => ({ ...o, carried: !!o.carried_from }));
}
function listOrders(db, { from, to, employeeId } = {}) {
  const w = ['o.work_date BETWEEN ? AND ?'], p = [from, to];
  if (employeeId) { w.push('o.employee_id = ?'); p.push(employeeId); }
  return decorate(db, db.all(`SELECT o.*, pr.order_no, pr.part_no, pr.part_rev, t.title AS task_title, t.status AS task_status, m.name AS machine_name, m.axes,
      u.display_name AS closed_by_name
    FROM work_orders o LEFT JOIN projects pr ON pr.id = o.project_id LEFT JOIN tasks t ON t.id = o.task_id LEFT JOIN machines m ON m.id = o.machine_id
    LEFT JOIN users u ON u.id = o.closed_by WHERE ${w.join(' AND ')} ORDER BY o.work_date, o.employee_id, o.seq, o.id`, ...p));
}

// Dzień planu: dla każdego aktywnego pracownika zmiana z grafiku, nieobecności, polecenia i obciążenie (plan vs długość zmiany)
function dayPlan(db, date) {
  T.assertDate(date);
  const emps = db.all('SELECT id, first_name, last_name, color FROM employees WHERE active = 1 ORDER BY last_name, first_name');
  const shifts = People.listSchedule(db, date, date);
  const orders = listOrders(db, { from: date, to: date });
  const absences = db.all(`SELECT a.employee_id, a.start_at, a.end_at, c.public_label FROM absences a JOIN absence_categories c ON c.id = a.category_id
    WHERE a.status != 'anulowana' AND a.start_date <= ? AND a.end_date >= ?`, date, date);
  const tpl = new Map(db.all('SELECT id, name, short FROM shift_templates').map(t => [t.id, t]));
  return {
    date,
    employees: emps.map(e => {
      const sh = shifts.filter(s => s.employee_id === e.id);
      const shiftMin = sh.reduce((s, x) => s + x.planned_min, 0);
      const list = orders.filter(o => o.employee_id === e.id);
      const active = list.filter(o => o.status !== 'anulowane');
      const planned = active.reduce((s, o) => s + (o.planned_min || 0), 0);
      const ab = absences.filter(a => a.employee_id === e.id);
      return {
        employee_id: e.id, name: `${e.first_name} ${e.last_name}`,
        shifts: sh.map(s => ({ name: s.shift_template_id ? tpl.get(s.shift_template_id).name : 'zmiana', start: s.start_local.time, end: s.end_local.time, planned_min: s.planned_min })),
        shift_min: shiftMin, absence: ab.length ? ab.map(a => (a.start_at ? `${a.public_label} (część dnia)` : a.public_label)).join(', ') : null,
        orders: list, planned_min: planned, load_pct: shiftMin ? Math.round((planned / shiftMin) * 100) : null,
        unread: active.filter(o => !o.ack_at && o.status === 'zaplanowane').length,
      };
    }),
  };
}

function validateRefs(db, body, current = {}) {
  const projectId = body.project_id !== undefined ? (body.project_id || null) : current.project_id || null;
  let taskId = body.task_id !== undefined ? (body.task_id ? reqInt(body.task_id, 'Zadanie') : null) : current.task_id || null;
  let project = projectId ? db.get('SELECT * FROM projects WHERE id = ?', projectId) : null;
  if (projectId && !project) throw bad('Nieznany projekt.');
  if (taskId) {
    const t = db.get('SELECT * FROM tasks WHERE id = ?', taskId);
    if (!t) throw bad('Nieznane zadanie.');
    if (project && t.project_id !== project.id) throw bad('Zadanie nie należy do wybranego projektu.');
    if (!project) project = db.get('SELECT * FROM projects WHERE id = ?', t.project_id);
  }
  const machineId = body.machine_id !== undefined ? (body.machine_id || null) : current.machine_id || (project ? project.machine_id : null);
  if (machineId && !db.get('SELECT 1 FROM machines WHERE id = ?', machineId)) throw bad('Nieznana maszyna.');
  return { project_id: project ? project.id : null, task_id: taskId, machine_id: machineId };
}

function warningsFor(db, employeeId, date, extraMin = 0, excludeId = 0) {
  const out = [];
  const sh = People.listSchedule(db, date, date, employeeId);
  if (!sh.length) out.push('Pracownik nie ma w tym dniu zmiany w grafiku.');
  const ab = db.get(`SELECT c.public_label FROM absences a JOIN absence_categories c ON c.id = a.category_id WHERE a.employee_id = ? AND a.status != 'anulowana' AND a.start_date <= ? AND a.end_date >= ?`, employeeId, date, date);
  if (ab) out.push(`W tym dniu jest nieobecność (${ab.public_label}).`);
  const shiftMin = sh.reduce((s, x) => s + x.planned_min, 0);
  const planned = db.get(`SELECT COALESCE(SUM(planned_min),0) s FROM work_orders WHERE employee_id = ? AND work_date = ? AND status != 'anulowane' AND id != ?`, employeeId, date, excludeId).s + (extraMin || 0);
  if (shiftMin && planned > shiftMin) out.push(`Plan na ten dzień (${T.fmtHM(planned)}) przekracza długość zmiany (${T.fmtHM(shiftMin)}).`);
  return out;
}

function createOrder(db, user, body) {
  const employeeId = reqInt(body.employee_id, 'Programista');
  const emp = C.employeeOrThrow(db, employeeId);
  if (!emp.active) throw conflict('Pracownik jest nieaktywny.');
  const date = reqStr(body.work_date, 'Dzień'); T.assertDate(date);
  const refs = validateRefs(db, body);
  const task = refs.task_id ? db.get('SELECT title FROM tasks WHERE id = ?', refs.task_id) : null;
  const title = reqStr(body.title, 'Polecenie', { optional: true, max: 200 }) || (task ? task.title : null);
  if (!title) throw bad('Wpisz polecenie albo wybierz zadanie z projektu.');
  const planned = reqInt(body.planned_min, 'Przewidywany czas', { optional: true, min: 1, max: 1440 });
  const details = reqStr(body.details, 'Opis', { optional: true, max: 2000 });
  const warnings = warningsFor(db, employeeId, date, planned || 0);
  return db.tx(() => {
    const seq = (db.get('SELECT MAX(seq) m FROM work_orders WHERE employee_id = ? AND work_date = ?', employeeId, date).m || 0) + 1;
    const now = T.nowIso();
    const r = db.run(`INSERT INTO work_orders(work_date, employee_id, seq, title, details, project_id, task_id, machine_id, planned_min, status, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'zaplanowane',?,?,?)`, date, employeeId, seq, title, details, refs.project_id, refs.task_id, refs.machine_id, planned, user.id, now, now);
    const id = Number(r.lastInsertRowid);
    audit(db, user, 'work_order', id, 'utworzenie', null, { work_date: date, employee_id: employeeId, seq, title, details, ...refs, planned_min: planned });
    return { id, warnings };
  });
}

function getOrder(db, id) {
  const o = db.get('SELECT * FROM work_orders WHERE id = ?', id);
  if (!o) throw notFound('Nie znaleziono polecenia.');
  return o;
}

// Edycja treści (tylko polecenia zaplanowane) albo ocena wykonania / anulowanie
function updateOrder(db, user, id, body) {
  const old = getOrder(db, id);
  const status = oneOf(body.status || old.status, 'Status', STATUSES);
  if (old.status === 'anulowane') throw conflict('Anulowane polecenie jest zamknięte w historii.');
  const reason = reqStr(body.reason, 'Powód', { optional: true, max: 500 });
  if (status === 'anulowane' && !reason) throw bad('Anulowanie polecenia wymaga powodu.');
  const resultNote = body.result_note !== undefined ? reqStr(body.result_note, 'Uwagi do wykonania', { optional: true, max: 1000 }) : old.result_note;
  if ((status === 'czesciowo' || status === 'niewykonane') && !resultNote) throw bad('Przy wykonaniu częściowym lub niewykonaniu wpisz krótko, co zostało do zrobienia lub dlaczego.');
  const contentChange = ['title', 'details', 'project_id', 'task_id', 'machine_id', 'planned_min', 'work_date', 'employee_id'].some(k => body[k] !== undefined);
  if (contentChange && !OPEN.includes(old.status)) throw conflict('Treść można zmienić tylko w poleceniu, które nie zostało jeszcze ocenione.');
  const upd = { ...old };
  let warnings = [];
  if (contentChange) {
    const refs = validateRefs(db, body, old);
    Object.assign(upd, refs);
    if (body.title !== undefined) upd.title = reqStr(body.title, 'Polecenie', { max: 200 });
    if (body.details !== undefined) upd.details = reqStr(body.details, 'Opis', { optional: true, max: 2000 });
    if (body.planned_min !== undefined) upd.planned_min = reqInt(body.planned_min, 'Przewidywany czas', { optional: true, min: 1, max: 1440 });
    if (body.work_date !== undefined) { upd.work_date = reqStr(body.work_date, 'Dzień'); T.assertDate(upd.work_date); }
    if (body.employee_id !== undefined) { upd.employee_id = reqInt(body.employee_id, 'Programista'); C.employeeOrThrow(db, upd.employee_id); }
    if (upd.work_date !== old.work_date || upd.employee_id !== old.employee_id) {
      upd.seq = (db.get('SELECT MAX(seq) m FROM work_orders WHERE employee_id = ? AND work_date = ?', upd.employee_id, upd.work_date).m || 0) + 1;
      upd.ack_at = null; // nowy dzień / osoba — trzeba ponownie przeczytać
    } else if (['title', 'details', 'task_id', 'machine_id'].some(k => body[k] !== undefined && String(body[k] ?? '') !== String(old[k] ?? ''))) {
      upd.ack_at = null; // zmieniona treść — programista potwierdza ponownie
    }
    warnings = warningsFor(db, upd.employee_id, upd.work_date, upd.planned_min || 0, id);
  }
  upd.status = status; upd.result_note = resultNote;
  const closing = status !== old.status && status !== 'zaplanowane';
  return db.tx(() => {
    db.run(`UPDATE work_orders SET work_date=?, employee_id=?, seq=?, title=?, details=?, project_id=?, task_id=?, machine_id=?, planned_min=?, status=?, result_note=?, ack_at=?,
      closed_by=?, closed_at=?, updated_at=? WHERE id=?`, upd.work_date, upd.employee_id, upd.seq, upd.title, upd.details, upd.project_id, upd.task_id, upd.machine_id, upd.planned_min,
    upd.status, upd.result_note, upd.ack_at, closing ? user.id : (status === 'zaplanowane' ? null : old.closed_by), closing ? T.nowIso() : (status === 'zaplanowane' ? null : old.closed_at), T.nowIso(), id);
    const action = status === 'anulowane' ? 'anulowanie' : closing ? 'ocena_wykonania' : status === 'zaplanowane' && old.status !== 'zaplanowane' ? 'ponowne_otwarcie' : 'edycja';
    const pick = (o) => ({ work_date: o.work_date, employee_id: o.employee_id, title: o.title, details: o.details, project_id: o.project_id, task_id: o.task_id, machine_id: o.machine_id, planned_min: o.planned_min, status: o.status, result_note: o.result_note });
    audit(db, user, 'work_order', id, action, pick(old), pick(upd), reason);
    return { id, warnings };
  });
}

function moveOrder(db, user, id, dir) {
  const o = getOrder(db, id);
  const step = dir === 'up' ? -1 : dir === 'down' ? 1 : null;
  if (!step) throw bad('Kierunek: up / down.');
  const list = db.all('SELECT id, seq FROM work_orders WHERE employee_id = ? AND work_date = ? ORDER BY seq, id', o.employee_id, o.work_date);
  const i = list.findIndex(x => x.id === id), j = i + step;
  if (j < 0 || j >= list.length) return { id };
  db.tx(() => {
    list.forEach((x, k) => { x.seq = k + 1; });
    [list[i].seq, list[j].seq] = [list[j].seq, list[i].seq];
    for (const x of list) db.run('UPDATE work_orders SET seq = ? WHERE id = ?', x.seq, x.id);
    audit(db, user, 'work_order', id, 'zmiana_kolejnosci', { seq: i + 1 }, { seq: j + 1 });
  });
  return { id };
}

// Przeniesienie niewykonanych (zaplanowanych, częściowych, niewykonanych) poleceń na inny dzień — jako nowe polecenia z odnośnikiem
function carryOver(db, user, body) {
  const from = reqStr(body.from_date, 'Z dnia'), to = reqStr(body.to_date, 'Na dzień');
  T.assertDate(from); T.assertDate(to);
  if (from === to) throw bad('Wybierz inny dzień docelowy.');
  const employeeId = body.employee_id ? reqInt(body.employee_id, 'Programista') : null;
  const src = db.all(`SELECT * FROM work_orders WHERE work_date = ? AND status IN ('zaplanowane','czesciowo','niewykonane') AND (? IS NULL OR employee_id = ?)
    AND id NOT IN (SELECT carried_from FROM work_orders WHERE carried_from IS NOT NULL AND work_date = ?) ORDER BY employee_id, seq`, from, employeeId, employeeId, to);
  return db.tx(() => {
    let n = 0;
    for (const o of src) {
      const seq = (db.get('SELECT MAX(seq) m FROM work_orders WHERE employee_id = ? AND work_date = ?', o.employee_id, to).m || 0) + 1;
      const now = T.nowIso();
      const details = o.status === 'zaplanowane' ? o.details : [o.details, `Kontynuacja z ${from}: ${o.result_note || ''}`].filter(Boolean).join('\n');
      const r = db.run(`INSERT INTO work_orders(work_date, employee_id, seq, title, details, project_id, task_id, machine_id, planned_min, status, carried_from, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'zaplanowane',?,?,?,?)`, to, o.employee_id, seq, o.title, details, o.project_id, o.task_id, o.machine_id, o.planned_min, o.id, user.id, now, now);
      audit(db, user, 'work_order', Number(r.lastInsertRowid), 'przeniesienie', { from_order: o.id, work_date: from }, { work_date: to });
      n++;
    }
    return { copied: n };
  });
}

function acknowledge(db, user, id) {
  const o = getOrder(db, id);
  if (user.role !== 'employee' || o.employee_id !== user.employee_id) throw forbidden('To polecenie nie jest przypisane do Ciebie.');
  if (o.status === 'anulowane') throw conflict('Polecenie zostało anulowane.');
  if (o.ack_at) return { id, ack_at: o.ack_at };
  const at = T.nowIso();
  db.tx(() => {
    db.run('UPDATE work_orders SET ack_at = ? WHERE id = ?', at, id);
    audit(db, user, 'work_order', id, 'potwierdzenie_przeczytania', null, { ack_at: at });
  });
  return { id, ack_at: at };
}

// Widok pracownika: tylko własne polecenia, bez anulowanych sprzed dziś
function myOrders(db, user, { from, to }) {
  if (user.role !== 'employee' || !user.employee_id) throw forbidden();
  return listOrders(db, { from, to, employeeId: user.employee_id })
    .filter(o => o.status !== 'anulowane' || o.work_date >= T.today())
    .map(({ created_by, closed_by, ...o }) => o);
}

module.exports = { STATUSES, listOrders, dayPlan, createOrder, updateOrder, moveOrder, carryOver, acknowledge, myOrders };
