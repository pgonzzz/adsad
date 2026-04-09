#!/bin/bash
# Abre Chrome con el puerto de depuración para que el agente pueda conectarse
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-scraper" \
  "https://www.idealista.com" &
echo "Chrome abierto. Navega a la búsqueda de Idealista que quieras scrapear y luego pulsa 'Iniciar scraping' en el CRM."
