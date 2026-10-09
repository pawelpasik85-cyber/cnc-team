// Widoki: pracownicy, wyjścia i odrabianie, urlopy i absencje.
'use strict';

// ---------- Pracownicy ----------
VIEWS.pracownicy = async (main) => {
  const emps = await api('/employees');
  S.emp = new Map(emps.map(e => [e.id, e]));
  const balances = await api(`/balances?month=${S.me.today.slice(0, 7)}`).catch(() => []);
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const year = /^20\d{2}$/.test(q.get('rok') || '') ? Number(q.get('rok')) : Number(S.me.today.slice(0, 4));
  const leave = can('view.leave.all') ? await api(`/leave/summary?year=${year}`).catch(() => []) : [];
  const leaveBy = new Map(leave.map(x => [x.employee_id, x]));
  const yearNav = leave.length ? `<span class="lc-yearnav"><span class="muted small">Urlopy</span><a class="btn" href="#/pracownicy?rok=${year - 1}" aria-label="Poprzedni rok">‹</a><span class="btn lc-year">${year}</span><a class="btn" href="#/pracownicy?rok=${year + 1}" aria-label="Następny rok">›</a></span>` : '';
  const machines = new Map(S.boot.machines.map(m => [m.id, m]));
  main.innerHTML = head('Pracownicy', `Profile, wymiar etatu, normy, kompetencje i obsługiwane maszyny${leave.length ? ', a pod każdym — wykorzystane urlopy i nieobecności w roku' : ''}.`, yearNav + (isAdmin() ? btn('addEmp', 'Dodaj pracownika') : '')) +
    `<div class="cols">${emps.map(e => {
      const t = e.current_terms; const b = balances.find(x => x.employee_id === e.id);
      return `<section class="panel"><div class="page-head" style="margin:0 0 var(--sp-2)"><h3>${person(e.id)}</h3>${e.active ? tag('aktywny', 'ok') : tag('nieaktywny')}</div>
        <dl class="small" style="display:grid;grid-template-columns:150px 1fr;gap:3px 10px;margin:0">
          ${e.employment_start ? `<dt class="muted">Zatrudnienie</dt><dd style="margin:0">${plDate(e.employment_start)} – ${e.employment_end ? plDate(e.employment_end) : 'obecnie'}</dd>` : ''}
          ${t ? `<dt class="muted">Etat od ${plDate(t.valid_from)}</dt><dd style="margin:0">${t.fte_num}/${t.fte_den}, norma ${hm(t.daily_norm_min)} / dzień, ${hm(t.weekly_norm_min)} / tydzień</dd><dt class="muted">Przelicznik urlopu</dt><dd style="margin:0">1 dzień = ${hm(t.leave_day_min)}</dd>` : ''}
          <dt class="muted">Maszyny</dt><dd style="margin:0">${(e.machine_ids || []).map(m => tag(`${machines.get(m)?.name || m} ${machines.get(m)?.axes || ''}X`, 'accent')).join(' ') || '—'}</dd>
          <dt class="muted">Kompetencje</dt><dd style="margin:0">${(e.competences || []).map(c => tag(c)).join(' ') || '—'}</dd>
          ${b ? `<dt class="muted">Saldo do odrobienia</dt><dd style="margin:0">${hm(b.remaining_min)}</dd>` : ''}
          ${e.initial_settlement_note !== undefined ? `<dt class="muted">Dane początkowe</dt><dd style="margin:0">${esc(e.initial_settlement_note || '—')} ${e.initial_settlement_approved_at ? tag('zatwierdzone', 'ok', 'check') : tag('niezatwierdzone', 'warn')}</dd>` : ''}
          ${e.hr_reference ? `<dt class="muted">Referencja kadrowa</dt><dd style="margin:0">${icon('lock')} ${esc(e.hr_reference)}</dd>` : ''}
        </dl>
        ${leaveBy.has(e.id) ? `<div class="lc-emp"><h4>Urlopy i nieobecności ${year}</h4>${leaveRows(leaveBy.get(e.id), year)}</div>` : ''}
        ${e.terms && e.terms.length > 1 ? `<details class="small"><summary>Historia etatu (${e.terms.length})</summary>${table([{ key: 'valid_from', label: 'Od', fmt: 'date' }, { key: r => `${r.fte_num}/${r.fte_den}`, label: 'Etat' }, { key: 'daily_norm_min', label: 'Norma dobowa', fmt: 'hm' }, { key: 'note', label: 'Uwagi' }], e.terms)}</details>` : ''}
        ${isAdmin() ? `<div class="toolbar" style="margin-top:var(--sp-3)"><button data-edit="${e.id}">Edytuj</button><button data-terms="${e.id}">Zmiana etatu</button>${!e.initial_settlement_approved_at ? `<button data-approve="${e.id}">Zatwierdź dane początkowe</button>` : ''}</div>` : ''}
      </section>`;
    }).join('')}</div>`;
  on('addEmp', () => employeeForm());
  $$('[data-edit]').forEach(b => b.onclick = () => employeeForm(S.emp.get(Number(b.dataset.edit))));
  $$('[data-terms]').forEach(b => b.onclick = () => termsForm(Number(b.dataset.terms)));
  $$('[data-approve]').forEach(b => b.onclick = async () => { await post(`/employees/${b.dataset.approve}/approve-initial`, {}); });
};

function employeeForm(e = {}) {
  openForm({
    title: e.id ? 'Edytuj pracownika' : 'Nowy pracownik', fields: [
      { name: 'first_name', label: 'Imię', value: e.first_name, required: true }, { name: 'last_name', label: 'Nazwisko', value: e.last_name, required: true },
      { name: 'color', label: 'Kolor (stały, edytowalny)', type: 'color', value: e.color || '#2E86DE', required: true },
      { name: 'active', label: 'Konto aktywne', type: 'checkbox', value: e.id ? !!e.active : true },
      { name: 'employment_start', label: 'Początek zatrudnienia', type: 'date', value: e.employment_start, required: true },
      { name: 'employment_end', label: 'Koniec zatrudnienia', type: 'date', value: e.employment_end },
      { name: 'machine_ids', label: 'Obsługiwane maszyny', type: 'multi', options: machineOptions(), value: e.machine_ids || [], wide: true },
      { name: 'competences', label: 'Kompetencje (oddzielone przecinkami)', value: (e.competences || []).join(', '), wide: true },
      { name: 'initial_settlement_note', label: 'Dane początkowe rozliczeń (z kadr)', type: 'textarea', value: e.initial_settlement_note, wide: true },
      { name: 'hr_reference', label: 'Referencja kadrowa (poufne)', value: e.hr_reference, wide: true },
      ...(e.id ? [{ name: 'reason', label: 'Powód zmiany', wide: true }] : []),
    ], submit: (v, idem) => {
      v.competences = (v.competences || '').split(',').map(s => s.trim()).filter(Boolean);
      return e.id ? post(`/employees/${e.id}`, v, idem, 'PUT') : post('/employees', v, idem);
    },
  });
}
function termsForm(id) {
  openForm({
    title: 'Zmiana etatu / norm z datą obowiązywania', intro: '<p class="small muted">Nie zakładaj 8 h dziennie — wpisz normy obowiązujące pracownika. Przelicznik dnia urlopu służy tylko do prezentacji w dniach.</p>', fields: [
      { name: 'valid_from', label: 'Obowiązuje od', type: 'date', required: true },
      { name: 'fte_num', label: 'Etat — licznik', type: 'number', value: 1, required: true }, { name: 'fte_den', label: 'Etat — mianownik', type: 'number', value: 1, required: true },
      { name: 'daily_norm_min', label: 'Norma dobowa', type: 'hm', value: 480, required: true }, { name: 'weekly_norm_min', label: 'Norma tygodniowa', type: 'hm', value: 2400, required: true },
      { name: 'leave_day_min', label: '1 dzień urlopu =', type: 'hm', value: 480, required: true },
      { name: 'note', label: 'Uwagi', wide: true },
    ], submit: (v, idem) => post(`/employees/${id}/terms`, v, idem),
  });
}

