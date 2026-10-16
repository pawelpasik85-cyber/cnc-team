# Zasady projektu CNC Team (czyta je recenzent GPT)

Specyfikacja i decyzje: `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PERMISSIONS.md`, `docs/DEPLOY.md`.

- Wersja firmowa: jedna aplikacja (Node + SQLite) **wyłącznie na serwerze firmowym**. Żadnych połączeń z usługami zewnętrznymi (chmura, GitHub, CDN, API) w czasie działania. Od 0.18 tylko komputery stacjonarne w sieci firmowej (wewnętrzny adres HTTPS) — bez dostępu z domu, z internetu i z telefonów.
- Pracownik niczego nie wpisuje sam — tylko zgłoszenia do weryfikacji; decyzja kierownika i wpis w jednej transakcji (`server/domain/requests.js`).
- Gość widzi wyłącznie status wskazanych projektów (`GUEST_ALLOWED` w `server/app.js`) — każda nowa trasa API jest dla gościa zablokowana.
- Każda zmiana danych z wpisem w historii (`audit`), z autorem i opisem.
- Brak zależności npm.
- Rozliczenia: brak kredytu z nadwyżki odrabiania, brak automatycznego zerowania urlopu, zamknięty miesiąc blokuje zapisy.
