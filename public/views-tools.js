// Narzędziownia: oprawki, głowice frezujące, płytki i frezy — wykaz z rysunkami (SVG generowane z parametrów),
// stanem magazynowym i listą „pasuje do”. Wpisuje i zmienia kierownik; pozostali (programiści, przełożony) tylko przeglądają.
'use strict';

const TOOL_TABS = [
  ['oprawka', 'Oprawki', 'Oprawka'],
  ['glowica', 'Głowice frezujące', 'Głowica'],
  ['plytka', 'Płytki', 'Płytka'],
  ['frez', 'Frezy i wiertła', 'Frez'],
];
const TOOL_KIND = Object.fromEntries(TOOL_TABS.map(([k, l, s]) => [k, { label: l, single: s }]));
const HOLDER_LABEL = { tulejkowa: 'tulejkowa (ER)', weldon: 'Weldon', termo: 'termokurczliwa', hydrauliczna: 'hydrauliczna', trzpieniowa: 'trzpieniowa (do głowic)' };
const MILL_LABEL = { 'walcowo-czolowy': 'walcowo-czołowy', kulisty: 'kulisty', torusowy: 'torusowy', fazownik: 'fazownik', wiertlo: 'wiertło', gwintownik: 'gwintownik', 'frez-gwintowy': 'frez do gwintów' };
const THREADED = (type) => type === 'gwintownik' || type === 'frez-gwintowy';
const SHAPE_LABEL = { A: 'A — równoległobok 85°', C: 'C — romb 80°', D: 'D — romb 55°', R: 'R — okrągła', S: 'S — kwadrat', T: 'T — trójkąt', V: 'V — romb 35°', W: 'W — trygon 80°', O: 'O — ośmiokąt' };

let toolUid = 0;
const mm = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

// ---------- Rysunki ----------
// Kolor pokrycia (orientacyjny wygląd, nie specyfikacja producenta)
function coatTone(coating) {
  const c = String(coating || '').toLowerCase();
  if (/altin|tialn|alcrn/.test(c)) return ['#8c8aa6', '#4a4763', '#2c2a3d'];
  if (/ticn/.test(c)) return ['#a9b4c4', '#6b7787', '#434c58'];
  if (/tin/.test(c)) return ['#f2d27a', '#c99a2e', '#8a6414'];
  if (/dlc|diament/.test(c)) return ['#6a6f76', '#2f3338', '#15171a'];
  return ['#eef1f4', '#a7b0b9', '#5f6871'];
}
function metalDefs(id, [light, mid, dark], horizontal = true) {
  const dir = horizontal ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  return `<linearGradient id="${id}" ${dir}><stop offset="0" stop-color="${dark}"/><stop offset=".28" stop-color="${mid}"/><stop offset=".5" stop-color="${light}"/><stop offset=".72" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
}
const MACHINE_STEEL = { hartford: ['#e4e8ec', '#8c96a0', '#3c434b'], grimme: ['#cfe5ff', '#3f88e0', '#0c3a78'] };
const STEEL = ['#f1f3f5', '#a3acb5', '#535c65'];

// Oprawka — widok z boku: stożek BT50 (z kołkiem) albo HSK (krótki, wydrążony), kołnierz z rowkiem, korpus wg rodzaju
function drawHolder(t, { w = 120 } = {}) {
  const p = t.params || {}; const id = `tg${++toolUid}`;
  const theme = machineTheme(S.boot.machines.find(m => m.id === t.machine_id) || { id: /hsk/i.test(p.interface || '') ? 'GRIMME' : 'HARTFORD' });
  const hsk = /hsk/i.test(p.interface || '') || (!p.interface && theme === 'grimme');
  const cx = 60; const parts = [];
  let y;
  if (hsk) {
    parts.push(`<path d="M${cx - 15} 26 L${cx + 15} 26 L${cx + 19} 62 L${cx - 19} 62 Z" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<path d="M${cx - 8} 30 L${cx + 8} 30 L${cx + 10} 60 L${cx - 10} 60 Z" fill="none" stroke="#2a3036" stroke-width=".7" stroke-dasharray="2 2"/>`,
      `<rect x="${cx - 30}" y="62" width="60" height="18" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<path d="M${cx - 30} 69 h60" stroke="#2a3036" stroke-width="1.6" opacity=".55"/>`);
    y = 80;
  } else {
    parts.push(`<rect x="${cx - 6}" y="2" width="12" height="9" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<rect x="${cx - 4}" y="11" width="8" height="6" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<rect x="${cx - 8}" y="17" width="16" height="7" rx="1" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<path d="M${cx - 18} 24 L${cx + 18} 24 L${cx + 31} 72 L${cx - 31} 72 Z" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<rect x="${cx - 46}" y="72" width="92" height="22" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
      `<path d="M${cx - 46} 80 l6 3 l-6 3 M${cx + 46} 80 l-6 3 l6 3" fill="none" stroke="#2a3036" stroke-width="1"/>`,
      `<rect x="${cx - 9}" y="76" width="6" height="6" fill="#2a3036" opacity=".5"/>`);
    y = 94;
  }
  const bodyMax = hsk ? 26 : 40;
  const dTool = p.type === 'trzpieniowa' ? p.arbor : (p.clamp_max ?? p.clamp_min);
  const bore = Math.max(4, Math.min(bodyMax - 8, (dTool || 10) * (hsk ? 0.9 : 0.75)));
  const L = Math.max(36, Math.min(96, (Number(p.gauge) || 90) * (hsk ? 0.6 : 0.5)));
  const bottom = y + L;
  const toolStub = (top, bw) => `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${190 - top}" fill="url(#${id}t)" stroke="#2a3036" stroke-width=".6" opacity=".55" stroke-dasharray="3 2"/>`;
  switch (p.type) {
    case 'tulejkowa':
      parts.push(`<path d="M${cx - bodyMax / 2} ${y} L${cx + bodyMax / 2} ${y} L${cx + bodyMax / 2 - 4} ${bottom - 22} L${cx - bodyMax / 2 + 4} ${bottom - 22} Z" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
        `<rect x="${cx - bodyMax / 2 - 2}" y="${bottom - 22}" width="${bodyMax + 4}" height="18" rx="3" fill="url(#${id}n)" stroke="#2a3036" stroke-width=".8"/>`,
        `<path d="M${cx - bodyMax / 2 + 6} ${bottom - 22} v18 M${cx + bodyMax / 2 - 6} ${bottom - 22} v18" stroke="#2a3036" stroke-width=".6" opacity=".6"/>`,
        `<path d="M${cx - bodyMax / 4} ${bottom - 4} L${cx - bore / 2} ${bottom + 2} L${cx + bore / 2} ${bottom + 2} L${cx + bodyMax / 4} ${bottom - 4} Z" fill="url(#${id}n)" stroke="#2a3036" stroke-width=".6"/>`,
        toolStub(bottom + 2, bore));
      break;
    case 'termo': {
      const tip = Math.max(bore + 6, 12);
      parts.push(`<path d="M${cx - bodyMax / 2 + 4} ${y} L${cx + bodyMax / 2 - 4} ${y} L${cx + tip / 2} ${bottom} L${cx - tip / 2} ${bottom} Z" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
        `<path d="M${cx - bodyMax / 2 + 9} ${y + 12} L${cx - tip / 2 + 4} ${bottom - 6}" stroke="#d65f2a" stroke-width="1.4" opacity=".5"/>`,
        toolStub(bottom, bore));
      break;
    }
    case 'weldon':
    case 'hydrauliczna':
      parts.push(`<rect x="${cx - bodyMax / 2}" y="${y}" width="${bodyMax}" height="${L}" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
        p.type === 'weldon'
          ? `<rect x="${cx + bodyMax / 2 - 1}" y="${y + L * 0.45}" width="6" height="9" rx="1" fill="#2a3036"/><path d="M${cx + bodyMax / 2 + 1} ${y + L * 0.45 + 2} h3 M${cx + bodyMax / 2 + 1} ${y + L * 0.45 + 5} h3" stroke="#aab" stroke-width=".6"/>`
          : `<circle cx="${cx + bodyMax / 2 - 6}" cy="${y + 12}" r="3.4" fill="#2a3036"/><path d="M${cx - bodyMax / 2} ${y + L * 0.6} h${bodyMax}" stroke="#2a3036" stroke-width=".6" opacity=".5"/>`,
        toolStub(bottom, bore));
      break;
    case 'trzpieniowa': {
      const ab = Math.max(10, Math.min(26, (p.arbor || 22) * 0.75));
      parts.push(`<rect x="${cx - bodyMax / 2}" y="${y}" width="${bodyMax}" height="${Math.min(L, 40)}" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
        `<rect x="${cx - ab / 2}" y="${y + Math.min(L, 40)}" width="${ab}" height="20" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`,
        `<rect x="${cx - ab / 2 - 4}" y="${y + Math.min(L, 40)}" width="5" height="9" fill="#2a3036" opacity=".75"/><rect x="${cx + ab / 2 - 1}" y="${y + Math.min(L, 40)}" width="5" height="9" fill="#2a3036" opacity=".75"/>`,
        `<rect x="${cx - ab / 2 + 2}" y="${y + Math.min(L, 40) + 18}" width="${ab - 4}" height="4" rx="1" fill="#2a3036" opacity=".7"/>`);
      break;
    }
    default:
      parts.push(`<rect x="${cx - bodyMax / 2}" y="${y}" width="${bodyMax}" height="${L}" rx="2" fill="url(#${id}m)" stroke="#2a3036" stroke-width=".8"/>`);
  }
  const label = p.type === 'trzpieniowa' ? `trzpień Ø${mm(p.arbor)}` : p.clamp_min != null ? `Ø${mm(p.clamp_min)}${p.clamp_max && p.clamp_max !== p.clamp_min ? `–${mm(p.clamp_max)}` : ''}` : '';
  return `<svg class="tool-svg" viewBox="0 0 120 196" width="${w}" role="img" aria-label="${esc(`Oprawka ${p.interface || ''} ${HOLDER_LABEL[p.type] || ''} ${label}`)}">
    <defs>${metalDefs(`${id}m`, MACHINE_STEEL[theme])}${metalDefs(`${id}n`, STEEL)}${metalDefs(`${id}t`, ['#fff', '#d9dee3', '#9aa3ac'])}</defs>
    ${parts.join('')}
    <text x="4" y="12" class="tool-svg-tag">${esc(p.interface || '')}</text>
    ${label ? `<text x="116" y="${Math.min(190, bottom + 14)}" text-anchor="end" class="tool-svg-dim">${esc(label)}</text>` : ''}
  </svg>`;
}

