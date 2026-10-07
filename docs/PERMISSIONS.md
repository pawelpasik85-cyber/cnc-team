# Macierz uprawnień

Egzekwowane na serwerze (`server/core.js` → `CAPS`, `server/routes.js`). Interfejs tylko ukrywa niedostępne elementy. Testy: `test/api.test.js`, `test/requests.test.js`.

| Obszar | Administrator | Przełożony | Pracownik | Gość |
|---|---|---|---|---|
| Wszystkie zapisy (dodawanie, edycja, anulowanie, zatwierdzanie, zamykanie miesięcy, konta, ustawienia) | ✔ | ✘ (403) | ✘ (403) | ✘ |
| Zgłoszenie do weryfikacji (spóźnienie, nieobecność, wyjście, odrobienie, inne) | ✘ | ✘ | ✔ tylko własne; wycofanie przed decyzją | ✘ |
| Decyzja w sprawie zgłoszenia | ✔ | ✘ (podgląd) | ✘ | ✘ |
| Status przypisanych projektów w realizacji (postęp, opóźnienie, etapy) | ✔ (pełny widok) | ✔ | ✔ | ✔ tylko przypisane; bez osób, czasów, notatek, powodów blokad |
| Kalendarz, grafik, lista zdarzeń | ✔ | ✔ | ✔ (kategorie poza „pełnymi” jako etykieta ogólna, np. „Nieobecność”; bez minut, notatek, dokumentów; anulowane ukryte) | ✘ |
| Projekty, zadania, postęp, przekazania zmian, tablica maszyn | ✔ | ✔ | ✔ tylko projekty, w których pracuje (odpowiedzialny, ma zadanie, projekt na tablicy maszyn); bez planów czasu, trudności, czasu i wkładu innych osób; ustawienie `employee_sees_all_projects` | ✘ |
| Plany czasu zadań, wpisy czasu, wyjaśnienia odchyleń | ✔ | ✔ (podgląd) | ✘ | ✘ |
| Godziny projektu: przepracowano, plan, wynik, prognoza | ✔ | ✔ | ✘ (✔ gdy `employee_sees_project_hours = tak`) | ✘ |
| Profile pracowników | pełne | bez referencji kadrowej (chyba że ma uprawnienie do danych poufnych) | imię, nazwisko, kolor, maszyny, kompetencje | ✘ |
| Salda do odrabiania | wszystkie | wszystkie | własne (zespołu tylko gdy `employee_sees_team_balances = tak`) | ✘ |
| Wyjścia i odrabianie (lista) | ✔ | ✔ | własne, bez notatek i dokumentów | ✘ |
| Pule urlopu, wybór jednostek SW/188 | ✔ | ✔ (podgląd) | ✘ | ✘ |
| Raporty kierownicze i eksport CSV | ✔ | ✔ | ✘ (403 — także dla `.csv`) | ✘ |
| Zestawienia miesięczne i ich wersje | ✔ | ✔ (podgląd, CSV) | ✘ | ✘ |
| Notatki poufne, dokumenty, referencje kadrowe, nazwy kategorii „poufnych” | ✔ | tylko z uprawnieniem `can_view_confidential` | ✘ | ✘ |
| Eksport/import JSON CNC Process | ✔ | ✘ | ✘ | ✘ |
| Historia zmian (audyt), konta, ustawienia firmy | ✔ | ✘ | ✘ | ✘ |
| Zmiana własnego hasła | ✔ | ✔ | ✔ | ✔ |

Dodatkowo:
- Brak sesji → 401 dla każdego API poza logowaniem.
- Konto gościa: każda trasa API poza `/me`, `/logout`, `/me/password`, `/guest/projects` → 403 (blokada w `server/app.js`, niezależna od pojedynczych tras).
- Logowanie: po 5 błędnych hasłach blokada pary konto + adres na 15 min, adres z wieloma kontami — po 20; hasła min. 10 znaków.
- Zapis bez nagłówka `X-CNC-Request: 1` → 403 (ochrona CSRF), także dla administratora.
- Nie można odebrać roli ostatniemu aktywnemu administratorowi.
- Aplikacja nie przechowuje diagnoz — formularze i katalog L4 zawierają ostrzeżenie; pola są tekstem wolnym, więc zasada wymaga dyscypliny użytkownika (patrz `docs/LIMITATIONS.md`).
