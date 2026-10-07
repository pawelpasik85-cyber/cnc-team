@echo off
rem CNC Team — codzienna kopia bazy (spójna przy działającej aplikacji). Uruchamiane przez zadanie „CNC Team kopia”.
cd /d "%~dp0\..\.."
set CNC_DB=D:\CNC-Team-dane\cnc-team.db
node --no-warnings=ExperimentalWarning scripts\backup.js "D:\CNC-Team-dane\kopie"
