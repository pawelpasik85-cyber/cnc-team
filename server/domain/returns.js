'use strict';
// Powroty do zakończonego projektu (rundy poprawek).
// Czas każdego wpisu trafia do jednego okresu: zadanie założone w rundzie → ta runda; zadanie pierwotne → ostatnia runda
// otwarta nie później niż dzień wpisu; wcześniej — pierwotna realizacja („przed poprawkami”).
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, reqInt, oneOf } = require('../core');
const P = require('./projects');

const WORK = 'e.active_min + e.verify_min + e.rework_min';
// Okres (runda) wpisu czasu — wspólne wyrażenie SQL dla projektu i dla zestawień miesięcznych
const PERIOD_SQL = `COALESCE(t.return_id, (SELECT r.id FROM project_returns r WHERE r.project_id = t.project_id AND r.opened_date <= e.work_date AND (r.closed_date IS NULL OR e.work_date <= r.closed_date) ORDER BY r.round DESC LIMIT 1))`;

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function openReturn(db, projectId) { return db.get('SELECT * FROM project_returns WHERE project_id=? AND closed_date IS NULL', projectId); }

function liveTasks(db, projectId) {
  return db.all(`SELECT * FROM tasks WHERE project_id=? AND status != 'anulowane'`, projectId);
}

// Powrót do zakończonego projektu: nowa runda poprawek, opcjonalnie od razu zadanie poprawek
function startReturn(db, user, projectId, body) {
  const p = db.get('SELECT * FROM projects WHERE id=?', projectId);
  if (!p) throw notFound('Nie znaleziono projektu.');
  if (openReturn(db, projectId)) throw conflict('Ten projekt ma już otwartą rundę poprawek — najpierw ją zakończ.');
  if (p.status === 'anulowany' || p.status === 'wstrzymany') throw conflict(`Projekt ma status „${p.status}” — powrót do poprawek dotyczy projektów zakończonych.`);
  const live = liveTasks(db, projectId);
  if (p.status !== 'zakonczony' && !(live.length && live.every(t => t.status === 'zakonczone'))) {
    throw conflict('Powrót do projektu jest możliwy po jego zakończeniu (wszystkie zadania zakończone albo status „zakończony”).');
  }
  const reason = reqStr(body.reason, 'Powód powrotu (co trzeba poprawić)', { max: 500 });
  const cause = oneOf(body.cause || null, 'Przyczyna', P.CAUSES, { optional: true });
  const opened = reqStr(body.opened_date || T.today(), 'Data powrotu');
  T.assertDate(opened);
  const last = db.get('SELECT * FROM project_returns WHERE project_id=? ORDER BY round DESC LIMIT 1', projectId);
  if (last && opened < last.closed_date) throw bad(`Data powrotu nie może być wcześniejsza niż zakończenie poprzedniej rundy (${last.closed_date}).`);
  const lastWork = db.get(`SELECT MAX(e.work_date) d FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ?`, projectId).d;
  if (!last && lastWork && opened < lastWork) throw bad(`Data powrotu nie może być wcześniejsza niż ostatni dzień pracy nad projektem (${lastWork}) — inaczej czas przed poprawkami byłby zaniżony.`);
  if (opened > T.today()) throw bad('Data powrotu nie może być w przyszłości.');
  return db.tx(() => {
    const round = (last ? last.round : 0) + 1;
    const r = db.run(`INSERT INTO project_returns(project_id, round, opened_date, reason, cause, created_by, created_at) VALUES (?,?,?,?,?,?,?)`,
      projectId, round, opened, reason, cause, user.id, T.nowIso());
    const rid = Number(r.lastInsertRowid);
    if (p.status === 'zakonczony') db.run(`UPDATE projects SET status='aktywny', updated_at=? WHERE id=?`, T.nowIso(), projectId);
    audit(db, user, 'project', projectId, 'powrot_poprawki', { status: p.status }, { runda: round, data: opened, przyczyna: cause, status: 'aktywny' }, reason);
    let taskId = null;
    if (body.task_title) {
      taskId = P.createTask(db, user, { project_id: projectId, type_id: body.type_id, title: body.task_title, planned_min: body.planned_min, assignee_id: body.assignee_id, scope: reason });
    }
    return { id: rid, round, task_id: taskId };
  });
}