// Głowica frezująca — widok z boku (płytki na obwodzie, kąt przystawienia) i od czoła (z ostrzy)
function drawHead(t, { w = 220 } = {}) {
  const p = t.params || {}; const id = `tg${++toolUid}`;
  const z = Math.max(1, Math.min(16, Math.round(p.z || 4)));
  const round = /^R/i.test(p.insert_code || '');
  const lead = Number(p.lead) || 90;
  const parts = [];
  // widok z boku
  const x0 = 12, x1 = 112, top = 22, bot = 82;
  if (p.shank) parts.push(`<rect x="${62 - 10}" y="2" width="20" height="${top - 2}" fill="url(#${id}b)" stroke="#2a3036" stroke-width=".8"/>`);
  else parts.push(`<path d="M${62 - 12} ${top} v-6 h24 v6" fill="none" stroke="#2a3036" stroke-width=".8" stroke-dasharray="2 2"/><rect x="${62 - 4}" y="${top - 6}" width="8" height="6" fill="#2a3036" opacity=".6"/>`);
  const bevel = lead < 80 ? 10 : 3;
  parts.push(`<path d="M${x0 + 6} ${top} H${x1 - 6} L${x1} ${bot - bevel} L${x1 - bevel} ${bot} H${x0 + bevel} L${x0} ${bot - bevel} Z" fill="url(#${id}b)" stroke="#2a3036" stroke-width=".8"/>`);
  // rowki wiórowe i płytki widoczne z boku
  const vis = Math.min(z, 5);
  for (let i = 0; i < vis; i++) {
    const x = x0 + 10 + (i + 0.5) * ((x1 - x0 - 20) / vis);
    parts.push(`<path d="M${x - 7} ${top + 18} q7 -6 14 0 v${bot - top - 22} h-14 Z" fill="#2a3036" opacity=".35"/>`);
  }
  const ins = (cx, cy, s = 1) => round
    ? `<circle cx="${cx}" cy="${cy}" r="${6 * s}" fill="url(#${id}i)" stroke="#1b1f23" stroke-width=".7"/><circle cx="${cx}" cy="${cy}" r="${1.8 * s}" fill="#1b1f23"/>`
    : `<g transform="rotate(${90 - lead} ${cx} ${cy})"><rect x="${cx - 5 * s}" y="${cy - 7 * s}" width="${10 * s}" height="${12 * s}" rx="1" fill="url(#${id}i)" stroke="#1b1f23" stroke-width=".7" transform="skewX(-8)"/></g>`;
  parts.push(ins(x0 + 6, bot - 6), ins(x1 - 6, bot - 6));
  // widok od czoła
  const cx = 168, cy = 52, R = 42;
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${id}r)" stroke="#2a3036" stroke-width=".8"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${R * 0.42}" fill="none" stroke="#2a3036" stroke-width=".7"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${Math.max(4, R * 0.18)}" fill="#2a3036" opacity=".75"/>`);
  for (let i = 0; i < z; i++) {
    const a = (i / z) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * (R - 7), py = cy + Math.sin(a) * (R - 7);
    parts.push(`<path d="M${cx + Math.cos(a + 0.18) * (R * 0.45)} ${cy + Math.sin(a + 0.18) * (R * 0.45)} L${cx + Math.cos(a + 0.34) * R} ${cy + Math.sin(a + 0.34) * R}" stroke="#2a3036" stroke-width="5" opacity=".28" stroke-linecap="round"/>`);
    parts.push(round ? `<circle cx="${px}" cy="${py}" r="5.5" fill="url(#${id}i)" stroke="#1b1f23" stroke-width=".7"/><circle cx="${px}" cy="${py}" r="1.6" fill="#1b1f23"/>`
      : `<rect x="${px - 3.5}" y="${py - 6}" width="7" height="12" rx="1" fill="url(#${id}i)" stroke="#1b1f23" stroke-width=".7" transform="rotate(${(a * 180) / Math.PI + 90} ${px} ${py})"/>`);
  }
  return `<svg class="tool-svg" viewBox="0 0 220 104" width="${w}" role="img" aria-label="${esc(`Głowica Ø${mm(p.D)} z${z}${p.insert_code ? `, płytki ${p.insert_code}` : ''}`)}">
    <defs>${metalDefs(`${id}b`, STEEL)}<radialGradient id="${id}r" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".6" stop-color="#a3acb5"/><stop offset="1" stop-color="#535c65"/></radialGradient>${metalDefs(`${id}i`, ['#c9ced4', '#6f7880', '#3a4148'])}</defs>
    ${parts.join('')}
    <text x="62" y="100" text-anchor="middle" class="tool-svg-dim">Ø${esc(mm(p.D))}${lead !== 90 ? ` · ${esc(mm(lead))}°` : ''}</text>
    <text x="${cx}" y="100" text-anchor="middle" class="tool-svg-dim">z = ${z}</text>
  </svg>`;
}

