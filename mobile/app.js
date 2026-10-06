// CNC Team — aplikacja pracownika (interfejs). Logika: core.js.
'use strict';
(function () {
  const cfg = self.CNC_CONFIG;
  const client = CNCCore.createClient({ url: cfg.url, key: cfg.key, storage: localStorage });
  const { hm, KINDS, localDate, addDays } = CNCCore;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
  const plDate = (d) => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
  const dayName = (d) => { const [y, m, dd] = d.split('-').map(Number); return DOW[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]; };
  const KIND_ICON = { nieobecnosc: 'absence', spoznienie: 'today', wyjscie: 'exit', inne: 'other' };
  const STATUS = { w_kolejce: ['czeka na wysłanie', 'warn'], blad: ['nie wysłano', 'danger'], nowe: ['wysłane — czeka na decyzję', 'accent'], przyjete: ['przyjęte', 'ok'], odrzucone: ['odrzucone', 'danger'], wycofane: ['wycofane', ''] };
  const tag = (t, k = '') => `<span class="tag ${k}">${esc(t)}</span>`;
  let tab = 'start';
  let busy = false;

  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4000);
  }

  // ---------- Logowanie ----------
  function renderLogin(msg = '') {
    $('#app').innerHTML = `<div class="login"><form id="lf" novalidate>
      <div class="brand">${icon('cutter')}<div>CNC Team<small>Aplikacja pracownika</small></div></div>
      <p class="small muted">Zaloguj się adresem e-mail, który kierownik wpisał w CNC Team.</p>
      <label class="field">E-mail<input name="email" type="email" autocomplete="username" required></label>
      <label class="field">Hasło<input name="password" type="password" autocomplete="current-password" required></label>
      <label class="field inline"><input type="checkbox" name="first"> Pierwsze logowanie — ustaw hasło (min. 8 znaków)</label>
      <div class="form-error" role="alert">${esc(msg)}</div>
      <button class="primary" type="submit">Zaloguj</button></form></div>`;
    const f = $('#lf');
    f.first.onchange = () => { f.password.autocomplete = f.first.checked ? 'new-password' : 'current-password'; $('button', f).textContent = f.first.checked ? 'Ustaw hasło i wejdź' : 'Zaloguj'; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const b = $('button', f); b.disabled = true; $('.form-error', f).textContent = '';
      try {
        await client.signIn(f.email.value, f.password.value, { firstTime: f.first.checked });
        await client.refresh().catch(() => {});
        renderShell();
      } catch (err) { $('.form-error', f).textContent = err.message; b.disabled = false; }
    };
  }

  // ---------- Powłoka ----------
  function renderShell() {
    $('#app').innerHTML = `<header class="appbar"><span class="appbar-title" id="title">CNC Team</span><span id="net" class="net"></span>
        <button class="appbar-btn" id="syncBtn" aria-label="Odśwież">${icon('makeup')}</button></header>
      <main class="main" id="main"></main>
      <nav class="tabbar" aria-label="Nawigacja">
        ${[['start', 'Start', 'today'], ['zglos', 'Zgłoś', 'plus'], ['grafik', 'Grafik', 'calendar'], ['moje', 'Moje', 'users']].map(([id, l, ic]) =>
    `<button data-tab="${id}" class="${id === 'zglos' ? 'tab-cta' : ''}">${icon(ic)}<span>${l}</span></button>`).join('')}
      </nav>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
    $('#syncBtn').onclick = () => sync(true);
    render();
  }

  function netState() {
    const st = client.state();
    const el = $('#net'); if (!el) return;
    const off = !navigator.onLine;
    el.innerHTML = off ? tag('offline', 'warn') : (st.outboxCount ? tag(`${st.outboxCount} do wysłania`, 'warn') : '');
  }

  async function sync(manual = false) {
    if (busy || !client.session()) return;
    busy = true; $('#syncBtn')?.classList.add('spin');
    try {
      const r = await client.refresh();
      if (r.flushed.sent) toast(`Wysłano zgłoszeń: ${r.flushed.sent}.`);
      if (manual) toast('Dane odświeżone.');
    } catch (e) {
      if (e.status === 401) { renderLogin(e.message); return; }
      if (manual) toast(e.offline ? 'Brak internetu — pokazuję ostatnio pobrane dane.' : e.message, e.offline ? 'warn' : 'err');
    } finally { busy = false; $('#syncBtn')?.classList.remove('spin'); render(); }
  }

  function render() {
    $$('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const st = client.state();
    const titles = { start: `Cześć${st.me ? `, ${st.me.display_name.split(' ')[0]}` : ''}`, zglos: 'Nowe zgłoszenie', grafik: 'Grafik', moje: 'Moje sprawy' };
    $('#title').textContent = titles[tab];
    const main = $('#main');
    main.innerHTML = ({ start: viewStart, zglos: viewReport, grafik: viewSchedule, moje: viewMine })[tab](st);
    bind(st);
    netState();
  }

  function syncedLine(st) {
    return `<p class="small muted center">${st.synced ? `Dane z ${new Date(st.synced).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}` : 'Dane jeszcze nie zostały pobrane.'}${st.team ? ` · grafik opublikowany ${new Date(st.team.wygenerowano).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}` : ''}</p>`;
  }

  function reportLine(r) {
    const s = STATUS[r.status] || [r.status, ''];
    const when = `${plDate(r.date_from)}${r.date_to && r.date_to !== r.date_from ? ` – ${plDate(r.date_to)}` : ''}${r.kind === 'spoznienie' && r.time_to ? `, przyjście ${r.time_to}` : ''}${r.kind === 'wyjscie' && r.time_from ? `, ${r.time_from}–${r.time_to}` : ''}`;
    return `<li class="rep">${icon(KIND_ICON[r.kind])}<div><b>${esc(KINDS[r.kind])}</b> · ${esc(when)}<br>${tag(s[0], s[1])}
      ${r.decision_note ? `<div class="small">Kierownik: ${esc(r.decision_note)}</div>` : ''}${r.error ? `<div class="small danger-text">${esc(r.error)}</div>` : ''}
      ${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ''}</div>
      ${r.status === 'nowe' ? `<button class="link" data-withdraw="${esc(r.id)}">Wycofaj</button>` : ''}
      ${r.status === 'blad' || r.status === 'w_kolejce' ? `<button class="link" data-drop="${esc(r.client_id)}">Usuń</button>` : ''}</li>`;
  }

  function currentSaldo(st) {
    if (!st.mine) return null;
    const ym = localDate().slice(0, 7);
    return st.mine.saldo.find(s => s.miesiac === ym) || st.mine.saldo[st.mine.saldo.length - 1] || null;
  }

  function viewStart(st) {
    const next = client.myShifts(st, 14)[0];
    const saldo = currentSaldo(st);
    return `<button class="cta" data-goto="zglos">${icon('plus')}<span>Zgłoś nieobecność, spóźnienie lub wyjście</span></button>
      <section class="panel"><h3>Najbliższa zmiana</h3>${next ? `<p class="big">${dayName(next.d)}, ${plDate(next.d)}</p><p>${esc(next.od)}–${esc(next.do)}${next.zm ? ` · zmiana ${esc(next.zm)}` : ''}</p>${next.nieobecnosc ? tag(next.nieobecnosc.etykieta, 'warn') : ''}` : '<p class="muted">Brak zmian w opublikowanym grafiku.</p>'}</section>
      <section class="panel"><h3>Saldo do odrobienia${saldo ? ` — ${saldo.miesiac}` : ''}</h3>${saldo ? `<p class="big">${hm(saldo.pozostalo_min)}</p><p class="small muted">Zmian do końca miesiąca: ${saldo.zmian_do_konca}. Wyjścia prywatne rozliczamy w miesiącu kalendarzowym.</p>` : '<p class="muted">Brak danych — kierownik jeszcze nie opublikował salda.</p>'}</section>
      <section class="panel"><h3>Ostatnie zgłoszenia</h3><ul class="plain">${st.reports.slice(0, 3).map(reportLine).join('') || '<li class="muted">Brak zgłoszeń.</li>'}</ul></section>
      ${syncedLine(st)}`;
  }

  function viewReport() {
    const t = localDate();
    return `<form id="rf" class="panel" novalidate>
      <fieldset class="kinds"><legend>Co zgłaszasz?</legend>
        ${Object.entries(KINDS).map(([k, l], i) => `<label class="kind"><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}>${icon(KIND_ICON[k])}<span>${esc(l)}</span></label>`).join('')}
      </fieldset>
      <div class="grid2">
        <label class="field">Dzień<input type="date" name="date_from" value="${t}" min="${addDays(t, -31)}" required></label>
        <label class="field" data-k="nieobecnosc inne">Do dnia (jeśli dłużej)<input type="date" name="date_to"></label>
        <label class="field" data-k="spoznienie">Przyjdę o<input type="time" name="time_to_late"></label>
        <label class="field" data-k="wyjscie">Wyjście o<input type="time" name="time_from"></label>
        <label class="field" data-k="wyjscie">Powrót o<input type="time" name="time_to"></label>
      </div>
      <label class="field">Uwaga dla kierownika (opcjonalnie)<textarea name="note" maxlength="500" placeholder="np. korek na A4, wizyta w urzędzie"></textarea></label>
      <p class="small muted">Nie wpisuj szczegółów medycznych — wystarczy „choroba”. Zwolnienie lekarskie (e-ZLA) trafia do pracodawcy osobno.</p>
      <div class="form-error" role="alert"></div>
      <button class="primary wide-btn" type="submit">Wyślij zgłoszenie</button>
    </form>`;
  }

  function viewSchedule(st) {
    if (!st.team) return `<div class="panel"><p class="muted">Grafik nie został jeszcze opublikowany.</p></div>${syncedLine(st)}`;
    const names = new Map(st.team.pracownicy.map(p => [p.ref, p]));
    const t = localDate();
    let html = '';
    for (let i = 0; i < 14; i++) {
      const d = addDays(t, i);
      const z = st.team.zmiany.filter(x => x.d === d).sort((a, b) => a.od.localeCompare(b.od));
      const a = (st.team.nieobecnosci || []).filter(x => x.od <= d && x.do >= d);
      const hol = (st.team.swieta || []).find(h => h.d === d);
      if (!z.length && !a.length && !hol) continue;
      html += `<section class="day ${d === t ? 'today' : ''}"><h3>${dayName(d)}, ${plDate(d)}${hol ? ` <span class="hol">${esc(hol.nazwa)}</span>` : ''}</h3><ul class="plain">
        ${z.map(x => { const p = names.get(x.e) || { imie: '?', nazwisko: '', kolor: '#888' }; const me = st.me && x.e === st.me.employee_ref;
    return `<li class="${me ? 'me' : ''}"><span class="dot" style="background:${esc(p.kolor)}">${esc((p.imie[0] || '') + (p.nazwisko[0] || ''))}</span> ${esc(p.imie)} ${esc(p.nazwisko)} <span class="muted">${esc(x.zm || '')} ${esc(x.od)}–${esc(x.do)}</span></li>`; }).join('')}
        ${a.map(x => { const p = names.get(x.e) || { imie: '?', nazwisko: '' }; return `<li class="abs">${icon('absence')} ${esc(p.imie)} ${esc(p.nazwisko)} — ${esc(x.etykieta)}</li>`; }).join('')}
      </ul></section>`;
    }
    return (html || '<div class="panel"><p class="muted">Brak zmian w najbliższych dwóch tygodniach.</p></div>') + syncedLine(st);
  }

  function viewMine(st) {
    const saldo = st.mine ? st.mine.saldo : [];
    return `<section class="panel"><h3>Wyjścia i odrabianie</h3>
        ${saldo.map(s => `<p><b>${s.miesiac}</b>: pozostało <b>${hm(s.pozostalo_min)}</b>${s.status_miesiaca === 'zamkniety' ? ' ' + tag('miesiąc zamknięty', '') : ''}</p>
          <ul class="plain small">${s.wyjscia.map(w => `<li>${plDate(w.dzien)} ${esc(w.od)}–${esc(w.do)}: ${hm(w.min)}, odrobiono ${hm(w.odrobiono)}</li>`).join('') || '<li class="muted">Brak wyjść.</li>'}</ul>`).join('') || '<p class="muted">Brak danych.</p>'}
      </section>
      <section class="panel"><h3>Moje nieobecności</h3><ul class="plain small">${(st.mine ? st.mine.nieobecnosci : []).map(n => `<li>${plDate(n.od)}${n.do !== n.od ? ` – ${plDate(n.do)}` : ''}: ${esc(n.nazwa)} ${tag(n.status)}</li>`).join('') || '<li class="muted">Brak w opublikowanym okresie.</li>'}</ul></section>
      <section class="panel"><h3>Wszystkie zgłoszenia</h3><ul class="plain">${st.reports.map(reportLine).join('') || '<li class="muted">Brak.</li>'}</ul></section>
      <section class="panel"><h3>Konto</h3><p class="small">${esc(st.session ? st.session.email : '')}</p>
        <button id="installHelp" class="link">${icon('download')} Jak dodać aplikację do ekranu telefonu</button><br>
        <button id="logout" class="link">${icon('logout')} Wyloguj</button>
        <p class="small muted">Wersja ${esc(cfg.version)}</p></section>`;
  }

  function bind(st) {
    $$('[data-goto]').forEach(b => b.onclick = () => { tab = b.dataset.goto; render(); });
    $$('[data-withdraw]').forEach(b => b.onclick = async () => {
      if (!confirm('Wycofać to zgłoszenie?')) return;
      try { await client.withdraw(b.dataset.withdraw); toast('Zgłoszenie wycofane.'); } catch (e) { toast(e.message, 'err'); } render();
    });
    $$('[data-drop]').forEach(b => b.onclick = () => { client.dropQueued(b.dataset.drop); render(); });
    const lo = $('#logout'); if (lo) lo.onclick = () => { if (confirm('Wylogować? Zgłoszenia czekające na wysłanie zostaną usunięte.')) { client.signOut(); renderLogin(); } };
    const ih = $('#installHelp'); if (ih) ih.onclick = () => alertBox();
    const f = $('#rf');
    if (f) {
      const showFor = () => { const k = f.kind.value; $$('[data-k]', f).forEach(el => el.classList.toggle('hidden', !el.dataset.k.split(' ').includes(k))); };
      f.addEventListener('change', showFor); showFor();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const k = f.kind.value;
        const r = { kind: k, date_from: f.date_from.value, date_to: (k === 'nieobecnosc' || k === 'inne') ? f.date_to.value : '',
          time_from: k === 'wyjscie' ? f.time_from.value : '', time_to: k === 'spoznienie' ? f.time_to_late.value : (k === 'wyjscie' ? f.time_to.value : ''), note: f.note.value };
        const b = $('button[type=submit]', f); b.disabled = true;
        try {
          client.queueReport(r);
          let msg = 'Zapisano na telefonie — wyślę, gdy będzie internet.';
          try { const res = await client.flush(); if (res.sent) msg = 'Wysłano. Kierownik zobaczy zgłoszenie w CNC Team.'; else if (res.error && !navigator.onLine) msg = 'Brak internetu — zgłoszenie wyśle się samo po połączeniu.'; } catch { /* zostaje w kolejce */ }
          toast(msg); tab = 'start'; await sync(false);
        } catch (err) { $('.form-error', f).textContent = err.message; b.disabled = false; }
      };
    }
  }

  function alertBox() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(ios ? 'Safari → Udostępnij → „Do ekranu początkowego”.' : 'Chrome → menu ⋮ → „Zainstaluj aplikację” lub „Dodaj do ekranu głównego”. Na Androidzie możesz też pobrać APK ze strony aplikacji.');
  }

  // ---------- Start ----------
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('online', () => { netState(); sync(false); });
  window.addEventListener('offline', netState);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(false); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(false); }, 60000);
  if (client.session()) { renderShell(); sync(false); } else renderLogin();
})();
