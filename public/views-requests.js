// Widoki: zgłoszenia pracowników do weryfikacji (serwer firmowy), status projektów dla gościa, opóźnienie projektu.
'use strict';

const REQ_KIND = {
  urlop: ['Urlop / zwolnienie', 'leave', 'Wszystkie rodzaje — od – do albo liczba dni'],
  spoznienie: ['Spóźnienie', 'today', 'O której przyjdziesz do pracy'],
  nieobecnosc: ['Nieobecność', 'absence', 'Cały dzień lub kilka dni'],
  wyjscie: ['Wyjście w trakcie zmiany', 'exit', 'Od której do której'],
  odrobienie: ['Odrobienie czasu', 'makeup', 'Kiedy odrobiłeś / odrobisz'],
  inne: ['Inna sprawa', 'other', 'Opisz w uwadze'],
};
// O jaki rodzaj nieobecności prosi programista (kierownik decyduje i wpisuje)
const WANTED_LABEL = { URLOP_WYP: 'Urlop wypoczynkowy', URLOP_NA_ZADANIE: 'Urlop na żądanie', L4: 'Zwolnienie lekarskie (L4)', OPIEKA_ZUS: 'Opieka nad chorym (zasiłek opiekuńczy)',
  OPIEKA_188: 'Opieka nad dzieckiem (art. 188)', SILA_WYZSZA: 'Siła wyższa (art. 148¹)', OKOL_SLUB: 'Okolicznościowy — ślub', OKOL_NARODZINY: 'Okolicznościowy — narodziny dziecka',
  OKOL_ZGON_BLISKI: 'Okolicznościowy — zgon osoby bliskiej', OKOL_SLUB_DZIECKA: 'Okolicznościowy — ślub dziecka', OKOL_ZGON_DALSZY: 'Okolicznościowy — zgon dalszej rodziny',
  BEZPLATNY: 'Urlop bezpłatny', KREW: 'Oddawanie krwi', BADANIA_PROFIL: 'Badania profilaktyczne', SZKOLENIOWY: 'Szkolenie', WEZWANIE: 'Wezwanie (sąd, urząd)', WOJSKO: 'Obowiązki wojskowe', INNE_USTAWOWE: 'Inne zwolnienie ustawowe' };
// skrót, kolor i możliwość godzin dla każdego rodzaju — stałe (programista nie dostaje pełnej listy kategorii z serwera)
const LEAVE_META = {
  URLOP_WYP: ['UW', 'uw'], URLOP_NA_ZADANIE: ['UŻ', 'uz'], BEZPLATNY: ['UB', 'unpaid'], SILA_WYZSZA: ['SW', 'force', 'b'], OPIEKA_188: ['188', 'care', 'b'],
  OKOL_SLUB: ['OK', 'event'], OKOL_NARODZINY: ['OK', 'event'], OKOL_ZGON_BLISKI: ['OK', 'event'], OKOL_SLUB_DZIECKA: ['OK', 'event'], OKOL_ZGON_DALSZY: ['OK', 'event'],
  L4: ['L4', 'l4'], OPIEKA_ZUS: ['OP', 'care'], KREW: ['KR', 'event'], BADANIA_PROFIL: ['BP', 'l4', 'h'], SZKOLENIOWY: ['SZ', 'train', 'b'], WEZWANIE: ['WZ', 'other', 'h'],
  WOJSKO: ['WO', 'other'], INNE_USTAWOWE: ['IZ', 'other', 'b'],
};
const leaveTone = (code) => (LEAVE_META[code] ? LEAVE_META[code][1] : 'other');
// rodzaj urlopu jako kolorowa plakietka (te same kolory co w kalendarzu urlopów i w profilu)
function leaveChip(code) {
  if (!code) return '';
  return `<span class="leave-chip tone-${leaveTone(code)}">${esc(WANTED_LABEL[code] || code)}</span>`;
}
const REQ_STATUS = { nowe: ['czeka na decyzję', 'warn'], przyjete: ['przyjęte', 'ok'], odrzucone: ['odrzucone', 'danger'], wycofane: ['wycofane', ''] };

