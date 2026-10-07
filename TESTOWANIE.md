# Testowanie CNC Team przed instalacją na serwerze

Do testów nie jest potrzebny serwer ani informatyk — wystarczy zwykły komputer z Windows.

1. Rozpakuj `cnc-team-serwer.zip` (prawy przycisk → „Wyodrębnij wszystkie”).
2. Node.js — jedna z dwóch dróg:
   - zainstaluj Node.js LTS z nodejs.org, **albo**
   - bez instalacji (gdy komputer ma blokadę administratora): pobierz z nodejs.org wersję **„Windows Binary (.zip)”, x64**, rozpakuj, zmień nazwę rozpakowanego folderu na `node` i przenieś go do folderu `cnc-team` (ma istnieć `cnc-team\node\node.exe`).
3. Dwuklik **`TEST-START.cmd`**. Za pierwszym razem tworzy dane przykładowe, potem sam otwiera przeglądarkę na `http://localhost:3000`.
4. Logowanie: `kierownik` / `demo-cnc-2026`. Programiści: `adam`, `bartosz`, `celina`; gość: `gosc` — to samo hasło.
5. Czarnego okna nie zamykaj — zamknięcie wyłącza aplikację.

**Telefon w tej samej sieci Wi‑Fi:** czarne okno pokazuje dodatkowe adresy typu `http://192.168.x.x:3000` — wpisz taki adres w telefonie. Jeśli Windows zapyta o zaporę, zezwól na sieć prywatną (w firmie może to być zablokowane — wtedy testuj na komputerze).

**Od nowa:** `TEST-RESET.cmd` usuwa dane testowe; następny `TEST-START.cmd` tworzy świeże dane przykładowe.

**Nowa wersja:** rozpakuj nową paczkę do nowego folderu i przenieś do niego foldery `dane-testowe` (Twoje dane testowe) oraz `node` (jeśli używasz wersji bez instalacji). Baza sama się zaktualizuje przy starcie.

Dane testowe są fikcyjne. Na serwerze firmowym informatyk zakłada czystą bazę wg `docs/DEPLOY.md`.
