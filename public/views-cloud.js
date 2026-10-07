// Widoki: zgłoszenia pracowników z aplikacji (chmura) oraz ustawienia połączenia.
'use strict';

const APP_URL = 'https://pawelpasik85-cyber.github.io/cnc-team-app/';
const KIND_LABEL = { nieobecnosc: ['Nieobecność', 'absence'], spoznienie: ['Spóźnienie', 'today'], wyjscie: ['Wyjście', 'exit'], inne: ['Inne', 'other'] };
const REPORT_STATUS = { nowe: ['nowe — do decyzji', 'warn'], przyjete: ['przyjęte', 'ok'], odrzucone: ['odrzucone', 'danger'], wycofane: ['wycofane przez pracownika', ''] };

function cloudStatusLine(st) {
  if (!st.connected) return `<div class="notice">Brak połączenia z chmurą. Zaloguj się w <a href="#/ustawienia?t=chmura">Ustawienia → Aplikacja pracowników</a>.</div>`;
  const last = st.last_sync;
  return `<p class="small">Chmura: ${tag(st.email, 'accent', 'lock')} · ostatnia synchronizacja: ${last ? `${new Date(last.at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })} ${last.ok ? tag('ok', 'ok') : tag(last.message, 'danger', 'alert')}` : 'jeszcze nie było'} · automatycznie co 2 minuty, gdy CNC Team działa.</p>`;
}