// dni robocze (pn–pt bez świąt) w zakresie dat — do urlopu „od – do” i „liczba dni”
function workdaysIn(from, to) {
  const hol = new Set((S.boot.holidays || []).map(h => h.date));
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekday(d) <= 5 && !hol.has(d)) n++;
  return n;
}
// koniec urlopu po N dniach roboczych licząc od dnia początku (weekendy i święta pomijane)
function endAfterWorkdays(from, n) {
  const hol = new Set((S.boot.holidays || []).map(h => h.date));
  let d = from, left = n, guard = 0;
  while (guard++ < 400) {
    if (weekday(d) <= 5 && !hol.has(d)) { left--; if (left <= 0) return d; }
    d = addDays(d, 1);
  }
  return d;
}
const LEAVE_CODES = ['URLOP_WYP', 'URLOP_NA_ZADANIE', 'BEZPLATNY', 'OKOL_SLUB', 'OKOL_NARODZINY', 'OKOL_ZGON_BLISKI', 'OKOL_SLUB_DZIECKA', 'OKOL_ZGON_DALSZY'];
function reqWhen(r) {
  const multi = r.kind === 'nieobecnosc' && LEAVE_CODES.includes(r.wanted_code) && r.date_to && r.date_to !== r.date_from;
  const d = `${plDate(r.date_from)}${r.date_to && r.date_to !== r.date_from ? ` – ${plDate(r.date_to)}` : ''}${multi ? ` <span class="muted">(${workdaysIn(r.date_from, r.date_to)} dni rob.)</span>` : ''}`;
  if (r.kind === 'spoznienie') return `${d}${r.time_to ? ` · przyjście ${esc(r.time_to)}` : ''}`;
  return `${d}${r.time_from ? ` · ${esc(r.time_from)}–${esc(r.time_to || '')}` : ''}`;
}

// Kafelki zgłoszeń: kolor jak w kalendarzu (urlop zielony, spóźnienie — brązowy, wyjście szare, odrabianie turkusowe)
const REQ_TILES = [['urlop', 'uw'], ['spoznienie', 'late'], ['wyjscie', 'unpaid'], ['odrobienie', 'train'], ['inne', 'event']];
// Rodzaje w prośbie o urlop / zwolnienie — pogrupowane; kolory jak w zestawieniu w profilu
const LEAVE_GROUPS = [
  ['Urlopy', ['URLOP_WYP', 'URLOP_NA_ZADANIE', 'BEZPLATNY']],
  ['Zwolnienia z limitem', ['SILA_WYZSZA', 'OPIEKA_188']],
  ['Okolicznościowe', ['OKOL_SLUB', 'OKOL_NARODZINY', 'OKOL_ZGON_BLISKI', 'OKOL_SLUB_DZIECKA', 'OKOL_ZGON_DALSZY']],
  ['Inne nieobecności', ['L4', 'OPIEKA_ZUS', 'KREW', 'BADANIA_PROFIL', 'SZKOLENIOWY', 'WEZWANIE', 'WOJSKO', 'INNE_USTAWOWE']],
];
// Ile zostało z puli danego rodzaju (z zestawienia w profilu); null = bez limitu w aplikacji
function leaveLeft(code, sum) {
  if (!sum) return null;
  const dm = sum.day_min || 480;
  const L = sum.leave;
  const uwLeft = L && L.has_pool ? Math.floor(((L.remaining_min || 0) - (L.planned_min || 0)) / dm) : null;
  const hTxt = (h) => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
  const unitLeft = (u) => {
    if (!u) return null;
    const usedDays = (u.used_days || 0) + (u.planned_days || 0), usedMin = (u.used_min || 0) + (u.planned_min || 0);
    if (u.unit === 'godziny') { const h = Math.max(0, ((u.limit_min || 0) - usedMin) / 60); return { days: null, hours: Math.round(h * 10) / 10, text: `zostało ${hTxt(h)}`, empty: h <= 0 }; }
    if (u.unit === 'dni') { const d = Math.max(0, (u.limit_days || 0) - usedDays); return { days: d, hours: null, text: `zostało ${daysTxt(d)}`, empty: d <= 0 }; }
    // jednostka jeszcze nieustalona: zaplanowane dni i godziny pomniejszają obie pule (dzień = norma dnia)
    const d = Math.max(0, (u.limit_days || 0) - usedDays - Math.ceil(usedMin / dm));
    const h = Math.max(0, ((u.limit_min || 0) - usedMin - usedDays * dm) / 60);
    return { days: d, hours: Math.round(h * 10) / 10, text: `zostało ${daysTxt(d)} lub ${hTxt(h)}`, empty: d <= 0 && h <= 0 };
  };
  if (code === 'URLOP_WYP') return uwLeft === null ? { days: null, text: 'wymiar ustala kierownik', empty: false } : { days: Math.max(0, uwLeft), text: `możesz wziąć ${daysTxt(Math.max(0, uwLeft))}${L.planned_min ? ' (zaplanowane już odjęte)' : ''}`, empty: uwLeft <= 0 };
  if (code === 'URLOP_NA_ZADANIE') {
    const od = sum.on_demand || { limit_days: 4, used_days: 0, planned_days: 0 };
    let d = Math.max(0, od.limit_days - od.used_days - (od.planned_days || 0));
    if (uwLeft !== null) d = Math.min(d, Math.max(0, uwLeft));
    return { days: d, text: `zostało ${daysTxt(d)} (z ${od.limit_days})`, empty: d <= 0 };
  }
  if (code === 'SILA_WYZSZA') return unitLeft(sum.force);
  if (code === 'OPIEKA_188') return unitLeft(sum.care188);
  return null;
}
// dozwolone sposoby podania terminu: dni (od – do / liczba dni) i godziny — wg jednostki kategorii;
// SW i art. 188: po pierwszym użyciu w roku jednostka jest ustalona (dni albo godziny)
function leaveModes(code, sum) {
  const base = LEAVE_META[code] ? LEAVE_META[code][2] : undefined;
  let days = base !== 'h', hours = base === 'h' || base === 'b';
  const u = code === 'SILA_WYZSZA' ? sum && sum.force : code === 'OPIEKA_188' ? sum && sum.care188 : null;
  if (u && u.unit === 'dni') { days = true; hours = false; }
  if (u && u.unit === 'godziny') { days = false; hours = true; }
  return { days, hours };
}

