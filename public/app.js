// CNC Team — aplikacja (SPA). Uprawnienia są egzekwowane na serwerze; interfejs tylko ukrywa niedostępne akcje.
'use strict';

const S = { me: null, boot: null, emp: new Map(), cat: new Map() };
const can = (cap) => S.me && S.me.caps.includes(cap);
const isAdmin = () => S.me && S.me.role === 'admin';
const isEmployee = () => S.me && S.me.role === 'employee';
const isGuest = () => S.me && S.me.role === 'guest';

const notEmp = () => S.me && S.me.role !== 'employee' && S.me.role !== 'guest';
// Zgłoszenia programistów i plan pracy z poleceniami — włączane w Ustawieniach (domyślnie wyłączone, egzekwowane na serwerze)
const feat = (key) => !!(S.boot && S.boot.settings && S.boot.settings[key] === 'tak');
const reqOn = () => feat('employee_requests');
const planOn = () => feat('employee_work_plan');
const NAV = [
  ['dzisiaj', 'Centrum programowania', 'today', notEmp],
  ['kalendarz', 'Kalendarz', 'calendar', null],
  ['plan', 'Plan pracy', 'list', () => S.me && S.me.role !== 'guest' && planOn()],
  ['zglos', 'Zgłoś kierownikowi', 'summons', () => isEmployee() && reqOn()],
  ['pracownicy', 'Pracownicy', 'users', () => S.me && S.me.role !== 'guest'],
  ['zdarzenia', 'Lista zdarzeń', 'list', notEmp],
  ['wyjscia', 'Wyjścia i odrabianie', 'exit', notEmp],
  ['absencje', 'Urlopy i absencje', 'leave', 'view.leave.all'],
  ['zgloszenia', 'Zgłoszenia pracowników', 'summons', () => isAdmin() && reqOn()],
  ['projekty', 'Projekty i zadania', 'project', notEmp],
  ['maszyny', 'Tablica maszyn', 'board', notEmp],
  ['narzedzia', 'Narzędzia i oprawki', 'cutter', () => S.me && S.me.role !== 'guest'],
  ['przekazanie', 'Przekazanie zmiany', 'handover', notEmp],
  ['raporty', 'Raporty kierownicze', 'report', 'view.reports'],
  ['analiza', 'Analiza i raporty', 'report', () => S.me && (S.me.role === 'admin' || S.me.role === 'supervisor')],
  ['ustawienia', 'Ustawienia', 'settings', null],
];
// Programista: mój profil, kalendarz, wykaz narzędzi (tylko podgląd) i własne konto; plan pracy i zgłoszenia — gdy włączone
const empRoutes = () => new Set(['kalendarz', 'pracownicy', 'narzedzia', 'ustawienia', ...(planOn() ? ['plan'] : []), ...(reqOn() ? ['zglos'] : [])]);
// Kolejność menu programisty: Mój profil, Kalendarz, (Plan pracy), (Zgłoś kierownikowi), Narzędzia i oprawki, Moje konto
const EMP_ORDER = ['pracownicy', 'kalendarz', 'plan', 'zglos', 'narzedzia', 'ustawienia'];
const navLabel = (id, label) => (id === 'ustawienia' && !isAdmin() ? 'Moje konto' : id === 'pracownicy' && isEmployee() ? 'Mój profil' : label);

// Nie w menu bocznym: urlopy i wyjścia są zakładkami w „Pracownicy”; tablica maszyn powielała Centrum programowania.
// Kierownik: w menu tylko Centrum, Kalendarz, Pracownicy, Projekty, Narzędzia, Raporty kierownicze, Analiza.
// Przekazanie zmiany jest w szczegółach projektu, Ustawienia — pod nazwą konta na dole menu.
const RAIL_HIDDEN = new Set(['wyjscia', 'absencje', 'maszyny', 'zdarzenia', 'przekazanie']);
const railHidden = (id) => RAIL_HIDDEN.has(id) || (id === 'ustawienia' && !isEmployee());
const NAV_PARENT = { wyjscia: 'pracownicy', absencje: 'pracownicy', zdarzenia: 'pracownicy', zestaw: 'analiza', raport: 'analiza', przekazanie: 'projekty' };
// Zakładki widoku Pracownicy (przełączane w tym samym menu)
function peopleTabs(active) {
  if (isEmployee()) return '';
  const tabs = [['pracownicy', 'Pracownicy', 'users'], ...(can('view.leave.all') ? [['absencje', 'Urlopy i absencje', 'leave']] : []), ['wyjscia', 'Wyjścia i odrabianie', 'exit'], ['zdarzenia', 'Lista zdarzeń', 'list']];
  return `<nav class="section-tabs" aria-label="Pracownicy">${tabs.map(([id, l, ic]) => `<a href="#/${id}" class="${id === active ? 'active' : ''}" ${id === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${esc(l)}</span></a>`).join('')}</nav>`;
}

function person(id, { name = true } = {}) {
  const e = S.emp.get(Number(id));
  if (!e) return '<span class="muted">—</span>';
  return `<span class="person"><span class="dot" style="background:${esc(e.color)}" aria-hidden="true">${esc(initials(e))}</span>${name ? esc(`${e.first_name} ${e.last_name}`) : ''}</span>`;
}
const empOptions = (activeOnly = true) => [...S.emp.values()].filter(e => !activeOnly || e.active).map(e => [e.id, `${e.first_name} ${e.last_name}`]);
const machineOptions = () => S.boot.machines.map(m => [m.id, `${m.name} ${m.axes}X / ${m.control}`]);

async function loadBoot() {
  // Gość nie ma dostępu do danych referencyjnych (pracownicy, kategorie) — tylko status projektów.
  if (isGuest()) { S.boot = { machines: [], task_types: [], shift_templates: [], categories: [], employees: [], holidays: [], settings: {}, months: [], causes: [] }; S.emp = new Map(); S.cat = new Map(); return; }
  S.boot = await api('/bootstrap');
  S.emp = new Map(S.boot.employees.map(e => [e.id, e]));
  S.cat = new Map(S.boot.categories.map(c => [c.id, c]));
}

// ---------- Start / logowanie ----------
async function start() {
  // motyw „Industrial” (ciemny) jest domyślny; jasny — z przycisku „Motyw” (zapamiętany na urządzeniu)
  const theme = localStorageGet('cnc-theme');
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  try { S.me = await api('/me'); } catch (e) {
    if (e.status === 0) {
      $('#app').innerHTML = `<div class="login"><div class="panel" style="max-width:380px"><h3>${icon('alert')} Brak połączenia</h3><p class="small">${esc(e.message)}</p><button class="primary" id="retryBtn">Spróbuj ponownie</button></div></div>`;
      $('#retryBtn').onclick = start;
      return;
    }
    return renderLogin();
  }
  await loadBoot();
  renderShell();
  window.addEventListener('hashchange', route);
  route();
  startNotify();
}

// ---------- Powiadomienia: licznik w menu, pasek na każdej stronie, powiadomienie systemowe i dźwięk przy nowym zgłoszeniu ----------
const NOTIFY = { timer: null, seen: null, data: null };
function notifySeenKey() { return `cnc-notify-${S.me && S.me.id}`; }
async function pollNotify(first = false) {
  if (!S.me || (S.me.role !== 'admin' && S.me.role !== 'employee')) return;
  let d;
  try { d = await api('/notify'); } catch { return; }
  NOTIFY.data = d;
  if (!reqOn()) { d = { ...d, pending_requests: [], decided: [] }; NOTIFY.data = d; }
  const ids = d.role === 'admin' ? d.pending_requests.map(r => r.id) : d.decided.map(r => `${r.id}:${r.status}`);
  let seen;
  try { seen = new Set(JSON.parse(localStorageGet(notifySeenKey()) || '[]')); } catch { seen = new Set(); }
  const fresh = ids.filter(x => !seen.has(String(x)));
  renderNotify(d);
  if (fresh.length && !first) alertNew(d, fresh);
  if (fresh.length && first && d.role === 'admin') alertNew(d, fresh, { quiet: true });
  localStorageSet(notifySeenKey(), JSON.stringify(ids.map(String)));
}
function notifyText(d, fresh) {
  if (d.role === 'admin') {
    const list = d.pending_requests.filter(r => fresh.includes(r.id));
    const who = list.map(r => { const e = S.emp.get(r.employee_id); return `${e ? `${e.first_name} ${e.last_name}` : ''}: ${r.wanted_code && typeof WANTED_LABEL !== 'undefined' ? WANTED_LABEL[r.wanted_code] : REQ_KIND[r.kind][0]} ${plDate(r.date_from)}${r.date_to && r.date_to !== r.date_from ? `–${plDate(r.date_to)}` : ''}`; });
    return { title: list.length === 1 ? 'Nowe zgłoszenie do akceptacji' : `Nowe zgłoszenia do akceptacji: ${list.length}`, body: who.join('\n'), hash: '#/zgloszenia' };
  }
  const list = d.decided.filter(r => fresh.includes(`${r.id}:${r.status}`));
  return { title: 'Decyzja kierownika', body: list.map(r => `${r.wanted_code && typeof WANTED_LABEL !== 'undefined' ? WANTED_LABEL[r.wanted_code] : REQ_KIND[r.kind][0]} ${plDate(r.date_from)}: ${r.status === 'przyjete' ? 'PRZYJĘTE' : 'ODRZUCONE'}${r.decision_note ? ` — ${r.decision_note}` : ''}`).join('\n'), hash: '#/zglos' };
}
function alertNew(d, fresh, { quiet = false } = {}) {
  const t = notifyText(d, fresh);
  toast(`${t.title}${t.body ? ` — ${t.body.split('\n')[0]}` : ''}`, 'warn', 20000);
  if (quiet) return;
  try { // krótki sygnał dźwiękowy
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.5);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.5);
  } catch { /* przeglądarka zablokowała dźwięk */ }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(t.title, { body: t.body, tag: 'cnc-notify', renotify: true, icon: '/icons/icon-192.png' });
      n.onclick = () => { window.focus(); location.hash = t.hash; n.close(); };
    }
  } catch { /* brak obsługi powiadomień */ }
}
function renderNotify(d) {
  const n = d.role === 'admin' ? d.pending_requests.length : d.decided.length;
  const nAll = d.role === 'admin' ? n + (d.pending_makeups || 0) : 0;
  document.title = d.role === 'admin' && nAll ? `(${nAll}) CNC Team` : 'CNC Team';
  $$('[data-badge]').forEach(b => b.remove());
  const badge = (el, count, cls = '') => { if (el && count) el.insertAdjacentHTML('beforeend', `<span class="nav-badge ${cls}" data-badge>${count}</span>`); };
  if (d.role === 'admin') {
    badge($('#rail a[data-nav="zgloszenia"]'), n);
    badge($('#rail a[data-nav="pracownicy"]'), d.pending_makeups, 'soft');
    badge($('#moreBtn'), nAll);
    badge($('.tabbar a[data-nav="dzisiaj"]'), n);
  }
  // pasek na górze każdej strony (kierownik) — nie da się przeoczyć
  let bar = $('#notifyBar');
  if (d.role === 'admin' && (n || d.pending_makeups)) {
    if (!bar) { bar = document.createElement('div'); bar.id = 'notifyBar'; bar.className = 'notify-bar no-print'; $('#main').prepend(bar); }
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    bar.innerHTML = `${icon('alert')}<span><b>Czeka na Twoją decyzję:</b> ${n ? `zgłoszenia pracowników: <b>${n}</b>` : ''}${n && d.pending_makeups ? ' · ' : ''}${d.pending_makeups ? `odrabiania do zatwierdzenia: <b>${d.pending_makeups}</b>` : ''}</span>
      ${n ? '<a class="btn primary" href="#/zgloszenia">Rozpatrz</a>' : ''}${d.pending_makeups ? '<a class="btn" href="#/wyjscia">Odrabiania</a>' : ''}
      ${perm === 'default' ? '<button type="button" class="btn" id="notifyPerm">Włącz powiadomienia systemowe</button>' : ''}`;
    const pb = $('#notifyPerm'); if (pb) pb.onclick = async () => { try { await Notification.requestPermission(); } catch { /* */ } renderNotify(d); };
  } else if (bar) bar.remove();
}
function startNotify() {
  clearInterval(NOTIFY.timer);
  pollNotify(true);
  NOTIFY.timer = setInterval(() => pollNotify(false), 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pollNotify(false); });
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* brak */ } }
window.addEventListener('cnc-logout', () => { S.me = null; renderLogin(); });

