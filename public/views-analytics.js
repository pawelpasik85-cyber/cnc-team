// Widoki: analiza kierownika (miesiąc vs rok wcześniej, rok vs inne lata), przebieg projektu i podobne projekty,
// zapisane raporty (migawki) z udostępnianiem przełożonemu. Dane analizy — tylko kierownik.
'use strict';

const KPI_DIR = { tasks_done: 1, projects_done: 1, rework_min: -1, blocked_min: -1, tasks_diff_pct: -1, absence_min: -1, exits_min: -1, overtime_min: -1, worked_min: 0 };
function kpiVal(v, unit) {
  if (v === null || v === undefined) return '—';
  if (unit === 'min') return hShort(v);
  if (unit === '%') return `${v > 0 ? '+' : ''}${v}%`;
  return String(v);
}
function deltaChip(key, d, unit) {
  if (!d || d.diff === null) return '<span class="dchip">brak danych z roku wcześniej</span>';
  if (d.diff === 0) return '<span class="dchip">bez zmian</span>';
  const dir = KPI_DIR[key] || 0;
  const better = dir === 0 ? null : (d.diff > 0) === (dir > 0);
  const arrow = d.diff > 0 ? '▲' : '▼';
  const diffTxt = unit === 'min' ? `${d.diff > 0 ? '+' : '−'}${hShort(Math.abs(d.diff))}` : unit === '%' ? `${d.diff > 0 ? '+' : ''}${d.diff} pkt %` : `${d.diff > 0 ? '+' : ''}${d.diff}`;
  return `<span class="dchip ${better === null ? '' : better ? 'good' : 'bad'}">${arrow} ${esc(diffTxt)}${d.pct !== null && unit !== '%' ? ` (${d.pct > 0 ? '+' : ''}${d.pct}%)` : ''}${better === null ? '' : better ? ' · lepiej' : ' · gorzej'}</span>`;
}
const hoursFmt = (v) => `${Math.round(v * 10) / 10} h`;
const toH = (m) => (m === null || m === undefined ? null : Math.round((m / 60) * 10) / 10);

// ---------- Renderery (używane w widoku na żywo i w zapisanym raporcie) ----------
function renderMonth(d) {
  const cur = d.current, prev = d.previous;
  const y1 = cur.year_month.slice(0, 4), y0 = prev.year_month.slice(0, 4);
  const tiles = d.kpi.map(k => `<div class="kpi"><span>${esc(k.label)}</span><b>${kpiVal(d.current_kpi[k.key], k.unit)}</b>
      <small>rok wcześniej: ${kpiVal(d.previous_kpi[k.key], k.unit)}</small>${deltaChip(k.key, d.delta[k.key], k.unit)}</div>`).join('');
  const cats = [['Przepracowane', 'worked_min'], ['Poprawki', 'rework_min'], ['Blokady', 'blocked_min'], ['Nieobecności', 'absence_min'], ['Wyjścia', 'exits_min'], ['Nadgodziny', 'overtime_min']];
  const chart = svgBarChart({ title: `Godziny: ${plMonth(cur.year_month)} wobec ${plMonth(prev.year_month)}`, categories: cats.map(c => c[0]), fmt: hoursFmt,
    series: [{ name: plMonth(prev.year_month), color: yearColor(y0), values: cats.map(c => toH(d.previous_kpi[c[1]])) },
      { name: plMonth(cur.year_month), color: yearColor(y1), values: cats.map(c => toH(d.current_kpi[c[1]])) }] });
  const machines = [...new Set([...cur.by_machine, ...prev.by_machine].map(m => m.machine_id))];
  const mrow = (list, id) => list.find(m => m.machine_id === id);
  const machineTable = table([
    { key: id => id, label: 'Maszyna', fmt: id => { const m = mrow(cur.by_machine, id) || mrow(prev.by_machine, id); return id === '-' ? 'bez maszyny' : machineChip(m); } },
    { key: id => (mrow(cur.by_machine, id) || {}).worked_min ?? 0, label: plMonth(cur.year_month), fmt: hShort },
    { key: id => (mrow(prev.by_machine, id) || {}).worked_min ?? 0, label: plMonth(prev.year_month), fmt: hShort },
  ], machines, { empty: 'Brak czasu pracy na projektach w obu miesiącach.' });
  const emps = [...new Set([...cur.by_employee, ...prev.by_employee].map(e => e.employee_id))];
  const erow = (list, id) => list.find(e => e.employee_id === id) || {};
  const empTable = table([
    { key: id => erow(cur.by_employee, id).name || erow(prev.by_employee, id).name, label: 'Osoba' },
    { key: id => erow(cur.by_employee, id).worked_min ?? 0, label: `Przepracowane ${cur.year_month}`, fmt: hShort },
    { key: id => erow(prev.by_employee, id).worked_min ?? 0, label: `Przepracowane ${prev.year_month}`, fmt: hShort },
    { key: id => erow(cur.by_employee, id).rework_min ?? 0, label: `Poprawki ${cur.year_month}`, fmt: hShort },
  ], emps, { empty: 'Brak wpisów czasu.' });
  return `<div class="kpis">${tiles}</div>
    <section class="panel">${chart}</section>
    <div class="cols-2"><section class="panel"><h3>Maszyny</h3>${machineTable}</section><section class="panel"><h3>Ludzie</h3>${empTable}</section></div>
    <section class="panel"><h3>Zakończone projekty</h3><p class="small">${plMonth(cur.year_month)}: ${cur.projects_done.map(p => `<span class="mono">${esc(p.order_no)}</span> ${esc(p.part_no)}`).join(', ') || 'brak'}<br>
      ${plMonth(prev.year_month)}: ${prev.projects_done.map(p => `<span class="mono">${esc(p.order_no)}</span> ${esc(p.part_no)}`).join(', ') || 'brak'}</p>
      <p class="small muted">Zakończone zadania ${cur.year_month}: ${cur.tasks.done} (z planem ${cur.tasks.with_plan}: plan ${hShort(cur.tasks.planned_min)}, wykonanie ${hShort(cur.tasks.worked_min)}).
      Przepracowane = aktywna praca + weryfikacja + poprawki; nieobecności wg grafiku (wpisy na przełomie miesięcy proporcjonalnie do dni).</p></section>`;
}

