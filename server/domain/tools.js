'use strict';
// Narzędziownia: oprawki (BT50 — Hartford, HSK40 — Grimme), głowice frezujące, płytki i frezy.
// Dopasowanie liczone z parametrów: głowica ↔ płytki (oznaczenie płytki zaczyna się od kodu gniazda głowicy),
// oprawka trzpieniowa ↔ głowica (ten sam trzpień), oprawka zaciskowa ↔ frez lub głowica z chwytem (średnica chwytu w zakresie oprawki);
// oprawka i narzędzie przypisane do różnych maszyn nie są łączone.
const T = require('../time');
const { bad, notFound, audit, reqStr, reqInt, oneOf } = require('../core');

const KINDS = ['oprawka', 'glowica', 'plytka', 'frez'];
const HOLDER_TYPES = ['tulejkowa', 'weldon', 'termo', 'hydrauliczna', 'trzpieniowa'];
const MILL_TYPES = ['walcowo-czolowy', 'kulisty', 'torusowy', 'fazownik', 'wiertlo', 'gwintownik'];
const SHAPES = ['A', 'C', 'D', 'R', 'S', 'T', 'V', 'W', 'O'];

const num = (v, label, { min = 0, max = 2000, optional = true, int = false } = {}) => {
  if (v === undefined || v === null || v === '') { if (optional) return null; throw bad(`Podaj: ${label}.`); }
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${label}: wartość ${min}–${max}.`);
  if (int && !Number.isInteger(n)) throw bad(`${label}: liczba całkowita.`);
  return Math.round(n * 100) / 100;
};
// BT50, HSK40, HSK-A40 → porównywalna postać
const normIface = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^HSK[A-F](?=\d)/, 'HSK');
const txt = (v, label, max = 60) => reqStr(v, label, { optional: true, max });

function normParams(kind, p = {}) {
  if (kind === 'oprawka') {
    const type = oneOf(p.type, 'Rodzaj oprawki', HOLDER_TYPES);
    const out = { interface: reqStr(p.interface, 'Interfejs (BT50, HSK40)', { max: 20 }), type, gauge: num(p.gauge, 'Długość od czoła wrzeciona (mm)', { max: 400 }) };
    if (type === 'trzpieniowa') out.arbor = num(p.arbor, 'Trzpień Ø (mm)', { min: 6, max: 60, optional: false });
    else { out.clamp_min = num(p.clamp_min, 'Zacisk od Ø (mm)', { min: 0.5, max: 50, optional: false }); out.clamp_max = num(p.clamp_max ?? p.clamp_min, 'Zacisk do Ø (mm)', { min: 0.5, max: 50 }); }
    if (out.clamp_max !== undefined && out.clamp_max !== null && out.clamp_max < out.clamp_min) throw bad('Zakres zacisku: „do” mniejsze niż „od”.');
    out.collet = type === 'tulejkowa' ? txt(p.collet, 'Tulejka / nakrętka', 20) : null;
    out.max_rpm = num(p.max_rpm, 'Maks. obroty', { max: 60000, int: true });
    return out;
  }
  if (kind === 'glowica') return {
    D: num(p.D, 'Średnica D (mm)', { min: 8, max: 400, optional: false }), z: num(p.z, 'Liczba ostrzy z', { min: 1, max: 30, optional: false, int: true }),
    arbor: num(p.arbor, 'Trzpień Ø (mm)', { min: 6, max: 60 }), shank: num(p.shank, 'Chwyt walcowy Ø (mm)', { min: 6, max: 40 }),
    insert_code: txt(p.insert_code, 'Kod gniazda płytki (np. APMT1604)', 20), lead: num(p.lead, 'Kąt przystawienia (°)', { min: 10, max: 95 }), ap_max: num(p.ap_max, 'Maks. ap (mm)', { max: 30 }),
    H: num(p.H, 'Wysokość głowicy H (mm)', { min: 1, max: 300 }),
  };
  if (kind === 'plytka') return {
    shape: oneOf(p.shape, 'Kształt (ISO)', SHAPES), size: num(p.size, 'Wielkość / długość krawędzi (mm)', { min: 2, max: 40, optional: false }),
    edges: num(p.edges, 'Liczba krawędzi', { min: 1, max: 16, int: true }), grade: txt(p.grade, 'Gatunek', 30), coating: txt(p.coating, 'Pokrycie', 30),
    materials: txt(p.materials, 'Materiały (P/M/K/N/S/H)', 12), radius: num(p.radius, 'Promień naroża r (mm)', { max: 10 }),
  };
  const type = oneOf(p.type, 'Rodzaj freza', MILL_TYPES);
  const D = num(p.D, 'Średnica D (mm)', { min: 0.2, max: 100, optional: false });
  const r = type === 'torusowy' ? num(p.r, 'Promień naroża r (mm)', { max: 50 }) : null; // kulisty: r = D/2 z definicji
  if (r !== null && r > D / 2) throw bad('Promień naroża nie może być większy niż połowa średnicy.');
  // dane definiujące narzędzie: liczba ostrzy, długość ostrza (części skrawającej) i długość całkowita — obowiązkowe
  const z = num(p.z, 'Liczba ostrzy z', { min: 1, max: 20, int: true, optional: false });
  const L = num(p.L, 'Długość całkowita L (mm)', { min: 1, max: 500, optional: false });
  const Lc = num(p.Lc, 'Długość ostrza Lc (mm)', { min: 0.1, max: 300, optional: type === 'fazownik' });
  const reach = type === 'fazownik' ? null : num(p.reach, 'Długość użyteczna l1 (mm)', { min: 0.1, max: 500 });
  if (Lc !== null && Lc > L) throw bad('Długość ostrza nie może być większa niż długość całkowita.');
  if (reach !== null && reach > L) throw bad('Długość użyteczna nie może być większa niż długość całkowita.');
  if (reach !== null && Lc !== null && reach < Lc) throw bad('Długość użyteczna (z szyjką) nie może być krótsza niż długość ostrza.');
  return {
    type, D, z, shank: num(p.shank, 'Chwyt Ø (mm)', { min: 1, max: 50 }), Lc, reach, L,
    r, angle: type === 'fazownik' || type === 'wiertlo' ? num(p.angle, 'Kąt (fazownik / wiertło, °)', { min: 30, max: 180 }) : null,
    material: txt(p.material, 'Materiał (VHM, HSS…)', 20), coating: txt(p.coating, 'Pokrycie', 30),
  };
}

function rowOut(r) { return { ...r, params: JSON.parse(r.params || '{}'), active: !!r.active, low: r.qty < r.min_qty }; }

// Dopasowania liczone na żywo z parametrów
function compat(list) {
  const holders = list.filter(t => t.kind === 'oprawka'), heads = list.filter(t => t.kind === 'glowica');
  const inserts = list.filter(t => t.kind === 'plytka'), mills = list.filter(t => t.kind === 'frez');
  const fitsShank = (h, d) => d && h.params.type !== 'trzpieniowa' && h.params.clamp_min !== null && d >= h.params.clamp_min - 1e-6 && d <= (h.params.clamp_max ?? h.params.clamp_min) + 1e-6;
  const fitsArbor = (h, g) => h.params.type === 'trzpieniowa' && g.params.arbor && Math.abs(h.params.arbor - g.params.arbor) < 1e-6;
  const insertFits = (g, p) => g.params.insert_code && p.name.toUpperCase().replace(/\s/g, '').startsWith(g.params.insert_code.toUpperCase().replace(/\s/g, ''));
  const ref = (t) => ({ id: t.id, kind: t.kind, name: t.name, code: t.code, machine_id: t.machine_id });
  // narzędzie przypisane do innej maszyny niż oprawka nie jest do niej proponowane (płytki są wspólne)
  const sameMachine = (a, b) => !a.machine_id || !b.machine_id || a.machine_id === b.machine_id;
  const headFitsHolder = (h, g) => sameMachine(h, g) && (fitsArbor(h, g) || (g.params.shank && fitsShank(h, g.params.shank)));
  const millFitsHolder = (h, m) => sameMachine(h, m) && fitsShank(h, m.params.shank || m.params.D);
  for (const t of list) {
    if (t.kind === 'oprawka') t.fits = [...heads.filter(g => headFitsHolder(t, g)), ...mills.filter(m => millFitsHolder(t, m))].map(ref);
    if (t.kind === 'glowica') t.fits = [...holders.filter(h => headFitsHolder(h, t)), ...inserts.filter(p => insertFits(t, p))].map(ref);
    if (t.kind === 'plytka') t.fits = heads.filter(g => insertFits(g, t)).map(ref);
    if (t.kind === 'frez') t.fits = holders.filter(h => millFitsHolder(h, t)).map(ref);
  }
  return list;
}

function listTools(db, { all = false } = {}) {
  return compat(db.all(`SELECT * FROM tools WHERE (? = 1 OR active = 1) ORDER BY kind, machine_id, name`, all ? 1 : 0).map(rowOut));
}

function saveTool(db, user, body, id) {
  const old = id ? db.get('SELECT * FROM tools WHERE id=?', id) : null;
  if (id && !old) throw notFound('Nie znaleziono narzędzia.');
  const kind = oneOf(old ? old.kind : body.kind, 'Rodzaj', KINDS);
  // edycja: pola nieprzesłane zostają bez zmian (przesłane null / pusty tekst — czyści)
  const has = (k) => body[k] !== undefined;
  const keep = (k, fn) => (old && !has(k) ? old[k] : fn(body[k]));
  if (has('active') && typeof body.active !== 'boolean' && body.active !== 0 && body.active !== 1) throw bad('Pole „aktywne”: tak / nie.');
  const d = {
    kind, name: keep('name', v => reqStr(v, 'Oznaczenie / nazwa', { max: 80 })), code: keep('code', v => txt(v, 'Numer własny', 20)),
    manufacturer: keep('manufacturer', v => txt(v, 'Producent', 60)), catalog_no: keep('catalog_no', v => txt(v, 'Nr katalogowy', 60)),
    machine_id: keep('machine_id', v => (v ? reqStr(v, 'Maszyna', { max: 40 }) : null)),
    params: keep('params', v => JSON.stringify(normParams(kind, typeof v === 'object' && v ? v : {}))),
    min_qty: keep('min_qty', v => reqInt(v ?? 0, 'Stan minimalny', { min: 0, max: 100000 })),
    location: keep('location', v => txt(v, 'Lokalizacja', 60)), note: keep('note', v => reqStr(v, 'Uwagi', { optional: true, max: 500 })),
    active: has('active') ? (body.active === true || body.active === 1 ? 1 : 0) : (old ? old.active : 1),
  };
  const machine = d.machine_id ? db.get('SELECT * FROM machines WHERE id=?', d.machine_id) : null;
  if (d.machine_id && !machine) throw bad('Nieznana maszyna.');
  if (kind === 'oprawka') {
    // oprawka musi pasować do wrzeciona maszyny; bez wskazanej maszyny — przypisanie wg interfejsu (BT50 → Hartford, HSK40 → Grimme)
    const iface = normIface(JSON.parse(d.params).interface);
    if (machine && machine.tool_holder && normIface(machine.tool_holder) !== iface) throw bad(`Maszyna ${machine.name} ma wrzeciono ${machine.tool_holder} — oprawka ${JSON.parse(d.params).interface} do niej nie pasuje.`);
    if (!machine) {
      const m = db.all('SELECT id, tool_holder FROM machines').filter(x => x.tool_holder && normIface(x.tool_holder) === iface);
      if (m.length === 1) d.machine_id = m[0].id;
    }
  }
  const action = !old ? 'utworzenie' : old.active && !d.active ? 'wycofanie' : !old.active && d.active ? 'przywrocenie' : 'edycja';
  if (action === 'wycofanie') reqStr(body.reason, 'Powód wycofania z użytku');
  if (action === 'przywrocenie') reqStr(body.reason, 'Powód przywrócenia');
  return db.tx(() => {
    const now = T.nowIso();
    if (old) {
      const cols = Object.keys(d);
      db.run(`UPDATE tools SET ${cols.map(c => `${c}=?`).join(',')}, updated_at=? WHERE id=?`, ...cols.map(c => d[c]), now, id);
      audit(db, user, 'tool', id, action, old, d, body.reason);
      return { id };
    }
    const qty = reqInt(body.qty ?? 0, 'Stan', { min: 0, max: 100000 });
    const cols = Object.keys(d);
    const r = db.run(`INSERT INTO tools(${cols.join(',')},qty,created_at,updated_at) VALUES (${cols.map(() => '?').join(',')},?,?,?)`, ...cols.map(c => d[c]), qty, now, now);
    const nid = Number(r.lastInsertRowid);
    audit(db, user, 'tool', nid, 'utworzenie', null, { ...d, qty });
    return { id: nid };
  });
}

// Zmiana stanu (przyjęcie / wydanie / zużycie) — zawsze z powodem w historii
function adjustStock(db, user, id, body) {
  const t = db.get('SELECT * FROM tools WHERE id=?', id);
  if (!t) throw notFound('Nie znaleziono narzędzia.');
  const delta = reqInt(body.delta, 'Zmiana stanu', { min: -100000, max: 100000 });
  if (!delta) throw bad('Podaj zmianę stanu (np. +10 albo −2).');
  const reason = reqStr(body.reason, 'Powód (przyjęcie, zużycie, wydanie…)', { max: 200 });
  if (t.qty + delta < 0) throw bad(`Stan nie może być ujemny (jest ${t.qty}).`);
  return db.tx(() => {
    db.run('UPDATE tools SET qty=?, updated_at=? WHERE id=?', t.qty + delta, T.nowIso(), id);
    audit(db, user, 'tool', id, delta > 0 ? 'przyjecie' : 'wydanie', { qty: t.qty }, { qty: t.qty + delta }, reason);
    return { qty: t.qty + delta };
  });
}

module.exports = { KINDS, HOLDER_TYPES, MILL_TYPES, SHAPES, listTools, saveTool, adjustStock, normParams };
