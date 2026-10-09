// Widoki: projekty i zadania, tablica maszyn, przekazanie zmiany.
'use strict';

const TASK_STATUS = { nowe: ['nowe', ''], w_toku: ['w toku', 'accent'], zablokowane: ['zablokowane', 'danger'], zakonczone: ['zakończone', 'ok'], anulowane: ['anulowane', ''] };
const CAUSE_LABEL = { brak_dokumentacji: 'brak dokumentacji', zmiana_zakresu: 'zmiana zakresu', narzedzia: 'narzędzia', maszyna: 'maszyna', decyzja_zewnetrzna: 'decyzja zewnętrzna', blad_programowania: 'błąd programowania', inne: 'inne' };

// Paski postępu: wspólny komponent projectMeter (public/brand.js)
function bars(p) { return projectMeter(p, { compact: true }); }
function projectRef(p) { return `<span class="mono">${esc(p.order_no)}</span> · ${esc(p.part_no)} <span class="muted">rev ${esc(p.part_rev)}</span>`; }

VIEWS.projekty = async (main, rest) => {
  if (rest[0]) return projectDetailView(main, decodeURIComponent(rest[0].split('?')[0]));
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const params = new URLSearchParams();
  for (const k of ['machine_id', 'status', 'employee_id']) if (q.get(k)) params.set(k, q.get(k));
  const list = await api(`/projects?${params}`);
  const sel = (name, label, opts) => `<label class="field">${label}<select name="${name}"><option value="">wszystkie</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === (q.get(name) || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  main.innerHTML = head('Projekty i zadania', 'Postęp wynika z zakończonych zadań o jawnych wagach, nie z upływu czasu.', isAdmin() ? btn('addPrj', 'Nowy projekt') : '') +
    `<form class="panel toolbar" id="pf">${sel('machine_id', 'Maszyna', machineOptions())}${sel('status', 'Status', [['aktywny', 'aktywny'], ['wstrzymany', 'wstrzymany'], ['zakonczony', 'zakończony'], ['anulowany', 'anulowany']])}${sel('employee_id', 'Osoba', empOptions(false))}<button class="primary">Filtruj</button></form>
    <div class="cols">${list.map(p => `<article class="panel">
      <div class="page-head" style="margin:0 0 var(--sp-2)"><div><h3 style="margin:0"><a href="#/projekty/${encodeURIComponent(p.id)}">${projectRef(p)}</a></h3><span class="small muted">${esc(p.id)} · ${esc(p.part_family || 'bez rodziny')}</span></div>
      </div>
      ${bars(p)}${delayLine(p.schedule)}
      <p class="small" style="margin:var(--sp-2) 0 0">Termin: <b>${plDate(p.due_date)}</b> · priorytet ${p.priority} · ${p.nc_program ? `<span class="mono">${esc(p.nc_program)} rev ${esc(p.nc_rev)}</span>` : 'brak programu NC'}
      ${p.blocked ? `<br>${tag(p.block_reason, 'danger', 'block')}` : ''}${p.tasks.some(t => t.status === 'zablokowane') ? `<br>${tag('zablokowane zadanie', 'warn', 'alert')}` : ''}</p>
      <p class="small" style="margin:var(--sp-2) 0 0">${p.responsible_ids.map(id => person(id, { name: false })).join(' ')} ${esc(p.status)}</p>
    </article>`).join('') || '<div class="empty">Brak projektów.</div>'}</div>`;
  $('#pf').onsubmit = (e) => { e.preventDefault(); location.hash = `#/projekty?${new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v))}`; };
  on('addPrj', () => projectForm());
};

