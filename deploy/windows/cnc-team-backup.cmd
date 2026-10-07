@echo off
rem CNC Team — codzienna kopia bazy (spójna przy działającej aplikacji). Uruchamiane przez zadanie „CNC Team kopia”.
cd /d "%~dp0\..\.."
set CNC_DB=C:\CNC-Team-dane\cnc-team.db
node --no-warnings=ExperimentalWarning scripts\backup.js "C:\CNC-Team-dane\kopie"
