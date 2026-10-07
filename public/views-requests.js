// Widoki: zgłoszenia pracowników do weryfikacji (serwer firmowy), status projektów dla gościa, opóźnienie projektu.
'use strict';

const REQ_KIND = {
  spoznienie: ['Spóźnienie', 'today', 'O której przyjdziesz do pracy'],
  nieobecnosc: ['Nieobecność', 'absence', 'Cały dzień lub kilka dni'],
  wyjscie: ['Wyjście w trakcie zmiany', 'exit', 'Od której do której'],
  odrobienie: ['Odrobienie czasu', 'makeup', 'Kiedy odrobiłeś / odrobisz'],
  inne: ['Inna sprawa', 'other', 'Opisz w uwadze'],
};
const REQ_STATUS = { nowe: ['czeka na decyzję', 'warn'], przyjete: ['przyjęte', 'ok'], odrzucone: ['odrzucone', 'danger'], wycofane: ['wycofane', ''] };

function reqWhen(r) {
  const d = `${plDate(r.date_from)}${r.date_to && r.date_to !== r.date_from ? ` – ${plDate(r.date_to)}` : ''}`;
  if (r.kind === 'spoznienie') return `${d}${r.time_to ? ` · przyjście ${esc(r.time_to)}` : ''}`;
  return `${d}${r.time_from ? ` · ${esc(r.time_from)}–${esc(r.time_to || '')}` : ''}`;
}

