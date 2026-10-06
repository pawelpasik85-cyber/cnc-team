# Stałe zasady (wszystkie projekty)

Ten plik czyta recenzent GPT przy każdej zmianie. Zawiera ustalenia, które mają
obowiązywać we wszystkich projektach (Jarvis, Notario, Przepicy, StorySound, CNC Team).
Zasady konkretnego projektu są w jego pliku CLAUDE.md lub ZASADY-PROJEKTU.md.

## Ogólne
- Interfejs i komunikaty dla użytkownika po polsku.
- Nie udawaj działania: funkcja, która jeszcze nie działa, jest wyraźnie wyszarzona/oznaczona, a nie atrapa.
- Każda zmiana w czystej logice (bez interfejsu) ma test.
- Żadnych kluczy API, haseł ani tokenów w kodzie. Klucze użytkownika (np. Gemini, Pixabay) trzymane w ustawieniach aplikacji.
- Bez płatnych planów i usług wymagających stałej opłaty (bez Bitrise, EAS, Apple Developer), chyba że użytkownik zdecyduje inaczej.

## Aplikacje webowe/mobilne (Notario, Przepicy, StorySound, aplikacja pracownika CNC Team)
- Model testowania: strona w przeglądarce (PWA) na GitHub Pages + ta sama wersja zapakowana w APK (Capacitor), budowane w GitHub Actions.
- Offline obowiązkowo: aplikacja i dane muszą działać bez internetu po pierwszym otwarciu (service worker).
- APK podpisywane zawsze tym samym kluczem z `android-signing/` — NIGDY go nie zmieniać, inaczej aktualizacja nie zainstaluje się na telefonie.
- Migracje bazy danych tylko dopisywane na końcu, nigdy edycja starych.
- W przeglądarce nie używać Alert z React Native (nie działa) — tylko własne okna dialogowe.

## CNC Team (zarządzanie zespołem programistów CNC)
- Dane pracowników firmy: do chmury (Supabase) trafia tylko to, co pracownik musi widzieć poza firmą — jego zgłoszenia, jego grafik i saldo, grafik zespołu z ogólnymi etykietami nieobecności. Notatki poufne, dokumenty kadrowe, nazwy kategorii poufnych (np. L4), pule urlopu i raporty efektywności nigdy nie opuszczają komputera kierownika.
- Uprawnienia egzekwuje serwer (API CNC Team, RLS i funkcje w Supabase), nie interfejs.
- Przepisy prawa pracy bez weryfikacji w źródle urzędowym oznaczamy „do potwierdzenia przez kadry”; nie wymyślamy limitów.
- Czas w minutach (liczby całkowite), strefa Europe/Warsaw, zmiana czasu i zmiany nocne obsłużone jawnie.

## Jarvis (radio samochodowe)
- Sprzęt: Android 10, Unisoc UIS7862, ekran 1280×720, słaby GPU — lekki interfejs, bez ciężkich efektów.
- Aplikacja nie może przerywać ani zagłuszać radia/muzyki bez wyraźnej potrzeby.
- Każdy błąd ma być złapany i zalogowany, a nie wywracać aplikację (to launcher — crash = brak ekranu głównego w aucie).

## Błędy, które już się zdarzyły (pilnuj, żeby się nie powtórzyły)
- Przepicy: ścieżka `/add` to atrapa zakładki „+” i powoduje zapętlenie — dodawanie przepisu tylko przez `app/new.tsx`.
- Jarvis: nasłuch w tle przerywał radio (wyłączony domyślnie); pik rozpoznawania mowy był słyszalny.
