# Macierz uprawnień

Egzekwowane na serwerze (`server/core.js` → `CAPS`, `server/routes.js`). Interfejs tylko ukrywa niedostępne elementy. Testy: `test/api.test.js`.

| Obszar | Administrator | Przełożony | Pracownik |
|---|---|---|---|
| Wszystkie zapisy (dodawanie, edycja, anulowanie, zatwierdzanie, zamykanie miesięcy, konta, ustawienia) | ✔ | ✘ (403) | ✘ (403) |
| Kalendarz, grafik, lista zdarzeń | ✔ | ✔ | ✔ (kategorie poza „pełnymi” jako etykieta ogólna, np. „Nieobecność”; bez minut, notatek, dokumentów; anulowane ukryte) |
| Projekty, zadania, postęp, przekazania zmian, tablica maszyn | ✔ | ✔ | ✔ (bez planów czasu, trudności i czasu osób) |
| Plany czasu zadań, wpisy czasu, wyjaśnienia odchyleń | ✔ | ✔ (podgląd) | ✘ |
| Profile pracowników | pełne | bez referencji kadrowej (chyba że ma uprawnienie do danych poufnych) | imię, nazwisko, kolor, maszyny, kompetencje |
| Salda do odrabiania | wszystkie | wszystkie | własne (zespołu tylko gdy `employee_sees_team_balances = tak`) |
| Wyjścia i odrabianie (lista) | ✔ | ✔ | własne, bez notatek i dokumentów |
| Pule urlopu, wybór jednostek SW/188 | ✔ | ✔ (podgląd) | ✘ |
| Raporty kierownicze i eksport CSV | ✔ | ✔ | ✘ (403 — także dla `.csv`) |
| Zestawienia miesięczne i ich wersje | ✔ | ✔ (podgląd, CSV) | ✘ |
| Notatki poufne, dokumenty, referencje kadrowe, nazwy kategorii „poufnych” | ✔ | tylko z uprawnieniem `can_view_confidential` | ✘ |
| Eksport/import JSON CNC Process | ✔ | ✘ | ✘ |
| Historia zmian (audyt), konta, ustawienia firmy | ✔ | ✘ | ✘ |
| Zmiana własnego hasła | ✔ | ✔ | ✔ |

## Aplikacja pracownika (chmura)

| Obszar | Kierownik (CNC Team) | Pracownik (aplikacja) | Bez konta |
|---|---|---|---|
| Złożenie / wycofanie zgłoszenia | ✘ | ✔ własne (wycofanie tylko nierozpatrzonego) | ✘ |
| Zgłoszenia — odczyt | wszystkie | własne | ✘ |
| Decyzja w sprawie zgłoszenia | ✔ jedna na zgłoszenie | ✘ | ✘ |
| Grafik zespołu (etykiety ogólne) | ✔ | ✔ | ✘ |
| Saldo i wyjścia, własne nieobecności | ✔ wszystkich | ✔ tylko własne | ✘ |
| Zaproszenia | ✔ (tylko rola pracownik) | ✘ | ✘ |

Egzekwowane w Supabase przez RLS i funkcje (`supabase/`), sprawdzone `supabase/tests/rls_check.sql`.

Dodatkowo:
- Brak sesji → 401 dla każdego API poza logowaniem.
- Zapis bez nagłówka `X-CNC-Request: 1` → 403 (ochrona CSRF), także dla administratora.
- Nie można odebrać roli ostatniemu aktywnemu administratorowi.
- Aplikacja nie przechowuje diagnoz — formularze i katalog L4 zawierają ostrzeżenie; pola są tekstem wolnym, więc zasada wymaga dyscypliny użytkownika (patrz `docs/LIMITATIONS.md`).
