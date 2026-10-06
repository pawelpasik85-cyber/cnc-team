-- CNC Team — chmura (Supabase „cnc-team”, eu-central-1). Migracja 1: tabele.
-- W chmurze są tylko dane potrzebne pracownikowi poza firmą: jego zgłoszenia i decyzje,
-- jego grafik/saldo oraz grafik zespołu. Notatki poufne, dokumenty, kategorie L4 i raporty
-- efektywności zostają na komputerze kierownika. Migracje tylko dopisujemy, nigdy nie edytujemy.

create table public.allowed_emails (
  email text primary key,
  role text not null check (role in ('kierownik', 'pracownik')),
  employee_ref integer,              -- id pracownika w CNC Team (dla roli pracownik)
  display_name text not null,
  created_at timestamptz not null default now(),
  check (role = 'kierownik' or employee_ref is not null)
);
alter table public.allowed_emails enable row level security;   -- brak polityk: niewidoczna dla klientów

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('kierownik', 'pracownik')),
  employee_ref integer unique,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,           -- nadany na telefonie: ponowne wysłanie nie tworzy duplikatu
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
  cnc_ref text,                      -- wpis utworzony w CNC Team (np. exit:12, absence:5)
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

create table public.publications (
  scope text not null check (scope in ('zespol', 'osobiste')),
  employee_ref integer not null default 0,   -- 0 dla zakresu „zespol”
  kind text not null check (char_length(kind) <= 40),
  data jsonb not null,
  published_at timestamptz not null default now(),
  primary key (scope, employee_ref, kind),
  check ((scope = 'zespol') = (employee_ref = 0))
);
alter table public.publications enable row level security;
