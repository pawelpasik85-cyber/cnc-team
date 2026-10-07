'use strict';
// Analityka kierownika: przebieg zakończonego projektu, porównanie z podobnymi projektami (z odrzucaniem propozycji),
// zestawienia miesięczne i roczne z porównaniem do lat poprzednich, zapisane raporty (migawki).
// Czas pracy = aktywna praca + weryfikacja/uruchomienie + poprawki (bez blokad i czasu nieprzypisanego) — jak w godzinach projektu.
const T = require('../time');
const { bad, notFound, audit, reqStr, oneOf } = require('../core');
const P = require('./projects');

const WORK = 'e.active_min + e.verify_min + e.rework_min';
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);
const localDate = (iso) => (iso ? T.utcToLocal(iso).date : null);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

// ---------- Projekt: przebieg ----------
function projectMetrics(db, id) {
  const p = db.get(`SELECT p.*, m.name AS machine_name, m.axes FROM projects p LEFT JOIN machines m ON m.id = p.machine_id WHERE p.id = ?`, id);
  if (!p) throw notFound('Nie znaleziono projektu.');
  const tasks = db.all(`SELECT t.*, tt.code AS type_code, tt.name AS type_name FROM tasks t JOIN task_types tt ON tt.id = t.type_id WHERE t.project_id = ? ORDER BY t.id`, id);
  const hours = P.projectHours(db, id, tasks);
  const agg = db.get(`SELECT MIN(e.work_date) first, MAX(e.work_date) last, SUM(e.rework_min) rw, SUM(e.blocked_min) bl
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ?`, id);
  const live = tasks.filter(t => t.status !== 'anulowane');
  const doneDates = live.filter(t => t.status === 'zakonczone' && t.completed_at).map(t => localDate(t.completed_at)).sort();
  const start = [p.start_date || agg.first || localDate(p.created_at), doneDates[0]].filter(Boolean).sort()[0];
  const allDone = live.length > 0 && live.every(t => t.status === 'zakonczone');
  const finish = allDone ? [doneDates[doneDates.length - 1], agg.last].filter(Boolean).sort().pop() : null;
  return {
    id: p.id, order_no: p.order_no, part_no: p.part_no, part_rev: p.part_rev, part_family: p.part_family, status: p.status,
    machine_id: p.machine_id, machine_name: p.machine_name, axes: p.axes, start_date: start, due_date: p.due_date, finish_date: finish,
    duration_days: finish ? dayDiff(start, finish) + 1 : null,
    due_delta_days: finish && p.due_date ? dayDiff(p.due_date, finish) : null,
    worked_min: hours.worked_min, planned_min: hours.planned_min,
    diff_min: hours.planned_min ? hours.worked_min - hours.planned_min : null,
    diff_pct: hours.planned_min ? Math.round(((hours.worked_min - hours.planned_min) / hours.planned_min) * 100) : null,
    rework_min: agg.rw || 0, blocked_min: agg.bl || 0, rework_share_pct: hours.worked_min ? pct(agg.rw || 0, hours.worked_min) : null,
    overtime_work_min: hours.overtime_work_min, overtime_share_pct: hours.overtime_share_pct,
    tasks: live.length, type_codes: [...new Set(live.map(t => t.type_code))].sort(), hours, tasks_rows: tasks,
  };
}

