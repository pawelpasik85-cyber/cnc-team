'use strict';
// Obsługa czasu w strefie Europe/Warsaw z uwzględnieniem zmiany czasu (DST).
// Zasady:
//  - chwile zapisujemy w UTC (ISO), daty kalendarzowe jako 'YYYY-MM-DD' czasu lokalnego;
//  - godzina niejednoznaczna (jesień, 02:00–02:59 występuje dwa razy) → wybieramy WCZEŚNIEJSZE wystąpienie;
//  - godzina nieistniejąca (wiosna, 02:00–02:59) → przesuwamy o 60 min do przodu (np. 02:30 → 03:30).
const TZ = 'Europe/Warsaw';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parts(ms) {
  const o = {};
  for (const p of dtf.formatToParts(new Date(ms))) o[p.type] = p.value;
  return o;
}

// Przesunięcie strefy (minuty) w danej chwili UTC.
function offsetMin(ms) {
  const p = parts(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

function assertDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) throw Object.assign(new Error(`Niepoprawna data: ${d}`), { status: 400 });
  const [y, m, day] = d.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== day) throw Object.assign(new Error(`Niepoprawna data: ${d}`), { status: 400 });
}
function assertTime(t) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')) throw Object.assign(new Error(`Niepoprawna godzina: ${t}`), { status: 400 });
}

// Lokalna data + godzina → ISO UTC.
function localToUtc(date, time) {
  assertDate(date); assertTime(time);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  const offs = [...new Set([offsetMin(naive - 12 * 3600e3), offsetMin(naive + 12 * 3600e3)])];
  const valid = offs.map(o => naive - o * 60000).filter(c => offsetMin(c) === Math.round((naive - c) / 60000)).sort((a, b) => a - b);
  if (valid.length) return new Date(valid[0]).toISOString();
  // luka wiosenna: użyj przesunięcia sprzed zmiany → godzina przesuwa się do przodu
  const before = offsetMin(naive - 12 * 3600e3);
  return new Date(naive - before * 60000).toISOString();
}

function utcToLocal(iso) {
  const p = parts(Date.parse(iso));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function minutesBetween(aIso, bIso) {
  return Math.round((Date.parse(bIso) - Date.parse(aIso)) / 60000);
}

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function monthOf(date) { return date.slice(0, 7); }
function firstDayOfMonth(ym) { return `${ym}-01`; }
function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function weekday(date) { // 1 = poniedziałek … 7 = niedziela
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

// Bieżąca data lokalna; CNC_TODAY pozwala ustalić datę na potrzeby testów i demonstracji.
function today() {
  if (process.env.CNC_TODAY) return process.env.CNC_TODAY;
  return utcToLocal(new Date().toISOString()).date;
}
function nowIso() { return new Date().toISOString(); }

// Część wspólna dwóch przedziałów [a1,a2) i [b1,b2) w minutach.
function overlapMin(a1, a2, b1, b2) {
  const s = Math.max(Date.parse(a1), Date.parse(b1));
  const e = Math.min(Date.parse(a2), Date.parse(b2));
  return e > s ? Math.round((e - s) / 60000) : 0;
}

function fmtHM(min) {
  if (min === null || min === undefined) return 'brak danych';
  const sign = min < 0 ? '−' : '';
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)} h ${String(a % 60).padStart(2, '0')} min`;
}

module.exports = {
  TZ, localToUtc, utcToLocal, minutesBetween, addDays, dateRange, monthOf, firstDayOfMonth,
  lastDayOfMonth, weekday, today, nowIso, overlapMin, offsetMin, assertDate, assertTime, fmtHM,
};
