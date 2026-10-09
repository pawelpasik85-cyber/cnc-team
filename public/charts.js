// Wykresy SVG bez bibliotek: linie (z celownikiem i podpowiedzią), słupki grupowane (z podpowiedzią na słupku).
// Zasady: jedna oś Y na wykres, cienkie linie 2 px, legenda przy ≥ 2 seriach, kolory serii stałe dla danego bytu (np. rok).
'use strict';

const CHARTS = new Map();
let CHART_SEQ = 0;
// Kolor roku jest stały (rok zawsze ma ten sam kolor, niezależnie od tego, które lata są porównywane)
const yearColor = (y) => `var(--series-${(Number(y) % 4) + 1})`;

function niceMax(v) {
  if (!v || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function niceMin(v) { return v >= 0 ? 0 : -niceMax(-v); }

// series: [{ name, color, dash, values: [number|null] }], labels: [string] (oś X), fmt: (v) => tekst
function svgLineChart({ series, labels, fmt = (v) => String(v), height = 240, yMax, yMin, title = '', step = false, labelEvery }) {
  const id = `ch${++CHART_SEQ}`;
  const W = 720, H = height, L = 56, R = 16, Tp = 12, B = 30;
  const all = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  const hi = yMax !== undefined ? yMax : niceMax(Math.max(0, ...all));
  const lo = yMin !== undefined ? yMin : niceMin(Math.min(0, ...all));
  const n = labels.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo || 1));
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="ylab" text-anchor="end">${esc(fmt(Math.round(v * 10) / 10))}</text>`;
  }
  const every = labelEvery || Math.max(1, Math.ceil(n / 8));
  labels.forEach((lb, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${H - 8}" class="xlab" text-anchor="middle">${esc(lb)}</text>`; });
  for (const s of series) {
    let d = '', prev = null;
    s.values.forEach((v, i) => {
      if (v === null || v === undefined) { prev = null; return; }
      if (prev === null) d += `M${x(i)} ${y(v)}`;
      else if (step) d += `H${x(i)}V${y(v)}`;
      else d += `L${x(i)} ${y(v)}`;
      prev = v;
    });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    const lastI = s.values.map((v, i) => (v === null || v === undefined ? -1 : i)).filter(i => i >= 0).pop();
    if (lastI !== undefined && !s.dash) g += `<circle cx="${x(lastI)}" cy="${y(s.values[lastI])}" r="4" fill="${s.color}" class="ring"/>`;
  }
  g += `<line class="cross" x1="0" x2="0" y1="${Tp}" y2="${H - B}" visibility="hidden"/><rect class="hit" x="${L}" y="${Tp}" width="${W - L - R}" height="${H - Tp - B}" fill="transparent"/>`;
  CHARTS.set(id, { kind: 'line', series, labels, fmt, x, n, L, R, W });
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}${s.dash ? ';height:2px' : ''}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<figure class="chart" data-chart="${id}">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}${legend}
    <div class="chart-box"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg><div class="tip" hidden></div></div></figure>`;
}

// categories: [string], series: [{ name, color, values: [number] }]
function svgBarChart({ categories, series, fmt = (v) => String(v), height = 240, title = '', highlight }) {
  const id = `ch${++CHART_SEQ}`;
  const W = 720, H = height, L = 56, R = 12, Tp = 12, B = 40;
  const all = series.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
  const hi = niceMax(Math.max(0, ...all)), lo = niceMin(Math.min(0, ...all));
  const y = (v) => Tp + (H - Tp - B) * (1 - (v - lo) / (hi - lo || 1));
  const groupW = (W - L - R) / Math.max(1, categories.length);
  const gap = 2, inner = Math.min(46, (groupW * 0.72 - gap * (series.length - 1)) / series.length);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, yy = y(v);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="ylab" text-anchor="end">${esc(fmt(Math.round(v * 10) / 10))}</text>`;
  }
  categories.forEach((c, ci) => {
    const gx = L + ci * groupW + (groupW - (inner * series.length + gap * (series.length - 1))) / 2;
    series.forEach((s, si) => {
      const v = s.values[ci];
      if (v === null || v === undefined) return;
      const x0 = gx + si * (inner + gap), y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v)), h = Math.max(1, y1 - y0);
      const r = Math.min(4, inner / 2, h);
      const color = typeof s.color === 'function' ? s.color(ci) : s.color;
      const path = v >= 0
        ? `M${x0} ${y1}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + inner - r}Q${x0 + inner} ${y0} ${x0 + inner} ${y0 + r}V${y1}Z`
        : `M${x0} ${y0}V${y1 - r}Q${x0} ${y1} ${x0 + r} ${y1}H${x0 + inner - r}Q${x0 + inner} ${y1} ${x0 + inner} ${y1 - r}V${y0}Z`;
      g += `<path d="${path}" fill="${color}" class="bar${highlight && highlight !== ci ? ' dim' : ''}" data-tip="${esc(`${c}${series.length > 1 ? ` · ${s.name}` : ''}: ${fmt(v)}`)}"/>`;
    });
    g += `<text x="${L + ci * groupW + groupW / 2}" y="${H - 22}" class="xlab" text-anchor="middle">${esc(c)}</text>`;
  });
  g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="axis0"/>`;
  CHARTS.set(id, { kind: 'bar' });
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${typeof s.color === 'function' ? s.color(0) : s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<figure class="chart" data-chart="${id}">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}${legend}
    <div class="chart-box"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg><div class="tip" hidden></div></div></figure>`;
}

