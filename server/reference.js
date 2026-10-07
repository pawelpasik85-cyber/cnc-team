'use strict';
// Dane referencyjne wstawiane przy starcie, jeśli ich brakuje (nie nadpisują zmian administratora).
const { ensureHolidays } = require('./domain/people');
const T = require('./time');

const SETTINGS = [
  ['company_name', 'Firma', 'Nazwa wyświetlana w nagłówku'],
  ['exit_settlement_period', 'miesiac_kalendarzowy', 'Zasada FIRMY: wyjścia prywatne rozliczane w miesiącu kalendarzowym (nie jest to termin ustawowy)'],
  ['night_shift_month_rule', 'dzien_rozpoczecia', 'Zmiana nocna (oraz wyjście na niej) należy do dnia i miesiąca rozpoczęcia zmiany'],
  ['min_daily_rest_min', '660', 'Minimalny nieprzerwany odpoczynek dobowy w minutach (art. 132 KP: 11 h) — do potwierdzenia wyjątków przez kadry'],
  ['employee_sees_team_balances', 'nie', 'Czy pracownik widzi salda do odrobienia całego zespołu (tak/nie); domyślnie tylko własne'],
  ['deviation_threshold_pct', '20', 'Próg odchylenia (%) dla oznaczenia „odchylenie wymagające wyjaśnienia”'],
  ['deviation_threshold_min', '60', 'Próg odchylenia (min) — oba progi muszą być przekroczone'],
  ['employee_sees_all_projects', 'nie', 'Czy pracownik widzi wszystkie projekty (tak/nie); domyślnie tylko te, w których ma zadanie, jest odpowiedzialny albo które są na tablicy maszyn'],
  ['employee_sees_project_hours', 'nie', 'Czy pracownik widzi godziny projektu: przepracowane, plan i wynik (tak/nie); domyślnie tylko kierownik i przełożony'],
  ['project_delay_warn_pct', '5', 'Opóźnienie projektu (punkty %) powyżej którego projekt jest oznaczany jako „opóźniony”'],
  ['project_delay_alert_pct', '15', 'Opóźnienie projektu (punkty %) powyżej którego projekt jest „zagrożony” (także po terminie)'],
  ['login_max_failures', '5', 'Liczba błędnych haseł, po której konto jest czasowo blokowane'],
  ['login_lock_min', '15', 'Czas blokady logowania po serii błędnych haseł (minuty)'],
  ['cnc_process_url_template', '', 'Szablon odnośnika „Otwórz w CNC Process”, np. http://localhost:3001/projekty/{project_id} (puste = brak integracji)'],
];

