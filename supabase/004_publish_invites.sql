-- Migracja 4: publikacje kierownika i zaproszenia pracowników.
-- Odebranie dostępu (usunięcie zaproszenia i członkostwa) wykonuje się ręcznie w SQL Editor:
--   delete from public.members where email = '…' and role = 'pracownik';
--   delete from public.allowed_emails where email = '…' and role = 'pracownik';
-- (bez członkostwa RLS nie udostępnia żadnych danych).

create or replace function public.publish(items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare c jsonb; n integer := 0;
begin
  if not is_manager() then raise exception 'Publikuje kierownik'; end if;
  if pg_column_size(items) > 2000000 then raise exception 'Publikacja zbyt duża'; end if;
  for c in select * from jsonb_array_elements(items) loop
    insert into publications(scope, employee_ref, kind, data, published_at)
    values (c->>'scope', coalesce((c->>'employee_ref')::int, 0), c->>'kind', c->'data', now())
    on conflict (scope, employee_ref, kind) do update set data = excluded.data, published_at = now();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.set_invites(items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare c jsonb; n integer := 0;
begin
  if not is_manager() then raise exception 'Zaproszenia wysyła kierownik'; end if;
  for c in select * from jsonb_array_elements(items) loop
    if c->>'role' <> 'pracownik' then raise exception 'Przez aplikację można zapraszać tylko pracowników'; end if;
    insert into allowed_emails(email, role, employee_ref, display_name)
    values (lower(c->>'email'), 'pracownik', (c->>'employee_ref')::int, c->>'display_name')
    on conflict (email) do update set employee_ref = excluded.employee_ref, display_name = excluded.display_name
      where allowed_emails.role = 'pracownik';
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.list_invites() returns table(email text, role text, employee_ref integer, display_name text, registered boolean)
language sql stable security definer set search_path = public as $$
  select a.email, a.role, a.employee_ref, a.display_name, exists (select 1 from members m where m.email = a.email)
  from allowed_emails a where is_manager() order by a.display_name
$$;

revoke all on function public.publish(jsonb) from public, anon;
revoke all on function public.set_invites(jsonb) from public, anon;
revoke all on function public.list_invites() from public, anon;
grant execute on function public.publish(jsonb) to authenticated;
grant execute on function public.set_invites(jsonb) to authenticated;
grant execute on function public.list_invites() to authenticated;
