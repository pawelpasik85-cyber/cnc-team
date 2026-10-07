// Grafika CNC Team: logo i emblematy maszyn w rzucie izometrycznym (2.5D), rysowane w SVG — bez plików graficznych z zewnątrz.
// Hartford 3X — stal i szarości; Grimme 5X — przewaga błękitu. Kolory motywów: tokens.css (--hf-*, --gr-*).
'use strict';

let BRAND_SEQ = 0;
const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6);

function isoPt(o, x, y, z) { return [o.cx + (x - y) * ISO_C * o.s, o.cy + (x + y) * ISO_S * o.s - z * o.s]; }
function poly(pts, fill, extra = '') { return `<path d="M${pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join('L')}Z" fill="${fill}" ${extra}/>`; }
// Prostopadłościan: widoczne ściany — góra, lewa (y = max), prawa (x = max)
function isoBox(o, x, y, z, dx, dy, dz, c) {
  const P = (a, b, h) => isoPt(o, a, b, h);
  const top = [P(x, y, z + dz), P(x + dx, y, z + dz), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)];
  const left = [P(x, y + dy, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)];
  const right = [P(x + dx, y, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x + dx, y, z + dz)];
  const edge = 'stroke="rgba(0,0,0,.25)" stroke-width=".4" stroke-linejoin="round"';
  return poly(left, c.left, edge) + poly(right, c.right, edge) + poly(top, c.top, edge);
}
// Pionowy walec (narzędzie): elipsa u góry + korpus z gradientem
function isoCyl(o, x, y, z, r, h, gid, topFill) {
  const [bx, by] = isoPt(o, x, y, z);
  const [tx, ty] = isoPt(o, x, y, z + h);
  const rx = r * o.s * ISO_C * 1.15, ry = rx * 0.5;
  return `<path d="M${(bx - rx).toFixed(2)} ${by.toFixed(2)}L${(tx - rx).toFixed(2)} ${ty.toFixed(2)}A${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 0 ${(tx + rx).toFixed(2)} ${ty.toFixed(2)}L${(bx + rx).toFixed(2)} ${by.toFixed(2)}A${rx.toFixed(2)} ${ry.toFixed(2)} 0 0 1 ${(bx - rx).toFixed(2)} ${by.toFixed(2)}Z" fill="url(#${gid})"/>`
    + `<ellipse cx="${tx.toFixed(2)}" cy="${ty.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="${topFill}"/>`;
}

const MACHINE_THEME = {
  hartford: { name: 'Hartford', top: '#d9dee3', left: '#9aa3ad', right: '#6c7580', table: { top: '#5b636c', left: '#3f454c', right: '#30353b' }, tool: ['#f2f4f6', '#8d96a0'], accent: '#c5ccd3', bg: ['#4a525b', '#23282d'] },
  grimme: { name: 'Grimme', top: '#b9dcff', left: '#4f97e8', right: '#1f63c4', table: { top: '#1f5fae', left: '#164a8a', right: '#0f3768' }, tool: ['#eaf4ff', '#7fa9d6'], accent: '#7cc0ff', bg: ['#1e5fb4', '#0b2547'] },
};
function machineTheme(m) {
  if (!m) return 'hartford';
  const id = String(m.id || m.machine_id || '').toUpperCase();
  if (id.includes('GRIMME')) return 'grimme';
  if (id.includes('HARTFORD')) return 'hartford';
  return Number(m.axes) >= 5 ? 'grimme' : 'hartford';
}