function renderYear(d, metric = 'worked_min') {
  const k = d.kpi.find(x => x.key === metric) || d.kpi[0];
  const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  const chart = svgLineChart({
    title: `${k.label} — miesiące`, labels: months, labelEvery: 1,
    fmt: k.unit === 'min' ? hoursFmt : k.unit === '%' ? (v) => `${v}%` : (v) => String(v),
    series: d.years.map(y => ({ name: String(y.year), color: yearColor(y.year), values: y.months.map(m => (k.unit === 'min' ? toH(m[k.key]) : m[k.key])) })),
  });
  const base = d.years[0].year;
  const totals = table([
    { key: kk => kk.label, label: 'Wskaźnik' },
    ...d.years.map(y => ({ key: kk => kpiVal(y.totals[kk.key], kk.unit), label: String(y.year) })),
    ...d.delta_vs.map(dv => ({ key: kk => kk, label: `${base} wobec ${dv.year}`, fmt: kk => deltaChip(kk.key, dv.delta[kk.key], kk.unit) })),
  ], d.kpi);
  return `<section class="panel">${chart}</section><section class="panel"><h3>Sumy roczne</h3>${totals}
    <p class="small muted">Odchylenie od planu liczone z sum zakończonych zadań w roku. „Lepiej/gorzej” — mniej poprawek, blokad, nieobecności i nadgodzin oraz więcej zakończonych zadań to „lepiej”.</p></section>`;
}