function projectProcess(db, id) {
  const m = projectMetrics(db, id);
  const daily = db.all(`SELECT e.work_date d, SUM(${WORK}) w, SUM(e.rework_min) rw, SUM(e.blocked_min) bl
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ? GROUP BY e.work_date ORDER BY e.work_date`, id);
  const live = m.tasks_rows.filter(t => t.status !== 'anulowane');
  const totalWeight = live.reduce((s, t) => s + t.weight, 0);
  const completions = live.filter(t => t.status === 'zakonczone' && t.completed_at)
    .map(t => ({ date: localDate(t.completed_at), title: t.title, weight: t.weight })).sort((a, b) => a.date.localeCompare(b.date));
  const last = [m.finish_date, daily.length ? daily[daily.length - 1].d : null, completions.length ? completions[completions.length - 1].date : null, T.today()]
    .filter(Boolean).filter(d => m.finish_date ? d <= m.finish_date : true).sort().pop();
  // zakres: od najwcześniejszego z (start, pierwszy wpis czasu, pierwsze zakończenie) do zakończenia projektu
  const from = [m.start_date, daily.length ? daily[0].d : null, completions.length ? completions[0].date : null].filter(Boolean).sort()[0];
  const to = [m.finish_date || last, from].filter(Boolean).sort().pop();
  const total = dayDiff(from, to) + 1;
  // długie projekty: punkt co tydzień (ostatni dzień zawsze), żeby wykres kończył się na pełnej sumie
  const stepDays = total > 400 ? 7 : 1;
  const byDay = new Map(daily.map(r => [r.d, r]));
  const series = [];
  let cum = 0, doneW = 0, ci = 0, di = 0;
  // plan liniowy: dzień rozpoczęcia = 1/(n+1)… dzień terminu = 100% (oba końce liczone, jak czas trwania)
  const span = m.due_date && m.start_date ? Math.max(0, dayDiff(m.start_date, m.due_date)) : null;
  const dates = [];
  for (let i = 0; i < total; i += stepDays) dates.push(T.addDays(from, i));
  if (dates[dates.length - 1] !== to) dates.push(to);
  for (const d of dates) {
    while (di < daily.length && daily[di].d <= d) { cum += daily[di].w; di++; }
    while (ci < completions.length && completions[ci].date <= d) { doneW += completions[ci].weight; ci++; }
    const r = byDay.get(d);
    const planFrac = span === null ? null : d < m.start_date ? 0 : Math.min(1, (dayDiff(m.start_date, d) + 1) / (span + 1));
    series.push({ date: d, worked_min: r ? r.w : 0, cum_min: cum, progress_pct: totalWeight ? Math.round((doneW / totalWeight) * 100) : null,
      plan_cum_min: m.planned_min && planFrac !== null ? Math.round(m.planned_min * planFrac) : null, plan_progress_pct: planFrac !== null ? Math.round(planFrac * 100) : null });
  }
  const worked = new Map(db.all(`SELECT e.task_id, SUM(${WORK}) w FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ? GROUP BY e.task_id`, id).map(r => [r.task_id, r.w]));
  const tasks = live.map(t => ({ id: t.id, title: t.title, type: t.type_name, phase: t.phase, status: t.status, planned_min: t.planned_min, worked_min: worked.get(t.id) || 0,
    completed_date: localDate(t.completed_at), diff_min: t.planned_min != null ? (worked.get(t.id) || 0) - t.planned_min : null }));
  const { tasks_rows, ...summary } = m;
  return { summary, series, completions, tasks, complete: !!m.finish_date, step_days: stepDays };
}

// ---------- Projekt: podobne zakończone projekty ----------
function similarityScore(a, b) {
  let score = 0; const why = [];
  if (a.part_family && b.part_family && a.part_family === b.part_family) { score += 3; why.push(`ta sama rodzina detali (${a.part_family})`); }
  if (a.machine_id && a.machine_id === b.machine_id) { score += 2; why.push(`ta sama maszyna (${b.machine_name})`); }
  const A = new Set(a.type_codes), B = new Set(b.type_codes);
  const inter = [...A].filter(x => B.has(x)).length, union = new Set([...A, ...B]).size;
  const j = union ? inter / union : 0;
  if (j > 0) { score += Math.round(j * 30) / 10; why.push(`wspólne typy zadań ${inter}/${union}`); }
  if (a.planned_min && b.planned_min) {
    const r = a.planned_min / b.planned_min;
    if (r >= 0.5 && r <= 2) { score += 1; why.push('podobna skala planu'); }
  }
  return { score: Math.round(score * 10) / 10, why };
}

