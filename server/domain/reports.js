'use strict';
// Raporty kierownicze (administrator, przełożony). Każdy raport: definicja wskaźnika, kolumny, wiersze,
// liczebność próbki i kompletność danych. Brak danych ≠ zero (null w danych, „brak danych” w prezentacji).
const T = require('../time');
const { bad } = require('../core');
const C = require('./common');
const X = require('./exits');
const P = require('./projects');

function empName(db) {
  const m = new Map(db.all('SELECT id, first_name, last_name FROM employees').map(e => [e.id, `${e.first_name} ${e.last_name}`]));
  return id => m.get(id) || (id ? `#${id}` : '—');
}

function range(q) {
  const from = q.from || `${T.today().slice(0, 7)}-01`;
  const to = q.to || T.lastDayOfMonth(from.slice(0, 7));
  T.assertDate(from); T.assertDate(to);
  if (to < from) throw bad('Zakres dat odwrotny.');
  return { from, to };
}

function attendance(db, q) {
  const { from, to } = range(q);
  const name = empName(db);
  const rows = db.all('SELECT id FROM employees ORDER BY last_name').map(({ id }) => {
    const planned = db.get('SELECT COALESCE(SUM(planned_min),0) s, COUNT(*) n FROM schedule_entries WHERE employee_id=? AND work_date BETWEEN ? AND ?', id, from, to);
    const abs = db.get(`SELECT COALESCE(SUM(minutes),0) s FROM absences WHERE employee_id=? AND status='wykorzystana' AND start_date>=? AND end_date<=?`, id, from, to).s;
    const exits = db.get(`SELECT COALESCE(SUM(minutes),0) s FROM private_exits WHERE employee_id=? AND status='zarejestrowane' AND work_date BETWEEN ? AND ?`, id, from, to).s;
    const mk = db.get(`SELECT COALESCE(SUM(minutes),0) s FROM makeups WHERE employee_id=? AND status='zatwierdzone' AND work_date BETWEEN ? AND ?`, id, from, to).s;
    const att = db.get(`SELECT COUNT(*) n, COALESCE(SUM(minutes),0) s FROM attendance_records WHERE employee_id=? AND kind='obecnosc' AND work_date BETWEEN ? AND ?`, id, from, to);
    const ot = db.get(`SELECT COUNT(*) n, COALESCE(SUM(minutes),0) s FROM attendance_records WHERE employee_id=? AND kind='nadgodziny' AND work_date BETWEEN ? AND ?`, id, from, to);
    const tasks = db.get(`SELECT COUNT(*) n, COALESCE(SUM(active_min+verify_min+rework_min+blocked_min+unassigned_min),0) s FROM task_time_entries WHERE employee_id=? AND work_date BETWEEN ? AND ?`, id, from, to);
    return {
      employee: name(id), planned_min: planned.s, shifts: planned.n, absences_min: abs, exits_min: exits, makeups_min: mk,
      attendance_min: att.n ? att.s : null, attendance_source: att.n ? 'ewidencja ręczna' : 'brak ewidencji',
      overtime_min: ot.n ? ot.s : null, task_time_min: tasks.n ? tasks.s : null,
    };
  });
  const byCategory = db.all(`SELECT c.name AS category, c.short, COUNT(*) entries, SUM(a.minutes) minutes, SUM(a.days) days FROM absences a
    JOIN absence_categories c ON c.id=a.category_id WHERE a.status='wykorzystana' AND a.start_date >= ? AND a.end_date <= ? GROUP BY c.id ORDER BY minutes DESC`, from, to);
  return {
    title: 'Obecność i kategorie absencji', from, to,
    definition: 'Czas zaplanowany = suma zmian z grafiku. Absencje = wykorzystane nieobecności (minuty wg grafiku). Obecność pokazywana tylko z ewidencji ręcznej — bez ewidencji „brak danych”. Nadgodziny i odrobienie są rozdzielone i nie są wzajemnie przeliczane.',
    columns: [['employee', 'Pracownik'], ['shifts', 'Zmiany'], ['planned_min', 'Zaplanowano', 'min'], ['absences_min', 'Absencje', 'min'], ['exits_min', 'Wyjścia', 'min'],
      ['makeups_min', 'Odrobiono', 'min'], ['attendance_min', 'Obecność', 'min'], ['attendance_source', 'Źródło obecności'], ['overtime_min', 'Nadgodziny', 'min'], ['task_time_min', 'Czas na zadaniach', 'min']],
    rows, chart: { label: 'employee', value: 'planned_min', value2: 'absences_min' },
    extra: { title: 'Absencje według kategorii', columns: [['category', 'Kategoria'], ['entries', 'Wpisy'], ['days', 'Dni'], ['minutes', 'Czas', 'min']], rows: byCategory },
    sample: rows.length, completeness: `${rows.filter(r => r.attendance_min !== null).length}/${rows.length} pracowników z ewidencją obecności`,
  };
}