// Słupki 3D (bryły z wierzchem i bokiem) w kolorach maszyn: Hartford — szarości, Grimme — błękit.
// series: [{ name, tone: 'hartford'|'grimme'|kolor, values: [number|null] }]; wartości nad słupkami dla czytelności.
const TONES = {
  hartford: { light: '#dde2e7', mid: '#8a949e', dark: '#4a525b' },
  grimme: { light: '#9ccbff', mid: '#2a7de0', dark: '#0e468f' },
};
function svgBar3d({ categories, series, fmt = (v) => String(v), height = 300, title = '', labels = true, unit = '', integer = false }) {
  const id = `ch${++CHART_SEQ}`;
  const W = 720, H = height, L = 52, R = 26, Tp = 26, B = 34, DX = 9, DY = 6;
  const all = series.flatMap(x => x.values).filter(v => v !== null && v !== undefined);
  // podziałka „okrągła” co 1/4 zakresu; dla liczebności — liczby całkowite
  const mx = Math.max(0, ...all);
  const hi = integer ? Math.max(4, Math.ceil(mx / 4) * 4) : niceMax(mx / 4) * 4;
  const y = (v) => Tp + (H - Tp - B) * (1 - v / (hi || 1));
  const groupW = (W - L - R - DX) / Math.max(1, categories.length);
  const gap = 4, inner = Math.max(6, Math.min(36, (groupW * 0.74 - gap * (series.length - 1)) / series.length));
  const tone = (x) => TONES[x.tone] || { light: x.tone, mid: x.tone, dark: x.tone };
  let defs = '';
  series.forEach((x, si) => { const t = tone(x); defs += `<linearGradient id="${id}f${si}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.light}"/><stop offset=".45" stop-color="${t.mid}"/><stop offset="1" stop-color="${t.dark}"/></linearGradient>`; });
  let g = '';
  // tylna ściana i podłoga — efekt głębi
  g += `<polygon points="${L},${y(0)} ${L + DX},${y(0) - DY} ${W - R},${y(0) - DY} ${W - R - DX},${y(0)}" class="floor3d"/>`;
  for (let k = 0; k <= 4; k++) {
    const v = (hi * k) / 4, yy = y(v);
    g += `<line x1="${L + DX}" x2="${W - R}" y1="${yy - DY}" y2="${yy - DY}" class="grid"/><line x1="${L}" x2="${L + DX}" y1="${yy}" y2="${yy - DY}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="ylab" text-anchor="end">${esc(fmt(Math.round(v * 10) / 10))}</text>`;
  }
  categories.forEach((c, ci) => {
    const gx = L + ci * groupW + (groupW - (inner * series.length + gap * (series.length - 1))) / 2;
    series.forEach((x, si) => {
      const v = x.values[ci];
      if (v === null || v === undefined) return;
      const t = tone(x);
      const x0 = gx + si * (inner + gap), yt = y(Math.max(v, 0)), yb = y(0), h = Math.max(1.5, yb - yt), top = yb - h;
      g += `<g class="bar3d-g" data-tip="${esc(`${c}${series.length > 1 ? ` · ${x.name}` : ''}: ${fmt(v)}${unit}`)}">
        <rect x="${x0}" y="${top}" width="${inner}" height="${h}" fill="url(#${id}f${si})"/>
        <polygon points="${x0 + inner},${top} ${x0 + inner + DX},${top - DY} ${x0 + inner + DX},${yb - DY} ${x0 + inner},${yb}" fill="${t.dark}"/>
        <polygon points="${x0},${top} ${x0 + DX},${top - DY} ${x0 + inner + DX},${top - DY} ${x0 + inner},${top}" fill="${t.light}"/>
        ${labels && v > 0 ? `<text x="${x0 + inner / 2 + DX / 2}" y="${top - DY - 4}" class="vlab" text-anchor="middle">${esc(fmt(v))}</text>` : ''}</g>`;
    });
    g += `<text x="${L + ci * groupW + groupW / 2}" y="${H - 10}" class="xlab" text-anchor="middle">${esc(c)}</text>`;
  });
  CHARTS.set(id, { kind: 'bar' });
  const legend = series.length > 1 ? `<div class="legend">${series.map(x => `<span><i style="background:${tone(x).mid}"></i>${esc(x.name)}</span>`).join('')}</div>` : '';
  return `<figure class="chart chart3d" data-chart="${id}">${title ? `<figcaption>${esc(title)}</figcaption>` : ''}${legend}
    <div class="chart-box"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><defs>${defs}</defs>${g}</svg><div class="tip" hidden></div></div></figure>`;
}

