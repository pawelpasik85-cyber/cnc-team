@echo off
rem CNC Team - TEST: usuwa dane testowe i tworzy od nowa dane przykladowe.
cd /d "%~dp0"
echo Usuniete zostana WSZYSTKIE dane testowe z folderu dane-testowe.
choice /c TN /m "Kontynuowac (T/N)"
if errorlevel 2 exit /b 0
if exist "%~dp0dane-testowe" rmdir /s /q "%~dp0dane-testowe"
echo Gotowe. Uruchom TEST-START.cmd - utworzy nowe dane przykladowe.
pause
