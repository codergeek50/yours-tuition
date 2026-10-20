# Optional: schedules the weekly data backup on this Windows PC (Sundays at 20:00).
# First put the data service address and key in %USERPROFILE%\.yours-tuition-backup.json (see scripts/backup-data.mjs).
# Run it yourself once, from PowerShell, in the YOURS-Tuition folder:  .\scripts\schedule-backup.ps1
# Remove it later with:  schtasks /Delete /TN "YOURS Tuition weekly backup" /F
$project = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
$action = "`"$node`" `"$project\scripts\backup-data.mjs`""
schtasks /Create /SC WEEKLY /D SUN /ST 20:00 /TN "YOURS Tuition weekly backup" /TR $action /F
Write-Host "Scheduled. Backups go to $HOME\YOURS-Tuition-backups (newest 12 kept)."
Write-Host "Run one now to test:  node `"$project\scripts\backup-data.mjs`""