function renderLogin() {
  $('#app').innerHTML = `<div class="login"><div class="login-wrap">
    <div class="login-hero"><h1>CNC Team<span>Centrum programowania</span></h1>
      <p>Hartford 3X · Grimme 5X — projekty, ludzie, narzędzia i analiza pracy w jednym miejscu.</p>
      <div class="login-feats">
        <div>${icon('today')}<b>Maszyny na żywo</b><span>projekt, postęp, termin</span></div>
        <div>${icon('project')}<b>Projekty i zadania</b><span>plan i wykonanie</span></div>
        <div>${icon('cutter')}<b>Narzędzia i oprawki</b><span>katalog i stany</span></div>
        <div>${icon('report')}<b>Analiza i raporty</b><span>PDF i obraz do wysłania</span></div>
      </div></div><form>
    <div class="brand">${appLogo(44)}<div>Zaloguj się<small>CNC Team</small></div></div>
    <label class="field">Login<input name="login" autocomplete="username" required></label>
    <label class="field">Hasło<input name="password" type="password" autocomplete="current-password" required></label>
    <div class="form-error" role="alert"></div>
    <button class="primary" type="submit">Zaloguj</button></form></div></div>`;
  $('.login form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/login', { method: 'POST', body: { login: e.target.login.value, password: e.target.password.value } });
      location.hash = ''; start();
    } catch (err) { $('.form-error').textContent = err.message; }
  });
}

