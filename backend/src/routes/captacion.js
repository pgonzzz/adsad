import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

// ─── In-memory agent state ────────────────────────────────────────────────────
let agentState = {
  online: false,
  whatsapp_connected: false,
  qr_code: null,
  last_seen: null,
};

// ─── Helper: verify agent key ─────────────────────────────────────────────────
const AGENT_KEY = process.env.AGENT_KEY || 'captacion-agent-2024';

function checkAgentKey(req, res) {
  const key = req.headers['x-agent-key'] || req.query.agent_key;
  if (key !== AGENT_KEY) {
    res.status(401).json({ error: 'Agent key inválida' });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAÑAS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /captacion/campanas — lista campañas con conteo de leads
router.get('/campanas', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(id, estado)')
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

// POST /captacion/campanas — crear campaña
router.post('/campanas', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /captacion/campanas/:id — campaña con leads
router.get('/campanas/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .select('*, captacion_leads(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /captacion/campanas/:id — actualizar campaña
router.put('/campanas/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_campanas')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /captacion/campanas/:id — eliminar campaña
router.delete('/campanas/:id', async (req, res) => {
  const { error } = await supabase
    .from('captacion_campanas')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEADS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /captacion/leads — listar leads (filtros: campana_id, estado)
router.get('/leads', async (req, res) => {
  let query = supabase
    .from('captacion_leads')
    .select('*, captacion_campanas(nombre, portal)')
    .order('created_at', { ascending: false });

  if (req.query.campana_id) query = query.eq('campana_id', req.query.campana_id);
  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /captacion/leads — crear lead
router.post('/leads', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_leads')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// POST /captacion/leads/bulk — inserción masiva de leads
router.post('/leads/bulk', async (req, res) => {
  const leads = req.body; // array
  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'Se esperaba un array de leads' });
  }

  // Deduplicar por url_anuncio dentro del mismo campana_id
  const { data: existing } = await supabase
    .from('captacion_leads')
    .select('url_anuncio')
    .eq('campana_id', leads[0].campana_id);

  const existingUrls = new Set((existing || []).map(l => l.url_anuncio).filter(Boolean));
  const newLeads = leads.filter(l => !l.url_anuncio || !existingUrls.has(l.url_anuncio));

  if (newLeads.length === 0) {
    return res.json({ inserted: 0, duplicates: leads.length });
  }

  const { data, error } = await supabase
    .from('captacion_leads')
    .insert(newLeads)
    .select();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ inserted: data.length, duplicates: leads.length - data.length, leads: data });
});

// PUT /captacion/leads/:id — actualizar estado/notas de un lead
router.put('/leads/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_leads')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /captacion/leads/:id — eliminar lead
router.delete('/leads/:id', async (req, res) => {
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
router.post('/tareas', async (req, res) => {
  const { data, error } = await supabase
    .from('captacion_tareas')
    .insert([{ ...req.body, estado: 'pendiente' }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /captacion/agent/heartbeat — el agente envía su estado cada 10s
router.post('/agent/heartbeat', async (req, res) => {
  if (!checkAgentKey(req, res)) return;

  const { whatsapp_connected, qr_code } = req.body;
  agentState = {
    online: true,
    whatsapp_connected: !!whatsapp_connected,
    qr_code: qr_code || null,
    last_seen: new Date().toISOString(),
  };

  res.json({ ok: true });
});

// GET /captacion/agent/status — estado actual del agente (para el frontend)
router.get('/agent/status', async (req, res) => {
  // Si el último heartbeat fue hace más de 30s, marcar offline
  const isOnline = agentState.last_seen
    ? (Date.now() - new Date(agentState.last_seen).getTime()) < 30000
    : false;

  res.json({
    ...agentState,
    online: isOnline,
  });
});

// GET /captacion/agent/poll — el agente sondea si hay tareas pendientes
router.get('/agent/poll', async (req, res) => {
  if (!checkAgentKey(req, res)) return;

  // Actualizar last_seen cuando el agente hace poll
  agentState.last_seen = new Date().toISOString();
  agentState.online = true;

  const { data, error } = await supabase
    .from('captacion_tareas')
    .select('*')
    .eq('estado', 'pendiente')
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

// POST /captacion/agent/result — el agente publica el resultado de una tarea
router.post('/agent/result', async (req, res) => {
  if (!checkAgentKey(req, res)) return;

  const { tarea_id, tipo, resultado, leads } = req.body;

  // Marcar tarea completada
  const { error: tareaError } = await supabase
    .from('captacion_tareas')
    .update({
      estado: 'completada',
      resultado,
      completed_at: new Date().toISOString(),
    })
    .eq('id', tarea_id);

  if (tareaError) return res.status(500).json({ error: tareaError.message });

  // Si es una tarea de scraping, insertar los leads devueltos
  if (tipo === 'scrape' && Array.isArray(leads) && leads.length > 0) {
    // Obtener campaña para contexto
    const { data: tarea } = await supabase
      .from('captacion_tareas')
      .select('payload')
      .eq('id', tarea_id)
      .single();

    const campana_id = tarea?.payload?.campana_id;

    if (campana_id) {
      // Deduplicar
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

  // Si es una tarea de whatsapp, actualizar estado de leads enviados
  if ((tipo === 'whatsapp_send' || tipo === 'whatsapp_followup') && resultado?.enviados) {
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
