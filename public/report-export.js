// Zapis raportu do pliku: PDF (strony A4) i obraz PNG (jedna długa strona) — bez bibliotek.
// Każdy widok raportu buduje „dokument” (tytuł, kafelki, wykresy słupkowe, tabele, tekst), który jest rysowany na płótnie
// w stylu aplikacji: granatowy nagłówek z pomarańczowym akcentem, białe tło treści (czytelne po wydruku).
// PDF zawiera strony jako obrazy JPEG — tekstu w PDF nie da się zaznaczać (świadome uproszczenie bez bibliotek).
'use strict';

const RX = {
  W: 1240, H: 1754, M: 64,                 // A4 przy 150 dpi
  navy: '#0b1424', navy2: '#13213a', orange: '#ff7a1a', blue: '#2f8cff', ink: '#14202f', soft: '#5b6b80', line: '#d5dde8', zebra: '#f4f7fb',
  good: '#1e8a4f', bad: '#c62e25',
  font: '"Segoe UI", "Roboto", "Helvetica Neue", "DejaVu Sans", Arial, sans-serif',
  // kolory serii: maszyny (Hartford — szarości, Grimme — błękit) i pozostałe
  machine: { hartford: '#77818c', grimme: '#1d6fd6' },
  series: ['#ff7a1a', '#2f8cff', '#1baf7a', '#9b6bd6', '#c98500', '#e0584f'],
};

