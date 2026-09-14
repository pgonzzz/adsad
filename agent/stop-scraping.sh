#!/bin/bash
# Parada de emergencia del scraping: crea agent/STOP; el scraper aborta en el
# siguiente anuncio conservando los leads ya enviados. El agente sigue vivo.
touch "$(dirname "$0")/STOP" && echo "Se ha pedido parar el scraping. Se detendrá en unos segundos."
