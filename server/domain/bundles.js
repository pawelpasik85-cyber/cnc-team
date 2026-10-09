'use strict';
// Zestawienia kierownika: kilka tematów (projekty, zapisane raporty) z notatką do każdego — np. dlaczego było opóźnienie.
// Dane tematu to migawka z chwili dodania (późniejsze zmiany jej nie zmieniają; można ją świadomie odświeżyć).
const T = require('../time');
const { bad, conflict, notFound, audit, reqStr, oneOf } = require('../core');
const P = require('./projects');
const A = require('./analytics');

const MAX_ITEMS = 30;

function projectSnapshot(db, id) {
  const d = P.projectDetail(db, id, { withTimes: true });
  const m = A.projectMetrics(db, id);
  const s = d.schedule || {};
  return {
    title: `${d.order_no} · ${d.part_no} rev ${d.part_rev}`, machine: d.machine_name ? `${d.machine_name} ${d.axes}X` : null, status: d.status,
    start_date: d.start_date, due_date: d.due_date, finish_date: m.finish_date,
    actual_percent: s.actual_percent, planned_percent: s.planned_percent, delay_pct: s.delay_pct, overdue_days: s.overdue_days, level: s.level, overdue_tasks: s.overdue_tasks,
    due_delta_days: m.due_delta_days, worked_min: m.worked_min, planned_min: m.planned_min, diff_pct: m.diff_pct, rework_min: m.rework_min, blocked_min: m.blocked_min,
    returns_count: m.returns_count, returns_added_min: m.returns_added_min,
    taken_at: T.nowIso(),
  };
}
function reportSnapshot(db, user, id) {
  const r = A.getReport(db, user, Number(id));
  const lines = [];
  if (r.kind === 'miesiac') {
    const k = r.data.current_kpi, pk = r.data.previous_kpi;
    lines.push(['Przepracowane', k.worked_min, pk.worked_min, 'min'], ['Poprawki', k.rework_min, pk.rework_min, 'min'], ['Blokady i oczekiwanie', k.blocked_min, pk.blocked_min, 'min'], ['Zakończone projekty', k.projects_done, pk.projects_done, 'szt']);
  } else if (r.kind === 'rok') {
    const y = r.data.years[0];
    lines.push(['Przepracowane', y.totals.worked_min, null, 'min'], ['Poprawki', y.totals.rework_min, null, 'min'], ['Zakończone projekty', y.totals.projects_done, null, 'szt']);
  } else {
    const s = r.data.process.summary;
    lines.push(['Przepracowano', s.worked_min, s.planned_min, 'min'], ['Wobec terminu (dni)', s.due_delta_days, null, 'dni'], ['Poprawki', s.rework_min, null, 'min']);
  }
  return { title: r.title, report_kind: r.kind, report_ref: r.ref, report_note: r.note, report_shared: !!r.shared, lines, taken_at: T.nowIso() };
}

function normItems(db, user, items, old = []) {
  if (!Array.isArray(items)) throw bad('Brak tematów.');
  if (items.length > MAX_ITEMS) throw bad(`Najwyżej ${MAX_ITEMS} tematów w zestawieniu.`);
  const seen = new Set();
  return items.map((it, i) => {
    if (!it || typeof it !== 'object') throw bad(`Temat ${i + 1}: nieprawidłowe dane.`);
    const kind = oneOf(it.kind, `Temat ${i + 1}: rodzaj`, ['projekt', 'raport', 'notatka']);
    const ref = kind === 'notatka' ? null : reqStr(String(it.ref ?? ''), `Temat ${i + 1}: wybór`, { max: 64 });
    if (ref !== null) {
      const key = `${kind}:${ref}`;
      if (seen.has(key)) throw bad(`Temat ${i + 1}: ten ${kind === 'projekt' ? 'projekt' : 'raport'} jest już w zestawieniu.`);
      seen.add(key);
    }
    // migawka z poprzedniego zapisu tylko dla tego samego tematu (ta sama chwila pobrania danych) i bez prośby o odświeżenie
    const prev = it.taken_at ? old.find(o => o.kind === kind && String(o.ref) === String(ref) && o.snapshot && o.snapshot.taken_at === it.taken_at) : null;
    let snapshot;
    if (kind === 'notatka') snapshot = { title: reqStr(it.title, `Temat ${i + 1}: tytuł`, { max: 160 }) };
    else if (prev && !it.refresh) snapshot = prev.snapshot;
    else {
      try { snapshot = kind === 'projekt' ? projectSnapshot(db, ref) : reportSnapshot(db, user, ref); } catch (e) {
        if (e.status === 404) throw bad(`Temat ${i + 1}: ${kind === 'projekt' ? 'projekt' : 'raport'} nie istnieje (mógł zostać usunięty).`);
        throw e;
      }
    }
    return {
      kind, ref, snapshot,
      cause: oneOf(it.cause || null, `Temat ${i + 1}: przyczyna`, P.CAUSES, { optional: true }),
      note: reqStr(it.note, `Temat ${i + 1}: notatka`, { optional: true, max: 3000 }),
    };
  });
}

