# CNC Team — rejestracja zadań w Harmonogramie zadań Windows (uruchom jako administrator).
#  1) „CNC Team”       — start aplikacji przy starcie serwera, ponowienie po awarii (konto SYSTEM)
#  2) „CNC Team kopia” — codzienna kopia bazy o 02:30
# Wymaga: Node.js LTS 22.13+ zainstalowany dla wszystkich użytkowników (node.exe w PATH).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$start = Join-Path $here 'cnc-team-start.cmd'
$backup = Join-Path $here 'cnc-team-backup.cmd'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
Register-ScheduledTask -TaskName 'CNC Team' -Force -Principal $principal -Settings $settings `
  -Trigger (New-ScheduledTaskTrigger -AtStartup) -Action (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$start`"")
Register-ScheduledTask -TaskName 'CNC Team kopia' -Force -Principal $principal `
  -Trigger (New-ScheduledTaskTrigger -Daily -At '02:30') -Action (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$backup`"")
Start-ScheduledTask -TaskName 'CNC Team'
Write-Host 'Zarejestrowano zadania „CNC Team” i „CNC Team kopia”. Aplikacja uruchomiona.'
