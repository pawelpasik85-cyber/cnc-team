@echo off
rem CNC Team — uruchomienie na serwerze firmowym (Windows). Uruchamiane przez zadanie „CNC Team” z Harmonogramu zadań.
rem Dostosuj ścieżki i ustawienia poniżej. Folder aplikacji: ten, w którym leży package.json.
cd /d "%~dp0\..\.."
set HOST=0.0.0.0
set PORT=3000
set CNC_DB=D:\CNC-Team-dane\cnc-team.db
rem Za firmowym reverse proxy (HTTPS w internecie) ustaw 1, inaczej 0:
set CNC_TRUST_PROXY=1
rem Certyfikat HTTPS bezpośrednio w aplikacji (gdy nie ma reverse proxy):
rem set CNC_TLS_CERT=D:\CNC-Team-dane\tls\cert.pem
rem set CNC_TLS_KEY=D:\CNC-Team-dane\tls\key.pem
node --no-warnings=ExperimentalWarning server\index.js >> "%CNC_DB%.log" 2>&1