function similarProjects(db, id, { limit = 6 } = {}) {
  const base = projectMetrics(db, id);
  const rejected = new Map(db.all(`SELECT r.*, u.display_name FROM project_comparison_rejections r LEFT JOIN users u ON u.id = r.rejected_by WHERE r.project_id = ?`, id).map(r => [r.other_project_id, r]));
  const strip = ({ tasks_rows, hours, ...x }) => x;
  const candidates = db.all(`SELECT id FROM projects WHERE status = 'zakonczony' AND id != ?`, id).map(r => projectMetrics(db, r.id))
    .map(m => ({ ...strip(m), ...similarityScore(base, m) })).filter(m => m.score >= 2).sort((a, b) => b.score - a.score);
  const accepted = candidates.filter(c => !rejected.has(c.id)).slice(0, limit);
  const rej = candidates.filter(c => rejected.has(c.id)).map(c => ({ ...c, rejected: { reason: rejected.get(c.id).reason, by: rejected.get(c.id).display_name, at: rejected.get(c.id).rejected_at } }));
  const avg = (k) => { const v = accepted.map(c => c[k]).filter(x => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null; };
  return {
    base: strip(base), similar: accepted, rejected: rej,
    average: accepted.length ? { count: accepted.length, worked_min: avg('worked_min'), planned_min: avg('planned_min'), diff_pct: avg('diff_pct'), duration_days: avg('duration_days'), due_delta_days: avg('due_delta_days'), rework_share_pct: avg('rework_share_pct') } : null,
    rule: 'Podobne = zakończone projekty z wynikiem podobieństwa ≥ 2: rodzina detali (3 pkt), maszyna (2 pkt), wspólne typy zadań (do 3 pkt), skala planu 0,5–2× (1 pkt). Odrzucone propozycje nie wchodzą do średniej.',
  };
}

function rejectSimilar(db, user, id, otherId, body) {
  if (!db.get('SELECT 1 FROM projects WHERE id = ?', id) || !db.get('SELECT 1 FROM projects WHERE id = ?', otherId)) throw notFound('Nie znaleziono projektu.');
  if (id === otherId) throw bad('Projekt nie może być porównywany sam ze sobą.');
  const reason = reqStr(body.reason, 'Powód odrzucenia', { optional: true, max: 300 });
  db.tx(() => {
    db.run(`INSERT INTO project_comparison_rejections(project_id, other_project_id, reason, rejected_by, rejected_at) VALUES (?,?,?,?,?)
      ON CONFLICT(project_id, other_project_id) DO UPDATE SET reason=excluded.reason, rejected_by=excluded.rejected_by, rejected_at=excluded.rejected_at`, id, otherId, reason, user.id, T.nowIso());
    audit(db, user, 'project_comparison', `${id}/${otherId}`, 'odrzucenie_propozycji', null, { other_project_id: otherId }, reason || 'odrzucona propozycja porównania');
  });
}
function restoreSimilar(db, user, id, otherId) {
  const r = db.get('SELECT * FROM project_comparison_rejections WHERE project_id = ? AND other_project_id = ?', id, otherId);
  if (!r) throw notFound('Ta propozycja nie była odrzucona.');
  db.tx(() => {
    db.run('DELETE FROM project_comparison_rejections WHERE project_id = ? AND other_project_id = ?', id, otherId);
    audit(db, user, 'project_comparison', `${id}/${otherId}`, 'przywrocenie_propozycji', { reason: r.reason }, null, 'przywrócona propozycja porównania');
  });
}

// ---------- Miesiąc ----------
function monthRange(ym) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || '')) throw bad('Miesiąc w formacie RRRR-MM.');
  return { from: `${ym}-01`, to: T.lastDayOfMonth(ym) };
}
const shiftYear = (ym, n) => `${Number(ym.slice(0, 4)) + n}${ym.slice(4)}`;

