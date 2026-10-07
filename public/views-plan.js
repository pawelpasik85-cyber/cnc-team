// Widok „Plan pracy”: kierownik rozpisuje polecenia na dzień / zmianę; programista widzi swoje i potwierdza przeczytanie.
'use strict';

const ORDER_STATUS = { zaplanowane: ['do wykonania', 'accent'], wykonane: ['wykonane', 'ok'], czesciowo: ['częściowo', 'warn'], niewykonane: ['niewykonane', 'danger'], anulowane: ['anulowane', ''] };

function orderCard(o, { admin = false, mine = false } = {}) {
  const th = o.machine_id ? machineTheme({ id: o.machine_id, axes: o.axes }) : null;
  return `<li class="order ${o.status} ${th ? `theme-${th}` : ''}">
    <span class="seq">${o.seq}</span>
    <div class="o-body">
      <div class="o-title"><b>${esc(o.title)}</b> ${tag(...ORDER_STATUS[o.status])}${o.carried ? ` ${tag('przeniesione', '', 'makeup')}` : ''}</div>
      ${o.details ? `<p class="small o-details">${esc(o.details)}</p>` : ''}
      <div class="o-meta small">${o.project_id ? `<a href="#/projekty/${encodeURIComponent(o.project_id)}"><span class="mono">${esc(o.order_no)}</span> ${esc(o.part_no)}</a>` : ''}
        ${o.task_title && o.task_title !== o.title ? `· zadanie: ${esc(o.task_title)}` : ''} ${o.machine_id ? machineChip(o) : ''} ${o.planned_min ? `· ${icon('today')} ${hShort(o.planned_min)}` : ''}</div>
      ${o.result_note ? `<p class="small o-result">${icon('check')} ${esc(o.result_note)}${o.closed_by_name ? ` <span class="muted">— ${esc(o.closed_by_name)}</span>` : ''}</p>` : ''}
      <div class="o-ack small">${o.ack_at ? `${icon('check')} przeczytane ${new Date(o.ack_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : (o.status === 'zaplanowane' ? '<span class="unread">nieprzeczytane</span>' : '')}</div>
    </div>
    <div class="o-actions no-print">
      ${mine && !o.ack_at && o.status === 'zaplanowane' ? `<button class="primary" data-ack="${o.id}">${icon('check')}Potwierdzam przeczytanie</button>` : ''}
      ${admin && o.status !== 'anulowane' ? `
        ${o.status === 'zaplanowane' ? `<button class="link" data-up="${o.id}" aria-label="W górę">▲</button><button class="link" data-down="${o.id}" aria-label="W dół">▼</button><button class="link" data-edit-o="${o.id}">Edytuj</button>` : ''}
        <button class="link" data-close-o="${o.id}">${o.status === 'zaplanowane' ? 'Oceń wykonanie' : 'Zmień ocenę'}</button>
        <button class="link" data-cancel-o="${o.id}">Anuluj</button>` : ''}
    </div></li>`;
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
      { name: 'machine_id', label: 'Maszyna', type: 'select', options: machineOptions(), value: o.machine_id },
      { name: 'planned_min', label: 'Przewidywany czas', type: 'hm', value: o.planned_min },
    ],
    onChange: (v, form) => {
      const sel = form.elements.task_id;
      if (sel.dataset.p !== String(v.project_id)) {
        sel.dataset.p = String(v.project_id);
        sel.innerHTML = '<option value="">— bez zadania —</option>' + tasksOf(v.project_id).map(([id, l]) => `<option value="${id}" ${id === o.task_id ? 'selected' : ''}>${esc(l)}</option>`).join('');
        const p = projects.find(x => x.id === v.project_id);
        if (p && p.machine_id && !form.elements.machine_id.value) form.elements.machine_id.value = p.machine_id;
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
      <ol class="orders">${e.orders.map(o => orderCard(o, { admin })).join('') || '<li class="muted small empty-orders">Brak poleceń.</li>'}</ol>
      ${admin ? `<button class="no-print" data-add-o="${e.employee_id}">${icon('plus')}Polecenie</button>` : ''}
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
  $$('[data-add-o]').forEach(b => b.onclick = () => orderForm({}, { ...ctx, employee_id: Number(b.dataset.addO) }));
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
  const section = (d, label) => `<section class="panel"><h3>${esc(label)} — ${plDate(d)}</h3><ol class="orders">${day(d).map(o => orderCard(o, { mine: true })).join('') || '<li class="muted small empty-orders">Brak poleceń na ten dzień.</li>'}</ol></section>`;
  main.innerHTML = head('Moje polecenia', 'Polecenia od kierownika na zmianę. Potwierdź, że je przeczytałeś — kierownik to zobaczy.',
    `<a class="btn" href="#/plan?d=${addDays(date, -1)}">‹</a><a class="btn" href="#/plan">Dziś</a><a class="btn" href="#/plan?d=${addDays(date, 1)}">›</a>`) +
    section(date, date === S.me.today ? 'Dziś' : 'Dzień') + section(addDays(date, 1), 'Następny dzień');
  $$('[data-ack]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api(`/work-orders/${b.dataset.ack}/ack`, { method: 'POST' }); toast('Potwierdzono.'); rerender(); } catch (e) { toast(e.message, 'err'); b.disabled = false; } });
}
