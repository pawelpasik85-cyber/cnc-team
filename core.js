// CNC Team — aplikacja pracownika: logika bez interfejsu (logowanie, kolejka zgłoszeń offline, dane z chmury).
// Działa w przeglądarce, w APK (WebView) i w Node 22 (testy). Bez zależności — czysty fetch.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CNCCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KINDS = { nieobecnosc: 'Nieobecność', spoznienie: 'Spóźnienie', wyjscie: 'Wyjście w trakcie zmiany', inne: 'Inna sprawa' };
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function localDate(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return p; // RRRR-MM-DD
  }
  function addDays(date, n) { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  function hm(min) {
    if (min === null || min === undefined) return 'brak danych';
    const s = min < 0 ? '−' : ''; const a = Math.abs(min);
    return `${s}${Math.floor(a / 60)} h ${String(a % 60).padStart(2, '0')} min`;
  }

  // Walidacja zgłoszenia przed wysłaniem — te same zasady co na serwerze, z czytelnymi komunikatami.
  function validateReport(r, today = localDate()) {
    const errors = [];
    if (!KINDS[r.kind]) errors.push('Wybierz rodzaj zgłoszenia.');
    if (!DATE_RE.test(r.date_from || '')) errors.push('Podaj dzień.');
    const to = r.date_to || r.date_from;
    if (r.date_to && !DATE_RE.test(r.date_to)) errors.push('Niepoprawna data końca.');
    if (DATE_RE.test(r.date_from || '') && to < r.date_from) errors.push('Data końca jest przed datą początku.');
    if (DATE_RE.test(r.date_from || '') && r.date_from < addDays(today, -31)) errors.push('Zgłoszenie może dotyczyć najwyżej 31 dni wstecz.');
    if (DATE_RE.test(r.date_from || '') && DATE_RE.test(to || '') && (Date.parse(to) - Date.parse(r.date_from)) / 86400e3 > 60) errors.push('Zgłoszenie może obejmować najwyżej 60 dni.');
    for (const k of ['time_from', 'time_to']) if (r[k] && !TIME_RE.test(r[k])) errors.push('Niepoprawna godzina.');
    if (r.kind === 'spoznienie' && !r.time_to) errors.push('Podaj, o której przyjdziesz do pracy.');
    if (r.kind === 'wyjscie' && (!r.time_from || !r.time_to)) errors.push('Podaj godzinę wyjścia i powrotu.');
    if (r.note && r.note.length > 500) errors.push('Uwaga może mieć najwyżej 500 znaków.');
    return errors;
  }

  function authMessage(status, body) {
    const raw = (body && (body.msg || body.message || body.error_description)) || '';
    const code = (body && (body.error_code || body.code)) || '';
    if (code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) return 'Nieprawidłowy e-mail lub hasło.';
    if (code === 'user_already_exists' || /already registered/i.test(raw)) return 'Konto już istnieje — zaloguj się hasłem.';
    if (code === 'weak_password' || /password should be/i.test(raw)) return 'Hasło jest za krótkie (minimum 8 znaków).';
    if (/nie ma zaproszenia|database error saving new user/i.test(raw) || code === 'unexpected_failure') return 'Ten adres nie ma zaproszenia. Poproś kierownika o dodanie Twojego e-maila w CNC Team.';
    return raw || `Błąd (${status}).`;
  }

  class NetError extends Error { constructor(msg, status = 0) { super(msg); this.status = status; this.offline = status === 0; } }

  function createClient({ url, key, fetchImpl = (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null), storage, now = () => Date.now(), today = () => localDate() }) {
    const base = url.replace(/\/$/, '');
    const S = {
      get(k, d = null) { try { const v = storage.getItem(`cnc.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
      set(k, v) { try { if (v === null) storage.removeItem(`cnc.${k}`); else storage.setItem(`cnc.${k}`, JSON.stringify(v)); } catch { /* pełna pamięć */ } },
    };

    async function http(method, path, { body, token } = {}) {
      let res;
      try {
        res = await fetchImpl(base + path, {
          method, headers: { apikey: key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch { throw new NetError('Brak połączenia z internetem.'); }
      const text = await res.text();
      let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) throw new NetError(path.startsWith('/auth/') ? authMessage(res.status, data) : ((data && (data.message || data.msg)) || `Błąd serwera (${res.status}).`), res.status);
      return data;
    }

    const saveSession = (t) => S.set('session', { access: t.access_token, refresh: t.refresh_token, exp: now() + t.expires_in * 1000, user_id: t.user.id, email: t.user.email });
    const session = () => S.get('session');

    async function token() {
      const s = session();
      if (!s) throw new NetError('Zaloguj się.', 401);
      if (s.exp - now() > 60e3) return s.access;
      try {
        const t = await http('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh } });
        saveSession(t); return t.access_token;
      } catch (e) {
        if (e.status >= 400 && e.status < 500) { S.set('session', null); throw new NetError('Sesja wygasła — zaloguj się ponownie.', 401); }
        throw e;
      }
    }
    const rpc = async (name, args) => http('POST', `/rest/v1/rpc/${name}`, { body: args, token: await token() });
    const select = async (q) => http('GET', `/rest/v1/${q}`, { token: await token() });

    async function signIn(email, password, { firstTime = false } = {}) {
      email = String(email || '').trim().toLowerCase();
      if (!email || !password) throw new NetError('Podaj e-mail i hasło.', 400);
      if (firstTime) {
        if (String(password).length < 8) throw new NetError('Hasło musi mieć co najmniej 8 znaków.', 400);
        await http('POST', '/auth/v1/signup', { body: { email, password } });
      }
      const t = await http('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
      saveSession(t);
      const me = await select(`members?select=role,display_name,employee_ref&user_id=eq.${encodeURIComponent(t.user.id)}`);
      if (!Array.isArray(me) || !me.length) { S.set('session', null); throw new NetError('Konto nie jest przypisane do zespołu.', 403); }
      if (me[0].role !== 'pracownik') { S.set('session', null); throw new NetError('To konto kierownika — kierownik korzysta z CNC Team na komputerze.', 403); }
      S.set('me', me[0]);
      return me[0];
    }
    function signOut() { for (const k of ['session', 'me', 'pubs', 'reports', 'outbox', 'synced']) S.set(k, null); }

    // Kolejka zgłoszeń: zapis natychmiast na telefonie, wysyłka gdy jest internet (client_id chroni przed duplikatem).
    function queueReport(r) {
      const errors = validateReport(r, today());
      if (errors.length) throw new NetError(errors.join(' '), 400);
      const item = { client_id: uuid(), kind: r.kind, date_from: r.date_from, date_to: r.date_to || r.date_from,
        time_from: r.time_from || '', time_to: r.time_to || '', note: (r.note || '').trim(), queued_at: new Date(now()).toISOString() };
      S.set('outbox', [...S.get('outbox', []), item]);
      return item;
    }
    async function flush() {
      const out = S.get('outbox', []);
      const left = []; let sent = 0; let lastError = null;
      for (const item of out) {
        try {
          const { queued_at, ...p } = item;
          await rpc('submit_report', { p });
          sent++;
        } catch (e) {
          lastError = e;
          if (e.offline || e.status === 401 || e.status >= 500) left.push(item);   // spróbujemy później
          else left.push({ ...item, error: e.message });                          // błąd treści — pokaż użytkownikowi
        }
      }
      S.set('outbox', left);
      return { sent, left: left.length, error: lastError ? lastError.message : null };
    }
    function dropQueued(clientId) { S.set('outbox', S.get('outbox', []).filter(i => i.client_id !== clientId)); }

    async function refresh() {
      const flushed = await flush();
      const [pubs, reports] = await Promise.all([
        select('publications?select=scope,employee_ref,kind,data,published_at'),
        select('reports?select=id,client_id,kind,date_from,date_to,time_from,time_to,note,status,decision_note,created_at,updated_at&order=created_at.desc&limit=100'),
      ]);
      S.set('pubs', pubs); S.set('reports', reports); S.set('synced', new Date(now()).toISOString());
      return { flushed, pubs: pubs.length, reports: reports.length };
    }
    async function withdraw(id) { const r = await rpc('withdraw_report', { report_id: id }); await refresh().catch(() => {}); return r; }

    function state() {
      const pubs = S.get('pubs', []);
      const me = S.get('me');
      const team = (pubs.find(p => p.scope === 'zespol' && p.kind === 'grafik') || {}).data || null;
      const mine = (pubs.find(p => p.scope === 'osobiste' && p.kind === 'moje') || {}).data || null;
      const outbox = S.get('outbox', []);
      const reports = S.get('reports', []);
      // zgłoszenia oczekujące w kolejce pokazujemy razem z wysłanymi (bez duplikatów)
      const sentIds = new Set(reports.map(r => r.client_id));
      const pending = outbox.filter(o => !sentIds.has(o.client_id)).map(o => ({ ...o, id: null, status: o.error ? 'blad' : 'w_kolejce' }));
      return { me, session: session(), team, mine, reports: [...pending, ...reports], outboxCount: pending.length, synced: S.get('synced') };
    }

    // Moje najbliższe zmiany z grafiku zespołu (od dziś)
    function myShifts(st = state(), days = 14) {
      if (!st.team || !st.me) return [];
      const t = today(), end = addDays(t, days);
      const abs = (st.team.nieobecnosci || []).filter(a => a.e === st.me.employee_ref);
      return st.team.zmiany.filter(z => z.e === st.me.employee_ref && z.d >= t && z.d <= end)
        .map(z => ({ ...z, nieobecnosc: abs.find(a => a.od <= z.d && a.do >= z.d) || null }));
    }

    return { signIn, signOut, session, queueReport, flush, dropQueued, refresh, withdraw, state, myShifts, rpc, select };
  }

  return { createClient, validateReport, KINDS, hm, localDate, addDays, uuid, NetError };
}));
