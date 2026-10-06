'use strict';
// Projekty, zadania, postęp, czas ludzi, tablica maszyn, przekazanie zmiany, dane technologiczne.
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, reqInt, oneOf } = require('../core');
const C = require('./common');

const CAUSES = ['brak_dokumentacji', 'zmiana_zakresu', 'narzedzia', 'maszyna', 'decyzja_zewnetrzna', 'blad_programowania', 'inne'];
const ID_RE = /^[A-Za-z0-9._\-\/]{1,64}$/;

function nextProjectId(db) {
  const y = T.today().slice(0, 4);
  const r = db.get(`SELECT id FROM projects WHERE id LIKE ? ORDER BY id DESC LIMIT 1`, `PRJ-${y}-%`);
  const n = r ? parseInt(r.id.split('-')[2], 10) + 1 : 1;
  return `PRJ-${y}-${String(n).padStart(4, '0')}`;
}

function saveMachine(db, user, body, id) {
  const d = {
    name: reqStr(body.name, 'Nazwa', { max: 60 }), axes: reqInt(body.axes, 'Osie', { min: 3, max: 9 }),
    control: reqStr(body.control, 'Sterowanie', { max: 60 }), model: reqStr(body.model, 'Model', { optional: true, max: 80 }),
    notes: reqStr(body.notes, 'Uwagi', { optional: true }), sort: reqInt(body.sort ?? 0, 'Kolejność'), active: body.active === false ? 0 : 1,
  };
  return db.tx(() => {
    if (id) {
      const old = db.get('SELECT * FROM machines WHERE id=?', id);
      if (!old) throw notFound();
      db.run('UPDATE machines SET name=?,axes=?,control=?,model=?,notes=?,sort=?,active=? WHERE id=?', d.name, d.axes, d.control, d.model, d.notes, d.sort, d.active, id);
      audit(db, user, 'machine', id, 'edycja', old, d);
      return id;
    }
    const newId = reqStr(body.id, 'Identyfikator', { max: 40 });
    if (!ID_RE.test(newId)) throw bad('Identyfikator maszyny: litery, cyfry, . _ - /');
    db.run('INSERT INTO machines(id,name,axes,control,model,notes,sort,active) VALUES (?,?,?,?,?,?,?,?)', newId, d.name, d.axes, d.control, d.model, d.notes, d.sort, d.active);
    db.run('INSERT OR IGNORE INTO machine_board(machine_id) VALUES (?)', newId);
    audit(db, user, 'machine', newId, 'utworzenie', null, d);
    return newId;
  });
}