// Emblemat maszyny: stół, detal, frez; dla 5 osi — stół obrotowo-uchylny i strzałki osi A/C.
function machineEmblem(kind, size = 56) {
  const t = MACHINE_THEME[kind] || MACHINE_THEME.hartford;
  const k = ++BRAND_SEQ;
  const o = { cx: 32, cy: 36, s: 15 };
  let g = '';
  g += `<defs><linearGradient id="bt${k}" x1="0" x2="1"><stop offset="0" stop-color="${t.tool[0]}"/><stop offset="1" stop-color="${t.tool[1]}"/></linearGradient>
    <radialGradient id="bg${k}" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="${t.bg[0]}"/><stop offset="1" stop-color="${t.bg[1]}"/></radialGradient></defs>`;
  g += `<rect x="1" y="1" width="62" height="62" rx="13" fill="url(#bg${k})"/><rect x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" stroke="rgba(255,255,255,.18)"/>`;
  if (kind === 'grimme') {
    // kołyska (oś A) i stół obrotowy (oś C)
    g += isoBox(o, -0.95, -0.95, -0.55, 1.9, 0.35, 0.55, t.table);
    g += isoBox(o, -0.95, 0.6, -0.55, 1.9, 0.35, 0.55, t.table);
    const [cx, cy] = isoPt(o, 0, 0, 0);
    g += `<ellipse cx="${cx}" cy="${cy + 2.2}" rx="17" ry="8.5" fill="${t.table.left}"/><ellipse cx="${cx}" cy="${cy}" rx="17" ry="8.5" fill="${t.table.top}" stroke="rgba(255,255,255,.35)" stroke-width=".6"/>`;
    g += isoBox(o, -0.42, -0.42, 0, 0.84, 0.84, 0.62, t);
    g += isoCyl(o, 0, 0, 1.05, 0.13, 0.95, `bt${k}`, t.tool[0]);
    // strzałki A i C
    g += `<path d="M14 47 A19 9.5 0 0 0 50 47" fill="none" stroke="${t.accent}" stroke-width="2.2" stroke-linecap="round"/><path d="M50 47 l-4.6 -.6 l2.4 3.6z" fill="${t.accent}"/>`;
    g += `<path d="M8 30 A26 26 0 0 1 16 14" fill="none" stroke="${t.accent}" stroke-width="2.2" stroke-linecap="round"/><path d="M16 14 l-.4 4.6 l-3.4 -2.6z" fill="${t.accent}"/>`;
    g += `<text x="51" y="57" font-size="7" font-weight="700" fill="${t.accent}" font-family="Bahnschrift,Segoe UI,sans-serif">C</text><text x="4" y="13" font-size="7" font-weight="700" fill="${t.accent}" font-family="Bahnschrift,Segoe UI,sans-serif">A</text>`;
  } else {
    // stół liniowy z rowkami teowymi
    g += isoBox(o, -1.1, -0.8, -0.35, 2.2, 1.6, 0.35, t.table);
    for (const yy of [-0.4, 0, 0.4]) {
      const a = isoPt(o, -1.1, yy, 0), b = isoPt(o, 1.1, yy, 0);
      g += `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`;
    }
    g += isoBox(o, -0.5, -0.38, 0, 1.0, 0.76, 0.55, t);
    g += isoCyl(o, 0, 0, 0.95, 0.13, 0.95, `bt${k}`, t.tool[0]);
    // osie X, Y, Z (układ współrzędnych w lewym górnym rogu)
    const O = [15, 19], L = 9;
    const dirs = [['X', ISO_C, ISO_S, 1.5, 4.5], ['Y', -ISO_C, ISO_S, -5.5, 4.5], ['Z', 0, -1, 2, 1]];
    for (const [lbl, dx, dy, lx, ly] of dirs) {
      const e = [O[0] + dx * L, O[1] + dy * L];
      g += `<path d="M${O[0]} ${O[1]}L${e[0].toFixed(2)} ${e[1].toFixed(2)}" stroke="${t.accent}" stroke-width="1.8" stroke-linecap="round"/><circle cx="${e[0].toFixed(2)}" cy="${e[1].toFixed(2)}" r="1.5" fill="${t.accent}"/><text x="${(e[0] + lx).toFixed(2)}" y="${(e[1] + ly).toFixed(2)}" font-size="6.5" font-weight="700" fill="${t.accent}" font-family="Bahnschrift,Segoe UI,sans-serif">${lbl}</text>`;
    }
  }
  return `<svg class="emblem" viewBox="0 0 64 64" width="${size}" height="${size}" style="width:${size}px;height:${size}px" role="img" aria-label="${esc(t.name)}">${g}</svg>`;
}