function exitsReport(db, q) {
  const ym = q.month || T.today().slice(0, 7);
  const rows = X.monthBalances(db, ym).map(b => ({ ...b, month: ym, status: b.remaining_min > 0 ? 'do odrobienia' : (b.exits_min ? 'rozliczone' : '—') }));
  return {
    title: `Wyjścia, odrobienie i saldo — ${ym}`, month: ym, month_status: C.monthStatus(db, ym),
    definition: 'Saldo = minuty zarejestrowanych wyjść − minuty zatwierdzonego odrobienia przypisanego do tych wyjść. Nadwyżka odrabiania nie tworzy kredytu. Rozliczenie w miesiącu kalendarzowym (zasada firmy).',
    columns: [['name', 'Pracownik'], ['exits_count', 'Wyjścia'], ['exits_min', 'Czas wyjść', 'min'], ['settled_min', 'Odrobiono', 'min'], ['remaining_min', 'Saldo', 'min'], ['remaining_shifts', 'Pozostałe zmiany'], ['status', 'Status']],
    rows, chart: { label: 'name', value: 'exits_min', value2: 'settled_min' }, sample: rows.length, completeness: 'pełne (dane z rejestru wyjść)',
  };
}

function coverage(db, q) {
  const { from, to } = range(q);
  const tpls = db.all('SELECT * FROM shift_templates ORDER BY start_time');
  const rows = T.dateRange(from, to).map(d => {
    const r = { date: d, weekday: ['', 'pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'][T.weekday(d)], holiday: db.get('SELECT name FROM holidays WHERE date=?', d)?.name || '' };
    let total = 0, absent = 0;
    for (const t of tpls) {
      const sched = db.all('SELECT employee_id FROM schedule_entries WHERE work_date=? AND shift_template_id=?', d, t.id);
      const present = sched.filter(s => !db.get(`SELECT 1 FROM absences WHERE employee_id=? AND status!='anulowana' AND start_date<=? AND end_date>=? AND start_at IS NULL`, s.employee_id, d, d));
      r[`t${t.id}`] = present.length; total += sched.length; absent += sched.length - present.length;
    }
    r.scheduled = total; r.absent = absent;
    return r;
  });
  return {
    title: 'Pokrycie zmian', from, to,
    definition: 'Liczba osób zaplanowanych na zmianie (wg szablonu) pomniejszona o całodzienne nieobecności. Nieobecności godzinowe nie zmniejszają licznika.',
    columns: [['date', 'Data'], ['weekday', 'Dzień'], ['holiday', 'Święto'], ...tpls.map(t => [`t${t.id}`, `${t.short} ${t.start_time}–${t.end_time}`]), ['scheduled', 'Zaplanowano'], ['absent', 'Nieobecni']],
    rows, chart: { label: 'date', value: 'scheduled', value2: 'absent' }, sample: rows.length, completeness: 'pełne (dane z grafiku)',
  };
}

function workload(db, q) {
  const { from, to } = range(q);
  const name = empName(db);
  const rows = db.all('SELECT id FROM employees WHERE active=1 ORDER BY last_name').map(({ id }) => {
    const open = db.get(`SELECT COUNT(*) n, SUM(planned_min) p, SUM(CASE WHEN planned_min IS NULL THEN 1 ELSE 0 END) np FROM tasks WHERE assignee_id=? AND status IN ('nowe','w_toku','zablokowane')`, id);
    const logged = db.get('SELECT COUNT(*) n, COALESCE(SUM(active_min+verify_min+rework_min),0) s FROM task_time_entries WHERE employee_id=? AND work_date BETWEEN ? AND ?', id, from, to);
    return { employee: name(id), open_tasks: open.n, open_planned_min: open.n ? open.p : null, tasks_without_plan: open.np || 0, logged_min: logged.n ? logged.s : null };
  });
  return {
    title: 'Obciążenie zadaniami', from, to,
    definition: 'Otwarte zadania przypisane do osoby i suma ich planowanego aktywnego czasu; czas zapisany na zadaniach w okresie. Nie jest to ocena osoby.',
    columns: [['employee', 'Pracownik'], ['open_tasks', 'Otwarte zadania'], ['open_planned_min', 'Plan otwartych', 'min'], ['tasks_without_plan', 'Bez planu'], ['logged_min', 'Zapisany czas w okresie', 'min']],
    rows, chart: { label: 'employee', value: 'open_planned_min' }, sample: rows.length,
    completeness: `${rows.reduce((s, r) => s + r.tasks_without_plan, 0)} otwartych zadań bez planu czasu`,
  };
}

