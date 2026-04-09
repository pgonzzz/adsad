#!/bin/bash
#
# uninstall-launchd.sh — Desinstala los servicios de Pisalia de macOS
#
# Tras ejecutar este script, el agente y Chrome ya no arrancarán solos al
# encender el Mac. Los podrás seguir arrancando manualmente con
# ./agent/start-chrome.sh y (cd agent && npm start) si lo prefieres.
#

LAUNCH_DIR="$HOME/Library/LaunchAgents"
AGENT_PLIST="$LAUNCH_DIR/com.pisalia.agent.plist"
CHROME_PLIST="$LAUNCH_DIR/com.pisalia.chrome.plist"

echo "→ Parando y desinstalando servicios de Pisalia..."

launchctl unload "$AGENT_PLIST" 2>/dev/null || true
launchctl unload "$CHROME_PLIST" 2>/dev/null || true

rm -f "$AGENT_PLIST"
rm -f "$CHROME_PLIST"

# Matar procesos residuales
pkill -f "node index.js" 2>/dev/null || true

echo ""
echo "✅ Desinstalado."
echo ""
echo "Los servicios se han parado y eliminado. El Chrome especial puede seguir"
echo "abierto — ciérralo manualmente si quieres."