function projectForm(p = {}) {
  openForm({
    title: p.id ? `Edytuj projekt ${p.id}` : 'Nowy projekt', intro: '<p class="small muted">Identyfikatory (zlecenie, detal, rewizja) są wspólne z CNC Process — używaj stałych oznaczeń.</p>', fields: [
      { name: 'order_no', label: 'Numer zlecenia', value: p.order_no, required: true }, { name: 'part_no', label: 'Detal', value: p.part_no, required: true },
      { name: 'part_rev', label: 'Rewizja detalu', value: p.part_rev, required: true }, { name: 'part_family', label: 'Rodzina detali (np. tacki NGK)', value: p.part_family },
      { name: 'machine_id', label: 'Maszyna', type: 'select', options: machineOptions(), value: p.machine_id },
      { name: 'start_date', label: 'Data rozpoczęcia', type: 'date', value: p.start_date || S.me.today, help: 'Plan na dziś = upływ czasu od rozpoczęcia do terminu; podstawa opóźnienia w %.' },
      { name: 'due_date', label: 'Termin', type: 'date', value: p.due_date },
      { name: 'priority', label: 'Priorytet (1 = najwyższy)', type: 'number', min: 1, max: 5, value: p.priority || 3 },
      { name: 'status', label: 'Status', type: 'select', placeholder: false, value: p.status || 'aktywny', options: [['aktywny', 'aktywny'], ['wstrzymany', 'wstrzymany'], ['zakonczony', 'zakończony'], ['anulowany', 'anulowany']] },
      { name: 'folder_link', label: 'Odnośnik do folderu (CAM/NC)', value: p.folder_link, wide: true },
      { name: 'responsible_ids', label: 'Odpowiedzialne osoby', type: 'multi', options: empOptions(), value: p.responsible_ids || [], wide: true },
      { name: 'blocked', label: 'Projekt zablokowany', type: 'checkbox', value: !!p.blocked }, { name: 'block_reason', label: 'Powód blokady', value: p.block_reason, wide: true },
      { name: 'description', label: 'Opis', type: 'textarea', value: p.description, wide: true },
      ...(p.id ? [{ name: 'reason', label: 'Powód zmiany', wide: true }] : []),
    ], submit: async (v, idem) => {
      v.responsible_ids = v.responsible_ids.map(Number);
      const r = p.id ? await post(`/projects/${encodeURIComponent(p.id)}`, v, idem, 'PUT') : await post('/projects', v, idem);
      if (!p.id) location.hash = `#/projekty/${encodeURIComponent(r.id)}`;
      return r;
    },
  });
}

