@echo off
rem CNC Team — uruchomienie na serwerze firmowym (Windows). Uruchamiane przez zadanie „CNC Team” z Harmonogramu zadań.
rem Dostosuj ścieżki i ustawienia poniżej. Folder aplikacji: ten, w którym leży package.json.
cd /d "%~dp0\..\.."
rem Aplikacja nasłuchuje tylko lokalnie — ruch z sieci i z internetu przychodzi przez IIS (deploy\windows\iis-web.config).
set HOST=127.0.0.1
set PORT=3000
set CNC_DB=C:\CNC-Team-dane\cnc-team.db
rem IIS na tym samym serwerze przekazuje adres klienta (X-Forwarded-For) — potrzebny do blokady logowania:
set CNC_TRUST_PROXY=1
rem Cookie sesji tylko przez HTTPS:
set CNC_SECURE_COOKIE=1
node --no-warnings=ExperimentalWarning server\index.js >> "%CNC_DB%.log" 2>&1