// ---------- Rysowanie ----------
function rxFont(ctx, size, weight = 400) { ctx.font = `${weight} ${size}px ${RX.font}`; }
function rxFit(ctx, text, w) {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= w) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(`${text.slice(0, mid)}…`).width <= w) lo = mid; else hi = mid - 1; }
  return `${text.slice(0, lo)}…`;
}
function rxWrap(ctx, text, w) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/)) {
      // bardzo długie słowo (np. ścieżka) — dzielone, żeby nie wyjść poza stronę
      while (ctx.measureText(word).width > w && word.length > 1) {
        let k = word.length - 1;
        while (k > 1 && ctx.measureText(word.slice(0, k)).width > w) k--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, k)); word = word.slice(k);
      }
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function rxRound(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
const rxNice = (v) => { if (!v || v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; };

// Blok → „atomy” o znanej wysokości (tabela dzieli się na wiersze, żeby można ją było łamać między stronami)
function rxAtoms(ctx, b, w) {
  const atoms = [];
  if (b.t === 'h') {
    atoms.push({ h: 58, keep: true, draw: (c, x, y) => { rxFont(c, 30, 700); c.fillStyle = RX.ink; c.fillText(b.text, x, y + 38); c.fillStyle = RX.orange; c.fillRect(x, y + 48, 56, 4); } });
  } else if (b.t === 'text') {
    rxFont(ctx, b.small ? 19 : 22);
    const lines = rxWrap(ctx, b.text, w);
    const lh = b.small ? 27 : 31;
    lines.forEach((ln) => atoms.push({ h: lh, draw: (c, x, y) => { rxFont(c, b.small ? 19 : 22, b.bold ? 700 : 400); c.fillStyle = b.muted ? RX.soft : RX.ink; c.fillText(ln, x, y + lh - 8); } }));
    atoms.push({ h: 12, draw: () => {} });
  } else if (b.t === 'kpis') {
    const per = b.per || (b.items.length >= 4 ? 4 : b.items.length || 1), gap = 18, tw = (w - gap * (per - 1)) / per, th = 150;
    for (let i = 0; i < b.items.length; i += per) {
      const row = b.items.slice(i, i + per);
      atoms.push({ h: th + gap, draw: (c, x, y) => row.forEach((k, j) => {
        const tx = x + j * (tw + gap);
        rxRound(c, tx, y, tw, th, 14); c.fillStyle = '#f6f8fc'; c.fill(); c.strokeStyle = RX.line; c.lineWidth = 2; c.stroke();
        c.fillStyle = k.color || RX.orange; c.fillRect(tx, y + 18, 6, th - 36);
        rxFont(c, 19, 600); c.fillStyle = RX.soft; c.fillText(rxFit(c, String(k.label).toUpperCase(), tw - 40), tx + 26, y + 38);
        let fs = k.big === false ? 30 : 40; rxFont(c, fs, 800);
        while (fs > 20 && c.measureText(String(k.value)).width > tw - 40) { fs -= 2; rxFont(c, fs, 800); }
        c.fillStyle = RX.ink; c.fillText(rxFit(c, k.value, tw - 40), tx + 26, y + 88);
        if (k.sub) { rxFont(c, 18, k.tone ? 700 : 400); c.fillStyle = k.tone === 'good' ? RX.good : k.tone === 'bad' ? RX.bad : RX.soft; c.fillText(rxFit(c, k.sub, tw - 40), tx + 26, y + 124); }
      }) });
    }
  } else if (b.t === 'bars') {
    const cats = b.categories, ser = b.series.filter(s => s.values.some(v => v !== null && v !== undefined));
    const H = b.height || 470;
    atoms.push({ h: H + 26, keep: true, draw: (c, x, y) => {
      rxFont(c, 24, 700); c.fillStyle = RX.ink; c.fillText(b.title || '', x, y + 28);
      // legenda
      let lx = x; const ly = y + 52;
      if (ser.length > 1) ser.forEach((s, i) => { c.fillStyle = s.color || RX.series[i % RX.series.length]; rxRound(c, lx, ly - 14, 18, 18, 4); c.fill(); rxFont(c, 18); c.fillStyle = RX.ink; c.fillText(s.name, lx + 26, ly); lx += 40 + c.measureText(s.name).width; });
      const L = x + 86, R = x + w, T = y + 76, B = y + H - 56;
      const all = ser.flatMap(s => s.values).filter(v => v !== null && v !== undefined);
      const hi = rxNice(Math.max(0, ...all) / 4) * 4, lo = Math.min(0, ...all) < 0 ? -rxNice(-Math.min(...all) / 4) * 4 : 0;
      const yv = (v) => T + (B - T) * (1 - (v - lo) / (hi - lo || 1));
      const fmt = b.fmt || ((v) => String(Math.round(v * 10) / 10).replace('.', ','));
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4, yy = yv(v);
        c.strokeStyle = '#e6ebf2'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(L, yy); c.lineTo(R, yy); c.stroke();
        rxFont(c, 17); c.fillStyle = RX.soft; c.textAlign = 'right'; c.fillText(fmt(v), L - 10, yy + 6); c.textAlign = 'left';
      }
      const gw = (R - L) / Math.max(1, cats.length), n = Math.max(1, ser.length), gap = 4;
      const bw = Math.min(64, (gw * 0.74 - gap * (n - 1)) / n);
      cats.forEach((cat, ci) => {
        const gx = L + ci * gw + (gw - (bw * n + gap * (n - 1))) / 2;
        ser.forEach((s, si) => {
          const v = s.values[ci]; if (v === null || v === undefined) return;
          const bx = gx + si * (bw + gap), y0 = yv(Math.max(0, v)), y1 = yv(Math.min(0, v));
          const col = s.color || RX.series[si % RX.series.length];
          const gr = c.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, col); gr.addColorStop(1, rxShade(col, -0.28));
          c.fillStyle = gr; rxRound(c, bx, y0, bw, Math.max(2, y1 - y0), Math.min(6, bw / 2)); c.fill();
          if (b.values !== false && bw >= 18) { rxFont(c, bw > 34 ? 16 : 13, 700); c.fillStyle = RX.ink; c.textAlign = 'center'; c.fillText(fmt(v), bx + bw / 2, v >= 0 ? y0 - 6 : y1 + 18); c.textAlign = 'left'; }
        });
        rxFont(c, cats.length > 14 ? 14 : 17); c.fillStyle = RX.soft; c.textAlign = 'center'; c.fillText(rxFit(c, cat, gw - 4), L + ci * gw + gw / 2, B + 28); c.textAlign = 'left';
      });
      c.strokeStyle = RX.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(L, yv(0)); c.lineTo(R, yv(0)); c.stroke();
    } });
  } else if (b.t === 'table') {
    const cols = b.head.length;
    const wsum = b.widths ? b.widths.reduce((s, f) => s + f, 0) || 1 : 1;
    const widths = b.widths ? b.widths.map(f => (f / wsum) * w) : Array.from({ length: cols }, (_, i) => (i === 0 ? w * 0.3 : (w * 0.7) / Math.max(1, cols - 1)));
    const align = b.align || b.head.map((_, i) => (i === 0 ? 'l' : 'r'));
    const rh = 40;
    const drawRow = (c, x, y, cells, head, zebra) => {
      if (head) { c.fillStyle = RX.navy; c.fillRect(x, y, w, rh); }
      else if (zebra) { c.fillStyle = RX.zebra; c.fillRect(x, y, w, rh); }
      let cx = x;
      cells.forEach((v, i) => {
        const cw = widths[i];
        rxFont(c, head ? 16 : 18, head || (b.boldFirst && i === 0) ? 700 : 400);
        const val = v && typeof v === 'object' ? v : { text: v };
        if (head) { let fs = 16; while (fs > 11 && c.measureText(String(val.text ?? '').toUpperCase()).width > cw - 20) { fs -= 1; rxFont(c, fs, 700); } }
        c.fillStyle = head ? '#ffffff' : val.tone === 'good' ? RX.good : val.tone === 'bad' ? RX.bad : RX.ink;
        if (val.tone && !head) rxFont(c, 18, 700);
        const txt = rxFit(c, head ? String(val.text ?? '').toUpperCase() : (val.text ?? '—'), cw - 20);
        if (align[i] === 'r') { c.textAlign = 'right'; c.fillText(txt, cx + cw - 10, y + 27); c.textAlign = 'left'; } else c.fillText(txt, cx + 10, y + 27);
        cx += cw;
      });
      c.strokeStyle = RX.line; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + rh); c.lineTo(x + w, y + rh); c.stroke();
    };
    const headAtom = { h: (b.title ? 44 : 0) + rh, keep: true, draw: (c, x, y) => { if (b.title) { rxFont(c, 24, 700); c.fillStyle = RX.ink; c.fillText(b.title, x, y + 28); } drawRow(c, x, y + (b.title ? 44 : 0), b.head, true); } };
    atoms.push(headAtom);
    if (!b.rows.length) atoms.push({ h: rh, draw: (c, x, y) => { rxFont(c, 18); c.fillStyle = RX.soft; c.fillText(b.empty || 'Brak danych w wybranym okresie.', x + 10, y + 27); } });
    b.rows.forEach((r, i) => atoms.push({ h: rh, row: true, repeat: { h: rh, draw: (c, x, y) => drawRow(c, x, y, b.head, true) }, draw: (c, x, y) => drawRow(c, x, y, r, false, i % 2 === 1) }));
    atoms.push({ h: 22, draw: () => {} });
  } else if (b.t === 'space') atoms.push({ h: b.h || 20, draw: () => {} });
  return atoms;
}
function rxShade(hex, f) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16); const ch = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * (1 + f))));
  return `#${[16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function rxHeader(c, doc, page, pages) {
  const W = RX.W;
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, RX.navy); g.addColorStop(1, RX.navy2);
  c.fillStyle = g; c.fillRect(0, 0, W, page === 1 ? 210 : 96);
  // siatka w tle nagłówka (motyw HUD)
  c.strokeStyle = 'rgba(80,140,230,.13)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, page === 1 ? 210 : 96); c.stroke(); }
  c.fillStyle = RX.orange; c.fillRect(0, page === 1 ? 206 : 92, W, 4);
  if (page === 1) {
    rxFont(c, 20, 700); c.fillStyle = '#8fb6ea'; c.fillText(`CNC TEAM${doc.company ? ` · ${doc.company.toUpperCase()}` : ''}`, RX.M, 52);
    rxFont(c, 46, 800); c.fillStyle = '#ffffff'; c.fillText(rxFit(c, doc.title, W - RX.M * 2), RX.M, 112);
    rxFont(c, 26, 700); c.fillStyle = RX.orange; c.fillText(rxFit(c, doc.subtitle || '', W - RX.M * 2), RX.M, 152);
    rxFont(c, 18); c.fillStyle = '#9fb0c8'; c.fillText(rxFit(c, doc.meta || '', W - RX.M * 2), RX.M, 186);
  } else {
    rxFont(c, 24, 700); c.fillStyle = '#ffffff'; c.fillText(rxFit(c, doc.title, W - RX.M * 2 - 200), RX.M, 58);
    rxFont(c, 18); c.fillStyle = '#9fb0c8'; c.textAlign = 'right'; c.fillText(`strona ${page} z ${pages}`, W - RX.M, 58); c.textAlign = 'left';
  }
}
function rxFooter(c, doc, page, pages, H) {
  c.strokeStyle = RX.line; c.lineWidth = 1; c.beginPath(); c.moveTo(RX.M, H - 60); c.lineTo(RX.W - RX.M, H - 60); c.stroke();
  rxFont(c, 16); c.fillStyle = RX.soft;
  c.fillText(rxFit(c, doc.footer || 'CNC Team — raport wewnętrzny', RX.W - RX.M * 2 - 200), RX.M, H - 30);
  if (pages) { c.textAlign = 'right'; c.fillText(`${page} / ${pages}`, RX.W - RX.M, H - 30); c.textAlign = 'left'; }
}

// Układ: strony A4 (PDF) albo jedna długa strona (PNG)
function rxLayout(doc, mode) {
  const probe = document.createElement('canvas').getContext('2d');
  const w = RX.W - RX.M * 2;
  const atoms = doc.blocks.flatMap(b => rxAtoms(probe, b, w));
  if (mode === 'long') {
    const top = 250, total = top + atoms.reduce((s, a) => s + a.h, 0) + 100;
    return [{ height: Math.max(900, total), items: (() => { let y = top; return atoms.map(a => { const it = { a, y }; y += a.h; return it; }); })() }];
  }
  const pages = []; let cur = null, y = 0;
  const bottom = RX.H - 80;
  const newPage = () => { cur = { height: RX.H, items: [] }; pages.push(cur); y = pages.length === 1 ? 250 : 130; };
  newPage();
  atoms.forEach((a, i) => {
    // nagłówek bloku nie zostaje sam na dole strony
    const need = a.keep ? a.h + (atoms[i + 1] && atoms[i + 1].row ? atoms[i + 1].h : 0) : a.h;
    if (y + need > bottom && cur.items.length) { newPage(); if (a.row && a.repeat) { cur.items.push({ a: a.repeat, y }); y += a.repeat.h; } }
    cur.items.push({ a, y }); y += a.h;
  });
  return pages;
}
function rxRender(doc, mode = 'pages') {
  const pages = rxLayout(doc, mode);
  return pages.map((p, i) => {
    const cv = document.createElement('canvas'); cv.width = RX.W; cv.height = p.height;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    rxHeader(c, doc, i + 1, pages.length);
    for (const it of p.items) it.a.draw(c, RX.M, it.y);
    rxFooter(c, doc, i + 1, mode === 'long' ? 0 : pages.length, cv.height);
    return cv;
  });
}

// ---------- PDF (strony jako obrazy JPEG) ----------
async function rxPdf(canvases, title) {
  const enc = new TextEncoder();
  const parts = []; let len = 0; const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const imgs = await Promise.all(canvases.map(cv => new Promise((res, rej) => cv.toBlob(b => (b ? b.arrayBuffer().then(a => res(new Uint8Array(a)), rej) : rej(new Error('przeglądarka nie utworzyła obrazu strony'))), 'image/jpeg', 0.9))));
  const n = canvases.length;
  // obiekty: 1 katalog, 2 strony, 3 info, potem na stronę: strona, obraz, treść
  const pageObj = (i) => 4 + i * 3;
  push('%PDF-1.4\n');
  const obj = (id, body) => { offsets[id] = len; push(`${id} 0 obj\n`); if (typeof body === 'string') push(body); else body(); push('\nendobj\n'); };
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`);
  const pdfStr = (s) => `<FEFF${String(s).split('').map(ch => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}>`; // UTF-16 (z parami zastępczymi)
  obj(3, `<< /Title ${pdfStr(title)} /Producer (CNC Team) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);
  canvases.forEach((cv, i) => {
    const pw = 595.28, ph = (cv.height / cv.width) * pw; // szerokość A4 w punktach
    const id = pageObj(i);
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] /Resources << /XObject << /Im${i} ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    obj(id + 1, () => { push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgs[i].length} >>\nstream\n`); push(imgs[i]); push('\nendstream'); });
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(id + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const total = 4 + n * 3;
  const xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

// ---------- Pobieranie i udostępnianie ----------
function rxFileName(doc, ext) {
  const base = String(doc.file || doc.title || 'raport').replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80);
  return `${base || 'raport'}.${ext}`;
}
function rxDownload(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
async function rxMakeFile(doc, kind) {
  if (kind === 'pdf') return new File([await rxPdf(rxRender(doc, 'pages'), doc.title)], rxFileName(doc, 'pdf'), { type: 'application/pdf' });
  // jeden obraz: limit wysokości płótna (telefony ~16 mln pikseli) — dłuższy raport tylko jako PDF
  if (rxLayout(doc, 'long')[0].height > 12000) throw new Error('raport jest za długi na jeden obraz — zapisz PDF (strony A4) albo zawęź okres');
  const [cv] = rxRender(doc, 'long');
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  if (!blob) throw new Error('przeglądarka nie utworzyła obrazu — zapisz PDF');
  return new File([blob], rxFileName(doc, 'png'), { type: 'image/png' });
}
function rxDocMeta(doc) {
  const now = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });
  return { company: (S.boot && S.boot.settings && S.boot.settings.company_name) || '', ...doc,
    meta: `${doc.meta ? `${doc.meta} · ` : ''}wygenerowano ${now} · ${S.me ? S.me.display_name : ''}`,
    footer: doc.footer || 'CNC Team — raport wewnętrzny. Dane z aplikacji w chwili zapisu pliku.' };
}
// Przyciski w pasku narzędzi widoku: PDF, obraz PNG, „Wyślij” (telefon: udostępnianie systemowe)
function exportTools() {
  return `<span class="export-tools no-print"><button type="button" class="btn-export" data-export="pdf">${icon('download')}PDF</button><button type="button" class="btn-export" data-export="png">${icon('download')}Obraz PNG</button>${navigator.canShare ? `<button type="button" class="btn-export" data-export="share">${icon('summons')}Wyślij</button>` : ''}</span>`;
}
function bindExport(root, getDoc) {
  $$('[data-export]', root).forEach(b => b.onclick = async () => {
    const kind = b.dataset.export;
    const busy = $$('[data-export]', root); busy.forEach(x => { x.disabled = true; });
    try {
      const doc = rxDocMeta(getDoc());
      if (kind === 'share') {
        const f = await rxMakeFile(doc, 'pdf');
        if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: doc.title, text: doc.subtitle || doc.title });
        else { rxDownload(f, f.name); toast('To urządzenie nie wysyła plików bezpośrednio — zapisano PDF.', 'warn'); }
      } else {
        const f = await rxMakeFile(doc, kind);
        rxDownload(f, f.name);
        toast(kind === 'pdf' ? 'Zapisano PDF.' : 'Zapisano obraz PNG.');
      }
    } catch (e) { if (e && e.name !== 'AbortError') toast(`Nie udało się zapisać pliku: ${e.message || e}`, 'err'); }
    finally { busy.forEach(x => { x.disabled = false; }); }
  });
}
// Pomocnicze do budowy dokumentów
const rxH = (m) => (m === null || m === undefined ? '—' : hShort(m));
const rxHours = (m) => (m === null || m === undefined ? null : Math.round(m / 6) / 10);
const rxHfmt = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`;
const rxPct = (v, plus = false) => (v === null || v === undefined ? '—' : `${plus && v > 0 ? '+' : ''}${String(v).replace('.', ',')}%`);
const rxMachineColor = (m) => (machineTheme(m) === 'grimme' ? RX.machine.grimme : RX.machine.hartford);