VIEWS.zgloszenia = async (main) => {
  const [local, st, list] = await Promise.all([localRequestsSection(), api('/cloud/status'), api('/cloud/reports')]);
  const showCloud = st.connected || list.length;
  main.innerHTML = head('Zgłoszenia pracowników', 'Spóźnienia, nieobecności, wyjścia i odrobienia zgłoszone przez pracowników. Nic nie trafia do grafiku ani rozliczeń bez Twojej decyzji.',
    st.connected ? btn('syncNow', 'Synchronizuj aplikację w chmurze', 'makeup', '') : '') + local.html + (showCloud ? `
    <h2>Z aplikacji w chmurze</h2>${cloudStatusLine(st)}
    <section class="panel">${table([
      { key: r => r, label: 'Pracownik', fmt: r => r.employee_known ? person(r.employee_ref) : `<span class="muted">nieznany (#${r.employee_ref})</span>` },
      { key: r => r, label: 'Rodzaj', fmt: r => `${icon(KIND_LABEL[r.kind][1])} ${esc(KIND_LABEL[r.kind][0])}` },
      { key: r => r, label: 'Kiedy', fmt: r => `${plDate(r.date_from)}${r.date_to !== r.date_from ? ` – ${plDate(r.date_to)}` : ''}${r.kind === 'spoznienie' ? (r.time_to ? ` · przyjście ${esc(r.time_to)}` : '') : (r.time_from ? ` · ${esc(r.time_from)}–${esc(r.time_to || '')}` : '')}` },
      { key: 'note', label: 'Uwaga pracownika' },
      { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Zgłoszono' },
      { key: r => r, label: 'Status', fmt: r => `${tag(...REPORT_STATUS[r.status])}${r.decision_note ? `<br><span class="small">${esc(r.decision_note)}</span>` : ''}${r.cnc_ref ? `<br><span class="small muted">wpis: ${esc(r.cnc_ref)}</span>` : ''}${r.local_error ? `<br>${tag(`błąd wpisu: ${r.local_error}`, 'danger', 'alert')}` : ''}` },
      { key: r => r, label: '', fmt: r => r.status === 'nowe' && r.employee_known ? `<button data-accept="${esc(r.id)}" class="primary">Przyjmij</button> <button data-reject="${esc(r.id)}" class="link">Odrzuć</button>` : '' },
    ], list, { empty: 'Brak zgłoszeń z aplikacji w chmurze.', rowClass: r => r.status === 'wycofane' ? 'row-cancel' : '' })}</section>` : '');
  local.bind();
  on('syncNow', async () => { try { const r = await api('/cloud/sync', { method: 'POST' }); toast(`Zsynchronizowano. Nowe zgłoszenia: ${r.added}.`); rerender(); } catch (e) { toast(e.message, 'err'); } });
  $$('[data-accept]').forEach(b => b.onclick = () => acceptForm(list.find(r => r.id === b.dataset.accept)));
  $$('[data-reject]').forEach(b => b.onclick = () => openForm({
    title: 'Odrzuć zgłoszenie', intro: '<p class="small">Pracownik zobaczy decyzję i wyjaśnienie w aplikacji.</p>',
    fields: [{ name: 'note', label: 'Wyjaśnienie dla pracownika', type: 'textarea', required: true, wide: true }], submitLabel: 'Odrzuć',
    submit: async (v) => { await api(`/cloud/reports/${b.dataset.reject}/decide`, { method: 'POST', body: { decision: 'odrzucone', note: v.note } }); toast('Odrzucono — pracownik zobaczy decyzję.'); setTimeout(rerender, 50); },
  }));
};

function acceptForm(r) {
  const cats = S.boot.categories.filter(c => c.active && !['WYJSCIE_PRYWATNE', 'OKOLICZNOSCIOWY'].includes(c.code));
  const byCode = (code) => cats.find(c => c.code === code)?.id;
  const options = [];
  if (r.kind === 'spoznienie') options.push(['exit', 'Do odrobienia — jak wyjście prywatne (od początku zmiany do przyjścia)'], ['absence:' + byCode('SPOZNIENIE_USPRAW'), 'Spóźnienie usprawiedliwione (bez odrabiania)'], ['absence:' + byCode('SPOZNIENIE_NIEUSPRAW'), 'Spóźnienie nieusprawiedliwione']);
  if (r.kind === 'wyjscie') options.push(['exit', 'Wyjście prywatne do odrobienia']);
  if (r.kind === 'nieobecnosc' || r.kind === 'inne') options.push(['absence', 'Nieobecność — wybierz kategorię']);
  options.push(['none', 'Przyjmij bez wpisu w CNC Team (wpiszę ręcznie)']);
  openForm({
    title: `Przyjmij: ${KIND_LABEL[r.kind][0]} — ${S.emp.get(r.employee_ref)?.first_name || ''}`,
    intro: `<p class="small">${plDate(r.date_from)}${r.date_to !== r.date_from ? ` – ${plDate(r.date_to)}` : ''} ${r.time_from || ''}${r.time_to ? ` – ${r.time_to}` : ''}${r.note ? `<br>Uwaga: ${esc(r.note)}` : ''}</p>`,
    fields: [
      { name: 'target', label: 'Jak rozliczyć', type: 'select', options, value: options[0][0], placeholder: false, wide: true },
      { name: 'category_id', label: 'Kategoria nieobecności', type: 'select', options: cats.map(c => [c.id, c.subtype ? `${c.name} — ${c.subtype}` : c.name]), value: byCode('INNE_USPRAW'), placeholder: false, wide: true, show: v => v.target === 'absence' },
      { name: 'unit', label: 'Jednostka (gdy kategoria pozwala)', type: 'select', options: [['dni', 'dni'], ['godziny', 'godziny']], value: r.time_from ? 'godziny' : 'dni', placeholder: false, show: v => v.target === 'absence' },
      { name: 'written_request', label: 'Uznaj zgłoszenie z aplikacji za pisemny wniosek pracownika', type: 'checkbox', wide: true, help: 'Czy forma elektroniczna spełnia wymóg wniosku — do potwierdzenia z kadrami.', show: v => v.target === 'exit' },
      { name: 'note', label: 'Informacja dla pracownika (opcjonalnie)', wide: true },
    ],
    submitLabel: 'Przyjmij',
    submit: async (v) => {
      let target = { type: v.target.split(':')[0] };
      if (target.type === 'absence') target = { type: 'absence', category_id: Number(v.target.split(':')[1] || v.category_id), unit: v.unit };
      if (target.type === 'exit') target.written_request = v.written_request;
      const res = await api(`/cloud/reports/${r.id}/decide`, { method: 'POST', body: { decision: 'przyjete', note: v.note, target } });
      if (res.local_error) toast(`Decyzja wysłana, ale wpisu nie utworzono: ${res.local_error}`, 'err');
      else toast(res.cnc_ref ? 'Przyjęto i utworzono wpis.' : 'Przyjęto.');
      setTimeout(rerender, 50);
      return res;
    },
  });
}

// Zakładka ustawień „Aplikacja pracowników”
async function cloudSettings() {
  const st = await api('/cloud/status');
  const emps = [...S.emp.values()].filter(e => e.active);
  return `<section class="panel"><h3>Aplikacja pracowników na telefon</h3>
      <p class="small">Pracownicy otwierają <a href="${APP_URL}" target="_blank" rel="noopener">${APP_URL}</a> (lub instalują APK z tej strony), logują się zaproszonym adresem e-mail i zgłaszają nieobecność, spóźnienie lub wyjście — także z domu. Do chmury trafia tylko ich grafik, ich saldo i grafik zespołu z ogólnymi etykietami nieobecności.</p>
      ${cloudStatusLine(st)}
      ${st.connected ? `<div class="toolbar">${btn('syncNow2', 'Synchronizuj teraz', 'makeup', 'primary')}<button id="cloudLogout" class="link">Wyloguj z chmury</button><button id="cloudPreview" class="link">Podgląd publikowanych danych</button></div>`
      : `<form id="cloudLogin" class="form-grid" style="max-width:640px">
          <label class="field">E-mail kierownika<input name="email" type="email" required autocomplete="username"></label>
          <label class="field">Hasło do chmury (min. 10 znaków)<input name="password" type="password" required autocomplete="current-password"></label>
          <label class="field inline wide"><input type="checkbox" name="signup"> Pierwsze logowanie — utwórz konto (adres musi być zaproszony)</label>
          <div class="wide"><button class="primary">Połącz z chmurą</button></div><div class="form-error wide" role="alert"></div></form>`}
    </section>
    <section class="panel"><h3>Zaproszenia pracowników</h3>
      <p class="small">Zaproszenie powstaje przy synchronizacji dla każdego aktywnego pracownika z adresem e-mail w profilu (Pracownicy → Edytuj → E-mail). Pracownik przy pierwszym wejściu wybiera „Pierwsze logowanie” i ustala hasło.</p>
      ${table([{ key: r => r, label: 'Pracownik', fmt: r => person(r.id) }, { key: 'email', label: 'E-mail', fmt: v => v ? esc(v) : '<span class="muted">brak — dodaj w profilu</span>' }], emps)}
      <div id="invState"></div></section>
    <section class="panel"><h3>Dziennik synchronizacji</h3>${table([{ key: r => new Date(r.at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Kiedy' }, { key: 'action', label: 'Akcja' }, { key: 'ok', label: 'Wynik', fmt: v => v ? tag('ok', 'ok') : tag('błąd', 'danger') }, { key: 'message', label: 'Szczegóły' }], st.log, { empty: 'Brak wpisów.' })}</section>`;
}

function bindCloudSettings() {
  const f = $('#cloudLogin');
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const b = $('button', f); b.disabled = true;
    try {
      await api('/cloud/login', { method: 'POST', body: { email: f.email.value, password: f.password.value, mode: f.signup.checked ? 'signup' : 'login' } });
      toast('Połączono z chmurą.');
      try { await api('/cloud/sync', { method: 'POST' }); } catch (err) { toast(err.message, 'err'); }
      rerender();
    } catch (err) { $('.form-error', f).textContent = err.message; b.disabled = false; }
  };
  on('syncNow2', async () => {
    try {
      const r = await api('/cloud/sync', { method: 'POST' });
      $('#invState').innerHTML = `<h3 style="margin-top:var(--sp-3)">Stan kont w chmurze</h3>` + table([{ key: 'display_name', label: 'Osoba' }, { key: 'email', label: 'E-mail' }, { key: 'role', label: 'Rola' }, { key: 'registered', label: 'Konto założone', fmt: v => v ? tag('tak', 'ok') : tag('jeszcze nie', 'warn') }], r.invites);
      toast(`Zsynchronizowano. Nowe zgłoszenia: ${r.added}.`);
    } catch (err) { toast(err.message, 'err'); }
  });
  on('cloudLogout', async () => { await api('/cloud/logout', { method: 'POST' }); rerender(); });
  on('cloudPreview', async () => {
    const items = await api('/cloud/preview');
    openForm({ title: 'Dane publikowane w chmurze', submitLabel: 'Zamknij', fields: [], submit: async () => {},
      intro: `<p class="small">Dokładnie to trafi do chmury przy synchronizacji (grafik: ostatni tydzień i 6 tygodni naprzód).</p><pre class="small mono" style="white-space:pre-wrap;max-height:60vh;overflow:auto">${esc(JSON.stringify(items, null, 1)).slice(0, 60000)}</pre>` });
  });
}
