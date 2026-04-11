@echo off
REM ============================================================
REM  install-windows.bat — Instala el agente de Pisalia en Windows
REM
REM  Equivalente del install-launchd.sh de macOS. Hace lo siguiente:
REM   1. Pide al usuario su clave de agente (copiada desde el CRM).
REM   2. Guarda la clave en agent\.env.
REM   3. Crea una tarea programada de Windows que arranca el agente
REM      automáticamente al iniciar sesión (como servicio de usuario).
REM   4. Arranca el agente ahora mismo en segundo plano.
REM
REM  Ejecutar UNA SOLA VEZ haciendo doble clic en este fichero,
REM  o desde PowerShell: .\install-windows.bat
REM
REM  Requisitos previos: Node.js LTS instalado y haber hecho
REM  "npm install" en la carpeta agent\.
REM ============================================================

setlocal enabledelayedexpansion

REM Directorio donde está este .bat (carpeta agent\)
set "AGENT_DIR=%~dp0"
set "AGENT_DIR=%AGENT_DIR:~0,-1%"

echo ============================================================
echo   Pisalia Agent - Instalacion en Windows
echo ============================================================
echo.
echo Ruta del agente: %AGENT_DIR%
echo.

REM ── 1. Comprobar que Node.js esta instalado ────────────────────
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en el PATH.
  echo         Instalalo desde https://nodejs.org/ ^(version LTS^)
  echo         y vuelve a ejecutar este script.
  echo.
  pause
  exit /b 1
)

REM ── 2. Comprobar que node_modules existe ───────────────────────
if not exist "%AGENT_DIR%\node_modules" (
  echo [INFO] node_modules no encontrado. Ejecutando "npm install"...
  pushd "%AGENT_DIR%"
  call npm install
  popd
  if errorlevel 1 (
    echo [ERROR] npm install fallo. Revisa los errores de arriba.
    pause
    exit /b 1
  )
)

REM ── 3. Pedir la clave del agente ───────────────────────────────
echo.
echo Pega la clave de agente que aparece en el CRM
echo ^(en Captacion ^> boton "Configurar"^):
echo.
set /p "AGENT_KEY=Clave: "

if "%AGENT_KEY%"=="" (
  echo [ERROR] No has introducido ninguna clave. Cancelando.
  pause
  exit /b 1
)

REM ── 4. Escribir el fichero .env ────────────────────────────────
echo BACKEND_URL=https://crm-pisalia-production.up.railway.app > "%AGENT_DIR%\.env"
echo AGENT_KEY=%AGENT_KEY% >> "%AGENT_DIR%\.env"
echo [OK] .env creado en %AGENT_DIR%\.env

REM ── 5. Parar cualquier tarea anterior ──────────────────────────
schtasks /delete /tn "PisaliaAgent" /f >nul 2>nul

REM ── 6. Matar cualquier proceso antiguo del agente ──────────────
taskkill /f /im node.exe /fi "WINDOWTITLE eq *pisalia*" >nul 2>nul

REM ── 7. Crear tarea programada que arranca al iniciar sesion ────
REM El VBS wrapper ejecuta npm start sin ventana visible.
schtasks /create /tn "PisaliaAgent" ^
  /tr "wscript.exe \"%AGENT_DIR%\start-agent.vbs\"" ^
  /sc onlogon ^
  /rl highest ^
  /f >nul

if errorlevel 1 (
  echo [WARN] No se pudo crear la tarea programada. Puede que necesites
  echo        ejecutar este script como Administrador ^(clic derecho -^>
  echo        "Ejecutar como administrador"^).
  echo        El agente igualmente se va a arrancar ahora, pero no se
  echo        auto-arrancara al reiniciar el PC.
) else (
  echo [OK] Tarea programada creada. El agente arrancara solo al iniciar sesion.
)

REM ── 8. Arrancar el agente ahora mismo en segundo plano ─────────
echo.
echo [INFO] Arrancando el agente en segundo plano...
wscript.exe "%AGENT_DIR%\start-agent.vbs"

REM ── 9. Mensaje final ───────────────────────────────────────────
echo.
echo ============================================================
echo   Instalacion completada
echo ============================================================
echo.
echo   - El agente esta corriendo en segundo plano sin ventana.
echo   - Chrome se abrira automaticamente cuando haya una tarea
echo     de scraping en el CRM.
echo   - Al encender el PC, el agente arrancara solo.
echo.
echo   Acciones utiles:
echo.
echo     Parar el agente:
echo       taskkill /f /im node.exe
echo.
echo     Desinstalar todo:
echo       %AGENT_DIR%\uninstall-windows.bat
echo.
echo   Ve al CRM ^> Captacion. En 20-30 segundos el estado del
echo   agente deberia pasar a "online" y te saldra el QR de
echo   WhatsApp para que lo escanees con tu movil.
echo.
pause