// Płytka — kształt wg ISO, otwór mocujący, grubość (lekki widok 3D)
function insertPoints(shape, cx, cy, s) {
  const deg = Math.PI / 180;
  const rhomb = (ang) => { const a = (ang / 2) * deg; const d1 = s * Math.cos(a), d2 = s * Math.sin(a); return [[cx - d1, cy], [cx, cy - d2], [cx + d1, cy], [cx, cy + d2]]; };
  const reg = (n, rot = -90) => Array.from({ length: n }, (_, i) => [cx + s * 0.62 * Math.cos((rot + (360 / n) * i) * deg), cy + s * 0.62 * Math.sin((rot + (360 / n) * i) * deg)]);
  switch (shape) {
    case 'C': return rhomb(80);
    case 'D': return rhomb(55);
    case 'V': return rhomb(35);
    case 'S': return reg(4, -45);
    case 'T': return reg(3);
    case 'O': return reg(8, -22.5);
    case 'W': // trygon: trzy naroża 80°, boki załamane na środku
      return Array.from({ length: 6 }, (_, i) => { const a = (-90 + i * 60) * deg; const rr = s * (i % 2 ? 0.44 : 0.64); return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; });
    case 'A': { const h = s * 0.5, w = s * 0.9, k = Math.tan(5 * deg) * h * 2; return [[cx - w / 2 + k, cy - h / 2], [cx + w / 2 + k, cy - h / 2], [cx + w / 2 - k, cy + h / 2], [cx - w / 2 - k, cy + h / 2]].map(([x, y]) => [x - s * 0.08, y]); }
    default: return null;
  }
}
function drawInsert(t, { w = 120 } = {}) {
  const p = t.params || {}; const id = `tg${++toolUid}`;
  const cx = 60, cy = 52, s = 42, th = 7;
  const pts = insertPoints(p.shape, cx, cy, s);
  const path = (dx, dy) => pts ? `M${pts.map(([x, y]) => `${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}`).join(' L')} Z` : '';
  const tone = coatTone(p.coating);
  const body = pts
    ? `<path d="${path(3, th)}" fill="${tone[2]}" stroke="#15181b" stroke-width=".7"/><path d="${path(0, 0)}" fill="url(#${id}f)" stroke="#15181b" stroke-width=".9" stroke-linejoin="round"/>`
    : `<circle cx="${cx + 3}" cy="${cy + th}" r="${s * 0.55}" fill="${tone[2]}" stroke="#15181b" stroke-width=".7"/><circle cx="${cx}" cy="${cy}" r="${s * 0.55}" fill="url(#${id}f)" stroke="#15181b" stroke-width=".9"/>`;
  const radiusMark = p.radius && pts ? `<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="4" fill="none" stroke="#d6452a" stroke-width="1.2"/>` : '';
  return `<svg class="tool-svg" viewBox="0 0 120 112" width="${w}" role="img" aria-label="${esc(`Płytka ${SHAPE_LABEL[p.shape] || ''} ${mm(p.size)} mm`)}">
    <defs><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tone[0]}"/><stop offset=".55" stop-color="${tone[1]}"/><stop offset="1" stop-color="${tone[2]}"/></linearGradient></defs>
    ${body}
    <circle cx="${cx}" cy="${cy}" r="${s * 0.13}" fill="#15181b"/><circle cx="${cx}" cy="${cy}" r="${s * 0.2}" fill="none" stroke="#15181b" stroke-width=".7" opacity=".6"/>
    ${radiusMark}
    <text x="60" y="108" text-anchor="middle" class="tool-svg-dim">${esc(p.shape || '')} · ${esc(mm(p.size))} mm${p.radius ? ` · r${esc(mm(p.radius))}` : ''}</text>
  </svg>`;
}

