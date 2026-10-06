-- CNC Team — serwer zgłoszeń i publikacji (Supabase, projekt "cnc-team", eu-central-1).
-- Zasada: w chmurze są tylko dane potrzebne pracownikowi poza firmą:
--   * zgłoszenia pracowników (nieobecność, spóźnienie, wyjście) i decyzje kierownika,
--   * publikacje kierownika: grafik zespołu oraz WŁASNY grafik/saldo pracownika.
-- Notatki poufne, dokumenty kadrowe, kategorie L4, raporty efektywności NIE trafiają do chmury.
-- Klienci używają wyłącznie klucza publikowalnego; odczyt przez RLS, zapis przez funkcje RPC.

-- Lista zaproszeń: tylko te adresy mogą założyć konto. Niewidoczna dla klientów.
create table public.allowed_emails (
  email text primary key,
  role text not null check (role in ('kierownik', 'pracownik')),
  employee_ref integer,              -- identyfikator pracownika w CNC Team (dla roli pracownik)
  display_name text not null,
  created_at timestamptz not null default now(),
  check (role = 'kierownik' or employee_ref is not null)
);
alter table public.allowed_emails enable row level security;

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('kierownik', 'pracownik')),
  employee_ref integer unique,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

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

create policy "członek widzi siebie, kierownik wszystkich" on public.members
  for select to authenticated using (user_id = auth.uid() or public.is_manager());

-- Rejestracja tylko z zaproszenia; konto potwierdzane od razu (adres jest na liście kierownika).
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

-- Zgłoszenia pracowników
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,                    -- identyfikator nadany na telefonie: ochrona przed podwójnym wysłaniem
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_ref integer not null,
  kind text not null check (kind in ('nieobecnosc', 'spoznienie', 'wyjscie', 'inne')),
  date_from date not null,
  date_to date not null,
  time_from text check (time_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_to text check (time_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text check (char_length(note) <= 500),
  status text not null default 'nowe' check (status in ('nowe', 'przyjete', 'odrzucone', 'wycofane')),
  decision_note text check (char_length(decision_note) <= 500),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  cnc_ref text,                               -- identyfikator wpisu utworzonego w CNC Team
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint generated always as identity,
  unique (user_id, client_id),
  check (date_to >= date_from),
  check (date_to - date_from <= 60)
);
create index reports_employee_idx on public.reports(employee_ref, created_at desc);
create index reports_status_idx on public.reports(status);
alter table public.reports enable row level security;

create policy "pracownik widzi swoje, kierownik wszystkie" on public.reports
  for select to authenticated using (user_id = auth.uid() or public.is_manager());
-- brak polityk insert/update/delete: zapis tylko przez funkcje poniżej

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

-- Publikacje kierownika: zakres 'zespol' (wszyscy członkowie) lub 'osobiste' (tylko dany pracownik)
create table public.publications (
  scope text not null check (scope in ('zespol', 'osobiste')),
  employee_ref integer not null default 0,    -- 0 dla zakresu 'zespol'
  kind text not null check (char_length(kind) <= 40),
  data jsonb not null,
  published_at timestamptz not null default now(),
  primary key (scope, employee_ref, kind),
  check ((scope = 'zespol') = (employee_ref = 0))
);
alter table public.publications enable row level security;
create policy "zespół dla członków, osobiste tylko dla właściciela" on public.publications
  for select to authenticated using (
    public.is_manager()
    or (scope = 'zespol' and exists (select 1 from members where user_id = auth.uid()))
    or (scope = 'osobiste' and employee_ref = public.my_employee_ref())
  );

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
revoke all on function public.publish(jsonb) from public, anon;
grant execute on function public.publish(jsonb) to authenticated;

-- Kierownik zarządza listą zaproszeń przez funkcje (tabela nie jest czytelna z klienta).
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
create or replace function public.revoke_invite(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_manager() then raise exception 'Zaproszenia usuwa kierownik'; end if;
  delete from allowed_emails where lower(email) = lower(p_email) and role = 'pracownik';
  delete from auth.users where lower(email) = lower(p_email)
    and id in (select user_id from members where role = 'pracownik');
end $$;
revoke all on function public.set_invites(jsonb) from public, anon;
revoke all on function public.list_invites() from public, anon;
revoke all on function public.revoke_invite(text) from public, anon;
grant execute on function public.set_invites(jsonb) to authenticated;
grant execute on function public.list_invites() to authenticated;
grant execute on function public.revoke_invite(text) to authenticated;

-- Funkcje wyzwalaczy nie są dostępne przez API
revoke all on function public.gate_signup() from public, anon, authenticated;
revoke all on function public.setup_member() from public, anon, authenticated;
