-- Migracja 5: poprawka decide_report — parametr „note” był niejednoznaczny z kolumną (błąd 42702).
create or replace function public.decide_report(report_id uuid, decision text, note text, ref text) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not is_manager() then raise exception 'Decyzję podejmuje kierownik'; end if;
  if decide_report.decision not in ('przyjete', 'odrzucone') then raise exception 'Niepoprawna decyzja'; end if;
  update reports set status = decide_report.decision, decision_note = nullif(trim(decide_report.note), ''),
    cnc_ref = decide_report.ref, decided_at = now(), decided_by = auth.uid(), updated_at = now()
  where id = decide_report.report_id and status = 'nowe' returning * into r;
  if r is null then raise exception 'Zgłoszenie nie istnieje albo zostało już rozpatrzone lub wycofane'; end if;
  return r;
end $$;