// Symbol zgłoszenia w kolorze rodzaju — ten sam na liście programisty i u kierownika
const REQ_TONE = { spoznienie: 'late', wyjscie: 'unpaid', odrobienie: 'train', inne: 'event', nieobecnosc: 'other' };
function reqBadge(r) {
  const code = r.wanted_code;
  const tone = code ? leaveTone(code) : REQ_TONE[r.kind] || 'other';
  const ic = code ? (LEAVE_CODES.includes(code) ? 'leave' : 'absence') : REQ_KIND[r.kind][1];
  const short = code && LEAVE_META[code] ? LEAVE_META[code][0] : '';
  return `<span class="req-badge tone-${tone}" title="${esc(code ? (WANTED_LABEL[code] || code) : REQ_KIND[r.kind][0])}"><span class="kind-ico">${icon(ic)}</span>${short ? `<b>${esc(short)}</b>` : ''}</span>`;
}
const reqTitle = (r) => (r.wanted_code ? (LEAVE_CODES.includes(r.wanted_code) ? 'Urlop' : 'Zwolnienie / nieobecność') : REQ_KIND[r.kind][0]);

// ---------- Pracownik: „Zgłoś” ----------
VIEWS.zglos = async (main) => {
  const year = Number(S.me.today.slice(0, 4));
  const [list, bal, sums] = await Promise.all([api('/requests'), api(`/balances?month=${S.me.today.slice(0, 7)}`).catch(() => []), api(`/leave/summary?year=${year}`).catch(() => [])]);
  const mine = bal.find(b => b.employee_id === S.me.employee_id);
  let sum = sums.find(x => x.employee_id === S.me.employee_id) || sums[0] || null;
  let sumYear = year;
  const sumCache = new Map([[year, sum]]);
  const leaveCards = () => `<p class="small muted lv-year">Limity na rok ${sumYear}</p>${LEAVE_GROUPS.map(([g, codes]) => `<div class="lv-group"><span class="small muted">${esc(g)}</span><div class="lv-grid">${codes.map(leaveCard).join('')}</div></div>`).join('')}`;
  const leaveCard = (code) => {
    const left = leaveLeft(code, sum);
    const dis = left && left.empty;
    return `<label class="lv-opt tone-${leaveTone(code)} ${dis ? 'off' : ''}">
      <input type="radio" name="leave_code" value="${esc(code)}" ${dis ? 'disabled' : ''} ${code === 'URLOP_WYP' && !dis ? 'checked' : ''}>
      <span class="lc-badge">${esc(LEAVE_META[code] ? LEAVE_META[code][0] : '•')}</span><span class="lv-txt"><b>${esc(WANTED_LABEL[code] || code)}</b>${left ? `<span class="small">${dis ? 'wykorzystany — niedostępny' : esc(left.text)}</span>` : ''}</span></label>`;
  };
  main.innerHTML = head('Zgłoś kierownikowi', 'Zgłoszenie trafia do weryfikacji. Wpis w grafiku lub rozliczeniu powstaje dopiero po decyzji kierownika.') +
    (mine ? `<p class="notice info small">Moje saldo do odrobienia w ${plMonth(S.me.today.slice(0, 7))}: <b>${hm(mine.remaining_min)}</b> · zmian do końca miesiąca: ${mine.remaining_shifts}</p>` : '') + `
    <div class="cols-2"><section class="panel"><h3>Nowe zgłoszenie</h3>
      <div class="kind-pick" role="radiogroup" aria-label="Rodzaj zgłoszenia">${REQ_TILES.map(([k, tone]) => { const [l, ic, hint] = REQ_KIND[k];
        return `<button type="button" class="kind tone-${tone}" data-kind="${k}" role="radio" aria-checked="false"><span class="kind-ico">${icon(ic)}</span><b>${esc(l)}</b><span class="small muted">${esc(hint)}</span></button>`; }).join('')}</div>
      <form id="reqF" class="form-grid" novalidate hidden>
        <fieldset class="field wide lv-pick" data-show="urlop"><legend>Rodzaj — to prośba, przyznaje i wpisuje kierownik</legend>
          <div class="lv-cards">${leaveCards()}</div></fieldset>
        <fieldset class="field wide seg" data-show="urlop"><legend>Jak podajesz termin</legend>
          <label class="inline"><input type="radio" name="lmode" value="od" checked> od – do</label>
          <label class="inline"><input type="radio" name="lmode" value="dni"> liczba dni</label>
          <label class="inline" data-hourly><input type="radio" name="lmode" value="godz"> godziny</label></fieldset>
        <label class="field"><span data-dlbl>Dzień</span><input type="date" name="date_from" required value="${S.me.today}"></label>
        <label class="field" data-show="nieobecnosc urlop" data-lm="od"><span data-tlbl>Do dnia (opcjonalnie)</span><input type="date" name="date_to"></label>
        <label class="field" data-show="urlop" data-lm="dni">Liczba dni roboczych<input type="number" name="days" min="1" max="40" step="1" inputmode="numeric" placeholder="np. 5"></label>
        <p class="wide small leave-sum" data-show="urlop" aria-live="polite"></p>
        <label class="field wide" data-show="nieobecnosc">O jaki rodzaj prosisz<select name="wanted_code"><option value="">— nie wiem / opiszę w uwadze —</option>${Object.entries(WANTED_LABEL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
          <span class="help">Zaznaczasz tylko prośbę — urlop przyznaje i wpisuje kierownik.</span></label>
        <label class="field" data-show="wyjscie odrobienie nieobecnosc inne urlop" data-lmh>Od godz.<input type="time" name="time_from"></label>
        <label class="field" data-show="spoznienie wyjscie odrobienie nieobecnosc inne urlop" data-lmh><span data-lbl>Do godz.</span><input type="time" name="time_to"></label>
        <label class="field wide">Uwaga dla kierownika<textarea name="note" maxlength="500" rows="3" placeholder="Np. powód. Bez danych medycznych."></textarea></label>
        <div class="wide toolbar"><button class="primary" type="submit">${icon('check')}Wyślij do weryfikacji</button></div>
        <div class="form-error wide" role="alert"></div>
      </form></section>
      <section class="panel"><h3>Moje zgłoszenia</h3>${table([
        { key: r => r, label: 'Zgłoszenie', fmt: r => `<div class="req-cell">${reqBadge(r)}<div><b>${esc(reqTitle(r))}</b>${r.wanted_code ? ` ${leaveChip(r.wanted_code)}` : ''}<br><span class="small">${reqWhen(r)}</span>${r.note ? `<br><span class="small muted">${esc(r.note)}</span>` : ''}</div></div>` },
        { key: r => r, label: 'Decyzja', fmt: r => `${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small">${esc(r.decision_note)}</span>` : ''}${r.decided_at ? `<br><span class="small muted">${new Date(r.decided_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</span>` : ''}` },
        { key: r => r, label: '', fmt: r => r.status === 'nowe' ? `<button class="link" data-withdraw="${r.id}">Wycofaj</button>` : '' },
      ], list, { empty: 'Nie masz jeszcze zgłoszeń.', rowClass: r => `req-row tone-${r.wanted_code ? leaveTone(r.wanted_code) : REQ_TONE[r.kind] || 'other'}${r.status === 'wycofane' ? ' row-cancel' : ''}` })}</section></div>`;
  let kind = null;
  const f = $('#reqF');
  $$('[data-kind]').forEach(b => b.onclick = () => {
    kind = b.dataset.kind;
    $$('[data-kind]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    f.hidden = false;
    $$('[data-show]', f).forEach(el => el.classList.toggle('hidden', !el.dataset.show.split(' ').includes(kind)));
    $('[data-lbl]', f).textContent = kind === 'spoznienie' ? 'Przyjdę o godz.' : 'Do godz.';
    $('[data-dlbl]', f).textContent = kind === 'urlop' ? 'Od dnia' : 'Dzień';
    $('[data-tlbl]', f).textContent = kind === 'urlop' ? 'Do dnia' : 'Do dnia (opcjonalnie)';
    leaveSync();
    f.date_from.focus();
  });
  // urlop: od – do albo liczba dni roboczych (koniec liczony z pominięciem weekendów i świąt)
  const leaveRange = () => {
    let from = f.date_from.value; if (!from) return null;
    const hol = new Set((S.boot.holidays || []).map(h => h.date));
    for (let g = 0; g < 14 && (weekday(from) > 5 || hol.has(from)); g++) from = addDays(from, 1); // urlop zaczyna się w pierwszym dniu roboczym
    const mode = (f.querySelector('input[name=lmode]:checked') || {}).value || 'od';
    if (mode === 'godz') {
      const a = f.time_from.value, b = f.time_to.value;
      if (!a || !b) return null;
      const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number);
      let min = (bh * 60 + bm) - (ah * 60 + am); if (min < 0) min += 1440;
      if (min === 0 || min > 16 * 60) return null; // 0 h albo ponad 16 h — popraw godziny
      return { from, to: from, days: 0, hours: Math.round(min / 6) / 10, hourly: true };
    }
    if (mode === 'dni') { const n = Math.floor(Number(f.days.value)); return n >= 1 ? { from, to: endAfterWorkdays(from, n), days: n } : null; }
    const to = f.date_to.value || from;
    return to >= from ? { from, to, days: workdaysIn(from, to) } : null;
  };
  const chosen = () => (f.querySelector('input[name=leave_code]:checked') || {}).value || '';
  // ponad pozostałą pulę nie da się wysłać (kierownik i tak sprawdza limity przy wpisie)
  const overLimit = (r) => {
    const left = leaveLeft(chosen(), sum);
    if (!left || !r) return '';
    if (r.hourly) return left.hours !== null && left.hours !== undefined && r.hours > left.hours ? `Zostało tylko ${String(left.hours).replace('.', ',')} h.` : left.hours === null ? 'Ten rodzaj rozliczasz w dniach.' : '';
    if (left.days === null && left.hours !== null && left.hours !== undefined) return 'Ten rodzaj rozliczasz w godzinach.';
    return left.days !== null && left.days !== undefined && r.days > left.days ? `Zostało tylko ${daysTxt(left.days)} — zmniejsz liczbę dni.` : '';
  };
  function leaveSync() {
    if (kind !== 'urlop') return;
    // limity na rok, w którym zaczyna się urlop (wniosek może dotyczyć przyszłego roku)
    const y = Number((f.date_from.value || S.me.today).slice(0, 4));
    if (y !== sumYear) {
      sumYear = y;
      const draw = () => { const keep = chosen(); $('.lv-cards', f).innerHTML = leaveCards(); const el = keep && f.querySelector(`input[name=leave_code][value="${keep}"]:not([disabled])`); if (el) el.checked = true; leaveSync(); };
      if (sumCache.has(y)) { sum = sumCache.get(y); draw(); return; }
      sum = null; draw();
      api(`/leave/summary?year=${y}`).then(list => { const x = list.find(e => e.employee_id === S.me.employee_id) || list[0] || null; sumCache.set(y, x); if (sumYear === y) { sum = x; draw(); } }).catch(() => sumCache.set(y, null));
      return;
    }
    const md = leaveModes(chosen(), sum);
    const set = (v, show) => { const el = f.querySelector(`input[name=lmode][value=${v}]`); el.closest('label').classList.toggle('hidden', !show); if (!show && el.checked) el.checked = false; };
    set('od', md.days); set('dni', md.days); set('godz', md.hours);
    if (!f.querySelector('input[name=lmode]:checked')) f.querySelector(`input[name=lmode][value=${md.days ? 'od' : 'godz'}]`).checked = true;
    const mode = (f.querySelector('input[name=lmode]:checked') || {}).value || 'od';
    $$('[data-lm]', f).forEach(el => el.classList.toggle('hidden', el.dataset.lm !== mode || !el.dataset.show.split(' ').includes(kind)));
    $$('[data-lmh]', f).forEach(el => el.classList.toggle('hidden', mode !== 'godz'));
    const left = leaveLeft(chosen(), sum);
    if (f.days) f.days.max = left && left.days ? String(left.days) : '40';
    const r = leaveRange(); const over = overLimit(r);
    $('.leave-sum', f).classList.toggle('bad', !!over);
    $('.leave-sum', f).innerHTML = !r ? '<span class="muted">Podaj termin.</span>'
      : `${r.hourly ? `<b>${plDate(r.from)}</b> · <b>${String(r.hours).replace('.', ',')} h</b>` : `<b>${plDate(r.from)} – ${plDate(r.to)}</b> · <b>${r.days}</b> ${r.days === 1 ? 'dzień roboczy' : 'dni roboczych'} (bez weekendów i świąt)`}${over ? ` — ${esc(over)}` : ''}`;
  }
  f.addEventListener('input', leaveSync); f.addEventListener('change', leaveSync);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', f); btn.disabled = true; $('.form-error', f).textContent = '';
    const raw = Object.fromEntries([...new FormData(f)].filter(([, x]) => x !== ''));
    const { leave_code: leaveCode, lmode, days, ...v } = raw;
    let sendKind = kind;
    if (kind === 'urlop') {
      const r = leaveRange();
      const fail = (m) => { $('.form-error', f).textContent = m; btn.disabled = false; };
      if (!leaveCode) return fail('Wybierz rodzaj.');
      if (!r) return fail('Podaj termin: od – do, liczbę dni albo godziny (od – do, najwyżej 16 h).');
      if (!r.hourly && r.days < 1) return fail('W tym terminie nie ma dni roboczych.');
      const over = overLimit(r); if (over) return fail(over);
      sendKind = 'nieobecnosc'; v.date_from = r.from; v.date_to = r.to; v.wanted_code = leaveCode;
      if (!r.hourly) { delete v.time_from; delete v.time_to; }
      const prefix = r.hourly ? `${WANTED_LABEL[leaveCode] || ''}: ${String(r.hours).replace('.', ',')} h` : `${WANTED_LABEL[leaveCode] || 'Urlop'}: ${r.days} ${r.days === 1 ? 'dzień roboczy' : 'dni roboczych'}`;
      v.note = v.note ? `${prefix}. ${v.note}`.slice(0, 500) : prefix;
    }
    void lmode; void days;
    try {
      await api('/requests', { method: 'POST', body: { ...v, kind: sendKind, client_id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) } });
      toast('Wysłano. Kierownik zobaczy zgłoszenie.'); setTimeout(rerender, 50);
    } catch (err) { $('.form-error', f).textContent = describeError(err); btn.disabled = false; }
  };
  $$('[data-withdraw]').forEach(b => b.onclick = async () => {
    try { await api(`/requests/${b.dataset.withdraw}/withdraw`, { method: 'POST' }); toast('Wycofano.'); rerender(); } catch (e) { toast(e.message, 'err'); }
  });
};

// ---------- Kierownik: zgłoszenia pracowników ----------
VIEWS.zgloszenia = async (main) => {
  const local = await localRequestsSection();
  main.innerHTML = head('Zgłoszenia pracowników', 'Spóźnienia, nieobecności, wyjścia i odrobienia zgłoszone przez pracowników. Nic nie trafia do grafiku ani rozliczeń bez Twojej decyzji.') + local.html;
  local.bind();
};

async function localRequestsSection() {
  const list = await api('/requests');
  const html = `<section class="panel"><h3>Zgłoszenia pracowników</h3>${table([
    { key: r => r, label: 'Pracownik', fmt: r => person(r.employee_id) },
    { key: r => r, label: 'Rodzaj', fmt: r => `<div class="req-cell">${reqBadge(r)}<div><b>${esc(reqTitle(r))}</b>${r.wanted_code ? `<br><span class="small">prośba: ${leaveChip(r.wanted_code)}</span>` : ''}</div></div>` },
    { key: r => r, label: 'Kiedy', fmt: r => reqWhen(r) },
    { key: 'note', label: 'Uwaga pracownika' },
    { key: r => new Date(r.created_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Zgłoszono' },
    { key: r => r, label: 'Status', fmt: r => `${tag(...REQ_STATUS[r.status])}${r.decision_note ? `<br><span class="small">${esc(r.decision_note)}</span>` : ''}${r.decided_by_name ? `<br><span class="small muted">${esc(r.decided_by_name)}</span>` : ''}${r.result_ref ? `<br><span class="small muted">wpis: ${esc(r.result_ref)}</span>` : ''}` },
    { key: r => r, label: '', fmt: r => r.status === 'nowe' && isAdmin() ? `<button data-racc="${r.id}" class="primary">Przyjmij</button> <button data-rrej="${r.id}" class="link">Odrzuć</button>` : '' },
  ], list, { empty: 'Brak zgłoszeń.', rowClass: r => `req-row tone-${r.wanted_code ? leaveTone(r.wanted_code) : REQ_TONE[r.kind] || 'other'}${r.status === 'wycofane' ? ' row-cancel' : ''}` })}</section>`;
  const bind = () => {
    $$('[data-racc]').forEach(b => b.onclick = () => requestAcceptForm(list.find(r => r.id === Number(b.dataset.racc))));
    $$('[data-rrej]').forEach(b => b.onclick = () => openForm({
      title: 'Odrzuć zgłoszenie', intro: '<p class="small">Pracownik zobaczy decyzję i wyjaśnienie.</p>',
      fields: [{ name: 'note', label: 'Wyjaśnienie dla pracownika', type: 'textarea', required: true, wide: true }], submitLabel: 'Odrzuć',
      submit: (v) => post(`/requests/${b.dataset.rrej}/decide`, { decision: 'odrzucone', note: v.note }),
    }));
  };
  return { html, bind, pending: list.filter(r => r.status === 'nowe').length };
}

function requestTargetOptions(kind) {
  const cats = S.boot.categories.filter(c => c.active && !['WYJSCIE_PRYWATNE', 'OKOLICZNOSCIOWY'].includes(c.code));
  const byCode = (code) => cats.find(c => c.code === code)?.id;
  const options = [];
  if (kind === 'spoznienie') options.push(['exit', 'Do odrobienia — jak wyjście prywatne (od początku zmiany do przyjścia)'], ['absence:' + byCode('SPOZNIENIE_USPRAW'), 'Spóźnienie usprawiedliwione (bez odrabiania)'], ['absence:' + byCode('SPOZNIENIE_NIEUSPRAW'), 'Spóźnienie nieusprawiedliwione']);
  if (kind === 'wyjscie') options.push(['exit', 'Wyjście prywatne do odrobienia']);
  if (kind === 'odrobienie') options.push(['makeup', 'Odrabianie — przypisz do nierozliczonych wyjść z tego miesiąca']);
  if (kind === 'nieobecnosc' || kind === 'inne') options.push(['absence', 'Nieobecność — wybierz kategorię']);
  options.push(['none', 'Przyjmij bez wpisu (wpiszę ręcznie)']);
  return { options, cats, byCode };
}

function requestAcceptForm(r) {
  const { options, cats, byCode } = requestTargetOptions(r.kind);
  openForm({
    title: `Przyjmij: ${REQ_KIND[r.kind][0]} — ${S.emp.get(r.employee_id)?.first_name || ''}`,
    intro: `<p class="small">${reqWhen(r)}${r.wanted_code ? `<br>Pracownik prosi o: ${leaveChip(r.wanted_code)} (możesz wybrać inną kategorię)` : ''}${r.note ? `<br>Uwaga: ${esc(r.note)}` : ''}</p><p class="small muted">Wpis powstanie z odnośnikiem do zgłoszenia #${r.id}; w historii zapisze się, kto przyjął.</p>`,
    fields: [
      { name: 'target', label: 'Jak rozliczyć', type: 'select', options, value: options[0][0], placeholder: false, wide: true },
      { name: 'category_id', label: 'Kategoria nieobecności', type: 'select', options: cats.map(c => [c.id, c.subtype ? `${c.name} — ${c.subtype}` : c.name]), value: (r.wanted_code && byCode(r.wanted_code)) || byCode('INNE_USPRAW'), placeholder: false, wide: true, show: v => v.target === 'absence' },
      { name: 'unit', label: 'Jednostka (gdy kategoria pozwala)', type: 'select', options: [['dni', 'dni'], ['godziny', 'godziny']], value: r.time_from ? 'godziny' : 'dni', placeholder: false, show: v => v.target === 'absence' },
      { name: 'written_request', label: 'Uznaj zgłoszenie za pisemny wniosek pracownika', type: 'checkbox', wide: true, help: 'Czy forma elektroniczna spełnia wymóg wniosku — do potwierdzenia z kadrami.', show: v => v.target === 'exit' },
      { name: 'day_off_reason', label: 'Uzasadnienie, jeśli odrabianie wypada w dniu wolnym', wide: true, show: v => v.target === 'makeup' },
      { name: 'note', label: 'Informacja dla pracownika (opcjonalnie)', wide: true },
    ],
    submitLabel: 'Przyjmij',
    submit: (v) => {
      let target = { type: v.target.split(':')[0] };
      if (target.type === 'absence') target = { type: 'absence', category_id: Number(v.target.split(':')[1] || v.category_id), unit: v.unit };
      if (target.type === 'exit') target.written_request = v.written_request;
      if (target.type === 'makeup') target.day_off_reason = v.day_off_reason;
      return post(`/requests/${r.id}/decide`, { decision: 'przyjete', note: v.note, target });
    },
  });
}

