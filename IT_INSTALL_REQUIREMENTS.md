# FieldForce 360 — Developer PC requirements (for IT)

Machine: Windows 10/11, 16 GB RAM, ~5 GB free disk. **No admin rights needed** for the Android SDK (installs per-user).

## Software

| # | Software | Version | Source | Status on this PC |
|---|----------|---------|--------|-------------------|
| 1 | Java JDK | 17 or 21 | oracle.com / adoptium.net | ✅ Installed (21.0.10) |
| 2 | Node.js + npm | 20 LTS or newer | nodejs.org | ✅ Installed |
| 3 | Git for Windows | latest | git-scm.com | ✅ Installed |
| 4 | Python | 3.x (only for the local demo server) | python.org | ✅ Installed |
| 5 | Android SDK command-line tools | 12.0 (11076708) | https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip (~146 MB) | ✅ Installed (per-user, `%LOCALAPPDATA%\Android\Sdk`) |
| 6 | Android SDK packages | `platform-tools`, `platforms;android-35`, `build-tools;34.0.0` | via `sdkmanager` (~400 MB) | ✅ Installed |
| 7 | Gradle | 8.11.1 | auto-downloaded by `gradlew` (~150 MB) | ✅ Installed (auto) |
| 8 | Android Studio *(optional)* | latest | developer.android.com/studio | optional — for emulator / debugging |

## Network / firewall allow-list

The build downloads from these hosts (HTTPS 443):

- `dl.google.com` — Android SDK
- `services.gradle.org`, `downloads.gradle.org` — Gradle
- `repo.maven.apache.org`, `maven.google.com`, `dl.google.com/dl/android/maven2` — Android/Java libraries
- `registry.npmjs.org` — Capacitor (npm)
- `tile.openstreetmap.org` — map tiles at runtime (app + dashboard)

## Install commands (PowerShell, normal user)

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
New-Item -ItemType Directory -Force "$sdk\cmdline-tools" | Out-Null
Invoke-WebRequest https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip -OutFile "$env:TEMP\clt.zip"
tar -xf "$env:TEMP\clt.zip" -C "$sdk\cmdline-tools"
Rename-Item "$sdk\cmdline-tools\cmdline-tools" latest
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
& "$sdk\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "platforms;android-35" "build-tools;34.0.0"
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdk, 'User')
```

`sdkmanager --licenses` asks you to accept the Android SDK License Agreement.

## Build the APK

```powershell
.\build-apk.ps1
```

Output: `dist\FieldForce360-debug.apk`. Copy it to an Android phone and install it (you need to allow "Install unknown apps").

## Phone for testing

Any Android 6.0+ phone with GPS. Turn on Developer options → USB debugging if you want to install over USB with `adb install`.
