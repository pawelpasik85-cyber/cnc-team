'use strict';
// Budowa danych demonstracyjnych przez funkcje domenowe (te same walidacje co w API).
const T = require('../server/time');
const { hashPassword } = require('../server/core');
const People = require('../server/domain/people');
const Abs = require('../server/domain/absences');
const X = require('../server/domain/exits');
const P = require('../server/domain/projects');

const DEMO_PASSWORD = 'demo-cnc-2026';

function seedDemo(db) {
  const now = T.nowIso();
  db.run(`INSERT INTO users(login,display_name,password_hash,role,can_view_confidential,active,created_at) VALUES ('kierownik','Kierownik (admin)',?, 'admin',1,1,?)`, hashPassword(DEMO_PASSWORD), now);
  const admin = db.get(`SELECT * FROM users WHERE login='kierownik'`);
  db.run(`UPDATE settings SET value='Narzędziownia Demo' WHERE key='company_name'`);

  const emps = [
    { first_name: 'Adam', last_name: 'Nowicki', color: '#2E86DE', competences: ['NX 3X', 'Heidenhain', 'tacki NGK'], machine_ids: ['M-HARTFORD'] },
    { first_name: 'Bartosz', last_name: 'Wilk', color: '#E67E22', competences: ['NX 5X', 'Sinumerik', 'postprocesor'], machine_ids: ['M-GRIMME', 'M-HARTFORD'] },
    { first_name: 'Celina', last_name: 'Kruk', color: '#16A085', competences: ['NX 3X/5X', 'dokumentacja ustawienia'], machine_ids: ['M-GRIMME'] },
  ].map(e => People.saveEmployee(db, admin, { ...e, employment_start: '2023-03-01', initial_settlement_note: 'Salda początkowe wg zestawienia kadr na 01.01.2026' }));
  const [adam, bartosz, celina] = emps;
  for (const id of emps) People.approveInitialSettlement(db, admin, id);
  People.addTerms(db, admin, adam, { valid_from: '2023-03-01', fte_num: 1, fte_den: 1, daily_norm_min: 480, weekly_norm_min: 2400, leave_day_min: 480 });
  People.addTerms(db, admin, bartosz, { valid_from: '2023-03-01', fte_num: 1, fte_den: 1, daily_norm_min: 480, weekly_norm_min: 2400, leave_day_min: 480 });
  People.addTerms(db, admin, celina, { valid_from: '2023-03-01', fte_num: 1, fte_den: 1, daily_norm_min: 480, weekly_norm_min: 2400, leave_day_min: 480 });
  People.addTerms(db, admin, celina, { valid_from: '2026-07-01', fte_num: 7, fte_den: 8, daily_norm_min: 420, weekly_norm_min: 2100, leave_day_min: 420, note: 'Zmiana etatu na 7/8 od 1.07.2026' });

  const users = [['przelozony', 'Przełożony', 'supervisor', null], ['adam', 'Adam Nowicki', 'employee', adam], ['bartosz', 'Bartosz Wilk', 'employee', bartosz], ['celina', 'Celina Kruk', 'employee', celina]];
  for (const [login, name, role, emp] of users) People.saveUser(db, admin, { login, display_name: name, role, employee_id: emp, password: DEMO_PASSWORD });

  // Grafik: rotacja tygodniowa I/II/III od 31.08.2026 do 29.11.2026 (pn–pt). Celina na 7/8 — zmiana I 06:00–13:00.
  const tpl = Object.fromEntries(db.all('SELECT id, short FROM shift_templates').map(t => [t.short, t.id]));
  let monday = '2026-08-31';
  const rot = [[adam, bartosz, celina], [celina, adam, bartosz], [bartosz, celina, adam]];
  for (let w = 0; monday <= '2026-11-23'; w++, monday = T.addDays(monday, 7)) {
    const [e1, e2, e3] = rot[w % 3];
    const fri = T.addDays(monday, 4);
    for (const [emp, short] of [[e1, 'I'], [e2, 'II'], [e3, 'III']]) {
      const body = { employee_id: emp, shift_template_id: tpl[short], from: monday, to: fri };
      if (emp === celina && monday >= '2026-07-01') { // 7 h dziennie
        const t = db.get('SELECT * FROM shift_templates WHERE id=?', tpl[short]);
        const [h, m] = t.start_time.split(':').map(Number);
        body.start_time = t.start_time; body.end_time = `${String((h + 7) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      People.generateSchedule(db, admin, body);
    }
  }

  // Pule urlopu (wymiar z kadr, w minutach)
  for (const id of emps) {
    Abs.createPool(db, admin, { employee_id: id, acquisition_year: 2025, entitlement_min: id === celina ? 960 : 0, reason: 'Saldo zaległego urlopu wg kadr na 01.01.2026', opening: true });
    Abs.createPool(db, admin, { employee_id: id, acquisition_year: 2026, entitlement_min: id === celina ? 23 * 480 : 26 * 480, reason: id === celina ? 'Wymiar proporcjonalny do etatu 7/8 wg kadr' : 'Wymiar 26 dni wg kadr' });
  }
  const pool2026adam = db.get('SELECT id FROM leave_pools WHERE employee_id=? AND acquisition_year=2026', adam).id;
  Abs.adjustPool(db, admin, pool2026adam, { minutes: -480, reason: 'Korekta ewidencji: urlop udzielony w 2026 przed wdrożeniem aplikacji', hr_document_ref: 'KADRY/2026/014' });

  const cat = Object.fromEntries(db.all('SELECT id, code FROM absence_categories').map(c => [c.code, c.id]));
  const shiftDate = (emp, from) => db.get('SELECT work_date FROM schedule_entries WHERE employee_id=? AND work_date>=? ORDER BY work_date LIMIT 1', emp, from).work_date;

  const a1 = shiftDate(adam, '2026-09-14');
  Abs.createAbsence(db, admin, { employee_id: adam, category_id: cat.URLOP_WYP, status: 'wykorzystana', start_date: a1, end_date: T.addDays(a1, 1), employee_request: true });
  Abs.createAbsence(db, admin, { employee_id: bartosz, category_id: cat.L4, status: 'wykorzystana', start_date: '2026-10-05', end_date: '2026-10-07', document_ref: 'e-ZLA (nr w kadrach)' });
  const c1 = shiftDate(celina, '2026-10-12');
  {
    const s = db.get('SELECT start_at FROM schedule_entries WHERE employee_id=? AND work_date=?', celina, c1);
    const st = T.utcToLocal(s.start_at), en = T.utcToLocal(new Date(Date.parse(s.start_at) + 3 * 3600e3).toISOString());
    Abs.createAbsence(db, admin, { employee_id: celina, category_id: cat.SILA_WYZSZA, status: 'planowana', unit: 'godziny', start_date: st.date, end_date: en.date, start_time: st.time, end_time: en.time, employee_request: true });
  }
  const a2 = shiftDate(adam, '2026-10-19');
  Abs.createAbsence(db, admin, { employee_id: adam, category_id: cat.URLOP_WYP, status: 'planowana', start_date: a2, end_date: T.addDays(a2, 2), employee_request: true });

  // Wyjścia i odrabianie
  const exitOn = (emp, date, offStartMin, dur, extra = {}) => {
    const s = db.get('SELECT * FROM schedule_entries WHERE employee_id=? AND work_date=?', emp, date);
    const st = T.utcToLocal(new Date(Date.parse(s.start_at) + offStartMin * 60000).toISOString());
    const en = T.utcToLocal(new Date(Date.parse(s.start_at) + (offStartMin + dur) * 60000).toISOString());
    return X.createExit(db, admin, { employee_id: emp, start_date: st.date, start_time: st.time, end_date: en.date, end_time: en.time, written_request: true, document_ref: 'Wniosek papierowy w segregatorze działu', ...extra });
  };
  // wrzesień: Celina — wyjście nierozliczone → zamknięcie miesiąca z przekazaniem do kadr
  const cs = shiftDate(celina, '2026-09-21');
  exitOn(celina, cs, 120, 60, { confidential_note: 'Sprawa rodzinna (bez szczegółów)' });
  X.closeMonth(db, admin, '2026-09', { reason: 'Zamknięcie miesiąca' });

  // październik: Adam 90 min, odrobione 45 min (zatwierdzone)
  const ad = shiftDate(adam, '2026-10-01');
  const ex = exitOn(adam, ad, 300, 90);
  const shift = db.get('SELECT * FROM schedule_entries WHERE employee_id=? AND work_date=?', adam, ad);
  const mkStart = T.utcToLocal(shift.end_at);
  const mkEnd = T.utcToLocal(new Date(Date.parse(shift.end_at) + 45 * 60000).toISOString());
  X.createMakeup(db, admin, { employee_id: adam, start_date: mkStart.date, start_time: mkStart.time, end_date: mkEnd.date, end_time: mkEnd.time, allocations: [{ exit_id: ex.id, minutes: 45 }], approve: true, note: 'Po zmianie, za zgodą kierownika' });
  const cd = shiftDate(celina, '2026-10-02');
  exitOn(celina, cd, 60, 30);

  // Projekty
  const p1 = P.saveProject(db, admin, { order_no: 'ZL-26-0412', part_no: 'NGK-TR-118', part_rev: 'C', part_family: 'tacki NGK', machine_id: 'M-HARTFORD', due_date: '2026-10-16', priority: 1, folder_link: '\\\\serwer\\CAM\\ZL-26-0412', responsible_ids: [adam, celina], description: 'Tacka transportowa, produkcja jednostkowa' });
  P.setNcRevision(db, admin, p1, { nc_program: 'TR118_OP10', nc_rev: '03', reason: 'Pierwsza wersja zatwierdzona' });
  const p2 = P.saveProject(db, admin, { order_no: 'ZL-26-0420', part_no: 'WSP-5X-07', part_rev: 'A', part_family: 'wsporniki', machine_id: 'M-GRIMME', due_date: '2026-10-23', priority: 2, folder_link: '\\\\serwer\\CAM\\ZL-26-0420', responsible_ids: [bartosz] });
  P.setNcRevision(db, admin, p2, { nc_program: 'WSP07_5X', nc_rev: '01' });
  const p3 = P.saveProject(db, admin, { order_no: 'ZL-26-0425', part_no: 'NGK-TR-121', part_rev: 'A', part_family: 'tacki NGK', machine_id: 'M-HARTFORD', due_date: '2026-10-30', priority: 3, responsible_ids: [adam] });

  const tt = Object.fromEntries(db.all('SELECT id, code FROM task_types').map(t => [t.code, t.id]));
  const mk = (project, code, title, plan, extra = {}) => P.createTask(db, admin, { project_id: project, type_id: tt[code], title, planned_min: plan, difficulty: 3, expected_result: 'Zgodnie z dokumentacją', ...extra });
  const t1 = mk(p1, 'ANALIZA_DOK', 'Analiza rysunku i tolerancji', 60, { assignee_id: adam, operation_id: 'OP10' });
  const t2 = mk(p1, 'NX', 'Programowanie OP10 (kieszenie)', 240, { assignee_id: adam, operation_id: 'OP10', difficulty: 4 });
  const t3 = mk(p1, 'WERYFIKACJA', 'Weryfikacja programu OP10', 60, { assignee_id: celina, operation_id: 'OP10' });
  mk(p1, 'URUCHOMIENIE', 'Uruchomienie na Hartford', 90, { assignee_id: celina, operation_id: 'OP10' });
  mk(p1, 'WYKONANIE', 'Wykonanie detalu', null, { operation_id: 'OP10' });
  const t6 = mk(p2, 'TECHNOLOGIA', 'Dobór mocowania 5X', 120, { assignee_id: bartosz, operation_id: 'OP10' });
  mk(p2, 'NX', 'Programowanie 5X', 360, { assignee_id: bartosz, operation_id: 'OP10', difficulty: 5 });
  mk(p3, 'ANALIZA_DOK', 'Analiza dokumentacji', 45, { assignee_id: adam, operation_id: 'OP10' });

  P.addTimeEntry(db, admin, { task_id: t1, employee_id: adam, work_date: '2026-10-01', active_min: 55 });
  P.updateTask(db, admin, t1, { status: 'zakonczone', result_confirmation: 'Uwagi do tolerancji uzgodnione z technologiem' });
  P.addTimeEntry(db, admin, { task_id: t2, employee_id: adam, work_date: '2026-10-01', active_min: 180 });
  P.addTimeEntry(db, admin, { task_id: t2, employee_id: celina, work_date: '2026-10-02', active_min: 150, rework_min: 40, cause: 'zmiana_zakresu', note: 'Klient zmienił fazowanie' });
  P.changeTaskPlan(db, admin, t2, { planned_min: 300, reason: 'Zmiana zakresu: dodatkowe fazowania (decyzja klienta)' });
  P.updateTask(db, admin, t2, { status: 'zakonczone', result_confirmation: 'Program OP10 rev 03 wygenerowany i postprocesowany' });
  P.addTimeEntry(db, admin, { task_id: t3, employee_id: celina, work_date: '2026-10-05', active_min: 30, blocked_min: 45, cause: 'narzedzia' });
  P.updateTask(db, admin, t3, { status: 'zablokowane', block_reason: 'Brak oprawki HSK dla freza Ø6' });
  P.addTimeEntry(db, admin, { task_id: t6, employee_id: bartosz, work_date: '2026-10-02', active_min: 200 });
  P.updateTask(db, admin, t6, { status: 'zakonczone', result_confirmation: 'Mocowanie w imadle 5X zatwierdzone' });
  P.addExplanation(db, admin, t6, { explanation: 'Pierwszy detal w tej rodzinie — brak gotowego mocowania.', conclusion: 'Przygotować szablon mocowania dla rodziny wsporników.' });

  P.updateBoard(db, admin, 'M-HARTFORD', { project_id: p1, stage: 'Weryfikacja programu OP10', assignee_id: celina, next_task_id: t3, next_program_status: 'w_przygotowaniu', block_reason: 'Brak oprawki HSK dla freza Ø6' });
  P.updateBoard(db, admin, 'M-GRIMME', { project_id: p2, stage: 'Programowanie 5X', assignee_id: bartosz, next_program_status: 'brak', expected_end_date: '2026-10-09', expected_end_time: '14:00', expected_end_source: 'szacunek programisty' });

  P.createHandover(db, admin, { project_id: p1, machine_id: 'M-HARTFORD', from_employee_id: adam, to_employee_id: celina, shift_date: '2026-10-01',
    done_text: 'OP10: kieszenie zgrubnie i wykańczająco, postprocesor Heidenhain.', remaining_text: 'Weryfikacja kolizji oprawki przy ściance 3; fazowania.',
    stopped_at_text: 'Operacja „FAZY_ZEW” — nie wygenerowano', tooling_notes: 'Frez Ø6 wymaga oprawki HSK — sprawdzić dostępność', checklist: ['Sprawdzić bazę Z na płycie', 'Porównać rev 03 z rysunkiem C'] });
  P.addManualTechData(db, admin, p1, { operation_id: 'OP10', nx_time_min: 95, machine_est_min: 110 });
  X.recomputeAlerts(db);
  return { admin, adam, bartosz, celina, p1, p2, p3 };
}

module.exports = { seedDemo, DEMO_PASSWORD };
