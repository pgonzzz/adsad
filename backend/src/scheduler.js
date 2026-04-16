/**
 * Scheduler de captación — corre dentro del proceso del backend (Railway).
 *
 * Cada TICK_MS revisa todas las campañas en estado 'activa' y crea tareas
 * automáticamente:
 *
 *   - `scrape`            si scrape_auto=true y ha pasado el intervalo
 *   - `whatsapp_send`     si wa_auto_enviar=true y hay leads nuevos con tel
 *   - `whatsapp_followup` si followup_auto=true y hay enviados > dias_followup
 *
 * El agente local recoge las tareas vía /api/captacion/agent/poll como
 * hasta ahora — el scheduler solo las encola, no ejecuta scraping él mismo.
 */

import supabase from './db/supabase.js';
import { processScheduledPosts } from './routes/telegram.js';
import { processReminders } from './routes/recordatorios.js';

const TICK_MS = parseInt(process.env.SCHEDULER_TICK_MS || '', 10) || 10 * 60 * 1000; // 10 min
const FIRST_TICK_DELAY_MS = 30 * 1000; // 30s para no competir con el arranque

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * ¿Existe ya una tarea pendiente/en_proceso del mismo tipo para esta campaña?
 * Se usa para no duplicar tareas si el agente aún no ha procesado la anterior.
 *
 * Hace el filtrado por campana_id en JS sobre el JSONB payload — así evitamos
 * depender de la sintaxis JSONB de postgrest y es suficientemente rápido
 * porque las tareas pendientes suelen ser pocas (< decenas).
 */
async function existePendiente(campana_id, tipo) {
  const { data, error } = await supabase
    .from('captacion_tareas')
    .select('id, payload')
    .eq('tipo', tipo)
    .in('estado', ['pendiente', 'en_proceso']);

  if (error) {
    console.warn('[Scheduler] Error comprobando tareas pendientes:', error.message);
    return true; // por seguridad, asumimos que sí para no duplicar
  }

  return (data || []).some(t => t.payload?.campana_id === campana_id);
}

/** Valida un teléfono móvil español (acepta con/sin prefijo 34). */
function esMovilEs(tel) {
  if (!tel) return false;
  const limpio = String(tel).replace(/\s+/g, '').replace(/^\+?34/, '');
  return /^[67]\d{8}$/.test(limpio);
}

// ─── Scrape automático ────────────────────────────────────────────────────────

async function checkScrapeAuto(campana) {
  if (!campana.scrape_auto) return;

  const intervaloMs = (campana.scrape_intervalo_horas || 24) * 3600 * 1000;
  const ultimoMs = campana.scrape_ultimo_at ? new Date(campana.scrape_ultimo_at).getTime() : 0;
  if (Date.now() - ultimoMs < intervaloMs) return;

  if (await existePendiente(campana.id, 'scrape')) {
    console.log(`[Scheduler] Campaña "${campana.nombre}": scrape ya pendiente, skip`);
    return;
  }

  const payload = {
    campana_id: campana.id,
    url_inicial: campana.url_inicial || null,
    poblacion: campana.poblacion,
    provincia: campana.provincia,
    tipo: campana.tipo,
    precio_min: campana.precio_min,
    precio_max: campana.precio_max,
    max_paginas: campana.max_paginas || 3,
  };

  const { error } = await supabase
    .from('captacion_tareas')
    .insert([{ tipo: 'scrape', payload, estado: 'pendiente', user_id: campana.user_id }]);

  if (error) {
    console.warn('[Scheduler] Error creando scrape auto:', error.message);
    return;
  }

  // Marcar ultimo_at aunque aún no haya ejecutado, para no re-crearla en el
  // siguiente tick mientras el agente la procesa
  await supabase
    .from('captacion_campanas')
    .update({ scrape_ultimo_at: new Date().toISOString() })
    .eq('id', campana.id);

  console.log(`[Scheduler] ✓ Scrape auto encolado — "${campana.nombre}"`);
}

// ─── WhatsApp inicial automático ──────────────────────────────────────────────

