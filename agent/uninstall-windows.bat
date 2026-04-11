@echo off
REM ============================================================
REM  uninstall-windows.bat — Desinstala el agente de Pisalia
REM
REM  - Elimina la tarea programada "PisaliaAgent".
REM  - Mata cualquier proceso node.exe del agente que esté corriendo.
REM
REM  Ejecutar con doble clic o desde PowerShell.
REM ============================================================

echo Desinstalando Pisalia Agent...

REM 1. Eliminar la tarea programada
schtasks /delete /tn "PisaliaAgent" /f >nul 2>nul
if errorlevel 1 (
  echo [INFO] No habia tarea programada "PisaliaAgent".
) else (
  echo [OK] Tarea programada eliminada.
)

REM 2. Matar cualquier proceso del agente
taskkill /f /im node.exe /fi "IMAGENAME eq node.exe" >nul 2>nul
echo [OK] Procesos del agente detenidos (si los habia).

echo.
echo Desinstalacion completada. El agente ya no arrancara al iniciar sesion.
echo Si quieres volver a instalarlo, ejecuta install-windows.bat.
echo.
pause
