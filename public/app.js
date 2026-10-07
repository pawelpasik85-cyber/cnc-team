// CNC Team — aplikacja (SPA). Uprawnienia są egzekwowane na serwerze; interfejs tylko ukrywa niedostępne akcje.
'use strict';

const S = { me: null, boot: null, emp: new Map(), cat: new Map() };
const can = (cap) => S.me && S.me.caps.includes(cap);
const isAdmin = () => S.me && S.me.role === 'admin';
const isEmployee = () => S.me && S.me.role === 'employee';
const isGuest = () => S.me && S.me.role === 'guest';

const NAV = [
  ['dzisiaj', 'Centrum programowania', 'today', null],
  ['kalendarz', 'Kalendarz', 'calendar', null],
  ['zdarzenia', 'Lista zdarzeń', 'list', null],
  ['pracownicy', 'Pracownicy', 'users', null],
  ['zglos', 'Zgłoś kierownikowi', 'summons', () => isEmployee()],
  ['wyjscia', 'Wyjścia i odrabianie', 'exit', null],
  ['zgloszenia', 'Zgłoszenia pracowników', 'summons', 'write'],
  ['absencje', 'Urlopy i absencje', 'leave', 'view.leave.all'],
  ['projekty', 'Projekty i zadania', 'project', null],
  ['maszyny', 'Tablica maszyn', 'board', null],
  ['przekazanie', 'Przekazanie zmiany', 'handover', null],
  ['raporty', 'Raporty kierownicze', 'report', 'view.reports'],
  ['analiza', 'Analiza i raporty', 'report', () => S.me && (S.me.role === 'admin' || S.me.role === 'supervisor')],
  ['ustawienia', 'Ustawienia', 'settings', null],
];

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
  const theme = localStorageGet('cnc-theme');
  if (theme) document.documentElement.dataset.theme = theme;
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
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* brak */ } }
window.addEventListener('cnc-logout', () => { S.me = null; renderLogin(); });

