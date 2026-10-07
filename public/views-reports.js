// Widoki: raporty kierownicze, ustawienia.
'use strict';

const REPORT_TABS = [
  ['obecnosc', 'Obecność i absencje', 'range', ['Zaplanowano', 'Absencje']], ['wyjscia', 'Wyjścia i saldo', 'month', ['Czas wyjść', 'Odrobiono']],
  ['pokrycie', 'Pokrycie zmian', 'range', ['Zaplanowano', 'Nieobecni'], 'n'], ['obciazenie', 'Obciążenie zadaniami', 'range', ['Plan otwartych zadań']],
  ['postep', 'Postęp projektów', 'none', ['Przygotowanie %', 'Wykonanie %'], 'pct'], ['terminowosc', 'Terminowość', 'range', ['Liczba zadań'], 'n'],
  ['plan_wykonanie', 'Plan i wykonanie', 'none', ['Plan', 'Rzeczywisty aktywny']], ['blokady', 'Blokady i poprawki', 'range', ['Poprawki', 'Blokady i oczekiwanie']],
];

VIEWS.raporty = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const name = q.get('r') || 'obecnosc';
  const def = REPORT_TABS.find(t => t[0] === name) || REPORT_TABS[0];
  const ym = S.me.today.slice(0, 7);
  const params = new URLSearchParams();
  if (def[2] === 'range') { params.set('from', q.get('from') || `${ym}-01`); params.set('to', q.get('to') || lastDay(ym)); }
  if (def[2] === 'month') params.set('month', q.get('month') || ym);
  const rep = await api(`/reports/${name}?${params}`);
  const cols = rep.columns.map(([key, label, unit]) => ({ key, label, fmt: unit === 'min' ? 'hm' : unit === 'pct' ? 'pct' : undefined, num: typeof rep.rows[0]?.[key] === 'number' }));
  const c = rep.chart || {};
  const chartRows = c.rows || rep.rows;
  const filters = def[2] === 'range' ? `<label class="field">Od<input type="date" name="from" value="${params.get('from')}"></label><label class="field">Do<input type="date" name="to" value="${params.get('to')}"></label>`
    : def[2] === 'month' ? `<label class="field">Miesiąc<input type="month" name="month" value="${params.get('month')}"></label>` : '';
  main.innerHTML = head('Raporty kierownicze', 'Tylko administrator i przełożony. Raporty służą do wskazywania problemów do wyjaśnienia, nie do ukrytego monitorowania.',
    `<a class="btn" href="/api/reports/${name}.csv?${params}">${icon('download')}CSV</a><button type="button" id="printR">${icon('print')}Drukuj / PDF</button>`) +
    `<div class="tabs no-print">${REPORT_TABS.map(t => `<button class="${t[0] === name ? 'active' : ''}" data-r="${t[0]}">${esc(t[1])}</button>`).join('')}</div>
    ${filters ? `<form class="toolbar no-print" id="rf">${filters}<button class="primary">Pokaż</button></form>` : ''}
    <section class="panel"><h2 style="margin-top:0">${esc(rep.title)}${rep.from ? ` <span class="muted small">${plDate(rep.from)} – ${plDate(rep.to)}</span>` : ''}</h2>
      <p class="definition"><b>Definicja wskaźnika.</b> ${esc(rep.definition)}</p>
      <p class="small">Liczebność próbki: <b>${rep.sample}</b> · Kompletność danych: ${esc(rep.completeness)}</p>
      ${barChart(chartRows, c.label, c.value, c.value2, { unit: c.unit || def[4] || 'min', names: def[3] })}
      <h3 style="margin-top:var(--sp-4)">Tabela danych</h3>${table(cols, rep.rows, { empty: 'Brak danych w wybranym okresie (brak danych ≠ zero).' })}
      ${rep.extra ? `<h3 style="margin-top:var(--sp-4)">${esc(rep.extra.title)}</h3>${table(rep.extra.columns.map(([key, label, unit]) => ({ key, label, fmt: unit === 'min' ? 'hm' : unit === 'pct' ? 'pct' : undefined })), rep.extra.rows)}` : ''}
    </section>`;
  $$('[data-r]').forEach(b => b.onclick = () => { location.hash = `#/raporty?r=${b.dataset.r}`; });
  if ($('#rf')) $('#rf').onsubmit = (e) => { e.preventDefault(); location.hash = `#/raporty?r=${name}&${new URLSearchParams([...new FormData(e.target)])}`; };
  on('printR', () => window.print());
};