// Logo aplikacji: frez trzpieniowy w rzucie izometrycznym na grafitowym kafelku, akcent „chłodziwo”.
function appLogo(size = 40) {
  const k = ++BRAND_SEQ;
  return `<svg class="app-logo" viewBox="0 0 64 64" width="${size}" height="${size}" style="width:${size}px;height:${size}px" role="img" aria-label="CNC Team">
    <defs>
      <radialGradient id="lb${k}" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="#3a434b"/><stop offset="1" stop-color="#15191c"/></radialGradient>
      <linearGradient id="ls${k}" x1="0" x2="1"><stop offset="0" stop-color="#eef2f4"/><stop offset=".45" stop-color="#b8c2ca"/><stop offset="1" stop-color="#6d7a84"/></linearGradient>
      <linearGradient id="lc${k}" x1="0" x2="1"><stop offset="0" stop-color="#7ae0d8"/><stop offset=".5" stop-color="#1fa8a3"/><stop offset="1" stop-color="#0b6a6b"/></linearGradient>
      <clipPath id="lk${k}"><path d="M24 26 L24 46 L32 54 L40 46 L40 26 A8 3 0 0 1 24 26Z"/></clipPath>
    </defs>
    <rect x="1" y="1" width="62" height="62" rx="14" fill="url(#lb${k})"/>
    <rect x="1.5" y="1.5" width="61" height="61" rx="13.5" fill="none" stroke="rgba(255,255,255,.14)"/>
    <ellipse cx="32" cy="55" rx="15" ry="4.2" fill="#2bb3b1" opacity=".22"/>
    <path d="M24 8 L24 26 A8 3 0 0 0 40 26 L40 8Z" fill="url(#ls${k})"/>
    <ellipse cx="32" cy="8" rx="8" ry="3" fill="#f6f8f9"/>
    <path d="M24 26 L24 46 L32 54 L40 46 L40 26 A8 3 0 0 1 24 26Z" fill="url(#lc${k})"/>
    <g clip-path="url(#lk${k})"><path d="M22 30 C30 34 36 27 42 31 M22 36 C30 40 36 33 42 37 M22 42 C30 46 36 39 42 43 M22 48 C30 52 36 45 42 49" fill="none" stroke="#063f40" stroke-width="2.2" opacity=".75"/>
    <path d="M22 28.6 C30 32.6 36 25.6 42 29.6 M22 34.6 C30 38.6 36 31.6 42 35.6" fill="none" stroke="#c9fffb" stroke-width=".8" opacity=".8"/></g>
    <path d="M32 54 L40 46" stroke="#063f40" stroke-width="1" opacity=".5"/>
  </svg>`;
}

