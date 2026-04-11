# ============================================================
#  setup-windows.ps1 — Instalador automático del agente Pisalia
# ============================================================
#
# Este script se descarga y ejecuta desde el fichero .bat que el
# usuario se baja desde el CRM. El .bat contiene la clave del
# usuario (PISALIA_AGENT_KEY) en una variable de entorno.
#
# El script hace TODO de forma automática:
#   1. Crea un directorio de instalación en %LOCALAPPDATA%\PisaliaAgent
#   2. Descarga Node.js portable (no requiere admin)
#   3. Descarga el código del agente desde GitHub como ZIP
#   4. Ejecuta "npm install" usando el Node.js portable
#   5. Crea el fichero .env con la clave del usuario
#   6. Configura auto-arranque al iniciar sesión (Task Scheduler
#      o carpeta de Inicio si no hay permisos de admin)
#   7. Arranca el agente ya mismo en segundo plano
#
# El usuario solo tiene que darle doble clic al .bat y esperar.
#
# ============================================================

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'  # descargas más rápidas

# ── Config ──────────────────────────────────────────────────────────
$InstallDir = Join-Path $env:LOCALAPPDATA "PisaliaAgent"
$NodeVersion = "v20.11.1"
$NodeZipUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip"
$RepoZipUrl = "https://github.com/pgonzzz/crm-pisalia/archive/refs/heads/main.zip"

$AgentKey = $env:PISALIA_AGENT_KEY
$BackendUrl = if ($env:PISALIA_BACKEND_URL) { $env:PISALIA_BACKEND_URL } else { "https://crm-pisalia-production.up.railway.app" }

if ([string]::IsNullOrWhiteSpace($AgentKey)) {
    Write-Host ""
    Write-Host "[ERROR] No se encontro la variable PISALIA_AGENT_KEY." -ForegroundColor Red
    Write-Host "        Tienes que ejecutar este script desde el fichero .bat" -ForegroundColor Red
    Write-Host "        que descargaste del CRM, no directamente." -ForegroundColor Red
    Write-Host ""
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Pisalia Agent - Instalador automatico para Windows" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Directorio de instalacion: $InstallDir"
Write-Host "  Backend:                   $BackendUrl"
Write-Host ""

# ── 1. Crear directorio de instalacion ──────────────────────────────
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# ── 2. Descargar Node.js portable si no esta ya instalado ──────────
$NodeDir = Join-Path $InstallDir "node"
$NodeExe = Join-Path $NodeDir "node.exe"
$NpmCmd = Join-Path $NodeDir "npm.cmd"

if (-not (Test-Path $NodeExe)) {
    Write-Host "[1/7] Descargando Node.js $NodeVersion portable (~30 MB)..." -ForegroundColor Yellow
    $NodeZip = Join-Path $env:TEMP "pisalia-node.zip"
    try {
        Invoke-WebRequest -Uri $NodeZipUrl -OutFile $NodeZip -UseBasicParsing
    } catch {
        Write-Host "[ERROR] No se pudo descargar Node.js desde $NodeZipUrl" -ForegroundColor Red
        Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Pulsa Enter para cerrar"
        exit 1
    }

    Write-Host "[2/7] Extrayendo Node.js..." -ForegroundColor Yellow
    $ExtractTemp = Join-Path $env:TEMP "pisalia-node-extract"
    if (Test-Path $ExtractTemp) { Remove-Item $ExtractTemp -Recurse -Force }
    Expand-Archive -Path $NodeZip -DestinationPath $ExtractTemp -Force

    # El ZIP contiene una carpeta "node-v20.x.x-win-x64" dentro
    $InnerDir = Get-ChildItem $ExtractTemp -Directory | Select-Object -First 1
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    Move-Item -Path $InnerDir.FullName -Destination $NodeDir -Force

    Remove-Item $NodeZip -Force -ErrorAction SilentlyContinue
    Remove-Item $ExtractTemp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      OK - Node.js listo en $NodeDir" -ForegroundColor Green
} else {
    Write-Host "[1-2/7] Node.js ya esta instalado, saltando descarga." -ForegroundColor Green
}

# Anadir Node al PATH solo para esta sesion
$env:PATH = "$NodeDir;$env:PATH"

# ── 3. Descargar el codigo del agente desde GitHub ──────────────────
Write-Host "[3/7] Descargando codigo del agente desde GitHub..." -ForegroundColor Yellow
$RepoZip = Join-Path $env:TEMP "pisalia-repo.zip"
try {
    Invoke-WebRequest -Uri $RepoZipUrl -OutFile $RepoZip -UseBasicParsing
} catch {
    Write-Host "[ERROR] No se pudo descargar el repo desde GitHub" -ForegroundColor Red
    Write-Host "        $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}

# ── 4. Extraer y copiar solo la carpeta agent ───────────────────────
Write-Host "[4/7] Extrayendo..." -ForegroundColor Yellow
$AgentDir = Join-Path $InstallDir "agent"
$RepoExtract = Join-Path $env:TEMP "pisalia-repo-extract"
if (Test-Path $RepoExtract) { Remove-Item $RepoExtract -Recurse -Force }
Expand-Archive -Path $RepoZip -DestinationPath $RepoExtract -Force

# Preservar wa_session si ya existe (para no perder la sesion de WhatsApp)
$WaSessionBackup = Join-Path $env:TEMP "pisalia-wa-backup"
$WaSessionSrc = Join-Path $AgentDir "wa_session"
if (Test-Path $WaSessionSrc) {
    if (Test-Path $WaSessionBackup) { Remove-Item $WaSessionBackup -Recurse -Force }
    Move-Item -Path $WaSessionSrc -Destination $WaSessionBackup -Force
}

# Sustituir el agent/ con la nueva version
if (Test-Path $AgentDir) { Remove-Item $AgentDir -Recurse -Force }
$ExtractedAgent = Get-ChildItem $RepoExtract -Directory | Select-Object -First 1 | ForEach-Object { Join-Path $_.FullName "agent" }
if (-not (Test-Path $ExtractedAgent)) {
    Write-Host "[ERROR] No se encontro la carpeta 'agent' en el ZIP descargado" -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}
Copy-Item -Path $ExtractedAgent -Destination $AgentDir -Recurse -Force

# Restaurar wa_session
if (Test-Path $WaSessionBackup) {
    Move-Item -Path $WaSessionBackup -Destination $WaSessionSrc -Force
}

Remove-Item $RepoZip -Force -ErrorAction SilentlyContinue
Remove-Item $RepoExtract -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "      OK - Agente copiado en $AgentDir" -ForegroundColor Green

# ── 5. Instalar dependencias ────────────────────────────────────────
Write-Host "[5/7] Instalando dependencias con npm (1-3 min)..." -ForegroundColor Yellow
Push-Location $AgentDir
try {
    & $NpmCmd install --production --no-audit --no-fund --loglevel=error 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "npm install salio con codigo $LASTEXITCODE"
    }
} catch {
    Pop-Location
    Write-Host "[ERROR] npm install fallo: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Pulsa Enter para cerrar"
    exit 1
}
Pop-Location
Write-Host "      OK - Dependencias instaladas" -ForegroundColor Green

# ── 6. Escribir .env con la clave del usuario ───────────────────────
Write-Host "[6/7] Configurando tu clave de usuario..." -ForegroundColor Yellow
$EnvFile = Join-Path $AgentDir ".env"
$EnvContent = "BACKEND_URL=$BackendUrl`r`nAGENT_KEY=$AgentKey`r`n"
[System.IO.File]::WriteAllText($EnvFile, $EnvContent)
Write-Host "      OK - $EnvFile" -ForegroundColor Green

# ── 7. Configurar auto-arranque + arrancar ahora ────────────────────
Write-Host "[7/7] Configurando auto-arranque..." -ForegroundColor Yellow
$VbsPath = Join-Path $AgentDir "start-agent.vbs"

# Asegurarnos de que el VBS existe (si no, lo creamos)
if (-not (Test-Path $VbsPath)) {
    $VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "cmd /c ""$NodeDir\node.exe"" index.js", 0, False
"@
    Set-Content -Path $VbsPath -Value $VbsContent
}

# Matar cualquier agente previo
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path.StartsWith($NodeDir)
} | Stop-Process -Force -ErrorAction SilentlyContinue

