// Zestawienia do druku / wysyłki: kilka tematów (projekty, zapisane raporty, własne tematy) z notatką kierownika do każdego,
// np. dlaczego było opóźnienie. Tworzy i edytuje kierownik; przełożony widzi zestawienia udostępnione.
'use strict';

const KIND_LABEL = { projekt: 'Projekt', raport: 'Zapisany raport', notatka: 'Temat' };
const REPORT_KIND = { projekt: 'Przebieg projektu', miesiac: 'Miesiąc', rok: 'Rok' };
const unitVal = (v, u) => (v === null || v === undefined ? '—' : u === 'min' ? hShort(v) : u === 'dni' ? `${v > 0 ? '+' : ''}${v} dni` : String(v));

// Lista zestawień (zakładka w „Analiza i raporty”)
async function bundlesTab() {
  const list = await api('/report-bundles');
  const admin = isAdmin();
  return {
    tools: admin ? `<a class="btn primary no-print" href="#/zestaw/nowe">${icon('plus')}Nowe zestawienie</a>` : '',
    body: `<section class="panel"><p class="small muted">Zestawienie łączy kilka tematów — projekty (z opóźnieniem w %, terminem i godzinami), zapisane raporty i własne tematy — z Twoją notatką do każdego, np. dlaczego było opóźnienie. Możesz je wydrukować, zapisać jako PDF albo wysłać e-mailem.</p>
      ${table([
        { key: r => r, label: 'Zestawienie', fmt: r => `<a href="#/zestaw/${r.id}"><b>${esc(r.title)}</b></a><br><span class="small muted">tematów: ${r.topics}</span>` },
        { key: r => new Date(r.updated_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }), label: 'Zmieniono' }, { key: 'author', label: 'Autor' },
        { key: r => r, label: 'Przełożony', fmt: r => (r.shared ? tag('udostępnione', 'ok') : tag('tylko kierownik', '', 'lock')) },
      ], list, { empty: admin ? 'Brak zestawień. Utwórz pierwsze przyciskiem „Nowe zestawienie”.' : 'Kierownik nie udostępnił jeszcze żadnego zestawienia.' })}</section>`,
  };
}

VIEWS.zestaw = async (main, rest) => {
  const idPart = String(rest[0] || '').split('?')[0];
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (idPart === 'nowe' || q.get('edytuj')) {
    if (!isAdmin()) throw Object.assign(new Error('Tylko kierownik tworzy zestawienia.'), { status: 403 });
    return bundleEditor(main, idPart === 'nowe' ? null : await api(`/report-bundles/${Number(idPart)}`));
  }
  return bundleDocument(main, await api(`/report-bundles/${Number(idPart)}`));
};