// Zakończenie rundy: wszystkie zadania tej rundy zakończone (lub anulowane); projekt wraca do „zakończony”
function closeReturn(db, user, projectId, body) {
  const r = openReturn(db, projectId);
  if (!r) throw notFound('Brak otwartej rundy poprawek.');
  const open = db.all(`SELECT title FROM tasks WHERE project_id=? AND status NOT IN ('zakonczone','anulowane')`, projectId);
  if (open.length) throw conflict(`Najpierw zakończ zadania: ${open.map(t => t.title).join(', ')}.`);
  const closed = reqStr(body.closed_date || T.today(), 'Data zakończenia');
  T.assertDate(closed);
  if (closed < r.opened_date) throw bad('Zakończenie nie może być przed powrotem.');
  if (closed > T.today()) throw bad('Data zakończenia nie może być w przyszłości.');
  const lastRoundWork = db.get(`SELECT MAX(e.work_date) d FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ? AND ${PERIOD_SQL} = ?`, projectId, r.id).d;
  if (lastRoundWork && closed < lastRoundWork) throw bad(`W tej rundzie jest praca z ${lastRoundWork} — data zakończenia nie może być wcześniejsza.`);
  const note = reqStr(body.note, 'Co poprawiono', { max: 500 });
  const p = db.get('SELECT status FROM projects WHERE id=?', projectId);
  return db.tx(() => {
    db.run(`UPDATE project_returns SET closed_date=?, close_note=?, closed_by=?, closed_at=? WHERE id=?`, closed, note, user.id, T.nowIso(), r.id);
    db.run(`UPDATE projects SET status='zakonczony', updated_at=? WHERE id=?`, T.nowIso(), projectId);
    audit(db, user, 'project', projectId, 'koniec_poprawek', { runda: r.round, status: p.status }, { runda: r.round, zakonczono: closed, status: 'zakonczony' }, note);
    return { id: r.id };
  });
}

function listReturns(db, projectId) {
  return db.all('SELECT * FROM project_returns WHERE project_id=? ORDER BY round', projectId);
}

// Czas projektu: przed poprawkami (pierwotna realizacja), doszło w każdej rundzie, same poprawki łącznie
function returnsSummary(db, projectId) {
  const rounds = listReturns(db, projectId);
  const rows = db.all(`SELECT ${PERIOD_SQL} AS rid, SUM(${WORK}) w, SUM(e.rework_min) rw, MIN(e.work_date) first, MAX(e.work_date) last
    FROM task_time_entries e JOIN tasks t ON t.id = e.task_id WHERE t.project_id = ? GROUP BY rid`, projectId);
  const by = new Map(rows.map(r => [r.rid, r]));
  const base = by.get(null) || { w: 0, rw: 0 };
  const original = { worked_min: base.w || 0, rework_min: base.rw || 0, clean_min: (base.w || 0) - (base.rw || 0), first: base.first || null, last: base.last || null };
  const list = rounds.map(r => {
    const x = by.get(r.id) || { w: 0, rw: 0 };
    return { id: r.id, round: r.round, opened_date: r.opened_date, closed_date: r.closed_date, reason: r.reason, cause: r.cause, close_note: r.close_note,
      worked_min: x.w || 0, increase_pct: pct(x.w || 0, original.worked_min) };
  });
  const added = list.reduce((s, r) => s + r.worked_min, 0);
  return {
    rounds: list, original,
    added_min: added, added_pct: pct(added, original.worked_min),
    corrections_min: original.rework_min + added, // poprawki w trakcie realizacji + cała praca po powrotach
    total_min: original.worked_min + added,
    open: list.find(r => !r.closed_date) || null,
  };
}

// Praca w powrotach do projektów w zakresie dat (do zestawień miesięcznych) — łącznie i według projektów
function returnsWork(db, from, to) {
  const rows = db.all(`SELECT t.project_id, SUM(${WORK}) w FROM task_time_entries e JOIN tasks t ON t.id = e.task_id
    WHERE e.work_date BETWEEN ? AND ? AND ${PERIOD_SQL} IS NOT NULL GROUP BY t.project_id`, from, to);
  return { total_min: rows.reduce((s, r) => s + (r.w || 0), 0), by_project: rows.map(r => ({ project_id: r.project_id, worked_min: r.w || 0 })),
    opened: db.get('SELECT COUNT(*) n FROM project_returns WHERE opened_date BETWEEN ? AND ?', from, to).n };
}

module.exports = { startReturn, closeReturn, listReturns, returnsSummary, returnsWork, openReturn, PERIOD_SQL };
