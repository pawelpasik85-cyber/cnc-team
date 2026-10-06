-- Migracja 6: kierownik zapisuje odnośnik do wpisu w CNC Team po przyjęciu zgłoszenia
-- (decyzja trafia do chmury przed utworzeniem wpisu lokalnego, więc odnośnik dopisujemy po fakcie).
create or replace function public.set_report_ref(report_id uuid, ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_manager() then raise exception 'Odnośnik ustawia kierownik'; end if;
  update reports set cnc_ref = set_report_ref.ref, updated_at = now()
  where id = set_report_ref.report_id and status = 'przyjete';
end $$;
revoke all on function public.set_report_ref(uuid, text) from public, anon;
grant execute on function public.set_report_ref(uuid, text) to authenticated;
