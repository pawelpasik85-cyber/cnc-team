# Zasady projektu CNC Team (czyta je recenzent GPT)

Specyfikacja i decyzje: `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PERMISSIONS.md`, `docs/CLOUD.md`.

- Dwie części: CNC Team (komputer kierownika, Node + SQLite, wszystkie dane) i aplikacja pracownika (`mobile/`, PWA + APK, Supabase). Aplikacja pracownika tylko zgłasza i czyta własne dane.
- Wszystkie zapisy w Supabase wyłącznie przez funkcje RPC; tabele nie mają polityk insert/update/delete. Każda zmiana RLS/RPC — nowa migracja w `supabase/` + aktualizacja `supabase/tests/rls_check.sql`.
- Przyjęcie zgłoszenia: najpierw próba wpisu lokalnego na sucho, potem decyzja w chmurze, potem wpis lokalny (`server/domain/cloud.js`). Nie zmieniać tej kolejności bez testu.
- Publikacje (`buildPublications`) nie mogą zawierać pól poufnych — pilnuje tego `test/cloud.test.js`.
- Brak zależności npm w aplikacji kierownika i w `mobile/`; Capacitor tylko w `android-app/` (budowa APK w CI).
- Klucz APK `android-signing/cnc-team.keystore` — nigdy go nie zmieniać.
- Rozliczenia: brak kredytu z nadwyżki odrabiania, brak automatycznego zerowania urlopu, zamknięty miesiąc blokuje zapisy.
