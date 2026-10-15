// Analiza zespołu (tylko kierownik): programiści, detale (praca jednostkowa), struktura czasu — w wybranym okresie.
// Oraz „dokumenty” do zapisu PDF / PNG dla wszystkich widoków analizy i raportów kierowniczych.
'use strict';

const TEAM_TABS = { programisci: 'Programiści', detale: 'Detale — praca jednostkowa', struktura: 'Struktura czasu' };

function teamRange(q) {
  const today = S.me.today;
  const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  let from = ok(q.get('od')) ? q.get('od') : `${today.slice(0, 4)}-01-01`;
  let to = ok(q.get('do')) ? q.get('do') : today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}
function teamPresets(kind, r) {
  const t = S.me.today, y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  const ym = t.slice(0, 7), prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const q0 = Math.floor((m - 1) / 3) * 3 + 1;
  const presets = [
    ['Ten miesiąc', `${ym}-01`, t], ['Poprzedni miesiąc', `${prevYm}-01`, lastDay(prevYm)],
    ['Ten kwartał', `${y}-${String(q0).padStart(2, '0')}-01`, t], ['Ten rok', `${y}-01-01`, t], ['Poprzedni rok', `${y - 1}-01-01`, `${y - 1}-12-31`],
  ];
  return `<div class="range-presets no-print">${presets.map(([l, f, d]) => `<a class="chip ${r.from === f && r.to === d ? 'active' : ''}" href="#/analiza?t=${kind}&od=${f}&do=${d}">${esc(l)}</a>`).join('')}</div>`;
}
const plForm = (n, one, few, many) => `${n} ${n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many}`;
const periodTxt = (r) => `${plDate(r.from)} – ${plDate(r.to)}`;
const mColor = (id) => rxMachineColor(S.boot.machines.find(m => m.id === id) || { id });
const signPct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`);
const pctPl = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);
const dniPlF = (n) => (n === null || n === undefined ? '—' : plForm(n, 'dzień', 'dni', 'dni'));
const planTone = (v) => (v === null || v === undefined ? '' : v > 10 ? 'bad' : v <= 0 ? 'good' : '');

async function teamTab(kind, q) {
  const r = teamRange(q);
  const d = await api(`/analytics/team?kind=${kind}&from=${r.from}&to=${r.to}`);
  const tools = `<form class="toolbar no-print" id="teamRange"><label class="field">Od<input type="date" name="od" value="${r.from}"></label><label class="field">Do<input type="date" name="do" value="${r.to}"></label><button class="primary">Pokaż</button></form>`;
  const head2 = `${teamPresets(kind, r)}<h2 class="print-title">${esc(TEAM_TABS[kind])} · ${periodTxt(r)}</h2>`;
  const out = kind === 'programisci' ? teamProgrammers(d, r) : kind === 'detale' ? teamParts(d, r) : teamStructure(d, r);
  return { tools, body: head2 + out.html, doc: out.doc, bind: (main) => {
    const f = $('#teamRange', main);
    if (f) f.onsubmit = (e) => { e.preventDefault(); location.hash = `#/analiza?t=${kind}&od=${f.od.value}&do=${f.do.value}`; };
  } };
}