async function checkWaAuto(campana) {
  if (!campana.wa_auto_enviar) return;

  const { data: leads, error } = await supabase
    .from('captacion_leads')
    .select('id, telefono, nombre_vendedor, precio, poblacion, tipo, url_anuncio, estado')
    .eq('campana_id', campana.id)
    .eq('estado', 'nuevo')
    .not('telefono', 'is', null);

  if (error) {
    console.warn('[Scheduler] Error leyendo leads nuevos:', error.message);
    return;
  }

  const candidatos = (leads || []).filter(l => esMovilEs(l.telefono));
  if (candidatos.length === 0) return;

  if (await existePendiente(campana.id, 'whatsapp_send')) {
    console.log(`[Scheduler] Campaña "${campana.nombre}": whatsapp_send ya pendiente, skip`);
    return;
  }

  const payload = {
    campana_id: campana.id,
    leads: candidatos,
    plantilla_mensaje: campana.plantilla_mensaje,
  };

  const { error: insErr } = await supabase
    .from('captacion_tareas')
    .insert([{ tipo: 'whatsapp_send', payload, estado: 'pendiente', user_id: campana.user_id }]);

  if (insErr) {
    console.warn('[Scheduler] Error creando whatsapp_send auto:', insErr.message);
    return;
  }

  console.log(`[Scheduler] ✓ WhatsApp auto encolado — "${campana.nombre}" (${candidatos.length} leads)`);
}

// ─── Follow-up automático ─────────────────────────────────────────────────────

async function checkFollowupAuto(campana) {
  if (!campana.followup_auto) return;

  const dias = campana.dias_followup || 3;
  const cutoffIso = new Date(Date.now() - dias * 24 * 3600 * 1000).toISOString();

  const { data: leads, error } = await supabase
    .from('captacion_leads')
    .select('id, telefono, nombre_vendedor, precio, poblacion, tipo, url_anuncio, estado, ultimo_contacto')
    .eq('campana_id', campana.id)
    .eq('estado', 'enviado')
    .not('telefono', 'is', null)
    .lt('ultimo_contacto', cutoffIso);

  if (error) {
    console.warn('[Scheduler] Error leyendo leads para follow-up:', error.message);
    return;
  }

  const candidatos = (leads || []).filter(l => esMovilEs(l.telefono));
  if (candidatos.length === 0) return;

  if (await existePendiente(campana.id, 'whatsapp_followup')) {
    console.log(`[Scheduler] Campaña "${campana.nombre}": whatsapp_followup ya pendiente, skip`);
    return;
  }

  const payload = {
    campana_id: campana.id,
    leads: candidatos,
    plantilla_mensaje: campana.plantilla_followup || campana.plantilla_mensaje,
  };

  const { error: insErr } = await supabase
    .from('captacion_tareas')
    .insert([{ tipo: 'whatsapp_followup', payload, estado: 'pendiente', user_id: campana.user_id }]);

  if (insErr) {
    console.warn('[Scheduler] Error creando whatsapp_followup auto:', insErr.message);
    return;
  }

  console.log(`[Scheduler] ✓ Follow-up auto encolado — "${campana.nombre}" (${candidatos.length} leads)`);
}

// ─── Tick principal ───────────────────────────────────────────────────────────

async function tick() {
  try {
    const { data: campanas, error } = await supabase
      .from('captacion_campanas')
      .select('*')
      .eq('estado', 'activa');

    if (error) {
      console.warn('[Scheduler] Error leyendo campañas activas:', error.message);
      return;
    }

    if (!campanas || campanas.length === 0) {
      return;
    }

    const conAuto = campanas.filter(c => c.scrape_auto || c.wa_auto_enviar || c.followup_auto);
    if (conAuto.length === 0) return;

    console.log(`[Scheduler] Tick — ${conAuto.length}/${campanas.length} campañas con automatización activa`);

    for (const campana of conAuto) {
      await checkScrapeAuto(campana);
      await checkWaAuto(campana);
      await checkFollowupAuto(campana);
    }
  } catch (err) {
    console.error('[Scheduler] Error en tick:', err.message);
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function startScheduler() {
  console.log(`[Scheduler] Iniciado — tick cada ${TICK_MS / 60000} min`);
  setTimeout(() => {
    tick();
    setInterval(tick, TICK_MS);
  }, FIRST_TICK_DELAY_MS);

  // Posts programados de Telegram + recordatorios — revisión cada 60s
  setInterval(() => {
    processScheduledPosts().catch(err =>
      console.warn('[Scheduler/Telegram] Error:', err.message)
    );
    processReminders().catch(err =>
      console.warn('[Scheduler/Reminders] Error:', err.message)
    );
  }, 60 * 1000);
}
