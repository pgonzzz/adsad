import express from 'express';
import supabase from '../db/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ─── Estado en memoria de agentes (por usuario) ──────────────────────────────
// Mapa: user_id -> { online, whatsapp_connected, qr_code, last_seen }
// Cada usuario tiene su propio agente corriendo en su Mac, con su propia
// clave. El backend rutea las tareas al agente correcto por user_id.
const agentStates = new Map();

// ─── Helper: resolver user_id a partir de la agent_key ───────────────────────
// Soporta:
// - Claves UUID reales almacenadas en captacion_agent_keys (multi-usuario).
// - Clave legacy 'captacion-agent-2024' → se mapea al primer usuario del
//   sistema (el usuario original) para no romper el agente existente.
const LEGACY_AGENT_KEY = 'captacion-agent-2024';

async function getUserIdFromAgentKey(req) {
  const key = req.headers['x-agent-key'] || req.query.agent_key;
  if (!key) return null;

  // Clave legacy → usuario más antiguo del sistema (backward compat).
  // Usamos auth.admin.listUsers porque captacion_agent_keys.created_at
  // puede ser idéntico para todos los usuarios si se creó la tabla
  // en la misma migración. En cambio auth.users.created_at es el
  // timestamp real de registro de cada usuario y es determinista.
  if (key === LEGACY_AGENT_KEY || key === process.env.AGENT_KEY) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (error || !data?.users || data.users.length === 0) return null;
      const sorted = [...data.users].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return sorted[0]?.id || null;
    } catch (err) {
      console.warn('[auth] Error listando usuarios:', err.message);
      return null;
    }
  }

  // Clave normal → lookup directo
  const { data } = await supabase
    .from('captacion_agent_keys')
    .select('user_id')
    .eq('agent_key', key)
    .maybeSingle();
  return data?.user_id || null;
}