function processCharts(pr) {
  const s = pr.summary;
  const th = machineTheme({ id: s.machine_id, axes: s.axes });
  const labels = pr.series.map(x => `${x.date.slice(8, 10)}.${x.date.slice(5, 7)}`);
  const hours = svgLineChart({
    title: 'Godziny narastająco: wykonanie wobec planu', labels, fmt: hoursFmt,
    series: [{ name: 'Przepracowano narastająco', color: 'var(--m-mid)', values: pr.series.map(x => toH(x.cum_min)) },
      ...(s.planned_min ? [{ name: 'Plan liniowo do terminu', color: 'var(--c-ink-soft)', dash: '5 4', values: pr.series.map(x => toH(x.plan_cum_min)) }] : [])],
  });
  const prog = svgLineChart({
    title: 'Postęp (wagi zakończonych zadań) wobec planu na dzień', labels, fmt: (v) => `${v}%`, yMax: 100, yMin: 0, step: true,
    series: [{ name: 'Postęp', color: 'var(--m-mid)', values: pr.series.map(x => x.progress_pct) },
      { name: 'Plan na dzień', color: 'var(--c-ink-soft)', dash: '5 4', values: pr.series.map(x => x.plan_progress_pct) }],
  });
  const maxT = Math.max(1, ...pr.tasks.map(t => Math.max(t.planned_min || 0, t.worked_min || 0)));
  const taskBars = pr.tasks.map(t => `<div class="pa-row"><span class="pa-name">${esc(t.title)}<small>${esc(t.type)}${t.completed_date ? ` · zakończone ${plDate(t.completed_date)}` : ` · ${esc(t.status)}`}</small></span>
    <div class="pa-bars"><div class="pa-plan" style="width:${((t.planned_min || 0) / maxT) * 100}%" title="Plan"></div><div class="pa-act ${t.diff_min > 0 ? 'over' : ''}" style="width:${(t.worked_min / maxT) * 100}%" title="Wykonanie"></div></div>
    <span class="pa-val">${hShort(t.worked_min)} / ${t.planned_min != null ? hShort(t.planned_min) : 'bez planu'}${t.diff_min ? `<br><b class="${t.diff_min > 0 ? 'bad' : 'good'}">${t.diff_min > 0 ? '+' : '−'}${hShort(Math.abs(t.diff_min))}</b>` : ''}</span></div>`).join('');
  const sum = `<div class="kpis">
      <div class="kpi"><span>Czas trwania</span><b>${s.duration_days ?? '—'} dni</b><small>${plDate(s.start_date)} – ${s.finish_date ? plDate(s.finish_date) : 'w toku'}</small></div>
      <div class="kpi"><span>Wobec terminu</span><b>${s.due_delta_days === null ? '—' : s.due_delta_days > 0 ? `+${s.due_delta_days} dni` : s.due_delta_days < 0 ? `${s.due_delta_days} dni` : 'w terminie'}</b><small>termin ${plDate(s.due_date)}</small>${s.due_delta_days !== null ? `<span class="dchip ${s.due_delta_days > 0 ? 'bad' : 'good'}">${s.due_delta_days > 0 ? 'po terminie' : 'w terminie'}</span>` : ''}</div>
      <div class="kpi"><span>Godziny: wykonanie / plan</span><b>${hShort(s.worked_min)}</b><small>plan ${hShort(s.planned_min)}</small>${s.diff_pct !== null ? `<span class="dchip ${s.diff_pct > 0 ? 'bad' : 'good'}">${s.diff_pct > 0 ? '+' : ''}${s.diff_pct}% wobec planu</span>` : ''}</div>
      <div class="kpi"><span>Poprawki</span><b>${hShort(s.rework_min)}</b><small>${s.rework_share_pct ?? '—'}% przepracowanego czasu</small></div>
    </div>`;
  return `<div class="theme-${th}">${sum}${hours}${prog}
    <h3>Zadania: wykonanie wobec planu</h3><div class="pa">${taskBars}</div>
    <p class="small muted legend-line"><i class="pa-key plan"></i> plan <i class="pa-key act"></i> wykonanie <i class="pa-key over"></i> wykonanie ponad plan</p></div>`;
}

