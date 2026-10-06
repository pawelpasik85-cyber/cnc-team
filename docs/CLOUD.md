# Aplikacja pracownika i chmura (wzorem Notario)

Pracownik z domu zgłasza nieobecność, spóźnienie albo wyjście w aplikacji na telefonie. Kierownik rozpatruje zgłoszenia w CNC Team na komputerze. Ten sam układ co w Notario: strona (PWA) na GitHub Pages, ta sama strona zapakowana w APK w GitHub Actions, dane wspólne w Supabase (Frankfurt, plan darmowy).

```
 Telefon pracownika                      Supabase „cnc-team” (eu-central-1)            Komputer kierownika
 ┌──────────────────────┐   zgłoszenie   ┌──────────────────────────────┐   pobranie   ┌───────────────────────┐
 │ CNC Team — pracownik │ ─────────────► │ reports (RLS: swoje)         │ ───────────► │ CNC Team (Node+SQLite)│
 │ PWA / APK, offline   │                │ publications (RLS: swoje     │              │ wszystkie dane, role  │
 │ kolejka zgłoszeń     │ ◄───────────── │   + grafik zespołu)          │ ◄─────────── │ decyzja → wpis lokalny│
 └──────────────────────┘ grafik, saldo, │ members, allowed_emails      │  publikacja  └───────────────────────┘
                          decyzje        └──────────────────────────────┘  (co 2 min, gdy CNC Team działa)
```

## Co jest w chmurze, a co nie

| W chmurze | Nigdy w chmurze |
|---|---|
| Zgłoszenia pracownika (rodzaj, dni, godziny, krótka uwaga) i decyzja kierownika | Notatki poufne, dokumenty i referencje kadrowe |
| Grafik zespołu na tydzień wstecz i 6 tygodni naprzód (imię, nazwisko, kolor, godziny zmian) | Nazwy kategorii nieobecności innych osób (zespół widzi tylko etykietę ogólną, np. „Nieobecność”) |
| Własne saldo do odrobienia i własne wyjścia (tylko dla tej osoby) | Pule urlopu, wymiary, korekty, wybór jednostek |
| Własne nieobecności w opublikowanym okresie (tylko dla tej osoby) | Projekty, czasy zadań, raporty efektywności, historia zmian |
| Lista zaproszonych adresów e-mail (niewidoczna dla pracowników) | Hasła lokalnego CNC Team |

Podgląd dokładnej zawartości publikacji: CNC Team → Ustawienia → Aplikacja pracowników → „Podgląd publikowanych danych”. Test `test/cloud.test.js` sprawdza, że publikacje nie zawierają pól poufnych.

## Uprawnienia w chmurze (RLS + funkcje)

- Konto może założyć tylko adres z listy zaproszeń (`allowed_emails`); lista jest niewidoczna dla klientów.
- Pracownik: czyta tylko swoje zgłoszenia, swoje publikacje „osobiste” i grafik zespołu; składa i wycofuje własne zgłoszenia (tylko nierozpatrzone, najwyżej 31 dni wstecz, najwyżej 60 dni długości).
- Kierownik: czyta wszystkie zgłoszenia, podejmuje jedną decyzję na zgłoszenie, publikuje, zaprasza pracowników.
- Tabele nie mają polityk zapisu — wszystkie zapisy przez funkcje (`supabase/003…006`).
- Test na prawdziwej bazie: `supabase/tests/rls_check.sql` (transakcja wycofywana; wynik z 6.10.2026 w nagłówku pliku — 23 sprawdzenia, wszystkie zgodne).
- Klucz w aplikacjach (`sb_publishable_…`) jest kluczem publikowalnym; sam nie daje dostępu do danych.

## Przyjęcie zgłoszenia w CNC Team

1. Zgłoszenia → „Przyjmij” → wybór rozliczenia:
   - spóźnienie: do odrobienia (wyjście prywatne od początku zmiany do godziny przyjścia), spóźnienie usprawiedliwione, nieusprawiedliwione, bez wpisu;
   - wyjście: wyjście prywatne do odrobienia;
   - nieobecność / inne: kategoria z katalogu (dni lub godziny).
2. CNC Team najpierw sprawdza wpis „na sucho” (kolizje, grafik, zamknięty miesiąc, limity). Dopiero gdy przejdzie, decyzja trafia do chmury, a następnie tworzony jest wpis lokalny. Gdyby wpis lokalny mimo to się nie udał, zgłoszenie pokazuje „błąd wpisu” do ręcznego uzupełnienia.
3. Odrzucenie wymaga wyjaśnienia — pracownik je widzi.
4. Czy zgłoszenie w aplikacji spełnia wymóg pisemnego wniosku (wyjścia prywatne) — do potwierdzenia z kadrami; domyślnie pole „pisemny wniosek” nie jest zaznaczane.

## Konfiguracja (raz)

1. **Konto kierownika w chmurze** — adres kierownika jest dopisany do zaproszeń z rolą „kierownik” (robi to Claude przez SQL; patrz rozmowa w projekcie). W CNC Team: Ustawienia → Aplikacja pracowników → e-mail, hasło (min. 10 znaków), zaznacz „Pierwsze logowanie” → Połącz.
2. **Pracownicy** — w profilu każdego pracownika wpisz e-mail (Pracownicy → Edytuj). Przy synchronizacji powstają zaproszenia.
3. **Pracownik** — otwiera https://pawelpasik85-cyber.github.io/cnc-team-app/ (albo instaluje `CNC-Team.apk` z tej strony), zaznacza „Pierwsze logowanie”, ustala hasło (min. 8 znaków).
4. **Odebranie dostępu** (np. odejście z firmy) — w Supabase SQL Editor:
   ```sql
   delete from public.members where email = 'adres@firma.pl' and role = 'pracownik';
   delete from public.allowed_emails where email = 'adres@firma.pl' and role = 'pracownik';
   ```
   i usuń adres z profilu w CNC Team. (Funkcja w aplikacji — w kolejnej wersji.)

## Ograniczenia i ryzyka

- Dane pracowników firmy są na prywatnych kontach kierownika (GitHub, Supabase). Firma powinna o tym wiedzieć; Supabase udostępnia umowę powierzenia danych (DPA). Zakres danych jest ograniczony do niezbędnego minimum (tabela wyżej).
- Darmowy projekt Supabase usypia się po ok. tygodniu bez żadnego ruchu (np. wspólny urlop) — wybudzenie jednym kliknięciem w panelu Supabase („Restore”).
- Synchronizacja działa, gdy CNC Team jest uruchomiony (co 2 minuty). Zgłoszenia złożone przy wyłączonym komputerze czekają w chmurze.
- Aplikacja pracownika nie wysyła powiadomień o decyzji (widać ją po otwarciu aplikacji). Powiadomienia push jak w Notario — możliwe w kolejnej wersji.
- Zgłoszenie bez internetu czeka w kolejce na telefonie; jeśli pracownik się wyloguje przed wysłaniem — zostanie usunięte (aplikacja o tym ostrzega).
- Pracownik widzi w grafiku zespołu imiona i nazwiska oraz godziny zmian współpracowników (tak jak we wspólnym kalendarzu z CNC Team).
