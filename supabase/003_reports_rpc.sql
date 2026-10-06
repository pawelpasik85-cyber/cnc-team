-- Migracja 3: zgłoszenia — złożenie (pracownik), wycofanie (pracownik), decyzja (kierownik).
-- Wersja decide_report z tej migracji miała niejednoznaczną nazwę parametru „note”;
-- poprawka jest w migracji 5 (wykryta testem supabase/tests/rls_check.sql).

create or replace function public.submit_report(p jsonb) returns public.reports
language plpgsql security definer set search_path = public as $$
declare m public.members; r public.reports;
begin
  select * into m from members where user_id = auth.uid();
  if m is null then raise exception 'Brak konta w CNC Team'; end if;
  if m.role <> 'pracownik' then raise exception 'Zgłoszenia składają pracownicy'; end if;
  -- ponowne wysłanie tego samego zgłoszenia (np. po zerwaniu połączenia) zwraca zapisany wiersz
  select * into r from reports where user_id = auth.uid() and client_id = (p->>'client_id')::uuid;
  if found then return r; end if;
  if (p->>'date_from')::date < current_date - 31 then raise exception 'Zgłoszenie może dotyczyć najwyżej 31 dni wstecz'; end if;
  insert into reports(client_id, user_id, employee_ref, kind, date_from, date_to, time_from, time_to, note)
  values ((p->>'client_id')::uuid, auth.uid(), m.employee_ref, p->>'kind', (p->>'date_from')::date,
          coalesce(nullif(p->>'date_to', '')::date, (p->>'date_from')::date),
          nullif(p->>'time_from', ''), nullif(p->>'time_to', ''), nullif(trim(p->>'note'), ''))
  returning * into r;
  return r;
end $$;

create or replace function public.withdraw_report(report_id uuid) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  update reports set status = 'wycofane', updated_at = now()
  where id = report_id and user_id = auth.uid() and status = 'nowe' returning * into r;
  if r is null then raise exception 'Można wycofać tylko własne zgłoszenie, które nie zostało jeszcze rozpatrzone'; end if;
  return r;
end $$;

create or replace function public.decide_report(report_id uuid, decision text, note text, ref text) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not is_manager() then raise exception 'Decyzję podejmuje kierownik'; end if;
  if decision not in ('przyjete', 'odrzucone') then raise exception 'Niepoprawna decyzja'; end if;
  update reports set status = decision, decision_note = nullif(trim(note), ''), cnc_ref = ref,
    decided_at = now(), decided_by = auth.uid(), updated_at = now()
  where id = report_id and status = 'nowe' returning * into r;
  if r is null then raise exception 'Zgłoszenie nie istnieje albo zostało już rozpatrzone lub wycofane'; end if;
  return r;
end $$;

revoke all on function public.submit_report(jsonb) from public, anon;
revoke all on function public.withdraw_report(uuid) from public, anon;
revoke all on function public.decide_report(uuid, text, text, text) from public, anon;
grant execute on function public.submit_report(jsonb) to authenticated;
grant execute on function public.withdraw_report(uuid) to authenticated;
grant execute on function public.decide_report(uuid, text, text, text) to authenticated;