function similarSection(sim, { editable, projectId } = {}) {
  const b = sim.base;
  const rows = [{ ...b, self: true }, ...sim.similar];
  const th = machineTheme({ id: b.machine_id, axes: b.axes });
  const chart = svgBarChart({
    title: 'Przepracowane godziny: ten projekt i podobne', fmt: hoursFmt, highlight: 0,
    categories: rows.map(r => r.order_no).concat(sim.average ? ['średnia'] : []),
    series: [{ name: 'Godziny', color: (i) => (i === 0 ? 'var(--m-mid)' : 'var(--c-steel)'), values: rows.map(r => toH(r.worked_min)).concat(sim.average ? [toH(sim.average.worked_min)] : []) }],
  });
  const tbl = table([
    { key: r => r, label: 'Projekt', fmt: r => `${r.self ? '<b>ten projekt</b><br>' : ''}<a href="#/projekty/${encodeURIComponent(r.id)}"><span class="mono">${esc(r.order_no)}</span> ${esc(r.part_no)}</a><br>${machineChip(r)}` },
    { key: r => r, label: 'Dlaczego podobny', fmt: r => r.self ? '—' : `<span class="small">${esc((r.why || []).join('; '))}</span><br><span class="small muted">wynik ${r.score}</span>` },
    { key: 'worked_min', label: 'Przepracowano', fmt: hShort }, { key: 'planned_min', label: 'Plan', fmt: hShort },
    { key: 'diff_pct', label: 'Wobec planu', fmt: v => (v === null ? '—' : `<b class="${v > 0 ? 'bad' : 'good'}">${v > 0 ? '+' : ''}${v}%</b>`) },
    { key: 'duration_days', label: 'Dni', fmt: v => v ?? '—' }, { key: 'due_delta_days', label: 'Termin', fmt: v => (v === null ? '—' : v > 0 ? `<b class="bad">+${v} dni</b>` : `${v} dni`) },
    { key: 'rework_share_pct', label: 'Poprawki', fmt: v => (v === null ? '—' : `${v}%`) },
    ...(editable ? [{ key: r => r, label: '', fmt: r => (r.self ? '' : `<button class="link" data-reject-sim="${esc(r.id)}">Odrzuć propozycję</button>`) }] : []),
  ], rows);
  const avg = sim.average ? `<p class="small">Średnia ${sim.average.count} podobnych: ${hShort(sim.average.worked_min)} (wobec planu ${sim.average.diff_pct > 0 ? '+' : ''}${sim.average.diff_pct ?? '—'}%), ${sim.average.duration_days ?? '—'} dni. Ten projekt: ${hShort(b.worked_min)} (${b.diff_pct > 0 ? '+' : ''}${b.diff_pct ?? '—'}%), ${b.duration_days ?? '—'} dni.</p>` : '<p class="muted small">Brak podobnych zakończonych projektów (lub wszystkie propozycje odrzucone).</p>';
  const rej = sim.rejected.length ? `<details><summary class="small">Odrzucone propozycje (${sim.rejected.length})</summary>${table([
    { key: r => `${r.order_no} ${r.part_no}`, label: 'Projekt' }, { key: r => r.rejected.reason || '—', label: 'Powód' },
    { key: r => `${r.rejected.by || ''}, ${new Date(r.rejected.at).toLocaleDateString('pl-PL')}`, label: 'Kto, kiedy' },
    ...(editable ? [{ key: r => r, label: '', fmt: r => `<button class="link" data-restore-sim="${esc(r.id)}">Przywróć</button>` }] : []),
  ], sim.rejected)}</details>` : '';
  return `<div class="theme-${th}"><div class="cols-2"><div>${chart}</div><div>${avg}<p class="small muted">${esc(sim.rule)}</p></div></div>${tbl}${rej}</div>`;
}

function bindSimilar(projectId) {
  $$('[data-reject-sim]').forEach(b => b.onclick = () => openForm({
    title: 'Odrzuć propozycję porównania', intro: '<p class="small">Projekt nie będzie porównywany ani wliczany do średniej. Można to cofnąć.</p>',
    fields: [{ name: 'reason', label: 'Powód (np. inna technologia, inny materiał)', wide: true }], submitLabel: 'Odrzuć',
    submit: (v) => post(`/analytics/projects/${encodeURIComponent(projectId)}/similar/${encodeURIComponent(b.dataset.rejectSim)}/reject`, v),
  }));
  $$('[data-restore-sim]').forEach(b => b.onclick = () => post(`/analytics/projects/${encodeURIComponent(projectId)}/similar/${encodeURIComponent(b.dataset.restoreSim)}/restore`, {}));
}

// Sekcja w szczegółach projektu (tylko kierownik)
async function projectAnalysisSection(p) {
  const a = await api(`/analytics/projects/${encodeURIComponent(p.id)}`);
  const done = a.process.complete;
  return `<section class="panel analysis" id="analysis"><div class="page-head" style="margin:0"><div><h2 style="margin:0">Przebieg projektu i porównanie</h2>
      <p class="small muted">${done ? 'Projekt zakończony — pełny przebieg.' : 'Projekt w toku — przebieg do dziś; pełna analiza po zakończeniu wszystkich zadań.'} Widoczne tylko dla kierownika.</p></div>
      <div class="toolbar no-print"><button id="saveProjRep">${icon('download')}Zapisz jako raport</button></div></div>
    ${processCharts(a.process)}
    <h3>Podobne projekty</h3>${similarSection(a.similar, { editable: true, projectId: p.id })}</section>`;
}
function bindProjectAnalysis(p) {
  bindCharts(document.getElementById('analysis'));
  bindSimilar(p.id);
  on('saveProjRep', () => saveReportForm('projekt', p.id, `Przebieg projektu ${p.order_no} ${p.part_no}`));
}