// Frez / wiertło — chwyt, część robocza ze spiralą, zakończenie wg rodzaju
function drawMill(t, { w = 80, horizontal = false } = {}) {
  const p = t.params || {}; const id = `tg${++toolUid}`;
  const D = Number(p.D) || 10, sh = Number(p.shank) || D;
  const k = 40 / Math.max(D, sh);
  const wd = D * k, ws = sh * k, cx = 40;
  const Ltot = Number(p.L) || D * 6, Lc = Math.min(Number(p.Lc) || Math.min(D * 2, Ltot * 0.3), Ltot * 0.8);
  const total = 186, sc = total / Ltot;
  const lc = Math.max(20, Math.min(total * 0.62, Lc * sc));
  const neck = p.Lc && p.reach && Number(p.reach) > Number(p.Lc) ? // szyjka tylko gdy l1 > rzeczywiste Lc
    Math.max(6, Math.min(total * 0.8 - lc, (p.reach - Lc) * sc)) : 0;
  const yTip = 194, yCut = yTip - lc, yNeck = yCut - neck, yShank = yTip - total;
  const wn = wd * 0.82; // szyjka — podcięta poniżej średnicy ostrza
  const parts = [];
  const topW = neck ? wn : wd;
  parts.push(`<rect x="${cx - ws / 2}" y="${yShank}" width="${ws}" height="${yNeck - yShank - (topW !== ws ? 8 : 0)}" rx="1.5" fill="url(#${id}s)" stroke="#2a3036" stroke-width=".8"/>`);
  if (topW !== ws) parts.push(`<path d="M${cx - ws / 2} ${yNeck - 8} L${cx + ws / 2} ${yNeck - 8} L${cx + topW / 2} ${yNeck} L${cx - topW / 2} ${yNeck} Z" fill="url(#${id}s)" stroke="#2a3036" stroke-width=".8"/>`);
  if (neck) parts.push(`<rect x="${cx - wn / 2}" y="${yNeck}" width="${wn}" height="${neck}" fill="url(#${id}s)" stroke="#2a3036" stroke-width=".8"/>`);
  const r = p.type === 'kulisty' ? wd / 2 : p.type === 'torusowy' ? Math.max(0.5, Math.min(wd / 2 - 0.5, Math.max(1, (Number(p.r) || D * 0.1) * k))) : 0;
  let end;
  const L = cx - wd / 2, R = cx + wd / 2;
  if (p.type === 'wiertlo' || p.type === 'fazownik') {
    const ang = (Number(p.angle) || (p.type === 'wiertlo' ? 140 : 90)) / 2;
    const h = Math.min(lc - 4, (wd / 2) / Math.tan((Math.max(5, ang) * Math.PI) / 180)); // ostry kąt — szpic przycięty do części roboczej
    end = `M${L} ${yCut} H${R} V${yTip - h} L${cx} ${yTip} L${L} ${yTip - h} Z`;
    if (p.type === 'fazownik') end = `M${L} ${yCut} H${R} V${yCut + 6} L${cx + 2} ${yCut + 6 + h * 0.98} H${cx - 2} L${L} ${yCut + 6} Z`;
  } else if (r) {
    end = `M${L} ${yCut} H${R} V${yTip - r} A${r} ${r} 0 0 1 ${R - r} ${yTip} H${L + r} A${r} ${r} 0 0 1 ${L} ${yTip - r} Z`;
  } else end = `M${L} ${yCut} H${R} V${yTip} H${L} Z`;
  parts.push(`<clipPath id="${id}c"><path d="${end}"/></clipPath><path d="${end}" fill="url(#${id}k)" stroke="#2a3036" stroke-width=".8"/>`);
  // spirala ostrzy (ukośne pasy) albo zwoje gwintu
  const flutes = [];
  if (THREADED(p.type)) {
    const step = Math.max(2.5, Math.min(8, (Number(p.pitch) || 1.5) * sc));
    for (let y = yCut + 4; y < yTip - 2; y += step) flutes.push(`<path d="M${L} ${y} L${R} ${y + 2.5}" stroke="#1b1f23" stroke-width="1" opacity=".55"/>`);
  } else {
    const n = Math.max(2, Math.round(p.z || 3)); const step = Math.max(9, wd * 1.1);
    for (let y = yCut - wd; y < yTip + wd; y += step / Math.min(n, 4) * 2) flutes.push(`<path d="M${L - 2} ${y + wd * 0.9} L${R + 2} ${y}" stroke="#1b1f23" stroke-width="${Math.max(1.5, wd * 0.12)}" opacity=".38" stroke-linecap="round"/>`);
  }
  parts.push(`<g clip-path="url(#${id}c)">${flutes.join('')}</g>`);
  const shankTone = coatTone('');
  // linie wymiarowe: Lc (ostrze), l1 (z szyjką), L (całkowita)
  const dim = (x, y1, y2, label) => `<g class="tool-svg-dimline"><path d="M${x - 3} ${y1} h6 M${x - 3} ${y2} h6 M${x} ${y1} V${y2}" stroke="#2a3036" stroke-width=".7" fill="none"/>
    <text transform="translate(${x + 7} ${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle" class="tool-svg-dim">${esc(label)}</text></g>`;
  const dims = [];
  if (p.Lc) dims.push(dim(68, yCut, yTip, `Lc ${mm(p.Lc)}`));
  if (neck) dims.push(dim(68 + (p.Lc ? 14 : 0), yNeck, yTip, `l1 ${mm(p.reach)}`));
  if (p.L) dims.push(dim(68 + (p.Lc ? 14 : 0) + (neck ? 14 : 0), yShank, yTip, `L ${mm(p.L)}`));
  const label = `${THREADED(p.type) ? `${esc(p.thread || `Ø${mm(D)}`)}${p.pitch ? ` P${esc(mm(p.pitch))}` : ''}` : `Ø${esc(mm(D))}`}${p.z && !THREADED(p.type) ? ` z${esc(mm(p.z))}` : ''}${p.type === 'torusowy' && p.r ? ` R${esc(mm(p.r))}` : p.type === 'kulisty' ? ` R${esc(mm(D / 2))}` : ''}`;
  const aria = esc(`${MILL_LABEL[p.type] || 'Frez'}${p.thread ? ` ${p.thread}` : ''}${p.pitch ? ` skok ${mm(p.pitch)}` : ''} Ø${mm(D)}${p.z && p.type !== 'gwintownik' ? ` z${mm(p.z)}` : ''}${p.Lc ? `, ostrze ${mm(p.Lc)} mm` : ''}${p.reach ? `, użyteczna ${mm(p.reach)} mm` : ''}${p.L ? `, długość ${mm(p.L)} mm` : ''}`);
  if (horizontal) {
    // widok katalogowy: narzędzie leży poziomo (chwyt z lewej, ostrze z prawej), wymiary Lc / l1 / L pod spodem
    const hdim = (Y, x1, x2, txt) => `<g class="tool-svg-dimline"><path d="M${x1} ${Y - 3} v6 M${x2} ${Y - 3} v6 M${x1} ${Y} H${x2}" stroke="#2a3036" stroke-width=".7" fill="none"/>
      <text x="${(x1 + x2) / 2}" y="${Y - 2}" text-anchor="middle" class="tool-svg-dim tool-svg-dim-h">${esc(txt)}</text></g>`;
    const hd = [];
    let Y = 78;
    if (p.Lc) { hd.push(hdim(Y, yCut, yTip, `Lc ${mm(p.Lc)}`)); Y += 13; }
    if (neck) { hd.push(hdim(Y, yNeck, yTip, `l1 ${mm(p.reach)}`)); Y += 13; }
    if (p.L) { hd.push(hdim(Y, yShank, yTip, `L ${mm(p.L)}`)); Y += 13; }
    const vh = Math.max(66, Y - 4);
    return `<svg class="tool-svg tool-svg-h" viewBox="0 0 204 ${vh}" width="${w}" role="img" aria-label="${aria}">
    <defs>${metalDefs(`${id}s`, shankTone)}${metalDefs(`${id}k`, coatTone(p.coating))}</defs>
    <g transform="translate(0 80) rotate(-90)">${parts.join('')}</g>${hd.join('')}
    <text x="200" y="13" text-anchor="end" class="tool-svg-dim tool-svg-dim-h">${label}</text>
  </svg>`;
  }
  const vw = 80 + (p.Lc ? 14 : 0) + (neck ? 14 : 0) + (p.L ? 14 : 0);
  return `<svg class="tool-svg" viewBox="0 0 ${vw} 214" width="${Math.round(w * vw / 80)}" role="img" aria-label="${aria}">
    <defs>${metalDefs(`${id}s`, shankTone)}${metalDefs(`${id}k`, coatTone(p.coating))}</defs>
    ${parts.join('')}${dims.join('')}
    <text x="40" y="211" text-anchor="middle" class="tool-svg-dim">${label}</text>
  </svg>`;
}

function drawTool(t, opts) {
  return t.kind === 'oprawka' ? drawHolder(t, opts) : t.kind === 'glowica' ? drawHead(t, opts) : t.kind === 'plytka' ? drawInsert(t, opts) : drawMill(t, opts);
}

