// Wspólne elementy interfejsu: API, formatowanie, formularze, tabele, wykresy.
'use strict';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

class ApiError extends Error { constructor(status, msg, details) { super(msg); this.status = status; this.details = details; } }

async function api(path, { method = 'GET', body, raw, idem } = {}) {
  const headers = {};
  if (method !== 'GET') {
    headers['X-CNC-Request'] = '1';
    headers['Idempotency-Key'] = idem || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
  }
  let payload;
  if (raw !== undefined) { payload = raw; headers['Content-Type'] = 'application/json'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    // Telefon poza siecią firmową lub serwer wyłączony — dane nie są przechowywane offline.
    throw new ApiError(0, 'Brak połączenia z serwerem CNC Team. Sprawdź, czy telefon jest w sieci firmowej, a komputer z aplikacją jest włączony.');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') { window.dispatchEvent(new Event('cnc-logout')); }
    throw new ApiError(res.status, (data && data.error) || `Błąd ${res.status}`, data && data.details);
  }
  return data;
}

function toast(msg, kind = '', ms = 0) {
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms || (kind === 'err' ? 9000 : 5000));
}

// Czas zawsze jako godziny i minuty
function hm(min) {
  if (min === null || min === undefined || Number.isNaN(min)) return '<span class="muted">brak danych</span>';
  const s = min < 0 ? '−' : ''; const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)} h ${String(a % 60).padStart(2, '0')} min`;
}
const hmText = (min) => hm(min).replace(/<[^>]+>/g, '');
function pct(v) { return v === null || v === undefined ? '<span class="muted">brak danych</span>' : `${v}%`; }
const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const DOW = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'];
function addDays(d, n) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); }
function lastDay(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function weekday(d) { const [y, m, dd] = d.split('-').map(Number); const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return w === 0 ? 7 : w; }
function plDate(d) { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; }
function plMonth(ym) { const [y, m] = ym.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; }
function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
function initials(e) { return e ? (e.first_name[0] + e.last_name[0]).toUpperCase() : '?'; }

function tag(text, kind = '', ic) { return `<span class="tag ${kind}">${ic ? icon(ic) : ''}${esc(text)}</span>`; }

// ---------- Tabela ----------
// columns: [{ key, label, fmt: 'hm'|'pct'|'date'|fn, num, html }]
function table(columns, rows, { empty = 'Brak wpisów.', rowClass } = {}) {
  if (!rows || !rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const cell = (c, r) => {
    const v = typeof c.key === 'function' ? c.key(r) : r[c.key];
    if (typeof c.fmt === 'function') return c.fmt(v, r);
    if (c.fmt === 'hm') return hm(v);
    if (c.fmt === 'pct') return pct(v);
    if (c.fmt === 'date') return plDate(v);
    if (v === null || v === undefined) return '<span class="muted">brak danych</span>';
    return c.html ? v : esc(v);
  };
  const num = (c) => c.num || c.fmt === 'hm' || c.fmt === 'pct';
  return `<div class="table-wrap"><table class="stack"><thead><tr>${columns.map(c => `<th class="${num(c) ? 'num' : ''}" scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(r => `<tr class="${rowClass ? rowClass(r) : ''}">${columns.map(c => `<td class="${num(c) ? 'num' : ''}" data-label="${esc(c.label)}"><span class="cv">${cell(c, r)}</span></td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
}

// ---------- Wykres słupkowy (zawsze z tabelą danych obok) ----------
function barChart(rows, labelKey, valueKey, value2Key, { unit = 'min', names = [] } = {}) {
  const data = rows.filter(r => r[valueKey] !== null && r[valueKey] !== undefined || (value2Key && r[value2Key] != null)).slice(0, 30);
  if (!data.length) return '<div class="empty">Brak danych do wykresu.</div>';
  const max = Math.max(1, ...data.map(r => Math.max(r[valueKey] || 0, value2Key ? (r[value2Key] || 0) : 0)));
  const rowH = 22, labelW = 190, w = 720, plotW = w - labelW - 90;
  const h = data.length * rowH * (value2Key ? 1.6 : 1) + 24;
  const fmtV = (v) => v == null ? 'brak danych' : unit === 'pct' ? `${v}%` : unit === 'n' ? String(v) : hmText(v);
  let y = 8; const bars = [];
  for (const r of data) {
    const lbl = String(r[labelKey]).slice(0, 30);
    bars.push(`<text x="${labelW - 6}" y="${y + 13}" text-anchor="end">${esc(lbl)}</text>`);
    const w1 = Math.max(0, ((r[valueKey] || 0) / max) * plotW);
    bars.push(`<rect class="b1" x="${labelW}" y="${y + 3}" width="${w1}" height="12"><title>${esc(lbl)}: ${esc(fmtV(r[valueKey]))}</title></rect><text x="${labelW + w1 + 4}" y="${y + 13}">${esc(fmtV(r[valueKey]))}</text>`);
    y += rowH * (value2Key ? 0.6 : 1);
    if (value2Key) {
      const w2 = Math.max(0, ((r[value2Key] || 0) / max) * plotW);
      bars.push(`<rect class="b2" x="${labelW}" y="${y + 3}" width="${w2}" height="10"><title>${esc(lbl)}: ${esc(fmtV(r[value2Key]))}</title></rect><text x="${labelW + w2 + 4}" y="${y + 12}">${esc(fmtV(r[value2Key]))}</text>`);
      y += rowH;
    }
  }
  const legend = names.length ? `<div class="legend"><span><i style="background:var(--c-accent)"></i>${esc(names[0])}</span>${names[1] ? `<span><i style="background:var(--c-steel)"></i>${esc(names[1])}</span>` : ''}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Wykres słupkowy — wartości w tabeli poniżej"><line class="axis" x1="${labelW}" y1="0" x2="${labelW}" y2="${h}"/>${bars.join('')}</svg>`;
}

// ---------- Formularz w oknie dialogowym ----------
// fields: [{ name, label, type, options:[[v,l]], value, required, help, wide, min, max, show(values) }]
function fieldHtml(f) {
  const id = `f_${f.name}`;
  const req = f.required ? 'required' : '';
  const v = f.value ?? '';
  let input;
  switch (f.type) {
    case 'select':
      input = `<select id="${id}" name="${f.name}" ${req}>${f.placeholder !== false ? `<option value="">${esc(f.placeholder || '— wybierz —')}</option>` : ''}${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`; break;
    case 'multi':
      input = `<div class="form-grid" id="${id}">${(f.options || []).map(([ov, ol]) => `<label class="field inline"><input type="checkbox" name="${f.name}" value="${esc(ov)}" ${(v || []).map(String).includes(String(ov)) ? 'checked' : ''}> ${esc(ol)}</label>`).join('')}</div>`; break;
    case 'textarea': input = `<textarea id="${id}" name="${f.name}" ${req}>${esc(v)}</textarea>`; break;
    case 'checkbox': return `<label class="field inline ${f.wide ? 'wide' : ''}" data-f="${f.name}"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${esc(f.label)}${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}</label>`;
    case 'hm': {
      const n = Number(v) || 0; const neg = n < 0; const a = Math.abs(n);
      input = `<div class="hm" id="${id}">${f.signed ? `<select name="${f.name}__sign"><option value="1">+</option><option value="-1" ${neg ? 'selected' : ''}>−</option></select>` : ''}<input type="number" min="0" name="${f.name}__h" value="${v === '' ? '' : Math.floor(a / 60)}" aria-label="${esc(f.label)} — godziny"> h <input type="number" min="0" max="59" name="${f.name}__m" value="${v === '' ? '' : a % 60}" aria-label="${esc(f.label)} — minuty"> min</div>`;
      break;
    }
    default:
      input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${req} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''}>`;
  }
  return `<label class="field ${f.wide ? 'wide' : ''}" data-f="${f.name}" for="${id}">${esc(f.label)}${f.required ? ' *' : ''}${input}${f.help ? `<span class="help">${esc(f.help)}</span>` : ''}</label>`;
}

function readForm(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'checkbox') out[f.name] = form.elements[f.name].checked;
    else if (f.type === 'multi') out[f.name] = $$(`input[name="${f.name}"]:checked`, form).map(i => i.value);
    else if (f.type === 'hm') {
      const hh = form.elements[`${f.name}__h`].value, mm = form.elements[`${f.name}__m`].value;
      if (hh === '' && mm === '') out[f.name] = null;
      else {
        let v = (Number(hh) || 0) * 60 + (Number(mm) || 0);
        if (f.signed) v *= Number(form.elements[`${f.name}__sign`].value);
        out[f.name] = v;
      }
    } else if (f.type === 'info') continue;
    else out[f.name] = form.elements[f.name] ? form.elements[f.name].value : undefined;
    if (out[f.name] === '') out[f.name] = null;
  }
  return out;
}

function describeError(e) {
  let msg = e.message;
  const d = e.details;
  if (d && d.errors) msg += '\n• ' + d.errors.join('\n• ');
  if (d && d.entries) msg += '\nWpisy: ' + d.entries.map(x => `#${x.id} (${x.unit}, ${x.start_date})`).join(', ');
  return msg;
}

// Okno z formularzem. submit(values) → wynik; okno zamyka się po sukcesie. Przycisk blokowany (ochrona przed podwójnym zapisem).
function openForm({ title, fields, submit, submitLabel = 'Zapisz', intro = '', onChange, afterRender }) {
  const dlg = document.createElement('dialog');
  const idem = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  dlg.innerHTML = `<form method="dialog" novalidate><header><h3>${esc(title)}</h3><button type="button" class="link" data-close aria-label="Zamknij">✕</button></header>
    <div class="content">${intro}<div class="form-grid">${fields.map(f => f.type === 'info' ? `<div class="wide" data-f="${f.name}">${f.html}</div>` : fieldHtml(f)).join('')}</div><div class="form-error" role="alert"></div></div>
    <footer><button type="button" data-close>Anuluj</button><button type="submit" class="primary">${esc(submitLabel)}</button></footer></form>`;
  document.body.appendChild(dlg);
  const form = $('form', dlg);
  const refresh = () => {
    const vals = readForm(form, fields);
    for (const f of fields) if (f.show) $(`[data-f="${f.name}"]`, form).classList.toggle('hidden', !f.show(vals));
    if (onChange) onChange(vals, form);
  };
  form.addEventListener('change', refresh); form.addEventListener('input', () => onChange && onChange(readForm(form, fields), form));
  $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => { dlg.close(); dlg.remove(); }));
  dlg.addEventListener('cancel', () => dlg.remove());
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('button[type=submit]', form);
    btn.disabled = true; $('.form-error', form).textContent = '';
    try {
      const vals = readForm(form, fields);
      for (const f of fields) if (f.required && (vals[f.name] === null || vals[f.name] === undefined) && !(f.show && !f.show(vals))) throw new Error(`Uzupełnij pole „${f.label}”.`);
      const res = await submit(vals, idem);
      dlg.close(); dlg.remove();
      if (res && res.warnings && res.warnings.length) res.warnings.forEach(w => toast(w, 'warn'));
    } catch (e) {
      $('.form-error', form).textContent = describeError(e);
      btn.disabled = false;
    }
  });
  dlg.showModal();
  refresh();
  if (afterRender) afterRender(form);
  return dlg;
}

function confirmReason(title, intro, onOk, label = 'Potwierdź') {
  openForm({ title, intro: `<p>${intro}</p>`, fields: [{ name: 'reason', label: 'Powód', type: 'textarea', required: true, wide: true }], submitLabel: label, submit: v => onOk(v.reason) });
}