// toDay: liczba dni od początku miesiąca (porównanie „do tego samego dnia” dla bieżącego miesiąca)
function monthStats(db, ym, { toDay } = {}) {
  const r0 = monthRange(ym);
  const from = r0.from;
  const to = toDay ? [`${ym}-${String(toDay).padStart(2, '0')}`, r0.to].sort()[0] : r0.to;
  const fromUtc = T.localToUtc(from, '00:00'), toUtc = T.localToUtc(T.addDays(to, 1), '00:00');
  const w = db.get(`SELECT COUNT(*) n, SUM(e.active_min) a, SUM(e.verify_min) v, SUM(e.rework_min) rw, SUM(e.blocked_min) bl, SUM(e.unassigned_min) un
    FROM task_time_entries e WHERE e.work_date BETWEEN ? AND ?`, from, to);
  const work = { entries: w.n, worked_min: (w.a || 0) + (w.v || 0) + (w.rw || 0), active_min: w.a || 0, verify_min: w.v || 0, rework_min: w.rw || 0, blocked_min: w.bl || 0, unassigned_min: w.un || 0 };
  work.rework_share_pct = pct(work.rework_min, work.worked_min);
  const byMachine = db.all(`SELECT COALESCE(p.machine_id, '-') machine_id, m.name machine_name, m.axes, SUM(${WORK}) worked_min
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id JOIN projects p ON p.id = t.project_id LEFT JOIN machines m ON m.id = p.machine_id
    WHERE e.work_date BETWEEN ? AND ? GROUP BY p.machine_id ORDER BY m.sort`, from, to);
  const byEmployee = db.all(`SELECT e.employee_id, emp.first_name || ' ' || emp.last_name name, SUM(${WORK}) worked_min, SUM(e.rework_min) rework_min
    FROM task_time_entries e JOIN employees emp ON emp.id = e.employee_id WHERE e.work_date BETWEEN ? AND ? GROUP BY e.employee_id ORDER BY name`, from, to);
  // zadania zakończone w miesiącu: plan vs rzeczywisty czas (cały czas zadania)
  const done = db.all(`SELECT t.id, t.planned_min, (SELECT SUM(${WORK}) FROM task_time_entries e WHERE e.task_id = t.id) w
    FROM tasks t WHERE t.status = 'zakonczone' AND t.completed_at >= ? AND t.completed_at < ?`, fromUtc, toUtc);
  const withPlan = done.filter(t => t.planned_min != null);
  const dp = withPlan.reduce((s, t) => s + t.planned_min, 0), dw = withPlan.reduce((s, t) => s + (t.w || 0), 0);
  const tasks = { done: done.length, with_plan: withPlan.length, planned_min: dp, worked_min: dw, diff_min: dw - dp, diff_pct: dp ? Math.round(((dw - dp) / dp) * 100) : null };
  // projekty zakończone w miesiącu = ostatnie zakończenie zadania w miesiącu
  const projects = db.all(`SELECT p.id, p.order_no, p.part_no, MAX(t.completed_at) last FROM projects p JOIN tasks t ON t.project_id = p.id
    WHERE p.status = 'zakonczony' AND t.status = 'zakonczone' GROUP BY p.id HAVING last >= ? AND last < ?`, fromUtc, toUtc)
    .map(r => ({ id: r.id, order_no: r.order_no, part_no: r.part_no }));
  // nieobecności (minuty wg grafiku, proporcjonalnie do dni w miesiącu przy wpisach na przełomie miesięcy)
  const abs = db.all(`SELECT a.start_date, a.end_date, a.minutes, c.code, c.pool_kind FROM absences a JOIN absence_categories c ON c.id = a.category_id
    WHERE a.status != 'anulowana' AND a.end_date >= ? AND a.start_date <= ?`, from, to);
  const absence = { urlop_min: 0, l4_min: 0, inne_min: 0, total_min: 0 };
  // podział wpisu na przełomie miesięcy proporcjonalnie do dni roboczych (pn–pt)
  const workdays = (a, b) => { let n = 0; for (let d = a; d <= b; d = T.addDays(d, 1)) { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w !== 0 && w !== 6) n++; } return n; };
  for (const a of abs) {
    const total = workdays(a.start_date, a.end_date);
    const inside = workdays(a.start_date < from ? from : a.start_date, a.end_date > to ? to : a.end_date);
    const m = total ? Math.round((a.minutes * inside) / total) : (a.start_date >= from && a.start_date <= to ? a.minutes : 0);
    const key = a.pool_kind === 'wypoczynkowy' ? 'urlop_min' : a.code === 'L4' ? 'l4_min' : 'inne_min';
    absence[key] += m; absence.total_min += m;
  }
  const ex = db.get(`SELECT COUNT(*) n, SUM(minutes) m FROM private_exits WHERE status = 'zarejestrowane' AND settlement_month = ?`, ym);
  const mk = db.get(`SELECT SUM(minutes) m FROM makeups WHERE status = 'zatwierdzone' AND settlement_month = ?`, ym);
  // ręczne wpisy nadgodzin w ewidencji — bez tych, które pokrywają się ze zmianą z nadgodzinami w grafiku (inaczej liczone byłyby dwa razy)
  const ot = db.get(`SELECT SUM(a.minutes) m FROM attendance_records a WHERE a.kind = 'nadgodziny' AND a.work_date BETWEEN ? AND ?
    AND NOT EXISTS (SELECT 1 FROM schedule_entries s WHERE s.employee_id = a.employee_id AND s.overtime_min > 0 AND s.start_at < a.end_at AND s.end_at > a.start_at)`, from, to);
  // nadgodziny z grafiku: dni dodatkowe i zmiany wydłużone / nieregularne
  const so = db.get(`SELECT SUM(CASE WHEN mode = 'dodatkowa' THEN 1 ELSE 0 END) extra, SUM(CASE WHEN mode IN ('wydluzona','nieregularna') AND overtime_min > 0 THEN 1 ELSE 0 END) ext,
    COALESCE(SUM(overtime_min), 0) m FROM schedule_entries WHERE work_date BETWEEN ? AND ?`, from, to);
  const otw = P.overtimeWork(db, { from, to });
  const otWork = otw.reduce((s, r) => s + r.overtime_work_min, 0);
  const projNames = new Map(db.all('SELECT id, order_no, part_no FROM projects').map(p => [p.id, p]));
  const overtime = {
    extra_days: so.extra || 0, extended_shifts: so.ext || 0, schedule_min: so.m, records_min: ot.m || 0,
    work_min: otWork, work_share_pct: pct(otWork, work.worked_min),
    by_project: otw.filter(r => r.overtime_work_min > 0).sort((a, b) => b.overtime_work_min - a.overtime_work_min)
      .map(r => ({ ...r, order_no: (projNames.get(r.project_id) || {}).order_no, part_no: (projNames.get(r.project_id) || {}).part_no })),
  };
  const rq = db.all(`SELECT kind, COUNT(*) n FROM requests WHERE created_at >= ? AND created_at < ? GROUP BY kind`, fromUtc, toUtc);
  return {
    year_month: ym, from, to, work, by_machine: byMachine, by_employee: byEmployee, tasks, projects_done: projects,
    absence, exits: { count: ex.n, minutes: ex.m || 0, made_up_min: mk.m || 0 }, overtime_min: so.m + (ot.m || 0), overtime,
    requests: Object.fromEntries(rq.map(r => [r.kind, r.n])), has_data: !!(w.n || abs.length || ex.n),
  };
}