// ---------- Wyjścia i odrabianie ----------
const EXIT_STATE = { do_odrobienia: ['do odrobienia', 'warn'], czesciowo_rozliczone: ['częściowo rozliczone', 'warn'], rozliczone: ['rozliczone', 'ok'], planowane: ['planowane', ''], anulowane: ['anulowane', ''], nierozliczone_do_kadr: ['nierozliczone — do przekazania kadrom', 'danger'] };
VIEWS.wyjscia = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const ym = q.get('m') || S.me.today.slice(0, 7);
  const calFrom = addDays(`${ym}-01`, 1 - weekday(`${ym}-01`)), calTo = addDays(lastDay(ym), 7 - weekday(lastDay(ym)));
  const [exits, makeups, balances, months, sched] = await Promise.all([
    api(`/exits?month=${ym}`), api(`/makeups?month=${ym}`), api(`/balances?month=${ym}`), can('view.months') ? api('/months') : Promise.resolve([]),
    api(`/schedule?from=${calFrom}&to=${calTo}`).catch(() => []),
  ]);
  const mStatus = months.find(m => m.year_month === ym) || { status: 'otwarty', version: 0 };
  const closed = mStatus.status === 'zamkniety';
  const nav = `<a class="btn" href="#/wyjscia?m=${addMonths(ym, -1)}">‹</a><span class="btn" aria-live="polite">${plMonth(ym)}</span><a class="btn" href="#/wyjscia?m=${addMonths(ym, 1)}">›</a>`;
  const tools = nav + (isAdmin() && !closed ? btn('addExit', 'Wyjście prywatne') + btn('addMk', 'Odrabianie', 'makeup', '') : '');
  main.innerHTML = head('Wyjścia i odrabianie', `Rozliczenie w miesiącu kalendarzowym (zasada firmy, nie termin ustawowy). Miesiąc: ${closed ? tag(`zamknięty, wersja ${mStatus.version}`, 'danger', 'lock') : tag('otwarty', 'ok')}`, tools) + `
    ${exitCalendar(ym, calFrom, calTo, exits, makeups, sched)}
    <div class="notice info small">Wpis administratora nie zastępuje pisemnego wniosku pracownika. Nadgodziny nie są automatycznie zamieniane na odrobienie, a nadwyżka odrabiania nie tworzy kredytu.</div>
    <section class="panel"><h3>Salda</h3>${table([
      { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) }, { key: 'exits_count', label: 'Wyjścia', num: true }, { key: 'exits_min', label: 'Czas wyjść', fmt: 'hm' },
      { key: 'settled_min', label: 'Odrobiono (zatwierdzone)', fmt: 'hm' }, { key: 'remaining_min', label: 'Saldo', num: true, fmt: v => `<b>${hm(v)}</b>` }, { key: 'remaining_shifts', label: 'Pozostałe zmiany', num: true },
    ], balances)}</section>
    <section class="panel"><h3>Wyjścia prywatne</h3>${table([
      { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) }, { key: 'work_date', label: 'Dzień zmiany', fmt: 'date' },
      { key: r => `${r.start_local.time}–${r.end_local.time}${r.end_local.date !== r.start_local.date ? ' (+1)' : ''}`, label: 'Godziny' },
      { key: 'minutes', label: 'Minuty wg grafiku', fmt: 'hm' }, { key: 'settled_min', label: 'Odrobiono', fmt: 'hm' }, { key: 'remaining_min', label: 'Pozostało', fmt: 'hm' },
      { key: 'state', label: 'Status', fmt: v => tag(...(EXIT_STATE[v] || [v, ''])) },
      ...(S.me.role !== 'employee' ? [{ key: r => r, label: 'Wniosek', fmt: r => r.written_request ? tag('pisemny', 'ok') : tag('brak wniosku', 'warn') }] : []),
      ...(can('view.confidential') ? [{ key: r => r, label: 'Dokument / notatka poufna', fmt: r => `${esc(r.document_ref || '')}${r.confidential_note ? `<br>${icon('lock')} ${esc(r.confidential_note)}` : ''}` }] : []),
      ...(isAdmin() && !closed ? [{ key: r => r, label: '', fmt: r => r.status !== 'anulowane' ? `<button data-cancel-exit="${r.id}" class="link">Anuluj</button>` : '' }] : []),
    ], exits, { rowClass: r => r.status === 'anulowane' ? 'row-cancel' : '' })}</section>
    <section class="panel"><h3>Odrabianie</h3>${table([
      { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) }, { key: 'work_date', label: 'Data', fmt: 'date' },
      { key: r => `${r.start_local.time}–${r.end_local.time}`, label: 'Godziny' }, { key: 'minutes', label: 'Czas', fmt: 'hm' },
      { key: 'allocated_min', label: 'Przypisano do wyjść', fmt: 'hm' }, { key: 'unallocated_min', label: 'Nieprzypisane (bez kredytu)', fmt: 'hm' },
      { key: r => r, label: 'Przypisania', fmt: r => r.allocations.map(a => `#${a.exit_id}: ${hm(a.minutes)}`).join('<br>') },
      { key: 'status', label: 'Status', fmt: v => tag(v, v === 'zatwierdzone' ? 'ok' : v === 'odrzucone' ? 'danger' : 'warn') },
      ...(isAdmin() && !closed ? [{ key: r => r, label: '', fmt: r => r.status === 'oczekuje' ? `<button data-approve-mk="${r.id}">Zatwierdź</button> <button data-reject-mk="${r.id}" class="link">Odrzuć</button>` : '' }] : []),
    ], makeups)}</section>
    ${can('view.months') ? `<section class="panel" id="monthPanel"><h3>Zamknięcie miesiąca ${plMonth(ym)}</h3>
      <p class="small muted">Zamknięcie zachowuje nierozliczone minuty ze statusem „nierozliczone — do przekazania kadrom”, nie przenosi ich do kolejnego miesiąca i nie oblicza potrąceń. Korekta wymaga ponownego otwarcia z powodem; poprzednie wersje raportu są zachowane.</p>
      <div class="toolbar">${isAdmin() ? (closed ? btn('reopen', 'Otwórz ponownie (korekta)', 'lock', 'danger') : btn('closeM', 'Zamknij miesiąc', 'lock')) : ''}
        <a class="btn" href="/api/months/${ym}/report.csv">${icon('download')}Zestawienie CSV</a><button type="button" id="printM">${icon('print')}Drukuj / PDF</button></div>
      <div id="versions"></div></section>` : ''}`;
  on('addExit', () => exitForm(ym));
  on('addMk', () => makeupForm(ym, exits));
  $$('[data-cancel-exit]').forEach(b => b.onclick = () => confirmReason('Anuluj wyjście', 'Anulowany wpis pozostaje w historii.', r => post(`/exits/${b.dataset.cancelExit}`, { status: 'anulowane', reason: r }, undefined, 'PATCH')));
  $$('[data-approve-mk]').forEach(b => b.onclick = async () => { b.disabled = true; try { await post(`/makeups/${b.dataset.approveMk}/decision`, { decision: 'zatwierdzone' }); } catch (e) { toast(e.message, 'err'); b.disabled = false; } });
  $$('[data-reject-mk]').forEach(b => b.onclick = () => confirmReason('Odrzuć odrabianie', 'Przypisane minuty zostaną zwolnione.', r => post(`/makeups/${b.dataset.rejectMk}/decision`, { decision: 'odrzucone', reason: r })));
  on('closeM', async () => {
    const prev = await api(`/months/${ym}/preview`);
    const open = prev.employees.filter(e => e.remaining_min > 0);
    openForm({ title: `Zamknij miesiąc ${plMonth(ym)}`, intro: open.length ? `<div class="notice">Nierozliczone saldo zostanie przekazane kadrom:<ul>${open.map(e => `<li>${esc(e.name)}: ${hm(e.remaining_min)}</li>`).join('')}</ul></div>` : '<p class="notice info">Wszystkie wyjścia rozliczone.</p>',
      fields: [{ name: 'reason', label: 'Uwagi do zamknięcia', wide: true }], submitLabel: 'Zamknij miesiąc', submit: (v, idem) => post(`/months/${ym}/close`, v, idem) });
  });
  on('reopen', () => confirmReason('Ponowne otwarcie miesiąca', 'Status „do przekazania kadrom” zostanie zdjęty do czasu ponownego zamknięcia. Wersje raportu pozostają w historii.', r => post(`/months/${ym}/reopen`, { reason: r }), 'Otwórz ponownie'));
  on('printM', () => window.print());
  if ($('#versions')) {
    const versions = await api(`/months/${ym}/reports`);
    $('#versions').innerHTML = versions.length ? `<h3 style="margin-top:var(--sp-3)">Wersje zestawienia</h3>${table([
      { key: 'version', label: 'Wersja', num: true }, { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Utworzono' }, { key: 'reason', label: 'Powód' },
      { key: r => r, label: 'Nierozliczone łącznie', fmt: r => hm(r.report.employees.reduce((s, e) => s + e.remaining_min, 0)) },
      { key: r => r, label: '', fmt: r => `<a href="/api/months/${ym}/report.csv?version=${r.version}">CSV</a>` },
    ], versions)}` : '<p class="small muted">Brak zamknięć tego miesiąca.</p>';
  }
};

function exitForm(ym) {
  openForm({
    title: 'Wyjście prywatne', intro: '<p class="small muted">Minuty liczone są z części wspólnej z grafikiem. Zmiana nocna: wyjście należy do dnia i miesiąca rozpoczęcia zmiany.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'start_date', label: 'Data wyjścia', type: 'date', value: S.me.today.startsWith(ym) ? S.me.today : `${ym}-01`, required: true },
      { name: 'start_time', label: 'Od', type: 'time', required: true }, { name: 'end_date', label: 'Data powrotu (jeśli inna)', type: 'date' }, { name: 'end_time', label: 'Do', type: 'time', required: true },
      { name: 'status', label: 'Status', type: 'select', options: [['zarejestrowane', 'zarejestrowane (odbyte)'], ['planowane', 'planowane']], value: 'zarejestrowane', placeholder: false },
      { name: 'written_request', label: 'Jest pisemny wniosek pracownika', type: 'checkbox', wide: true },
      { name: 'document_ref', label: 'Referencja do dokumentu (poufne)', wide: true }, { name: 'confidential_note', label: 'Notatka poufna (bez danych medycznych)', type: 'textarea', wide: true },
    ], submit: (v, idem) => post('/exits', v, idem),
  });
}

function makeupForm(ym, exits) {
  const open = exits.filter(x => x.status === 'zarejestrowane' && x.remaining_min - (x.pending_min || 0) > 0);
  const allocFields = open.map(x => ({ name: `alloc_${x.id}`, label: `Wyjście #${x.id} ${plDate(x.work_date)} ${x.start_local.time}–${x.end_local.time} (do przypisania ${hmText(x.remaining_min - (x.pending_min || 0))})`, type: 'hm', wide: true, show: v => Number(v.employee_id) === x.employee_id }));
  openForm({
    title: 'Odrabianie wyjścia', intro: '<p class="small muted">Odrabianie odbywa się poza grafikiem, w tym samym miesiącu, i nie może naruszać odpoczynku dobowego. Przypisz minuty do konkretnych wyjść — ta sama minuta nie może być rozliczona dwukrotnie.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'start_date', label: 'Data', type: 'date', value: S.me.today.startsWith(ym) ? S.me.today : `${ym}-01`, required: true },
      { name: 'start_time', label: 'Od', type: 'time', required: true }, { name: 'end_date', label: 'Data końca (jeśli inna)', type: 'date' }, { name: 'end_time', label: 'Do', type: 'time', required: true },
      { name: 'info', type: 'info', html: open.length ? '<h3>Przypisanie do wyjść</h3>' : '<p class="notice">Brak wyjść do odrobienia w tym miesiącu.</p>' },
      ...allocFields,
      { name: 'day_off_override_reason', label: 'Uzasadnienie pracy w dniu wolnym (tylko gdy dotyczy)', wide: true },
      { name: 'approve', label: 'Zatwierdź od razu (administrator)', type: 'checkbox', wide: true }, { name: 'note', label: 'Uwagi', wide: true },
    ], submit: (v, idem) => {
      const allocations = open.filter(x => x.employee_id === Number(v.employee_id) && v[`alloc_${x.id}`]).map(x => ({ exit_id: x.id, minutes: v[`alloc_${x.id}`] }));
      return post('/makeups', { employee_id: v.employee_id, start_date: v.start_date, start_time: v.start_time, end_date: v.end_date, end_time: v.end_time, allocations, day_off_override_reason: v.day_off_override_reason, approve: v.approve, note: v.note }, idem);
    },
  });
}