// ---------- Licznik projektu: paski 3D w kolorach maszyny + godziny (przepracowane / plan / wynik) ----------
function hShort(min) {
  if (min === null || min === undefined) return '—';
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  if (h === 0) return `${min < 0 ? '−' : ''}${m} min`;
  return `${min < 0 ? '−' : ''}${h} h${m ? ` ${String(m).padStart(2, '0')} min` : ''}`;
}
function bar3d(label, pr, cls = '') {
  const v = pr && pr.percent !== null && pr.percent !== undefined ? pr.percent : null;
  return `<div class="bar3d ${cls}"><span class="lbl">${esc(label)}</span><span class="val">${v === null ? '<span class="muted">—</span>' : `${v}%`}</span>
    <div class="track" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v ?? 0}"><div class="fill" style="width:${v ?? 0}%"></div></div></div>`;
}
// Wynik godzinowy: najpierw zakończone zadania (rzeczywiste vs plan), potem stan całości.
function hoursResult(h) {
  if (h.done && h.done.planned_min) {
    const d = h.done.diff_min;
    if (d > 0) return { cls: 'over', big: `+${hShort(d)}`, line: `ponad plan na zakończonych zadaniach (+${h.done.diff_pct}%)` };
    if (d < 0) return { cls: 'ok', big: `−${hShort(-d)}`, line: `szybciej niż plan na zakończonych zadaniach (${h.done.diff_pct}%)` };
    return { cls: 'ok', big: '0 h', line: 'zakończone zadania dokładnie w planie' };
  }
  if (h.planned_min && h.over_min > 0) return { cls: 'over', big: `+${hShort(h.over_min)}`, line: 'przekroczony plan projektu' };
  if (h.planned_min) return { cls: 'neutral', big: hShort(h.remaining_min), line: 'zostało z planu (brak zakończonych zadań)' };
  return { cls: 'neutral', big: '—', line: 'brak planu godzin' };
}
function hoursBlock(h) {
  if (!h) return '';
  const r = hoursResult(h);
  const max = Math.max(h.worked_min || 0, h.planned_min || 0) || 1;
  const inPlan = Math.min(h.worked_min, h.planned_min || h.worked_min);
  const over = h.planned_min ? Math.max(0, h.worked_min - h.planned_min) : 0;
  const planPos = h.planned_min ? (h.planned_min / max) * 100 : null;
  return `<div class="hours">
      <div class="h-cell"><span>Przepracowano</span><b>${hShort(h.worked_min)}</b></div>
      <div class="h-cell"><span>Plan</span><b>${h.planned_min ? hShort(h.planned_min) : '—'}</b>${h.tasks_without_plan ? `<small>bez planu: ${h.tasks_without_plan} zad.</small>` : ''}</div>
      <div class="h-cell result ${r.cls}"><span>Wynik</span><b>${r.big}</b><small>${esc(r.line)}</small></div>
    </div>
    <div class="burn" aria-label="Godziny: przepracowano ${hShort(h.worked_min)} z planu ${hShort(h.planned_min)}">
      <div class="track"><div class="fill" style="width:${(inPlan / max) * 100}%"></div>${over ? `<div class="over" style="left:${planPos}%;width:${(over / max) * 100}%"></div>` : ''}
        ${planPos !== null ? `<div class="plan-mark" style="left:${planPos}%"><span>plan</span></div>` : ''}</div>
      <div class="burn-legend"><span>${h.use_pct !== null ? `wykorzystano ${h.use_pct}% planu` : 'brak planu'}</span>${h.forecast_diff_min !== null ? `<span>prognoza całości: <b>${hShort(h.forecast_min)}</b> ${h.forecast_diff_min > 0 ? `<em class="bad">(+${hShort(h.forecast_diff_min)})</em>` : '<em class="good">(w planie)</em>'}</span>` : ''}${h.overtime_work_min ? `<span class="ot-line"><span class="mode-badge dod">DOD</span> w nadgodzinach: <b>${hShort(h.overtime_work_min)}</b> (${h.overtime_share_pct}%)</span>` : ''}</div>
    </div>`;
}
function machineChip(m) {
  if (!m || !(m.machine_name || m.name)) return '<span class="muted small">bez maszyny</span>';
  const th = machineTheme(m);
  return `<span class="mchip theme-${th}">${machineEmblem(th, 22)}<b>${esc(m.machine_name || m.name)}</b> ${m.axes ? `${m.axes}X` : ''}</span>`;
}
// Pełny licznik projektu (karta, szczegóły, widok gościa)
function projectMeter(p, { compact = false } = {}) {
  const th = machineTheme({ id: p.machine_id, axes: p.axes });
  const total = p.schedule ? p.schedule.actual_percent : null;
  return `<div class="meter theme-${th} ${compact ? 'compact' : ''}">
    <div class="meter-head">${machineEmblem(th, compact ? 40 : 52)}
      <div class="mh-name"><b>${esc(p.machine_name || (th === 'grimme' ? 'Grimme' : 'Hartford'))}</b><span>${p.axes ? `${p.axes} osi` : ''}${p.control ? ` · ${esc(p.control)}` : ''}</span></div>
      <div class="mh-total"><b>${total === null || total === undefined ? '—' : `${total}%`}</b><span>wykonano</span></div></div>
    ${bar3d('Przygotowanie programu', p.progress_program)}
    ${bar3d('Wykonanie detalu', p.progress_execution, 'exec')}
    ${hoursBlock(p.hours)}
  </div>`;
}