// Kluczowe wskaźniki do porównań (ta sama lista dla miesiąca i roku)
const KPI = [
  ['worked_min', 'Przepracowane godziny (projekty)', 'min', s => s.work.worked_min],
  ['rework_min', 'Poprawki', 'min', s => s.work.rework_min],
  ['blocked_min', 'Blokady i oczekiwanie', 'min', s => s.work.blocked_min],
  ['tasks_done', 'Zakończone zadania', 'szt', s => s.tasks.done],
  ['projects_done', 'Zakończone projekty', 'szt', s => s.projects_done.length],
  ['tasks_diff_pct', 'Odchylenie od planu (zakończone zadania)', '%', s => s.tasks.diff_pct],
  ['absence_min', 'Nieobecności', 'min', s => s.absence.total_min],
  ['exits_min', 'Wyjścia prywatne', 'min', s => s.exits.minutes],
  ['overtime_min', 'Nadgodziny (grafik i ewidencja)', 'min', s => s.overtime_min],
  ['extra_days', 'Dni dodatkowe (zmiany)', 'szt', s => s.overtime.extra_days],
  ['overtime_work_min', 'Praca na projektach w nadgodzinach', 'min', s => s.overtime.work_min],
  ['overtime_share_pct', 'Udział nadgodzin w pracy na projektach', 'udzial', s => s.overtime.work_share_pct],
];
function kpis(s) { return Object.fromEntries(KPI.map(([k, , , f]) => [k, f(s)])); }
function deltas(cur, prev) {
  return Object.fromEntries(KPI.map(([k]) => {
    const a = cur[k], b = prev[k];
    if (a === null || a === undefined || b === null || b === undefined) return [k, { diff: null, pct: null }];
    return [k, { diff: Math.round((a - b) * 10) / 10, pct: b ? Math.round(((a - b) / Math.abs(b)) * 100) : null }];
  }));
}

function monthCompare(db, ym) {
  monthRange(ym);
  const today = T.today();
  if (ym > today.slice(0, 7)) throw bad('Ten miesiąc jeszcze się nie zaczął.');
  // bieżący miesiąc porównywany z tym samym okresem (1…dziś) rok wcześniej — nie z pełnym miesiącem
  const toDay = ym === today.slice(0, 7) ? Number(today.slice(8, 10)) : undefined;
  const cur = monthStats(db, ym, { toDay }), prev = monthStats(db, shiftYear(ym, -1), { toDay });
  const kc = kpis(cur), kp = kpis(prev);
  return { current: cur, previous: prev, partial: toDay ? { until_day: toDay } : null, kpi: KPI.map(([k, label, unit]) => ({ key: k, label, unit })), current_kpi: kc, previous_kpi: kp, delta: deltas(kc, kp) };
}