// ---------- Programiści ----------
function teamProgrammers(d, r) {
  const ms = d.machines;
  const rows = d.rows;
  const tiles = rows.map(p => `<div class="kpi person-kpi"><span>${person(p.employee_id)}</span><b>${hShort(p.worked_min)}</b>
    <small>${pctPl(p.share_pct ?? 0)} czasu zespołu · ${p.projects} proj. · ${plForm(p.days, 'dzień', 'dni', 'dni')} z pracą${p.active ? '' : ' · nie pracuje'}</small>
    <span class="dchip ${planTone(p.plan_diff_pct)}">${p.plan_diff_pct === null ? 'brak zakończonych zadań z planem' : `plan ${signPct(p.plan_diff_pct)} na ${p.tasks_with_plan} zad.`}</span></div>`).join('');
  const names = rows.map(p => p.name.split(' ')[0]);
  const hoursChart = svgBar3d({ title: 'Godziny na projektach — maszyny', categories: names, series: ms.map(m => ({ name: m.name, tone: machineTheme(m), values: rows.map(p => toH((p.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)) })), fmt: (v) => String(Math.round(v)), unit: ' h', height: 280 });
  const planChart = svgBarChart({ title: 'Zakończone zadania: plan wobec wykonania (godziny)', categories: names, fmt: hoursFmt,
    series: [{ name: 'Plan', color: 'var(--c-steel)', values: rows.map(p => toH(p.planned_min)) }, { name: 'Wykonanie', color: 'var(--c-accent)', values: rows.map(p => toH(p.actual_on_plan_min)) }] });
  const tbl = table([
    { key: r2 => r2, label: 'Osoba', fmt: p => person(p.employee_id) },
    { key: 'worked_min', label: 'Godziny', fmt: hShort },
    ...ms.map(m => ({ key: p => (p.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0, label: m.name, fmt: hShort })),
    { key: 'share_pct', label: 'Udział', fmt: v => pctPl(v ?? 0) }, { key: 'projects', label: 'Projekty' },
    { key: 'tasks_done', label: 'Zadania zakończone' },
    { key: p => p, label: 'Plan / wykonanie', fmt: p => (p.planned_min ? `${hShort(p.planned_min)} / ${hShort(p.actual_on_plan_min)}` : '—') },
    { key: 'plan_diff_pct', label: 'Wobec planu', fmt: v => (v === null ? '—' : `<b class="${planTone(v)}">${signPct(v)}</b>`) },
    { key: 'rework_share_pct', label: 'Poprawki', fmt: pctPl },
    { key: 'blocked_min', label: 'Blokady', fmt: hShort }, { key: 'avg_task_min', label: 'Średnio / zadanie', fmt: v => (v === null ? '—' : hShort(v)) },
  ], rows, { empty: 'Brak pracy na projektach w wybranym okresie.' });
  const html = `<div class="kpis">${tiles || '<div class="empty">Brak danych.</div>'}</div>
    <div class="cols"><section class="panel">${hoursChart}</section><section class="panel">${planChart}</section></div>
    <section class="panel"><h3>Zestawienie</h3>${tbl}
      <p class="small muted">Godziny = aktywna praca + weryfikacja i uruchomienie + poprawki na projektach (wg wpisów czasu w okresie). „Wobec planu” — zadania zakończone w okresie przez osobę przypisaną: cały czas na zadaniu wobec planu. Zadania różnią się trudnością i maszyną (3X / 5X) — to materiał do rozmowy i planowania, nie ocena bez kontekstu.</p></section>`;
  const doc = () => ({
    title: 'Analiza: programiści', subtitle: periodTxt(r), file: `analiza-programisci-${r.from}-${r.to}`,
    blocks: [
      { t: 'kpis', items: rows.map(p => ({ label: p.name, value: rxH(p.worked_min), sub: p.plan_diff_pct === null ? `${pctPl(p.share_pct ?? 0)} czasu zespołu` : `plan ${signPct(p.plan_diff_pct)} · ${pctPl(p.share_pct ?? 0)} zespołu`, tone: planTone(p.plan_diff_pct), color: RX.series[rows.indexOf(p) % 6] })) },
      { t: 'bars', title: 'Godziny na projektach — maszyny', categories: names, fmt: rxHfmt, series: ms.map(m => ({ name: m.name, color: rxMachineColor(m), values: rows.map(p => rxHours((p.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)) })) },
      { t: 'bars', title: 'Zakończone zadania: plan wobec wykonania', categories: names, fmt: rxHfmt, series: [{ name: 'Plan', color: '#8a949e', values: rows.map(p => rxHours(p.planned_min)) }, { name: 'Wykonanie', color: RX.orange, values: rows.map(p => rxHours(p.actual_on_plan_min)) }] },
      { t: 'table', title: 'Zestawienie', head: ['Osoba', 'Godziny', ...ms.map(m => m.name), 'Zadania', 'Wobec planu', 'Poprawki', 'Śr./zad.'], widths: [0.22, 0.12, ...ms.map(() => 0.12), 0.1, 0.12, 0.1, 0.1],
        rows: rows.map(p => [p.name, rxH(p.worked_min), ...ms.map(m => rxH((p.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)), String(p.tasks_done), { text: signPct(p.plan_diff_pct), tone: planTone(p.plan_diff_pct) }, rxPct(p.rework_share_pct), rxH(p.avg_task_min)]) },
      { t: 'text', small: true, muted: true, text: 'Godziny = aktywna praca + weryfikacja i uruchomienie + poprawki. „Wobec planu” — zadania zakończone w okresie przez osobę przypisaną. Zadania różnią się trudnością i maszyną — materiał do rozmowy i planowania.' },
    ] });
  return { html, doc };
}

// ---------- Detale: praca jednostkowa ----------
function teamParts(d, r) {
  const t = d.total;
  const kp = (label, value, sub, cls = '') => `<div class="kpi"><span>${esc(label)}</span><b>${value}</b><small>${sub}</small>${cls}</div>`;
  const kpis = `<div class="kpis">
    ${kp('Zakończone detale', String(t.count), 'projekty zakończone w okresie')}
    ${kp('Średnio na detal', hShort(t.avg_worked_min), `plan średnio ${hShort(t.avg_planned_min)}`, `<span class="dchip ${planTone(t.plan_diff_pct)}">${signPct(t.plan_diff_pct)} wobec planu</span>`)}
    ${kp('Czas realizacji', dniPlF(t.avg_duration_days), 'średnio od rozpoczęcia do zakończenia')}
    ${kp('W terminie', pctPl(t.on_time_pct), 'projekty z terminem', `<span class="dchip ${t.on_time_pct === null ? '' : t.on_time_pct >= 90 ? 'good' : t.on_time_pct < 75 ? 'bad' : ''}">${t.on_time_pct === null ? 'brak terminów' : t.on_time_pct >= 90 ? 'dobrze' : t.on_time_pct < 75 ? 'do poprawy' : 'uwaga'}</span>`)}
    ${kp('Poprawki', pctPl(t.rework_share_pct), 'udział poprawek w czasie detali', `<span class="dchip ${t.returns ? 'bad' : ''}">${plForm(t.returns, 'powrót', 'powroty', 'powrotów')} do poprawek</span>`)}
  </div>`;
  const mtiles = `<div class="mo-tiles">${d.machines.map(m => `<article class="mo-tile theme-${machineTheme(m)}"><div class="mo-name">${machineEmblem(machineTheme(m), 52)}</div>
      <div class="mo-num"><b>${m.count}</b><span>${esc(m.name)} — zakończone detale</span><br><span class="dchip">${m.on_time_pct === null ? 'brak terminów' : `${m.on_time_pct}% w terminie`}</span></div>
      <div class="mo-num"><b>${hShort(m.avg_worked_min)}</b><span>średnio na detal · ${dniPlF(m.avg_duration_days)}</span><br><span class="dchip ${planTone(m.plan_diff_pct)}">${signPct(m.plan_diff_pct)} wobec planu</span></div></article>`).join('')}</div>`;
  const gl = d.groups.map(g => `${g.part_family} · ${g.machine_name || 'bez maszyny'}`);
  const famChart = svgBarChart({ title: 'Rodziny detali: średnio godzin na detal — plan i wykonanie', categories: gl, fmt: hoursFmt,
    series: [{ name: 'Plan', color: 'var(--c-steel)', values: d.groups.map(g => toH(g.avg_planned_min)) }, { name: 'Wykonanie', color: 'var(--c-accent)', values: d.groups.map(g => toH(g.avg_worked_min)) }] });
  const last = d.rows.slice(-16);
  const projChart = svgBarChart({ title: `Ostatnie detale: plan i wykonanie (${last.length})`, categories: last.map(p => p.order_no.slice(-4)), fmt: hoursFmt,
    series: [{ name: 'Plan', color: 'var(--c-steel)', values: last.map(p => toH(p.planned_min)) }, { name: 'Wykonanie', color: (i) => mColor(last[i] && last[i].machine_id), values: last.map(p => toH(p.worked_min)) }] });
  const gt = table([
    { key: g => g, label: 'Rodzina · maszyna', fmt: g => `<b>${esc(g.part_family)}</b><br>${machineChip(g)}` }, { key: 'count', label: 'Detali' },
    { key: 'avg_worked_min', label: 'Średnio godzin', fmt: hShort }, { key: 'avg_planned_min', label: 'Średnio plan', fmt: v => (v === null ? '—' : hShort(v)) },
    { key: 'plan_diff_pct', label: 'Wobec planu', fmt: v => `<b class="${planTone(v)}">${signPct(v)}</b>` }, { key: 'avg_duration_days', label: 'Dni realizacji', fmt: v => v ?? '—' },
    { key: 'on_time_pct', label: 'W terminie', fmt: pctPl }, { key: 'rework_share_pct', label: 'Poprawki', fmt: pctPl },
  ], d.groups, { empty: 'Brak zakończonych detali w okresie.' });
  const rt = table([
    { key: p => p, label: 'Detal', fmt: p => `<a href="#/projekty/${encodeURIComponent(p.id)}"><span class="mono">${esc(p.order_no)}</span> ${esc(p.part_no)}</a><br><span class="small muted">${esc(p.part_family)}</span>` },
    { key: p => p, label: 'Maszyna', fmt: p => machineChip(p) }, { key: 'finish_date', label: 'Zakończono', fmt: 'date' },
    { key: 'worked_min', label: 'Godziny', fmt: hShort }, { key: 'planned_min', label: 'Plan', fmt: v => (v === null ? '—' : hShort(v)) },
    { key: 'diff_pct', label: 'Wobec planu', fmt: v => `<b class="${planTone(v)}">${signPct(v)}</b>` }, { key: 'duration_days', label: 'Dni' },
    { key: 'due_delta_days', label: 'Termin', fmt: v => (v === null ? '—' : v > 0 ? `<b class="bad">+${v} dni</b>` : 'w terminie') },
    { key: 'rework_share_pct', label: 'Poprawki', fmt: pctPl },
    { key: 'returns_count', label: 'Powroty', fmt: v => (v ? `<b class="bad">${v}</b>` : '—') },
  ], [...d.rows].reverse(), { empty: 'Brak zakończonych detali w okresie.' });
  const techRows = d.tech.filter(x => x.nx || x.est || x.act);
  const tech = techRows.length ? `<section class="panel"><h3>Czasy maszyny: CAM (NX), przewidywany i rzeczywisty</h3>${table([
    { key: x => d.rows.find(p => p.id === x.project_id), label: 'Detal', fmt: p => (p ? `<span class="mono">${esc(p.order_no)}</span> ${esc(p.part_no)}` : '—') },
    { key: 'nx', label: 'Czas NX', fmt: v => (v == null ? '—' : hShort(v)) }, { key: 'est', label: 'Przewidywany maszyny', fmt: v => (v == null ? '—' : hShort(v)) },
    { key: 'act', label: 'Rzeczywisty maszyny', fmt: v => (v == null ? '—' : hShort(v)) },
    { key: x => (x.act_with_est != null && x.est_with_act ? Math.round(((x.act_with_est - x.est_with_act) / x.est_with_act) * 100) : null), label: 'Rzeczywisty wobec przewidywanego', fmt: v => `<b class="${planTone(v)}">${signPct(v)}</b>` },
  ], techRows)}</section>` : '';
  const html = `${kpis}${mtiles}
    <section class="panel">${projChart}</section>
    <section class="panel"><h3>Rodziny detali na maszynach</h3>${gt}${famChart}</section>
    <section class="panel"><h3>Detale zakończone w okresie</h3>${rt}
      <p class="small muted">Detal = projekt (zlecenie, detal, rewizja). Godziny i dni liczone dla pierwotnej realizacji — powroty do poprawek pokazane osobno. „W terminie” — zakończenie nie później niż termin projektu.</p></section>${tech}`;
  const doc = () => ({
    title: 'Analiza: detale — praca jednostkowa', subtitle: periodTxt(r), file: `analiza-detale-${r.from}-${r.to}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Zakończone detale', value: String(t.count), sub: 'w okresie' },
        { label: 'Średnio na detal', value: rxH(t.avg_worked_min), sub: `${signPct(t.plan_diff_pct)} wobec planu`, tone: planTone(t.plan_diff_pct) },
        { label: 'Czas realizacji', value: dniPlF(t.avg_duration_days), sub: 'średnio' },
        { label: 'W terminie', value: t.on_time_pct === null ? '—' : `${t.on_time_pct}%`, sub: `poprawki ${rxPct(t.rework_share_pct)}` },
      ] },
      { t: 'kpis', per: 2, items: d.machines.map(m => ({ label: `${m.name} ${m.axes}X`, value: `${plForm(m.count, 'detal', 'detale', 'detali')} · ${rxH(m.avg_worked_min)}`, big: false, sub: `${signPct(m.plan_diff_pct)} wobec planu · ${dniPlF(m.avg_duration_days)} · w terminie ${pctPl(m.on_time_pct)}`, tone: planTone(m.plan_diff_pct), color: rxMachineColor(m) })) },
      { t: 'bars', title: 'Rodziny detali: średnio godzin na detal', categories: gl, fmt: rxHfmt, series: [{ name: 'Plan', color: '#8a949e', values: d.groups.map(g => rxHours(g.avg_planned_min)) }, { name: 'Wykonanie', color: RX.orange, values: d.groups.map(g => rxHours(g.avg_worked_min)) }] },
      { t: 'table', title: 'Rodziny detali na maszynach', head: ['Rodzina · maszyna', 'Detali', 'Średnio', 'Plan', 'Wobec planu', 'Dni', 'W terminie'], widths: [0.3, 0.09, 0.13, 0.13, 0.13, 0.09, 0.13],
        rows: d.groups.map(g => [`${g.part_family} · ${g.machine_name || '—'}`, String(g.count), rxH(g.avg_worked_min), rxH(g.avg_planned_min), { text: signPct(g.plan_diff_pct), tone: planTone(g.plan_diff_pct) }, String(g.avg_duration_days ?? '—'), g.on_time_pct === null ? '—' : `${g.on_time_pct}%`]) },
      { t: 'table', title: 'Detale zakończone w okresie', head: ['Detal', 'Maszyna', 'Zakończono', 'Godziny', 'Plan', 'Wobec planu', 'Termin'], widths: [0.27, 0.12, 0.13, 0.12, 0.12, 0.12, 0.12],
        rows: [...d.rows].reverse().map(p => [`${p.order_no} ${p.part_no}`, p.machine_name || '—', plDate(p.finish_date), rxH(p.worked_min), rxH(p.planned_min), { text: signPct(p.diff_pct), tone: planTone(p.diff_pct) }, p.due_delta_days === null ? '—' : p.due_delta_days > 0 ? { text: `+${p.due_delta_days} dni`, tone: 'bad' } : 'w terminie']) },
    ] });
  return { html, doc };
}

// ---------- Struktura czasu ----------
function teamStructure(d, r) {
  const k = d.kinds, tot = Math.max(1, k.worked_min);
  const share = (v) => `${Math.round((v / tot) * 100)}%`;
  const kpis = `<div class="kpis">
    <div class="kpi"><span>Przepracowane na projektach</span><b>${hShort(k.worked_min)}</b><small>aktywna praca + weryfikacja + poprawki</small></div>
    <div class="kpi"><span>Aktywna praca</span><b>${hShort(k.active_min)}</b><small>${share(k.active_min)} czasu</small></div>
    <div class="kpi"><span>Wpisy „weryfikacja”</span><b>${hShort(k.verify_min)}</b><small>${share(k.verify_min)} czasu</small></div>
    <div class="kpi"><span>Poprawki</span><b>${hShort(k.rework_min)}</b><small>${share(k.rework_min)} czasu</small>${k.rework_min / tot > 0.1 ? '<span class="dchip bad">ponad 10% czasu</span>' : ''}</div>
    <div class="kpi"><span>Blokady i oczekiwanie</span><b>${hShort(k.blocked_min)}</b><small>poza czasem pracy na projekcie${k.unassigned_min ? ` · nieprzypisany ${hShort(k.unassigned_min)}` : ''}</small></div>
  </div>`;
  const types = d.types.filter(t => t.worked_min > 0);
  const typeChart = svgBar3d({ title: 'Typy zadań: godziny na maszynach', categories: types.map(t => t.name.length > 16 ? `${t.name.slice(0, 15)}…` : t.name),
    series: d.machines.map(m => ({ name: m.name, tone: machineTheme(m), values: types.map(t => toH((t.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)) })), fmt: (v) => String(Math.round(v)), unit: ' h', height: 300 });
  const phaseChart = svgBarChart({ title: 'Przygotowanie programu i wykonanie detalu — maszyny', categories: d.phases.map(p => `${p.name} ${p.axes}X`), fmt: hoursFmt,
    series: [{ name: 'Przygotowanie', color: 'var(--series-1)', values: d.phases.map(p => toH(p.przygotowanie_min)) }, { name: 'Wykonanie', color: 'var(--series-2)', values: d.phases.map(p => toH(p.wykonanie_min)) }] });
  const tt = table([
    { key: 'name', label: 'Typ zadania' }, { key: 'phase', label: 'Etap' },
    ...d.machines.map(m => ({ key: t => (t.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0, label: m.name, fmt: hShort })),
    { key: 'worked_min', label: 'Razem', fmt: v => `<b>${hShort(v)}</b>` }, { key: 'worked_min', label: 'Udział', fmt: v => share(v) },
    { key: 'rework_min', label: 'w tym poprawki', fmt: hShort }, { key: 'blocked_min', label: 'Blokady', fmt: hShort },
  ], types, { empty: 'Brak wpisów czasu w okresie.' });
  const ct = table([{ key: 'label', label: 'Przyczyna' }, { key: 'rework_min', label: 'Poprawki', fmt: hShort }, { key: 'blocked_min', label: 'Blokady i oczekiwanie', fmt: hShort }],
    d.causes, { empty: 'Brak poprawek i blokad w okresie.' });
  const html = `${kpis}<div class="cols"><section class="panel">${typeChart}</section><section class="panel">${phaseChart}</section></div>
    <section class="panel"><h3>Typy zadań</h3>${tt}</section>
    <section class="panel"><h3>Poprawki i blokady wg przyczyn</h3>${ct}<p class="small muted">Przyczyny wpisywane przy czasie poprawek i blokad. „Bez przyczyny” — wpisy bez wskazanej przyczyny; warto je uzupełniać, bo pokazują, co naprawdę zabiera czas.</p></section>`;
  const doc = () => ({
    title: 'Analiza: struktura czasu', subtitle: periodTxt(r), file: `analiza-struktura-czasu-${r.from}-${r.to}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Przepracowane', value: rxH(k.worked_min), sub: 'na projektach' },
        { label: 'Aktywna praca', value: share(k.active_min), sub: rxH(k.active_min) },
        { label: 'Wpisy „weryfikacja”', value: share(k.verify_min), sub: rxH(k.verify_min) },
        { label: 'Poprawki', value: share(k.rework_min), sub: `blokady ${rxH(k.blocked_min)}`, tone: k.rework_min / tot > 0.1 ? 'bad' : '' },
      ] },
      { t: 'bars', title: 'Typy zadań: godziny na maszynach', categories: types.map(t => t.name), fmt: rxHfmt, series: d.machines.map(m => ({ name: m.name, color: rxMachineColor(m), values: types.map(t => rxHours((t.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)) })) },
      { t: 'bars', title: 'Przygotowanie programu i wykonanie detalu', categories: d.phases.map(p => `${p.name} ${p.axes}X`), fmt: rxHfmt, series: [{ name: 'Przygotowanie', color: RX.blue, values: d.phases.map(p => rxHours(p.przygotowanie_min)) }, { name: 'Wykonanie', color: RX.orange, values: d.phases.map(p => rxHours(p.wykonanie_min)) }] },
      { t: 'table', title: 'Typy zadań', head: ['Typ zadania', ...d.machines.map(m => m.name), 'Razem', 'Udział', 'Poprawki'], widths: [0.32, ...d.machines.map(() => 0.14), 0.14, 0.1, 0.14],
        rows: types.map(t => [t.name, ...d.machines.map(m => rxH((t.by_machine.find(x => x.machine_id === m.id) || {}).worked_min || 0)), rxH(t.worked_min), share(t.worked_min), rxH(t.rework_min)]) },
      { t: 'table', title: 'Poprawki i blokady wg przyczyn', head: ['Przyczyna', 'Poprawki', 'Blokady i oczekiwanie'], widths: [0.5, 0.25, 0.25], rows: d.causes.map(c => [c.label, rxH(c.rework_min), rxH(c.blocked_min)]), empty: 'Brak poprawek i blokad w okresie.' },
    ] });
  return { html, doc };
}

// ---------- Dokumenty PDF / PNG dla pozostałych widoków ----------
function docMachines(d) {
  const ms = d.machines;
  return {
    title: `Przegląd maszyn ${d.year}`, subtitle: d.partial ? `rok w toku — do ${plDate(d.until)}` : 'cały rok', file: `przeglad-maszyn-${d.year}`,
    blocks: [
      { t: 'kpis', per: 2, items: ms.map(m => ({ label: `${m.name} ${m.axes}X — ${m.control}`, value: `${rxH(m.total_min)} · ${m.total_done} proj.`, big: false, color: rxMachineColor(m),
        sub: `rok wcześniej: ${rxH(m.prev_min)} · ${m.prev_done} proj.` })) },
      { t: 'bars', title: `Godziny pracy na projektach — miesiące ${d.year}`, categories: MONTHS_SHORT, fmt: (v) => `${Math.round(v)}`, series: ms.map(m => ({ name: m.name, color: rxMachineColor(m), values: m.months.map(x => rxHours(x.worked_min)) })) },
      { t: 'bars', title: `Zakończone projekty — miesiące ${d.year}`, categories: MONTHS_SHORT, fmt: (v) => String(Math.round(v)), series: ms.map(m => ({ name: m.name, color: rxMachineColor(m), values: m.months.map(x => x.projects_done) })), height: 380 },
      { t: 'table', title: `Miesiące ${d.year}`, head: ['Miesiąc', ...ms.map(m => `${m.name} godz.`), ...ms.map(m => `${m.name} proj.`)],
        rows: MONTHS_SHORT.map((l, i) => [plMonth(ms[0] ? ms[0].months[i].ym : ''), ...ms.map(m => (m.months[i].worked_min === null ? '—' : rxH(m.months[i].worked_min))), ...ms.map(m => (m.months[i].projects_done === null ? '—' : String(m.months[i].projects_done)))]) },
      { t: 'text', small: true, muted: true, text: 'Godziny = czas pracy ludzi na projektach przypisanych do maszyny (aktywna praca, weryfikacja i uruchomienie, poprawki). Aplikacja nie mierzy czasu pracy wrzeciona.' },
    ] };
}
function docMonth(d) {
  const cur = d.current, prev = d.previous;
  const val = (k, v) => kpiVal(v, k.unit);
  return {
    title: `Miesiąc ${plMonth(cur.year_month)}`, subtitle: `wobec ${plMonth(prev.year_month)}`, file: `analiza-miesiac-${cur.year_month}`,
    blocks: [
      { t: 'kpis', items: d.kpi.map(k => { const dd = d.delta[k.key]; const dir = KPI_DIR[k.key] || 0; const better = !dd || dd.diff === null || dd.diff === 0 || dir === 0 ? null : (dd.diff > 0) === (dir > 0);
        return { label: k.label, value: val(k, d.current_kpi[k.key]), big: false, sub: `rok wcześniej: ${val(k, d.previous_kpi[k.key])}`, tone: better === null ? '' : better ? 'good' : 'bad' }; }) },
      { t: 'bars', title: 'Godziny: miesiąc wobec roku wcześniej', categories: ['Przepracowane', 'Poprawki', 'Blokady', 'Nieobecności', 'Wyjścia', 'Nadgodziny'], fmt: rxHfmt,
        series: [{ name: plMonth(prev.year_month), color: '#8a949e', values: ['worked_min', 'rework_min', 'blocked_min', 'absence_min', 'exits_min', 'overtime_min'].map(k => rxHours(d.previous_kpi[k])) },
          { name: plMonth(cur.year_month), color: RX.orange, values: ['worked_min', 'rework_min', 'blocked_min', 'absence_min', 'exits_min', 'overtime_min'].map(k => rxHours(d.current_kpi[k])) }] },
      { t: 'table', title: 'Ludzie', head: ['Osoba', `Przepracowane ${cur.year_month}`, `Przepracowane ${prev.year_month}`, `Poprawki ${cur.year_month}`], widths: [0.4, 0.2, 0.2, 0.2],
        rows: [...new Set([...cur.by_employee, ...prev.by_employee].map(e => e.employee_id))].map(id => { const a = cur.by_employee.find(e => e.employee_id === id) || {}, b = prev.by_employee.find(e => e.employee_id === id) || {}; return [a.name || b.name, rxH(a.worked_min ?? 0), rxH(b.worked_min ?? 0), rxH(a.rework_min ?? 0)]; }) },
      { t: 'text', text: `Zakończone projekty ${plMonth(cur.year_month)}: ${cur.projects_done.map(p => `${p.order_no} ${p.part_no}`).join(', ') || 'brak'}.` },
    ] };
}
function docYear(d, metric) {
  const k = d.kpi.find(x => x.key === metric) || d.kpi[0];
  const conv = (v) => (k.unit === 'min' ? rxHours(v) : v);
  return {
    title: `Rok ${d.years[0].year}`, subtitle: d.years.length > 1 ? `wobec ${d.years.slice(1).map(y => y.year).join(', ')}` : 'sumy roczne', file: `analiza-rok-${d.years[0].year}`,
    blocks: [
      { t: 'bars', title: `${k.label} — miesiące`, categories: MONTHS_SHORT, fmt: k.unit === 'min' ? rxHfmt : (v) => String(Math.round(v * 10) / 10), series: d.years.map((y, i) => ({ name: String(y.year), color: RX.series[i % 6], values: y.months.map(m => conv(m[k.key])) })) },
      { t: 'table', title: 'Sumy roczne', head: ['Wskaźnik', ...d.years.map(y => String(y.year))], widths: [0.4, ...d.years.map(() => 0.6 / d.years.length)],
        rows: d.kpi.map(kk => [kk.label, ...d.years.map(y => kpiVal(y.totals ? y.totals[kk.key] : null, kk.unit))]) },
    ] };
}
function docReport(rep, def) {
  const c = rep.chart || {};
  const rows = (c.rows || rep.rows).filter(x => x[c.value] !== null && x[c.value] !== undefined).slice(0, 18);
  const unit = c.unit || def[4] || 'min';
  const conv = (v) => (v === null || v === undefined ? null : unit === 'min' ? rxHours(v) : v);
  const fmtC = unit === 'min' ? rxHfmt : unit === 'pct' ? (v) => `${Math.round(v)}%` : (v) => String(Math.round(v));
  const cell = (v, u) => (v === null || v === undefined ? '—' : u === 'min' ? rxH(v) : u === 'pct' ? `${v}%` : String(v));
  return {
    title: rep.title, subtitle: rep.from ? `${plDate(rep.from)} – ${plDate(rep.to)}` : rep.month ? plMonth(rep.month) : `stan na ${plDate(S.me.today)}`, file: `raport-${def[0]}-${rep.from || rep.month || S.me.today}`,
    blocks: [
      { t: 'text', text: `Definicja: ${rep.definition}`, small: true },
      { t: 'text', text: `Liczebność próbki: ${rep.sample} · kompletność danych: ${rep.completeness}`, small: true, muted: true },
      ...(rows.length && c.label ? [{ t: 'bars', title: rep.title, categories: rows.map(x => String(x[c.label])), fmt: fmtC,
        series: [{ name: (def[3] || [])[0] || 'Wartość', color: RX.orange, values: rows.map(x => conv(x[c.value])) }, ...(c.value2 ? [{ name: (def[3] || [])[1] || 'Wartość 2', color: '#8a949e', values: rows.map(x => conv(x[c.value2])) }] : [])] }] : []),
      { t: 'table', title: 'Tabela danych', head: rep.columns.map(x => x[1]), rows: rep.rows.map(row => rep.columns.map(([key, , u]) => cell(row[key], u))), empty: 'Brak danych w wybranym okresie (brak danych ≠ zero).' },
      ...(rep.extra ? [{ t: 'table', title: rep.extra.title, head: rep.extra.columns.map(x => x[1]), rows: rep.extra.rows.map(row => rep.extra.columns.map(([key, , u]) => cell(row[key], u))) }] : []),
    ] };
}
function docProject(r) {
  const s = r.data.process.summary;
  return {
    title: r.title, subtitle: `${s.order_no || ''} ${s.part_no || ''}`.trim() || 'Przebieg projektu', file: `raport-projekt-${s.order_no || r.id}`,
    blocks: [
      ...(r.note ? [{ t: 'h', text: 'Komentarz kierownika' }, { t: 'text', text: r.note }] : []),
      { t: 'kpis', items: [
        { label: 'Czas trwania', value: `${s.duration_days ?? '—'} dni`, sub: `${plDate(s.start_date)} – ${s.finish_date ? plDate(s.finish_date) : 'w toku'}` },
        { label: 'Wobec terminu', value: s.due_delta_days === null ? '—' : s.due_delta_days > 0 ? `+${s.due_delta_days} dni` : 'w terminie', tone: s.due_delta_days > 0 ? 'bad' : 'good', sub: `termin ${plDate(s.due_date)}` },
        { label: 'Godziny', value: rxH(s.worked_min), sub: `plan ${rxH(s.planned_min)} (${signPct(s.diff_pct)})`, tone: planTone(s.diff_pct) },
        { label: 'Poprawki', value: rxH(s.rework_min), sub: `${s.rework_share_pct ?? '—'}% czasu` },
      ] },
      { t: 'table', title: 'Zadania: wykonanie wobec planu', head: ['Zadanie', 'Typ', 'Wykonanie', 'Plan', 'Różnica'], widths: [0.36, 0.2, 0.14, 0.14, 0.16],
        rows: r.data.process.tasks.map(t => [t.title, t.type, rxH(t.worked_min), t.planned_min != null ? rxH(t.planned_min) : 'bez planu', t.diff_min ? { text: `${t.diff_min > 0 ? '+' : '−'}${hShort(Math.abs(t.diff_min))}`, tone: t.diff_min > 0 ? 'bad' : 'good' } : '—']) },
    ] };
}
function docWithNote(doc, note) {
  return note ? { ...doc, blocks: [{ t: 'h', text: 'Komentarz kierownika' }, { t: 'text', text: note }, ...doc.blocks] } : doc;
}
