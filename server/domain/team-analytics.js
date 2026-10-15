'use strict';
// Analiza zespołu w wybranym okresie (tylko kierownik): programiści, detale (praca jednostkowa), struktura czasu.
// Czas pracy = aktywna praca + weryfikacja/uruchomienie + poprawki — jak w godzinach projektu i pozostałej analityce.
const T = require('../time');
const { bad } = require('../core');
const A = require('./analytics');

const WORK = 'e.active_min + e.verify_min + e.rework_min';
const pct1 = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const CAUSE = { brak_dokumentacji: 'brak dokumentacji', zmiana_zakresu: 'zmiana zakresu', narzedzia: 'narzędzia', maszyna: 'maszyna', decyzja_zewnetrzna: 'decyzja zewnętrzna', blad_programowania: 'błąd programowania', inne: 'inne', '-': 'bez przyczyny' };

function range(from, to) {
  for (const d of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) throw bad('Okres w formacie RRRR-MM-DD.');
    T.assertDate(d); // np. 31.02 — błąd zamiast przesunięcia na marzec
  }
  if (from > to) throw bad('Data „od” jest późniejsza niż „do”.');
  if ((Date.parse(to) - Date.parse(from)) / 86400e3 > 1100) throw bad('Okres do 3 lat.');
  // zakończenie zadania (UTC) w okresie lokalnym
  return { from, to, utcFrom: T.localToUtc(from, '00:00'), utcTo: T.localToUtc(T.addDays(to, 1), '00:00') };
}
const machinesOf = (db) => db.all('SELECT id, name, axes, control FROM machines WHERE active=1 ORDER BY sort');

// Programiści: godziny na maszynach, zadania zakończone, dokładność planu, poprawki, blokady
function programmers(db, r) {
  const work = db.all(`SELECT e.employee_id, COALESCE(p.machine_id,'-') machine_id, SUM(${WORK}) w, SUM(e.rework_min) rw, SUM(e.blocked_min) bl
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id JOIN projects p ON p.id = t.project_id
    WHERE e.work_date BETWEEN ? AND ? GROUP BY e.employee_id, p.machine_id`, r.from, r.to);
  const projTotals = db.all(`SELECT e.employee_id, COUNT(DISTINCT t.project_id) projects, COUNT(DISTINCT e.work_date) days FROM task_time_entries e JOIN tasks t ON t.id = e.task_id
    WHERE e.work_date BETWEEN ? AND ? GROUP BY e.employee_id`, r.from, r.to);
  // zadania zakończone w okresie (osoba przypisana) — plan wobec całego czasu na zadaniu
  const done = db.all(`SELECT t.id, t.assignee_id, t.planned_min, t.difficulty, (SELECT COALESCE(SUM(${WORK}),0) FROM task_time_entries e WHERE e.task_id = t.id) w
    FROM tasks t WHERE t.status='zakonczone' AND t.completed_at >= ? AND t.completed_at < ? AND t.assignee_id IS NOT NULL`, r.utcFrom, r.utcTo);
  const machines = machinesOf(db);
  // osoby z pracą lub zakończonymi zadaniami w okresie — także te, które już nie pracują (żeby suma zespołu się zgadzała)
  const ids = [...new Set([...work.map(x => x.employee_id), ...done.map(t => t.assignee_id)])];
  const emps = ids.length ? db.all(`SELECT id, first_name, last_name, color, active FROM employees WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY last_name, first_name`, ...ids) : [];
  const rows = emps.map(e => {
    const mine = work.filter(x => x.employee_id === e.id);
    const total = mine.reduce((s, x) => s + x.w, 0);
    const tot = projTotals.find(x => x.employee_id === e.id) || {};
    const d = done.filter(t => t.assignee_id === e.id);
    const withPlan = d.filter(t => t.planned_min);
    const plan = withPlan.reduce((s, t) => s + t.planned_min, 0), act = withPlan.reduce((s, t) => s + t.w, 0);
    const rw = mine.reduce((s, x) => s + x.rw, 0);
    return {
      employee_id: e.id, name: `${e.first_name} ${e.last_name}`, color: e.color, active: !!e.active, worked_min: total,
      by_machine: machines.map(m => ({ machine_id: m.id, worked_min: (mine.find(x => x.machine_id === m.id) || {}).w || 0 })),
      projects: tot.projects || 0, days: tot.days || 0,
      tasks_done: d.length, tasks_with_plan: withPlan.length, planned_min: plan || null, actual_on_plan_min: withPlan.length ? act : null,
      plan_diff_pct: plan ? Math.round(((act - plan) / plan) * 100) : null,
      rework_min: rw, rework_share_pct: pct1(rw, total), blocked_min: mine.reduce((s, x) => s + x.bl, 0),
      avg_task_min: d.length ? Math.round(d.reduce((s, t) => s + t.w, 0) / d.length) : null,
    };
  });
  const team = rows.reduce((s, x) => s + x.worked_min, 0);
  for (const x of rows) x.share_pct = pct1(x.worked_min, team);
  return { machines, rows, team_min: team };
}

