# Builds the FieldForce 360 debug APK.
# Prerequisites: see IT_INSTALL_REQUIREMENTS.md (JDK 21, Android SDK, ANDROID_HOME set).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not $env:ANDROID_HOME) {
  $default = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $default) { $env:ANDROID_HOME = $default } else { throw 'ANDROID_HOME is not set and the Android SDK was not found. See IT_INSTALL_REQUIREMENTS.md' }
}
"sdk.dir=$($env:ANDROID_HOME -replace '\\','\\')" | Set-Content -Encoding ascii android\local.properties

# Native tools write warnings to stderr; don't let PowerShell 5.1 treat those as fatal.
$ErrorActionPreference = 'Continue'
npm install
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
$androidDir = Join-Path $PSScriptRoot 'android'
$p = Start-Process -FilePath (Join-Path $androidDir 'gradlew.bat') -ArgumentList 'assembleDebug' -WorkingDirectory $androidDir -NoNewWindow -Wait -PassThru
$code = $p.ExitCode
if ($code -ne 0) { throw "Gradle build failed (exit $code)" }
$ErrorActionPreference = 'Stop'

$apk = 'android\app\build\outputs\apk\debug\app-debug.apk'
New-Item -ItemType Directory -Force dist | Out-Null
Copy-Item $apk dist\FieldForce360-debug.apk -Force
Write-Host "APK ready: $(Resolve-Path dist\FieldForce360-debug.apk)"
