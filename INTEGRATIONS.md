# Opcjonalne przyszłe integracje

**Żadna z poniższych integracji nie jest skonfigurowana ani wymagana.** MVP działa lokalnie bez nich. Koszty i dostępność zależą od licencji Microsoft 365 posiadanych przez firmę — nie zakładamy bezpłatności bez weryfikacji przez IT.

## 1. Microsoft Entra ID (logowanie firmowe, SSO)
- **Cel**: logowanie kontem firmowym zamiast lokalnych haseł; role z grup Entra.
- **Wymagane**: rejestracja aplikacji w Entra ID (zgoda administratora IT), przepływ OpenID Connect (Authorization Code + PKCE), adres zwrotny HTTPS, uprawnienie delegowane `openid profile email` (ew. `GroupMember.Read.All` do mapowania ról — wymaga zgody administratora).
- **Koszt**: logowanie podstawowe zwykle zawarte w Microsoft 365; funkcje warunkowego dostępu mogą wymagać Entra ID P1/P2 — do weryfikacji przez IT.
- **Zmiana w aplikacji**: moduł logowania OIDC obok obecnego; mapowanie grupa → rola; konto lokalne awaryjne administratora.
- **Lokalna alternatywa**: obecne konta lokalne (scrypt, sesje).

## 2. SharePoint / Microsoft Lists przez Microsoft Graph
- **Cel**: publikacja wybranych danych (np. tablica maszyn, przekazania zmian) lub kopia zestawień miesięcznych w witrynie zespołu.
- **Wymagane**: rejestracja aplikacji, uprawnienia Graph — najlepiej `Sites.Selected` (dostęp tylko do wskazanej witryny, nadawany przez administratora SharePoint) zamiast `Sites.ReadWrite.All`; zgoda IT; certyfikat lub sekret aplikacji przechowywany poza kodem.
- **Koszt**: Graph API dla SharePoint w ramach licencji M365 — do potwierdzenia; Power Automate/Power Apps Premium **nie jest potrzebny** do tego wariantu.
- **Uwaga**: dane osobowe i absencje nie powinny trafiać do list szeroko udostępnionych; zakres publikacji do decyzji kierownika i IT/RODO.
- **Lokalna alternatywa**: eksport CSV/JSON i ręczne umieszczenie pliku w SharePoint.

## 3. Powiadomienia e-mail lub Teams
- **Cel**: alerty rozliczeń wysyłane także przy wyłączonej aplikacji.
- **Wymagane**: osobny harmonogram (usługa Windows / Harmonogram zadań uruchamiający `node` w trybie „sprawdź alerty”), oraz kanał:
  - e-mail: firmowy serwer SMTP (konto techniczne, zgoda IT) lub Graph `Mail.Send` (uprawnienie aplikacyjne — zgoda administratora, najlepiej z polityką dostępu ograniczoną do jednej skrzynki);
  - Teams: webhook kanału (Workflows) lub Graph `ChannelMessage.Send` — zależnie od polityki IT.
- **Koszt**: zwykle w ramach M365; webhooki zależą od polityk tenantu — do weryfikacji.
- **Lokalna alternatywa**: obecne powiadomienia w aplikacji, przeliczane przy starcie (zaległe alerty widoczne po uruchomieniu).

## Zasady
- Sekrety (hasła SMTP, klucze aplikacji) tylko w zmiennych środowiskowych lub magazynie certyfikatów — nigdy w repozytorium.
- Każda integracja domyślnie wyłączona; brak jej nie może blokować działania MVP.
- Przed włączeniem: ocena, jakie dane osobowe opuszczają komputer, i zgoda IT.