// ---------- Rok ----------
// untilMd: „MM-DD” — sumy od 1 stycznia do tego dnia (porównanie bieżącego roku z tym samym okresem lat poprzednich)
function yearStats(db, year, { untilMd } = {}) {
  if (!/^\d{4}$/.test(String(year))) throw bad('Rok w formacie RRRR.');
  const nowYm = T.today().slice(0, 7);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    // miesiące przyszłe: brak danych (null), nie zero
    if (ym > nowYm) { months.push({ year_month: ym, future: true, ...Object.fromEntries(KPI.map(([k]) => [k, null])) }); continue; }
    months.push({ year_month: ym, ...kpis(monthStats(db, ym)) });
  }
  const lastMonth = untilMd ? Number(untilMd.slice(0, 2)) : 12;
  const lastDay = untilMd ? Number(untilMd.slice(3, 5)) : undefined;
  const parts = [];
  for (let m = 1; m <= lastMonth; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    if (ym > nowYm) break;
    parts.push(m === lastMonth && lastDay ? kpis(monthStats(db, ym, { toDay: lastDay })) : months[m - 1]);
  }
  let totals = null;
  if (parts.length) {
    totals = {};
    for (const [k] of KPI) if (k !== 'tasks_diff_pct' && k !== 'overtime_share_pct') totals[k] = parts.reduce((s, x) => s + (x[k] || 0), 0);
    totals.overtime_share_pct = pct(totals.overtime_work_min, totals.worked_min);
    // odchylenie liczone z sum zakończonych zadań w okresie, nie średnia procentów
    const from = `${year}-01-01`;
    const to = untilMd ? [`${year}-${untilMd}`, T.lastDayOfMonth(`${year}-${untilMd.slice(0, 2)}`)].sort()[0] : `${year}-12-31`;
    const done = db.all(`SELECT t.planned_min, (SELECT SUM(${WORK}) FROM task_time_entries e WHERE e.task_id = t.id) w FROM tasks t
      WHERE t.status = 'zakonczone' AND t.planned_min IS NOT NULL AND t.completed_at >= ? AND t.completed_at < ?`, T.localToUtc(from, '00:00'), T.localToUtc(T.addDays(to, 1), '00:00'));
    const dp = done.reduce((s, t) => s + t.planned_min, 0), dw = done.reduce((s, t) => s + (t.w || 0), 0);
    totals.tasks_diff_pct = dp ? Math.round(((dw - dp) / dp) * 100) : null;
  }
  return { year: Number(year), months, totals };
}

function cleanYears(list, base) {
  return [...new Set((Array.isArray(list) ? list : String(list || '').split(',')).map(String).filter(y => /^\d{4}$/.test(y) && y !== String(base)))].slice(0, 4).map(Number);
}

function availableYears(db) {
  const ys = new Set([Number(T.today().slice(0, 4))]);
  for (const r of db.all(`SELECT DISTINCT substr(work_date,1,4) y FROM task_time_entries UNION SELECT DISTINCT substr(start_date,1,4) FROM absences
    UNION SELECT DISTINCT substr(settlement_month,1,4) FROM private_exits`)) if (r.y) ys.add(Number(r.y));
  return [...ys].sort((a, b) => b - a);
}

function yearCompare(db, year, compare = []) {
  if (!/^\d{4}$/.test(String(year))) throw bad('Rok w formacie RRRR.');
  const years = [Number(year), ...cleanYears(compare, year)];
  const today = T.today();
  // bieżący rok: sumy wszystkich lat od 1 stycznia do dzisiejszego dnia (ten sam okres)
  const untilMd = Number(year) === Number(today.slice(0, 4)) ? today.slice(5, 10) : undefined;
  const data = years.map(y => yearStats(db, y, { untilMd }));
  const base = data[0].totals || {};
  return { kpi: KPI.map(([k, label, unit]) => ({ key: k, label, unit })), years: data, period: untilMd ? { ytd: true, until: untilMd } : null,
    delta_vs: data.slice(1).map(d => ({ year: d.year, delta: deltas(base, d.totals || {}) })), available: availableYears(db) };
}