// ---------- Opóźnienie projektu ----------
const DELAY_LEVEL = { zgodnie: ['zgodnie z planem', 'ok'], opozniony: ['opóźniony', 'warn'], zagrozony: ['zagrożony', 'danger'], zakonczony: ['zakończony', 'ok'], brak_danych: ['brak danych', ''] };
function delayLine(s) {
  if (!s) return '';
  const lvl = DELAY_LEVEL[s.level] || DELAY_LEVEL.brak_danych;
  if (s.planned_percent === null) return `<p class="small">${tag(lvl[0], lvl[1])} <span class="muted">${esc(s.note || '')}</span></p>`;
  const main = s.delay_pct > 0 ? `opóźnienie <b>${s.delay_pct}%</b>` : s.ahead_pct > 0 ? `przed planem <b>${s.ahead_pct}%</b>` : 'zgodnie z planem';
  return `<p class="small delay">${tag(lvl[0], lvl[1], s.level === 'zagrozony' || s.level === 'opozniony' ? 'alert' : '')} ${main}
    <span class="muted">· plan na dziś ${s.planned_percent}% · wykonano ${s.actual_percent}%${s.overdue_days ? ` · <b>${s.overdue_days} dni po terminie</b>` : ''}${s.overdue_tasks ? ` · zadania po terminie: ${s.overdue_tasks}` : ''}</span></p>`;
}