// ---------- Opis parametrów ----------
function toolFacts(t) {
  const p = t.params || {}; const f = [];
  const add = (l, v, u = '') => { if (v !== null && v !== undefined && v !== '') f.push([l, `${typeof v === 'number' ? mm(v) : v}${u}`]); };
  if (t.kind === 'oprawka') {
    add('Interfejs', p.interface); add('Rodzaj', HOLDER_LABEL[p.type] || p.type);
    if (p.type === 'trzpieniowa') add('Trzpień', p.arbor != null ? `Ø${mm(p.arbor)}` : null, ' mm');
    else add('Zacisk', p.clamp_min != null ? `Ø${mm(p.clamp_min)}${p.clamp_max && p.clamp_max !== p.clamp_min ? `–${mm(p.clamp_max)}` : ''}` : null, ' mm');
    add('Tulejka / nakrętka', p.collet); add('Wysięg od czoła wrzeciona', p.gauge, ' mm'); add('Maks. obroty', p.max_rpm != null ? Number(p.max_rpm).toLocaleString('pl-PL') : null, ' obr/min');
  } else if (t.kind === 'glowica') {
    add('Średnica D', p.D, ' mm'); add('Liczba ostrzy z', p.z); add('Gniazdo płytki', p.insert_code);
    add('Kąt przystawienia', p.lead, '°'); add('Maks. ap', p.ap_max, ' mm'); add('Wysokość H', p.H, ' mm'); add('Trzpień', p.arbor != null ? `Ø${mm(p.arbor)}` : null, ' mm'); add('Chwyt walcowy', p.shank != null ? `Ø${mm(p.shank)}` : null, ' mm');
  } else if (t.kind === 'plytka') {
    add('Kształt', SHAPE_LABEL[p.shape] || p.shape); add('Wielkość', p.size, ' mm'); add('Promień naroża', p.radius, ' mm'); add('Liczba krawędzi', p.edges);
    add('Gatunek', p.grade); add('Pokrycie', p.coating); add('Materiały', p.materials);
  } else {
    add('Rodzaj', MILL_LABEL[p.type] || p.type); add('Średnica D', p.D, ' mm'); add('Gwint', p.thread); add('Skok gwintu P', p.pitch, ' mm'); if (p.type !== 'gwintownik') add('Liczba ostrzy z', p.z); add('Chwyt', p.shank != null ? `Ø${mm(p.shank)}` : null, ' mm');
    add('Długość ostrza Lc', p.Lc, ' mm'); add('Długość użyteczna l1', p.reach, ' mm'); add('Długość całkowita L', p.L, ' mm'); add('Promień naroża', p.r, ' mm'); add('Kąt', p.angle, '°');
    add('Materiał', p.material); add('Pokrycie', p.coating);
  }
  return f;
}
function toolKeyLine(t) {
  const p = t.params || {};
  if (t.kind === 'oprawka') return [p.interface, HOLDER_LABEL[p.type], p.type === 'trzpieniowa' ? `trzpień Ø${mm(p.arbor)}` : p.clamp_min != null ? `Ø${mm(p.clamp_min)}${p.clamp_max && p.clamp_max !== p.clamp_min ? `–${mm(p.clamp_max)}` : ''}` : null].filter(Boolean).join(' · ');
  if (t.kind === 'glowica') return [`Ø${mm(p.D)}`, `z${mm(p.z)}`, p.insert_code, p.lead && p.lead !== 90 ? `${mm(p.lead)}°` : null].filter(Boolean).join(' · ');
  if (t.kind === 'plytka') return [p.grade, p.coating, p.materials ? `materiały ${p.materials}` : null].filter(Boolean).join(' · ');
  return [MILL_LABEL[p.type], p.thread || null, `Ø${mm(p.D)}`, p.pitch ? `P ${mm(p.pitch)}` : null, p.z && p.type !== 'gwintownik' ? `z${mm(p.z)}` : null, p.Lc ? `Lc ${mm(p.Lc)}` : null, p.reach ? `l1 ${mm(p.reach)}` : null, p.L ? `L ${mm(p.L)}` : null, p.material, p.coating].filter(Boolean).join(' · ');
}
function machineShort(id) {
  const m = S.boot.machines.find(x => x.id === id);
  return m ? m.name : 'uniwersalne';
}
// stan: 0–1 szt — czerwony, 2 szt — żółty (mało, zwrócić uwagę); poniżej ustawionego minimum — dopisek
const stockLevel = (q) => (q <= 1 ? 'red' : q === 2 ? 'yellow' : 'ok');
function stockTag(t) {
  return `<span class="st st-${stockLevel(t.qty)}" title="${t.qty <= 1 ? 'Bardzo mało na stanie' : t.qty === 2 ? 'Mało na stanie' : 'Stan'}"><b>${t.qty}</b> szt</span>${t.low ? ` <span class="small st-min">min. ${t.min_qty}</span>` : ''}`;
}