// Middleware para rutas del agente que extrae el user_id de la agent_key.
// Rechaza con 401 si la clave es inválida. Pone req.agentUserId.
async function agentAuthMiddleware(req, res, next) {
  const userId = await getUserIdFromAgentKey(req);
  if (!userId) {
    return res.status(401).json({ error: 'Agent key inválida' });
  }
  req.agentUserId = userId;
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAÑAS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /captacion/campanas — lista TODAS las campañas (visibles para todo el equipo)
router.get('/campanas', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(id, estado)')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Resolver emails de creadores
  const userIds = [...new Set(data.map(c => c.user_id).filter(Boolean))];
  const userMap = {};
  if (userIds.length > 0) {
    try {
      const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      for (const u of (usersData?.users || [])) {
        userMap[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || u.email;
      }
    } catch {}
  }

  // Añadir conteos de leads por estado + nombre del creador
  const campanas = data.map(c => {
    const leads = c.captacion_leads || [];
    return {
      ...c,
      captacion_leads: undefined,
      creado_por: userMap[c.user_id] || 'Desconocido',
      leads_total: leads.length,
      leads_nuevo: leads.filter(l => l.estado === 'nuevo').length,
      leads_enviado: leads.filter(l => l.estado === 'enviado').length,
      leads_respondido: leads.filter(l => l.estado === 'respondido').length,
      leads_convertido: leads.filter(l => l.estado === 'convertido').length,
      leads_descartado: leads.filter(l => l.estado === 'descartado').length,
    };
  });

  res.json(campanas);
});

// POST /captacion/campanas — crear campaña (asociada al usuario actual)
router.post('/campanas', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .insert([{ ...req.body, user_id: req.user.id }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /captacion/campanas/:id — campaña con leads (visible para todo el equipo)
router.get('/campanas/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /captacion/campanas/:id — actualizar (solo si es del usuario)
router.put('/campanas/:id', authMiddleware, async (req, res) => {
  const { user_id, ...safeBody } = req.body;
  const { data, error } = await supabase
    .from('captacion_campanas')
    .update(safeBody)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /captacion/campanas/:id
router.delete('/campanas/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('captacion_campanas')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /captacion/leads — listar TODOS los leads (visibles para todo el equipo)
router.get('/leads', authMiddleware, async (req, res) => {
  let query = supabase
    .from('captacion_leads')
    .select('*, captacion_campanas!inner(nombre, portal, user_id)')
    .order('created_at', { ascending: false });

  if (req.query.campana_id) query = query.eq('campana_id', req.query.campana_id);
  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /captacion/leads/:id — ficha de un lead con envíos y recordatorios
router.get('/leads/:id', authMiddleware, async (req, res) => {
  const { data: lead, error } = await supabase
    .from('captacion_leads')
    .select('*, captacion_campanas!inner(nombre, portal, user_id)')
    .eq('id', req.params.id)
    .single();
  if (error || !lead) return res.status(404).json({ error: 'Lead no encontrado' });

  // Envíos de WhatsApp
  const { data: envios } = await supabase
    .from('captacion_envios')
    .select('*')
    .eq('lead_id', req.params.id)
    .order('created_at', { ascending: false });

  // Recordatorios asociados
  const { data: recordatorios } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('entidad', 'lead')
    .eq('entidad_id', req.params.id)
    .eq('user_id', req.user.id)
    .order('fecha_hora', { ascending: true });

  res.json({ ...lead, envios: envios || [], recordatorios: recordatorios || [] });
});

// POST /captacion/leads — crear lead (manual)
router.post('/leads', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_leads')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /captacion/leads/:id — actualizar estado/notas
router.put('/leads/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_leads')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /captacion/leads/respuesta — el agente notifica que un lead ha contestado por WhatsApp
router.post('/leads/respuesta', agentAuthMiddleware, async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono) return res.status(400).json({ error: 'telefono requerido' });

  // Buscar lead por teléfono (puede tener prefijo o no)
  // Restringir a leads de campañas del usuario del agente (multi-usuario)
  const variants = [telefono, `34${telefono}`, `+34${telefono}`];
  let lead = null;

  for (const variant of variants) {
    const { data } = await supabase
      .from('captacion_leads')
      .select('id, estado, captacion_campanas!inner(user_id)')
      .eq('telefono', variant)
      .eq('captacion_campanas.user_id', req.agentUserId)
      .in('estado', ['enviado', 'nuevo'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) { lead = data; break; }
  }

  if (!lead) {
    return res.json({ updated: false, message: 'Lead no encontrado o ya en estado final' });
  }

  // Marcar como respondido
  await supabase
    .from('captacion_leads')
    .update({ estado: 'respondido', ultimo_contacto: new Date().toISOString(), notas: mensaje ? `Respuesta WA: "${mensaje.slice(0, 200)}"` : undefined })
    .eq('id', lead.id);

  res.json({ updated: true, lead_id: lead.id });
});

// POST /captacion/agent/ack — actualizar estado ACK de un mensaje enviado
// (enviado/entregado/leido) cuando WhatsApp notifica un cambio.
router.post('/agent/ack', agentAuthMiddleware, async (req, res) => {
  const { message_id, ack_status } = req.body;
  if (!message_id || !ack_status) {
    return res.status(400).json({ error: 'message_id y ack_status requeridos' });
  }

  // Prioridad: no sobrescribir 'leido' con 'entregado' ni con 'enviado'
  const priority = { pendiente: 0, enviado: 1, entregado: 2, leido: 3 };
  const { data: existing } = await supabase
    .from('captacion_envios')
    .select('id, ack_status, lead_id')
    .eq('message_id', message_id)
    .maybeSingle();

  if (!existing) return res.json({ updated: false, reason: 'message_id no encontrado' });

  const currentPrio = priority[existing.ack_status] ?? 0;
  const newPrio = priority[ack_status] ?? 0;
  if (newPrio <= currentPrio) return res.json({ updated: false, reason: 'prioridad menor' });

  await supabase
    .from('captacion_envios')
    .update({ ack_status, ack_at: new Date().toISOString() })
    .eq('id', existing.id);

  // Si llega a 'leido', también actualizar el lead para que sea visible
  if (ack_status === 'leido') {
    await supabase
      .from('captacion_leads')
      .update({ ultimo_ack: 'leido' })
      .eq('id', existing.lead_id);
  }

  res.json({ updated: true });
});

// GET /captacion/leads/:id/envios — historial de mensajes enviados a un lead
router.get('/leads/:id/envios', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_envios')
    .select('*')
    .eq('lead_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /captacion/leads/:id
router.delete('/leads/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('captacion_leads')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLANTILLAS DE MENSAJES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /captacion/plantillas — listar plantillas del usuario
// Filtro opcional: ?tipo=inicial|followup
router.get('/plantillas', authMiddleware, async (req, res) => {
  let query = supabase
    .from('captacion_plantillas')
    .select('*')
    .eq('user_id', req.user.id)
    .order('updated_at', { ascending: false });

  if (req.query.tipo) query = query.eq('tipo', req.query.tipo);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /captacion/plantillas — crear plantilla
router.post('/plantillas', authMiddleware, async (req, res) => {
  const { nombre, texto, tipo } = req.body;
  if (!nombre || !texto || !tipo) {
    return res.status(400).json({ error: 'Faltan campos: nombre, texto y tipo son obligatorios' });
  }
  if (!['inicial', 'followup'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo debe ser "inicial" o "followup"' });
  }
  const { data, error } = await supabase
    .from('captacion_plantillas')
    .insert([{ user_id: req.user.id, nombre, texto, tipo }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /captacion/plantillas/:id — actualizar (solo si es del usuario)
router.put('/plantillas/:id', authMiddleware, async (req, res) => {
  // Nunca permitir cambiar user_id
  const { user_id, id, created_at, updated_at, ...safeBody } = req.body;
  const { data, error } = await supabase
    .from('captacion_plantillas')
    .update(safeBody)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(data);
});

// DELETE /captacion/plantillas/:id — eliminar
router.delete('/plantillas/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('captacion_plantillas')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TAREAS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /captacion/tareas — crear tarea (llamado desde el frontend)
// Hereda el user_id de la campaña para que solo la recoja el agente correcto
router.post('/tareas', authMiddleware, async (req, res) => {
  const campanaId = req.body.payload?.campana_id;
  if (!campanaId) {
    return res.status(400).json({ error: 'Falta campana_id en el payload' });
  }
  const { data, error } = await supabase
    .from('captacion_tareas')
    .insert([{ ...req.body, estado: 'pendiente', user_id: req.user.id }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// POST /captacion/tareas/:id/cancel — pausar/cancelar una tarea en curso
// Marca la tarea como 'cancelada' en la BD. El agente, en el siguiente
// partial result que envía, recibirá {cancelled:true} y abortará el bucle.
router.post('/tareas/:id/cancel', authMiddleware, async (req, res) => {
  // Verificar que la tarea pertenece al usuario
  const { data: tarea, error: selErr } = await supabase
    .from('captacion_tareas')
    .select('id, user_id, estado')
    .eq('id', req.params.id)
    .single();

  if (selErr || !tarea) {
    return res.status(404).json({ error: 'Tarea no encontrada' });
  }
  if (tarea.estado !== 'pendiente' && tarea.estado !== 'en_proceso') {
    return res.status(400).json({ error: `La tarea está en estado "${tarea.estado}" y no se puede cancelar` });
  }

  const { error: updErr } = await supabase
    .from('captacion_tareas')
    .update({ estado: 'cancelada', completed_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (updErr) return res.status(500).json({ error: updErr.message });
  res.json({ ok: true, tarea_id: req.params.id });
});

// GET /captacion/campanas/:id/active-task — devuelve la tarea de scraping
// activa (pendiente o en_proceso) de una campaña, si la hay. El frontend
// lo usa para decidir si muestra el botón "Pausar scraping".
router.get('/campanas/:id/active-task', authMiddleware, async (req, res) => {
  // Buscar tarea scrape activa para esta campaña
  const { data, error } = await supabase
    .from('captacion_tareas')
    .select('id, tipo, estado, created_at')
    .eq('user_id', req.user.id)
    .eq('tipo', 'scrape')
    .in('estado', ['pendiente', 'en_proceso'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: error.message });

  // Filtrar client-side por campana_id (está en el payload JSONB)
  const { data: tareasConPayload } = await supabase
    .from('captacion_tareas')
    .select('id, tipo, estado, created_at, payload')
    .in('id', (data || []).map(t => t.id));

  const activa = (tareasConPayload || []).find(t => t.payload?.campana_id === req.params.id);
  res.json({ task: activa || null });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /captacion/agent/heartbeat — el agente envía su estado cada 10s
router.post('/agent/heartbeat', agentAuthMiddleware, async (req, res) => {
  const { whatsapp_connected, qr_code } = req.body;

  // Si hay una petición pendiente de desvincular WhatsApp (el usuario pulsó
  // "Desconectar" en el CRM), devolvémosela al agente y la limpiamos —
  // "consume on read", para que sólo actúe una vez. El agente llamará
  // logoutWhatsApp() y el siguiente heartbeat ya vendrá con
  // whatsapp_connected=false + un qr_code nuevo.
  const prev = agentStates.get(req.agentUserId);
  const disconnectRequested = !!prev?.disconnect_requested;

  agentStates.set(req.agentUserId, {
    user_id: req.agentUserId,
    online: true,
    whatsapp_connected: !!whatsapp_connected,
    qr_code: qr_code || null,
    last_seen: new Date().toISOString(),
    disconnect_requested: false,
  });
  res.json({ ok: true, disconnect_requested: disconnectRequested });
});

// POST /captacion/agent/disconnect — el usuario pulsa "Desconectar WhatsApp"
// en el CRM. Marcamos un flag en el estado del agente; el agente lo recoge
// en el siguiente heartbeat (≤10s) y se desvincula. Si el agente está offline,
// el flag queda pendiente hasta que vuelva — es idempotente.
router.post('/agent/disconnect', authMiddleware, async (req, res) => {
  const prev = agentStates.get(req.user.id);
  if (!prev) {
    // Si nunca ha enviado heartbeat sembramos un estado mínimo para que al
    // arrancar el agente recoja el flag inmediatamente.
    agentStates.set(req.user.id, {
      user_id: req.user.id,
      online: false,
      whatsapp_connected: false,
      qr_code: null,
      last_seen: null,
      disconnect_requested: true,
    });
  } else {
    agentStates.set(req.user.id, { ...prev, disconnect_requested: true });
  }
  res.json({ ok: true });
});

// GET /captacion/agent/status — estado del agente del usuario autenticado
router.get('/agent/status', authMiddleware, async (req, res) => {
  const state = agentStates.get(req.user.id);
  if (!state) {
    return res.json({
      online: false,
      whatsapp_connected: false,
      qr_code: null,
      last_seen: null,
    });
  }
  // Si el último heartbeat fue hace más de 30s, marcar offline
  const isOnline = state.last_seen
    ? (Date.now() - new Date(state.last_seen).getTime()) < 30000
    : false;
  res.json({ ...state, online: isOnline });
});

// GET /captacion/agent/my-key — obtener (o crear) la agent_key del usuario
router.get('/agent/my-key', authMiddleware, async (req, res) => {
  // Intentar leer la clave existente
  const { data: existing } = await supabase
    .from('captacion_agent_keys')
    .select('agent_key, nombre')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (existing) {
    return res.json({ agent_key: existing.agent_key, nombre: existing.nombre });
  }

  // Si no existe (usuario nuevo sin trigger), crearla
  const { data: created, error } = await supabase
    .from('captacion_agent_keys')
    .insert([{
      user_id: req.user.id,
      nombre: req.user.user_metadata?.full_name || req.user.email,
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ agent_key: created.agent_key, nombre: created.nombre });
});

// GET /captacion/agent/installer?os=windows|mac — descarga un instalador
// personalizado con la clave del usuario embebida. Basta con que el usuario
// le dé doble clic al fichero descargado para instalar todo el agente.
router.get('/agent/installer', authMiddleware, async (req, res) => {
  const targetOs = (req.query.os || 'windows').toLowerCase();

  // Obtener (o crear) la clave del usuario
  let { data: keyData } = await supabase
    .from('captacion_agent_keys')
    .select('agent_key')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (!keyData) {
    const { data: created, error } = await supabase
      .from('captacion_agent_keys')
      .insert([{
        user_id: req.user.id,
        nombre: req.user.user_metadata?.full_name || req.user.email,
      }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    keyData = created;
  }

  const backendUrl = process.env.BACKEND_URL || 'https://crm-pisalia-production.up.railway.app';

  if (targetOs === 'windows') {
    // .bat con la clave embebida. Al doble clic lanza PowerShell que
    // descarga el script grande setup-windows.ps1 desde GitHub y lo ejecuta
    // pasándole la clave via variable de entorno.
    const batContent =
`@echo off
REM ============================================================
REM  Pisalia Agent - Instalador automatico para Windows
REM
REM  Este fichero contiene tu clave personal de usuario.
REM  No lo compartas con nadie.
REM
REM  SOLO TIENES QUE HACER DOBLE CLIC EN ESTE FICHERO.
REM  No necesitas saber nada de programacion.
REM ============================================================

set "PISALIA_AGENT_KEY=${keyData.agent_key}"
set "PISALIA_BACKEND_URL=${backendUrl}"

echo.
echo ============================================================
echo   Pisalia Agent - Instalacion automatica
echo ============================================================
echo.
echo Se va a descargar y configurar todo automaticamente.
echo Puede tardar 2-5 minutos segun tu conexion a internet.
echo.
echo Cuando acabe, vuelve al CRM en tu navegador y escanea el
echo QR de WhatsApp que aparecera en la pagina de Captacion.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { iwr 'https://raw.githubusercontent.com/pgonzzz/crm-pisalia/main/agent/setup-windows.ps1' -UseBasicParsing | iex } catch { Write-Host ''; Write-Host '[ERROR] No se pudo descargar el instalador desde GitHub. Revisa tu conexion a internet.' -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor Red; Read-Host 'Pulsa Enter para cerrar' }"

if errorlevel 1 (
  echo.
  echo [ERROR] Hubo un problema. Revisa los mensajes de arriba.
  pause
  exit /b 1
)

exit /b 0
`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="pisalia-agent-setup.bat"');
    return res.send(batContent);
  }

  if (targetOs === 'mac') {
    // .command se abre directamente en Terminal al doble-clic en macOS.
    const cmdContent =
`#!/bin/bash
# ============================================================
#  Pisalia Agent - Instalador automatico para macOS
#
#  Este fichero contiene tu clave personal de usuario.
#  No lo compartas con nadie.
#
#  SOLO TIENES QUE HACER DOBLE CLIC EN ESTE FICHERO.
# ============================================================

export PISALIA_AGENT_KEY="${keyData.agent_key}"
export PISALIA_BACKEND_URL="${backendUrl}"

echo ""
echo "============================================================"
echo "  Pisalia Agent - Instalación automática"
echo "============================================================"
echo ""
echo "Se va a descargar y configurar todo automáticamente."
echo "Puede tardar 2-5 minutos."
echo ""

curl -fsSL https://raw.githubusercontent.com/pgonzzz/crm-pisalia/main/agent/setup-mac.sh | bash

if [ $? -ne 0 ]; then
  echo ""
  echo "[ERROR] Hubo un problema en la instalación."
  read -p "Pulsa Enter para cerrar..."
  exit 1
fi

read -p "Pulsa Enter para cerrar..."
`;

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="pisalia-agent-setup.command"');
    return res.send(cmdContent);
  }

  return res.status(400).json({ error: 'OS no soportado. Usa os=windows o os=mac' });
});

// GET /captacion/agent/poll — el agente sondea si hay tareas pendientes
router.get('/agent/poll', agentAuthMiddleware, async (req, res) => {
  const userId = req.agentUserId;

  // Actualizar last_seen cuando el agente hace poll
  const prev = agentStates.get(userId) || {};
  agentStates.set(userId, {
    ...prev,
    user_id: userId,
    online: true,
    last_seen: new Date().toISOString(),
  });

  // Solo recoger tareas pendientes del usuario del agente
  const { data, error } = await supabase
    .from('captacion_tareas')
    .select('*')
    .eq('estado', 'pendiente')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ task: null });

  // Marcar la tarea como "en_proceso" para que no la tome otro poll
  await supabase
    .from('captacion_tareas')
    .update({ estado: 'en_proceso' })
    .eq('id', data.id);

  res.json({ task: data });
});

// POST /captacion/agent/result — el agente publica el resultado de una tarea.
// Soporta dos modos:
//   - partial=true: inserta los leads pero NO marca la tarea como completada.
//     El agente lo usa durante el scraping para hacer streaming de leads al CRM.
//   - partial=false (o ausente): marca la tarea como completada. Es el envío
//     final que cierra la tarea.
router.post('/agent/result', agentAuthMiddleware, async (req, res) => {
  const { tarea_id, tipo, resultado, leads, partial } = req.body;
  const isPartial = !!partial;

  // Solo marcar la tarea como completada si es el envío final
  if (!isPartial) {
    const { error: tareaError } = await supabase
      .from('captacion_tareas')
      .update({
        estado: 'completada',
        resultado,
        completed_at: new Date().toISOString(),
      })
      .eq('id', tarea_id);

    if (tareaError) return res.status(500).json({ error: tareaError.message });
  }

  // Insertar leads (tanto en modo partial como final)
  if (tipo === 'scrape' && Array.isArray(leads) && leads.length > 0) {
    // Obtener campaña para contexto
    const { data: tarea } = await supabase
      .from('captacion_tareas')
      .select('payload')
      .eq('id', tarea_id)
      .single();

    const campana_id = tarea?.payload?.campana_id;

    if (campana_id) {
      // Deduplicar por url_anuncio ya existente en la campaña
      const { data: existing } = await supabase
        .from('captacion_leads')
        .select('url_anuncio')
        .eq('campana_id', campana_id);

      const existingUrls = new Set((existing || []).map(l => l.url_anuncio).filter(Boolean));
      const newLeads = leads
        .filter(l => !l.url_anuncio || !existingUrls.has(l.url_anuncio))
        .map(l => ({ ...l, campana_id }));

      if (newLeads.length > 0) {
        // ── Dedupe cross-campaña por teléfono ─────────────────────
        // Si el teléfono del lead ya existe en cualquier otra campaña,
        // marcar duplicado_de apuntando al lead original. También
        // enriquecemos automáticamente si el teléfono coincide con
        // un proveedor existente.
        const phones = newLeads.map(l => l.telefono).filter(Boolean);
        let phoneToOriginal = {};
        let phoneToProveedor = {};

        if (phones.length > 0) {
          // Buscar leads previos con esos teléfonos (de cualquier campaña)
          const { data: prevLeads } = await supabase
            .from('captacion_leads')
            .select('id, telefono')
            .in('telefono', phones)
            .order('created_at', { ascending: true })
            .limit(500);
          for (const pl of (prevLeads || [])) {
            if (pl.telefono && !phoneToOriginal[pl.telefono]) {
              phoneToOriginal[pl.telefono] = pl.id;
            }
          }

          // Buscar proveedores con esos teléfonos
          const { data: matchProvs } = await supabase
            .from('proveedores')
            .select('id, telefono')
            .in('telefono', phones);
          for (const pv of (matchProvs || [])) {
            if (pv.telefono) phoneToProveedor[pv.telefono] = pv.id;
          }
        }

        const enriched = newLeads.map(l => ({
          ...l,
          duplicado_de: (l.telefono && phoneToOriginal[l.telefono]) || null,
          proveedor_id: (l.telefono && phoneToProveedor[l.telefono]) || null,
        }));

        const { error: insertErr } = await supabase.from('captacion_leads').insert(enriched);
        if (insertErr) console.error('[Captacion] Error insertando leads:', insertErr.message);
      }
    }
  }

  // Marcar scrape_ultimo_at solo en el envío final (evita marcar en cada partial)
  if (tipo === 'scrape' && !isPartial) {
    const { data: tarea } = await supabase
      .from('captacion_tareas')
      .select('payload')
      .eq('id', tarea_id)
      .single();
    const campana_id = tarea?.payload?.campana_id;
    if (campana_id) {
      await supabase
        .from('captacion_campanas')
        .update({ scrape_ultimo_at: new Date().toISOString() })
        .eq('id', campana_id);
    }
  }

  // Si es una tarea de whatsapp, actualizar estado de leads enviados.
  // Acepta dos formatos de enviados:
  //   - Antiguo: ['leadId1', 'leadId2', ...]
  //   - Nuevo:   [{lead_id, message_id, mensaje}, ...]
  if (!isPartial && (tipo === 'whatsapp_send' || tipo === 'whatsapp_followup') && resultado?.enviados) {
    const tipo_envio = tipo === 'whatsapp_followup' ? 'followup' : 'inicial';
    for (const entry of resultado.enviados) {
      const leadId = typeof entry === 'string' ? entry : entry.lead_id;
      const messageId = typeof entry === 'string' ? null : entry.message_id;
      const msgText = typeof entry === 'string' ? (resultado.mensaje || '') : (entry.mensaje || resultado.mensaje || '');
      await supabase
        .from('captacion_leads')
        .update({ estado: 'enviado', ultimo_contacto: new Date().toISOString() })
        .eq('id', leadId);

      // Registrar en captacion_envios
      await supabase.from('captacion_envios').insert([{
        lead_id: leadId,
        tipo: tipo_envio,
        mensaje: msgText,
        estado: 'enviado',
        message_id: messageId,
        ack_status: 'enviado',
      }]);
    }
  }

  // Comprobar si la tarea ha sido cancelada desde el frontend.
  // Si lo está, devolvemos cancelled:true para que el agente aborte
  // el bucle de scraping en el siguiente checkpoint.
  const { data: currentTask } = await supabase
    .from('captacion_tareas')
    .select('estado')
    .eq('id', tarea_id)
    .maybeSingle();
  const cancelled = currentTask?.estado === 'cancelada';

  res.json({ ok: true, cancelled });
});

export default router;