async function projectDetailView(main, id) {
  const p = await api(`/projects/${encodeURIComponent(id)}`);
  const mgmt = can('view.efficiency');
  const typeMap = new Map(S.boot.task_types.map(t => [t.id, t]));
  const rets = p.returns || [];
  const openRet = rets.find(r => !r.closed_date) || null;
  const liveT = p.tasks.filter(t => t.status !== 'anulowane');
  const canReturn = !openRet && (p.status === 'zakonczony' || (liveT.length && liveT.every(t => t.status === 'zakonczone')));
  const retRound = new Map(rets.map(r => [r.id, r.round]));
  const td = p.tech_data;
  const techRows = td.length ? table([
    { key: 'operation_id', label: 'Operacja', fmt: v => `<span class="mono">${esc(v)}</span>` }, { key: r => `${r.nc_program} rev ${r.nc_rev}`, label: 'Program NC', fmt: v => `<span class="mono">${esc(v)}</span>` },
    { key: 'nx_time_min', label: 'Czas NX', fmt: 'hm' }, { key: 'machine_est_min', label: 'Przewidywany czas maszyny', fmt: 'hm' }, { key: 'machine_actual_min', label: 'Rzeczywisty czas maszyny', fmt: 'hm' },
    { key: r => r, label: 'Źródło', fmt: r => r.source === 'reczne' ? tag('dane ręczne', 'warn') : tag('CNC Process', 'accent') },
    { key: r => new Date(r.source_updated_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Aktualizacja' },
    { key: 'stale', label: 'Aktualność', fmt: v => v ? tag('nieaktualne — inna rewizja NC', 'danger', 'alert') : tag('aktualne', 'ok') },
  ], td) : '<p class="muted">Brak danych. Dane technologiczne dostarcza CNC Process (import JSON) lub wpis ręczny oznaczony jako ręczny.</p>';
  main.innerHTML = head(`${p.order_no} · ${p.part_no} rev ${p.part_rev}`, `${esc(p.id)} · ${esc(p.part_family || 'bez rodziny')} · ${p.machine_name ? `${esc(p.machine_name)} ${p.axes}X / ${esc(p.control)}` : 'bez maszyny'} · termin ${plDate(p.due_date)} · priorytet ${p.priority}`,
    `<a class="btn" href="#/projekty">‹ Projekty</a>${isAdmin() ? `<button id="editPrj">Edytuj</button><button id="ncRev">${icon('nc')}Rewizja NC</button>${btn('addTask', 'Zadanie')}${openRet ? `<button id="closeRet">${icon('check')}Zakończ poprawki</button>` : canReturn ? `<button id="startRet">${icon('makeup')}Powrót do projektu (poprawki)</button>` : ''}` : ''}`) + `
    ${openRet && p.returns ? `<div class="notice warn">${icon('makeup')} <b>Runda poprawek ${openRet.round}</b> od ${plDate(openRet.opened_date)}: ${esc(openRet.reason)}. Nowe zadania i praca od tego dnia liczą się jako czas, który doszedł po zakończeniu projektu.</div>` : ''}
    <div class="cols-2"><div>
      <section class="panel">${projectMeter(p)}${delayLine(p.schedule)}${p.blocked ? `<p>${tag(p.block_reason, 'danger', 'block')}</p>` : ''}
        <p class="small">Obowiązujący program: ${p.nc_program ? `<span class="mono">${esc(p.nc_program)} rev ${esc(p.nc_rev)}</span>` : '<span class="muted">nie ustalono</span>'}${p.folder_link ? ` · Folder: <span class="mono">${esc(p.folder_link)}</span>` : ''}</p>
        ${p.description ? `<p class="small">${esc(p.description)}</p>` : ''}</section>
      <section class="panel"><h3>Zadania</h3>${table([
        { key: r => r, label: 'Zadanie', fmt: r => `<b>${esc(r.title)}</b>${r.return_id ? ` <span class="tag warn">poprawki${retRound.has(r.return_id) ? ` · runda ${retRound.get(r.return_id)}` : ''}</span>` : ''}<br><span class="small muted">${esc(r.type_name)}${r.operation_id ? ` · <span class="mono">${esc(r.operation_id)}</span>` : ''}</span>` },
        { key: 'phase', label: 'Etap' }, { key: 'weight', label: 'Waga', num: true }, { key: r => r, label: 'Osoba', fmt: r => person(r.assignee_id) },
        { key: 'due_date', label: 'Termin', fmt: 'date' },
        ...(mgmt ? [{ key: 'original_planned_min', label: 'Plan pierwotny', fmt: 'hm' }, { key: 'planned_min', label: 'Plan', fmt: 'hm' }, { key: 'actual_active_min', label: 'Aktywny rzeczywisty', fmt: 'hm' }] : []),
        { key: r => r, label: 'Status', fmt: r => `${tag(...TASK_STATUS[r.status])}${r.block_reason ? `<br><span class="small">${esc(r.block_reason)}</span>` : ''}${r.result_confirmation ? `<br><span class="small muted">${icon('check')} ${esc(r.result_confirmation)}</span>` : ''}` },
        ...(isAdmin() ? [{ key: r => r, label: '', fmt: r => `<button class="link" data-task="${r.id}">Status</button><button class="link" data-time="${r.id}">Czas</button><button class="link" data-plan="${r.id}">Plan</button>${mgmt ? `<button class="link" data-exp="${r.id}">Wyjaśnienie</button>` : ''}` }] : []),
      ], p.tasks, { rowClass: r => r.status === 'anulowane' ? 'row-cancel' : '' })}</section>
      <section class="panel"><h3>Dane technologiczne</h3><p class="small muted">Dane z CNC Process. CNC Team nie wylicza czasu obróbki.</p>${techRows}
        <div class="toolbar" style="margin-top:var(--sp-3)">${p.cnc_process_url ? `<a class="btn" href="${esc(p.cnc_process_url)}" target="_blank" rel="noopener">Otwórz w CNC Process</a>` : '<span class="btn" aria-disabled="true" title="Integracja nieskonfigurowana">Otwórz w CNC Process — brak integracji</span>'}${isAdmin() ? `<button id="manualTech">Wpis ręczny</button>` : ''}</div></section>
    </div><div>
      ${p.contributions ? `<section class="panel"><h3>Wkład osób (kolejne zmiany)</h3><ul class="plain">${p.contributions.map(c => `<li>${person(c.employee_id)} — zmian: ${c.shifts}${c.work_min !== undefined ? `, czas: ${hm(c.work_min)}` : ''}</li>`).join('') || '<li class="muted">Brak zapisanego czasu.</li>'}</ul></section>` : ''}
      <section class="panel"><h3>Przekazania zmian</h3>${p.handovers.map(h => handoverCard(h)).join('') || '<p class="muted">Brak przekazań.</p>'}
        ${isAdmin() ? `<button id="addHo">${icon('handover')}Przekazanie zmiany</button>` : ''}</section>
    </div></div>
    ${isAdmin() ? '<div id="analysisSlot" style="margin-top:var(--sp-4)"><p class="muted small">Wczytywanie przebiegu projektu…</p></div>' : ''}
    ${isAdmin() ? `<section class="panel" style="margin-top:var(--sp-4)"><h3>Historia zmian projektu i zadań</h3><div id="hist"><button id="loadHist" class="link">Pokaż historię: kto, kiedy, co zmienił</button></div></section>` : ''}`;
  if (isAdmin()) {
    projectAnalysisSection(p).then(html => { const slot = $('#analysisSlot'); if (slot) { slot.innerHTML = html; bindProjectAnalysis(p); } })
      .catch(e => { const slot = $('#analysisSlot'); if (slot) slot.innerHTML = `<div class="notice danger">${esc(e.message)}</div>`; });
  }
  on('editPrj', () => projectForm(p));
  on('ncRev', () => openForm({ title: 'Obowiązujący program i rewizja NC', intro: '<p class="small muted">Po zmianie rewizji estymacje dla poprzedniej rewizji zostaną oznaczone jako nieaktualne.</p>', fields: [
    { name: 'nc_program', label: 'Program NC', value: p.nc_program, required: true }, { name: 'nc_rev', label: 'Rewizja NC', value: p.nc_rev, required: true }, { name: 'reason', label: 'Powód', wide: true }],
  submit: async (v, idem) => { const r = await post(`/projects/${encodeURIComponent(p.id)}/nc-revision`, v, idem); if (r.marked_stale) toast(`Oznaczono jako nieaktualne: ${r.marked_stale}`, 'warn'); return r; } }));
  on('addTask', () => taskForm(p));
  on('startRet', () => openForm({
    title: 'Powrót do projektu — runda poprawek',
    intro: `<p class="small muted">Projekt wraca do realizacji. Praca przed dniem powrotu to „czas przed poprawkami”; praca w czasie rundy (od dnia powrotu do jej zakończenia — nowe zadania i ponownie otwarte zadania pierwotne) liczy się osobno jako czas, który doszedł. Po zakończeniu rundy czasu nie dopisuje się do projektu bez kolejnego powrotu. Powód trafia do historii.</p>`,
    fields: [
      { name: 'reason', label: 'Co trzeba poprawić (powód)', type: 'textarea', required: true, wide: true },
      { name: 'cause', label: 'Przyczyna', type: 'select', options: Object.entries(CAUSE_LABEL) },
      { name: 'opened_date', label: 'Dzień powrotu', type: 'date', value: S.me.today, required: true },
      { name: 'task_title', label: 'Zadanie poprawek (opcjonalnie)', value: `Poprawki — runda ${rets.length + 1}`, wide: true },
      { name: 'type_id', label: 'Typ zadania', type: 'select', options: S.boot.task_types.filter(t => t.active).map(t => [t.id, t.name]), value: (S.boot.task_types.find(t => t.code === 'NX') || {}).id, show: v => !!v.task_title },
      { name: 'planned_min', label: 'Plan na poprawki', type: 'hm', show: v => !!v.task_title },
      { name: 'assignee_id', label: 'Osoba', type: 'select', options: empOptions(), show: v => !!v.task_title },
    ],
    submit: (v, idem) => { if (v.task_title && !v.type_id) throw new Error('Wybierz typ zadania poprawek albo wyczyść jego nazwę.'); return post(`/projects/${encodeURIComponent(p.id)}/returns`, v, idem); },
  }));
  on('closeRet', () => openForm({
    title: `Zakończ rundę poprawek ${openRet ? openRet.round : ''}`,
    intro: '<p class="small muted">Wymaga zakończenia wszystkich zadań projektu. Projekt wraca do statusu „zakończony”.</p>',
    fields: [{ name: 'closed_date', label: 'Dzień zakończenia', type: 'date', value: S.me.today, required: true }, { name: 'note', label: 'Co poprawiono', type: 'textarea', wide: true, required: true }],
    submit: (v, idem) => post(`/projects/${encodeURIComponent(p.id)}/returns/close`, v, idem),
  }));
  on('manualTech', () => openForm({ title: 'Ręczne dane technologiczne', intro: '<p class="notice">Dane zostaną jawnie oznaczone jako „dane ręczne”.</p>', fields: [
    { name: 'operation_id', label: 'Operacja', required: true, value: 'OP10' }, { name: 'nc_program', label: 'Program NC', value: p.nc_program }, { name: 'nc_rev', label: 'Rewizja NC', value: p.nc_rev },
    { name: 'nx_time_min', label: 'Czas NX', type: 'hm' }, { name: 'machine_est_min', label: 'Przewidywany czas maszyny', type: 'hm' }, { name: 'machine_actual_min', label: 'Rzeczywisty czas maszyny', type: 'hm' }],
  submit: (v, idem) => post(`/projects/${encodeURIComponent(p.id)}/tech-data`, v, idem) }));
  on('addHo', () => handoverForm(p));
  on('loadHist', async () => {
    const h = await api(`/projects/${encodeURIComponent(p.id)}/history`);
    $('#hist').innerHTML = historyTable(h);
  });
  $$('[data-task]').forEach(b => b.onclick = () => { const t = p.tasks.find(x => x.id === Number(b.dataset.task)); taskStatusForm(t, p); });
  $$('[data-time]').forEach(b => b.onclick = () => timeForm(p.tasks.find(x => x.id === Number(b.dataset.time))));
  $$('[data-plan]').forEach(b => b.onclick = () => { const t = p.tasks.find(x => x.id === Number(b.dataset.plan)); openForm({ title: 'Zmiana planu aktywnego czasu', intro: `<p class="small">Plan pierwotny ${hm(t.original_planned_min)} pozostaje w historii. Obecny: ${hm(t.planned_min)}.</p>${(t.plan_changes || []).length ? table([{ key: 'old_planned_min', label: 'Było', fmt: 'hm' }, { key: 'new_planned_min', label: 'Jest', fmt: 'hm' }, { key: 'reason', label: 'Powód' }], t.plan_changes) : ''}`, fields: [{ name: 'planned_min', label: 'Nowy plan', type: 'hm', required: true }, { name: 'reason', label: 'Powód zmiany planu', type: 'textarea', required: true, wide: true }], submit: (v, idem) => post(`/tasks/${t.id}/plan`, v, idem) }); });
  $$('[data-exp]').forEach(b => b.onclick = () => { const t = p.tasks.find(x => x.id === Number(b.dataset.exp)); openForm({ title: 'Wyjaśnienie odchylenia', intro: `${(t.explanations || []).map(x => `<p class="small"><b>${esc(x.explanation)}</b><br>Wniosek: ${esc(x.conclusion || '—')}</p>`).join('')}`, fields: [{ name: 'explanation', label: 'Wyjaśnienie', type: 'textarea', required: true, wide: true }, { name: 'conclusion', label: 'Wniosek administratora', type: 'textarea', wide: true }], submit: (v, idem) => post(`/tasks/${t.id}/explanations`, v, idem) }); });
}

function taskForm(p) {
  openForm({
    title: 'Nowe zadanie', intro: '<p class="small muted">Przed rozpoczęciem ustal zakres, typ, trudność, rodzinę detalu, plan aktywnego czasu, rezultat i termin. Pierwotny plan jest zachowywany.</p>', fields: [
      { name: 'type_id', label: 'Typ zadania', type: 'select', options: S.boot.task_types.filter(t => t.active).map(t => [t.id, `${t.name} (${t.phase}, waga ${t.default_weight})`]), required: true },
      { name: 'title', label: 'Tytuł', required: true, wide: true }, { name: 'scope', label: 'Zakres', type: 'textarea', wide: true },
      { name: 'operation_id', label: 'Operacja (np. OP10)' }, { name: 'difficulty', label: 'Trudność 1–5', type: 'number', min: 1, max: 5 },
      { name: 'part_family', label: 'Rodzina detalu', value: p.part_family }, { name: 'weight', label: 'Waga (puste = domyślna typu)', type: 'number', min: 1 },
      { name: 'planned_min', label: 'Plan aktywnego czasu', type: 'hm' }, { name: 'due_date', label: 'Termin', type: 'date' },
      { name: 'assignee_id', label: 'Osoba', type: 'select', options: empOptions() }, { name: 'expected_result', label: 'Oczekiwany rezultat', wide: true },
    ], submit: (v, idem) => post('/tasks', { ...v, project_id: p.id }, idem),
  });
}
function taskStatusForm(t, p) {
  openForm({
    title: `Status: ${t.title}`, fields: [
      { name: 'status', label: 'Status', type: 'select', placeholder: false, value: t.status, options: Object.entries(TASK_STATUS).map(([k, [l]]) => [k, l]) },
      { name: 'assignee_id', label: 'Osoba (przejęcie na kolejnej zmianie)', type: 'select', options: empOptions(), value: t.assignee_id },
      { name: 'block_reason', label: 'Powód blokady', value: t.block_reason, wide: true, show: v => v.status === 'zablokowane' },
      { name: 'result_confirmation', label: 'Potwierdzenie rezultatu (wymagane do zakończenia)', type: 'textarea', wide: true, show: v => v.status === 'zakonczone' && t.status !== 'zakonczone' },
      { name: 'reason', label: 'Powód (anulowanie / ponowne otwarcie)', wide: true },
    ], submit: (v, idem) => post(`/tasks/${t.id}`, v, idem, 'PATCH'),
  });
}
function timeForm(t) {
  openForm({
    title: `Czas pracy: ${t.title}`, intro: '<p class="small muted">Czas ludzi (nie maszyny). Wpisuje administrator. Poprawki i blokady wymagają przyczyny.</p>', fields: [
      { name: 'employee_id', label: 'Pracownik', type: 'select', options: empOptions(), value: t.assignee_id, required: true }, { name: 'work_date', label: 'Dzień rozpoczęcia zmiany', type: 'date', value: S.me.today, required: true, help: 'Praca z nocnej zmiany należy do dnia jej rozpoczęcia — wtedy poprawnie liczą się nadgodziny i dni dodatkowe.' },
      { name: 'active_min', label: 'Aktywna praca', type: 'hm' }, { name: 'verify_min', label: 'Weryfikacja i uruchomienie', type: 'hm' }, { name: 'rework_min', label: 'Poprawki', type: 'hm' },
      { name: 'blocked_min', label: 'Blokady i oczekiwanie', type: 'hm' }, { name: 'unassigned_min', label: 'Czas nieprzypisany', type: 'hm' },
      { name: 'cause', label: 'Przyczyna', type: 'select', options: Object.entries(CAUSE_LABEL) }, { name: 'note', label: 'Uwagi', wide: true },
    ], submit: (v, idem) => post('/time-entries', { ...v, task_id: t.id }, idem),
  });
}

function handoverCard(h) {
  return `<div class="panel" style="padding:var(--sp-3)"><div class="small muted">${plDate(h.shift_date)} · ${person(h.from_employee_id)} → ${person(h.to_employee_id)}${h.order_no ? ` · <span class="mono">${esc(h.order_no)}</span> ${esc(h.part_no)}` : ''}</div>
    <p class="small" style="margin:6px 0"><b>Wykonano:</b> ${esc(h.done_text)}<br><b>Pozostało:</b> ${esc(h.remaining_text)}<br>
    <b>Program NC:</b> ${h.nc_program ? `<span class="mono">${esc(h.nc_program)} rev ${esc(h.nc_rev || '—')}</span>` : '—'}<br><b>Przerwano:</b> ${esc(h.stopped_at_text || '—')}<br><b>Narzędzia i mocowanie:</b> ${esc(h.tooling_notes || '—')}</p>
    ${h.checklist.length ? `<ul class="small">${h.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}</div>`;
}
function handoverForm(p, projects) {
  openForm({
    title: 'Przekazanie zmiany', fields: [
      ...(p ? [] : [{ name: 'project_id', label: 'Projekt', type: 'select', options: projects.map(x => [x.id, `${x.order_no} ${x.part_no} rev ${x.part_rev}`]), required: true }]),
      { name: 'shift_date', label: 'Dzień zmiany', type: 'date', value: S.me.today, required: true }, { name: 'machine_id', label: 'Maszyna', type: 'select', options: machineOptions(), value: p?.machine_id },
      { name: 'from_employee_id', label: 'Przekazuje', type: 'select', options: empOptions() }, { name: 'to_employee_id', label: 'Przejmuje', type: 'select', options: empOptions() },
      { name: 'done_text', label: 'Co wykonano', type: 'textarea', required: true, wide: true }, { name: 'remaining_text', label: 'Co pozostało', type: 'textarea', required: true, wide: true },
      { name: 'nc_program', label: 'Obowiązujący program NC', value: p?.nc_program }, { name: 'nc_rev', label: 'Rewizja NC', value: p?.nc_rev },
      { name: 'stopped_at_text', label: 'Gdzie przerwano', wide: true }, { name: 'tooling_notes', label: 'Uwagi do narzędzi i mocowania', type: 'textarea', wide: true },
      { name: 'checklist', label: 'Punkty do sprawdzenia przed kontynuacją (po jednym w wierszu)', type: 'textarea', wide: true },
    ], submit: (v, idem) => post('/handovers', { ...v, project_id: p ? p.id : v.project_id }, idem),
  });
}

// ---------- Tablica maszyn ----------
VIEWS.maszyny = async (main) => {
  const [board, projects] = await Promise.all([api('/board'), api('/projects?status=aktywny')]);
  main.innerHTML = head('Tablica maszyn', 'Stan wprowadzany przez administratora. Brak automatycznego odczytu z maszyn.') +
    `<div class="machines">${board.map(b => `<div>${plate(b)}${isAdmin() ? `<div class="toolbar" style="margin-top:var(--sp-2)"><button data-board="${esc(b.machine.id)}">Aktualizuj kartę</button><button class="link" data-machine="${esc(b.machine.id)}">Dane maszyny</button></div>` : ''}</div>`).join('')}</div>`;
  $$('[data-board]').forEach(btnEl => btnEl.onclick = () => {
    const b = board.find(x => x.machine.id === btnEl.dataset.board);
    const tasksOf = (pid) => (projects.find(p => p.id === pid)?.tasks || []).filter(t => t.status !== 'zakonczone' && t.status !== 'anulowane').map(t => [t.id, t.title]);
    openForm({
      title: `Karta: ${b.machine.name} ${b.machine.axes}X`, fields: [
        { name: 'project_id', label: 'Aktualny projekt', type: 'select', options: projects.map(p => [p.id, `${p.order_no} ${p.part_no} rev ${p.part_rev}`]), value: b.project_id },
        { name: 'stage', label: 'Etap', value: b.stage }, { name: 'assignee_id', label: 'Przypisana osoba', type: 'select', options: empOptions(), value: b.assignee_id },
        { name: 'next_task_id', label: 'Następne zadanie', type: 'select', options: tasksOf(b.project_id), value: b.next_task_id },
        { name: 'next_program_status', label: 'Gotowość kolejnego programu', type: 'select', placeholder: false, value: b.next_program_status, options: Object.entries(PROGRAM_STATUS) },
        { name: 'expected_end_date', label: 'Przewidywany koniec — dzień', type: 'date' }, { name: 'expected_end_time', label: 'godzina', type: 'time' },
        { name: 'expected_end_source', label: 'Źródło przewidywania', help: 'Wymagane, jeśli podajesz przewidywany koniec.' },
        { name: 'block_reason', label: 'Blokada', wide: true, value: b.block_reason },
      ],
      onChange: (v, form) => {
        const sel = form.elements.next_task_id;
        if (sel.dataset.p !== String(v.project_id)) { sel.dataset.p = String(v.project_id); sel.innerHTML = '<option value="">— wybierz —</option>' + tasksOf(v.project_id).map(([i, l]) => `<option value="${i}" ${i === b.next_task_id ? 'selected' : ''}>${esc(l)}</option>`).join(''); }
      },
      submit: (v, idem) => post(`/board/${encodeURIComponent(b.machine.id)}`, v, idem, 'PUT'),
    });
  });
  $$('[data-machine]').forEach(btnEl => btnEl.onclick = () => {
    const m = board.find(x => x.machine.id === btnEl.dataset.machine).machine;
    openForm({ title: `Maszyna ${m.id}`, fields: [{ name: 'name', label: 'Nazwa', value: m.name, required: true }, { name: 'axes', label: 'Liczba osi', type: 'number', value: m.axes, required: true }, { name: 'control', label: 'Sterowanie', value: m.control, required: true }, { name: 'model', label: 'Dokładny model', value: m.model }, { name: 'tool_holder', label: 'Oprawki narzędziowe (np. BT50, HSK40)', value: m.tool_holder }, { name: 'plate', label: 'Dane z tabliczki znamionowej', value: m.plate, wide: true }, { name: 'notes', label: 'Uwagi', value: m.notes, wide: true }, { name: 'sort', label: 'Kolejność', type: 'number', value: m.sort }],
      submit: (v, idem) => post(`/machines/${encodeURIComponent(m.id)}`, v, idem, 'PUT').then(r => (loadBoot(), r)) });
  });
};

// ---------- Przekazanie zmiany ----------
VIEWS.przekazanie = async (main) => {
  const [list, projects] = await Promise.all([api('/handovers'), api('/projects?status=aktywny')]);
  main.innerHTML = head('Przekazanie zmiany', 'Co wykonano, co pozostało, obowiązujący program NC i rewizja, gdzie przerwano, uwagi do narzędzi i mocowania.', isAdmin() ? btn('addHo2', 'Nowe przekazanie', 'handover') : '') +
    `<div class="cols">${list.map(handoverCard).join('') || '<div class="empty">Brak przekazań.</div>'}</div>`;
  on('addHo2', () => handoverForm(null, projects));
};