// Detale (praca jednostkowa): projekty zakończone w okresie — godziny, plan, czas trwania, termin; średnie wg rodziny i maszyny
function parts(db, r) {
  const ids = db.all(`SELECT DISTINCT p.id FROM projects p JOIN tasks t ON t.project_id = p.id WHERE p.status IN ('zakonczony','aktywny','wstrzymany')
    AND t.status='zakonczone' AND t.completed_at >= ? AND t.completed_at < ?`, T.localToUtc(T.addDays(r.from, -400), '00:00'), r.utcTo).map(x => x.id);
  const list = [];
  for (const id of ids) {
    const m = A.projectMetrics(db, id);
    if (!m.finish_date || m.finish_date < r.from || m.finish_date > r.to) continue;
    list.push({ id: m.id, order_no: m.order_no, part_no: m.part_no, part_rev: m.part_rev, part_family: m.part_family || 'bez rodziny', machine_id: m.machine_id, machine_name: m.machine_name, axes: m.axes,
      start_date: m.start_date, finish_date: m.finish_date, duration_days: m.duration_days, due_date: m.due_date, due_delta_days: m.due_delta_days,
      worked_min: m.worked_min, planned_min: m.planned_min, diff_pct: m.diff_pct, rework_min: m.rework_min, rework_share_pct: m.rework_share_pct,
      returns_count: m.returns_count, returns_added_min: m.returns_added_min, tasks: m.tasks });
  }
  list.sort((a, b) => a.finish_date.localeCompare(b.finish_date));
  const groups = new Map();
  for (const p of list) {
    const k = `${p.part_family}|${p.machine_id || '-'}`;
    if (!groups.has(k)) groups.set(k, { part_family: p.part_family, machine_id: p.machine_id, machine_name: p.machine_name, axes: p.axes, items: [] });
    groups.get(k).items.push(p);
  }
  const avg = (arr, f) => { const v = arr.map(f).filter(x => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  const summarize = (items) => {
    const wp = items.filter(p => p.planned_min);
    const plan = wp.reduce((s, p) => s + p.planned_min, 0), act = wp.reduce((s, p) => s + p.worked_min, 0);
    const withDue = items.filter(p => p.due_delta_days !== null);
    return { count: items.length, avg_worked_min: avg(items, p => p.worked_min), avg_planned_min: avg(wp, p => p.planned_min),
      plan_diff_pct: plan ? Math.round(((act - plan) / plan) * 100) : null, avg_duration_days: avg(items, p => p.duration_days),
      on_time_pct: withDue.length ? Math.round((withDue.filter(p => p.due_delta_days <= 0).length / withDue.length) * 100) : null,
      rework_share_pct: pct1(items.reduce((s, p) => s + p.rework_min, 0), items.reduce((s, p) => s + p.worked_min, 0)),
      returns: items.reduce((s, p) => s + p.returns_count, 0) };
  };
  const machines = machinesOf(db).map(m => ({ machine_id: m.id, name: m.name, axes: m.axes, ...summarize(list.filter(p => p.machine_id === m.id)) }));
  // dokładność szacunków czasu maszyny (dane technologiczne: czas NX, przewidywany i rzeczywisty czas maszyny)
  // porównanie „rzeczywisty wobec przewidywanego” tylko na operacjach, które mają oba czasy
  const tech = list.length ? db.all(`SELECT td.project_id, SUM(td.nx_time_min) nx, SUM(td.machine_est_min) est, SUM(td.machine_actual_min) act, COUNT(*) n,
      SUM(CASE WHEN td.machine_actual_min IS NOT NULL AND td.machine_est_min IS NOT NULL THEN td.machine_est_min END) est_with_act,
      SUM(CASE WHEN td.machine_actual_min IS NOT NULL AND td.machine_est_min IS NOT NULL THEN td.machine_actual_min END) act_with_est
    FROM tech_data td WHERE td.stale = 0 AND td.project_id IN (${list.map(() => '?').join(',')}) GROUP BY td.project_id`, ...list.map(p => p.id)) : [];
  return { rows: list, groups: [...groups.values()].map(g => ({ ...g, ...summarize(g.items), items: undefined })), machines, total: summarize(list), tech };
}

// Struktura czasu: na co idzie czas — typy zadań na maszynach, etapy, poprawki i blokady wg przyczyn
function timeStructure(db, r) {
  const machines = machinesOf(db);
  const byType = db.all(`SELECT tt.code, tt.name, tt.phase, COALESCE(p.machine_id,'-') machine_id, SUM(e.active_min) a, SUM(e.verify_min) v, SUM(e.rework_min) rw, SUM(e.blocked_min) bl
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id JOIN task_types tt ON tt.id = t.type_id JOIN projects p ON p.id = t.project_id
    WHERE e.work_date BETWEEN ? AND ? GROUP BY tt.id, p.machine_id ORDER BY tt.sort, tt.id`, r.from, r.to);
  const types = [...new Map(byType.map(x => [x.code, { code: x.code, name: x.name, phase: x.phase }])).values()].map(t => {
    const rows = byType.filter(x => x.code === t.code);
    return { ...t, by_machine: machines.map(m => { const x = rows.find(y => y.machine_id === m.id) || {}; return { machine_id: m.id, worked_min: (x.a || 0) + (x.v || 0) + (x.rw || 0) }; }),
      worked_min: rows.reduce((s, x) => s + x.a + x.v + x.rw, 0), rework_min: rows.reduce((s, x) => s + x.rw, 0), blocked_min: rows.reduce((s, x) => s + x.bl, 0) };
  });
  const kinds = db.get(`SELECT SUM(e.active_min) a, SUM(e.verify_min) v, SUM(e.rework_min) rw, SUM(e.blocked_min) bl, SUM(e.unassigned_min) un FROM task_time_entries e WHERE e.work_date BETWEEN ? AND ?`, r.from, r.to) || {};
  const causes = db.all(`SELECT COALESCE(e.cause,'-') cause, SUM(e.rework_min) rw, SUM(e.blocked_min) bl FROM task_time_entries e
    WHERE e.work_date BETWEEN ? AND ? AND (e.rework_min > 0 OR e.blocked_min > 0) GROUP BY COALESCE(e.cause,'-') ORDER BY SUM(e.rework_min + e.blocked_min) DESC`, r.from, r.to)
    .map(c => ({ cause: c.cause, label: CAUSE[c.cause] || c.cause, rework_min: c.rw || 0, blocked_min: c.bl || 0 }));
  const phases = machines.map(m => {
    const rows = byType.filter(x => x.machine_id === m.id);
    const sum = (ph) => rows.filter(x => x.phase === ph).reduce((s, x) => s + x.a + x.v + x.rw, 0);
    return { machine_id: m.id, name: m.name, axes: m.axes, przygotowanie_min: sum('przygotowanie'), wykonanie_min: sum('wykonanie') };
  });
  const total = (kinds.a || 0) + (kinds.v || 0) + (kinds.rw || 0);
  return { machines, types, phases, causes, kinds: { active_min: kinds.a || 0, verify_min: kinds.v || 0, rework_min: kinds.rw || 0, blocked_min: kinds.bl || 0, unassigned_min: kinds.un || 0, worked_min: total } };
}

function teamAnalysis(db, kind, from, to) {
  const r = range(from, to);
  const base = { from: r.from, to: r.to, kind };
  if (kind === 'programisci') return { ...base, ...programmers(db, r) };
  if (kind === 'detale') return { ...base, ...parts(db, r) };
  if (kind === 'struktura') return { ...base, ...timeStructure(db, r) };
  throw bad('Nieznany rodzaj analizy.');
}

module.exports = { teamAnalysis };