// ---------- Widok ----------
VIEWS.narzedzia = async (main) => {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const kind = TOOL_KIND[q.get('rodzaj')] ? q.get('rodzaj') : 'oprawka';
  const admin = isAdmin();
  const showAll = admin && q.get('wycofane') === '1';
  const list = await api(`/tools${showAll ? '?all=1' : ''}`);
  const byId = new Map(list.map(t => [t.id, t]));
  const machine = q.get('maszyna') || '';
  const text = (q.get('szukaj') || '').trim().toLowerCase();
  const match = (t) => (!machine || (machine === 'brak' ? !t.machine_id : t.machine_id === machine))
    && (!text || [t.name, t.code, t.manufacturer, t.catalog_no, t.location, toolKeyLine(t)].filter(Boolean).join(' ').toLowerCase().includes(text));
  const counts = Object.fromEntries(TOOL_TABS.map(([k]) => [k, list.filter(t => t.kind === k && match(t)).length]));
  const items = list.filter(t => t.kind === kind && match(t));
  const low = list.filter(t => t.active && (t.qty <= 2 || t.low)).sort((a, b) => a.qty - b.qty);
  const link = (patch) => { const n = new URLSearchParams(q); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } return `#/narzedzia?${n}`; };

  main.innerHTML = head('Narzędzia i oprawki',
    admin ? 'Wykaz oprawek, głowic, płytek i frezów z rysunkiem, stanem i tym, co do czego pasuje. Głowice i płytki dobierane są z parametrów (trzpień, gniazdo płytki); oprawki do frezów przypisujesz ręcznie w edycji frezu.'
      : 'Wykaz narzędzi prowadzi kierownik — tu możesz sprawdzić parametry, stan i co do czego pasuje.',
    admin ? btn('addTool', `Dodaj: ${TOOL_KIND[kind].single.toLowerCase()}`) : '') +
    `<nav class="section-tabs" aria-label="Rodzaj narzędzi">${TOOL_TABS.map(([k, l]) => `<a href="${link({ rodzaj: k })}" class="${k === kind ? 'active' : ''}" ${k === kind ? 'aria-current="page"' : ''}>${icon('cutter')}<span>${esc(l)}</span><span class="count">${counts[k]}</span></a>`).join('')}</nav>
    <form class="panel toolbar tl-filter" id="tlf">
      <label class="field">Maszyna<select name="maszyna"><option value="">wszystkie</option>${S.boot.machines.map(m => `<option value="${esc(m.id)}" ${machine === m.id ? 'selected' : ''}>${esc(m.name)}${m.name === 'Hartford' ? ' (BT50)' : m.name === 'Grimme' ? ' (HSK40)' : ''}</option>`).join('')}<option value="brak" ${machine === 'brak' ? 'selected' : ''}>uniwersalne (bez przypisania)</option></select></label>
      <label class="field">Szukaj<input name="szukaj" type="search" value="${esc(q.get('szukaj') || '')}" placeholder="np. APMT, Ø12, ER32, Sandvik"></label>
      ${admin ? `<label class="field inline"><input type="checkbox" name="wycofane" value="1" ${showAll ? 'checked' : ''}> pokaż wycofane</label>` : ''}
      <button class="primary">Filtruj</button>
    </form>
    ${low.length ? `<details class="panel tl-low"><summary>${icon('alert')} <b>Mało na stanie:</b> ${[['red', '0–1 szt', low.filter(t => t.qty <= 1).length], ['yellow', '2 szt', low.filter(t => t.qty === 2).length], ['min', 'poniżej minimum', low.filter(t => t.qty > 2).length]].filter(x => x[2]).map(([c, l, n]) => `<span class="st st-${c}"><b>${n}</b> ${l}</span>`).join(' ')} <span class="small muted">— pokaż listę</span></summary>
      <div class="tl-low-list">${low.map(t => `<button type="button" class="link" data-tool="${t.id}">${esc(t.name)} <span class="st st-${stockLevel(t.qty)}"><b>${t.qty}</b></span></button>`).join(' ')}</div></details>` : ''}
    <div class="tl-cat-wrap">${items.length ? toolCatalog(kind, items) : `<div class="empty">${list.some(t => t.kind === kind) ? 'Nic nie pasuje do filtra.' : admin ? `Brak pozycji. Dodaj pierwszą przyciskiem „Dodaj”.` : 'Kierownik nie wpisał jeszcze narzędzi tego rodzaju.'}</div>`}</div>`;

  $('#tlf').onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    location.hash = link({ maszyna: fd.get('maszyna'), szukaj: (fd.get('szukaj') || '').trim(), wycofane: fd.get('wycofane') });
  };
  on('addTool', () => toolForm(kind, null, list));
  $$('[data-tool]', main).forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const t = byId.get(Number(el.dataset.tool)); if (t) toolDetail(t, byId); }));
  // cały wiersz klikalny myszą/palcem; z klawiatury — przycisk z nazwą (czytniki ekranu ogłaszają go jako przycisk)
  $$('tr[data-row]', main).forEach(el => el.addEventListener('click', () => toolDetail(byId.get(Number(el.dataset.row)), byId)));
};