// ---------- Zapis raportu ----------
function saveReportForm(kind, ref, title, extra = {}) {
  openForm({
    title: 'Zapisz raport', intro: '<p class="small">Raport zapisuje dane z tej chwili (późniejsze zmiany go nie zmienią). Znajdziesz go w Analiza → Zapisane raporty, gdzie możesz go wydrukować lub zapisać jako PDF.</p>',
    fields: [{ name: 'title', label: 'Tytuł', value: title, required: true, wide: true }, { name: 'note', label: 'Komentarz kierownika (wnioski, uwagi)', type: 'textarea', wide: true },
      { name: 'shared', label: 'Udostępnij przełożonemu (zobaczy ten raport w aplikacji)', type: 'checkbox', wide: true }],
    submitLabel: 'Zapisz raport',
    submit: async (v) => { await api('/saved-reports', { method: 'POST', body: { kind, ref, ...extra, ...v } }); toast('Raport zapisany.'); },
  });
}

// ---------- Widok „Analiza” ----------
VIEWS.analiza = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const admin = isAdmin();
  const tab = admin ? (q.get('t') || 'miesiac') : 'raporty';
  const tabs = admin ? [['miesiac', 'Miesiąc'], ['rok', 'Rok'], ['raporty', 'Zapisane raporty']] : [['raporty', 'Raporty od kierownika']];
  const tabsHtml = `<div class="tabs no-print">${tabs.map(([id, l]) => `<button class="${tab === id ? 'active' : ''}" data-at="${id}">${esc(l)}</button>`).join('')}</div>`;
  let body = '', tools = '';
  if (tab === 'miesiac') {
    const ym = q.get('ym') || S.me.today.slice(0, 7);
    const d = await api(`/analytics/month?ym=${ym}`);
    tools = `<label class="field no-print">Miesiąc<input type="month" id="amonth" value="${ym}"></label>
      <a class="btn no-print" href="/api/analytics/export.csv?kind=miesiac&ref=${ym}">${icon('download')}CSV</a><button id="aprint" class="no-print">${icon('print')}Drukuj / PDF</button><button id="asave" class="primary no-print">Zapisz jako raport</button>`;
    body = `<h2 class="print-title">${esc(plMonth(ym))} wobec ${esc(plMonth(d.previous.year_month))}</h2>${renderMonth(d)}`;
  } else if (tab === 'rok') {
    const year = q.get('y') || S.me.today.slice(0, 4);
    const compare = (q.get('c') || String(Number(year) - 1)).split(',').filter(Boolean);
    const metric = q.get('m') || 'worked_min';
    const d = await api(`/analytics/year?year=${year}&compare=${compare.join(',')}`);
    tools = `<label class="field no-print">Rok<select id="ayear">${d.available.map(y => `<option ${String(y) === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <fieldset class="field no-print years-pick"><legend>Porównaj z</legend>${d.available.filter(y => String(y) !== year).map(y => `<label class="inline"><input type="checkbox" value="${y}" ${compare.includes(String(y)) ? 'checked' : ''}> ${y}</label>`).join('') || '<span class="muted small">brak innych lat</span>'}</fieldset>
      <label class="field no-print">Wskaźnik<select id="ametric">${d.kpi.map(k => `<option value="${k.key}" ${k.key === metric ? 'selected' : ''}>${esc(k.label)}</option>`).join('')}</select></label>
      <a class="btn no-print" href="/api/analytics/export.csv?kind=rok&ref=${year}&compare=${compare.join(',')}">${icon('download')}CSV</a><button id="aprint" class="no-print">${icon('print')}Drukuj / PDF</button><button id="asave" class="primary no-print">Zapisz jako raport</button>`;
    body = `<h2 class="print-title">Rok ${esc(year)}${compare.length ? ` wobec ${compare.join(', ')}` : ''}</h2>${renderYear(d, metric)}`;
    main.dataset.yearCompare = JSON.stringify(compare);
  } else {
    const list = await api('/saved-reports');
    body = `<section class="panel">${table([
      { key: r => r, label: 'Raport', fmt: r => `<a href="#/raport/${r.id}"><b>${esc(r.title)}</b></a><br><span class="small muted">${esc({ projekt: 'Przebieg projektu', miesiac: 'Miesiąc', rok: 'Rok' }[r.kind])} · ${esc(r.ref)}</span>` },
      { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Zapisano' }, { key: 'author', label: 'Autor' },
      { key: r => r, label: 'Przełożony', fmt: r => (r.shared ? tag('udostępniony', 'ok') : tag('tylko kierownik', '', 'lock')) },
      ...(admin ? [{ key: r => r, label: '', fmt: r => `<button class="link" data-share="${r.id}" data-to="${r.shared ? 0 : 1}">${r.shared ? 'Cofnij udostępnienie' : 'Udostępnij przełożonemu'}</button> <button class="link" data-del="${r.id}">Usuń</button>` }] : []),
    ], list, { empty: admin ? 'Brak zapisanych raportów. Zapisz raport z widoku miesiąca, roku albo z przebiegu zakończonego projektu.' : 'Kierownik nie udostępnił jeszcze żadnego raportu.' })}</section>`;
  }
  main.innerHTML = head(admin ? 'Analiza i raporty' : 'Raporty od kierownika', admin ? 'Dane widoczne tylko dla Ciebie. Zapisz raport, aby wydrukować go lub udostępnić przełożonemu.' : 'Raporty udostępnione przez kierownika.', tools) + tabsHtml + body;
  bindCharts(main);
  $$('[data-at]').forEach(b => b.onclick = () => { location.hash = `#/analiza?t=${b.dataset.at}`; });
  const m = $('#amonth'); if (m) m.onchange = () => { location.hash = `#/analiza?t=miesiac&ym=${m.value}`; };
  const yearNav = () => {
    const y = $('#ayear').value, c = $$('.years-pick input:checked').map(i => i.value).join(','), mt = $('#ametric').value;
    location.hash = `#/analiza?t=rok&y=${y}&c=${c}&m=${mt}`;
  };
  if ($('#ayear')) { $('#ayear').onchange = yearNav; $('#ametric').onchange = yearNav; $$('.years-pick input').forEach(i => i.onchange = yearNav); }
  on('aprint', () => window.print());
  on('asave', () => {
    if (tab === 'miesiac') { const ym = $('#amonth').value; saveReportForm('miesiac', ym, `Miesiąc ${plMonth(ym)} wobec roku wcześniej`); }
    else { const y = $('#ayear').value, c = JSON.parse(main.dataset.yearCompare || '[]'); saveReportForm('rok', y, `Rok ${y}${c.length ? ` wobec ${c.join(', ')}` : ''}`, { compare: c }); }
  });
  $$('[data-share]').forEach(b => b.onclick = () => post(`/saved-reports/${b.dataset.share}`, { shared: b.dataset.to === '1' }, undefined, 'PATCH'));
  $$('[data-del]').forEach(b => b.onclick = () => confirmReason('Usuń raport', 'Raport zniknie z listy (wpis o usunięciu zostanie w historii).', () => api(`/saved-reports/${b.dataset.del}`, { method: 'DELETE' }).then(() => { toast('Usunięto.'); rerender(); }), 'Usuń'));
};

// Zapisany raport (migawka) — do druku / PDF
VIEWS.raport = async (main, rest) => {
  const r = await api(`/saved-reports/${Number(rest[0])}`);
  let body = '';
  if (r.kind === 'miesiac') body = renderMonth(r.data);
  else if (r.kind === 'rok') body = renderYear(r.data, 'worked_min');
  else body = `<section class="panel">${processCharts(r.data.process)}</section><section class="panel"><h3>Podobne projekty</h3>${similarSection(r.data.similar, { editable: false })}</section>`;
  main.innerHTML = head(r.title, `Zapisano ${new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })} · ${esc(r.author || '')} · dane z chwili zapisu`,
    `<a class="btn no-print" href="#/analiza?t=raporty">‹ Raporty</a><button id="rprint" class="primary no-print">${icon('print')}Drukuj / PDF</button>`) +
    (r.note ? `<section class="panel note-box"><h3>Komentarz kierownika</h3><p style="white-space:pre-wrap">${esc(r.note)}</p></section>` : '') + body;
  bindCharts(main);
  on('rprint', () => window.print());
};