// ---------- Zapisane raporty ----------
const KIND_TITLE = { projekt: 'Przebieg projektu', miesiac: 'Miesiąc', rok: 'Rok' };
function buildReportData(db, kind, ref, body = {}) {
  if (kind === 'projekt') return { process: projectProcess(db, ref), similar: similarProjects(db, ref) };
  if (kind === 'miesiac') return monthCompare(db, ref);
  if (kind === 'rok') return yearCompare(db, ref, cleanYears(body.compare, ref));
  throw bad('Nieznany rodzaj raportu.');
}
function saveReport(db, user, body) {
  const kind = oneOf(body.kind, 'Rodzaj', ['projekt', 'miesiac', 'rok']);
  const ref = reqStr(body.ref, 'Zakres', { max: 64 });
  const data = buildReportData(db, kind, ref, body);
  const title = reqStr(body.title, 'Tytuł', { optional: true, max: 160 }) || `${KIND_TITLE[kind]} ${ref}`;
  const note = reqStr(body.note, 'Komentarz', { optional: true, max: 4000 });
  return db.tx(() => {
    const now = T.nowIso();
    const r = db.run(`INSERT INTO saved_reports(kind, ref, title, note, data, shared, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      kind, ref, title, note, JSON.stringify({ ...data, params: { compare: kind === 'rok' ? cleanYears(body.compare, ref) : [] } }), body.shared ? 1 : 0, user.id, now, now);
    const id = Number(r.lastInsertRowid);
    audit(db, user, 'saved_report', id, 'utworzenie', null, { kind, ref, title, shared: !!body.shared }, note);
    return { id };
  });
}
function listReports(db, user) {
  const onlyShared = user.role !== 'admin';
  return db.all(`SELECT r.id, r.kind, r.ref, r.title, r.note, r.shared, r.created_at, u.display_name author FROM saved_reports r LEFT JOIN users u ON u.id = r.created_by
    WHERE (? = 0 OR r.shared = 1) ORDER BY r.created_at DESC`, onlyShared ? 1 : 0);
}
function getReport(db, user, id) {
  const r = db.get(`SELECT r.*, u.display_name author FROM saved_reports r LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`, id);
  if (!r || (user.role !== 'admin' && !r.shared)) throw notFound('Nie znaleziono raportu.');
  return { ...r, data: JSON.parse(r.data) };
}
function updateReport(db, user, id, body) {
  const r = db.get('SELECT * FROM saved_reports WHERE id = ?', id);
  if (!r) throw notFound('Nie znaleziono raportu.');
  const upd = {
    title: body.title !== undefined ? reqStr(body.title, 'Tytuł', { max: 160 }) : r.title,
    note: body.note !== undefined ? reqStr(body.note, 'Komentarz', { optional: true, max: 4000 }) : r.note,
    shared: body.shared !== undefined ? (body.shared ? 1 : 0) : r.shared,
  };
  db.tx(() => {
    db.run('UPDATE saved_reports SET title=?, note=?, shared=?, updated_at=? WHERE id=?', upd.title, upd.note, upd.shared, T.nowIso(), id);
    audit(db, user, 'saved_report', id, upd.shared !== r.shared ? (upd.shared ? 'udostepnienie' : 'cofniecie_udostepnienia') : 'edycja',
      { title: r.title, note: r.note, shared: r.shared }, upd, reqStr(body.reason, 'Powód', { optional: true, max: 500 }));
  });
  return { id };
}
function deleteReport(db, user, id) {
  const r = db.get('SELECT id, kind, ref, title, shared FROM saved_reports WHERE id = ?', id);
  if (!r) throw notFound('Nie znaleziono raportu.');
  db.tx(() => { db.run('DELETE FROM saved_reports WHERE id = ?', id); audit(db, user, 'saved_report', id, 'usunięcie', r, null, 'usunięty przez kierownika'); });
}

module.exports = {
  projectMetrics, projectProcess, similarProjects, rejectSimilar, restoreSimilar, similarityScore,
  monthStats, monthCompare, yearStats, yearCompare, availableYears, KPI,
  saveReport, listReports, getReport, updateReport, deleteReport,
};