// ---------- Gość: status projektów ----------
const GUEST_TASK = { nowe: ['do zrobienia', ''], w_toku: ['w toku', 'accent'], zablokowane: ['wstrzymane', 'warn'], zakonczone: ['zakończone', 'ok'] };
VIEWS.status = async (main) => {
  const list = await api('/guest/projects');
  main.innerHTML = head('Status projektów', `Stan na ${plDate(S.me.today)}. Widoczne są tylko projekty udostępnione dla Twojego konta.`) +
    (list.map(p => `<article class="panel guest-project">
      <div class="page-head" style="margin:0 0 var(--sp-2)"><div><h3 style="margin:0">${projectRef(p)}</h3>
        <span class="small muted">${p.machine ? esc(p.machine) + ' · ' : ''}start ${plDate(p.start_date)} · termin ${plDate(p.due_date)}</span></div>
        <div>${p.status === 'wstrzymany' || p.blocked ? tag('wstrzymany', 'warn', 'block') : tag('w realizacji', 'accent')}</div></div>
      ${projectMeter(p)}${delayLine(p.schedule)}
      <details><summary class="small">Etapy (${p.stages.length})</summary>${table([
        { key: 'title', label: 'Etap' }, { key: 'phase', label: 'Faza', fmt: v => v === 'przygotowanie' ? 'przygotowanie programu' : 'wykonanie detalu' },
        { key: 'due_date', label: 'Termin', fmt: 'date' }, { key: 'status', label: 'Status', fmt: v => tag(...(GUEST_TASK[v] || [v, ''])) }], p.stages)}</details>
    </article>`).join('') || '<div class="empty">Brak projektów w realizacji udostępnionych dla tego konta.</div>');
};