function renderShell() {
  const roleName = { admin: 'Administrator', supervisor: 'Przełożony', employee: 'Pracownik', guest: 'Gość' }[S.me.role];
  const tabs = isGuest() ? [['status', 'Status', 'project']]
    : isEmployee() ? [['pracownicy', 'Profil', 'users'], ['kalendarz', 'Kalendarz', 'calendar'], ...(planOn() ? [['plan', 'Plan', 'list']] : []), ...(reqOn() ? [['zglos', 'Zgłoś', 'summons']] : []), ['narzedzia', 'Narzędzia', 'cutter']]
      : [['dzisiaj', 'Centrum', 'today'], ['kalendarz', 'Kalendarz', 'calendar'], ['projekty', 'Projekty', 'project'], ['analiza', 'Analiza', 'report']];
  let nav = isGuest() ? [['status', 'Status projektów', 'project', null], ['ustawienia', 'Moje konto', 'settings', null]] : NAV.filter(n => !railHidden(n[0]) && (typeof n[3] === 'function' ? n[3]() : (!n[3] || can(n[3]))));
  if (isEmployee()) nav = EMP_ORDER.map(id => nav.find(n => n[0] === id)).filter(Boolean);
  $('#app').innerHTML = `<div class="shell">
    <header class="appbar"><button type="button" class="appbar-menu" id="menuBtn" aria-label="Otwórz menu" aria-expanded="false" aria-controls="rail">${icon('list')}</button>
      <span class="appbar-title" id="appbarTitle">CNC Team</span>${appLogo(30)}</header>
    <div class="scrim" id="scrim" hidden></div>
    <nav class="rail" id="rail" aria-label="Menu główne">
    <div class="brand">${appLogo(40)}<div>CNC Team<small>${esc(S.boot.settings.company_name || '')}</small></div></div>
    ${nav.map(([id, label, ic]) => `<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${esc(navLabel(id, label))}</span></a>`).join('')}
    <div class="who"><strong>${esc(S.me.display_name)}</strong>${esc(roleName)}<br>
      ${!isEmployee() && !isGuest() ? `<a href="#/ustawienia" data-nav="ustawienia" class="who-link">${icon('settings')}${isAdmin() ? 'Ustawienia' : 'Moje konto'}</a>` : ''}
      <button type="button" id="themeBtn" class="link">${icon('theme')}Motyw</button>
      <button type="button" id="logoutBtn" class="link">${icon('logout')}Wyloguj</button></div>
  </nav><main class="main" id="main" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Szybka nawigacja">${tabs.map(([id, label, ic]) => `<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${label}</span></a>`).join('')}
      <button type="button" id="moreBtn">${icon('settings')}<span>Więcej</span></button></nav></div>`;
  const setDrawer = (open) => {
    $('#rail').classList.toggle('open', open); $('#scrim').hidden = !open;
    $('#menuBtn').setAttribute('aria-expanded', String(open));
    if (open) $('#rail a.active, #rail a')?.focus();
  };
  $('#menuBtn').onclick = () => setDrawer(!$('#rail').classList.contains('open'));
  $('#moreBtn').onclick = () => setDrawer(true);
  $('#scrim').onclick = () => setDrawer(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#rail')?.classList.contains('open')) setDrawer(false); });
  window.addEventListener('hashchange', () => setDrawer(false));
  $('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }); S.me = null; renderLogin(); };
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorageSet('cnc-theme', next);
  };
}

const VIEWS = {};
async function route() {
  if (!S.me) return;
  let [name, ...rest] = (location.hash.replace(/^#\/?/, '').split('?')[0] || (isGuest() ? 'status' : isEmployee() ? 'pracownicy' : 'dzisiaj')).split('/');
  if (isGuest() && name !== 'ustawienia') name = 'status';
  if (isEmployee() && !empRoutes().has(name)) name = 'pracownicy';
  // wyłączone moduły: plan pracy i zgłoszenia — kierownik trafia do Centrum
  if (!isEmployee() && ((name === 'plan' && !planOn()) || (name === 'zgloszenia' && !reqOn()))) name = 'dzisiaj';
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (NAV_PARENT[name] || name)));
  const navItem = isGuest() ? (name === 'status' ? ['status', 'Status projektów'] : ['ustawienia', 'Moje konto']) : NAV.find(n => n[0] === name);
  if ($('#appbarTitle')) $('#appbarTitle').textContent = navItem ? navLabel(navItem[0], navItem[1]) : 'CNC Team';
  const main = $('#main');
  main.innerHTML = '<p class="muted">Wczytywanie…</p>';
  try { await (VIEWS[name] || VIEWS.dzisiaj)(main, rest); } catch (e) {
    main.innerHTML = `<div class="notice danger">${esc(e.status === 403 ? 'Brak uprawnień do tego widoku.' : e.message)}</div>`;
  }
  if (NOTIFY.data) renderNotify(NOTIFY.data); // pasek powiadomień wraca na każdej stronie
}
const rerender = () => route();
function head(title, sub = '', tools = '') {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="toolbar">${tools}</div></div>`;
}
function btn(id, label, ic = 'plus', cls = 'primary') { return `<button type="button" class="${cls}" id="${id}">${icon(ic)}${esc(label)}</button>`; }
function on(id, fn) { const el = document.getElementById(id); if (el) el.onclick = fn; }
async function post(path, body, idem, method = 'POST') { const r = await api(path, { method, body, idem }); toast('Zapisano.'); setTimeout(rerender, 50); return r; }

// ---------- Centrum programowania — „Dzisiaj” ----------
VIEWS.dzisiaj = async (main) => {
  const d = await api('/today');
  setTimeout(() => $$('[data-ack]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/work-orders/${b.dataset.ack}/ack`, { method: 'POST' }); toast('Potwierdzono.'); rerender(); } catch (e) { toast(e.message, 'err'); b.disabled = false; } }), 0);
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t]));
  const shifts = d.shifts.map(s => `<li>${person(s.employee_id)} — ${tag(tpl.get(s.shift_template_id)?.name || 'zmiana')} <span class="muted">${s.start.time}–${s.end.time}${s.work_date !== d.today ? ' (od wczoraj)' : ''}</span></li>`).join('');
  const abs = d.absences.map(a => `<li>${person(a.employee_id)} — <span class="leave-chip tone-${absTone(a.icon, a.code || a.category_short)}">${esc(a.category_label)}</span> <span class="muted">${a.status}</span></li>`).join('');
  const alerts = (d.alerts || []).map(a => `<li>${icon('alert')} ${esc(a.message)}${a.remaining_min != null ? ` <b>${hm(a.remaining_min)}</b> pozostało, zmian do końca miesiąca: ${a.remaining_shifts ?? '—'}` : ''}</li>`).join('');
  const reminders = (d.leave_reminders || []).map(r => `<li>${r.level === 'ostrzezenie' ? tag('ostrzeżenie', 'warn', 'alert') : tag('przypomnienie', 'accent')} ${esc(r.name)}: pula ${r.year}, saldo ${hm(r.balance_min)}. <span class="muted">${esc(r.text)}</span></li>`).join('');
  main.innerHTML = head('Centrum programowania', `Dzisiaj: ${plDate(d.today)} · strefa Europe/Warsaw`) + `
    <div class="machines">${d.board.map(b => machineInfo(b, d.today)).join('')}</div>
    ${d.active_projects ? deadlinesPanel(d.active_projects, d.today) : ''}
    <h2 class="section-h">Pozostałe informacje</h2>
    <div class="cols">
      <section class="panel"><h3>Na zmianie dziś</h3><ul class="plain">${shifts || '<li class="muted">Brak zmian w grafiku.</li>'}</ul></section>
      <section class="panel"><h3>Nieobecności dziś</h3><ul class="plain">${abs || '<li class="muted">Brak nieobecności.</li>'}</ul></section>
      ${d.my_orders ? `<section class="panel"><h3>Moje polecenia na dziś</h3><ol class="orders">${d.my_orders.map(o => orderCard(o, { mine: true })).join('') || '<li class="muted small empty-orders">Brak poleceń na dziś.</li>'}</ol>
        <p><a class="btn" href="#/plan">${icon('list')}Polecenia na dziś i jutro</a></p></section>` : ''}
      ${d.my_requests ? `<section class="panel"><h3>Moje zgłoszenia</h3><ul class="plain">${d.my_requests.map(r => `<li>${icon(REQ_KIND[r.kind][1])} ${esc(REQ_KIND[r.kind][0])} · ${plDate(r.date_from)} ${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small muted">${esc(r.decision_note)}</span>` : ''}</li>`).join('') || '<li class="muted">Brak zgłoszeń.</li>'}</ul>
        <p><a class="btn primary" href="#/zglos">${icon('summons')}Zgłoś spóźnienie, nieobecność lub odrobienie</a></p></section>` : ''}
      ${d.my_balance ? `<section class="panel"><h3>Moje saldo do odrobienia (${plMonth(d.today.slice(0, 7))})</h3><div class="stat-row"><div class="stat"><b>${hm(d.my_balance.remaining_min)}</b><span>pozostało</span></div><div class="stat"><b>${d.my_balance.remaining_shifts}</b><span>zmian do końca miesiąca</span></div></div></section>` : ''}
      <section class="panel"><h3>Alerty rozliczeń</h3><ul class="plain">${alerts || '<li class="muted">Brak aktywnych alertów.</li>'}</ul>
        ${d.pending_makeups ? `<p class="notice">Odrabiania oczekujące na zatwierdzenie: ${d.pending_makeups}. <a href="#/wyjscia">Przejdź</a></p>` : ''}
        ${d.pending_requests && reqOn() ? `<p class="notice">Zgłoszenia pracowników do decyzji: ${d.pending_requests}. <a href="#/zgloszenia">Przejdź</a></p>` : ''}
        ${d.orders_today && planOn() ? `<p class="notice info">Plan pracy na dziś: ${d.orders_today.n} poleceń${d.orders_today.unread ? `, nieprzeczytane: <b>${d.orders_today.unread}</b>` : ''}. <a href="#/plan">Przejdź</a></p>` : ''}</section>
      ${d.leave_reminders ? `<section class="panel"><h3>Zaległy urlop</h3><ul class="plain">${reminders || '<li class="muted">Brak zaległych pul.</li>'}</ul></section>` : ''}
      <section class="panel"><h3>Ostatnie przekazania zmian</h3><ul class="plain">${d.handovers.map(h => `<li><span class="mono">${esc(h.order_no)}</span> ${esc(h.part_no)} · ${plDate(h.shift_date)} · ${person(h.from_employee_id, { name: false })} → ${person(h.to_employee_id, { name: false })}<br><span class="muted">${esc(h.remaining_text)}</span></li>`).join('') || '<li class="muted">Brak.</li>'}</ul></section>
    </div>`;
};

const PROGRAM_STATUS = { brak: 'brak', w_przygotowaniu: 'w przygotowaniu', gotowy: 'gotowy', zweryfikowany: 'zweryfikowany' };

// ---------- Centrum programowania: jedna karta na maszynę (parametry + aktualny projekt) ----------
const dniPl = (n) => `${n} ${Math.abs(n) === 1 ? 'dzień' : 'dni'}`;
const PRIO_LABEL = { 1: 'najwyższy', 2: 'wysoki', 3: 'normalny', 4: 'niski', 5: 'najniższy' };
function prioChip(p) { return `<span class="prio prio-${Math.min(5, Math.max(1, Number(p) || 3))}" title="Priorytet (1 = najwyższy)">P${esc(p)} · ${esc(PRIO_LABEL[p] || '')}</span>`; }
// termin: ile dni zostało albo ile po terminie
function dueInfo(due, today, done = false) {
  if (!due) return { text: 'brak terminu', cls: '' };
  if (done) return { text: 'zakończony', cls: 'ok' };
  const n = daysBetween(today, due);
  if (n < 0) return { text: `${dniPl(-n)} po terminie`, cls: 'danger' };
  if (n === 0) return { text: 'termin dziś', cls: 'danger' };
  return { text: `za ${dniPl(n)}`, cls: n <= 3 ? 'warn' : '' };
}
// stan względem planu w jednym zdaniu
function planState(s) {
  if (!s) return { label: 'brak danych', cls: '', text: '' };
  const lvl = DELAY_LEVEL[s.level] || DELAY_LEVEL.brak_danych;
  const text = s.planned_percent === null || s.planned_percent === undefined ? (s.note || '')
    : s.delay_pct > 0 ? `opóźnienie ${s.delay_pct}%${s.level === 'zgodnie' ? ' (w tolerancji)' : ''}` : s.ahead_pct > 0 ? `przed planem ${s.ahead_pct}%` : 'zgodnie z planem';
  const extra = s.overdue_tasks ? ` · zadania po terminie: ${s.overdue_tasks}` : '';
  return { label: lvl[0], cls: lvl[1], text: text + extra, late: s.level === 'opozniony' || s.level === 'zagrozony', done: s.level === 'zakonczony' };
}
// pasek postępu: wykonano / pozostało + znacznik planu na dziś
function progressBig(s, prog, exec) {
  const a = s && s.actual_percent !== null && s.actual_percent !== undefined ? s.actual_percent : null;
  const pl = s && s.planned_percent !== null && s.planned_percent !== undefined ? s.planned_percent : null;
  const late = !!(s && (s.level === 'opozniony' || s.level === 'zagrozony'));
  return `<div class="mi-prog">
    <div class="mi-prog-head"><div><b>${a === null ? '—' : `${a}%`}</b><span>wykonano</span></div><div class="right"><b>${a === null ? '—' : `${100 - a}%`}</b><span>pozostało</span></div></div>
    <div class="mi-track ${late ? 'late' : ''}" role="progressbar" aria-label="Postęp projektu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${a ?? 0}">
      <div class="fill" style="width:${a ?? 0}%"></div>${pl !== null ? `<i class="plan-mark" style="left:${Math.min(100, pl)}%" title="Plan na dziś ${pl}%"></i>` : ''}</div>
    ${pl !== null ? `<p class="mi-prog-note small"><span class="pm-key"></span> plan na dziś <b>${pl}%</b>${late ? ` · brakuje <b>${pl - a}%</b>` : a !== null && a > pl ? ` · zapas <b>${a - pl}%</b>` : ''}</p>` : ''}
    <div class="mi-sub"><span>Przygotowanie programu</span><div class="mini"><i style="width:${prog?.percent ?? 0}%"></i></div><b>${prog?.percent ?? '—'}${prog?.percent != null ? '%' : ''}</b>
      <span>Wykonanie detalu</span><div class="mini exec"><i style="width:${exec?.percent ?? 0}%"></i></div><b>${exec?.percent ?? '—'}${exec?.percent != null ? '%' : ''}</b></div>
  </div>`;
}
function machineInfo(b, today) {
  const m = b.machine, th = machineTheme(m), p = b.project_full, st = b.project_start;
  const blocked = b.block_reason || (b.project && b.project.blocked);
  const fact = (label, value, extra = '') => `<div class="mi-fact ${extra}"><dt>${label}</dt><dd>${value}</dd></div>`;
  let body;
  if (p) {
    const s = p.schedule, ps = planState(s), due = dueInfo(p.due_date, today, ps.done);
    const startDate = st ? st.date : p.start_date;
    const lasted = startDate && startDate <= today ? daysBetween(startDate, today) + 1 : null;
    const work = startDate && startDate <= today ? workdaysIn(startDate, today) : null;
    const planDays = p.start_date && p.due_date ? daysBetween(p.start_date, p.due_date) + 1 : null;
    const h = p.hours;
    const r = h ? hoursResult(h) : null;
    const tech = (p.tech_data || []).filter(t => !t.stale);
    const withAct = tech.filter(t => t.machine_actual_min != null);
    const mEst = tech.reduce((a, t) => a + (t.machine_est_min || 0), 0), mAct = withAct.reduce((a, t) => a + t.machine_actual_min, 0);
    const mEstDone = withAct.reduce((a, t) => a + (t.machine_est_min || 0), 0);
    body = `
      <div class="mi-proj">
        <p class="mi-kicker">Aktualny projekt</p>
        <h3><a href="#/projekty/${encodeURIComponent(p.id)}"><span class="mono">${esc(p.order_no)}</span> · ${esc(p.part_no)} <span class="rev">rev ${esc(p.part_rev)}</span></a></h3>
        <p class="small muted mi-desc">${esc(p.part_family || 'bez rodziny')}${p.description ? ` · ${esc(p.description)}` : ''}</p>
        <div class="mi-chips">${tag(ps.label, ps.cls, ps.cls === 'warn' || ps.cls === 'danger' ? 'alert' : ps.cls === 'ok' ? 'check' : '')}${ps.text && ps.text !== ps.label ? `<span class="mi-state ${ps.cls}">${esc(ps.text)}</span>` : ''}${prioChip(p.priority)}${blocked ? tag(b.block_reason || p.block_reason || 'blokada', 'danger', 'block') : ''}${p.tasks && p.tasks.some(t => t.status === 'zablokowane') ? tag('zablokowane zadanie', 'warn', 'alert') : ''}</div>
      </div>
      ${progressBig(s, p.progress_program, p.progress_execution)}
      <dl class="mi-facts">
        ${fact(startDate && startDate > today ? 'Planowany start' : 'Rozpoczęty', startDate ? `<b>${DOW[weekday(startDate) - 1]} ${plDate(startDate)}</b>${st && st.shift ? `<br><span class="small">zmiana ${esc(st.shift.short || '')} ${esc(st.shift.start)}–${esc(st.shift.end)}</span>` : st && st.source === 'czas' ? '<br><span class="small muted">poza grafikiem</span>' : ''}${st && st.employee_id ? `<br>${person(st.employee_id)}` : ''}${st && st.source === 'projekt' ? '<br><span class="small muted">data z projektu</span>' : ''}` : '—')}
        ${fact('Trwa', lasted ? `<b>${dniPl(lasted)}</b><br><span class="small muted">${work} dni rob.${planDays ? ` · plan wg dat projektu: ${dniPl(planDays)}` : ''}</span>` : '<span class="muted">jeszcze nie rozpoczęty</span>')}
        ${fact('Termin', `<b>${plDate(p.due_date)}</b><br><span class="tag ${due.cls}">${esc(due.text)}</span>`, due.cls)}
        ${fact('Przewidywany koniec', b.expected_end_at ? `<b>${esc(new Date(b.expected_end_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }))}</b><br><span class="small muted">${esc(b.expected_end_source || '')}</span>` : '<span class="muted">brak danych</span>')}
      </dl>
      ${h ? `<div class="mi-time">
        <h4>Czas programowania</h4>
        <div class="mi-tiles">
          <div><span>Przewidywany (plan)</span><b>${hShort(h.planned_min || null)}</b>${h.tasks_without_plan ? `<i>bez planu: ${h.tasks_without_plan} zad.</i>` : ''}</div>
          <div><span>Rzeczywisty</span><b>${hShort(h.worked_min)}</b>${h.use_pct != null ? `<i>${h.use_pct}% planu</i>` : ''}${h.overtime_work_min ? `<i>w nadgodzinach ${hShort(h.overtime_work_min)} (${h.overtime_share_pct}%)</i>` : ''}</div>
          <div class="${h.over_min > 0 ? 'bad' : ''}"><span>${h.over_min > 0 ? 'Ponad plan' : 'Pozostało'}</span><b>${hShort(h.over_min > 0 ? h.over_min : h.remaining_min)}</b>${h.forecast_min ? `<i>prognoza ${hShort(h.forecast_min)}</i>` : ''}</div>
        </div>
        ${r ? `<p class="small mi-result"><span class="result-chip ${r.cls}">${esc(r.big)}</span> ${esc(r.line)}</p>` : ''}
      </div>` : ''}
      ${tech.length ? `<p class="small mi-mtime">${icon('nc')} Czas maszyny (${tech.map(t => esc(t.operation_id)).join(', ')}): przewidywany <b>${hShort(mEst || null)}</b> · rzeczywisty <b>${withAct.length ? hShort(mAct) : '<span class="muted">brak danych</span>'}</b>${withAct.length && withAct.length < tech.length ? ` <span class="muted">(${withAct.length} z ${tech.length} operacji; przewidywany dla nich ${hShort(mEstDone || null)})</span>` : ''}</p>` : ''}`;
  } else {
    body = `<p class="muted small mi-none">Brak projektu na tej maszynie.</p>`;
  }
  return `<article class="mi theme-${th} ${blocked ? 'blocked' : ''}">
    <header class="mi-head">
      <div class="mi-emb">${machineEmblem(th, 46)}<b>${m.axes}X</b><span>${esc(m.control)}</span></div>
      <div class="mi-mach"><div class="mi-name"><h2>${esc(m.name)} <span class="model">${esc(m.model || '')}</span></h2>${m.tool_holder ? `<span class="holder" title="Oprawki narzędziowe">${esc(m.tool_holder)}</span>` : ''}</div>
        <details class="mi-params" open><summary>Parametry maszyny</summary><p class="small">${m.axes} osie · sterowanie ${esc(m.control)}${m.tool_holder ? ` · oprawki ${esc(m.tool_holder)}` : ''}${m.plate ? ` · ${esc(m.plate)}` : ''}${m.notes ? `<br>${esc(m.notes)}` : ''}</p></details></div>
    </header>
    <div class="mi-body">${body}
      <dl class="mi-work">
        <dt>Etap</dt><dd>${esc(b.stage || '—')}</dd>
        <dt>Program NC</dt><dd>${b.project && b.project.nc_program ? `<span class="mono">${esc(b.project.nc_program)} · rev ${esc(b.project.nc_rev)}</span>` : '<span class="muted">brak danych</span>'}</dd>
        <dt>Osoba</dt><dd>${b.assignee_id ? person(b.assignee_id) : '—'}</dd>
        <dt>Następne zadanie</dt><dd>${b.next_task ? esc(b.next_task.title) : '—'}</dd>
        <dt>Kolejny program</dt><dd>${tag(PROGRAM_STATUS[b.next_program_status] || 'brak', b.next_program_status === 'zweryfikowany' ? 'ok' : b.next_program_status === 'gotowy' ? 'accent' : '')}</dd>
        ${p ? `<dt>Odpowiedzialni</dt><dd>${(p.responsible_ids || []).map(id => person(id)).join(', ') || '—'}</dd>
        <dt>Projekt</dt><dd><span class="mono small">${esc(p.id)}</span> · ${esc(p.status)}</dd>` : ''}
      </dl>
      <p class="mi-links small no-print">${p ? `<a href="#/projekty/${encodeURIComponent(p.id)}">Otwórz projekt ›</a>` : ''}${isAdmin() ? `<a href="#/maszyny">${icon('board')}Zmień kartę maszyny</a>` : ''}</p>
    </div></article>`;
}
// Terminy, priorytety i opóźnienia — wszystkie aktywne projekty, od najważniejszych
function deadlinesPanel(list, today) {
  const rows = [...list].sort((a, b) => (a.priority - b.priority) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  return `<section class="panel dl-panel"><h3>Terminy, priorytety i opóźnienia</h3>
    <p class="small muted">Aktywne projekty od najwyższego priorytetu, potem od najbliższego terminu.</p>
    <ul class="dl-list">${rows.map(p => {
      const ps = planState(p.schedule), due = dueInfo(p.due_date, today, planState(p.schedule).done), a = p.schedule ? p.schedule.actual_percent : null, pl = p.schedule ? p.schedule.planned_percent : null;
      const r = p.hours ? hoursResult(p.hours) : null;
      return `<li class="dl-row ${ps.cls}">
        <div class="dl-proj">${prioChip(p.priority)}<a href="#/projekty/${encodeURIComponent(p.id)}"><span class="mono">${esc(p.order_no)}</span> · ${esc(p.part_no)}</a><span class="small muted">${esc(p.part_family || '')}</span></div>
        <div class="dl-mach">${machineChip(p)}</div>
        <div class="dl-due"><b>${plDate(p.due_date)}</b> <span class="tag ${due.cls}">${esc(due.text)}</span></div>
        <div class="dl-prog"><div class="mi-track sm ${ps.late ? 'late' : ''} theme-${machineTheme(p)}"><div class="fill" style="width:${a ?? 0}%"></div>${pl !== null && pl !== undefined ? `<i class="plan-mark" style="left:${Math.min(100, pl)}%"></i>` : ''}</div><span class="small">${a === null || a === undefined ? '—' : `${a}%`}${pl !== null && pl !== undefined ? ` / plan ${pl}%` : ''}</span></div>
        <div class="dl-state">${tag(ps.label, ps.cls)}${ps.text && ps.text !== ps.label ? ` <span class="small">${esc(ps.text)}</span>` : ''}${r && r.cls === 'over' ? ` <span class="result-chip over" title="${esc(r.line)}">${esc(r.big)}</span>` : ''}${p.blocked ? ` ${tag('blokada', 'danger', 'block')}` : ''}</div>
      </li>`; }).join('') || '<li class="muted">Brak aktywnych projektów.</li>'}</ul></section>`;
}
function plate(b) {
  const m = b.machine;
  const p = b.project;
  const blocked = b.block_reason || (p && p.blocked);
  const th = machineTheme(m);
  return `<article class="plate theme-${th} ${blocked ? 'blocked' : ''}">
    <div class="axes">${machineEmblem(th, 58)}<b>${m.axes}X</b><span>${esc(m.control)}</span></div>
    <div class="body"><div class="title"><h3>${esc(m.name)} <span class="model">${esc(m.model || 'model do uzupełnienia')}</span></h3>${m.tool_holder ? `<span class="holder" title="Oprawki narzędziowe">${esc(m.tool_holder)}</span>` : ''}</div>
    ${m.plate ? `<p class="plate-data small muted">${esc(m.plate)}</p>` : ''}
    <dl>
      <dt>Projekt</dt><dd>${p ? `<a href="#/projekty/${encodeURIComponent(p.id)}"><span class="mono">${esc(p.order_no)}</span></a> ${esc(p.part_no)} rev ${esc(p.part_rev)}` : '<span class="muted">brak</span>'}</dd>
      <dt>Program NC</dt><dd>${p && p.nc_program ? `<span class="mono">${esc(p.nc_program)} · rev ${esc(p.nc_rev)}</span>` : '<span class="muted">brak danych</span>'}</dd>
      <dt>Etap</dt><dd>${esc(b.stage || '—')}</dd>
      <dt>Osoba</dt><dd>${b.assignee_id ? person(b.assignee_id) : '—'}</dd>
      <dt>Następne zadanie</dt><dd>${b.next_task ? esc(b.next_task.title) : '—'}</dd>
      <dt>Kolejny program</dt><dd>${tag(PROGRAM_STATUS[b.next_program_status] || 'brak', b.next_program_status === 'zweryfikowany' ? 'ok' : b.next_program_status === 'gotowy' ? 'accent' : '')}</dd>
      <dt>Przewidywany koniec</dt><dd>${b.expected_end_at ? `${esc(new Date(b.expected_end_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }))} <span class="muted">(${esc(b.expected_end_source)})</span>` : '<span class="muted">brak danych</span>'}</dd>
      ${blocked ? `<dt>Blokada</dt><dd>${tag(b.block_reason || p.block_reason, 'danger', 'block')}</dd>` : ''}
    </dl></div></article>`;
}

// ---------- Kalendarz ----------
const EVENT_ICON = { nieobecnosc: 'absence', wyjscie: 'exit', odrabianie: 'makeup', przekazanie: 'handover' };
// Zdarzenia narysowane w kalendarzu (do okienka ze szczegółami po kliknięciu)
let CAL_EV = [];
const calEv = (ev) => { CAL_EV.push(ev); return CAL_EV.length - 1; };
// Proste okno informacyjne (bez formularza)
function infoDialog(title, html) {
  const dlg = document.createElement('dialog');
  dlg.className = 'info-dialog';
  dlg.innerHTML = `<form method="dialog"><header><h3>${esc(title)}</h3><button type="button" class="link" data-close aria-label="Zamknij">✕</button></header><div class="content">${html}</div><footer><button type="button" class="primary" data-close>Zamknij</button></footer></form>`;
  document.body.appendChild(dlg);
  const back = document.activeElement;
  const close = () => { dlg.close(); dlg.remove(); if (back && back.isConnected && back.focus) back.focus(); };
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', close));
  $$('a[href^="#"]', dlg).forEach(a => a.addEventListener('click', () => { dlg.close(); dlg.remove(); })); // przejście do innej strony zamyka okno
  dlg.addEventListener('cancel', () => { dlg.remove(); if (back && back.isConnected && back.focus) back.focus(); });
  dlg.showModal();
  return dlg;
}
const EV_KIND_LABEL = { nieobecnosc: 'Nieobecność', wyjscie: 'Wyjście prywatne', odrabianie: 'Odrabianie', przekazanie: 'Przekazanie zmiany' };
// Okienko: co to za nieobecność / zdarzenie (pracownik widzi tylko to, co pozwala jego uprawnienie — etykieta z serwera)
function eventInfo(ev) {
  const e = S.emp.get(ev.employee_id);
  const range = ev.end_date && ev.end_date !== ev.date ? `${DOW[weekday(ev.date) - 1]} ${plDate(ev.date)} – ${DOW[weekday(ev.end_date) - 1]} ${plDate(ev.end_date)} (${daysBetween(ev.date, ev.end_date) + 1} dni kalendarzowych)` : `${DOW[weekday(ev.date) - 1]} ${plDate(ev.date)}`;
  const rows = [
    ['Osoba', e ? person(ev.employee_id) : '—'],
    ['Rodzaj', ev.kind === 'nieobecnosc' ? `<span class="leave-chip ${evTone(ev)}">${esc(ev.label)}</span>` : `<span class="leave-chip ${evTone(ev)}">${esc(EV_KIND_LABEL[ev.kind] || ev.label)}</span>`],
    ['Kiedy', esc(range)],
    ev.time ? ['Godziny', esc(ev.time)] : null,
    ev.status ? ['Status', esc(ev.status)] : null,
    ev.minutes ? [ev.kind === 'nieobecnosc' ? 'Czas wg grafiku' : 'Czas', esc(hShort(ev.minutes))] : null,
    ev.kind !== 'nieobecnosc' && ev.label && ev.label !== EV_KIND_LABEL[ev.kind] ? ['Opis', esc(ev.label)] : null,
  ].filter(Boolean);
  infoDialog(EV_KIND_LABEL[ev.kind] || 'Zdarzenie', `<dl class="info-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${isAdmin() && ev.kind === 'nieobecnosc' ? `<p class="small"><a href="#/absencje?t=lista">Urlopy i absencje — lista wpisów ›</a></p>` : ''}`);
}
// Okienko: temat na maszynie w danym dniu — dla kierownika i przełożonego
async function machineTopicInfo(projectId, date, machineId, item) {
  const m = S.boot.machines.find(x => x.id === machineId);
  let p = null;
  try { p = await api(`/projects/${encodeURIComponent(projectId)}`); } catch (err) { toast(describeError(err), 'err'); return; }
  const open = (p.tasks || []).filter(t => t.status !== 'zakonczone' && t.status !== 'anulowane');
  const shifts = item && item.shifts && item.shifts.length ? item.shifts.map(sh => `<li>zmiana <b>${esc(sh.short)}</b>${sh.start && sh.start !== '99' ? ` od ${esc(sh.start)}` : ''}: ${sh.employees.map(id => person(id)).join(', ')}${sh.minutes ? ` · ${esc(hShort(sh.minutes))}` : ''}</li>`).join('') : '';
  infoDialog(`${m ? m.name : 'Maszyna'} — ${plDate(date)}`, `
    ${shifts ? `<h4>Praca w tym dniu</h4><ul class="plain">${shifts}</ul>` : '<p class="small muted">W tym dniu bez wpisów czasu pracy — projekt w toku / obecnie na maszynie.</p>'}
    ${typeof projectCard === 'function' ? projectCard(p) : ''}
    ${p.description ? `<h4>Opis</h4><p>${esc(p.description)}</p>` : ''}
    ${open.length ? `<h4>Otwarte zadania</h4><ul class="plain">${open.slice(0, 6).map(t => `<li><b>${esc(t.title)}</b>${t.assignee_id ? ` · ${person(t.assignee_id)}` : ''}${t.due_date ? ` · termin ${plDate(t.due_date)}` : ''}${t.status === 'zablokowane' ? ` ${tag('zablokowane', 'warn', 'block')}` : ''}</li>`).join('')}</ul>` : ''}
    <p><a class="btn" href="#/projekty/${encodeURIComponent(p.id)}">Otwórz projekt ›</a></p>`);
}
VIEWS.kalendarz = async (main) => {
  CAL_EV = [];
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const mode = q.get('tryb') || 'miesiac';
  const anchor = q.get('data') || S.me.today;
  const empF = q.get('osoba') || '';
  let from, to;
  if (mode === 'tydzien') { from = addDays(anchor, 1 - weekday(anchor)); to = addDays(from, 6); }
  else { from = addDays(`${anchor.slice(0, 7)}-01`, 1 - weekday(`${anchor.slice(0, 7)}-01`)); to = addDays(lastDay(anchor.slice(0, 7)), 7 - weekday(lastDay(anchor.slice(0, 7)))); }
  const qs = `from=${from}&to=${to}${empF ? `&employee_id=${empF}` : ''}`;
  const view = ['maszyny', 'ludzie'].includes(q.get('widok')) ? q.get('widok') : 'wszystko';
  const [sched, events, mcal] = await Promise.all([api(`/schedule?${qs}`), api(`/events?${qs}`), view !== 'ludzie' ? api(`/calendar/machines?from=${from}&to=${to}`) : Promise.resolve([])]);
  const MC_MODE = { praca: 'praca w tym dniu (wpisy czasu)', obecnie: 'obecnie na maszynie (karta maszyny)', w_toku: 'w toku — tego dnia bez wpisów czasu', brak: 'brak projektu' };
  const machineRows = (d) => S.boot.machines.filter(m => m.active !== 0).map(m => {
    const r = mcal.find(x => x.date === d && x.machine_id === m.id) || { mode: 'brak', items: [] };
    const th = machineTheme(m);
    const tip = r.items.length ? r.items.map(i => `${i.order_no} ${i.part_no}${i.shifts.length ? `: ${i.shifts.map(sh => `zmiana ${sh.short} (${sh.employees.map(id => { const e = S.emp.get(id); return e ? `${e.first_name} ${e.last_name}` : ''; }).join(', ')})`).join('; ')}` : ''}`).join(' | ') : '';
    return `<div class="mc-row theme-${th} mc-${r.mode}" title="${esc(`${m.name} — ${MC_MODE[r.mode]}${tip ? `: ${tip}` : ''}`)}">${machineEmblem(th, 16)}<b>${esc(m.name)}</b>${r.items.length ? r.items.map(i => {
      const inner = `<span class="mono">${esc(i.order_no)}</span>${i.shifts.map(sh => `<i>${esc(sh.short)}</i>`).join('')}`;
      // kierownik i przełożony: kliknięcie otwiera okienko z rozszerzonym opisem tematu
      return isEmployee() ? `<span class="mc-item">${inner}</span>` : `<button type="button" class="mc-item mc-open" data-mc="${esc(i.project_id)}" data-mcd="${d}" data-mcm="${esc(m.id)}" title="Szczegóły tematu">${inner}</button>`;
    }).join('') : '<span class="muted">—</span>'}</div>`;
  }).join('');
  const holidays = new Map(S.boot.holidays.map(h => [h.date, h.name]));
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t]));
  const link = (o) => { const p = new URLSearchParams({ tryb: mode, data: anchor, osoba: empF, widok: q.get('widok') || 'wszystko', ...o }); return `#/kalendarz?${p}`; };
  const step = mode === 'tydzien' ? 7 : 0;
  const prev = mode === 'tydzien' ? addDays(anchor, -7) : `${addMonths(anchor.slice(0, 7), -1)}-01`;
  const next = mode === 'tydzien' ? addDays(anchor, step) : `${addMonths(anchor.slice(0, 7), 1)}-01`;
  const title = mode === 'tydzien' ? `Tydzień ${plDate(from)} – ${plDate(to)}` : plMonth(anchor.slice(0, 7));
  let cells = DOW.map(d => `<div class="dow">${d}</div>`).join('');
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const daySched = sched.filter(s => s.work_date === d);
    const dayEv = events.filter(e => e.date <= d && (e.end_date || e.date) >= d);
    const off = holidays.has(d) || weekday(d) >= 6;
    const empty = !daySched.length && !dayEv.length && view === 'ludzie' && !holidays.has(d) && d !== S.me.today;
    cells += `<div class="day ${mode === 'miesiac' && d.slice(0, 7) !== anchor.slice(0, 7) ? 'other' : ''} ${off ? 'off' : ''} ${d === S.me.today ? 'today' : ''} ${empty ? 'empty-day' : ''}">
      <div class="num" data-dow="${DOW[weekday(d) - 1]}, ${plDate(d)}"><span class="desk-only">${Number(d.slice(8))}</span>${holidays.has(d) ? `<em>${esc(holidays.get(d))}</em>` : ''}</div>
      ${view !== 'ludzie' ? machineRows(d) : ''}
      ${view !== 'maszyny' ? daySched.map(s => shiftChip(s, tpl, dayEv.filter(ev => ev.employee_id === s.employee_id))).join('') : ''}
      ${view === 'maszyny' ? '' : ''}${dayEv.filter(ev => view !== 'maszyny' && !daySched.some(s => s.employee_id === ev.employee_id)).map(ev => { const e = S.emp.get(ev.employee_id); return `<div class="chip ev ev-open ${evTone(ev)} ${ev.status === 'anulowana' || ev.status === 'anulowane' ? 'cancel' : ''} ${ev.status === 'planowana' || ev.status === 'planowane' ? 'plan' : ''}" data-ev="${calEv(ev)}" role="button" tabindex="0" title="${esc(ev.label)} ${esc(ev.status || '')} — kliknij, aby zobaczyć szczegóły">${icon(ev.icon && ICON_PATHS[ev.icon] ? ev.icon : EVENT_ICON[ev.kind])}<b>${esc(initials(e))}</b> ${esc(ev.short || '')} ${esc(ev.time || ev.label)}</div>`; }).join('')}
    </div>`;
  }
  main.innerHTML = head('Kalendarz', 'Maszyny i projekty na każdej zmianie, grafik zmian i zdarzenia. Linia przerywana — wpis planowany; przekreślenie — anulowany.',
    `<a class="btn" href="${link({ data: prev })}">‹ Poprzedni</a><a class="btn" href="${link({ data: S.me.today })}">Dziś</a><a class="btn" href="${link({ data: next })}">Następny ›</a>
     <a class="btn ${mode === 'miesiac' ? 'primary' : ''}" href="${link({ tryb: 'miesiac' })}">Miesiąc</a><a class="btn ${mode === 'tydzien' ? 'primary' : ''}" href="${link({ tryb: 'tydzien' })}">Tydzień</a>
     <label class="field">Widok<select id="calView"><option value="wszystko" ${view === 'wszystko' ? 'selected' : ''}>maszyny i ludzie</option><option value="maszyny" ${view === 'maszyny' ? 'selected' : ''}>tylko maszyny</option><option value="ludzie" ${view === 'ludzie' ? 'selected' : ''}>tylko ludzie</option></select></label>
     <label class="field">Osoba<select id="calEmp"><option value="">wszyscy</option>${empOptions().map(([v, l]) => `<option value="${v}" ${String(v) === empF ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
     ${isAdmin() ? btn('addShift', 'Zmiana w grafiku') + btn('extraShift', 'Dzień dodatkowy / nadgodziny', 'plus', '') + btn('bulkMode', 'Zmiana trybu pracy', 'calendar', '') + btn('genShift', 'Generuj grafik', 'calendar', '') : ''}`) +
    `<h2>${esc(title)}</h2><div class="cal ${mode === 'tydzien' ? 'week' : ''}">${cells}</div>
     <p class="small muted">Legenda: na górze każdego dnia — oba tematy: co idzie na Hartford i na Grimme. Pełne tło ze zmianami I / II / III — praca tego dnia (z wpisów czasu pracy); przerywana ramka — projekt w toku bez wpisów tego dnia albo obecnie na maszynie (dziś i dalej, z karty maszyny); ${icon('spindle')} zmiana z grafiku (inicjały i kolor pracownika); za godzinami zmiany — co zmieniło dzień tej osoby (godziny zmiany przekreślone przy nieobecności) — kolor wg rodzaju: <span class="leave-legend"><span class="ev-tag tone-uw">UW</span> urlop wypoczynkowy <span class="ev-tag tone-uz">UŻ</span> na żądanie <span class="ev-tag tone-l4">L4</span> chorobowe <span class="ev-tag tone-care">OP</span> opieka <span class="ev-tag tone-force">SW</span> siła wyższa <span class="ev-tag tone-family">UR</span> rodzicielski <span class="ev-tag tone-event">OK</span> okolicznościowy <span class="ev-tag tone-train">SZ</span> szkolenie <span class="ev-tag tone-late">SPU</span> spóźnienie <span class="ev-tag tone-other">•</span> inna nieobecność <span class="ev-tag tone-unpaid">WP</span> wyjście prywatne <span class="ev-tag tone-train">OD</span> odrabianie <span class="ev-tag tone-event">PZ</span> przekazanie zmiany.</span> <span class="mode-badge dod">DOD</span> dzień dodatkowy / nadgodziny (pole kreskowane), <span class="mode-badge">12h</span> zmiana wydłużona, <span class="mode-badge">NR</span> czas nieregularny. Wpis osoby bez zmiany w tym dniu — osobny kafelek z ikoną. Zmiana nocna należy do dnia rozpoczęcia.</p>`;
  $('#calEmp').onchange = (e) => { location.hash = link({ osoba: e.target.value }); };
  $('#calView').onchange = (e) => { location.hash = link({ widok: e.target.value }); };
  on('addShift', () => shiftForm(anchor));
  on('genShift', () => generateForm(anchor));
  on('extraShift', () => extraShiftForm(anchor));
  on('bulkMode', () => bulkModeForm(anchor, from, to));
  // kliknięcie nieobecności / zdarzenia — okienko ze szczegółami (także na tagu w zmianie, bez otwierania edycji zmiany)
  $$('.cal [data-ev]', main).forEach(el => {
    const go = (e) => { e.stopPropagation(); e.preventDefault(); const ev = CAL_EV[Number(el.dataset.ev)]; if (ev) eventInfo(ev); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
  });
  $$('.cal [data-mc]', main).forEach(b => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.dataset.busy) return; b.dataset.busy = '1'; setTimeout(() => { delete b.dataset.busy; }, 1500);
    const r = mcal.find(x => x.date === b.dataset.mcd && x.machine_id === b.dataset.mcm);
    machineTopicInfo(b.dataset.mc, b.dataset.mcd, b.dataset.mcm, r && r.items.find(i => i.project_id === b.dataset.mc));
  }));
  if (isAdmin()) $$('.cal [data-shift]', main).forEach(b => b.addEventListener('click', () => {
    const s = sched.find(x => x.id === Number(b.dataset.shift));
    if (s) editShiftForm(s, sched);
  }));
};

// Tryb pracy zmiany: standardowa / wydłużona (np. 12 h) / nieregularna / dzień dodatkowy (nadgodziny)
const MODE_LABEL = { standardowa: 'standardowa', wydluzona: 'wydłużona', nieregularna: 'nieregularna', dodatkowa: 'dzień dodatkowy / nadgodziny' };
function modeBadge(s) {
  if (s.mode === 'dodatkowa') return '<span class="mode-badge dod">DOD</span>';
  if (s.mode === 'wydluzona') return `<span class="mode-badge">${Math.round((s.planned_min || 0) / 60)}h</span>`;
  if (s.mode === 'nieregularna') return '<span class="mode-badge">NR</span>';
  return '';
}
// Zmiana z grafiku; za czasem pracy — to, co zmieniło dzień tej osoby: nieobecność, wyjście prywatne, odrabianie, przekazanie
const EV_TONE = { nieobecnosc: 'tone-l4', wyjscie: 'tone-unpaid', odrabianie: 'tone-train', przekazanie: 'tone-event' };
// nieobecność — kolor wg rodzaju (urlop wypoczynkowy, na żądanie, L4, opieka, siła wyższa…), te same kolory co w kalendarzu urlopów
const evTone = (ev) => (ev.kind === 'nieobecnosc' ? `tone-${absTone(ev.icon, ev.short)}` : EV_TONE[ev.kind] || 'tone-other');
function shiftChip(s, tpl, evs = []) {
  const e = S.emp.get(s.employee_id);
  const mode = s.mode && s.mode !== 'standardowa' ? s.mode : '';
  const ot = s.overtime_min ? ` · nadgodziny ${hShort(s.overtime_min)}` : '';
  const evTxt = evs.map(ev => `${ev.label}${ev.time ? ` ${ev.time}` : ''}${ev.status ? ` (${ev.status})` : ''}`).join('; ');
  const tip = `${e ? e.first_name + ' ' + e.last_name : ''}: ${s.start_local.time}–${s.end_local.time}${mode ? ` · ${MODE_LABEL[mode]}` : ''}${ot}${s.reason ? ` · ${s.reason}` : ''}${evTxt ? ` · ${evTxt}` : ''}`;
  const tags = evs.map(ev => `<span class="ev-tag ev-open ${evTone(ev)} ${/anulowan/.test(ev.status || '') ? 'cancel' : ''} ${/planowan|oczekuje/.test(ev.status || '') ? 'plan' : ''}" data-ev="${calEv(ev)}" ${isAdmin() ? '' : 'role="button" tabindex="0"'} title="${esc(ev.label)} — kliknij, aby zobaczyć szczegóły">${esc(ev.short || '•')}${ev.time ? ` ${esc(ev.time)}` : ''}</span>`).join('');
  const absent = evs.some(ev => ev.kind === 'nieobecnosc' && !/anulowan/.test(ev.status || ''));
  const inner = `${icon('spindle')}<b>${esc(initials(e))}</b>${modeBadge(s)} <span class="${absent ? 'shift-off' : ''}">${esc(tpl.get(s.shift_template_id)?.short || '')} ${s.start_local.time}–${s.end_local.time}</span>${tags}`;
  const cls = `chip shift ${mode ? `mode-${mode}` : ''} ${evs.length ? 'has-ev' : ''}`;
  return isAdmin()
    ? `<button type="button" class="${cls}" data-shift="${s.id}" style="border-left-color:${esc(e?.color || '#888')}" title="${esc(tip)} — kliknij, aby zmienić">${inner}</button>`
    : `<div class="${cls}" style="border-left-color:${esc(e?.color || '#888')}" title="${esc(tip)}">${inner}</div>`;
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
// Wybór szablonu wpisuje jego godziny (potem można je ręcznie zmienić, np. na 12 h)
function tplFillsTimes(initial) {
  let last = initial ? String(initial) : '';
  return (vals, form) => {
    const cur = vals.shift_template_id ? String(vals.shift_template_id) : '';
    if (cur === last) return;
    last = cur;
    const t = S.boot.shift_templates.find(x => String(x.id) === cur);
    if (t) { form.elements.start_time.value = t.start_time; form.elements.end_time.value = t.end_time; }
  };
}
const tplOptions = () => S.boot.shift_templates.map(t => [t.id, `${t.name} ${t.start_time}–${t.end_time}`]);
const confirmFields = () => [
  { name: 'confirm_holiday', label: 'Świadomie planuję pracę w niedzielę / święto', type: 'checkbox', wide: true },
  { name: 'confirm_rest', label: 'Świadomie skracam 11 h odpoczynku (wyjątek — do potwierdzenia przez kadry)', type: 'checkbox', wide: true },
];
function editShiftForm(s, sched) {
  const e = S.emp.get(s.employee_id);
  const others = sched.filter(x => x.employee_id !== s.employee_id && Math.abs(daysBetween(x.work_date, s.work_date)) <= 7);
  openForm({
    title: `Zmiana: ${e ? `${e.first_name} ${e.last_name}` : ''}, ${plDate(s.work_date)}`,
    intro: `<p class="small muted">Teraz: ${s.start_local.time}–${s.end_local.time}, tryb ${esc(MODE_LABEL[s.mode] || 'standardowa')}${s.overtime_min ? `, nadgodziny ${hShort(s.overtime_min)}` : ''}. Każda zmiana trafia do historii z powodem.</p>
      <div class="row-actions"><button type="button" data-act="swap">${icon('handover')} Zamień z inną osobą</button><button type="button" class="danger" data-act="del">Usuń z grafiku</button></div>`,
    fields: [
      { name: 'mode', label: 'Tryb pracy', type: 'select', options: Object.entries(MODE_LABEL), value: s.mode || 'standardowa', required: true },
      { name: 'employee_id', label: 'Osoba', type: 'select', options: empOptions(), value: s.employee_id, required: true },
      { name: 'shift_template_id', label: 'Szablon zmiany', type: 'select', options: tplOptions(), value: s.shift_template_id, placeholder: 'indywidualne godziny' },
      { name: 'start_time', label: 'Początek', type: 'time', value: s.start_local.time }, { name: 'end_time', label: 'Koniec', type: 'time', value: s.end_local.time, help: 'Np. 06:00–18:00 dla 12 h. Koniec ≤ początek = następny dzień.' },
      { name: 'break_min', label: 'Przerwa niewliczana (min)', type: 'number', min: 0, value: s.break_min },
      ...confirmFields(),
      { name: 'reason', label: 'Powód zmiany', type: 'text', required: true, wide: true, help: 'Np. braki kadrowe — L4 w zespole, termin projektu.' },
    ],
    submit: (v, idem) => post(`/schedule/${s.id}`, v, idem, 'PATCH'),
    onChange: tplFillsTimes(s.shift_template_id),
    afterRender: (form) => {
      const dlg = form.closest('dialog');
      $('[data-act=swap]', form).onclick = () => { dlg.close(); dlg.remove(); swapForm(s, others); };
      $('[data-act=del]', form).onclick = () => { dlg.close(); dlg.remove(); confirmReason('Usuń zmianę z grafiku', `${esc(e ? e.first_name + ' ' + e.last_name : '')}, ${plDate(s.work_date)} ${s.start_local.time}–${s.end_local.time}`, (reason) => post(`/schedule/${s.id}`, { reason }, undefined, 'DELETE'), 'Usuń'); };
    },
  });
}
function swapForm(s, others) {
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t]));
  openForm({
    title: 'Zamiana osób między zmianami',
    intro: `<p class="small muted">Osoby zamienią się zmianami: ${esc(initials(S.emp.get(s.employee_id)))} przejmie wybraną zmianę, a jej właściciel — zmianę z ${plDate(s.work_date)} ${s.start_local.time}–${s.end_local.time}. Sprawdzane są nakładanie i 11 h odpoczynku.</p>`,
    fields: [
      { name: 'b_id', label: 'Zmiana do zamiany (± 7 dni)', type: 'select', required: true, wide: true, options: others.map(x => { const e = S.emp.get(x.employee_id); return [x.id, `${e ? `${e.first_name} ${e.last_name}` : ''} · ${plDate(x.work_date)} ${tpl.get(x.shift_template_id)?.short || ''} ${x.start_local.time}–${x.end_local.time}`]; }) },
      ...confirmFields(),
      { name: 'reason', label: 'Powód zamiany', type: 'text', required: true, wide: true },
    ],
    submit: (v, idem) => post('/schedule/swap', { ...v, a_id: s.id }, idem),
  });
}
function extraShiftForm(date) {
  openForm({
    title: 'Dzień dodatkowy / nadgodziny',
    intro: '<p class="small muted">Np. sobota lub niedziela na nocnej zmianie. Cała zmiana liczy się jako nadgodziny, a praca na projektach w tym czasie — osobno w analizie projektu i miesiąca. Limity i rozliczenie — do potwierdzenia przez kadry.</p>',
    fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'work_date', label: 'Dzień rozpoczęcia zmiany', type: 'date', value: date, required: true },
      { name: 'shift_template_id', label: 'Szablon zmiany', type: 'select', options: tplOptions(), placeholder: 'indywidualne godziny' },
      { name: 'start_time', label: 'Początek (opcjonalnie)', type: 'time' }, { name: 'end_time', label: 'Koniec (opcjonalnie)', type: 'time' },
      { name: 'break_min', label: 'Przerwa niewliczana (min)', type: 'number', min: 0 },
      ...confirmFields(),
      { name: 'reason', label: 'Powód', type: 'text', required: true, wide: true, help: 'Np. termin projektu ZL-…, braki kadrowe.' },
    ],
    submit: (v, idem) => post('/schedule', { ...v, mode: 'dodatkowa' }, idem),
  });
}
function bulkModeForm(date, from, to) {
  const ws = date < from ? from : date;
  openForm({
    title: 'Zmiana trybu pracy na okres',
    intro: '<p class="small muted">Zmienia istniejące zmiany w grafiku wybranych osób, np. z 8 h na 12 h albo na czas nieregularny przy brakach kadrowych. Godziny ponad dobową normę liczą się jako nadgodziny (bez względu na nazwę trybu). Dni dodatkowe i zmiany, których nie da się zmienić (nakładanie, odpoczynek, zamknięty miesiąc), są pomijane i wypisane.</p>',
    fields: [
      { name: 'employee_ids', label: 'Pracownicy', type: 'multi', options: empOptions(), value: [], wide: true },
      { name: 'from', label: 'Od', type: 'date', value: ws, required: true }, { name: 'to', label: 'Do', type: 'date', value: addDays(ws, 6) > to ? to : addDays(ws, 6), required: true },
      { name: 'weekdays', label: 'Dni tygodnia', type: 'multi', options: DOW.map((d, i) => [i + 1, d]), value: [1, 2, 3, 4, 5, 6, 7], wide: true },
      { name: 'mode', label: 'Tryb pracy', type: 'select', options: [['wydluzona', 'wydłużona (np. 12 h)'], ['nieregularna', 'nieregularna'], ['standardowa', 'powrót do standardowej']], value: 'wydluzona', required: true },
      { name: 'shift_template_id', label: 'Szablon zmiany', type: 'select', options: tplOptions(), placeholder: 'bez zmiany szablonu' },
      { name: 'start_time', label: 'Nowy początek', type: 'time' }, { name: 'end_time', label: 'Nowy koniec', type: 'time', help: 'Np. 06:00–18:00 lub 18:00–06:00.' },
      { name: 'break_min', label: 'Przerwa niewliczana (min)', type: 'number', min: 0 },
      ...confirmFields(),
      { name: 'reason', label: 'Powód', type: 'text', required: true, wide: true, help: 'Np. absencja dwóch osób, braki kadrowe.' },
    ],
    submit: async (v, idem) => {
      if (!v.employee_ids || !v.employee_ids.length) throw new Error('Wybierz co najmniej jednego pracownika.');
      if (v.mode === 'standardowa' && !v.shift_template_id && !(v.start_time && v.end_time)) throw new Error('Przy powrocie do trybu standardowego wybierz szablon zmiany lub podaj godziny — inaczej zostaną dotychczasowe (wydłużone) godziny.');
      const r = await api('/schedule/bulk-mode', { method: 'POST', body: { ...v, employee_ids: v.employee_ids.map(Number), weekdays: (v.weekdays || []).map(Number) }, idem });
      toast(`Zmieniono zmian: ${r.changed}. Pominięto: ${r.skipped.length}.`, r.skipped.length ? 'warn' : '');
      r.skipped.slice(0, 4).forEach(x => toast(`${plDate(x.work_date)} ${initials(S.emp.get(x.employee_id))}: ${x.reason}`, 'warn'));
      setTimeout(rerender, 50);
      return { warnings: r.warnings };
    },
  });
}

function shiftForm(date) {
  openForm({
    title: 'Dodaj zmianę do grafiku', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'work_date', label: 'Dzień rozpoczęcia zmiany', type: 'date', value: date, required: true },
      { name: 'shift_template_id', label: 'Szablon zmiany', type: 'select', options: S.boot.shift_templates.map(t => [t.id, `${t.name} ${t.start_time}–${t.end_time}`]), placeholder: 'indywidualne godziny' },
      { name: 'start_time', label: 'Początek (opcjonalnie)', type: 'time' }, { name: 'end_time', label: 'Koniec (opcjonalnie)', type: 'time', help: 'Koniec ≤ początek oznacza zakończenie następnego dnia.' },
      { name: 'break_min', label: 'Przerwa niewliczana do czasu pracy (min)', type: 'number', min: 0 },
      { name: 'confirm_holiday', label: 'Świadomie planuję pracę w dniu wolnym/święto', type: 'checkbox' },
      { name: 'note', label: 'Uwagi', type: 'text', wide: true },
    ], submit: (v, idem) => post('/schedule', v, idem),
  });
}
function generateForm(date) {
  openForm({
    title: 'Generuj grafik dla zakresu dat', intro: '<p class="small muted">Święta i dni wolne są pomijane. Kolizje z istniejącymi zmianami są zgłaszane i pomijane.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'shift_template_id', label: 'Szablon zmiany', type: 'select', options: S.boot.shift_templates.map(t => [t.id, `${t.name} ${t.start_time}–${t.end_time}`]), required: true },
      { name: 'from', label: 'Od', type: 'date', value: date, required: true }, { name: 'to', label: 'Do', type: 'date', value: addDays(date, 4), required: true },
      { name: 'start_time', label: 'Inny początek (opcjonalnie)', type: 'time' }, { name: 'end_time', label: 'Inny koniec (opcjonalnie)', type: 'time' },
      { name: 'weekdays', label: 'Dni tygodnia', type: 'multi', options: DOW.map((d, i) => [i + 1, d]), value: [1, 2, 3, 4, 5], wide: true },
    ], submit: async (v, idem) => {
      const r = await api('/schedule/generate', { method: 'POST', body: { ...v, weekdays: v.weekdays.map(Number) }, idem });
      toast(`Utworzono zmian: ${r.created}. Pominięto: ${r.skipped.length}.`, r.skipped.length ? 'warn' : '');
      setTimeout(rerender, 50);
    },
  });
}

// ---------- Lista zdarzeń ----------
VIEWS.zdarzenia = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const from = q.get('from') || `${S.me.today.slice(0, 7)}-01`, to = q.get('to') || lastDay(S.me.today.slice(0, 7));
  const params = new URLSearchParams({ from, to });
  for (const k of ['employee_id', 'kind', 'category_id', 'project_id', 'machine_id']) if (q.get(k)) params.set(k, q.get(k));
  const events = await api(`/events?${params}`);
  const projects = await api('/projects');
  const kinds = [['nieobecnosc', 'Nieobecności'], ['wyjscie', 'Wyjścia prywatne'], ['odrabianie', 'Odrabianie'], ['przekazanie', 'Przekazania zmian']];
  const sel = (name, label, opts) => `<label class="field">${label}<select name="${name}"><option value="">wszystkie</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === (q.get(name) || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const catOpts = can('view.reports') ? S.boot.categories.filter(c => c.name).map(c => [c.id, c.subtype ? `${c.name} — ${c.subtype}` : c.name]) : [];
  main.innerHTML = head('Lista zdarzeń', 'Filtruj po osobie, maszynie, projekcie, okresie i kategorii.') + `
    <form class="panel toolbar" id="evFilter">
      <label class="field">Od<input type="date" name="from" value="${from}"></label><label class="field">Do<input type="date" name="to" value="${to}"></label>
      ${sel('employee_id', 'Osoba', empOptions(false))}${sel('kind', 'Rodzaj', kinds)}${catOpts.length ? sel('category_id', 'Kategoria nieobecności', catOpts) : ''}
      ${sel('project_id', 'Projekt', projects.map(p => [p.id, `${p.order_no} ${p.part_no}`]))}${sel('machine_id', 'Maszyna', machineOptions())}
      <button class="primary" type="submit">Filtruj</button></form>
    <div class="panel">${table([
      { key: 'date', label: 'Data', fmt: 'date' }, { key: r => r, label: 'Osoba', fmt: (r) => person(r.employee_id) },
      { key: r => r, label: 'Zdarzenie', fmt: (r) => `${icon(r.icon && ICON_PATHS[r.icon] ? r.icon : EVENT_ICON[r.kind])} ${esc(r.label)}` },
      { key: 'time', label: 'Godziny' }, { key: 'status', label: 'Status' }, { key: 'minutes', label: 'Czas', fmt: 'hm' },
    ], events, { empty: 'Brak zdarzeń dla wybranych filtrów.' })}</div>`;
  $('#evFilter').onsubmit = (e) => {
    e.preventDefault();
    const p = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
    location.hash = `#/zdarzenia?${p}`;
  };
};