function projectProgress(db) {
  const rows = P.listProjects(db, { withTimes: false }).map(p => ({
    project: p.id, order_no: p.order_no, part: `${p.part_no} rev ${p.part_rev}`, machine: p.machine_name || '—', due_date: p.due_date || '—',
    program_pct: p.progress_program.percent, execution_pct: p.progress_execution.percent, blocked: p.blocked ? `tak: ${p.block_reason}` : 'nie', status: p.status,
  }));
  return {
    title: 'Postęp projektów', definition: 'Postęp = suma wag zakończonych (z potwierdzonym rezultatem) zadań / suma wag zadań danego etapu. Brak zadań w etapie = brak danych.',
    columns: [['project', 'Projekt'], ['order_no', 'Zlecenie'], ['part', 'Detal'], ['machine', 'Maszyna'], ['due_date', 'Termin'], ['program_pct', 'Przygotowanie %', 'pct'], ['execution_pct', 'Wykonanie %', 'pct'], ['blocked', 'Blokada'], ['status', 'Status']],
    rows, chart: { label: 'order_no', value: 'program_pct', value2: 'execution_pct', unit: 'pct' }, sample: rows.length, completeness: 'pełne',
  };
}

function timeliness(db, q) {
  const { from, to } = range(q);
  const today = T.today();
  const tasks = db.all(`SELECT t.*, p.order_no FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.status!='anulowane'`);
  const rows = [];
  for (const t of tasks) {
    const done = t.completed_at ? T.utcToLocal(t.completed_at).date : null;
    if (done && (done < from || done > to)) continue;
    if (!done && !(t.due_date && t.due_date <= to)) continue;
    let state;
    if (!t.due_date) state = 'brak terminu';
    else if (done) state = done <= t.due_date ? 'w terminie' : 'po terminie';
    else state = t.due_date < today ? 'zaległe (otwarte)' : 'otwarte';
    rows.push({ task: `#${t.id} ${t.title}`, order_no: t.order_no, due_date: t.due_date || '—', completed: done || '—', state });
  }
  const counts = rows.reduce((m, r) => (m[r.state] = (m[r.state] || 0) + 1, m), {});
  const withDue = rows.filter(r => r.state === 'w terminie' || r.state === 'po terminie').length;
  return {
    title: 'Terminowość zadań', from, to,
    definition: 'Zadanie zakończone w okresie: „w terminie”, gdy data potwierdzenia rezultatu ≤ termin. Zadania bez terminu nie są wliczane do wskaźnika.',
    columns: [['task', 'Zadanie'], ['order_no', 'Zlecenie'], ['due_date', 'Termin'], ['completed', 'Zakończono'], ['state', 'Stan']],
    rows, summary: counts, chart: { label: 'state', value: 'n', rows: Object.entries(counts).map(([state, n]) => ({ state, n })) },
    sample: rows.length, completeness: `${withDue} zakończonych zadań z terminem; ${counts['brak terminu'] || 0} bez terminu`,
  };
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function planVsActual(db, q) {
  const thrPct = C.getSettingInt(db, 'deviation_threshold_pct', 20);
  const thrMin = C.getSettingInt(db, 'deviation_threshold_min', 60);
  const name = empName(db);
  const tasks = db.all(`SELECT t.*, tt.name AS type_name, p.order_no FROM tasks t JOIN task_types tt ON tt.id=t.type_id JOIN projects p ON p.id=t.project_id
    WHERE t.status='zakonczone' ${q.employee_id ? 'AND t.assignee_id=?' : ''}`, ...(q.employee_id ? [Number(q.employee_id)] : []));
  const rows = tasks.map(t => {
    const tm = P.taskTimes(db, t.id);
    const actual = tm.actual_active_min;
    const plan = t.planned_min;
    const dev = plan != null && actual != null ? actual - plan : null;
    const pct = dev != null && plan ? Math.round((dev / plan) * 100) : null;
    const flag = dev != null && dev > thrMin && pct > thrPct ? 'odchylenie wymagające wyjaśnienia' : (dev == null ? 'brak danych' : '—');
    return {
      task_id: t.id, task: `#${t.id} ${t.title}`, order_no: t.order_no, type: t.type_name, family: t.part_family || '—', difficulty: t.difficulty ?? '—',
      assignee: name(t.assignee_id), original_plan_min: t.original_planned_min, plan_min: plan, actual_active_min: actual,
      rework_min: tm.actual_rework_min, blocked_min: tm.actual_blocked_min, deviation_min: dev, deviation_pct: pct, flag,
      explained: tm.explanations.length ? 'tak' : 'nie',
    };
  });
  const complete = rows.filter(r => r.deviation_min !== null);
  const groups = {};
  for (const r of complete) {
    const k = `${r.type} | ${r.family} | trudność ${r.difficulty}`;
    (groups[k] = groups[k] || []).push(r.deviation_pct);
  }
  const trend = Object.entries(groups).map(([group, a]) => ({
    group, n: a.length, median_deviation_pct: median(a.filter(x => x !== null)),
    note: a.length < 3 ? 'próbka zbyt mała do wniosków' : '',
  }));
  return {
    title: 'Plan a wykonanie (czas aktywny)',
    definition: `Odchylenie = rzeczywisty czas aktywnej pracy − obowiązujący plan. „Odchylenie wymagające wyjaśnienia”, gdy przekracza ${thrMin} min i ${thrPct}%. Czas maszyny nie jest czasem programisty. Absencje (L4, urlopy) nie wpływają na wskaźnik. Raport służy do wyjaśniania przyczyn, nie do oceny osoby.`,
    columns: [['task', 'Zadanie'], ['order_no', 'Zlecenie'], ['type', 'Typ'], ['family', 'Rodzina'], ['difficulty', 'Trudność'], ['assignee', 'Osoba'],
      ['original_plan_min', 'Plan pierwotny', 'min'], ['plan_min', 'Plan obowiązujący', 'min'], ['actual_active_min', 'Rzeczywisty aktywny', 'min'],
      ['deviation_min', 'Odchylenie', 'min'], ['deviation_pct', 'Odchylenie %', 'pct'], ['rework_min', 'Poprawki', 'min'], ['blocked_min', 'Blokady', 'min'], ['flag', 'Ocena'], ['explained', 'Wyjaśnienie']],
    rows, chart: { label: 'task', value: 'plan_min', value2: 'actual_active_min' },
    extra: { title: 'Trendy dla porównywalnych zadań', columns: [['group', 'Grupa (typ | rodzina | trudność)'], ['n', 'Liczebność'], ['median_deviation_pct', 'Mediana odchylenia %', 'pct'], ['note', 'Uwagi']], rows: trend },
    sample: rows.length, completeness: `${complete.length}/${rows.length} zakończonych zadań ma plan i zapisany czas`,
  };
}

function blocksRework(db, q) {
  const { from, to } = range(q);
  const rows = db.all(`SELECT COALESCE(cause,'(bez przyczyny)') cause, COUNT(*) entries, SUM(rework_min) rework_min, SUM(blocked_min) blocked_min
     FROM task_time_entries WHERE work_date BETWEEN ? AND ? AND (rework_min>0 OR blocked_min>0) GROUP BY cause ORDER BY SUM(rework_min+blocked_min) DESC`, from, to);
  const label = { brak_dokumentacji: 'brak dokumentacji', zmiana_zakresu: 'zmiana zakresu', narzedzia: 'narzędzia', maszyna: 'maszyna', decyzja_zewnetrzna: 'decyzja zewnętrzna', blad_programowania: 'błąd programowania', inne: 'inne' };
  return {
    title: 'Blokady i poprawki według przyczyn', from, to,
    definition: 'Suma minut poprawek i blokad/oczekiwania z wpisów czasu zadań, pogrupowana według przyczyny wskazanej przez administratora.',
    columns: [['cause', 'Przyczyna'], ['entries', 'Wpisy'], ['rework_min', 'Poprawki', 'min'], ['blocked_min', 'Blokady i oczekiwanie', 'min']],
    rows: rows.map(r => ({ ...r, cause: label[r.cause] || r.cause })), chart: { label: 'cause', value: 'rework_min', value2: 'blocked_min' },
    sample: rows.reduce((s, r) => s + r.entries, 0), completeness: 'tylko wpisy z czasem poprawek lub blokad',
  };
}

const REPORTS = {
  obecnosc: { fn: attendance, cap: 'view.reports' },
  wyjscia: { fn: exitsReport, cap: 'view.reports' },
  pokrycie: { fn: coverage, cap: 'view.reports' },
  obciazenie: { fn: workload, cap: 'view.reports' },
  postep: { fn: projectProgress, cap: 'view.reports' },
  terminowosc: { fn: timeliness, cap: 'view.efficiency' },
  plan_wykonanie: { fn: planVsActual, cap: 'view.efficiency' },
  blokady: { fn: blocksRework, cap: 'view.efficiency' },
};

// CSV: separator ';', BOM UTF-8 (Excel PL), ochrona przed wstrzyknięciem formuł.
function toCsv(report) {
  const esc = (v) => {
    if (v === null || v === undefined) return 'brak danych';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [report.columns.map(c => esc(c[1] + (c[2] === 'min' ? ' [min]' : c[2] === 'pct' ? ' [%]' : ''))).join(';')];
  for (const r of report.rows) lines.push(report.columns.map(c => esc(r[c[0]])).join(';'));
  return '﻿' + `# ${report.title}\r\n# Definicja: ${report.definition}\r\n` + lines.join('\r\n') + '\r\n';
}

module.exports = { REPORTS, toCsv, median };
