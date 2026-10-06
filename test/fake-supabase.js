'use strict';
// Atrapa Supabase w pamięci (fetch) — odwzorowuje reguły z supabase/*.sql na potrzeby testów:
// rejestracja tylko z zaproszenia, RLS (pracownik widzi swoje, kierownik wszystko), funkcje RPC.
// Zgodność z prawdziwą bazą sprawdza osobno supabase/tests/rls_check.sql.
const crypto = require('node:crypto');

function createFakeSupabase({ now = () => new Date() } = {}) {
  const allowed = new Map();     // email -> {role, employee_ref, display_name}
  const users = new Map();       // email -> {id, password}
  const members = new Map();     // user_id -> member
  const tokens = new Map();      // access -> {user_id, exp}
  const refresh = new Map();     // refresh -> user_id
  const reports = [];
  const publications = new Map();
  let offline = false;
  let rev = 0;
  const calls = [];

  const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const err = (status, message, code) => json(status, { message, msg: message, code, error_code: code });
  const issue = (u) => {
    const access = crypto.randomUUID(), r = crypto.randomUUID();
    tokens.set(access, { user_id: u.id, exp: Date.now() + 3600e3 }); refresh.set(r, u.id);
    return { access_token: access, refresh_token: r, expires_in: 3600, user: { id: u.id, email: [...users.entries()].find(([, v]) => v.id === u.id)[0] } };
  };
  const who = (headers) => {
    const h = headers.Authorization || headers.authorization;
    if (!h) return null;
    const t = tokens.get(h.replace('Bearer ', ''));
    if (!t || t.exp < Date.now()) return 'expired';
    return members.get(t.user_id) || null;
  };
  const today = () => now().toISOString().slice(0, 10);

  async function fetchImpl(url, { method = 'GET', headers = {}, body } = {}) {
    if (offline) throw new TypeError('fetch failed');
    const u = new URL(url);
    const path = u.pathname;
    const b = body ? JSON.parse(body) : {};
    calls.push({ method, path, body: b });
    if (path === '/auth/v1/signup') {
      const email = b.email.toLowerCase();
      if (!allowed.has(email)) return err(500, 'Database error saving new user', 'unexpected_failure');
      if (users.has(email)) return err(422, 'User already registered', 'user_already_exists');
      if (String(b.password).length < 6) return err(422, 'Password should be at least 6 characters', 'weak_password');
      const id = crypto.randomUUID();
      users.set(email, { id, password: b.password });
      members.set(id, { user_id: id, email, ...allowed.get(email) });
      return json(200, { id });
    }
    if (path === '/auth/v1/token') {
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const usr = users.get(b.email.toLowerCase());
        if (!usr || usr.password !== b.password) return err(400, 'Invalid login credentials', 'invalid_credentials');
        return json(200, issue(usr));
      }
      const uid = refresh.get(b.refresh_token);
      if (!uid) return err(400, 'Invalid Refresh Token', 'refresh_token_not_found');
      refresh.delete(b.refresh_token);
      return json(200, issue({ id: uid }));
    }
    const m = who(headers);
    if (m === 'expired') return err(401, 'JWT expired', 'PGRST301');
    if (path.startsWith('/rest/v1/rpc/')) {
      if (!m) return err(401, 'permission denied', '42501');
      const fn = path.slice('/rest/v1/rpc/'.length);
      const mgr = m.role === 'kierownik';
      try {
        switch (fn) {
          case 'submit_report': {
            if (m.role !== 'pracownik') throw new Error('Zgłoszenia składają pracownicy');
            const p = b.p;
            const dup = reports.find(r => r.user_id === m.user_id && r.client_id === p.client_id);
            if (dup) return json(200, dup);
            const r = {
              id: crypto.randomUUID(), client_id: p.client_id, user_id: m.user_id, employee_ref: m.employee_ref, kind: p.kind,
              date_from: p.date_from, date_to: p.date_to || p.date_from, time_from: p.time_from || null, time_to: p.time_to || null,
              note: p.note || null, status: 'nowe', decision_note: null, cnc_ref: null, created_at: now().toISOString(), updated_at: now().toISOString(), rev: ++rev,
            };
            reports.push(r);
            return json(200, r);
          }
          case 'withdraw_report': {
            const r = reports.find(x => x.id === b.report_id && x.user_id === m.user_id && x.status === 'nowe');
            if (!r) throw new Error('Można wycofać tylko własne zgłoszenie');
            r.status = 'wycofane'; r.updated_at = now().toISOString();
            return json(200, r);
          }
          case 'decide_report': {
            if (!mgr) throw new Error('Decyzję podejmuje kierownik');
            const r = reports.find(x => x.id === b.report_id && x.status === 'nowe');
            if (!r) throw new Error('Zgłoszenie nie istnieje albo zostało już rozpatrzone lub wycofane');
            Object.assign(r, { status: b.decision, decision_note: b.note, cnc_ref: b.ref, updated_at: now().toISOString() });
            return json(200, r);
          }
          case 'set_report_ref': {
            if (!mgr) throw new Error('Odnośnik ustawia kierownik');
            const r = reports.find(x => x.id === b.report_id && x.status === 'przyjete');
            if (r) r.cnc_ref = b.ref;
            return json(200, null);
          }
          case 'publish': {
            if (!mgr) throw new Error('Publikuje kierownik');
            for (const it of b.items) publications.set(`${it.scope}|${it.employee_ref || 0}|${it.kind}`, { scope: it.scope, employee_ref: it.employee_ref || 0, kind: it.kind, data: it.data, published_at: now().toISOString() });
            return json(200, b.items.length);
          }
          case 'set_invites': {
            if (!mgr) throw new Error('Zaproszenia wysyła kierownik');
            for (const it of b.items) {
              if (it.role !== 'pracownik') throw new Error('Tylko pracownicy');
              allowed.set(it.email.toLowerCase(), { role: 'pracownik', employee_ref: it.employee_ref, display_name: it.display_name });
            }
            return json(200, b.items.length);
          }
          case 'list_invites': {
            if (!mgr) return json(200, []);
            return json(200, [...allowed.entries()].map(([email, a]) => ({ email, ...a, registered: users.has(email) })));
          }
          default: return err(404, `Brak funkcji ${fn}`, 'PGRST202');
        }
      } catch (e) { return err(400, e.message, 'P0001'); }
    }
    if (path.startsWith('/rest/v1/')) {
      const table = path.slice('/rest/v1/'.length);
      if (!m) return json(200, []);
      if (table === 'members') return json(200, [...members.values()].filter(x => x.user_id === m.user_id || m.role === 'kierownik'));
      if (table === 'reports') return json(200, reports.filter(r => r.user_id === m.user_id || m.role === 'kierownik'));
      if (table === 'publications') {
        return json(200, [...publications.values()].filter(p => m.role === 'kierownik' || p.scope === 'zespol' || (p.scope === 'osobiste' && p.employee_ref === m.employee_ref)));
      }
      return err(404, 'not found');
    }
    return err(404, 'not found');
  }

  return {
    fetchImpl, calls, reports, publications, allowed, users,
    invite(email, role, employee_ref, display_name) { allowed.set(email.toLowerCase(), { role, employee_ref, display_name }); },
    setOffline(v) { offline = v; },
    expireAll() { for (const t of tokens.values()) t.exp = 0; },
    today,
  };
}

module.exports = { createFakeSupabase };