function saveTaskType(db, user, body, id) {
  const d = {
    code: reqStr(body.code, 'Kod', { max: 40 }), name: reqStr(body.name, 'Nazwa', { max: 80 }),
    phase: oneOf(body.phase, 'Etap', ['przygotowanie', 'wykonanie']), default_weight: reqInt(body.default_weight ?? 1, 'Waga', { min: 1, max: 100 }),
    active: body.active === false ? 0 : 1, sort: reqInt(body.sort ?? 100, 'Kolejność'),
  };
  return db.tx(() => {
    if (id) {
      const old = db.get('SELECT * FROM task_types WHERE id=?', id);
      if (!old) throw notFound();
      db.run('UPDATE task_types SET code=?,name=?,phase=?,default_weight=?,active=?,sort=? WHERE id=?', d.code, d.name, d.phase, d.default_weight, d.active, d.sort, id);
      audit(db, user, 'task_type', id, 'edycja', old, d);
      return id;
    }
    if (db.get('SELECT 1 FROM task_types WHERE code=?', d.code)) throw conflict('Kod typu jest zajęty.');
    const r = db.run('INSERT INTO task_types(code,name,phase,default_weight,active,sort) VALUES (?,?,?,?,?,?)', d.code, d.name, d.phase, d.default_weight, d.active, d.sort);
    audit(db, user, 'task_type', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

// ---------- Projekty ----------
function saveProject(db, user, body, id) {
  const d = {
    order_no: reqStr(body.order_no, 'Numer zlecenia', { max: 40 }), part_no: reqStr(body.part_no, 'Detal', { max: 60 }),
    part_rev: reqStr(body.part_rev, 'Rewizja detalu', { max: 20 }), part_family: reqStr(body.part_family, 'Rodzina detali', { optional: true, max: 60 }),
    machine_id: reqStr(body.machine_id, 'Maszyna', { optional: true, max: 40 }), due_date: reqStr(body.due_date, 'Termin', { optional: true }),
    priority: reqInt(body.priority ?? 3, 'Priorytet', { min: 1, max: 5 }), folder_link: reqStr(body.folder_link, 'Folder', { optional: true, max: 500 }),
    responsible_ids: JSON.stringify((Array.isArray(body.responsible_ids) ? body.responsible_ids : []).map(Number)),
    status: oneOf(body.status || 'aktywny', 'Status', ['aktywny', 'wstrzymany', 'zakonczony', 'anulowany']),
    blocked: body.blocked ? 1 : 0, block_reason: reqStr(body.block_reason, 'Powód blokady', { optional: true }),
    description: reqStr(body.description, 'Opis', { optional: true }),
  };
  for (const k of ['order_no', 'part_no', 'part_rev']) if (!ID_RE.test(d[k])) throw bad(`Pole ${k} zawiera niedozwolone znaki (dozwolone: litery, cyfry, . _ - /).`);
  if (d.machine_id && !db.get('SELECT 1 FROM machines WHERE id=?', d.machine_id)) throw bad('Nieznana maszyna.');
  if (d.due_date) T.assertDate(d.due_date);
  if (d.blocked && !d.block_reason) throw bad('Blokada wymaga opisu powodu.');
  const dup = db.get('SELECT id FROM projects WHERE order_no=? AND part_no=? AND part_rev=? AND id != ?', d.order_no, d.part_no, d.part_rev, id || '');
  if (dup) throw conflict(`Projekt dla tego zlecenia, detalu i rewizji już istnieje (${dup.id}).`);
  return db.tx(() => {
    const now = T.nowIso();
    if (id) {
      const old = db.get('SELECT * FROM projects WHERE id=?', id);
      if (!old) throw notFound();
      const cols = Object.keys(d);
      db.run(`UPDATE projects SET ${cols.map(c => `${c}=?`).join(',')}, updated_at=? WHERE id=?`, ...cols.map(c => d[c]), now, id);
      audit(db, user, 'project', id, 'edycja', old, d, body.reason);
      return id;
    }
    const newId = nextProjectId(db);
    db.run(`INSERT INTO projects(id,order_no,part_no,part_rev,part_family,machine_id,due_date,priority,folder_link,responsible_ids,status,blocked,block_reason,description,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, newId, d.order_no, d.part_no, d.part_rev, d.part_family, d.machine_id, d.due_date, d.priority,
    d.folder_link, d.responsible_ids, d.status, d.blocked, d.block_reason, d.description, now, now);
    audit(db, user, 'project', newId, 'utworzenie', null, d);
    return newId;
  });
}

// Zmiana obowiązującego programu NC / rewizji → estymacje dla poprzednich rewizji oznaczane jako nieaktualne.
function setNcRevision(db, user, projectId, body) {
  const p = db.get('SELECT * FROM projects WHERE id=?', projectId);
  if (!p) throw notFound();
  const program = reqStr(body.nc_program, 'Program NC', { max: 64 });
  const rev = reqStr(body.nc_rev, 'Rewizja NC', { max: 20 });
  if (!ID_RE.test(program) || !ID_RE.test(rev)) throw bad('Identyfikator programu/rewizji zawiera niedozwolone znaki.');
  return db.tx(() => {
    db.run('UPDATE projects SET nc_program=?, nc_rev=?, updated_at=? WHERE id=?', program, rev, T.nowIso(), projectId);
    const r = db.run('UPDATE tech_data SET stale=1 WHERE project_id=? AND (nc_program != ? OR nc_rev != ?) AND stale=0', projectId, program, rev);
    db.run('UPDATE tech_data SET stale=0 WHERE project_id=? AND nc_program=? AND nc_rev=?', projectId, program, rev);
    audit(db, user, 'project', projectId, 'zmiana_rewizji_nc', { nc_program: p.nc_program, nc_rev: p.nc_rev }, { nc_program: program, nc_rev: rev }, body.reason);
    return { marked_stale: Number(r.changes) };
  });
}

function progress(tasks, phase) {
  const list = tasks.filter(t => t.phase === phase && t.status !== 'anulowane');
  const total = list.reduce((s, t) => s + t.weight, 0);
  const done = list.filter(t => t.status === 'zakonczone').reduce((s, t) => s + t.weight, 0);
  return { done_weight: done, total_weight: total, percent: total ? Math.round((done / total) * 100) : null, tasks: list.length };
}

function projectDetail(db, id, { withTimes }) {
  const p = db.get(`SELECT p.*, m.name AS machine_name, m.axes, m.control FROM projects p LEFT JOIN machines m ON m.id=p.machine_id WHERE p.id=?`, id);
  if (!p) throw notFound('Nie znaleziono projektu.');
  const tasks = db.all(`SELECT t.*, tt.name AS type_name, tt.code AS type_code FROM tasks t JOIN task_types tt ON tt.id=t.type_id WHERE t.project_id=? ORDER BY t.id`, id);
  const contributions = db.all(`SELECT e.employee_id, SUM(e.active_min+e.verify_min+e.rework_min) AS work_min, COUNT(DISTINCT e.work_date) AS shifts
     FROM task_time_entries e JOIN tasks t ON t.id=e.task_id WHERE t.project_id=? GROUP BY e.employee_id`, id);
  const out = {
    ...p, responsible_ids: JSON.parse(p.responsible_ids),
    progress_program: progress(tasks, 'przygotowanie'), progress_execution: progress(tasks, 'wykonanie'),
    tasks: tasks.map(t => withTimes ? { ...t, ...taskTimes(db, t.id) } : stripTaskPlan(t)),
    handovers: db.all('SELECT * FROM handovers WHERE project_id=? ORDER BY shift_date DESC, id DESC', id).map(h => ({ ...h, checklist: JSON.parse(h.checklist) })),
    contributions: contributions.map(c => ({ employee_id: c.employee_id, shifts: c.shifts, ...(withTimes ? { work_min: c.work_min } : {}) })),
    tech_data: db.all('SELECT * FROM tech_data WHERE project_id=? ORDER BY stale, operation_id', id),
    cnc_process_url: cncProcessUrl(db, p),
  };
  return out;
}

// Pracownicy widzą postęp i zadania, bez planów czasu i analiz efektywności.
function stripTaskPlan(t) {
  const { original_planned_min, planned_min, difficulty, ...rest } = t;
  return rest;
}

function cncProcessUrl(db, p) {
  const tpl = C.getSetting(db, 'cnc_process_url_template', '');
  if (!tpl) return null;
  return tpl.replace('{project_id}', encodeURIComponent(p.id)).replace('{order_no}', encodeURIComponent(p.order_no))
    .replace('{part_no}', encodeURIComponent(p.part_no)).replace('{part_rev}', encodeURIComponent(p.part_rev));
}

function listProjects(db, { withTimes, machineId, status, employeeId } = {}) {
  const w = ['1=1'], p = [];
  if (machineId) { w.push('machine_id=?'); p.push(machineId); }
  if (status) { w.push('status=?'); p.push(status); }
  return db.all(`SELECT id FROM projects WHERE ${w.join(' AND ')} ORDER BY priority, due_date`, ...p)
    .map(r => projectDetail(db, r.id, { withTimes }))
    .filter(pr => !employeeId || pr.responsible_ids.includes(Number(employeeId)) || pr.tasks.some(t => t.assignee_id === Number(employeeId)));
}

// ---------- Zadania ----------
function createTask(db, user, body) {
  const project = db.get('SELECT * FROM projects WHERE id=?', reqStr(body.project_id, 'Projekt'));
  if (!project) throw bad('Nieznany projekt.');
  const type = db.get('SELECT * FROM task_types WHERE id=? AND active=1', reqInt(body.type_id, 'Typ zadania'));
  if (!type) throw bad('Nieznany typ zadania.');
  const planned = reqInt(body.planned_min, 'Plan aktywnego czasu (min)', { min: 1, max: 100000, optional: true });
  const d = {
    project_id: project.id, type_id: type.id, operation_id: reqStr(body.operation_id, 'Operacja', { optional: true, max: 40 }),
    title: reqStr(body.title, 'Tytuł', { max: 160 }), scope: reqStr(body.scope, 'Zakres', { optional: true }),
    difficulty: reqInt(body.difficulty, 'Trudność', { min: 1, max: 5, optional: true }),
    part_family: reqStr(body.part_family || project.part_family, 'Rodzina detalu', { optional: true }),
    phase: type.phase, weight: reqInt(body.weight ?? type.default_weight, 'Waga', { min: 1, max: 100 }),
    original_planned_min: planned, planned_min: planned,
    expected_result: reqStr(body.expected_result, 'Oczekiwany rezultat', { optional: true }),
    due_date: reqStr(body.due_date, 'Termin', { optional: true }),
    assignee_id: body.assignee_id ? reqInt(body.assignee_id, 'Osoba') : null, status: 'nowe',
  };
  if (d.operation_id && !ID_RE.test(d.operation_id)) throw bad('Identyfikator operacji zawiera niedozwolone znaki.');
  if (d.due_date) T.assertDate(d.due_date);
  return db.tx(() => {
    const cols = Object.keys(d); const now = T.nowIso();
    const r = db.run(`INSERT INTO tasks(${cols.join(',')},created_at,updated_at) VALUES (${cols.map(() => '?').join(',')},?,?)`, ...cols.map(c => d[c]), now, now);
    audit(db, user, 'task', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

function updateTask(db, user, id, body) {
  const old = db.get('SELECT * FROM tasks WHERE id=?', id);
  if (!old) throw notFound();
  const status = oneOf(body.status || old.status, 'Status', ['nowe', 'w_toku', 'zablokowane', 'zakonczone', 'anulowane']);
  const upd = {
    title: body.title !== undefined ? reqStr(body.title, 'Tytuł', { max: 160 }) : old.title,
    assignee_id: body.assignee_id !== undefined ? (body.assignee_id ? reqInt(body.assignee_id, 'Osoba') : null) : old.assignee_id,
    weight: body.weight !== undefined ? reqInt(body.weight, 'Waga', { min: 1, max: 100 }) : old.weight,
    due_date: body.due_date !== undefined ? (body.due_date || null) : old.due_date,
    status, block_reason: old.block_reason, result_confirmation: old.result_confirmation, completed_at: old.completed_at, confirmed_by: old.confirmed_by,
  };
  if (status === 'zablokowane') {
    upd.block_reason = reqStr(body.block_reason || old.block_reason, 'Powód blokady');
  } else if (old.status === 'zablokowane') upd.block_reason = null;
  if (status === 'zakonczone' && old.status !== 'zakonczone') {
    upd.result_confirmation = reqStr(body.result_confirmation, 'Potwierdzenie rezultatu');
    upd.completed_at = T.nowIso(); upd.confirmed_by = user.id;
  }
  if (old.status === 'zakonczone' && status !== 'zakonczone') {
    if (!body.reason) throw bad('Ponowne otwarcie zakończonego zadania wymaga powodu.');
    upd.completed_at = null; upd.confirmed_by = null;
  }
  if (status === 'anulowane' && !body.reason) throw bad('Anulowanie zadania wymaga powodu.');
  return db.tx(() => {
    const cols = Object.keys(upd);
    db.run(`UPDATE tasks SET ${cols.map(c => `${c}=?`).join(',')}, updated_at=? WHERE id=?`, ...cols.map(c => upd[c]), T.nowIso(), id);
    audit(db, user, 'task', id, 'edycja', old, upd, body.reason);
    return id;
  });
}

// Zmiana planu: pierwotny plan pozostaje niezmienny; każda zmiana z powodem w historii.
function changeTaskPlan(db, user, id, body) {
  const t = db.get('SELECT * FROM tasks WHERE id=?', id);
  if (!t) throw notFound();
  const newMin = reqInt(body.planned_min, 'Nowy plan (min)', { min: 1, max: 100000 });
  const reason = reqStr(body.reason, 'Powód zmiany planu');
  return db.tx(() => {
    if (t.original_planned_min == null) db.run('UPDATE tasks SET original_planned_min=? WHERE id=?', newMin, id);
    db.run('UPDATE tasks SET planned_min=?, updated_at=? WHERE id=?', newMin, T.nowIso(), id);
    db.run('INSERT INTO task_plan_changes(task_id,old_planned_min,new_planned_min,reason,changed_by,changed_at) VALUES (?,?,?,?,?,?)',
      id, t.planned_min, newMin, reason, user.id, T.nowIso());
    audit(db, user, 'task', id, 'zmiana_planu', { planned_min: t.planned_min }, { planned_min: newMin }, reason);
  });
}

function addTimeEntry(db, user, body) {
  const t = db.get('SELECT * FROM tasks WHERE id=?', reqInt(body.task_id, 'Zadanie'));
  if (!t) throw bad('Nieznane zadanie.');
  const d = {
    task_id: t.id, employee_id: reqInt(body.employee_id, 'Pracownik'), work_date: reqStr(body.work_date, 'Data'),
    active_min: reqInt(body.active_min ?? 0, 'Aktywna praca', { min: 0, max: 1440 }),
    verify_min: reqInt(body.verify_min ?? 0, 'Weryfikacja i uruchomienie', { min: 0, max: 1440 }),
    rework_min: reqInt(body.rework_min ?? 0, 'Poprawki', { min: 0, max: 1440 }),
    blocked_min: reqInt(body.blocked_min ?? 0, 'Blokady i oczekiwanie', { min: 0, max: 1440 }),
    unassigned_min: reqInt(body.unassigned_min ?? 0, 'Czas nieprzypisany', { min: 0, max: 1440 }),
    cause: oneOf(body.cause || null, 'Przyczyna', CAUSES, { optional: true }), note: reqStr(body.note, 'Uwagi', { optional: true }),
  };
  C.employeeOrThrow(db, d.employee_id);
  T.assertDate(d.work_date);
  const total = d.active_min + d.verify_min + d.rework_min + d.blocked_min + d.unassigned_min;
  if (total === 0) throw bad('Wpis czasu nie może być pusty.');
  if ((d.rework_min > 0 || d.blocked_min > 0) && !d.cause) throw bad('Poprawki i blokady wymagają wskazania przyczyny.');
  const dayTotal = db.get(`SELECT COALESCE(SUM(active_min+verify_min+rework_min+blocked_min+unassigned_min),0) s FROM task_time_entries WHERE employee_id=? AND work_date=?`, d.employee_id, d.work_date).s;
  if (dayTotal + total > 1440) throw conflict('Suma czasu przypisanego w tym dniu przekracza 24 h.');
  return db.tx(() => {
    const cols = Object.keys(d);
    const r = db.run(`INSERT INTO task_time_entries(${cols.join(',')},created_by,created_at) VALUES (${cols.map(() => '?').join(',')},?,?)`, ...cols.map(c => d[c]), user.id, T.nowIso());
    audit(db, user, 'task_time', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

function taskTimes(db, taskId) {
  const r = db.get(`SELECT COUNT(*) n, SUM(active_min) a, SUM(verify_min) v, SUM(rework_min) rw, SUM(blocked_min) b, SUM(unassigned_min) u
    FROM task_time_entries WHERE task_id=?`, taskId);
  return {
    time_entries: r.n, actual_active_min: r.n ? r.a : null, actual_verify_min: r.n ? r.v : null, actual_rework_min: r.n ? r.rw : null,
    actual_blocked_min: r.n ? r.b : null, actual_unassigned_min: r.n ? r.u : null,
    plan_changes: db.all('SELECT * FROM task_plan_changes WHERE task_id=? ORDER BY id', taskId),
    explanations: db.all('SELECT * FROM task_explanations WHERE task_id=? ORDER BY id', taskId),
    entries: db.all('SELECT * FROM task_time_entries WHERE task_id=? ORDER BY work_date, id', taskId),
  };
}

function addExplanation(db, user, taskId, body) {
  if (!db.get('SELECT 1 FROM tasks WHERE id=?', taskId)) throw notFound();
  const explanation = reqStr(body.explanation, 'Wyjaśnienie');
  const conclusion = reqStr(body.conclusion, 'Wniosek administratora', { optional: true });
  return db.tx(() => {
    const r = db.run('INSERT INTO task_explanations(task_id,explanation,conclusion,created_by,created_at) VALUES (?,?,?,?,?)', taskId, explanation, conclusion, user.id, T.nowIso());
    audit(db, user, 'task_explanation', Number(r.lastInsertRowid), 'utworzenie', null, { task_id: taskId, explanation, conclusion });
    return Number(r.lastInsertRowid);
  });
}

// ---------- Tablica maszyn ----------
function board(db) {
  return db.all('SELECT * FROM machines WHERE active=1 ORDER BY sort').map(m => {
    const b = db.get('SELECT * FROM machine_board WHERE machine_id=?', m.id) || {};
    const project = b.project_id ? db.get('SELECT id, order_no, part_no, part_rev, nc_program, nc_rev, due_date, blocked, block_reason FROM projects WHERE id=?', b.project_id) : null;
    const nextTask = b.next_task_id ? db.get('SELECT id, title, status FROM tasks WHERE id=?', b.next_task_id) : null;
    return { machine: m, ...b, project, next_task: nextTask };
  });
}

function updateBoard(db, user, machineId, body) {
  if (!db.get('SELECT 1 FROM machines WHERE id=?', machineId)) throw notFound();
  const d = {
    project_id: reqStr(body.project_id, 'Projekt', { optional: true }), stage: reqStr(body.stage, 'Etap', { optional: true, max: 80 }),
    assignee_id: body.assignee_id ? reqInt(body.assignee_id, 'Osoba') : null,
    next_task_id: body.next_task_id ? reqInt(body.next_task_id, 'Następne zadanie') : null,
    next_program_status: oneOf(body.next_program_status || 'brak', 'Gotowość programu', ['brak', 'w_przygotowaniu', 'gotowy', 'zweryfikowany']),
    expected_end_at: null, expected_end_source: null, block_reason: reqStr(body.block_reason, 'Blokada', { optional: true }),
  };
  if (d.project_id && !db.get('SELECT 1 FROM projects WHERE id=?', d.project_id)) throw bad('Nieznany projekt.');
  if (d.next_task_id) {
    const t = db.get('SELECT project_id FROM tasks WHERE id=?', d.next_task_id);
    if (!t) throw bad('Nieznane zadanie.');
  }
  if (body.expected_end_date && body.expected_end_time) {
    d.expected_end_at = T.localToUtc(body.expected_end_date, body.expected_end_time);
    d.expected_end_source = reqStr(body.expected_end_source, 'Źródło przewidywanego końca (np. „szacunek programisty”)');
  }
  return db.tx(() => {
    const old = db.get('SELECT * FROM machine_board WHERE machine_id=?', machineId);
    db.run(`INSERT INTO machine_board(machine_id,project_id,stage,assignee_id,next_task_id,next_program_status,expected_end_at,expected_end_source,block_reason,updated_by,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(machine_id) DO UPDATE SET project_id=excluded.project_id, stage=excluded.stage, assignee_id=excluded.assignee_id,
      next_task_id=excluded.next_task_id, next_program_status=excluded.next_program_status, expected_end_at=excluded.expected_end_at,
      expected_end_source=excluded.expected_end_source, block_reason=excluded.block_reason, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    machineId, d.project_id, d.stage, d.assignee_id, d.next_task_id, d.next_program_status, d.expected_end_at, d.expected_end_source, d.block_reason, user.id, T.nowIso());
    audit(db, user, 'machine_board', machineId, 'edycja', old, d);
  });
}

// ---------- Przekazanie zmiany ----------
function createHandover(db, user, body) {
  const p = db.get('SELECT * FROM projects WHERE id=?', reqStr(body.project_id, 'Projekt'));
  if (!p) throw bad('Nieznany projekt.');
  const d = {
    project_id: p.id, machine_id: reqStr(body.machine_id || p.machine_id, 'Maszyna', { optional: true }),
    from_employee_id: body.from_employee_id ? reqInt(body.from_employee_id, 'Przekazuje') : null,
    to_employee_id: body.to_employee_id ? reqInt(body.to_employee_id, 'Przejmuje') : null,
    shift_date: reqStr(body.shift_date, 'Data zmiany'), done_text: reqStr(body.done_text, 'Co wykonano'),
    remaining_text: reqStr(body.remaining_text, 'Co pozostało'), nc_program: reqStr(body.nc_program || p.nc_program, 'Program NC', { optional: true }),
    nc_rev: reqStr(body.nc_rev || p.nc_rev, 'Rewizja NC', { optional: true }), stopped_at_text: reqStr(body.stopped_at_text, 'Gdzie przerwano', { optional: true }),
    tooling_notes: reqStr(body.tooling_notes, 'Uwagi do narzędzi i mocowania', { optional: true }),
    checklist: JSON.stringify((Array.isArray(body.checklist) ? body.checklist : String(body.checklist || '').split('\n')).map(s => String(s).trim()).filter(Boolean)),
  };
  T.assertDate(d.shift_date);
  if (d.from_employee_id && d.from_employee_id === d.to_employee_id) throw bad('Osoba przekazująca i przejmująca muszą być różne.');
  return db.tx(() => {
    const cols = Object.keys(d);
    const r = db.run(`INSERT INTO handovers(${cols.join(',')},created_by,created_at) VALUES (${cols.map(() => '?').join(',')},?,?)`, ...cols.map(c => d[c]), user.id, T.nowIso());
    audit(db, user, 'handover', Number(r.lastInsertRowid), 'utworzenie', null, d);
    return Number(r.lastInsertRowid);
  });
}

function listHandovers(db, { projectId, machineId } = {}) {
  return db.all(`SELECT h.*, p.order_no, p.part_no, p.part_rev FROM handovers h JOIN projects p ON p.id=h.project_id
    WHERE (? IS NULL OR h.project_id=?) AND (? IS NULL OR h.machine_id=?) ORDER BY h.shift_date DESC, h.id DESC LIMIT 200`,
  projectId || null, projectId || null, machineId || null, machineId || null).map(h => ({ ...h, checklist: JSON.parse(h.checklist) }));
}

// Ręczny wpis danych technologicznych (jawnie oznaczony jako „ręczne”).
function addManualTechData(db, user, projectId, body) {
  const p = db.get('SELECT * FROM projects WHERE id=?', projectId);
  if (!p) throw notFound();
  const d = {
    operation_id: reqStr(body.operation_id, 'Operacja', { max: 40 }), nc_program: reqStr(body.nc_program || p.nc_program, 'Program NC'),
    nc_rev: reqStr(body.nc_rev || p.nc_rev, 'Rewizja NC'),
    nx_time_min: reqInt(body.nx_time_min, 'Czas NX (min)', { min: 0, max: 100000, optional: true }),
    machine_est_min: reqInt(body.machine_est_min, 'Przewidywany czas maszyny (min)', { min: 0, max: 100000, optional: true }),
    machine_actual_min: reqInt(body.machine_actual_min, 'Rzeczywisty czas maszyny (min)', { min: 0, max: 100000, optional: true }),
  };
  const stale = (p.nc_program && p.nc_rev && (p.nc_program !== d.nc_program || p.nc_rev !== d.nc_rev)) ? 1 : 0;
  return db.tx(() => {
    db.run(`INSERT INTO tech_data(project_id,operation_id,nc_program,nc_rev,nx_time_min,machine_est_min,machine_actual_min,source,source_updated_at,stale,created_at)
      VALUES (?,?,?,?,?,?,?,'reczne',?,?,?) ON CONFLICT(project_id,operation_id,nc_program,nc_rev,source) DO UPDATE SET
      nx_time_min=excluded.nx_time_min, machine_est_min=excluded.machine_est_min, machine_actual_min=excluded.machine_actual_min, source_updated_at=excluded.source_updated_at, stale=excluded.stale`,
    projectId, d.operation_id, d.nc_program, d.nc_rev, d.nx_time_min, d.machine_est_min, d.machine_actual_min, T.nowIso(), stale, T.nowIso());
    audit(db, user, 'tech_data', projectId, 'wpis_reczny', null, d);
    return { stale: !!stale };
  });
}

module.exports = {
  CAUSES, saveMachine, saveTaskType, saveProject, setNcRevision, projectDetail, listProjects, createTask, updateTask, changeTaskPlan,
  addTimeEntry, taskTimes, addExplanation, board, updateBoard, createHandover, listHandovers, addManualTechData, ID_RE, progress,
};