# Intentar crear la tarea programada (al iniciar sesion)
schtasks /delete /tn "PisaliaAgent" /f 2>&1 | Out-Null
$SchtasksResult = schtasks /create /tn "PisaliaAgent" /tr "wscript.exe `"$VbsPath`"" /sc onlogon /rl limited /f 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "      OK - Tarea programada creada (arranca al iniciar sesion)" -ForegroundColor Green
} else {
    # Fallback: carpeta de Inicio
    Write-Host "      No se pudo crear tarea programada, usando carpeta de Inicio como fallback." -ForegroundColor Yellow
    $StartupDir = [Environment]::GetFolderPath("Startup")
    $StartupVbs = Join-Path $StartupDir "PisaliaAgent.vbs"
    Copy-Item -Path $VbsPath -Destination $StartupVbs -Force
    Write-Host "      OK - Agregado a $StartupVbs" -ForegroundColor Green
}

# Arrancar el agente ya mismo en segundo plano
Start-Process "wscript.exe" -ArgumentList "`"$VbsPath`"" -WindowStyle Hidden
Write-Host "      OK - Agente arrancado en segundo plano" -ForegroundColor Green

# ── Mensaje final ───────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  INSTALACION COMPLETADA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  - El agente esta corriendo en segundo plano (invisible)."
Write-Host "  - Al encender Windows, arrancara solo."
Write-Host "  - Chrome se abrira automaticamente cuando haya tareas."
Write-Host ""
Write-Host "  SIGUIENTE PASO:"
Write-Host "  Vuelve al CRM en el navegador. En 20-30 segundos veras"
Write-Host "  el estado del agente pasar a online y aparecera un QR"
Write-Host "  grande de WhatsApp. Escanealo con tu movil:"
Write-Host "    WhatsApp -> ... -> Dispositivos vinculados -> Vincular"
Write-Host ""
Write-Host "  Para desinstalar mas adelante:"
Write-Host "    $AgentDir\uninstall-windows.bat"
Write-Host ""
Read-Host "Pulsa Enter para cerrar esta ventana"