// ---------- Ustawienia ----------
VIEWS.ustawienia = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = q.get('t') || (isAdmin() ? 'firma' : 'konto');
  const tabs = isAdmin() ? [['firma', 'Zasady firmy'], ['konta', 'Konta i role'], ['zmiany', 'Szablony zmian i święta'], ['typy', 'Typy zadań'], ['integracja', 'Wymiana z CNC Process'], ['historia', 'Historia zmian'], ['konto', 'Moje konto']] : [['konto', 'Moje konto']];
  let body = '';
  if (tab === 'firma') {
    const settings = await api('/settings');
    body = `<section class="panel">${table([{ key: 'key', label: 'Klucz', fmt: v => `<span class="mono">${esc(v)}</span>` }, { key: 'value', label: 'Wartość' }, { key: 'description', label: 'Opis' }, { key: r => r, label: '', fmt: r => `<button class="link" data-set="${esc(r.key)}">Zmień</button>` }], settings)}</section>`;
    main.dataset.settings = JSON.stringify(settings);
  } else if (tab === 'konta') {
    const users = await api('/users');
    body = `<div class="toolbar">${btn('addUser', 'Nowe konto')}</div><section class="panel">${table([
      { key: 'login', label: 'Login' }, { key: 'display_name', label: 'Nazwa' }, { key: 'role', label: 'Rola', fmt: v => ({ admin: 'Administrator', supervisor: 'Przełożony', employee: 'Pracownik', guest: 'Gość' }[v]) },
      { key: r => r, label: 'Pracownik', fmt: r => r.employee_id ? person(r.employee_id) : '—' }, { key: 'can_view_confidential', label: 'Dane poufne', fmt: v => v ? tag('tak', 'warn', 'lock') : 'nie' },
      { key: r => r, label: 'Projekty gościa', fmt: r => r.role === 'guest' ? (r.guest_project_ids.map(id => `<span class="mono small">${esc(id)}</span>`).join(' ') || '<span class="muted">brak</span>') : '' },
      { key: 'active', label: 'Aktywne', fmt: v => v ? 'tak' : 'nie' }, { key: r => r, label: '', fmt: r => `<button class="link" data-user="${r.id}">Edytuj</button>` }], users)}</section>
      <p class="small muted">Gość widzi tylko status (postęp, opóźnienie, etapy) wskazanych projektów w realizacji — bez osób, czasów, notatek i powodów blokad.</p>`;
    main.dataset.users = JSON.stringify(users);
    main.dataset.projects = JSON.stringify((await api('/projects')).map(p => [p.id, `${p.order_no} · ${p.part_no} rev ${p.part_rev}${p.status !== 'aktywny' ? ` (${p.status})` : ''}`]));
  } else if (tab === 'zmiany') {
    body = `<div class="toolbar">${btn('addTpl', 'Szablon zmiany')}${btn('addHol', 'Dzień wolny / święto', 'calendar', '')}</div>
      <section class="panel"><h3>Szablony zmian</h3>${table([{ key: 'name', label: 'Nazwa' }, { key: 'short', label: 'Skrót' }, { key: r => `${r.start_time}–${r.end_time}`, label: 'Godziny' }, { key: 'break_min', label: 'Przerwa niewliczana', fmt: 'hm' }, { key: r => r, label: '', fmt: r => `<button class="link" data-tpl="${r.id}">Edytuj</button>` }], S.boot.shift_templates)}</section>
      <section class="panel"><h3>Święta i dni wolne</h3><p class="small muted">Dni ustawowo wolne generowane automatycznie (z Wigilią od 2025 r.); lista do potwierdzenia przez kadry. Dni firmowe dodaje administrator.</p>${table([{ key: 'date', label: 'Data', fmt: 'date' }, { key: 'name', label: 'Nazwa' }, { key: 'kind', label: 'Rodzaj' }], S.boot.holidays.filter(h => h.date >= `${S.me.today.slice(0, 4)}-01-01`))}</section>`;
  } else if (tab === 'typy') {
    body = `<div class="toolbar">${btn('addType', 'Typ zadania')}</div><section class="panel">${table([{ key: 'code', label: 'Kod', fmt: v => `<span class="mono">${esc(v)}</span>` }, { key: 'name', label: 'Nazwa' }, { key: 'phase', label: 'Etap (pasek)' }, { key: 'default_weight', label: 'Waga domyślna', num: true }, { key: 'active', label: 'Aktywny', fmt: v => v ? 'tak' : 'nie' }, { key: r => r, label: '', fmt: r => `<button class="link" data-type="${r.id}">Edytuj</button>` }], S.boot.task_types)}</section>`;
  } else if (tab === 'integracja') {
    const imports = await api('/integration/imports');
    body = `<section class="panel"><h3>Eksport do CNC Process</h3><p class="small">Plik JSON zawiera tylko identyfikatory produkcyjne: maszyny, zlecenia, detale i rewizje, operacje, obowiązujące programy NC. Nie zawiera pracowników, absencji, L4, dokumentów kadrowych ani raportów efektywności.</p>
        <a class="btn primary" href="/api/integration/cnc-process/export">${icon('download')}Pobierz cnc-team-exchange.json</a></section>
      <section class="panel"><h3>Import danych technologicznych</h3><p class="small">Format <span class="mono">cnc-process.techdata</span> wersja 1.0 (opis: docs/INTEGRATION_JSON.md). Walidacja wersji, identyfikatorów, jednostek (min), rewizji NC i duplikatów. Import nie zmienia rozliczeń zespołu.</p>
        <div class="toolbar"><input type="file" id="impFile" accept="application/json,.json"><button id="impDry">Sprawdź (bez zapisu)</button><button id="impGo" class="primary">${icon('upload')}Importuj</button></div><div id="impOut"></div>
        <h3 style="margin-top:var(--sp-4)">Historia importów</h3>${table([{ key: 'id', label: '#', num: true }, { key: r => new Date(r.imported_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Kiedy' }, { key: 'format_version', label: 'Wersja' }, { key: r => { const s = JSON.parse(r.summary); return `${s.items} pozycji, aktualne ${s.current}, nieaktualne ${s.stale}`; }, label: 'Podsumowanie' }], imports)}</section>`;
  } else if (tab === 'historia') {
    const log = await api('/audit');
    body = `<section class="panel"><p class="small muted">Ostatnie 300 zmian: kto, kiedy, co zmienił (było → jest) i z jakim opisem. Wpisów historii nie można edytować ani usuwać.</p>${historyTable(log)}</section>`;
  } else {
    body = `<section class="panel" style="max-width:520px"><h3>Zmiana hasła</h3><form id="pwF" class="form-grid"><label class="field">Obecne hasło<input type="password" name="old_password" required autocomplete="current-password"></label><label class="field">Nowe hasło (min. 10 znaków)<input type="password" name="new_password" required autocomplete="new-password"></label><div class="wide"><button class="primary">Zmień hasło</button></div></form></section>`;
  }
  main.innerHTML = head('Ustawienia', isAdmin() ? 'Konta, zasady firmy, katalogi i wymiana danych. Każda zmiana trafia do historii.' : 'Ustawienia konta.') +
    `<div class="tabs">${tabs.map(([id, l]) => `<button class="${tab === id ? 'active' : ''}" data-st="${id}">${esc(l)}</button>`).join('')}</div>${body}`;
  $$('[data-st]').forEach(b => b.onclick = () => { location.hash = `#/ustawienia?t=${b.dataset.st}`; });
  $$('[data-set]').forEach(b => b.onclick = () => {
    const s = JSON.parse(main.dataset.settings).find(x => x.key === b.dataset.set);
    openForm({ title: `Ustawienie ${s.key}`, intro: `<p class="small">${esc(s.description || '')}</p>`, fields: [{ name: 'value', label: 'Wartość', value: s.value, wide: true }, { name: 'reason', label: 'Powód zmiany', wide: true }], submit: (v, idem) => post(`/settings/${s.key}`, v, idem, 'PUT') });
  });
  const userForm = (u = {}) => openForm({ title: u.id ? `Konto ${u.login}` : 'Nowe konto', fields: [
    { name: 'login', label: 'Login', value: u.login, required: true }, { name: 'display_name', label: 'Nazwa wyświetlana', value: u.display_name, required: true },
    { name: 'role', label: 'Rola', type: 'select', value: u.role, required: true, options: [['admin', 'Administrator'], ['supervisor', 'Przełożony'], ['employee', 'Pracownik'], ['guest', 'Gość — tylko status projektów']] },
    { name: 'guest_project_ids', label: 'Projekty widoczne dla gościa', type: 'multi', options: JSON.parse(main.dataset.projects || '[]'), value: u.guest_project_ids || [], wide: true, show: v => v.role === 'guest' },
    { name: 'employee_id', label: 'Powiązany pracownik', type: 'select', options: empOptions(false), value: u.employee_id, show: v => v.role === 'employee' },
    { name: 'can_view_confidential', label: 'Dostęp do poufnych notatek i referencji kadrowych', type: 'checkbox', value: !!u.can_view_confidential, show: v => v.role === 'supervisor' },
    { name: 'active', label: 'Konto aktywne', type: 'checkbox', value: u.id ? !!u.active : true },
    { name: 'password', label: u.id ? 'Nowe hasło (puste = bez zmian)' : 'Hasło (min. 10 znaków)', type: 'password', required: !u.id },
    ...(u.id ? [{ name: 'reason', label: 'Opis zmiany (do historii)', wide: true }] : [])],
  submit: (v, idem) => u.id ? post(`/users/${u.id}`, v, idem, 'PUT') : post('/users', v, idem) });
  on('addUser', () => userForm());
  $$('[data-user]').forEach(b => b.onclick = () => userForm(JSON.parse(main.dataset.users).find(x => x.id === Number(b.dataset.user))));
  const tplForm = (t = {}) => openForm({ title: t.id ? 'Edytuj szablon zmiany' : 'Nowy szablon zmiany', fields: [{ name: 'name', label: 'Nazwa', value: t.name, required: true }, { name: 'short', label: 'Skrót', value: t.short, required: true }, { name: 'start_time', label: 'Początek', type: 'time', value: t.start_time, required: true }, { name: 'end_time', label: 'Koniec', type: 'time', value: t.end_time, required: true, help: 'Koniec ≤ początek = następnego dnia.' }, { name: 'break_min', label: 'Przerwa niewliczana (min)', type: 'number', value: t.break_min ?? 0 }],
    submit: (v, idem) => (t.id ? post(`/shift-templates/${t.id}`, v, idem, 'PUT') : post('/shift-templates', v, idem)).then(r => (loadBoot(), r)) });
  on('addTpl', () => tplForm());
  $$('[data-tpl]').forEach(b => b.onclick = () => tplForm(S.boot.shift_templates.find(t => t.id === Number(b.dataset.tpl))));
  on('addHol', () => openForm({ title: 'Dzień wolny', fields: [{ name: 'date', label: 'Data', type: 'date', required: true }, { name: 'name', label: 'Nazwa', required: true }, { name: 'kind', label: 'Rodzaj', type: 'select', placeholder: false, options: [['firmowe', 'dzień wolny firmowy'], ['ustawowe', 'święto ustawowe']] }], submit: (v, idem) => post('/holidays', v, idem).then(r => (loadBoot(), r)) }));
  const typeForm = (t = {}) => openForm({ title: t.id ? 'Edytuj typ zadania' : 'Nowy typ zadania', fields: [{ name: 'code', label: 'Kod', value: t.code, required: true }, { name: 'name', label: 'Nazwa', value: t.name, required: true }, { name: 'phase', label: 'Etap', type: 'select', value: t.phase, required: true, options: [['przygotowanie', 'przygotowanie programu'], ['wykonanie', 'wykonanie detalu']] }, { name: 'default_weight', label: 'Waga domyślna', type: 'number', value: t.default_weight ?? 1 }, { name: 'active', label: 'Aktywny', type: 'checkbox', value: t.id ? !!t.active : true }, { name: 'sort', label: 'Kolejność', type: 'number', value: t.sort ?? 200 }],
    submit: (v, idem) => (t.id ? post(`/task-types/${t.id}`, v, idem, 'PUT') : post('/task-types', v, idem)).then(r => (loadBoot(), r)) });
  on('addType', () => typeForm());
  $$('[data-type]').forEach(b => b.onclick = () => typeForm(S.boot.task_types.find(t => t.id === Number(b.dataset.type))));
  const runImport = async (dry) => {
    const f = $('#impFile').files[0];
    if (!f) return toast('Wybierz plik JSON.', 'warn');
    const text = await f.text();
    try {
      const r = await api(`/integration/cnc-process/import${dry ? '?dry_run=1' : ''}`, { method: 'POST', raw: text });
      $('#impOut').innerHTML = `<div class="notice info">${dry ? 'Plik poprawny (bez zapisu).' : `Zaimportowano (#${r.import_id}).`} Pozycji: ${r.items}, aktualnych: ${r.current}, nieaktualnych: ${r.stale}.${r.warnings.length ? `<ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>`;
    } catch (e) { $('#impOut').innerHTML = `<div class="notice danger" style="white-space:pre-line">${esc(describeError(e))}</div>`; }
  };
  on('impDry', () => runImport(true)); on('impGo', () => runImport(false));
  if ($('#pwF')) $('#pwF').onsubmit = async (e) => { e.preventDefault(); try { await api('/me/password', { method: 'POST', body: { old_password: e.target.old_password.value, new_password: e.target.new_password.value } }); toast('Hasło zmienione.'); e.target.reset(); } catch (err) { toast(err.message, 'err'); } };
};

start();