function renderLogin() {
  $('#app').innerHTML = `<div class="login"><form>
    <div class="brand">${appLogo(44)}<div>CNC Team<small>Zespół programistów CNC</small></div></div>
    <label class="field">Login<input name="login" autocomplete="username" required></label>
    <label class="field">Hasło<input name="password" type="password" autocomplete="current-password" required></label>
    <div class="form-error" role="alert"></div>
    <button class="primary" type="submit">Zaloguj</button></form></div>`;
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
    : isEmployee() ? [['dzisiaj', 'Dzisiaj', 'today'], ['zglos', 'Zgłoś', 'summons'], ['kalendarz', 'Kalendarz', 'calendar'], ['projekty', 'Projekty', 'project']]
      : [['dzisiaj', 'Dzisiaj', 'today'], ['kalendarz', 'Kalendarz', 'calendar'], ['projekty', 'Projekty', 'project'], ['maszyny', 'Maszyny', 'board']];
  const nav = isGuest() ? [['status', 'Status projektów', 'project', null], ['ustawienia', 'Moje konto', 'settings', null]] : NAV.filter(n => typeof n[3] === 'function' ? n[3]() : (!n[3] || can(n[3])));
  $('#app').innerHTML = `<div class="shell">
    <header class="appbar"><button type="button" class="appbar-menu" id="menuBtn" aria-label="Otwórz menu" aria-expanded="false" aria-controls="rail">${icon('list')}</button>
      <span class="appbar-title" id="appbarTitle">CNC Team</span>${appLogo(30)}</header>
    <div class="scrim" id="scrim" hidden></div>
    <nav class="rail" id="rail" aria-label="Menu główne">
    <div class="brand">${appLogo(40)}<div>CNC Team<small>${esc(S.boot.settings.company_name || '')}</small></div></div>
    ${nav.map(([id, label, ic]) => `<a href="#/${id}" data-nav="${id}">${icon(ic)}<span>${esc(label)}</span></a>`).join('')}
    <div class="who"><strong>${esc(S.me.display_name)}</strong>${esc(roleName)}<br>
      <button type="button" id="themeBtn" class="link">${icon('theme')}Motyw</button>
      <button type="button" id="installBtn" class="link ${document.documentElement.dataset.installable ? '' : 'mobile-only'}">${icon('download')}Skrót na telefonie</button>
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
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next; localStorageSet('cnc-theme', next);
  };
}

const VIEWS = {};
async function route() {
  if (!S.me) return;
  let [name, ...rest] = (location.hash.replace(/^#\/?/, '').split('?')[0] || (isGuest() ? 'status' : 'dzisiaj')).split('/');
  if (isGuest() && name !== 'ustawienia') name = 'status';
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  const navItem = isGuest() ? (name === 'status' ? ['status', 'Status projektów'] : ['ustawienia', 'Moje konto']) : NAV.find(n => n[0] === name);
  if ($('#appbarTitle')) $('#appbarTitle').textContent = navItem ? navItem[1] : 'CNC Team';
  const main = $('#main');
  main.innerHTML = '<p class="muted">Wczytywanie…</p>';
  try { await (VIEWS[name] || VIEWS.dzisiaj)(main, rest); } catch (e) {
    main.innerHTML = `<div class="notice danger">${esc(e.status === 403 ? 'Brak uprawnień do tego widoku.' : e.message)}</div>`;
  }
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
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t]));
  const shifts = d.shifts.map(s => `<li>${person(s.employee_id)} — ${tag(tpl.get(s.shift_template_id)?.name || 'zmiana')} <span class="muted">${s.start.time}–${s.end.time}${s.work_date !== d.today ? ' (od wczoraj)' : ''}</span></li>`).join('');
  const abs = d.absences.map(a => `<li>${person(a.employee_id)} — ${tag(a.category_label, '', a.icon)} <span class="muted">${a.status}</span></li>`).join('');
  const alerts = (d.alerts || []).map(a => `<li>${icon('alert')} ${esc(a.message)}${a.remaining_min != null ? ` <b>${hm(a.remaining_min)}</b> pozostało, zmian do końca miesiąca: ${a.remaining_shifts ?? '—'}` : ''}</li>`).join('');
  const reminders = (d.leave_reminders || []).map(r => `<li>${r.level === 'ostrzezenie' ? tag('ostrzeżenie', 'warn', 'alert') : tag('przypomnienie', 'accent')} ${esc(r.name)}: pula ${r.year}, saldo ${hm(r.balance_min)}. <span class="muted">${esc(r.text)}</span></li>`).join('');
  main.innerHTML = head('Centrum programowania', `Dzisiaj: ${plDate(d.today)} · strefa Europe/Warsaw`) + `
    <div class="machines">${d.board.map(plate).join('')}</div>
    <div class="cols" style="margin-top:var(--sp-4)">
      <section class="panel"><h3>Na zmianie dziś</h3><ul class="plain">${shifts || '<li class="muted">Brak zmian w grafiku.</li>'}</ul></section>
      <section class="panel"><h3>Nieobecności dziś</h3><ul class="plain">${abs || '<li class="muted">Brak nieobecności.</li>'}</ul></section>
      ${d.my_requests ? `<section class="panel"><h3>Moje zgłoszenia</h3><ul class="plain">${d.my_requests.map(r => `<li>${icon(REQ_KIND[r.kind][1])} ${esc(REQ_KIND[r.kind][0])} · ${plDate(r.date_from)} ${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small muted">${esc(r.decision_note)}</span>` : ''}</li>`).join('') || '<li class="muted">Brak zgłoszeń.</li>'}</ul>
        <p><a class="btn primary" href="#/zglos">${icon('summons')}Zgłoś spóźnienie, nieobecność lub odrobienie</a></p></section>` : ''}
      ${d.delayed_projects ? `<section class="panel"><h3>Projekty opóźnione lub ponad plan godzin</h3><ul class="plain">${d.delayed_projects.map(p => { const r = p.hours ? hoursResult(p.hours) : null; return `<li>${machineChip(p)} <a href="#/projekty/${encodeURIComponent(p.id)}"><span class="mono">${esc(p.order_no)}</span> ${esc(p.part_no)}</a>${delayLine(p)}${r && r.cls === 'over' ? `<p class="small" style="margin:2px 0 0"><span class="result-chip over">${esc(r.big)}</span> ${esc(r.line)}</p>` : ''}</li>`; }).join('') || '<li class="muted">Wszystkie aktywne projekty idą zgodnie z planem.</li>'}</ul></section>` : ''}
      ${d.my_balance ? `<section class="panel"><h3>Moje saldo do odrobienia (${plMonth(d.today.slice(0, 7))})</h3><div class="stat-row"><div class="stat"><b>${hm(d.my_balance.remaining_min)}</b><span>pozostało</span></div><div class="stat"><b>${d.my_balance.remaining_shifts}</b><span>zmian do końca miesiąca</span></div></div></section>` : ''}
      <section class="panel"><h3>Alerty rozliczeń</h3><ul class="plain">${alerts || '<li class="muted">Brak aktywnych alertów.</li>'}</ul>
        ${d.pending_makeups ? `<p class="notice">Odrabiania oczekujące na zatwierdzenie: ${d.pending_makeups}. <a href="#/wyjscia">Przejdź</a></p>` : ''}
        ${d.pending_requests ? `<p class="notice">Zgłoszenia pracowników do decyzji: ${d.pending_requests}. <a href="#/zgloszenia">Przejdź</a></p>` : ''}</section>
      ${d.leave_reminders ? `<section class="panel"><h3>Zaległy urlop</h3><ul class="plain">${reminders || '<li class="muted">Brak zaległych pul.</li>'}</ul></section>` : ''}
      <section class="panel"><h3>Ostatnie przekazania zmian</h3><ul class="plain">${d.handovers.map(h => `<li><span class="mono">${esc(h.order_no)}</span> ${esc(h.part_no)} · ${plDate(h.shift_date)} · ${person(h.from_employee_id, { name: false })} → ${person(h.to_employee_id, { name: false })}<br><span class="muted">${esc(h.remaining_text)}</span></li>`).join('') || '<li class="muted">Brak.</li>'}</ul></section>
    </div>`;
};

const PROGRAM_STATUS = { brak: 'brak', w_przygotowaniu: 'w przygotowaniu', gotowy: 'gotowy', zweryfikowany: 'zweryfikowany' };
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
VIEWS.kalendarz = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const mode = q.get('tryb') || 'miesiac';
  const anchor = q.get('data') || S.me.today;
  const empF = q.get('osoba') || '';
  let from, to;
  if (mode === 'tydzien') { from = addDays(anchor, 1 - weekday(anchor)); to = addDays(from, 6); }
  else { from = addDays(`${anchor.slice(0, 7)}-01`, 1 - weekday(`${anchor.slice(0, 7)}-01`)); to = addDays(lastDay(anchor.slice(0, 7)), 7 - weekday(lastDay(anchor.slice(0, 7)))); }
  const qs = `from=${from}&to=${to}${empF ? `&employee_id=${empF}` : ''}`;
  const [sched, events] = await Promise.all([api(`/schedule?${qs}`), api(`/events?${qs}`)]);
  const holidays = new Map(S.boot.holidays.map(h => [h.date, h.name]));
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t]));
  const link = (o) => { const p = new URLSearchParams({ tryb: mode, data: anchor, osoba: empF, ...o }); return `#/kalendarz?${p}`; };
  const step = mode === 'tydzien' ? 7 : 0;
  const prev = mode === 'tydzien' ? addDays(anchor, -7) : `${addMonths(anchor.slice(0, 7), -1)}-01`;
  const next = mode === 'tydzien' ? addDays(anchor, step) : `${addMonths(anchor.slice(0, 7), 1)}-01`;
  const title = mode === 'tydzien' ? `Tydzień ${plDate(from)} – ${plDate(to)}` : plMonth(anchor.slice(0, 7));
  let cells = DOW.map(d => `<div class="dow">${d}</div>`).join('');
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const daySched = sched.filter(s => s.work_date === d);
    const dayEv = events.filter(e => e.date <= d && (e.end_date || e.date) >= d);
    const off = holidays.has(d) || weekday(d) >= 6;
    const empty = !daySched.length && !dayEv.length && !holidays.has(d) && d !== S.me.today;
    cells += `<div class="day ${mode === 'miesiac' && d.slice(0, 7) !== anchor.slice(0, 7) ? 'other' : ''} ${off ? 'off' : ''} ${d === S.me.today ? 'today' : ''} ${empty ? 'empty-day' : ''}">
      <div class="num" data-dow="${DOW[weekday(d) - 1]}, ${plDate(d)}"><span class="desk-only">${Number(d.slice(8))}</span>${holidays.has(d) ? `<em>${esc(holidays.get(d))}</em>` : ''}</div>
      ${daySched.map(s => { const e = S.emp.get(s.employee_id); return `<div class="chip" style="border-left-color:${esc(e?.color || '#888')}" title="${esc(e ? e.first_name + ' ' + e.last_name : '')}: ${s.start_local.time}–${s.end_local.time}">${icon('spindle')}<b>${esc(initials(e))}</b> ${esc(tpl.get(s.shift_template_id)?.short || '')} ${s.start_local.time}–${s.end_local.time}</div>`; }).join('')}
      ${dayEv.map(ev => { const e = S.emp.get(ev.employee_id); return `<div class="chip ev ${ev.status === 'anulowana' || ev.status === 'anulowane' ? 'cancel' : ''} ${ev.status === 'planowana' || ev.status === 'planowane' ? 'plan' : ''}" style="border-left-color:${esc(e?.color || '#888')}" title="${esc(ev.label)} ${esc(ev.status || '')}">${icon(ev.icon && ICON_PATHS[ev.icon] ? ev.icon : EVENT_ICON[ev.kind])}<b>${esc(initials(e))}</b> ${esc(ev.short || '')} ${esc(ev.time || ev.label)}</div>`; }).join('')}
    </div>`;
  }
  main.innerHTML = head('Kalendarz', 'Grafik zmian i zdarzenia. Linia przerywana — wpis planowany; przekreślenie — anulowany.',
    `<a class="btn" href="${link({ data: prev })}">‹ Poprzedni</a><a class="btn" href="${link({ data: S.me.today })}">Dziś</a><a class="btn" href="${link({ data: next })}">Następny ›</a>
     <a class="btn ${mode === 'miesiac' ? 'primary' : ''}" href="${link({ tryb: 'miesiac' })}">Miesiąc</a><a class="btn ${mode === 'tydzien' ? 'primary' : ''}" href="${link({ tryb: 'tydzien' })}">Tydzień</a>
     <label class="field">Osoba<select id="calEmp"><option value="">wszyscy</option>${empOptions().map(([v, l]) => `<option value="${v}" ${String(v) === empF ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
     ${isAdmin() ? btn('addShift', 'Zmiana w grafiku') + btn('genShift', 'Generuj grafik', 'calendar', '') : ''}`) +
    `<h2>${esc(title)}</h2><div class="cal ${mode === 'tydzien' ? 'week' : ''}">${cells}</div>
     <p class="small muted">Legenda: ${icon('spindle')} zmiana z grafiku (inicjały i kolor pracownika), ${icon('absence')} nieobecność, ${icon('exit')} wyjście prywatne, ${icon('makeup')} odrabianie, ${icon('handover')} przekazanie zmiany. Zmiana nocna należy do dnia rozpoczęcia.</p>`;
  $('#calEmp').onchange = (e) => { location.hash = link({ osoba: e.target.value }); };
  on('addShift', () => shiftForm(anchor));
  on('genShift', () => generateForm(anchor));
};

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
