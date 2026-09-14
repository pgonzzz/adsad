@echo off
REM ============================================================
REM  stop-scraping.bat — Parada de emergencia del scraping
REM
REM  Crea el fichero STOP junto al agente. El scraper lo detecta en el
REM  siguiente anuncio y aborta, conservando los leads ya enviados.
REM  El agente sigue corriendo y aceptara nuevas tareas con normalidad.
REM
REM  Consejo: crea un acceso directo a este fichero en el Escritorio.
REM ============================================================
echo stop> "%~dp0STOP"
echo Se ha pedido parar el scraping. Se detendra en unos segundos.
timeout /t 3 >nul
