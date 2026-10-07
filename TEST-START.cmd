@echo off
rem CNC Team - wersja do testow na zwyklym komputerze (bez serwera, bez IT).
rem Dwuklik: przy pierwszym uruchomieniu tworzy dane przykladowe, potem otwiera przegladarke.
cd /d "%~dp0"
set "NODE=node"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
"%NODE%" -v >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Nie znaleziono Node.js.
  echo  1^) Zainstaluj Node.js LTS ze strony nodejs.org  ALBO
  echo  2^) bez instalacji: pobierz "Windows Binary .zip" z nodejs.org, rozpakuj
  echo     i zmien nazwe rozpakowanego folderu na "node" - ma lezec obok tego pliku
  echo     ^(tak, zeby istnial plik node\node.exe^).
  echo.
  pause
  exit /b 1
)
set "CNC_DB=%~dp0dane-testowe\cnc-team.db"
if not exist "%CNC_DB%" (
  echo Tworze dane przykladowe...
  "%NODE%" --no-warnings scripts\seed.js
  if errorlevel 1 ( pause & exit /b 1 )
)
if "%PORT%"=="" set "PORT=3000"
set "HOST=0.0.0.0"
echo.
echo  ==========================================================
echo   CNC Team - TEST.  Adres:  http://localhost:%PORT%
echo   Logowanie: kierownik / demo-cnc-2026
echo   (programisci: adam, bartosz, celina; gosc: gosc - to samo haslo)
echo   NIE ZAMYKAJ tego okna - zamkniecie wylacza aplikacje.
echo  ==========================================================
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:%PORT%"
"%NODE%" --no-warnings scripts\start-lan.js
echo.
echo Aplikacja zatrzymana. Jesli wyzej jest blad EADDRINUSE - port zajety: zamknij inne okno CNC Team.
pause
