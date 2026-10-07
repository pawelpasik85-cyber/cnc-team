# Zasady projektu CNC Team (czyta je recenzent GPT)

Specyfikacja i decyzje: `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PERMISSIONS.md`, `docs/DEPLOY.md`.

- Wersja firmowa: jedna aplikacja (Node + SQLite) **wyłącznie na serwerze firmowym**. Żadnych połączeń z usługami zewnętrznymi (chmura, GitHub, CDN, API) w czasie działania. Dostęp z domu tylko przez firmowy adres HTTPS.
- Pracownik niczego nie wpisuje sam — tylko zgłoszenia do weryfikacji; decyzja kierownika i wpis w jednej transakcji (`server/domain/requests.js`).
- Gość widzi wyłącznie status wskazanych projektów (`GUEST_ALLOWED` w `server/app.js`) — każda nowa trasa API jest dla gościa zablokowana.
- Każda zmiana danych z wpisem w historii (`audit`), z autorem i opisem.
- Brak zależności npm.
- Rozliczenia: brak kredytu z nadwyżki odrabiania, brak automatycznego zerowania urlopu, zamknięty miesiąc blokuje zapisy.