// ---------- Edytor ----------
async function bundleEditor(main, b) {
  const [projects, reports] = await Promise.all([api('/projects'), api('/saved-reports')]);
  const pmap = new Map(projects.map(p => [p.id, p]));
  const rmap = new Map(reports.map(r => [String(r.id), r]));
  const items = (b ? b.items : []).map(it => ({ kind: it.kind, ref: it.ref, cause: it.cause || '', note: it.note || '', title: it.snapshot && it.snapshot.title, snapshot: it.snapshot, refresh: false }));
  // projekty: najpierw najbardziej opóźnione
  const rank = (p) => (p.schedule && p.schedule.level === 'zagrozony' ? 0 : p.schedule && p.schedule.level === 'opozniony' ? 1 : p.status === 'zakonczony' ? 3 : 2);
  const projOpts = [...projects].sort((a, c) => rank(a) - rank(c) || ((c.schedule && c.schedule.delay_pct) || 0) - ((a.schedule && a.schedule.delay_pct) || 0))
    .map(p => [p.id, `${p.order_no} ${p.part_no}${p.schedule && p.schedule.delay_pct ? ` — opóźnienie ${p.schedule.delay_pct}%` : ''}${p.schedule && p.schedule.overdue_days ? `, ${p.schedule.overdue_days} dni po terminie` : ''}${p.status === 'zakonczony' ? ' (zakończony)' : ''}`]);
  const draw = () => {
    $('#bItems').innerHTML = items.length ? items.map((it, i) => {
      const p = it.kind === 'projekt' ? pmap.get(it.ref) : null;
      const r = it.kind === 'raport' ? rmap.get(String(it.ref)) : null;
      const title = it.kind === 'notatka' ? '' : p ? `${p.order_no} · ${p.part_no} rev ${p.part_rev}` : r ? r.title : it.title || it.ref;
      const info = p ? delayLine(p.schedule) : r ? `<p class="small muted">${esc(REPORT_KIND[r.kind] || r.kind)} · ${esc(r.ref)}</p>` : '';
      return `<article class="panel b-item" data-i="${i}"><header class="b-item-head"><span class="b-num">${i + 1}</span>
          <span class="tag">${esc(KIND_LABEL[it.kind])}</span>
          ${it.kind === 'notatka' ? `<input class="b-title" data-f="title" value="${esc(it.title || '')}" placeholder="Tytuł tematu" aria-label="Tytuł tematu" maxlength="160">` : `<b>${esc(title)}</b>`}
          <span class="b-move"><button type="button" class="link" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="W górę">▲</button><button type="button" class="link" data-down="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="W dół">▼</button><button type="button" class="link danger" data-rm="${i}">Usuń</button></span></header>
        ${info}
        ${it.snapshot && it.kind !== 'notatka' ? `<label class="small inline"><input type="checkbox" data-f="refresh" ${it.refresh ? 'checked' : ''}> odśwież dane przy zapisie (teraz: stan z ${new Date(it.snapshot.taken_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })})</label>` : ''}
        <div class="form-grid"><label class="field">Przyczyna<select data-f="cause"><option value="">— brak / nie dotyczy —</option>${Object.entries(CAUSE_LABEL).map(([k, l]) => `<option value="${k}" ${it.cause === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="field wide">Notatka — dlaczego było opóźnienie, co zrobiono, wnioski<textarea data-f="note" rows="4" maxlength="3000">${esc(it.note)}</textarea></label></div>
      </article>`;
    }).join('') : '<p class="muted">Dodaj tematy poniżej.</p>';
    $$('#bItems [data-f]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const it = items[Number(el.closest('[data-i]').dataset.i)];
      it[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    }));
    $$('[data-up]').forEach(x => x.onclick = () => { const i = Number(x.dataset.up); [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); });
    $$('[data-down]').forEach(x => x.onclick = () => { const i = Number(x.dataset.down); [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); });
    $$('[data-rm]').forEach(x => x.onclick = () => { items.splice(Number(x.dataset.rm), 1); draw(); });
  };
  main.innerHTML = head(b ? 'Edycja zestawienia' : 'Nowe zestawienie', 'Wybierz tematy, dopisz do każdego notatkę (np. przyczynę opóźnienia), zapisz — potem wydrukujesz je, zapiszesz jako PDF albo wyślesz e-mailem.',
    `<a class="btn" href="${b ? `#/zestaw/${b.id}` : '#/analiza?t=zestawienia'}">Anuluj</a><button type="button" class="primary" id="bSave">${icon('check')}Zapisz zestawienie</button>`) + `
    <section class="panel"><div class="form-grid">
      <label class="field wide">Tytuł<input id="bTitle" maxlength="160" value="${esc(b ? b.title : `Opóźnienia projektów — ${plDate(S.me.today)}`)}"></label>
      <label class="field wide">Wstęp (opcjonalnie)<textarea id="bIntro" rows="3" maxlength="4000">${esc(b ? b.intro || '' : '')}</textarea></label>
      <label class="field inline wide"><input type="checkbox" id="bShared" ${b && b.shared ? 'checked' : ''}> Udostępnij przełożonemu w aplikacji</label></div></section>
    <div id="bItems"></div>
    <section class="panel b-add no-print"><h3>Dodaj temat</h3><div class="b-add-row">
      <label class="field">Projekt<select id="addProj"><option value="">— wybierz projekt —</option>${projOpts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label><button type="button" id="addProjBtn">${icon('plus')}Dodaj projekt</button>
      <label class="field">Zapisany raport<select id="addRep"><option value="">— wybierz raport —</option>${reports.map(r => `<option value="${r.id}">${esc(r.title)}${r.shared ? '' : ' (nieudostępniony)'}</option>`).join('')}</select></label><button type="button" id="addRepBtn">${icon('plus')}Dodaj raport</button>
      <button type="button" id="addNoteBtn">${icon('plus')}Własny temat</button></div>
      <p class="small muted">Projekty posortowane od najbardziej opóźnionych. Dane projektu i raportu zapisują się jako stan z chwili zapisu zestawienia (później tylko po zaznaczeniu „odśwież”). Zestawienia udostępnionego przełożonemu nie można zapisać z raportem, którego mu nie udostępniono.</p></section>`;
  draw();
  const addItem = (it) => { items.push({ cause: '', note: '', refresh: false, ...it }); draw(); $$('#bItems .b-item').pop()?.scrollIntoView({ block: 'nearest' }); };
  on('addProjBtn', () => { const v = $('#addProj').value; if (!v) return toast('Wybierz projekt.', 'warn'); if (items.some(x => x.kind === 'projekt' && x.ref === v)) return toast('Ten projekt już jest w zestawieniu.', 'warn'); addItem({ kind: 'projekt', ref: v }); });
  on('addRepBtn', () => { const v = $('#addRep').value; if (!v) return toast('Wybierz raport.', 'warn'); if (items.some(x => x.kind === 'raport' && String(x.ref) === v)) return toast('Ten raport już jest w zestawieniu.', 'warn'); addItem({ kind: 'raport', ref: v }); });
  on('addNoteBtn', () => addItem({ kind: 'notatka', ref: null, title: '' }));
  on('bSave', async () => {
    const btnEl = $('#bSave'); btnEl.disabled = true;
    try {
      const body = { title: $('#bTitle').value, intro: $('#bIntro').value, shared: $('#bShared').checked,
        items: items.map(it => ({ kind: it.kind, ref: it.ref, cause: it.cause || null, note: it.note, title: it.title, refresh: !!it.refresh, taken_at: it.snapshot && it.snapshot.taken_at })) };
      const r = b ? await api(`/report-bundles/${b.id}`, { method: 'PUT', body }) : await api('/report-bundles', { method: 'POST', body });
      toast('Zestawienie zapisane.');
      location.hash = `#/zestaw/${r.id}`;
    } catch (e) { toast(describeError(e), 'err'); btnEl.disabled = false; }
  });
}

// ---------- Dokument (druk / PDF / e-mail) ----------
function topicFacts(it) {
  const s = it.snapshot || {};
  if (it.kind === 'projekt') {
    const lvl = DELAY_LEVEL[s.level] || DELAY_LEVEL.brak_danych;
    const facts = [
      ['Status', `${tag(lvl[0], lvl[1])}${s.machine ? ` <span class="muted">${esc(s.machine)}</span>` : ''}`],
      ['Termin', `${plDate(s.due_date)}${s.finish_date ? ` · zakończono ${plDate(s.finish_date)}` : ''}`],
      ['Opóźnienie', s.planned_percent === null || s.planned_percent === undefined ? '—' : s.delay_pct > 0 ? `<b class="bad">${s.delay_pct}%</b> <span class="muted">(plan ${s.planned_percent}%, wykonano ${s.actual_percent}%)</span>` : `brak <span class="muted">(plan ${s.planned_percent}%, wykonano ${s.actual_percent}%)</span>`],
      ['Wobec terminu', s.overdue_days ? `<b class="bad">${s.overdue_days} dni po terminie</b>` : s.due_delta_days !== null && s.due_delta_days !== undefined ? (s.due_delta_days > 0 ? `<b class="bad">+${s.due_delta_days} dni</b>` : 'w terminie') : '—'],
      ['Godziny', `${hShort(s.worked_min || 0)}${s.planned_min ? ` / plan ${hShort(s.planned_min)}${s.diff_pct !== null ? ` <b class="${s.diff_pct > 0 ? 'bad' : 'good'}">(${s.diff_pct > 0 ? '+' : ''}${s.diff_pct}%)</b>` : ''}` : ''}`],
      ['Poprawki / blokady', `${hShort(s.rework_min || 0)} / ${hShort(s.blocked_min || 0)}`],
      ...(s.returns_count ? [['Powroty do projektu', `${s.returns_count} · doszło ${hShort(s.returns_added_min)}`]] : []),
    ];
    return `<dl class="b-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`;
  }
  if (it.kind === 'raport') {
    return `<p class="small muted">${esc(REPORT_KIND[s.report_kind] || '')} · ${esc(s.report_ref || '')} ${isAdmin() ? ` · <a class="no-print" href="#/raport/${esc(it.ref)}">otwórz raport</a>` : ''}</p>
      <dl class="b-facts">${(s.lines || []).map(([k, v, prev, u]) => `<dt>${esc(k)}</dt><dd>${unitVal(v, u)}${prev !== null && prev !== undefined ? ` <span class="muted">(${u === 'min' && s.report_kind === 'projekt' ? 'plan' : 'rok wcześniej'} ${unitVal(prev, u)})</span>` : ''}</dd>`).join('')}</dl>
      ${s.report_note ? `<p class="small"><b>Komentarz w raporcie:</b> ${esc(s.report_note)}</p>` : ''}`;
  }
  return '';
}
function bundleText(b) {
  const lines = [b.title, `Zestawienie z ${new Date(b.updated_at).toLocaleDateString('pl-PL')}`, ''];
  if (b.intro) lines.push(b.intro, '');
  b.items.forEach((it, i) => {
    const s = it.snapshot || {};
    lines.push(`${i + 1}. ${s.title || ''}`);
    if (it.kind === 'projekt') {
      if (s.delay_pct > 0) lines.push(`   Opóźnienie: ${s.delay_pct}% (plan ${s.planned_percent}%, wykonano ${s.actual_percent}%)`);
      if (s.overdue_days) lines.push(`   Po terminie: ${s.overdue_days} dni (termin ${plDate(s.due_date)})`);
      else if (s.due_date) lines.push(`   Termin: ${plDate(s.due_date)}${s.due_delta_days > 0 ? `, zakończono +${s.due_delta_days} dni` : ''}`);
      lines.push(`   Godziny: ${hShort(s.worked_min || 0)}${s.planned_min ? ` / plan ${hShort(s.planned_min)}` : ''}`);
    }
    if (it.kind === 'raport') {
      for (const [k, v, prev, u] of s.lines || []) lines.push(`   ${k}: ${unitVal(v, u)}${prev !== null && prev !== undefined ? ` (${u === 'min' && s.report_kind === 'projekt' ? 'plan' : 'rok wcześniej'} ${unitVal(prev, u)})` : ''}`);
      if (s.report_note) lines.push(`   Komentarz w raporcie: ${s.report_note}`);
    }
    if (it.cause) lines.push(`   Przyczyna: ${CAUSE_LABEL[it.cause] || it.cause}`);
    if (it.note) lines.push(`   ${it.note.replace(/\n/g, '\n   ')}`);
    lines.push('');
  });
  return lines.join('\n');
}
function bundleDocument(main, b) {
  const admin = isAdmin();
  const causes = [...new Set(b.items.map(i => i.cause).filter(Boolean))];
  main.innerHTML = head(b.title, `Zestawienie z ${new Date(b.updated_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })} · ${esc(b.author || '')} · tematów: ${b.items.length}`,
    `<a class="btn no-print" href="#/analiza?t=zestawienia">‹ Zestawienia</a>${admin ? `<a class="btn no-print" href="#/zestaw/${b.id}?edytuj=1">Edytuj</a>` : ''}
     <button type="button" id="bMail" class="no-print">${icon('summons')}Wyślij e-mailem</button><button type="button" id="bCopy" class="no-print">Kopiuj tekst</button>
     <button type="button" id="bPrint" class="primary no-print">${icon('print')}Drukuj / PDF</button>
     ${admin ? `<button type="button" class="link no-print" id="bDel">Usuń</button>` : ''}`) + `
    ${b.intro ? `<section class="panel note-box"><p style="white-space:pre-wrap;margin:0">${esc(b.intro)}</p></section>` : ''}
    ${causes.length ? `<p class="small">Przyczyny w zestawieniu: ${causes.map(c => tag(CAUSE_LABEL[c] || c, 'warn')).join(' ')}</p>` : ''}
    ${b.items.map((it, i) => `<section class="panel b-topic"><h2><span class="b-num">${i + 1}</span>${esc((it.snapshot && it.snapshot.title) || '')}${it.kind !== 'notatka' ? ` <span class="tag">${esc(KIND_LABEL[it.kind])}</span>` : ''}</h2>
      ${topicFacts(it)}
      ${it.cause || it.note ? `<div class="b-note">${it.cause ? `<p><b>Przyczyna:</b> ${tag(CAUSE_LABEL[it.cause] || it.cause, 'warn')}</p>` : ''}${it.note ? `<p style="white-space:pre-wrap">${esc(it.note)}</p>` : ''}</div>` : ''}
      ${it.snapshot && it.snapshot.taken_at && it.kind !== 'notatka' ? `<p class="small muted">Dane z ${new Date(it.snapshot.taken_at).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}.</p>` : ''}</section>`).join('')}
    <p class="small muted no-print">E-mail: przycisk otwiera wiadomość z tekstem zestawienia (długie zestawienie zostanie skrócone). Pełną wersję zapisz przez „Drukuj / PDF” → „Zapisz jako PDF” i dołącz plik do wiadomości ręcznie.</p>`;
  on('bPrint', () => window.print());
  on('bCopy', async () => { try { await navigator.clipboard.writeText(bundleText(b)); toast('Skopiowano tekst zestawienia.'); } catch { toast('Nie udało się skopiować — zaznacz tekst ręcznie.', 'warn'); } });
  on('bMail', () => {
    // programy pocztowe (Outlook) przyjmują link do ok. 2000 znaków — skracamy na granicy wiersza
    const all = bundleText(b).split('\n');
    const tail = '\n…\nCiąg dalszy w aplikacji CNC Team lub w dołączonym PDF.';
    let body = '';
    for (const ln of all) {
      const next = body ? `${body}\n${ln}` : ln;
      if (encodeURIComponent(next + tail).length > 1500) { body += tail; break; }
      body = next;
    }
    location.href = `mailto:?subject=${encodeURIComponent(b.title)}&body=${encodeURIComponent(body)}`;
  });
  on('bDel', () => confirmReason('Usuń zestawienie', 'Zestawienie zniknie z listy (wpis o usunięciu zostanie w historii).', () => api(`/report-bundles/${b.id}`, { method: 'DELETE' }).then(() => { toast('Usunięto.'); location.hash = '#/analiza?t=zestawienia'; }), 'Usuń'));
}