// ---------- Pracownik: „Zgłoś” ----------
VIEWS.zglos = async (main) => {
  const list = await api('/requests');
  main.innerHTML = head('Zgłoś kierownikowi', 'Zgłoszenie trafia do weryfikacji. Wpis w grafiku lub rozliczeniu powstaje dopiero po decyzji kierownika.') + `
    <div class="cols-2"><section class="panel"><h3>Nowe zgłoszenie</h3>
      <div class="kind-pick" role="radiogroup" aria-label="Rodzaj zgłoszenia">${Object.entries(REQ_KIND).map(([k, [l, ic, hint]]) =>
        `<button type="button" class="kind" data-kind="${k}" role="radio" aria-checked="false">${icon(ic)}<b>${esc(l)}</b><span class="small muted">${esc(hint)}</span></button>`).join('')}</div>
      <form id="reqF" class="form-grid" hidden>
        <label class="field">Dzień<input type="date" name="date_from" required value="${S.me.today}"></label>
        <label class="field" data-show="nieobecnosc">Do dnia (opcjonalnie)<input type="date" name="date_to"></label>
        <label class="field" data-show="wyjscie odrobienie nieobecnosc inne">Od godz.<input type="time" name="time_from"></label>
        <label class="field" data-show="spoznienie wyjscie odrobienie nieobecnosc inne"><span data-lbl>Do godz.</span><input type="time" name="time_to"></label>
        <label class="field wide">Uwaga dla kierownika<textarea name="note" maxlength="500" rows="3" placeholder="Np. powód. Bez danych medycznych."></textarea></label>
        <div class="wide toolbar"><button class="primary" type="submit">${icon('check')}Wyślij do weryfikacji</button></div>
        <div class="form-error wide" role="alert"></div>
      </form></section>
      <section class="panel"><h3>Moje zgłoszenia</h3>${table([
        { key: r => r, label: 'Zgłoszenie', fmt: r => `${icon(REQ_KIND[r.kind][1])} <b>${esc(REQ_KIND[r.kind][0])}</b><br><span class="small">${reqWhen(r)}</span>${r.note ? `<br><span class="small muted">${esc(r.note)}</span>` : ''}` },
        { key: r => r, label: 'Decyzja', fmt: r => `${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small">${esc(r.decision_note)}</span>` : ''}${r.decided_at ? `<br><span class="small muted">${new Date(r.decided_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</span>` : ''}` },
        { key: r => r, label: '', fmt: r => r.status === 'nowe' ? `<button class="link" data-withdraw="${r.id}">Wycofaj</button>` : '' },
      ], list, { empty: 'Nie masz jeszcze zgłoszeń.', rowClass: r => r.status === 'wycofane' ? 'row-cancel' : '' })}</section></div>`;
  let kind = null;
  const f = $('#reqF');
  $$('[data-kind]').forEach(b => b.onclick = () => {
    kind = b.dataset.kind;
    $$('[data-kind]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    f.hidden = false;
    $$('[data-show]', f).forEach(el => el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(kind)));
    $('[data-lbl]', f).textContent = kind === 'spoznienie' ? 'Przyjdę o godz.' : 'Do godz.';
    f.date_from.focus();
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', f); btn.disabled = true; $('.form-error', f).textContent = '';
    const v = Object.fromEntries([...new FormData(f)].filter(([, x]) => x !== ''));
    try {
      await api('/requests', { method: 'POST', body: { kind, ...v, client_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) } });
      toast('Wysłano. Kierownik zobaczy zgłoszenie.'); setTimeout(rerender, 50);
    } catch (err) { $('.form-error', f).textContent = describeError(err); btn.disabled = false; }
  };
  $$('[data-withdraw]').forEach(b => b.onclick = async () => {
    try { await api(`/requests/${b.dataset.withdraw}/withdraw`, { method: 'POST' }); toast('Wycofano.'); rerender(); } catch (e) { toast(e.message, 'err'); }
  });
};

// ---------- Kierownik: zgłoszenia pracowników ----------
VIEWS.zgloszenia = async (main) => {
  const local = await localRequestsSection();
  main.innerHTML = head('Zgłoszenia pracowników', 'Spóźnienia, nieobecności, wyjścia i odrobienia zgłoszone przez pracowników. Nic nie trafia do grafiku ani rozliczeń bez Twojej decyzji.') + local.html;
  local.bind();
};

async function localRequestsSection() {
  const list = await api('/requests');
  const html = `<section class="panel"><h3>Zgłoszenia pracowników</h3>${table([
    { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) },
    { key: r => r, label: 'Rodzaj', fmt: r => `${icon(REQ_KIND[r.kind][1])} ${esc(REQ_KIND[r.kind][0])}` },
    { key: r => r, label: 'Kiedy', fmt: r => reqWhen(r) },
    { key: 'note', label: 'Uwaga pracownika' },
    { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Zgłoszono' },
    { key: r => r, label: 'Status', fmt: r => `${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small">${esc(r.decision_note)}</span>` : ''}${r.decided_by_name ? `<br><span class="small muted">${esc(r.decided_by_name)}</span>` : ''}${r.result_ref ? `<br><span class="small muted">wpis: ${esc(r.result_ref)}</span>` : ''}` },
    { key: r => r, label: '', fmt: r => r.status === 'nowe' && isAdmin() ? `<button data-racc="${r.id}" class="primary">Przyjmij</button> <button data-rrej="${r.id}" class="link">Odrzuć</button>` : '' },
  ], list, { empty: 'Brak zgłoszeń.', rowClass: r => r.status === 'wycofane' ? 'row-cancel' : '' })}</section>`;
  const bind = () => {
    $$('[data-racc]').forEach(b => b.onclick = () => requestAcceptForm(list.find(r => r.id === Number(b.dataset.racc))));
    $$('[data-rrej]').forEach(b => b.onclick = () => openForm({
      title: 'Odrzuć zgłoszenie', intro: '<p class="small">Pracownik zobaczy decyzję i wyjaśnienie.</p>',
      fields: [{ name: 'note', label: 'Wyjaśnienie dla pracownika', type: 'textarea', required: true, wide: true }], submitLabel: 'Odrzuć',
      submit: (v) => post(`/requests/${b.dataset.rrej}/decide`, { decision: 'odrzucone', note: v.note }),
    }));
  };
  return { html, bind, pending: list.filter(r => r.status === 'nowe').length };
}

function requestTargetOptions(kind) {
  const cats = S.boot.categories.filter(c => c.active && !['WYJSCIE_PRYWATNE', 'OKOLICZNOSCIOWY'].includes(c.code));
  const byCode = (code) => cats.find(c => c.code === code)?.id;
  const options = [];
  if (kind === 'spoznienie') options.push(['exit', 'Do odrobienia — jak wyjście prywatne (od początku zmiany do przyjścia)'], ['absence:' + byCode('SPOZNIENIE_USPRAW'), 'Spóźnienie usprawiedliwione (bez odrabiania)'], ['absence:' + byCode('SPOZNIENIE_NIEUSPRAW'), 'Spóźnienie nieusprawiedliwione']);
  if (kind === 'wyjscie') options.push(['exit', 'Wyjście prywatne do odrobienia']);
  if (kind === 'odrobienie') options.push(['makeup', 'Odrabianie — przypisz do nierozliczonych wyjść z tego miesiąca']);
  if (kind === 'nieobecnosc' || kind === 'inne') options.push(['absence', 'Nieobecność — wybierz kategorię']);
  options.push(['none', 'Przyjmij bez wpisu (wpiszę ręcznie)']);
  return { options, cats, byCode };
}

function requestAcceptForm(r) {
  const { options, cats, byCode } = requestTargetOptions(r.kind);
  openForm({
    title: `Przyjmij: ${REQ_KIND[r.kind][0]} — ${S.emp.get(r.employee_id)?.first_name || ''}`,
    intro: `<p class="small">${reqWhen(r)}${r.note ? `<br>Uwaga: ${esc(r.note)}` : ''}</p><p class="small muted">Wpis powstanie z odnośnikiem do zgłoszenia #${r.id}; w historii zapisze się, kto przyjął.</p>`,
    fields: [
      { name: 'target', label: 'Jak rozliczyć', type: 'select', options, value: options[0][0], placeholder: false, wide: true },
      { name: 'category_id', label: 'Kategoria nieobecności', type: 'select', options: cats.map(c => [c.id, c.subtype ? `${c.name} — ${c.subtype}` : c.name]), value: byCode('INNE_USPRAW'), placeholder: false, wide: true, show: v => v.target === 'absence' },
      { name: 'unit', label: 'Jednostka (gdy kategoria pozwala)', type: 'select', options: [['dni', 'dni'], ['godziny', 'godziny']], value: r.time_from ? 'godziny' : 'dni', placeholder: false, show: v => v.target === 'absence' },
      { name: 'written_request', label: 'Uznaj zgłoszenie za pisemny wniosek pracownika', type: 'checkbox', wide: true, help: 'Czy forma elektroniczna spełnia wymóg wniosku — do potwierdzenia z kadrami.', show: v => v.target === 'exit' },
      { name: 'day_off_reason', label: 'Uzasadnienie, jeśli odrabianie wypada w dniu wolnym', wide: true, show: v => v.target === 'makeup' },
      { name: 'note', label: 'Informacja dla pracownika (opcjonalnie)', wide: true },
    ],
    submitLabel: 'Przyjmij',
    submit: (v) => {
      let target = { type: v.target.split(':')[0] };
      if (target.type === 'absence') target = { type: 'absence', category_id: Number(v.target.split(':')[1] || v.category_id), unit: v.unit };
      if (target.type === 'exit') target.written_request = v.written_request;
      if (target.type === 'makeup') target.day_off_reason = v.day_off_reason;
      return post(`/requests/${r.id}/decide`, { decision: 'przyjete', note: v.note, target });
    },
  });
}

// ---------- Opóźnienie projektu ----------
const DELAY_LEVEL = { zgodnie: ['zgodnie z planem', 'ok'], opozniony: ['opóźniony', 'warn'], zagrozony: ['zagrożony', 'danger'], zakonczony: ['zakończony', 'ok'], brak_danych: ['brak danych', ''] };
function delayLine(s) {
  if (!s) return '';
  const lvl = DELAY_LEVEL[s.level] || DELAY_LEVEL.brak_danych;
  if (s.planned_percent === null) return `<p class="small">${tag(lvl[0], lvl[1])} <span class="muted">${esc(s.note || '')}</span></p>`;
  const main = s.delay_pct > 0 ? `opóźnienie <b>${s.delay_pct}%</b>` : s.ahead_pct > 0 ? `przed planem <b>${s.ahead_pct}%</b>` : 'zgodnie z planem';
  return `<p class="small delay">${tag(lvl[0], lvl[1], s.level === 'zagrozony' || s.level === 'opozniony' ? 'alert' : '')} ${main}
    <span class="muted">· plan na dziś ${s.planned_percent}% · wykonano ${s.actual_percent}%${s.overdue_days ? ` · <b>${s.overdue_days} dni po terminie</b>` : ''}${s.overdue_tasks ? ` · zadania po terminie: ${s.overdue_tasks}` : ''}</span></p>`;
}

// ---------- Gość: status projektów ----------
const GUEST_TASK = { nowe: ['do zrobienia', ''], w_toku: ['w toku', 'accent'], zablokowane: ['wstrzymane', 'warn'], zakonczone: ['zakończone', 'ok'] };
VIEWS.status = async (main) => {
  const list = await api('/guest/projects');
  main.innerHTML = head('Status projektów', `Stan na ${plDate(S.me.today)}. Widoczne są tylko projekty udostępnione dla Twojego konta.`) +
    (list.map(p => `<article class="panel guest-project">
      <div class="page-head" style="margin:0 0 var(--sp-2)"><div><h3 style="margin:0">${projectRef(p)}</h3>
        <span class="small muted">${p.machine ? esc(p.machine) + ' · ' : ''}start ${plDate(p.start_date)} · termin ${plDate(p.due_date)}</span></div>
        <div>${p.status === 'wstrzymany' || p.blocked ? tag('wstrzymany', 'warn', 'block') : tag('w realizacji', 'accent')}</div></div>
      ${projectMeter(p)}${delayLine(p.schedule)}
      <details><summary class="small">Etapy (${p.stages.length})</summary>${table([
        { key: 'title', label: 'Etap' }, { key: 'phase', label: 'Faza', fmt: v => v === 'przygotowanie' ? 'przygotowanie programu' : 'wykonanie detalu' },
        { key: 'due_date', label: 'Termin', fmt: 'date' }, { key: 'status', label: 'Status', fmt: v => tag(...(GUEST_TASK[v] || [v, ''])) }], p.stages)}</details>
    </article>`).join('') || '<div class="empty">Brak projektów w realizacji udostępnionych dla tego konta.</div>');
};

// ---------- Historia zmian: czytelny opis „pole: było → jest” ----------
const FIELD_LABEL = {
  status: 'status', due_date: 'termin', start_date: 'data rozpoczęcia', end_date: 'data końca', title: 'tytuł', weight: 'waga', assignee_id: 'osoba',
  planned_min: 'plan (min)', minutes: 'minuty', block_reason: 'powód blokady', result_confirmation: 'potwierdzenie rezultatu', priority: 'priorytet',
  machine_id: 'maszyna', responsible_ids: 'odpowiedzialni', role: 'rola', active: 'aktywne', value: 'wartość', note: 'uwaga', category_id: 'kategoria',
  unit: 'jednostka', start_at: 'od', end_at: 'do', nc_program: 'program NC', nc_rev: 'rewizja NC', blocked: 'zablokowany', description: 'opis',
  order_no: 'zlecenie', part_no: 'detal', part_rev: 'rewizja detalu', employee_id: 'pracownik', kind: 'rodzaj', date_from: 'dzień', date_to: 'do dnia',
  time_from: 'od godz.', time_to: 'do godz.', result_ref: 'utworzony wpis', target: 'sposób rozliczenia', guest_projects: 'projekty gościa',
  display_name: 'nazwa', login: 'login', password_changed: 'zmiana hasła', stage: 'etap', project_id: 'projekt', balance_min: 'saldo (min)',
};
function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return esc(JSON.stringify(v)).slice(0, 120);
  return esc(String(v)).slice(0, 120);
}
function changesHtml(r) {
  if (!r.changes || !r.changes.length) return '<span class="muted small">—</span>';
  return `<ul class="plain small changes">${r.changes.slice(0, 8).map(c => `<li><b>${esc(FIELD_LABEL[c.field] || c.field)}</b>: ${fmtVal(c.old)} → ${fmtVal(c.new)}</li>`).join('')}${r.changes.length > 8 ? `<li class="muted">… i ${r.changes.length - 8} więcej</li>` : ''}</ul>`;
}
function historyTable(rows) {
  return table([
    { key: r => new Date(r.at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Kiedy' }, { key: r => r.display_name || 'system', label: 'Kto' },
    { key: r => `${r.entity} ${r.entity_id || ''}`, label: 'Obiekt' }, { key: 'action', label: 'Akcja' }, { key: r => r, label: 'Co zmieniono', fmt: changesHtml }, { key: 'reason', label: 'Opis / powód' },
  ], rows, { empty: 'Brak wpisów w historii.' });
}
