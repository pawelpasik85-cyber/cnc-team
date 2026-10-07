'use strict';
// Wspólne elementy: błędy HTTP, uprawnienia, audyt, hasła i sesje.
const crypto = require('node:crypto');
const { nowIso } = require('./time');

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const bad = (msg, details) => new HttpError(400, msg, details);
const conflict = (msg, details) => new HttpError(409, msg, details);
const forbidden = (msg = 'Brak uprawnień do tej operacji.') => new HttpError(403, msg);
const notFound = (msg = 'Nie znaleziono.') => new HttpError(404, msg);

// ---- Macierz uprawnień (egzekwowana w API i eksportach) ----
const CAPS = {
  admin: '*',
  supervisor: new Set([
    'view.calendar', 'view.projects', 'view.board', 'view.handovers', 'view.employees.profile',
    'view.balances.all', 'view.leave.all', 'view.absences.detail', 'view.reports', 'view.efficiency',
    'export.reports', 'view.alerts', 'view.months',
  ]),
  employee: new Set([
    'view.calendar', 'view.projects', 'view.board', 'view.handovers', 'view.balances.own', 'request.create',
  ]),
  // Gość: wyłącznie status przypisanych mu projektów (trasy /guest/*). Każda inna trasa API jest blokowana w app.js.
  guest: new Set(['view.guest']),
};

function can(user, cap) {
  if (!user) return false;
  if (cap === 'view.confidential') {
    return user.role === 'admin' || (user.role === 'supervisor' && !!user.can_view_confidential);
  }
  const c = CAPS[user.role];
  return c === '*' || (c && c.has(cap));
}
function requireCap(user, cap) {
  if (!user) throw new HttpError(401, 'Wymagane zalogowanie.');
  if (!can(user, cap)) throw forbidden();
}

// ---- Audyt: autor, data, powód, stara i nowa wartość ----
function audit(db, user, entity, entityId, action, oldV, newV, reason) {
  db.run(`INSERT INTO audit_log(at, user_id, entity, entity_id, action, reason, old_value, new_value)
          VALUES (?,?,?,?,?,?,?,?)`,
  nowIso(), user ? user.id : null, entity, entityId == null ? null : String(entityId), action, reason || null,
  oldV === undefined || oldV === null ? null : JSON.stringify(oldV),
  newV === undefined || newV === null ? null : JSON.stringify(newV));
}

// ---- Hasła (scrypt) ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const ref = Buffer.from(keyHex, 'hex');
  return ref.length === key.length && crypto.timingSafeEqual(ref, key);
}

const SESSION_HOURS = 12;
function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.run('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES (?,?,?,?)',
    token, userId, new Date(now).toISOString(), new Date(now + SESSION_HOURS * 3600e3).toISOString());
  return token;
}
function userFromSession(db, token) {
  if (!token) return null;
  const s = db.get('SELECT * FROM sessions WHERE token = ?', token);
  if (!s || s.expires_at < nowIso()) return null;
  const u = db.get('SELECT id, login, display_name, role, employee_id, can_view_confidential, active FROM users WHERE id = ?', s.user_id);
  if (!u || !u.active) return null;
  return u;
}

// Walidatory pól wejściowych
function reqStr(v, name, { max = 2000, optional = false } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (optional) return null;
    throw bad(`Pole „${name}” jest wymagane.`);
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`Pole „${name}” jest za długie (maks. ${max}).`);
  return s;
}
function reqInt(v, name, { min = -Infinity, max = Infinity, optional = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw bad(`Pole „${name}” jest wymagane.`);
  }
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`Pole „${name}” musi być liczbą całkowitą.`);
  if (n < min || n > max) throw bad(`Pole „${name}” poza zakresem (${min}…${max}).`);
  return n;
}
function oneOf(v, name, list, { optional = false } = {}) {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (!list.includes(v)) throw bad(`Pole „${name}” ma niedozwoloną wartość.`);
  return v;
}

module.exports = {
  HttpError, bad, conflict, forbidden, notFound, can, requireCap, audit, CAPS,
  hashPassword, verifyPassword, createSession, userFromSession, reqStr, reqInt, oneOf,
};
