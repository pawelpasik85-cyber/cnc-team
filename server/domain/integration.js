'use strict';
// Wymiana danych z CNC Process: eksport identyfikatorów (bez danych osobowych) i import danych technologicznych.
const crypto = require('node:crypto');
const T = require('../time');
const { bad, conflict, audit } = require('../core');
const P = require('./projects');

const EXPORT_FORMAT = 'cnc-team.exchange';
const IMPORT_FORMAT = 'cnc-process.techdata';
const SUPPORTED_VERSIONS = ['1.0'];

// Eksport: wyłącznie identyfikatory produkcyjne i statusy. Brak: pracowników, absencji, L4, dokumentów kadrowych,
// raportów efektywności, czasu ludzi, poufnych notatek.
function exportForCncProcess(db) {
  const machines = db.all('SELECT id, name, axes, control, model FROM machines WHERE active=1 ORDER BY sort');
  const projects = db.all(`SELECT id, order_no, part_no, part_rev, part_family, machine_id, due_date, nc_program, nc_rev, status FROM projects
    WHERE status IN ('aktywny','wstrzymany') ORDER BY id`).map(p => ({
    project_id: p.id, order_no: p.order_no, part_no: p.part_no, part_rev: p.part_rev, part_family: p.part_family,
    machine_id: p.machine_id, due_date: p.due_date, status: p.status,
    current_nc: p.nc_program ? { nc_program: p.nc_program, nc_rev: p.nc_rev } : null,
    operations: db.all(`SELECT DISTINCT operation_id FROM tasks WHERE project_id=? AND operation_id IS NOT NULL ORDER BY operation_id`, p.id).map(o => o.operation_id),
  }));
  return { format: EXPORT_FORMAT, version: '1.0', generated_at: T.nowIso(), timezone: T.TZ, units: { time: 'min' }, machines, projects };
}

function isInt(v) { return v === null || v === undefined || (Number.isInteger(v) && v >= 0 && v <= 1000000); }

// Import: walidacja wersji formatu, identyfikatorów, jednostek, rewizji i duplikatów.
// Zapis TYLKO do tabel tech_data / tech_imports — nie dotyka rozliczeń zespołu.
function validateImport(db, payload) {
  const errors = [], warnings = [], items = [];
  if (!payload || typeof payload !== 'object') return { errors: ['Plik nie jest obiektem JSON.'], warnings, items };
  if (payload.format !== IMPORT_FORMAT) errors.push(`Nieobsługiwany format „${payload.format}” (oczekiwano „${IMPORT_FORMAT}”).`);
  if (!SUPPORTED_VERSIONS.includes(payload.version)) errors.push(`Nieobsługiwana wersja formatu „${payload.version}” (obsługiwane: ${SUPPORTED_VERSIONS.join(', ')}).`);
  if (!payload.units || payload.units.time !== 'min') errors.push('Jednostka czasu musi być „min” (units.time).');
  if (!Array.isArray(payload.items)) errors.push('Brak tablicy items.');
  if (errors.length) return { errors, warnings, items };
  const seen = new Set();
  payload.items.forEach((it, i) => {
    const at = `items[${i}]`;
    for (const k of ['order_no', 'part_no', 'part_rev', 'operation_id', 'nc_program', 'nc_rev']) {
      if (typeof it[k] !== 'string' || !P.ID_RE.test(it[k])) errors.push(`${at}.${k}: wymagany identyfikator (litery, cyfry, . _ - /).`);
    }
    for (const k of ['nx_time_min', 'machine_est_min', 'machine_actual_min']) if (!isInt(it[k])) errors.push(`${at}.${k}: liczba całkowita minut ≥ 0 lub null.`);
    if (it.nx_time_min == null && it.machine_est_min == null && it.machine_actual_min == null) errors.push(`${at}: brak jakichkolwiek wartości czasu.`);
    if (it.updated_at && Number.isNaN(Date.parse(it.updated_at))) errors.push(`${at}.updated_at: niepoprawna data.`);
    if (it.machine_id !== undefined && it.machine_id !== null && !db.get('SELECT 1 FROM machines WHERE id=?', it.machine_id)) errors.push(`${at}.machine_id: nieznana maszyna „${it.machine_id}”.`);
    const key = [it.order_no, it.part_no, it.part_rev, it.operation_id, it.nc_program, it.nc_rev].join('|');
    if (seen.has(key)) errors.push(`${at}: duplikat pozycji w pliku (${key}).`);
    seen.add(key);
    const p = db.get('SELECT * FROM projects WHERE order_no=? AND part_no=? AND part_rev=?', it.order_no, it.part_no, it.part_rev);
    if (!p) { errors.push(`${at}: brak projektu dla zlecenia ${it.order_no}, detalu ${it.part_no} rev ${it.part_rev}.`); return; }
    if (p.machine_id && it.machine_id && p.machine_id !== it.machine_id) errors.push(`${at}: maszyna ${it.machine_id} niezgodna z projektem (${p.machine_id}).`);
    const current = p.nc_program === it.nc_program && p.nc_rev === it.nc_rev;
    if (!p.nc_program) warnings.push(`${at}: projekt ${p.id} nie ma ustalonej obowiązującej rewizji NC — dane oznaczone jako nieaktualne do czasu jej ustalenia.`);
    else if (!current) warnings.push(`${at}: rewizja ${it.nc_program} rev ${it.nc_rev} różni się od obowiązującej (${p.nc_program} rev ${p.nc_rev}) — zapis jako NIEAKTUALNA.`);
    items.push({ ...it, project_id: p.id, stale: current ? 0 : 1 });
  });
  return { errors, warnings, items };
}

