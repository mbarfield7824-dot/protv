# Links this app to the signed-in Expo account and copies the Firebase client settings from
# .env.local to EAS, because git-ignored files are not uploaded to cloud builds.
# Run `npx eas-cli@latest login` first. Values are not printed.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
npx eas-cli@latest init
$names = 'EXPO_PUBLIC_FIREBASE_API_KEY', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'EXPO_PUBLIC_FIREBASE_APP_ID'
$values = @{}
foreach ($line in Get-Content '.env.local') {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $values[$Matches[1]] = $Matches[2].Trim('"', "'") }
}
foreach ($name in $names) {
  if (-not $values[$name]) { throw "$name is missing from .env.local" }
  npx eas-cli@latest env:create --name $name --value $values[$name] --environment preview --environment production --visibility plaintext --scope project --type string --force --non-interactive | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not set $name" }
  Write-Output "Set $name"
}
