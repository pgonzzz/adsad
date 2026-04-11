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

  // Clave legacy → primer usuario del sistema (backward compat)
  if (key === LEGACY_AGENT_KEY || key === process.env.AGENT_KEY) {
    const { data } = await supabase
      .from('captacion_agent_keys')
      .select('user_id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.user_id || null;
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

// GET /captacion/campanas — lista campañas del usuario autenticado
router.get('/campanas', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(id, estado)')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  // Añadir conteos de leads por estado
  const campanas = data.map(c => {
    const leads = c.captacion_leads || [];
    return {
      ...c,
      captacion_leads: undefined,
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

// GET /captacion/campanas/:id — campaña con leads (solo si es del usuario)
router.get('/campanas/:id', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(*)')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /captacion/campanas/:id — actualizar (solo si es del usuario)
router.put('/campanas/:id', authMiddleware, async (req, res) => {
  // Nunca permitir cambiar user_id via update
  const { user_id, ...safeBody } = req.body;
  const { data, error } = await supabase
    .from('captacion_campanas')
    .update(safeBody)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /captacion/campanas/:id — eliminar (solo si es del usuario)
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

// GET /captacion/leads — listar leads del usuario (filtros: campana_id, estado)
router.get('/leads', authMiddleware, async (req, res) => {
  // Solo leads cuyas campañas pertenecen al usuario
  let query = supabase
    .from('captacion_leads')
    .select('*, captacion_campanas!inner(nombre, portal, user_id)')
    .eq('captacion_campanas.user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (req.query.campana_id) query = query.eq('campana_id', req.query.campana_id);
  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /captacion/leads — crear lead (manual, desde el frontend)
router.post('/leads', authMiddleware, async (req, res) => {
  // Verificar que la campaña pertenece al usuario
  if (req.body.campana_id) {
    const { data: campana } = await supabase
      .from('captacion_campanas')
      .select('user_id')
      .eq('id', req.body.campana_id)
      .single();
    if (!campana || campana.user_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta campaña' });
    }
  }
  const { data, error } = await supabase
    .from('captacion_leads')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /captacion/leads/:id — actualizar estado/notas (solo de sus campañas)
router.put('/leads/:id', authMiddleware, async (req, res) => {
  // Verificar que el lead pertenece a una campaña del usuario
  const { data: lead } = await supabase
    .from('captacion_leads')
    .select('campana_id, captacion_campanas(user_id)')
    .eq('id', req.params.id)
    .single();
  if (!lead || lead.captacion_campanas?.user_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a este lead' });
  }
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

// DELETE /captacion/leads/:id — eliminar lead (solo si es del usuario)
router.delete('/leads/:id', authMiddleware, async (req, res) => {
  // Verificar propiedad
  const { data: lead } = await supabase
    .from('captacion_leads')
    .select('captacion_campanas(user_id)')
    .eq('id', req.params.id)
    .single();
  if (!lead || lead.captacion_campanas?.user_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a este lead' });
  }
  const { error } = await supabase
    .from('captacion_leads')
    .delete()
    .eq('id', req.params.id);
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
  // Verificar que la campaña es del usuario
  const { data: campana } = await supabase
    .from('captacion_campanas')
    .select('user_id')
    .eq('id', campanaId)
    .single();
  if (!campana || campana.user_id !== req.user.id) {
    return res.status(403).json({ error: 'No tienes acceso a esta campaña' });
  }
  const { data, error } = await supabase
    .from('captacion_tareas')
    .insert([{ ...req.body, estado: 'pendiente', user_id: req.user.id }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /captacion/agent/heartbeat — el agente envía su estado cada 10s
router.post('/agent/heartbeat', agentAuthMiddleware, async (req, res) => {
  const { whatsapp_connected, qr_code } = req.body;
  agentStates.set(req.agentUserId, {
    user_id: req.agentUserId,
    online: true,
    whatsapp_connected: !!whatsapp_connected,
    qr_code: qr_code || null,
    last_seen: new Date().toISOString(),
  });
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

  const backendUrl = process.env.FRONTEND_URL
    ? 'https://crm-pisalia-production.up.railway.app'
    : 'https://crm-pisalia-production.up.railway.app';

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
        await supabase.from('captacion_leads').insert(newLeads);
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

  // Si es una tarea de whatsapp, actualizar estado de leads enviados
  if (!isPartial && (tipo === 'whatsapp_send' || tipo === 'whatsapp_followup') && resultado?.enviados) {
    const tipo_envio = tipo === 'whatsapp_followup' ? 'followup' : 'inicial';
    for (const leadId of resultado.enviados) {
      await supabase
        .from('captacion_leads')
        .update({ estado: 'enviado', ultimo_contacto: new Date().toISOString() })
        .eq('id', leadId);

      // Registrar en captacion_envios
      await supabase.from('captacion_envios').insert([{
        lead_id: leadId,
        tipo: tipo_envio,
        mensaje: resultado.mensaje || '',
        estado: 'enviado',
      }]);
    }
  }

  res.json({ ok: true });
});

export default router;
