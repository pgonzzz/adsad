#!/bin/bash
# ============================================================
#  setup-mac.sh — Instalador automático del agente Pisalia
#
#  Invocado por el .command que el usuario se descarga del CRM.
#  El .command pasa la clave via variable PISALIA_AGENT_KEY.
#
#  Hace:
#   1. Comprueba que Node.js y git estén instalados (avisa si no)
#   2. Clona el repo en ~/Desktop/crm-pisalia (o actualiza si ya existe)
#   3. Ejecuta npm install
#   4. Escribe .env con la clave del usuario
#   5. Ejecuta install-launchd.sh para configurar auto-arranque
# ============================================================

set -e

# ── Config ──────────────────────────────────────────────────────────
INSTALL_DIR="$HOME/Desktop/crm-pisalia"
REPO_URL="https://github.com/pgonzzz/crm-pisalia.git"
BACKEND_URL="${PISALIA_BACKEND_URL:-https://crm-pisalia-production.up.railway.app}"

if [ -z "$PISALIA_AGENT_KEY" ]; then
  echo ""
  echo "[ERROR] No se encontró la variable PISALIA_AGENT_KEY."
  echo "        Tienes que ejecutar este script desde el fichero .command"
  echo "        que descargaste del CRM, no directamente."
  exit 1
fi

echo ""
echo "============================================================"
echo "  Pisalia Agent - Instalador automático para macOS"
echo "============================================================"
echo ""

# ── 1. Comprobar dependencias ───────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js no está instalado."
  echo "        Instálalo desde https://nodejs.org (versión LTS) y vuelve"
  echo "        a ejecutar este instalador."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] Git no está instalado."
  echo "        Instálalo con: xcode-select --install"
  echo "        o desde https://git-scm.com"
  exit 1
fi

# ── 2. Clonar o actualizar el repo ──────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "[1/5] Repo ya clonado, actualizando..."
  cd "$INSTALL_DIR"
  git pull --ff-only || true
else
  echo "[1/5] Clonando repo en $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ── 3. Instalar dependencias del agente ─────────────────────────────
echo "[2/5] Instalando dependencias (1-3 min)..."
cd "$INSTALL_DIR/agent"
npm install --no-audit --no-fund --loglevel=error

# ── 4. Escribir .env con la clave ───────────────────────────────────
echo "[3/5] Configurando tu clave de usuario..."
cat > "$INSTALL_DIR/agent/.env" <<ENVEOF
BACKEND_URL=$BACKEND_URL
AGENT_KEY=$PISALIA_AGENT_KEY
ENVEOF

# ── 5. Configurar auto-arranque con launchd ─────────────────────────
echo "[4/5] Configurando auto-arranque..."
chmod +x "$INSTALL_DIR/agent/install-launchd.sh"
# Pasamos una variable para que install-launchd.sh sepa que .env ya existe
# y no vuelva a pedirla de forma interactiva.
"$INSTALL_DIR/agent/install-launchd.sh"

echo ""
echo "============================================================"
echo "  ✅ INSTALACIÓN COMPLETADA"
echo "============================================================"
echo ""
echo "  - El agente está corriendo en segundo plano."
echo "  - Al encender el Mac, arrancará solo."
echo "  - Chrome se abrirá automáticamente cuando haya tareas."
echo ""
echo "  SIGUIENTE PASO:"
echo "  Vuelve al CRM en tu navegador. En 20-30 segundos verás"
echo "  el estado del agente pasar a 'online' y aparecerá un QR"
echo "  grande de WhatsApp. Escanéalo con tu móvil:"
echo "    WhatsApp → Dispositivos vinculados → Vincular"
echo ""