// ---------- Urlopy i absencje ----------
const STATUS_TAG = { planowana: ['planowana', ''], wykorzystana: ['wykorzystana', 'ok'], anulowana: ['anulowana', ''] };
VIEWS.absencje = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const tab = q.get('t') || 'kalendarz';
  const year = Number(q.get('rok') || S.me.today.slice(0, 4));
  const tabs = [['kalendarz', 'Kalendarz urlopów'], ['lista', 'Nieobecności'], ['urlop', 'Urlop wypoczynkowy'], ['jednostki', 'Siła wyższa i art. 188'], ['katalog', 'Katalog kategorii']];
  let body = '';
  let leaveCal = null;
  if (tab === 'kalendarz') {
    leaveCal = await leaveCalendar(q);
    body = leaveCal.html;
  } else if (tab === 'lista') {
    const from = q.get('from') || `${year}-01-01`, to = q.get('to') || `${year}-12-31`;
    const list = await api(`/absences?from=${from}&to=${to}${q.get('osoba') ? `&employee_id=${q.get('osoba')}` : ''}${q.get('kat') ? `&category_id=${q.get('kat')}` : ''}`);
    body = `<form class="panel toolbar" id="absF"><label class="field">Od<input type="date" name="from" value="${from}"></label><label class="field">Do<input type="date" name="to" value="${to}"></label>
      <label class="field">Osoba<select name="osoba"><option value="">wszyscy</option>${empOptions(false).map(([v, l]) => `<option value="${v}" ${String(v) === q.get('osoba') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field">Kategoria<select name="kat"><option value="">wszystkie</option>${S.boot.categories.filter(c => c.name).map(c => `<option value="${c.id}" ${String(c.id) === q.get('kat') ? 'selected' : ''}>${esc(c.subtype ? `${c.name} — ${c.subtype}` : c.name)}</option>`).join('')}</select></label>
      <button class="primary">Filtruj</button></form>
      <section class="panel">${table([
      { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) }, { key: r => r, label: 'Kategoria', fmt: r => `${icon(ICON_PATHS[r.icon] ? r.icon : 'absence')} ${esc(r.category_label)}` },
      { key: r => `${plDate(r.start_date)}${r.end_date !== r.start_date ? ` – ${plDate(r.end_date)}` : ''}${r.start_local ? ` ${r.start_local.time}–${r.end_local.time}` : ''}`, label: 'Okres' },
      { key: 'unit', label: 'Jednostka' }, { key: 'days', label: 'Dni wg grafiku', num: true }, { key: 'minutes', label: 'Czas wg grafiku', fmt: 'hm' }, { key: 'pool_year', label: 'Pula' },
      { key: 'status', label: 'Status', fmt: v => tag(...STATUS_TAG[v]) },
      ...(can('view.confidential') ? [{ key: r => r, label: 'Dokument / notatka', fmt: r => `${esc(r.document_ref || '')}${r.confidential_note ? `<br>${icon('lock')} ${esc(r.confidential_note)}` : ''}${r.cancel_reason ? `<br><span class="muted">anulowano: ${esc(r.cancel_reason)}</span>` : ''}` }] : []),
      ...(isAdmin() ? [{ key: r => r, label: '', fmt: r => r.status === 'planowana' ? `<button data-use="${r.id}">Wykorzystana</button> <button class="link" data-cancel="${r.id}">Anuluj</button>` : r.status === 'wykorzystana' ? `<button class="link" data-cancel="${r.id}">Anuluj (z powodem)</button>` : '' }] : []),
    ], list, { rowClass: r => r.status === 'anulowana' ? 'row-cancel' : '' })}</section>`;
  } else if (tab === 'urlop') {
    const ov = await api('/leave/overview');
    body = `<div class="notice info small">Wykorzystanie rozliczane w godzinach według grafiku. Dni pokazane są informacyjnie z jawnym przelicznikiem. Po 30 września saldo zaległego urlopu NIE jest zerowane — aplikacja pokazuje tylko ostrzeżenie.</div>` +
      ov.map(e => `<section class="panel"><h3>${person(e.employee_id)}</h3>${table([
        { key: 'acquisition_year', label: 'Rok nabycia', num: true }, { key: 'granted_min', label: 'Uprawnienie + korekty', fmt: 'hm' }, { key: 'used_min', label: 'Wykorzystano', fmt: 'hm' },
        { key: 'planned_min', label: 'Zaplanowano', fmt: 'hm' }, { key: 'balance_min', label: 'Saldo', num: true, fmt: v => `<b>${hm(v)}</b>` },
        { key: r => r, label: 'W dniach', fmt: r => r.day_conversion_min ? `${(r.balance_min / r.day_conversion_min).toFixed(2).replace('.', ',')} dnia <span class="muted">(1 dzień = ${hmText(r.day_conversion_min)})</span>` : 'brak przelicznika' },
        { key: r => r, label: 'Termin', fmt: r => r.overdue ? tag(r.overdue.level === 'ostrzezenie' ? `po terminie ${plDate(r.overdue.deadline)}` : `do ${plDate(r.overdue.deadline)}`, r.overdue.level === 'ostrzezenie' ? 'warn' : 'accent', 'alert') : '' },
        ...(isAdmin() ? [{ key: r => r, label: '', fmt: r => `<button data-adjust="${r.id}" data-bal="${r.balance_min}">Korekta</button> <button class="link" data-ledger="${r.id}">Historia</button>` }] : []),
      ], e.pools, { empty: 'Brak pul — wprowadź wymiar z danych kadr.' })}<div id="ledger-${e.employee_id}"></div></section>`).join('');
  } else if (tab === 'jednostki') {
    const list = await api(`/unit-choices?year=${year}`);
    body = `<div class="notice info small">Dla pełnego etatu i standardowej normy: 2 dni albo 16 godzin w roku — jedna pula. Jednostka ustala się przy pierwszym faktycznym wykorzystaniu (zgodnie z wnioskiem pracownika); wpisy planowane i anulowane jej nie blokują. Nowy rok = nowy wybór i nowy limit, bez przenoszenia.</div>
      <div class="toolbar no-print"><a class="btn" href="#/absencje?t=jednostki&rok=${year - 1}">‹ ${year - 1}</a><span class="btn">${year}</span><a class="btn" href="#/absencje?t=jednostki&rok=${year + 1}">${year + 1} ›</a></div>
      <section class="panel">${table([
      { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) }, { key: 'kind', label: 'Rodzaj', fmt: v => v === 'sila_wyzsza' ? 'Siła wyższa (art. 148¹)' : 'Opieka nad dzieckiem (art. 188)' },
      { key: 'unit_label', label: 'Wybrana jednostka', fmt: v => tag(v, v === 'nieustalony' ? '' : 'accent') },
      { key: r => r, label: 'Limit', fmt: r => r.unit === 'dni' ? `${r.limit_days} dni` : r.unit === 'godziny' ? hm(r.limit_min) : `${r.limit_days} dni albo ${hmText(r.limit_min)}` },
      { key: r => r, label: 'Wykorzystano', fmt: r => r.unit === 'dni' ? `${r.used_days} dni` : r.unit === 'godziny' ? hm(r.used_min) : '—' },
      { key: r => r, label: 'Zaplanowano', fmt: r => `${r.planned_days ? r.planned_days + ' dni ' : ''}${r.planned_min ? hm(r.planned_min) : ''}` || '—' },
      { key: r => r, label: 'Limit potwierdzony', fmt: r => r.limit_confirmed ? tag('tak', 'ok') : tag('wymaga potwierdzenia kadr', 'warn') },
      ...(isAdmin() ? [{ key: r => r, label: '', fmt: r => `<button class="link" data-unitfix='${esc(JSON.stringify({ employee_id: r.employee_id, year: r.year, kind: r.kind }))}'>Korekta jednostki</button> <button class="link" data-limit='${esc(JSON.stringify({ employee_id: r.employee_id, year: r.year, kind: r.kind, limit_min: r.limit_min, limit_days: r.limit_days }))}'>Limit</button>` }] : []),
    ], list)}</section>`;
  } else {
    body = `<p class="small muted">Katalog jest rozszerzalny bez zmiany kodu. Reguły ustawowe nie zostały porównane z tekstem jednolitym przepisów w tej wersji — są oznaczone „do potwierdzenia przez kadry”.</p>
      <section class="panel">${table([
      { key: r => r, label: 'Kategoria', fmt: r => `${icon(ICON_PATHS[r.icon] ? r.icon : 'absence')} <b>${esc(r.short)}</b> ${esc(r.name)}${r.subtype ? ` — ${esc(r.subtype)}` : ''}` },
      { key: 'unit', label: 'Jednostka' }, { key: 'limit_rule', label: 'Zasada limitu' }, { key: 'carryover_rule', label: 'Przenoszenie' },
      { key: r => r, label: 'Widoczność', fmt: r => `${esc(r.visibility)}<br><span class="muted">pracownik widzi: ${esc(r.public_label)}</span>` },
      { key: 'legal_basis', label: 'Podstawa prawna' }, { key: r => r, label: 'Weryfikacja', fmt: r => r.verification_status === 'zweryfikowano' ? tag(`zweryfikowano ${plDate(r.verified_at)}`, 'ok') : tag('do potwierdzenia przez kadry', 'warn') },
      ...(isAdmin() ? [{ key: r => r, label: '', fmt: r => `<button class="link" data-cat="${r.id}">Edytuj</button>` }] : []),
    ], S.boot.categories)}</section>`;
  }
  const tools = isAdmin() ? (tab === 'lista' || tab === 'kalendarz' ? btn('addAbs', 'Dodaj nieobecność') : tab === 'urlop' ? btn('addPool', 'Pula urlopu (z kadr)') : tab === 'katalog' ? btn('addCat', 'Nowa kategoria') : '') : '';
  main.innerHTML = head('Urlopy i absencje', 'Planowane, wykorzystane i anulowane nieobecności. Bez obliczeń wynagrodzeń i zasiłków.', tools) +
    `<div class="tabs" role="tablist">${tabs.map(([id, l]) => `<button role="tab" class="${tab === id ? 'active' : ''}" data-tab="${id}">${esc(l)}</button>`).join('')}</div>${body}`;
  $$('[data-tab]').forEach(b => b.onclick = () => { location.hash = `#/absencje?t=${b.dataset.tab}`; });
  if ($('#absF')) $('#absF').onsubmit = (e) => { e.preventDefault(); location.hash = `#/absencje?t=lista&${new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v))}`; };
  on('addAbs', () => absenceForm());
  if (leaveCal) leaveCal.bind(main);
  on('addPool', () => poolForm());
  on('addCat', () => categoryForm());
  $$('[data-use]').forEach(b => b.onclick = async () => { try { await post(`/absences/${b.dataset.use}`, { status: 'wykorzystana' }, undefined, 'PATCH'); } catch (e) { toast(describeError(e), 'err'); } });
  $$('[data-cancel]').forEach(b => b.onclick = () => confirmReason('Anuluj nieobecność', 'Wpis pozostanie w historii jako anulowany.', r => post(`/absences/${b.dataset.cancel}`, { status: 'anulowana', reason: r }, undefined, 'PATCH')));
  $$('[data-adjust]').forEach(b => b.onclick = () => adjustForm(Number(b.dataset.adjust), Number(b.dataset.bal)));
  $$('[data-ledger]').forEach(b => b.onclick = async () => {
    const owner = await findPoolOwner(Number(b.dataset.ledger));
    const pools = await api(`/leave/pools?employee_id=${owner}`);
    const p = pools.find(x => x.id === Number(b.dataset.ledger));
    const box = b.closest('section').querySelector('[id^="ledger-"]');
    box.innerHTML = `<h3 style="margin-top:var(--sp-3)">Historia puli ${p.acquisition_year}</h3>` + table([
      { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Data' }, { key: 'kind', label: 'Rodzaj', fmt: v => esc(v.replace(/_/g, ' ')) },
      { key: 'minutes', label: 'Zmiana', fmt: 'hm' }, { key: 'balance_before_min', label: 'Saldo przed', fmt: 'hm' }, { key: 'balance_after_min', label: 'Saldo po', fmt: 'hm' },
      { key: 'reason', label: 'Powód' }, { key: 'hr_document_ref', label: 'Dokument kadr' },
    ], p.ledger);
  });
  $$('[data-unitfix]').forEach(b => b.onclick = () => { const d = JSON.parse(b.dataset.unitfix); openForm({ title: 'Korekta wyboru jednostki (pomyłka)', intro: '<p class="small muted">Zmiana jest odrzucana, jeśli istnieją wpisy w innej jednostce — najpierw je skoryguj.</p>', fields: [{ name: 'unit', label: 'Jednostka', type: 'select', options: [['dni', 'dni'], ['godziny', 'godziny']], placeholder: 'nieustalony' }, { name: 'reason', label: 'Powód', type: 'textarea', required: true, wide: true }], submit: (v, idem) => post('/unit-choices/correct', { ...d, ...v }, idem) }); });
  $$('[data-limit]').forEach(b => b.onclick = () => { const d = JSON.parse(b.dataset.limit); openForm({ title: 'Limit potwierdzony przez kadry', fields: [{ name: 'limit_days', label: 'Limit dni', type: 'number', value: d.limit_days, required: true }, { name: 'limit_min', label: 'Limit godzin', type: 'hm', value: d.limit_min, required: true }, { name: 'reason', label: 'Podstawa / potwierdzenie kadr', type: 'textarea', required: true, wide: true }], submit: (v, idem) => post('/unit-choices/limit', { ...d, ...v }, idem) }); });
  $$('[data-cat]').forEach(b => b.onclick = () => categoryForm(S.cat.get(Number(b.dataset.cat))));
};

