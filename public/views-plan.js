// Widok „Plan pracy”: kierownik rozpisuje polecenia na dzień / zmianę; programista widzi swoje i potwierdza przeczytanie.
'use strict';

const ORDER_STATUS = { zaplanowane: ['do wykonania', 'accent'], wykonane: ['wykonane', 'ok'], czesciowo: ['częściowo', 'warn'], niewykonane: ['niewykonane', 'danger'], anulowane: ['anulowane', ''] };

function orderCard(o, { admin = false, mine = false, grouped = false, first = false, last = false } = {}) {
  const th = o.machine_id ? machineTheme({ id: o.machine_id, axes: o.axes }) : null;
  return `<li class="order ${o.status} ${th ? `theme-${th}` : ''}">
    <span class="seq">${o.seq}</span>
    <div class="o-body">
      <div class="o-title"><b>${esc(o.title)}</b> ${tag(...ORDER_STATUS[o.status])}${o.carried ? ` ${tag('przeniesione', '', 'makeup')}` : ''}</div>
      ${o.details ? `<p class="small o-details">${esc(o.details)}</p>` : ''}
      <div class="o-meta small">${[o.project_id ? `<a href="#/projekty/${encodeURIComponent(o.project_id)}"><span class="mono">${esc(o.order_no)}</span> ${esc(o.part_no)}</a>` : '',
        o.task_title && o.task_title !== o.title ? `zadanie: ${esc(o.task_title)}` : '',
        o.machine_id && (!grouped || !S.boot.machines.some(m => m.id === o.machine_id && m.active !== 0)) ? machineChip(o) : '',
        o.planned_min ? `${icon('today')} ${hShort(o.planned_min)}` : ''].filter(Boolean).join(' · ')}</div>
      ${o.result_note ? `<p class="small o-result">${icon('check')} ${esc(o.result_note)}${o.closed_by_name ? ` <span class="muted">— ${esc(o.closed_by_name)}</span>` : ''}</p>` : ''}
      <div class="o-ack small">${o.ack_at ? `${icon('check')} przeczytane ${new Date(o.ack_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : (o.status === 'zaplanowane' ? '<span class="unread">nieprzeczytane</span>' : '')}</div>
    </div>
    <div class="o-actions no-print">
      ${mine && !o.ack_at && o.status === 'zaplanowane' ? `<button class="primary" data-ack="${o.id}">${icon('check')}Potwierdzam przeczytanie</button>` : ''}
      ${admin && o.status !== 'anulowane' ? `
        ${o.status === 'zaplanowane' ? `${first ? '' : `<button class="link" data-up="${o.id}" aria-label="W górę">▲</button>`}${last ? '' : `<button class="link" data-down="${o.id}" aria-label="W dół">▼</button>`}<button class="link" data-edit-o="${o.id}">Edytuj</button>` : ''}
        <button class="link" data-close-o="${o.id}">${o.status === 'zaplanowane' ? 'Oceń wykonanie' : 'Zmień ocenę'}</button>
        <button class="link" data-cancel-o="${o.id}">Anuluj</button>` : ''}
    </div></li>`;
}

// Polecenia jednej osoby podzielone na maszyny; „Inna praca” (bez maszyny) pokazywana tylko, gdy coś w niej jest
function machineGroups(orders, { admin = false, mine = false, employeeId = null, date = '' } = {}) {
  const groups = S.boot.machines.filter(m => m.active !== 0).map(m => ({ key: m.id, title: m.name, sub: `${m.axes}X · ${m.control}`, theme: machineTheme(m), list: orders.filter(o => o.machine_id === m.id) }));
  const other = orders.filter(o => !o.machine_id || !groups.some(g => g.key === o.machine_id));
  const box = (g) => `<div class="pm-group ${g.theme ? `theme-${g.theme}` : 'pm-other'}">
      <div class="pm-head">${g.theme ? machineEmblem(g.theme, 22) : icon('list')}<b>${esc(g.title)}</b>${g.sub ? `<span class="small muted">${esc(g.sub)}</span>` : ''}
        ${admin ? `<button type="button" class="link no-print pm-add" data-add-o="${employeeId}" data-machine="${esc(g.key)}">${icon('plus')}Polecenie</button>` : ''}</div>
      <ol class="orders">${g.list.map((o, k) => orderCard(o, { admin, mine, grouped: true, first: k === 0, last: k === g.list.length - 1 })).join('') || '<li class="muted small empty-orders">—</li>'}</ol></div>`;
  // „Inna praca”: okno otwierane w razie potrzeby — kierownik wpisuje pozostałe obowiązki na zmianę od razu w okienku
  const quick = admin ? `<form class="pm-quick no-print" data-quick="${employeeId}" data-date="${esc(date)}">
      <label class="field wide">Obowiązek na zmianę<input name="title" required maxlength="200" placeholder="np. porządek w bibliotece narzędzi, dokumentacja, szkolenie"></label>
      <label class="field">Czas (h)<input name="h" type="number" min="0" max="16" step="0.25" inputmode="decimal" placeholder="opcjonalnie"></label>
      <button type="submit" class="primary">${icon('plus')}Dodaj</button></form>` : '';
  const otherBox = other.length
    ? `<details class="pm-group pm-other" open><summary class="pm-head">${icon('list')}<b>Inna praca</b><span class="small muted">pozostałe obowiązki na zmianę</span></summary>
        <ol class="orders">${other.map((o, k) => orderCard(o, { admin, mine, grouped: true, first: k === 0, last: k === other.length - 1 })).join('')}</ol>${quick}</details>`
    : admin ? `<details class="pm-group pm-other pm-closed no-print"><summary class="pm-head">${icon('plus')}<b>Inna praca</b><span class="small muted">otwórz, aby wpisać pozostałe obowiązki na zmianę</span></summary>${quick}</details>` : '';
  return `${groups.map(box).join('')}${otherBox}`;
}

function orderForm(o = {}, ctx = {}) {
  const projects = ctx.projects || [];
  const tasksOf = (pid) => { const p = projects.find(x => x.id === pid); return p ? p.tasks.filter(t => t.status !== 'zakonczone' && t.status !== 'anulowane').map(t => [t.id, t.title]) : []; };
  openForm({
    title: o.id ? 'Edytuj polecenie' : 'Nowe polecenie',
    intro: '<p class="small muted">Po zmianie treści programista musi ponownie potwierdzić przeczytanie.</p>',
    fields: [
      { name: 'employee_id', label: 'Programista', type: 'select', options: empOptions(), value: o.employee_id || ctx.employee_id, required: true },
      { name: 'work_date', label: 'Dzień', type: 'date', value: o.work_date || ctx.date, required: true },
      { name: 'project_id', label: 'Projekt (opcjonalnie)', type: 'select', options: projects.filter(p => p.status === 'aktywny' || p.id === o.project_id).map(p => [p.id, `${p.order_no} · ${p.part_no} rev ${p.part_rev}`]), value: o.project_id, wide: true },
      { name: 'task_id', label: 'Zadanie z projektu (opcjonalnie)', type: 'select', options: tasksOf(o.project_id), value: o.task_id, wide: true },
      { name: 'title', label: 'Polecenie (puste = nazwa zadania)', value: o.title, wide: true },
      { name: 'details', label: 'Szczegóły: co dokładnie, na co uważać, narzędzia, oprawki', type: 'textarea', value: o.details, wide: true },
      { name: 'machine_id', label: 'Maszyna', type: 'select', options: machineOptions(), placeholder: '— inna praca (poza maszynami) —', value: o.id ? o.machine_id : ctx.machine_id },
      { name: 'planned_min', label: 'Przewidywany czas', type: 'hm', value: o.planned_min },
    ],
    onChange: (v, form) => {
      const sel = form.elements.task_id;
      if (sel.dataset.p !== String(v.project_id)) {
        sel.dataset.p = String(v.project_id);
        sel.innerHTML = '<option value="">— bez zadania —</option>' + tasksOf(v.project_id).map(([id, l]) => `<option value="${id}" ${id === o.task_id ? 'selected' : ''}>${esc(l)}</option>`).join('');
        const p = projects.find(x => x.id === v.project_id);
        if (!o.id && p && p.machine_id && !form.elements.machine_id.value && ctx.machine_id !== '') form.elements.machine_id.value = p.machine_id;
      }
    },
    submit: (v, idem) => {
      const body = { ...v, task_id: v.task_id ? Number(v.task_id) : null, employee_id: Number(v.employee_id) };
      return o.id ? post(`/work-orders/${o.id}`, body, idem, 'PATCH') : post('/work-orders', body, idem);
    },
  });
}

VIEWS.plan = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (isEmployee()) return myPlanView(main, q);
  const dQ = q.get('d') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dQ) ? dQ : S.me.today;
  const admin = isAdmin();
  const [plan, projects] = await Promise.all([api(`/work-orders/day?date=${date}`), admin ? api('/projects?status=aktywny') : Promise.resolve([])]);
  const link = (d) => `#/plan?d=${d}`;
  const cards = plan.employees.map(e => {
    const shiftTxt = e.shifts.length ? e.shifts.map(s => `${esc(s.name)} ${s.start}–${s.end}`).join(', ') : '<span class="muted">brak zmiany w grafiku</span>';
    const load = e.shift_min ? Math.min(150, e.load_pct) : 0;
    return `<section class="panel plan-col">
      <div class="plan-head">${person(e.employee_id)}<span class="small">${shiftTxt}</span>${e.absence ? tag(e.absence, 'warn', 'absence') : ''}</div>
      <div class="load ${e.load_pct > 100 ? 'over' : ''}" title="Plan poleceń wobec długości zmiany"><div class="track"><div class="fill" style="width:${Math.min(100, load)}%"></div></div>
        <span class="small">${hShort(e.planned_min)} z ${e.shift_min ? hShort(e.shift_min) : '—'}${e.load_pct !== null ? ` · ${e.load_pct}%` : ''}${e.unread ? ` · <b class="bad">nieprzeczytane: ${e.unread}</b>` : ''}</span></div>
      ${machineGroups(e.orders, { admin, employeeId: e.employee_id, date })}
    </section>`;
  }).join('');
  main.innerHTML = head('Plan pracy', `Polecenia na ${plDate(date)} (${DOW[weekday(date) - 1]}). Programista widzi swoje polecenia w aplikacji i potwierdza przeczytanie.`,
    `<a class="btn no-print" href="${link(addDays(date, -1))}">‹ Poprzedni</a><a class="btn no-print" href="${link(S.me.today)}">Dziś</a><a class="btn no-print" href="${link(addDays(date, 1))}">Następny ›</a>
     <label class="field no-print">Dzień<input type="date" id="pdate" value="${date}"></label>
     ${admin ? `<button class="no-print" id="carry">${icon('makeup')}Przenieś niewykonane z poprzedniego dnia</button>` : ''}<button class="no-print" id="pprint">${icon('print')}Drukuj</button>`) +
    `<h2 class="print-title">Plan pracy — ${plDate(date)}</h2><div class="plan-grid">${cards}</div>`;
  $('#pdate').onchange = (e) => { location.hash = link(e.target.value); };
  on('pprint', () => window.print());
  const all = plan.employees.flatMap(e => e.orders);
  const ctx = { date, projects };
  $$('[data-add-o]').forEach(b => b.onclick = () => orderForm({}, { ...ctx, employee_id: Number(b.dataset.addO), machine_id: b.dataset.machine }));
  $$('form[data-quick]').forEach(f => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const h = Number(String(f.elements.h.value || '').replace(',', '.'));
    const btnEl = $('button[type=submit]', f); btnEl.disabled = true;
    try { await post('/work-orders', { employee_id: Number(f.dataset.quick), work_date: f.dataset.date, title: f.elements.title.value.trim(), machine_id: null, planned_min: h > 0 ? Math.round(h * 60) : null }); }
    catch (err) { toast(describeError(err), 'err'); btnEl.disabled = false; }
  }));
  $$('[data-edit-o]').forEach(b => b.onclick = () => orderForm(all.find(o => o.id === Number(b.dataset.editO)), ctx));
  $$('[data-up]').forEach(b => b.onclick = () => post(`/work-orders/${b.dataset.up}/move`, { dir: 'up' }));
  $$('[data-down]').forEach(b => b.onclick = () => post(`/work-orders/${b.dataset.down}/move`, { dir: 'down' }));
  $$('[data-close-o]').forEach(b => b.onclick = () => {
    const o = all.find(x => x.id === Number(b.dataset.closeO));
    openForm({ title: `Ocena wykonania: ${o.title}`, fields: [
      { name: 'status', label: 'Wynik', type: 'select', placeholder: false, value: o.status === 'zaplanowane' ? 'wykonane' : o.status, options: [['wykonane', 'wykonane'], ['czesciowo', 'wykonane częściowo'], ['niewykonane', 'niewykonane'], ['zaplanowane', 'cofnij ocenę (do wykonania)']] },
      { name: 'result_note', label: 'Uwagi (przy częściowym / niewykonanym — co zostało lub dlaczego)', type: 'textarea', value: o.result_note, wide: true }],
    submit: (v, idem) => post(`/work-orders/${o.id}`, v, idem, 'PATCH') });
  });
  $$('[data-cancel-o]').forEach(b => b.onclick = () => confirmReason('Anuluj polecenie', 'Polecenie zostanie w historii jako anulowane.', r => post(`/work-orders/${b.dataset.cancelO}`, { status: 'anulowane', reason: r }, undefined, 'PATCH'), 'Anuluj polecenie'));
  on('carry', () => openForm({ title: 'Przenieś niewykonane polecenia', intro: '<p class="small">Polecenia „do wykonania”, „częściowo” i „niewykonane” z wybranego dnia zostaną dopisane na koniec listy w tym dniu (z odnośnikiem i uwagą o kontynuacji).</p>',
    fields: [{ name: 'from_date', label: 'Z dnia', type: 'date', value: addDays(date, -1), required: true }, { name: 'employee_id', label: 'Programista', type: 'select', options: empOptions(), placeholder: 'wszyscy' }],
    submitLabel: 'Przenieś', submit: async (v) => { const r = await api('/work-orders/carry-over', { method: 'POST', body: { ...v, to_date: date } }); toast(`Przeniesiono: ${r.copied}.`); setTimeout(rerender, 50); } }));
};

async function myPlanView(main, q) {
  const dQ = q.get('d') || '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dQ) ? dQ : S.me.today;
  const list = await api(`/work-orders/my?from=${date}&to=${addDays(date, 1)}`);
  const day = (d) => list.filter(o => o.work_date === d);
  const section = (d, label) => `<section class="panel"><h3>${esc(label)} — ${plDate(d)}</h3>${day(d).length ? machineGroups(day(d), { mine: true }) : '<p class="muted small">Brak poleceń na ten dzień.</p>'}</section>`;
  main.innerHTML = head('Moje polecenia', 'Polecenia od kierownika na zmianę. Potwierdź, że je przeczytałeś — kierownik to zobaczy.',
    `<a class="btn" href="#/plan?d=${addDays(date, -1)}">‹</a><a class="btn" href="#/plan">Dziś</a><a class="btn" href="#/plan?d=${addDays(date, 1)}">›</a>`) +
    section(date, date === S.me.today ? 'Dziś' : 'Dzień') + section(addDays(date, 1), 'Następny dzień');
  $$('[data-ack]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/work-orders/${b.dataset.ack}/ack`, { method: 'POST' }); toast('Potwierdzono.'); rerender(); } catch (e) { toast(e.message, 'err'); b.disabled = false; } });
}