// Zestawienie udostępnione przełożonemu nie może ujawniać raportu, którego kierownik mu nie udostępnił
function assertShareable(db, items) {
  for (const it of items) {
    if (it.kind !== 'raport') continue;
    const r = db.get('SELECT title, shared FROM saved_reports WHERE id=?', Number(it.ref));
    if (r && !r.shared) throw conflict(`Raport „${r.title}” nie jest udostępniony przełożonemu — udostępnij go albo usuń z zestawienia, albo nie udostępniaj zestawienia.`);
  }
}

function saveBundle(db, user, body, id) {
  const title = reqStr(body.title, 'Tytuł zestawienia', { max: 160 });
  const intro = reqStr(body.intro, 'Wstęp', { optional: true, max: 4000 });
  const old = id ? db.get('SELECT * FROM report_bundles WHERE id=?', id) : null;
  if (id && !old) throw notFound('Nie znaleziono zestawienia.');
  const items = normItems(db, user, body.items, old ? JSON.parse(old.items) : []);
  if (!items.length) throw bad('Dodaj co najmniej jeden temat.');
  const shared = body.shared !== undefined ? (body.shared ? 1 : 0) : (old ? old.shared : 0);
  if (shared) assertShareable(db, items);
  return db.tx(() => {
    const now = T.nowIso();
    if (old) {
      db.run('UPDATE report_bundles SET title=?, intro=?, items=?, shared=?, updated_at=? WHERE id=?', title, intro, JSON.stringify(items), shared, now, id);
      audit(db, user, 'report_bundle', id, 'edycja', { title: old.title, tematy: JSON.parse(old.items).length, shared: old.shared }, { title, tematy: items.length, shared }, reqStr(body.reason, 'Powód', { optional: true, max: 300 }));
      return { id };
    }
    const r = db.run('INSERT INTO report_bundles(title, intro, items, shared, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', title, intro, JSON.stringify(items), shared, user.id, now, now);
    const nid = Number(r.lastInsertRowid);
    audit(db, user, 'report_bundle', nid, 'utworzenie', null, { title, tematy: items.length, shared });
    return { id: nid };
  });
}
function listBundles(db, user) {
  return db.all(`SELECT b.id, b.title, b.items, b.shared, b.created_at, b.updated_at, u.display_name author FROM report_bundles b LEFT JOIN users u ON u.id = b.created_by
    WHERE (? = 0 OR b.shared = 1) ORDER BY b.updated_at DESC`, user.role === 'admin' ? 0 : 1)
    .map(b => ({ ...b, items: undefined, topics: JSON.parse(b.items).length }));
}
function getBundle(db, user, id) {
  const b = db.get('SELECT b.*, u.display_name author FROM report_bundles b LEFT JOIN users u ON u.id = b.created_by WHERE b.id=?', id);
  if (!b || (user.role !== 'admin' && !b.shared)) throw notFound('Nie znaleziono zestawienia.');
  return { ...b, items: JSON.parse(b.items) };
}
function deleteBundle(db, user, id) {
  const b = db.get('SELECT * FROM report_bundles WHERE id=?', id);
  if (!b) throw notFound('Nie znaleziono zestawienia.');
  db.tx(() => { db.run('DELETE FROM report_bundles WHERE id=?', id); audit(db, user, 'report_bundle', id, 'usunięcie', { title: b.title }, null); });
}

module.exports = { saveBundle, listBundles, getBundle, deleteBundle, projectSnapshot };
