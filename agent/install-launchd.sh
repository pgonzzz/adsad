#!/bin/bash
#
# install-launchd.sh — Instala el agente de Pisalia como servicio de macOS
#
# Una vez instalado, el agente y Chrome arrancan automáticamente al encender
# el Mac, sin necesidad de abrir Terminal ni ejecutar nada manualmente.
#
# Ejecutar UNA SOLA VEZ desde la carpeta raíz del proyecto:
#   ./agent/install-launchd.sh
#
# Si ya tenías un agente corriendo manualmente en otra Terminal, páralo antes
# (Ctrl+C) — de lo contrario habrá dos instancias y se pelearán por WhatsApp.
#

set -e

# ─── Detectar rutas ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$PROJECT_ROOT/agent"

NPM_BIN="$(command -v npm || true)"
if [ -z "$NPM_BIN" ]; then
  echo "❌ Error: npm no encontrado en el PATH."
  echo "   Asegúrate de tener Node.js instalado (https://nodejs.org)."
  exit 1
fi

HOME_DIR="$HOME"
LOG_DIR="$HOME/Library/Logs"
LAUNCH_DIR="$HOME/Library/LaunchAgents"
NPM_PATH_DIR="$(dirname "$NPM_BIN")"

mkdir -p "$LOG_DIR"
mkdir -p "$LAUNCH_DIR"

AGENT_PLIST="$LAUNCH_DIR/com.pisalia.agent.plist"
CHROME_PLIST="$LAUNCH_DIR/com.pisalia.chrome.plist"

echo "═══════════════════════════════════════════════════════════"
echo "  Pisalia Agent — Instalación como servicio de macOS"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Rutas detectadas:"
echo "  Proyecto:  $PROJECT_ROOT"
echo "  Agente:    $AGENT_DIR"
echo "  npm:       $NPM_BIN"
echo "  Logs:      $LOG_DIR"
echo "  Launchd:   $LAUNCH_DIR"
echo ""
echo "Nota: Chrome NO se abrirá al encender el Mac. Solo se lanza cuando"
echo "      hay una tarea de scraping pendiente (bajo demanda)."
echo ""

# ─── Dar permisos al script de Chrome ────────────────────────────────────────
chmod +x "$AGENT_DIR/start-chrome.sh" 2>/dev/null || true

# ─── Pedir la clave del agente si no hay .env todavía ────────────────────────
ENV_FILE="$AGENT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "No encontré $ENV_FILE. Voy a pedirte tu clave de agente."
  echo "Cópiala desde el CRM (Captación → botón 'Configurar') y pégala aquí:"
  echo ""
  read -p "Clave de agente: " AGENT_KEY_INPUT
  if [ -z "$AGENT_KEY_INPUT" ]; then
    echo "[WARN] No has introducido clave. Usaré la clave legacy por compat."
    echo "       Puedes editar $ENV_FILE luego para poner tu clave real."
    AGENT_KEY_INPUT="captacion-agent-2024"
  fi
  cat > "$ENV_FILE" <<ENVEOF
BACKEND_URL=https://crm-pisalia-production.up.railway.app
AGENT_KEY=$AGENT_KEY_INPUT
ENVEOF
  echo "[OK] $ENV_FILE creado."
else
  echo "[INFO] Ya existe $ENV_FILE, manteniendo tu configuración."
fi

# ─── Parar cualquier servicio anterior ───────────────────────────────────────
echo "→ Parando servicios anteriores (si los hay)..."
launchctl unload "$AGENT_PLIST" 2>/dev/null || true
launchctl unload "$CHROME_PLIST" 2>/dev/null || true
# Quitar el plist antiguo de Chrome si existe (ya no lo usamos)
rm -f "$CHROME_PLIST"
pkill -f "node index.js" 2>/dev/null || true

# ─── Crear el plist del agente ───────────────────────────────────────────────
cat > "$AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pisalia.agent</string>
  <key>WorkingDirectory</key>
  <string>$AGENT_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/pisalia-agent.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/pisalia-agent.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NPM_PATH_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME_DIR</string>
  </dict>
</dict>
</plist>
EOF

# ─── Cargar el servicio del agente ───────────────────────────────────────────
echo "→ Cargando servicio del agente..."
launchctl load "$AGENT_PLIST"

echo ""
echo "✅ Instalación completada."
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Qué pasa a partir de ahora"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  • Al encender el Mac, el agente arranca solo en segundo plano."
echo "  • Chrome NO se abre al encender el Mac."
echo "  • Chrome se lanza automáticamente solo cuando hay una tarea de"
echo "    scraping pendiente (al pulsar 'Iniciar scraping' en el CRM)."
echo "  • Si cierras Chrome por error, la próxima tarea lo reabre sola."
echo "  • Si el agente se cae, launchd lo reinicia automáticamente."
echo "  • Ya no tienes que tocar Terminal para usar el CRM."
echo ""
echo "  Comandos útiles (por si alguna vez los necesitas):"
echo ""
echo "    Ver los logs del agente en tiempo real:"
echo "      tail -f ~/Library/Logs/pisalia-agent.log"
echo ""
echo "    Parar el agente temporalmente:"
echo "      launchctl unload ~/Library/LaunchAgents/com.pisalia.agent.plist"
echo ""
echo "    Arrancar el agente de nuevo:"
echo "      launchctl load ~/Library/LaunchAgents/com.pisalia.agent.plist"
echo ""
echo "    Desinstalar todo:"
echo "      ./agent/uninstall-launchd.sh"
echo ""
echo "═══════════════════════════════════════════════════════════"
