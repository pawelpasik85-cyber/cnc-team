-- Test uprawnień w chmurze. Uruchom w SQL Editor projektu cnc-team (lub przez narzędzie MCP).
-- Wszystko dzieje się w jednej transakcji, która na końcu jest wycofywana wyjątkiem „WYNIK: …”,
-- więc w bazie nic nie zostaje. Oczekiwany wynik (6.10.2026):
-- ok gate; members=3; A widzi zgłoszeń=1; ref=101; ok A nie publikuje; ok A nie decyduje; ok brak insert;
-- ok limit wstecz; K widzi=1; decyzja=przyjete; ok jedna decyzja; ok K nie zglasza; K list_invites=4;
-- ok tylko pracownicy; B widzi zgłoszeń=0; B widzi publikacji=2; B widzi saldo A=0; B widzi członków=1;
-- B widzi zaproszeń=0; B list_invites=0; ok B nie wycofa cudzego; anon widzi=0; ok anon bez rpc;
do $$
declare
  k uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  out text := ''; n int; r public.reports;
begin
  insert into public.allowed_emails values ('test-kier@example.test','kierownik',null,'Kierownik T'),
    ('test-a@example.test','pracownik',101,'Pracownik A'), ('test-b@example.test','pracownik',102,'Pracownik B');
  insert into auth.users(id, email, aud, role, instance_id) values
    (k,'test-kier@example.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
    (a,'test-a@example.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
    (b,'test-b@example.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
  begin
    insert into auth.users(id, email, aud, role, instance_id) values (x,'obcy@example.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
    out := out || 'FAIL obcy zarejestrowany; ';
  exception when others then out := out || 'ok gate; ';
  end;
  select count(*) into n from public.members where email like 'test-%';
  out := out || 'members=' || n || '; ';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  r := public.submit_report(jsonb_build_object('client_id','11111111-1111-1111-1111-111111111111','kind','spoznienie','date_from', current_date::text,'time_from','06:00','time_to','06:40','note','korek'));
  r := public.submit_report(jsonb_build_object('client_id','11111111-1111-1111-1111-111111111111','kind','spoznienie','date_from', current_date::text));
  select count(*) into n from public.reports; out := out || 'A widzi zgłoszeń=' || n || '; ';
  select employee_ref into n from public.reports limit 1; out := out || 'ref=' || n || '; ';
  begin perform public.publish('[{"scope":"zespol","kind":"x","data":{}}]'); out := out || 'FAIL A publikuje; ';
  exception when others then out := out || 'ok A nie publikuje; '; end;
  begin perform public.decide_report(r.id,'przyjete',null,null); out := out || 'FAIL A decyduje; ';
  exception when others then out := out || 'ok A nie decyduje; '; end;
  begin insert into public.reports(client_id,user_id,employee_ref,kind,date_from,date_to) values (gen_random_uuid(), a, 999,'inne',current_date,current_date); out := out || 'FAIL insert bezposredni; ';
  exception when others then out := out || 'ok brak insert; '; end;
  begin perform public.submit_report(jsonb_build_object('client_id',gen_random_uuid(),'kind','inne','date_from', (current_date-40)::text)); out := out || 'FAIL 40 dni wstecz; ';
  exception when others then out := out || 'ok limit wstecz; '; end;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', k, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into n from public.reports; out := out || 'K widzi=' || n || '; ';
  n := public.publish('[{"scope":"zespol","kind":"grafik","data":{"d":1}},{"scope":"osobiste","employee_ref":101,"kind":"saldo","data":{"min":45}},{"scope":"osobiste","employee_ref":102,"kind":"saldo","data":{"min":90}}]');
  r := public.decide_report(r.id,'przyjete','ok','exit:7');
  out := out || 'decyzja=' || r.status || '; ';
  begin perform public.decide_report(r.id,'odrzucone','x',null); out := out || 'FAIL podwójna decyzja; ';
  exception when others then out := out || 'ok jedna decyzja; '; end;
  begin perform public.submit_report('{"client_id":"22222222-2222-2222-2222-222222222222","kind":"inne","date_from":"2026-10-06"}'); out := out || 'FAIL K zglasza; ';
  exception when others then out := out || 'ok K nie zglasza; '; end;
  n := public.set_invites('[{"email":"Nowy@Example.test","role":"pracownik","employee_ref":103,"display_name":"Nowy"}]');
  select count(*) into n from public.list_invites(); out := out || 'K list_invites=' || n || '; ';
  begin perform public.set_invites('[{"email":"szef2@example.test","role":"kierownik","employee_ref":1,"display_name":"X"}]'); out := out || 'FAIL zaproszenie kierownika; ';
  exception when others then out := out || 'ok tylko pracownicy; '; end;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into n from public.reports; out := out || 'B widzi zgłoszeń=' || n || '; ';
  select count(*) into n from public.publications; out := out || 'B widzi publikacji=' || n || '; ';
  select count(*) into n from public.publications where employee_ref = 101; out := out || 'B widzi saldo A=' || n || '; ';
  select count(*) into n from public.members; out := out || 'B widzi członków=' || n || '; ';
  begin select count(*) into n from public.allowed_emails; out := out || 'B widzi zaproszeń=' || n || '; ';
  exception when others then out := out || 'ok brak dostępu do zaproszeń; '; end;
  select count(*) into n from public.list_invites(); out := out || 'B list_invites=' || n || '; ';
  begin perform public.withdraw_report(r.id); out := out || 'FAIL B wycofuje cudze; ';
  exception when others then out := out || 'ok B nie wycofa cudzego; '; end;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role','anon', true);
  begin select count(*) into n from public.reports; out := out || 'anon widzi=' || n || '; ';
  exception when others then out := out || 'ok anon brak dostępu; '; end;
  begin perform public.submit_report('{}'); out := out || 'FAIL anon rpc; ';
  exception when others then out := out || 'ok anon bez rpc; '; end;
  perform set_config('role','postgres', true);
  raise exception 'WYNIK: %', out;
end $$;