function importFromCncProcess(db, user, rawText, { dryRun = false } = {}) {
  let payload;
  try { payload = JSON.parse(rawText); } catch { throw bad('Niepoprawny JSON.'); }
  const hash = crypto.createHash('sha256').update(rawText).digest('hex');
  const v = validateImport(db, payload);
  if (v.errors.length) throw bad('Import odrzucony — błędy walidacji.', { errors: v.errors, warnings: v.warnings });
  if (db.get('SELECT 1 FROM tech_imports WHERE file_hash=?', hash)) throw conflict('Ten plik został już zaimportowany (duplikat).');
  const summary = { items: v.items.length, current: v.items.filter(i => !i.stale).length, stale: v.items.filter(i => i.stale).length, warnings: v.warnings };
  if (dryRun) return { dry_run: true, ...summary };
  return db.tx(() => {
    const r = db.run('INSERT INTO tech_imports(file_hash,format,format_version,imported_by,imported_at,summary) VALUES (?,?,?,?,?,?)',
      hash, payload.format, payload.version, user.id, T.nowIso(), JSON.stringify(summary));
    const importId = Number(r.lastInsertRowid);
    for (const it of v.items) {
      db.run(`INSERT INTO tech_data(project_id,operation_id,nc_program,nc_rev,nx_time_min,machine_est_min,machine_actual_min,source,source_updated_at,stale,import_id,created_at)
        VALUES (?,?,?,?,?,?,?,'cnc_process',?,?,?,?) ON CONFLICT(project_id,operation_id,nc_program,nc_rev,source) DO UPDATE SET
        nx_time_min=excluded.nx_time_min, machine_est_min=excluded.machine_est_min, machine_actual_min=excluded.machine_actual_min,
        source_updated_at=excluded.source_updated_at, stale=excluded.stale, import_id=excluded.import_id`,
      it.project_id, it.operation_id, it.nc_program, it.nc_rev, it.nx_time_min ?? null, it.machine_est_min ?? null, it.machine_actual_min ?? null,
      it.updated_at || payload.generated_at || T.nowIso(), it.stale, importId, T.nowIso());
    }
    audit(db, user, 'tech_import', importId, 'import', null, summary);
    return { import_id: importId, ...summary };
  });
}

module.exports = { exportForCncProcess, importFromCncProcess, validateImport, EXPORT_FORMAT, IMPORT_FORMAT };
