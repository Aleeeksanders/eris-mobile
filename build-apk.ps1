# ============================================================
# Eris Mobile — Build APK Local (sin EAS)
# Genera app-release.apk firmada con debug.keystore
# ============================================================

Write-Host "`n⚡ Eris Mobile — Build APK Local`n" -ForegroundColor Cyan

# ─── 1. Encontrar JAVA_HOME ────────────────────────────────
# Prioridad: JBR de Android Studio (OpenJDK 21, ya confirmado instalado)
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
if (-not (Test-Path $javaHome)) {
    $candidatos = @(
        "C:\Program Files\Eclipse Adoptium\jdk-17*",
        "C:\Program Files\Java\jdk-17*"
    )
    foreach ($c in $candidatos) {
        $found = Get-Item $c -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { $javaHome = $found.FullName; break }
    }
}
if (-not $javaHome) {
    Write-Host "❌ JAVA_HOME no encontrado. Asegúrate de tener JDK 17 instalado." -ForegroundColor Red
    exit 1
}
$env:JAVA_HOME = $javaHome
Write-Host "✅ JAVA_HOME: $javaHome" -ForegroundColor Green

# ─── 2. Encontrar ANDROID_HOME ─────────────────────────────
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $candidatos = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "C:\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk"
    )
    foreach ($c in $candidatos) {
        if (Test-Path $c) { $androidHome = $c; break }
    }
}
if (-not $androidHome) {
    Write-Host "❌ ANDROID_HOME no encontrado. Abre Android Studio y completa el setup inicial." -ForegroundColor Red
    exit 1
}
$env:ANDROID_HOME = $androidHome
Write-Host "✅ ANDROID_HOME: $androidHome" -ForegroundColor Green

# ─── 3. Crear local.properties ─────────────────────────────
$localProps = "c:\Proyectos\eris-mobile\android\local.properties"
$sdkPathEscaped = $androidHome.Replace("\", "\\")
"sdk.dir=$sdkPathEscaped" | Set-Content $localProps -Encoding UTF8
Write-Host "✅ local.properties configurado" -ForegroundColor Green

# ─── 4. Build ──────────────────────────────────────────────
Write-Host "`n🔨 Iniciando build (puede tardar 5-15 min la primera vez)...`n" -ForegroundColor Yellow

Set-Location "c:\Proyectos\eris-mobile\android"
& ".\gradlew.bat" assembleRelease

if ($LASTEXITCODE -eq 0) {
    $apkPath = "c:\Proyectos\eris-mobile\android\app\build\outputs\apk\release\app-release.apk"
    $apkSize = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
    Write-Host "`nAPK generada exitosamente!" -ForegroundColor Green
    Write-Host "Ruta: $apkPath" -ForegroundColor Cyan
    Write-Host "Tamano: $apkSize MB" -ForegroundColor Cyan
    Write-Host "`nLista para instalar via sideload o subir a axs.systems`n" -ForegroundColor Cyan
} else {
    Write-Host "`nBuild fallo. Revisar output arriba para el error." -ForegroundColor Red
}
