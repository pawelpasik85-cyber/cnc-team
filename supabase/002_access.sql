-- Migracja 2: role, polityki RLS, rejestracja tylko z zaproszenia.

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and role = 'kierownik')
$$;
create or replace function public.my_employee_ref() returns integer
language sql stable security definer set search_path = public as $$
  select employee_ref from members where user_id = auth.uid()
$$;
revoke all on function public.is_manager() from public, anon;
revoke all on function public.my_employee_ref() from public, anon;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.my_employee_ref() to authenticated;

create policy "czlonek widzi siebie, kierownik wszystkich" on public.members
  for select to authenticated using (user_id = auth.uid() or public.is_manager());
create policy "pracownik widzi swoje, kierownik wszystkie" on public.reports
  for select to authenticated using (user_id = auth.uid() or public.is_manager());
create policy "zespol dla czlonkow, osobiste dla wlasciciela" on public.publications
  for select to authenticated using (
    public.is_manager()
    or (scope = 'zespol' and exists (select 1 from public.members where user_id = auth.uid()))
    or (scope = 'osobiste' and employee_ref = public.my_employee_ref())
  );
-- Brak polityk insert/update/delete: zapisy wyłącznie przez funkcje z migracji 3 i 4.

create or replace function public.gate_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_emails where lower(email) = lower(new.email)) then
    raise exception 'Ten adres e-mail nie ma zaproszenia do CNC Team';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;
create trigger cnc_gate_signup before insert on auth.users for each row execute function public.gate_signup();

create or replace function public.setup_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.allowed_emails;
begin
  select * into a from public.allowed_emails where lower(email) = lower(new.email);
  insert into public.members(user_id, email, role, employee_ref, display_name)
  values (new.id, lower(new.email), a.role, a.employee_ref, a.display_name);
  return new;
end $$;
create trigger cnc_setup_member after insert on auth.users for each row execute function public.setup_member();
revoke all on function public.gate_signup() from public, anon, authenticated;
revoke all on function public.setup_member() from public, anon, authenticated;