// ---------- Historia zmian: czytelny opis „pole: było → jest” ----------
const FIELD_LABEL = {
  status: 'status', due_date: 'termin', start_date: 'data rozpoczęcia', end_date: 'data końca', title: 'tytuł', weight: 'waga', assignee_id: 'osoba',
  planned_min: 'plan (min)', minutes: 'minuty', block_reason: 'powód blokady', result_confirmation: 'potwierdzenie rezultatu', priority: 'priorytet',
  machine_id: 'maszyna', responsible_ids: 'odpowiedzialni', role: 'rola', active: 'aktywne', value: 'wartość', note: 'uwaga', category_id: 'kategoria',
  unit: 'jednostka', start_at: 'od', end_at: 'do', nc_program: 'program NC', nc_rev: 'rewizja NC', blocked: 'zablokowany', description: 'opis',
  order_no: 'zlecenie', part_no: 'detal', part_rev: 'rewizja detalu', employee_id: 'pracownik', kind: 'rodzaj', date_from: 'dzień', date_to: 'do dnia',
  time_from: 'od godz.', time_to: 'do godz.', result_ref: 'utworzony wpis', target: 'sposób rozliczenia', guest_projects: 'projekty gościa',
  display_name: 'nazwa', login: 'login', password_changed: 'zmiana hasła', stage: 'etap', project_id: 'projekt', balance_min: 'saldo (min)',
};
function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return esc(JSON.stringify(v)).slice(0, 120);
  return esc(String(v)).slice(0, 120);
}
function changesHtml(r) {
  if (!r.changes || !r.changes.length) return '<span class="muted small">—</span>';
  return `<ul class="plain small changes">${r.changes.slice(0, 8).map(c => `<li><b>${esc(FIELD_LABEL[c.field] || c.field)}</b>: ${fmtVal(c.old)} → ${fmtVal(c.new)}</li>`).join('')}${r.changes.length > 8 ? `<li class="muted">… i ${r.changes.length - 8} więcej</li>` : ''}</ul>`;
}
function historyTable(rows) {
  return table([
    { key: r => new Date(r.at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Kiedy' }, { key: r => r.display_name || 'system', label: 'Kto' },
    { key: r => `${r.entity} ${r.entity_id || ''}`, label: 'Obiekt' }, { key: 'action', label: 'Akcja' }, { key: r => r, label: 'Co zmieniono', fmt: changesHtml }, { key: 'reason', label: 'Opis / powód' },
  ], rows, { empty: 'Brak wpisów w historii.' });
}
