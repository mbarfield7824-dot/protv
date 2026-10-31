param(
  [string]$PasswordFile = (Join-Path $PSScriptRoot '..\.env.signing.local.json'),
  [switch]$SkipPrebuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $sdk }
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
$privateDirectory = Join-Path $root '.local-release'
New-Item -ItemType Directory -Force $privateDirectory | Out-Null
$sid = '*' + [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $privateDirectory /inheritance:r /grant:r "$($sid):(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict release-key directory access.' }
$secrets = Get-Content -LiteralPath $PasswordFile -Raw | ConvertFrom-Json
if ($secrets.storePassword.Length -lt 12 -or $secrets.keyPassword.Length -lt 12) {
  throw 'Enter signing passwords of at least 12 characters in the private password file first.'
}
$env:PROTV_UPLOAD_KEYSTORE = Join-Path $privateDirectory 'protv-upload.jks'
$env:PROTV_UPLOAD_KEY_ALIAS = 'protv-upload'
$env:PROTV_UPLOAD_STORE_PASSWORD = $secrets.storePassword
$env:PROTV_UPLOAD_KEY_PASSWORD = $secrets.keyPassword
$secrets = $null
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
try {
  if (-not (Test-Path $env:PROTV_UPLOAD_KEYSTORE)) {
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore $env:PROTV_UPLOAD_KEYSTORE `
      -alias $env:PROTV_UPLOAD_KEY_ALIAS -keyalg RSA -keysize 4096 -validity 10000 -storetype JKS `
      -storepass:env PROTV_UPLOAD_STORE_PASSWORD -keypass:env PROTV_UPLOAD_KEY_PASSWORD `
      -dname 'CN=PROtv Mobile Upload, O=PROtv, C=US'
    if ($LASTEXITCODE -ne 0) { throw 'Upload-key generation failed.' }
  }
  Push-Location $root
  try {
    & node -e "if(require('fs').existsSync('.env.local')) process.loadEnvFile('.env.local'); const required=['EXPO_PUBLIC_API_URL','EXPO_PUBLIC_FIREBASE_API_KEY','EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN','EXPO_PUBLIC_FIREBASE_PROJECT_ID','EXPO_PUBLIC_FIREBASE_APP_ID']; if(required.some(k=>!process.env[k]) || !process.env.EXPO_PUBLIC_API_URL.startsWith('https://') || process.env.EXPO_PUBLIC_DEMO_MODE==='true') throw new Error('Release requires complete HTTPS API/Firebase configuration and demo mode disabled.');"
    if ($LASTEXITCODE -ne 0) { throw 'Release service configuration is incomplete.' }
    if (-not $SkipPrebuild) {
      & npx expo prebuild --platform android --no-install
      if ($LASTEXITCODE -ne 0) { throw 'Android release configuration generation failed.' }
    } elseif (-not ((Get-Content (Join-Path $root 'android\app\build.gradle') -Raw).Contains('// PROtv upload signing'))) {
      throw 'Native release signing configuration is missing; rerun without SkipPrebuild.'
    }
    Push-Location (Join-Path $root 'android')
    try {
      & .\gradlew.bat app:assembleRelease app:bundleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --console=plain
      if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
    } finally { Pop-Location }
  } finally { Pop-Location }
} finally {
  Remove-Item Env:\PROTV_UPLOAD_STORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\PROTV_UPLOAD_KEY_PASSWORD -ErrorAction SilentlyContinue
}