// ---------- Kalendarz urlopów: kafelki dni z nieobecnościami, pod spodem karty programistów z wykorzystaniem ----------
// Kolor kategorii według rodzaju (ikony) — ten sam w kalendarzu i na kartach
const ABS_TONE = { leave: 'uw', medical: 'l4', care: 'care', force: 'force', family: 'family', event: 'event', unpaid: 'unpaid', training: 'train', blood: 'event', summons: 'other', military: 'other', exit: 'other', other: 'other', absence: 'other' };
const absTone = (icon, code) => (code === 'URLOP_NA_ZADANIE' ? 'uz' : ABS_TONE[icon] || 'other');
const daysTxt = (d) => `${Number(d.toFixed ? d.toFixed(1) : d).toString().replace('.', ',')} ${Math.abs(d) === 1 ? 'dzień' : 'dni'}`;
const minAsDays = (min, dayMin) => (dayMin ? daysTxt(Math.round((min / dayMin) * 10) / 10) : hShort(min));

async function leaveCalendar(q) {
  const mq = q.get('m') || '';
  const ym = /^(20\d{2})-(0[1-9]|1[0-2])$/.test(mq) ? mq : S.me.today.slice(0, 7);
  const empF = /^\d+$/.test(q.get('osoba') || '') ? q.get('osoba') : '';
  const first = `${ym}-01`, last = lastDay(ym);
  const from = addDays(first, 1 - weekday(first)), to = addDays(last, 7 - weekday(last));
  const list = await api(`/absences?from=${from}&to=${to}${empF ? `&employee_id=${empF}` : ''}`);
  const abs = list.filter(a => a.status !== 'anulowana');
  const holidays = new Map(S.boot.holidays.map(h => [h.date, h.name]));
  const link = (o) => `#/absencje?${new URLSearchParams({ t: 'kalendarz', m: ym, ...(empF ? { osoba: empF } : {}), ...o })}`;
  let workdays = 0;
  let cells = DOW.map(d => `<div class="lc-dow">${d}</div>`).join('');
  const used = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const inMonth = d.slice(0, 7) === ym;
    const off = holidays.has(d) || weekday(d) >= 6;
    if (inMonth && !off) workdays++;
    // w weekend / święto pokazujemy tylko wpisy z tego dnia (np. praca w sobotę zamieniona na urlop), nie środek wielodniowego L4
    const day = abs.filter(a => a.start_date <= d && a.end_date >= d && (!off || (a.start_date === d && a.end_date === d)));
    const items = day.map(a => {
      const e = S.emp.get(a.employee_id);
      const tone = absTone(a.icon, a.code);
      used.set(a.category_label, tone);
      const who = e ? `${e.first_name} ${e.last_name}` : '';
      return `<span class="lc-item tone-${tone} ${a.status === 'planowana' ? 'plan' : ''}" title="${esc(`${who}: ${a.category_label}${a.status === 'planowana' ? ' (planowana)' : ''}`)}"><b>${esc(a.category_short || '•')}</b><i style="background:${esc(e?.color || '#888')}">${esc(initials(e))}</i></span>`;
    }).join('');
    cells += `<div class="lc-day ${inMonth ? '' : 'other'} ${off ? 'off' : ''} ${d === S.me.today ? 'today' : ''} ${day.length ? 'has' : ''}" ${isAdmin() && inMonth && !off ? `data-day="${d}" role="button" tabindex="0" title="Dodaj nieobecność ${plDate(d)}"` : ''}>
      <span class="lc-num">${Number(d.slice(8))}</span>${holidays.has(d) ? `<em>${esc(holidays.get(d))}</em>` : ''}<div class="lc-items">${items}</div></div>`;
  }
  const legend = [...used].map(([label, tone]) => `<span class="lc-leg tone-${tone}"><b></b>${esc(label)}</span>`).join('');
  const html = `<section class="panel lc-panel">
      <div class="lc-head"><a class="btn" href="${link({ m: addMonths(ym, -1) })}" aria-label="Poprzedni miesiąc">‹</a><h2>${esc(plMonth(ym))}</h2><a class="btn" href="${link({ m: addMonths(ym, 1) })}" aria-label="Następny miesiąc">›</a>
        <a class="btn" href="${link({ m: S.me.today.slice(0, 7) })}">Dziś</a>
        <label class="field">Osoba<select id="lcEmp"><option value="">wszyscy</option>${empOptions(false).map(([v, l]) => `<option value="${v}" ${String(v) === empF ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
      <div class="lcal">${cells}</div>
      <p class="small"><b>${workdays}</b> dni roboczych w miesiącu (bez weekendów i świąt). ${legend ? `<span class="lc-legend">${legend}</span>` : '<span class="muted">Brak nieobecności w tym miesiącu.</span>'}</p>
      <p class="small muted">Kafelek: skrót nieobecności i inicjały osoby. Obramowanie przerywane — planowana. ${isAdmin() ? 'Kliknij dzień, aby dodać nieobecność.' : ''}</p>
    </section>
    <p class="small"><a href="#/pracownicy?rok=${ym.slice(0, 4)}">Ile kto wykorzystał i ile zostało — w zakładce Pracownicy ›</a></p>`;
  const bind = (main) => {
    const sel = $('#lcEmp', main); if (sel) sel.onchange = (ev) => { location.hash = link({ osoba: ev.target.value }); };
    $$('[data-day]', main).forEach(t => { const go = () => absenceForm(t.dataset.day); t.addEventListener('click', go); t.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); }); });
  };
  return { html, bind };
}

function leaveRows(e, year) {
  const L = e.leave, dm = e.day_min;
  const pool = L.start_balance_min + (L.entitlement_min || 0);
  const pct = pool > 0 ? Math.min(100, Math.round((L.used_min / pool) * 100)) : 0;
  const row = (tone, code, title, sub, right, rightSub, bar) => `<div class="lc-row tone-${tone}"><span class="lc-badge">${esc(code)}</span>
      <div class="lc-body"><b>${esc(title)}</b><span>${sub}</span>${bar !== undefined ? `<div class="lc-bar"><i style="width:${bar}%"></i></div>` : ''}</div>
      <div class="lc-right"><b>${right}</b><span>${rightSub}</span></div></div>`;
  const dh = (days, min) => [days ? daysTxt(days) : '', min ? hShort(min) : ''].filter(Boolean).join(' + ') || '0 dni';
  const unitRow = (u, code, title) => {
    const used = u.unit === 'godziny' ? hShort(u.used_min) : u.unit === 'dni' ? daysTxt(u.used_days) : dh(u.used_days, u.used_min);
    const lim = u.unit === 'godziny' ? hShort(u.limit_min) : u.unit === 'dni' ? daysTxt(u.limit_days) : `${daysTxt(u.limit_days)} lub ${hShort(u.limit_min)}`;
    const plan = u.planned_days || u.planned_min ? ` · zaplanowano ${dh(u.planned_days, u.planned_min)}` : '';
    return row(code === 'SW' ? 'force' : 'care', code, title, `wykorzystano ${used}${plan}`, `limit ${lim}`, u.limit_confirmed ? `jednostka: ${esc(u.unit_label)}` : 'limit do potwierdzenia', undefined);
  };
  const uwLeftDays = dm ? Math.floor(L.remaining_min / dm) : Infinity;
  const uzLeft = Math.max(0, Math.min(e.on_demand.limit_days - e.on_demand.used_days, uwLeftDays));
  return `${L.has_pool ? row('uw', 'UW', 'Urlop wypoczynkowy', `wykorzystano ${minAsDays(L.used_min, dm)}${L.planned_min ? ` · zaplanowano ${minAsDays(L.planned_min, dm)}` : ''}`,
      `zostało ${minAsDays(L.remaining_min, dm)}`, `${L.entitlement_min !== null ? `z ${minAsDays(L.entitlement_min, dm)} na ${year}` : `brak wymiaru na ${year}`}${L.start_balance_min ? ` + zaległy ${minAsDays(L.start_balance_min, dm)}` : ''}`, pct)
      : `<p class="small muted">Brak puli urlopu — wprowadź wymiar z kadr (zakładka „Urlop wypoczynkowy”).</p>`}
    ${row('uz', 'UŻ', 'Urlop na żądanie', `wykorzystano ${daysTxt(e.on_demand.used_days)}${e.on_demand.planned_days ? ` · zaplanowano ${daysTxt(e.on_demand.planned_days)}` : ''}`, `zostało ${daysTxt(uzLeft)}`, `z ${e.on_demand.limit_days} (w ramach UW)`, undefined)}
    ${unitRow(e.force, 'SW', 'Siła wyższa (art. 148¹)')}
    ${unitRow(e.care188, '188', 'Opieka nad dzieckiem (art. 188)')}
    ${e.other.map(o => row(absTone(o.icon, ''), o.short || '•', o.name, `${o.used_days || o.used_min ? `wykorzystano ${dh(o.used_days, o.used_min)}` : 'tylko zaplanowane'}${o.planned_days || o.planned_min ? ` · zaplanowano ${dh(o.planned_days, o.planned_min)}` : ''}`, `${o.count} ${o.count === 1 ? 'wpis' : o.count < 5 ? 'wpisy' : 'wpisów'}`, `w ${year}`, undefined)).join('')}
    <p class="small muted lc-note">Zostało = zaległy na początek roku + wymiar − wykorzystano (zaplanowane nie są odejmowane); dni wg przelicznika dnia urlopu. Limity — do potwierdzenia przez kadry.</p>`;
}

// Kalendarz wyjść i odrabiania: w kafelku dnia — kto, na której zmianie, godziny wyjścia (WP) i odrabiania (OD)
function exitCalendar(ym, from, to, exits, makeups, sched) {
  const tpl = new Map(S.boot.shift_templates.map(t => [t.id, t.short]));
  const holidays = new Map(S.boot.holidays.map(h => [h.date, h.name]));
  const shiftOf = (emp, d) => { const s = sched.find(x => x.employee_id === emp && x.work_date === d); return s ? (tpl.get(s.shift_template_id) || `${s.start_local.time}–${s.end_local.time}`) : null; };
  const item = (kind, r) => {
    const e = S.emp.get(r.employee_id);
    const sh = shiftOf(r.employee_id, r.work_date);
    const shTxt = sh ? `zm. ${sh}` : 'poza grafikiem';
    const time = `${r.start_local.time}–${r.end_local.time}`;
    const cls = kind === 'WP' ? `tone-force ${r.state === 'rozliczone' ? 'done' : ''}` : `tone-uw ${r.status === 'oczekuje' ? 'plan' : ''}`;
    const st = kind === 'WP' ? (EXIT_STATE[r.state] || [r.state])[0] : r.status;
    const who = e ? `${e.first_name} ${e.last_name}` : '';
    return `<span class="lc-item xc-item ${cls}" title="${esc(`${kind === 'WP' ? 'Wyjście prywatne' : 'Odrabianie'} — ${who}, ${shTxt}, ${time} (${hShort(r.minutes)}), ${st}`)}">
      <span class="xc-top"><b>${kind}</b><i style="background:${esc(e?.color || '#888')}">${esc(initials(e))}</i></span><span class="xc-sub">${esc(sh || '—')} · ${time}</span></span>`;
  };
  const ex = exits.filter(x => x.status !== 'anulowane' && x.state !== 'anulowane'), mk = makeups.filter(m => m.status !== 'odrzucone');
  let cells = DOW.map(d => `<div class="lc-dow">${d}</div>`).join('');
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const inMonth = d.slice(0, 7) === ym;
    const off = holidays.has(d) || weekday(d) >= 6;
    const items = [...ex.filter(x => x.work_date === d).map(x => item('WP', x)), ...mk.filter(m => m.work_date === d).map(m => item('OD', m))].join('');
    cells += `<div class="lc-day ${inMonth ? '' : 'other'} ${off ? 'off' : ''} ${d === S.me.today ? 'today' : ''} ${items ? 'has' : ''}"><span class="lc-num">${Number(d.slice(8))}</span>${holidays.has(d) ? `<em>${esc(holidays.get(d))}</em>` : ''}<div class="lc-items">${items}</div></div>`;
  }
  return `<section class="panel"><h3>Kalendarz ${esc(plMonth(ym))}</h3><div class="lcal xcal">${cells}</div>
    <p class="small"><span class="lc-legend" style="margin-left:0"><span class="lc-leg tone-force"><b></b>WP — wyjście prywatne (dzień i zmiana, z której wyszedł)</span><span class="lc-leg tone-uw"><b></b>OD — odrabianie</span></span></p>
    <p class="small muted">W kafelku: inicjały, zmiana (I / II / III lub godziny) i czas. Przerywane obramowanie — odrabianie oczekuje na zatwierdzenie; wyblakłe — wyjście już odrobione. Wyjście z nocnej zmiany widnieje w dniu jej rozpoczęcia.</p></section>`;
}

async function findPoolOwner(poolId) {
  const ov = await api('/leave/overview');
  return ov.find(e => e.pools.some(p => p.id === poolId)).employee_id;
}

function absenceForm(date) {
  const cats = S.boot.categories.filter(c => c.active && c.code !== 'WYJSCIE_PRYWATNE' && c.code !== 'OKOLICZNOSCIOWY');
  const catOf = (v) => S.cat.get(Number(v.category_id));
  openForm({
    title: 'Dodaj nieobecność', intro: '<p class="small muted">Czas liczony jest według grafiku pracownika. Nie wpisuj diagnoz ani szczegółów medycznych.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'category_id', label: 'Kategoria', type: 'select', options: cats.map(c => [c.id, c.subtype ? `${c.name} — ${c.subtype}` : c.name]), required: true },
      { name: 'status', label: 'Status', type: 'select', options: [['planowana', 'planowana'], ['wykorzystana', 'wykorzystana']], value: 'planowana', placeholder: false },
      { name: 'unit', label: 'Jednostka (zgodnie z wnioskiem pracownika)', type: 'select', options: [['dni', 'dni'], ['godziny', 'godziny']], show: v => catOf(v)?.unit === 'dni_lub_godziny' },
      { name: 'start_date', label: 'Od dnia', type: 'date', value: date || S.me.today, required: true }, { name: 'end_date', label: 'Do dnia', type: 'date' },
      { name: 'start_time', label: 'Od godz.', type: 'time', show: v => { const c = catOf(v); return c && (c.unit === 'godziny' || (c.unit === 'dni_lub_godziny' && v.unit === 'godziny')); } },
      { name: 'end_time', label: 'Do godz.', type: 'time', show: v => { const c = catOf(v); return c && (c.unit === 'godziny' || (c.unit === 'dni_lub_godziny' && v.unit === 'godziny')); } },
      { name: 'pool_id', label: 'Pula urlopu (domyślnie najstarsza z saldem)', type: 'select', options: [], show: v => catOf(v)?.pool_kind === 'wypoczynkowy', placeholder: 'automatycznie — najstarsza' },
      { name: 'employee_request', label: 'Jest wniosek pracownika', type: 'checkbox', wide: true },
      { name: 'document_ref', label: 'Dokument (poufne)', wide: true }, { name: 'confidential_note', label: 'Notatka poufna', type: 'textarea', wide: true },
    ],
    onChange: async (v, form) => {
      const c = catOf(v);
      const sel = form.elements.pool_id;
      if (c && c.pool_kind === 'wypoczynkowy' && v.employee_id && sel.dataset.emp !== String(v.employee_id)) {
        sel.dataset.emp = String(v.employee_id);
        const pools = await api(`/leave/pools?employee_id=${v.employee_id}`);
        sel.innerHTML = '<option value="">automatycznie — najstarsza</option>' + pools.map(p => `<option value="${p.id}">${p.acquisition_year} — dostępne ${hmText(p.available_min)}</option>`).join('');
      }
    },
    submit: (v, idem) => post('/absences', { ...v, end_date: v.end_date || v.start_date }, idem),
  });
}

function poolForm() {
  openForm({
    title: 'Pula urlopu wypoczynkowego', intro: '<p class="small muted">Wymiar i saldo początkowe wprowadzasz na podstawie danych kadr. Jedna pula na rok nabycia.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), required: true },
      { name: 'acquisition_year', label: 'Rok nabycia', type: 'number', value: Number(S.me.today.slice(0, 4)), required: true },
      { name: 'entitlement_min', label: 'Wymiar / saldo', type: 'hm', required: true },
      { name: 'opening', label: 'To saldo początkowe (przeniesione z kadr), a nie nowe uprawnienie', type: 'checkbox', wide: true },
      { name: 'reason', label: 'Podstawa (dane kadr)', required: true, wide: true }, { name: 'hr_document_ref', label: 'Dokument kadr', wide: true },
    ], submit: (v, idem) => post('/leave/pools', v, idem),
  });
}

function adjustForm(poolId, balance) {
  openForm({
    title: 'Ręczna korekta puli urlopu', fields: [
      { name: 'kind', label: 'Rodzaj', type: 'select', options: [['korekta_ewidencji', 'korekta ewidencji'], ['zmiana_uprawnienia', 'zmiana uprawnienia']], value: 'korekta_ewidencji', placeholder: false },
      { name: 'minutes', label: 'Zmiana', type: 'hm', signed: true, required: true },
      { name: 'preview', type: 'info', html: `<p class="notice info" id="adjPrev">Saldo przed: <b>${hmText(balance)}</b> → po: <b>${hmText(balance)}</b></p>` },
      { name: 'reason', label: 'Powód (obowiązkowy)', type: 'textarea', required: true, wide: true }, { name: 'hr_document_ref', label: 'Decyzja / dokument kadr (opcjonalnie)', wide: true },
    ],
    onChange: (v) => { const p = $('#adjPrev'); if (p) p.innerHTML = `Saldo przed: <b>${hmText(balance)}</b> → po: <b>${hmText(balance + (v.minutes || 0))}</b>`; },
    submit: async (v, idem) => { const r = await post(`/leave/pools/${poolId}/adjust`, v, idem); toast(`Saldo: ${hmText(r.balance_before_min)} → ${hmText(r.balance_after_min)}`); return r; },
  });
}

function categoryForm(c = {}) {
  const lv = c.limit_value ? JSON.parse(c.limit_value) : {};
  openForm({
    title: c.id ? 'Edytuj kategorię' : 'Nowa kategoria nieobecności', fields: [
      { name: 'code', label: 'Kod', value: c.code, required: true }, { name: 'name', label: 'Nazwa', value: c.name, required: true },
      { name: 'subtype', label: 'Podtyp', value: c.subtype }, { name: 'parent_code', label: 'Kod kategorii nadrzędnej', value: c.parent_code },
      { name: 'short', label: 'Skrót', value: c.short, required: true },
      { name: 'icon', label: 'Ikona', type: 'select', value: c.icon || 'absence', placeholder: false, options: ['leave', 'medical', 'care', 'force', 'family', 'event', 'unpaid', 'blood', 'training', 'summons', 'military', 'exit', 'absence', 'other'].map(i => [i, i]) },
      { name: 'unit', label: 'Jednostka', type: 'select', value: c.unit || 'dni', placeholder: false, options: [['dni', 'dni'], ['godziny', 'godziny'], ['dni_lub_godziny', 'dni lub godziny'], ['minuty', 'minuty']] },
      { name: 'pool_kind', label: 'Pula', type: 'select', value: c.pool_kind, placeholder: 'brak', options: [['wypoczynkowy', 'urlop wypoczynkowy'], ['sila_wyzsza', 'siła wyższa'], ['opieka_188', 'art. 188']] },
      { name: 'limit_rule', label: 'Zasada limitu (opis)', type: 'textarea', value: c.limit_rule, wide: true },
      { name: 'max_days_per_year', label: 'Limit dni w roku (ostrzeżenie)', type: 'number', value: lv.max_days_per_year },
      { name: 'rule_valid_from', label: 'Reguła od', type: 'date', value: c.rule_valid_from }, { name: 'rule_valid_to', label: 'Reguła do', type: 'date', value: c.rule_valid_to },
      { name: 'carryover_rule', label: 'Przenoszenie', value: c.carryover_rule, wide: true }, { name: 'affects_schedule', label: 'Wpływ na grafik i rozliczenia', value: c.affects_schedule || 'zastepuje_grafik' },
      { name: 'requires_confirmation', label: 'Wymagane potwierdzenie', value: c.requires_confirmation },
      { name: 'visibility', label: 'Widoczność', type: 'select', value: c.visibility || 'podstawowa', placeholder: false, options: [['pelna', 'pełna'], ['podstawowa', 'podstawowa (pracownik widzi etykietę)'], ['poufna', 'poufna']] },
      { name: 'public_label', label: 'Etykieta dla pracowników', value: c.public_label || 'Nieobecność', required: true },
      { name: 'legal_basis', label: 'Podstawa prawna', value: c.legal_basis, wide: true }, { name: 'verified_at', label: 'Data weryfikacji', type: 'date', value: c.verified_at },
      { name: 'verification_status', label: 'Status weryfikacji', type: 'select', value: c.verification_status || 'do_potwierdzenia_przez_kadry', placeholder: false, options: [['do_potwierdzenia_przez_kadry', 'do potwierdzenia przez kadry'], ['zweryfikowano', 'zweryfikowano'], ['regula_firmowa', 'reguła firmowa']] },
      { name: 'active', label: 'Aktywna', type: 'checkbox', value: c.id ? !!c.active : true }, { name: 'sort', label: 'Kolejność', type: 'number', value: c.sort ?? 500 },
    ], submit: (v, idem) => {
      v.limit_value = v.max_days_per_year ? { ...lv, max_days_per_year: Number(v.max_days_per_year) } : (Object.keys(lv).length ? lv : null);
      delete v.max_days_per_year;
      return c.id ? post(`/absence-categories/${c.id}`, v, idem, 'PUT').then(r => (loadBoot(), r)) : post('/absence-categories', v, idem).then(r => (loadBoot(), r));
    },
  });
}