const LEGAL_NOTE = 'Źródła nie zostały pobrane i porównane z tekstem jednolitym w tej wersji — wymaga potwierdzenia przez kadry.';
// [code, name, subtype, parent, short, icon, unit, pool_kind, limit_rule, limit_value, carryover, affects, debt, confirm, visibility, public_label, basis, status]
const CATEGORIES = [
  ['URLOP_WYP', 'Urlop wypoczynkowy', null, null, 'UW', 'leave', 'dni', 'wypoczynkowy', 'Wymiar wg stażu (20 lub 26 dni) — wprowadza administrator w godzinach na podstawie danych kadr. Rozliczenie wg grafiku w godzinach.', null, 'Niewykorzystany przechodzi na kolejny rok; zaległy należy udzielić do 30 września roku następnego (art. 168). Upływ terminu nie powoduje utraty — brak automatycznego zerowania.', 'zastepuje_grafik', 0, 'wniosek/plan urlopów', 'pelna', 'Urlop', 'KP art. 152–154², 161, 168', 'do_potwierdzenia_przez_kadry'],
  ['URLOP_NA_ZADANIE', 'Urlop na żądanie', 'część urlopu wypoczynkowego', 'URLOP_WYP', 'UŻ', 'leave', 'dni', 'wypoczynkowy', 'Do 4 dni w roku kalendarzowym łącznie, pomniejsza pulę wypoczynkową.', { max_days_per_year: 4 }, 'Jak urlop wypoczynkowy', 'zastepuje_grafik', 0, 'zgłoszenie najpóźniej w dniu urlopu', 'pelna', 'Urlop', 'KP art. 167²', 'do_potwierdzenia_przez_kadry'],
  ['L4', 'Chorobowe / L4', null, null, 'L4', 'medical', 'dni', null, 'Brak limitu w aplikacji. NIE przechowywać diagnoz ani szczegółów medycznych.', null, null, 'zastepuje_grafik', 0, 'zaświadczenie lekarskie (e-ZLA)', 'podstawowa', 'Nieobecność', 'KP art. 92; ustawa o świadczeniach pieniężnych z ubezpieczenia społecznego w razie choroby i macierzyństwa', 'do_potwierdzenia_przez_kadry'],
  ['OPIEKA_ZUS', 'Opieka nad chorym dzieckiem lub członkiem rodziny', 'zasiłek opiekuńczy', null, 'OP', 'care', 'dni', null, 'Limity roczne zasiłku opiekuńczego (ZUS) — weryfikuje kadry; aplikacja ich nie egzekwuje.', null, null, 'zastepuje_grafik', 0, 'zaświadczenie / oświadczenie ZUS', 'podstawowa', 'Nieobecność', 'ustawa zasiłkowa art. 32–33 (ZUS)', 'do_potwierdzenia_przez_kadry'],
  ['OPIEKA_188', 'Opieka nad dzieckiem (art. 188 KP)', null, null, '188', 'care', 'dni_lub_godziny', 'opieka_188', '16 godzin albo 2 dni w roku kalendarzowym; jednostka wybierana przy pierwszym wniosku w roku; niepełny etat — proporcjonalnie (do potwierdzenia).', { days: 2, minutes: 960 }, 'Nie przechodzi na kolejny rok', 'zastepuje_grafik', 0, 'wniosek pracownika', 'podstawowa', 'Zwolnienie od pracy', 'KP art. 188', 'do_potwierdzenia_przez_kadry'],
  ['SILA_WYZSZA', 'Zwolnienie z powodu siły wyższej', null, null, 'SW', 'force', 'dni_lub_godziny', 'sila_wyzsza', '2 dni albo 16 godzin w roku kalendarzowym (jedna pula); jednostka wg pierwszego wniosku w roku; zasady dla niepełnego etatu do potwierdzenia.', { days: 2, minutes: 960 }, 'Nie przechodzi na kolejny rok', 'zastepuje_grafik', 0, 'wniosek pracownika', 'podstawowa', 'Zwolnienie od pracy', 'KP art. 148¹', 'do_potwierdzenia_przez_kadry'],
  ['URLOP_OPIEKUNCZY', 'Urlop opiekuńczy', null, null, 'UO', 'care', 'dni', null, '5 dni w roku kalendarzowym (bezpłatny).', { max_days_per_year: 5 }, 'Nie przechodzi', 'zastepuje_grafik', 0, 'wniosek pracownika', 'podstawowa', 'Urlop', 'KP art. 173¹–173³', 'do_potwierdzenia_przez_kadry'],
  ['MACIERZYNSKI', 'Urlop macierzyński', null, null, 'UM', 'family', 'dni', null, 'Wymiar ustawowy wg liczby dzieci — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'wniosek / akt urodzenia', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP art. 180', 'do_potwierdzenia_przez_kadry'],
  ['MACIERZYNSKI_UZUP', 'Urlop uzupełniający macierzyński', 'wcześniactwo / hospitalizacja noworodka', 'MACIERZYNSKI', 'UMU', 'family', 'dni', null, 'Wymiar zależny od okresu hospitalizacji / wcześniactwa — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'dokumentacja szpitalna (bez diagnoz w aplikacji)', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP — przepisy o uzupełniającym urlopie macierzyńskim (nowelizacja z 2025 r.); numer artykułu do potwierdzenia', 'do_potwierdzenia_przez_kadry'],
  ['NA_WAR_MACIERZ', 'Urlop na warunkach urlopu macierzyńskiego', null, null, 'UWM', 'family', 'dni', null, 'Dotyczy przyjęcia dziecka na wychowanie — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'wniosek', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP art. 183', 'do_potwierdzenia_przez_kadry'],
  ['RODZICIELSKI', 'Urlop rodzicielski', null, null, 'UR', 'family', 'dni', null, 'Wymiar ustawowy, część nieprzenoszalna dla każdego rodzica — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'wniosek', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP art. 182¹a–182¹g', 'do_potwierdzenia_przez_kadry'],
  ['OJCOWSKI', 'Urlop ojcowski („tatusiowe”)', null, null, 'UOJ', 'family', 'dni', null, 'Do 2 tygodni, do ukończenia przez dziecko 12 miesięcy (odrębny od rodzicielskiego i okolicznościowego).', null, 'Nie przechodzi', 'zastepuje_grafik', 0, 'wniosek', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP art. 182³', 'do_potwierdzenia_przez_kadry'],
  ['WYCHOWAWCZY', 'Urlop wychowawczy', null, null, 'UWY', 'family', 'dni', null, 'Wymiar ustawowy — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'wniosek', 'podstawowa', 'Urlop związany z rodzicielstwem', 'KP art. 186–186²', 'do_potwierdzenia_przez_kadry'],
  ['OKOLICZNOSCIOWY', 'Urlop okolicznościowy', '(kategoria nadrzędna)', null, 'OK', 'event', 'dni', null, 'Wymiar zależy od podtypu.', null, null, 'zastepuje_grafik', 0, 'dokument zdarzenia', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie MPiPS z 15.05.1996 w sprawie usprawiedliwiania nieobecności i udzielania zwolnień, § 15', 'do_potwierdzenia_przez_kadry'],
  ['OKOL_SLUB', 'Urlop okolicznościowy', 'ślub pracownika', 'OKOLICZNOSCIOWY', 'OKŚ', 'event', 'dni', null, '2 dni', { max_days_per_event: 2 }, null, 'zastepuje_grafik', 0, 'akt / dokument', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 15 pkt 1', 'do_potwierdzenia_przez_kadry'],
  ['OKOL_NARODZINY', 'Urlop okolicznościowy', 'narodziny dziecka pracownika', 'OKOLICZNOSCIOWY', 'OKN', 'event', 'dni', null, '2 dni (odrębne od urlopu ojcowskiego i rodzicielskiego)', { max_days_per_event: 2 }, null, 'zastepuje_grafik', 0, 'akt urodzenia', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 15 pkt 1', 'do_potwierdzenia_przez_kadry'],
  ['OKOL_ZGON_BLISKI', 'Urlop okolicznościowy', 'zgon i pogrzeb małżonka, dziecka, rodzica, ojczyma, macochy', 'OKOLICZNOSCIOWY', 'OKZ', 'event', 'dni', null, '2 dni', { max_days_per_event: 2 }, null, 'zastepuje_grafik', 0, 'akt zgonu', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 15 pkt 1', 'do_potwierdzenia_przez_kadry'],
  ['OKOL_SLUB_DZIECKA', 'Urlop okolicznościowy', 'ślub dziecka', 'OKOLICZNOSCIOWY', 'OKD', 'event', 'dni', null, '1 dzień', { max_days_per_event: 1 }, null, 'zastepuje_grafik', 0, 'dokument', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 15 pkt 2', 'do_potwierdzenia_przez_kadry'],
  ['OKOL_ZGON_DALSZY', 'Urlop okolicznościowy', 'zgon i pogrzeb rodzeństwa, teściów, dziadków, osoby na utrzymaniu', 'OKOLICZNOSCIOWY', 'OKR', 'event', 'dni', null, '1 dzień', { max_days_per_event: 1 }, null, 'zastepuje_grafik', 0, 'akt zgonu', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 15 pkt 2', 'do_potwierdzenia_przez_kadry'],
  ['BEZPLATNY', 'Urlop bezpłatny', null, null, 'UB', 'unpaid', 'dni', null, 'Na wniosek pracownika, za zgodą pracodawcy.', null, null, 'zastepuje_grafik', 0, 'pisemny wniosek', 'podstawowa', 'Urlop', 'KP art. 174', 'do_potwierdzenia_przez_kadry'],
  ['WYJSCIE_PRYWATNE', 'Wyjście prywatne', null, null, 'WP', 'exit', 'minuty', null, 'Odpracowanie wg zasad firmy (miesiąc kalendarzowy); odpracowanie nie jest pracą w godzinach nadliczbowych i nie może naruszać odpoczynku.', null, null, 'odrabianie', 1, 'pisemny wniosek pracownika', 'pelna', 'Wyjście prywatne', 'KP art. 151² + zasada firmy', 'do_potwierdzenia_przez_kadry'],
  ['BADANIA_CIAZA', 'Badania lekarskie związane z ciążą', null, null, 'BC', 'medical', 'godziny', null, 'Zwolnienie na czas badań, jeśli nie mogą być przeprowadzone poza godzinami pracy.', null, null, 'zastepuje_grafik', 0, 'zaświadczenie', 'poufna', 'Nieobecność', 'KP art. 185 § 2', 'do_potwierdzenia_przez_kadry'],
  ['BADANIA_PROFIL', 'Badania profilaktyczne pracownika', null, null, 'BP', 'medical', 'godziny', null, 'Badania w miarę możliwości w godzinach pracy, bez utraty wynagrodzenia.', null, null, 'zastepuje_grafik', 0, 'skierowanie', 'pelna', 'Badania', 'KP art. 229 § 3', 'do_potwierdzenia_przez_kadry'],
  ['KREW', 'Zwolnienie — oddawanie krwi', null, null, 'KR', 'blood', 'dni', null, 'Zakres zwolnienia (dzień oddania / badania) — do potwierdzenia przez kadry.', null, null, 'zastepuje_grafik', 0, 'zaświadczenie centrum krwiodawstwa', 'pelna', 'Zwolnienie od pracy', 'ustawa o publicznej służbie krwi; rozporządzenie z 15.05.1996 § 12', 'do_potwierdzenia_przez_kadry'],
  ['SZKOLENIOWY', 'Urlop szkoleniowy / zwolnienie na podnoszenie kwalifikacji', null, null, 'SZ', 'training', 'dni_lub_godziny', null, 'Wymiar wg rodzaju egzaminu i umowy szkoleniowej — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'umowa / skierowanie', 'pelna', 'Szkolenie', 'KP art. 103¹–103⁶', 'do_potwierdzenia_przez_kadry'],
  ['WEZWANIE', 'Wezwanie sądu, urzędu lub innego organu', null, null, 'WZ', 'summons', 'godziny', null, 'Na czas niezbędny do stawienia się.', null, null, 'zastepuje_grafik', 0, 'wezwanie', 'podstawowa', 'Zwolnienie od pracy', 'Rozporządzenie z 15.05.1996 § 6', 'do_potwierdzenia_przez_kadry'],
  ['WOJSKO', 'Obowiązki wojskowe', null, null, 'WO', 'military', 'dni', null, 'Wg wezwania — weryfikuje kadry.', null, null, 'zastepuje_grafik', 0, 'karta powołania / wezwanie', 'podstawowa', 'Zwolnienie od pracy', 'ustawa o obronie Ojczyzny; rozporządzenie z 15.05.1996', 'do_potwierdzenia_przez_kadry'],
  ['SPOZNIENIE_USPRAW', 'Spóźnienie usprawiedliwione', null, null, 'SPU', 'exit', 'godziny', null, 'Czas od początku zmiany do przyjścia; nie tworzy długu do odrobienia. Gdy pracownik chce odpracować — rejestruj jako wyjście prywatne.', null, null, 'zastepuje_grafik', 0, 'zgłoszenie pracownika / dokument', 'podstawowa', 'Spóźnienie', 'Rozporządzenie z 15.05.1996 (usprawiedliwianie nieobecności); KP art. 151² przy odpracowaniu', 'do_potwierdzenia_przez_kadry'],
  ['SPOZNIENIE_NIEUSPRAW', 'Spóźnienie nieusprawiedliwione', null, null, 'SPN', 'exit', 'godziny', null, 'Decyzja kierownika; konsekwencje ocenia kadry.', null, null, 'zastepuje_grafik', 0, 'decyzja kierownika', 'poufna', 'Spóźnienie', 'KP art. 100; rozporządzenie z 15.05.1996', 'do_potwierdzenia_przez_kadry'],
  ['INNE_USTAWOWE', 'Inne ustawowe zwolnienie od pracy', null, null, 'IZ', 'other', 'dni_lub_godziny', null, 'Wg przepisu wskazanego w dokumencie.', null, null, 'zastepuje_grafik', 0, 'dokument', 'podstawowa', 'Zwolnienie od pracy', 'wg wskazanego przepisu', 'do_potwierdzenia_przez_kadry'],
  ['INNE_USPRAW', 'Inna nieobecność usprawiedliwiona', null, null, 'NU', 'other', 'dni', null, null, null, null, 'zastepuje_grafik', 0, 'dokument usprawiedliwiający', 'poufna', 'Nieobecność', 'Rozporządzenie z 15.05.1996', 'do_potwierdzenia_przez_kadry'],
  ['NIEUSPRAW', 'Nieobecność nieusprawiedliwiona', null, null, 'NN', 'other', 'dni', null, null, null, null, 'zastepuje_grafik', 0, 'decyzja kierownika', 'poufna', 'Nieobecność', 'KP art. 100; rozporządzenie z 15.05.1996', 'do_potwierdzenia_przez_kadry'],
];

const TASK_TYPES = [
  ['ANALIZA_DOK', 'Analiza dokumentacji', 'przygotowanie', 1], ['TECHNOLOGIA', 'Dobór technologii i mocowania', 'przygotowanie', 2],
  ['NARZEDZIA', 'Dobór narzędzi', 'przygotowanie', 1], ['NX', 'Programowanie w NX', 'przygotowanie', 4], ['POSTPROCES', 'Postprocesowanie', 'przygotowanie', 1],
  ['WERYFIKACJA', 'Weryfikacja', 'przygotowanie', 2], ['DOK_USTAWIENIA', 'Dokumentacja ustawienia', 'przygotowanie', 1],
  ['URUCHOMIENIE', 'Uruchomienie', 'wykonanie', 3], ['WYKONANIE', 'Wykonanie detalu (potwierdzenie etapu)', 'wykonanie', 4],
  ['KOREKTA', 'Korekta programu', 'wykonanie', 1], ['WSPARCIE', 'Wsparcie operatora', 'wykonanie', 1], ['PRZEKAZANIE', 'Przekazanie zmiany', 'wykonanie', 1],
];

function ensureReference(db) {
  db.tx(() => {
    for (const [k, v, d] of SETTINGS) db.run('INSERT OR IGNORE INTO settings(key,value,description) VALUES (?,?,?)', k, v, d);
    CATEGORIES.forEach((c, i) => {
      const [code, name, subtype, parent, short, icon, unit, pool, rule, lv, carry, affects, debt, confirm, vis, label, basis, status] = c;
      db.run(`INSERT OR IGNORE INTO absence_categories(code,name,subtype,parent_code,short,icon,unit,pool_kind,limit_rule,limit_value,carryover_rule,
        affects_schedule,creates_makeup_debt,requires_confirmation,visibility,public_label,legal_basis,verified_at,verification_status,active,sort)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`, code, name, subtype, parent, short, icon, unit, pool, rule, lv ? JSON.stringify(lv) : null,
      carry, affects, debt, confirm, vis, label, `${basis}. ${LEGAL_NOTE}`, null, status, (i + 1) * 10);
    });
    TASK_TYPES.forEach(([code, name, phase, w], i) => db.run('INSERT OR IGNORE INTO task_types(code,name,phase,default_weight,active,sort) VALUES (?,?,?,?,1,?)', code, name, phase, w, (i + 1) * 10));
    db.run(`INSERT OR IGNORE INTO machines(id,name,axes,control,model,tool_holder,plate,notes,sort,active) VALUES ('M-HARTFORD','Hartford',3,'Heidenhain','HCMC-18','BT50',
      'Zasilanie 380/415 V, 3 fazy, 50/60 Hz · moc 45 kVA · powietrze 6,5 kg/cm² (92 psi) · masa 16 000 kg',NULL,1,1)`);
    db.run(`INSERT OR IGNORE INTO machines(id,name,axes,control,model,tool_holder,plate,notes,sort,active) VALUES ('M-GRIMME','Grimme',5,'Sinumerik','PSF-M 25/17','HSK40',
      'Grimme SysTech · nr ser. 870 · rok 2013 · wrzeciono Classic 120 · napęd Siemens (SIE/HD), serwo · 230/400 V, 50 Hz · 30,2 kW',NULL,2,1)`);
    for (const m of db.all('SELECT id FROM machines')) db.run('INSERT OR IGNORE INTO machine_board(machine_id) VALUES (?)', m.id);
    if (!db.get('SELECT 1 FROM shift_templates')) {
      db.run(`INSERT INTO shift_templates(name,short,start_time,end_time,break_min) VALUES ('Zmiana I','I','06:00','14:00',0),('Zmiana II','II','14:00','22:00',0),('Zmiana III (nocna)','III','22:00','06:00',0)`);
    }
    const y = Number(T.today().slice(0, 4));
    for (const yr of [y - 1, y, y + 1]) ensureHolidays(db, yr);
  });
}

module.exports = { ensureReference, CATEGORIES, TASK_TYPES };