// Widok katalogowy: jedno narzędzie w wierszu — rysunek, najważniejsze dane, na końcu stan; reszta parametrów po kliknięciu
const CATALOG_COLS = {
  oprawka: [['Interfejs', p => p.interface], ['Rodzaj', p => HOLDER_LABEL[p.type] || p.type],
    ['Zacisk / trzpień', p => (p.type === 'trzpieniowa' ? `trzpień Ø${mm(p.arbor)}` : p.clamp_min != null ? `Ø${mm(p.clamp_min)}${p.clamp_max && p.clamp_max !== p.clamp_min ? `–${mm(p.clamp_max)}` : ''}` : '')],
    ['Wysięg', p => (p.gauge ? `${mm(p.gauge)} mm` : '')]],
  glowica: [['Średnica', p => `Ø${mm(p.D)}`], ['Ostrza', p => mm(p.z)], ['Gniazdo płytki', p => p.insert_code || ''], ['Kąt', p => (p.lead ? `${mm(p.lead)}°` : '')]],
  plytka: [['Kształt', p => p.shape || ''], ['Wielkość', p => `${mm(p.size)} mm${p.radius ? ` · r${mm(p.radius)}` : ''}`], ['Gatunek', p => p.grade || ''], ['Pokrycie', p => p.coating || '']],
  frez: [['Średnica', p => (THREADED(p.type) && p.thread ? `${p.thread} · Ø${mm(p.D)}` : `Ø${mm(p.D)}`)],
    ['Ostrza', p => (p.type === 'gwintownik' ? `skok ${mm(p.pitch)}` : `${mm(p.z)}${p.type === 'frez-gwintowy' && p.pitch ? ` · skok ${mm(p.pitch)}` : ''}`)],
    ['Materiał', p => [p.material, p.coating].filter(Boolean).join(' · ')]],
};
function toolCatalog(kind, items) {
  const cols = CATALOG_COLS[kind];
  const picW = kind === 'frez' ? 190 : kind === 'glowica' ? 120 : kind === 'oprawka' ? 44 : 56; // rysunek mniejszy — na pierwszym planie dane
  return `<table class="tl-table k-${kind}"><thead><tr><th class="tl-c-pic">Rysunek</th><th>Nazwa</th>${cols.map(([l]) => `<th>${esc(l)}</th>`).join('')}<th class="tl-c-st">Stan</th></tr></thead>
    <tbody>${items.map(t => {
      const theme = t.machine_id ? machineTheme(S.boot.machines.find(m => m.id === t.machine_id)) : '';
      return `<tr data-row="${t.id}" class="${theme ? `theme-${theme}` : 'tl-neutral'} ${t.active ? '' : 'tl-off'}">
        <td class="tl-c-pic"><div class="tl-pic-row">${drawTool(t, { w: picW, horizontal: true })}</div></td>
        <td class="tl-c-name" data-l="Nazwa"><button type="button" class="link tl-open mono" data-tool="${t.id}">${esc(t.name)}</button><span class="small muted">${[t.machine_id ? machineShort(t.machine_id) : 'uniwersalne', t.location, t.active ? '' : 'wycofane'].filter(Boolean).map(esc).join(' · ')}</span></td>
        ${cols.map(([l, f]) => `<td data-l="${esc(l)}">${esc(f(t.params || {}) || '—')}</td>`).join('')}
        <td class="tl-c-st" data-l="Stan">${stockTag(t)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

function toolDetail(t, byId) {
  const admin = isAdmin();
  const dlg = document.createElement('dialog');
  dlg.className = 'tl-dialog';
  const theme = t.machine_id ? machineTheme(S.boot.machines.find(m => m.id === t.machine_id)) : '';
  const big = t.kind === 'glowica' ? { w: 360 } : t.kind === 'oprawka' ? { w: 200 } : t.kind === 'frez' ? { w: 420, horizontal: true } : { w: 220 };
  const fits = (t.fits || []).map(f => byId.get(f.id) || f);
  const groups = TOOL_TABS.map(([k, l]) => [l, fits.filter(f => f.kind === k)]).filter(([, a]) => a.length);
  dlg.innerHTML = `<form method="dialog"><header><h3>${esc(TOOL_KIND[t.kind].single)}: <span class="mono">${esc(t.name)}</span></h3><button type="button" class="link" data-close aria-label="Zamknij">✕</button></header>
    <div class="content">
      <div class="tl-detail k-${t.kind} ${theme ? `theme-${theme}` : 'tl-neutral'}">
        <div class="tl-pic big">${drawTool(t, big)}</div>
        <div>
          <dl class="tl-facts">${toolFacts(t).map(([l, v]) => `<dt>${esc(l)}</dt><dd>${esc(v)}</dd>`).join('')}
            <dt>Maszyna</dt><dd>${esc(t.machine_id ? machineShort(t.machine_id) : 'uniwersalne')}</dd>
            ${t.manufacturer ? `<dt>Producent</dt><dd>${esc(t.manufacturer)}</dd>` : ''}${t.catalog_no ? `<dt>Nr katalogowy</dt><dd class="mono">${esc(t.catalog_no)}</dd>` : ''}
            ${t.code ? `<dt>Numer własny</dt><dd class="mono">${esc(t.code)}</dd>` : ''}${t.location ? `<dt>Lokalizacja</dt><dd>${esc(t.location)}</dd>` : ''}
            <dt>Stan</dt><dd>${stockTag(t)}${t.min_qty ? ` <span class="small muted">minimum ${t.min_qty}</span>` : ''}</dd>
          </dl>
          ${t.note ? `<p class="small">${esc(t.note)}</p>` : ''}
        </div>
      </div>
      <h4>${t.kind === 'frez' ? 'Przypisane oprawki' : 'Pasuje do'}</h4>
      ${groups.length ? groups.map(([l, a]) => `<div class="tl-fit-group"><span class="small muted">${esc(l)}</span><div class="tl-fit-row">${a.map(f => `<button type="button" class="tl-mini" data-open="${f.id}" title="${esc(f.name)}">${f.params ? drawTool(f, { w: f.kind === 'glowica' ? 120 : f.kind === 'frez' ? 140 : 56, horizontal: true }) : ''}<span class="small mono">${esc(f.name)}</span></button>`).join('')}</div></div>`).join('')
        : `<p class="small muted">${t.kind === 'plytka' ? 'Żadna głowica w wykazie nie ma gniazda pasującego do tej płytki.' : t.kind === 'frez' ? 'Nie przypisano oprawek — przypisuje kierownik w edycji frezu.' : 'Brak dopasowań w wykazie.'}</p>`}
      <p class="small muted">${t.kind === 'frez' ? 'Oprawki do frezu są przypisane ręcznie.' : t.kind === 'plytka' ? 'Dopasowanie liczone z gniazda głowicy.' : `Głowice i płytki dobierane z parametrów (trzpień, chwyt, gniazdo)${t.kind === 'oprawka' ? '; frezy — przypisane ręcznie' : ''} — przed użyciem sprawdź katalog producenta i wysięg.`}</p>
    </div>
    <footer>${admin ? `<button type="button" data-act="edit">Edytuj</button><button type="button" data-act="in">${icon('plus')}Przyjęcie</button><button type="button" data-act="out">Wydanie / zużycie</button>${t.active ? '<button type="button" class="danger" data-act="off">Wycofaj</button>' : '<button type="button" data-act="on">Przywróć</button>'}` : ''}<button type="button" class="primary" data-close>Zamknij</button></footer></form>`;
  document.body.appendChild(dlg);
  const back = document.activeElement;
  const restore = () => { if (back && back.isConnected && back.focus) back.focus(); };
  const close = () => { dlg.close(); dlg.remove(); restore(); };
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', close));
  dlg.addEventListener('cancel', () => { dlg.remove(); restore(); });
  $$('[data-open]', dlg).forEach(b => b.addEventListener('click', () => { const n = byId.get(Number(b.dataset.open)); if (n) { close(); toolDetail(n, byId); } }));
  const act = (name, fn) => { const b = $(`[data-act="${name}"]`, dlg); if (b) b.addEventListener('click', () => { close(); fn(); }); };
  act('edit', () => toolForm(t.kind, t, [...byId.values()]));
  act('in', () => stockForm(t, 1));
  act('out', () => stockForm(t, -1));
  act('off', () => confirmReason(`Wycofać z użytku: ${t.name}?`, 'Pozycja zniknie z wykazu dla zespołu (zostaje w historii i w widoku „pokaż wycofane”).', (reason) => post(`/tools/${t.id}`, { active: false, reason }, undefined, 'PUT'), 'Wycofaj'));
  act('on', () => confirmReason(`Przywrócić do użytku: ${t.name}?`, 'Pozycja wróci do wykazu widocznego dla zespołu.', (reason) => post(`/tools/${t.id}`, { active: true, reason }, undefined, 'PUT'), 'Przywróć'));
  dlg.showModal();
}


function stockForm(t, sign) {
  openForm({
    title: `${sign > 0 ? 'Przyjęcie' : 'Wydanie / zużycie'}: ${t.name}`,
    intro: `<p class="small">Teraz na stanie: <b>${t.qty} szt</b>. Każda zmiana trafia do historii z powodem.</p>`,
    fields: [
      { name: 'n', label: 'Ilość (szt)', type: 'number', min: 1, required: true },
      { name: 'reason', label: 'Powód', type: 'text', required: true, wide: true, help: sign > 0 ? 'np. dostawa, zwrot z maszyny' : 'np. zużyta krawędź, wydano na Grimme, uszkodzenie' },
    ],
    submitLabel: sign > 0 ? 'Przyjmij' : 'Wydaj',
    submit: (v, idem) => post(`/tools/${t.id}/stock`, { delta: sign * Number(v.n), reason: v.reason }, idem),
  });
}

function toolForm(kind, t = null, all = []) {
  const p = (t && t.params) || {};
  const num = (name, label, extra = {}) => ({ name: `p_${name}`, label, type: 'number', step: 'any', value: p[name] ?? '', ...extra });
  const txt = (name, label, extra = {}) => ({ name: `p_${name}`, label, value: p[name] ?? '', ...extra });
  const machines = S.boot.machines.map(m => [m.id, `${m.name}${m.name === 'Hartford' ? ' — BT50' : m.name === 'Grimme' ? ' — HSK40' : ''}`]);
  let params = [];
  if (kind === 'oprawka') {
    const clamp = (v) => v.p_type && v.p_type !== 'trzpieniowa';
    params = [
      txt('interface', 'Interfejs', { required: true, help: 'BT50 (Hartford), HSK40 (Grimme)' }),
      { name: 'p_type', label: 'Rodzaj', type: 'select', required: true, value: p.type || '', options: Object.entries(HOLDER_LABEL) },
      num('clamp_min', 'Zacisk od Ø (mm)', { show: clamp }), num('clamp_max', 'Zacisk do Ø (mm)', { show: clamp, help: 'dla termo / Weldon zwykle to samo co „od”' }),
      num('arbor', 'Trzpień Ø (mm)', { show: v => v.p_type === 'trzpieniowa' }),
      txt('collet', 'Tulejka / nakrętka', { show: v => v.p_type === 'tulejkowa', help: 'np. ER32' }),
      num('gauge', 'Wysięg od czoła wrzeciona (mm)'), num('max_rpm', 'Maks. obroty (obr/min)'),
    ];
  } else if (kind === 'glowica') {
    params = [num('D', 'Średnica D (mm)', { required: true }), num('z', 'Liczba ostrzy z', { required: true }),
      txt('insert_code', 'Gniazdo płytki', { help: 'początek oznaczenia płytki, np. APMT1604 — po nim wykaz dobiera płytki' }),
      num('lead', 'Kąt przystawienia (°)', { help: '90 — prostokątna, 45 — do planowania' }), num('ap_max', 'Maks. ap (mm)'), num('H', 'Wysokość głowicy H (mm)'),
      num('arbor', 'Trzpień Ø (mm)', { help: 'głowica nasadzana — dobiera oprawkę trzpieniową' }), num('shank', 'Chwyt walcowy Ø (mm)', { help: 'głowica z chwytem — dobiera oprawkę zaciskową' })];
  } else if (kind === 'plytka') {
    params = [{ name: 'p_shape', label: 'Kształt (ISO)', type: 'select', required: true, value: p.shape || '', options: Object.entries(SHAPE_LABEL) },
      num('size', 'Wielkość (mm)', { required: true, help: 'długość krawędzi / średnica' }), num('radius', 'Promień naroża r (mm)'), num('edges', 'Liczba krawędzi'),
      txt('grade', 'Gatunek'), txt('coating', 'Pokrycie', { help: 'np. TiAlN, TiN, PVD' }), txt('materials', 'Materiały', { help: 'P / M / K / N / S / H' })];
  } else {
    params = [{ name: 'p_type', label: 'Rodzaj', type: 'select', required: true, value: p.type || '', options: Object.entries(MILL_LABEL) },
      num('D', 'Średnica D (mm)', { required: true }), num('z', 'Liczba ostrzy z', { required: true, show: v => v.p_type !== 'gwintownik' }), num('shank', 'Chwyt Ø (mm)', { help: 'puste = jak D' }),
      num('pitch', 'Skok gwintu P (mm)', { required: true, show: v => THREADED(v.p_type), help: 'np. M10 → 1,5; M10x1 → 1' }),
      txt('thread', 'Oznaczenie gwintu', { show: v => THREADED(v.p_type), help: 'np. M10, M10x1, G1/4, UNC 1/4-20' }),
      num('Lc', 'Długość ostrza Lc (mm)', { required: true, show: v => v.p_type !== 'fazownik', help: 'część skrawająca; przy gwintowniku — długość gwintu' }),
      num('reach', 'Długość użyteczna l1 (mm)', { show: v => v.p_type !== 'fazownik', help: 'ostrze + szyjka (frez z podciętą szyjką); puste = jak Lc' }),
      num('L', 'Długość całkowita L (mm)', { required: true }),
      num('r', 'Promień naroża r (mm)', { show: v => v.p_type === 'torusowy' }), num('angle', 'Kąt (°)', { show: v => v.p_type === 'fazownik' || v.p_type === 'wiertlo' }),
      txt('material', 'Materiał', { help: 'VHM, HSS-E…' }), txt('coating', 'Pokrycie')];
  }
  // frez: oprawki przypisuje kierownik ręcznie (bez automatycznego dopasowania)
  const holderOpts = all.filter(h => h.kind === 'oprawka' && h.active).map(h => [h.id, `${h.name}${h.machine_id ? ` (${machineShort(h.machine_id)})` : ''}`]);
  const holderField = kind === 'frez' ? [{ name: 'holder_ids', label: 'Oprawki, w których używamy tego frezu', type: 'multi', wide: true, value: (t && t.holder_ids) || [], options: holderOpts }] : [];
  const fields = [
    { name: 'preview', type: 'info', html: '<div class="tl-preview" aria-live="polite"></div>' },
    { name: 'name', label: kind === 'plytka' ? 'Oznaczenie ISO płytki' : 'Oznaczenie / nazwa', required: true, value: t ? t.name : '', help: kind === 'plytka' ? 'np. APMT1604PDER-M2 — początek musi zgadzać się z gniazdem głowicy' : '' },
    { name: 'machine_id', label: 'Maszyna', type: 'select', value: t ? t.machine_id || '' : '', placeholder: '— uniwersalne —', options: machines },
    ...params,
    ...holderField,
    { name: 'manufacturer', label: 'Producent', value: t ? t.manufacturer || '' : '' },
    { name: 'catalog_no', label: 'Nr katalogowy', value: t ? t.catalog_no || '' : '' },
    { name: 'code', label: 'Numer własny', value: t ? t.code || '' : '' },
    { name: 'location', label: 'Lokalizacja', value: t ? t.location || '' : '', help: 'np. szafa 2 / szuflada B' },
    ...(t ? [] : [{ name: 'qty', label: 'Stan początkowy (szt)', type: 'number', min: 0, value: 0 }]),
    { name: 'min_qty', label: 'Stan minimalny (szt)', type: 'number', min: 0, value: t ? t.min_qty : 0, help: 'poniżej — czerwone oznaczenie' },
    { name: 'note', label: 'Uwagi', type: 'textarea', wide: true, value: t ? t.note || '' : '' },
    ...(t ? [{ name: 'reason', label: 'Powód zmiany (do historii)', wide: true }] : []),
  ];
  // tylko pola liczbowe zamieniane na liczby (tekst jak gniazdo „01604” zostaje tekstem); pola ukryte dla wybranego rodzaju pomijane
  const collect = (v) => {
    const out = {};
    for (const f of params) {
      const val = v[f.name];
      if (val === null || val === undefined || (f.show && !f.show(v))) continue;
      out[f.name.slice(2)] = f.type === 'number' && /^-?\d+([.,]\d+)?$/.test(String(val).trim()) ? Number(String(val).trim().replace(',', '.')) : val;
    }
    return out;
  };
  openForm({
    title: t ? `Edycja: ${t.name}` : `Nowa pozycja — ${TOOL_KIND[kind].single.toLowerCase()}`,
    fields,
    onChange: (v, form) => {
      const box = $('.tl-preview', form); if (!box) return;
      try { box.innerHTML = `<span class="small muted">Podgląd</span>${drawTool({ kind, name: v.name || '', machine_id: v.machine_id, params: collect(v) }, { w: kind === 'glowica' ? 240 : kind === 'frez' ? 70 : 110 })}`; } catch { box.innerHTML = ''; }
    },
    afterRender: (form) => form.dispatchEvent(new Event('change')),
    submit: (v, idem) => {
      const body = { ...(kind === 'frez' ? { holder_ids: (v.holder_ids || []).map(Number) } : {}), kind, name: v.name, machine_id: v.machine_id, manufacturer: v.manufacturer, catalog_no: v.catalog_no, code: v.code, location: v.location, note: v.note, min_qty: v.min_qty ?? 0, params: collect(v) };
      if (t) return post(`/tools/${t.id}`, { ...body, reason: v.reason }, idem, 'PUT');
      return post('/tools', { ...body, qty: v.qty ?? 0 }, idem);
    },
  });
}