// Podpowiedzi: linia — celownik i wartości wszystkich serii w danym punkcie; słupek — wartość słupka.
function bindCharts(root = document) {
  root.querySelectorAll('figure.chart').forEach(fig => {
    const meta = CHARTS.get(fig.dataset.chart);
    if (!meta || fig.dataset.bound) return;
    fig.dataset.bound = '1';
    const svg = fig.querySelector('svg'), tip = fig.querySelector('.tip'), box = fig.querySelector('.chart-box');
    const place = (ev, html) => {
      const r = box.getBoundingClientRect();
      tip.innerHTML = html; tip.hidden = false;
      const left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, ev.clientX - r.left + 12));
      tip.style.left = `${left}px`; tip.style.top = `${Math.max(0, ev.clientY - r.top - tip.offsetHeight - 10)}px`;
    };
    if (meta.kind === 'line') {
      const cross = svg.querySelector('.cross');
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * meta.W;
        const i = Math.max(0, Math.min(meta.n - 1, Math.round(((px - meta.L) / (meta.W - meta.L - meta.R)) * (meta.n - 1))));
        cross.setAttribute('x1', meta.x(i)); cross.setAttribute('x2', meta.x(i)); cross.setAttribute('visibility', 'visible');
        place(ev, `<b>${esc(meta.labels[i])}</b>${meta.series.map(s => `<div><i style="background:${s.color}"></i>${esc(s.name)}: <b>${s.values[i] === null || s.values[i] === undefined ? '—' : esc(meta.fmt(s.values[i]))}</b></div>`).join('')}`);
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    } else {
      svg.addEventListener('pointermove', (ev) => {
        const t = ev.target.closest('[data-tip]');
        if (!t) { tip.hidden = true; return; }
        place(ev, esc(t.dataset.tip));
      });
      svg.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
  });
}
