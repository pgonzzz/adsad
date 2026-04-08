/**
 * Captación Agent — Pisalia CRM
 *
 * Se ejecuta en un PC dedicado y:
 * 1. Mantiene un heartbeat con el backend cada 10s
 * 2. Sondea el backend cada 5s en busca de tareas pendientes
 * 3. Ejecuta tareas de scraping (Idealista) o WhatsApp
 * 4. Inicializa el cliente de WhatsApp y expone el QR para el CRM
 */

const axios = require('axios');
const { BACKEND_URL, AGENT_KEY, POLL_INTERVAL, HEARTBEAT_INTERVAL } = require('./config');
const { scrapeIdealista } = require('./scraper/idealista');
const { initWhatsApp, sendMessage, isConnected, getCurrentQR } = require('./whatsapp/client');

// ─── Estado local ─────────────────────────────────────────────────────────────
let currentQRBase64 = null;
let taskRunning = false;

// ─── Axios instance con el agent key en headers ───────────────────────────────
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { 'x-agent-key': AGENT_KEY },
  timeout: 30000,
});

// ─── Heartbeat ────────────────────────────────────────────────────────────────
async function sendHeartbeat() {
  try {
    await api.post('/api/captacion/agent/heartbeat', {
      whatsapp_connected: isConnected(),
      qr_code: getCurrentQR() || currentQRBase64,
    });
  } catch (err) {
    console.warn('[Heartbeat] Error:', err.message);
  }
}

// ─── Ejecutar tarea de scraping ───────────────────────────────────────────────
async function handleScrapeTask(tarea) {
  const payload = tarea.payload || {};
  console.log('[Task] Iniciando scraping para campaña:', payload.campana_id);

  let leads = [];
  let error = null;

  try {
    leads = await scrapeIdealista({
      poblacion: payload.poblacion,
      provincia: payload.provincia,
      tipo: payload.tipo,
      precio_min: payload.precio_min,
      precio_max: payload.precio_max,
      maxPages: payload.max_paginas || 3,
    });
  } catch (err) {
    error = err.message;
    console.error('[Task] Error en scraping:', err.message);
  }

  // Reportar resultado al backend
  await api.post('/api/captacion/agent/result', {
    tarea_id: tarea.id,
    tipo: 'scrape',
    resultado: {
      total: leads.length,
      error: error || null,
    },
    leads,
  });

  console.log(`[Task] Scraping completado. ${leads.length} leads enviados al backend.`);
}

// ─── Ejecutar tarea de envío WhatsApp ─────────────────────────────────────────
async function handleWhatsAppTask(tarea) {
  const payload = tarea.payload || {};
  const tipo = tarea.tipo; // 'whatsapp_send' o 'whatsapp_followup'

  console.log(`[Task] Iniciando ${tipo} para ${(payload.leads || []).length} leads`);

  if (!isConnected()) {
    console.error('[Task] WhatsApp no conectado, no se puede enviar.');
    await api.post('/api/captacion/agent/result', {
      tarea_id: tarea.id,
      tipo,
      resultado: { error: 'WhatsApp no conectado', enviados: [], fallidos: [] },
    });
    return;
  }

  const leads = payload.leads || [];
  const plantilla = payload.plantilla_mensaje || 'Hola {{nombre}}, te contacto por tu anuncio de {{tipo}} en {{poblacion}}.';
  const enviados = [];
  const fallidos = [];

  for (const lead of leads) {
    if (!lead.telefono) {
      fallidos.push(lead.id);
      continue;
    }

    // Rellenar plantilla con datos del lead
    const mensaje = plantilla
      .replace(/{{nombre}}/g, lead.nombre_vendedor || 'propietario')
      .replace(/{{precio}}/g, lead.precio ? `${lead.precio.toLocaleString('es-ES')}€` : '')
      .replace(/{{poblacion}}/g, lead.poblacion || '')
      .replace(/{{tipo}}/g, lead.tipo || 'inmueble')
      .replace(/{{url}}/g, lead.url_anuncio || '');

    const ok = await sendMessage(lead.telefono, mensaje);

    if (ok) {
      enviados.push(lead.id);
    } else {
      fallidos.push(lead.id);
    }

    // Pausa entre mensajes para evitar bloqueo de WA
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }

  // Reportar resultado
  await api.post('/api/captacion/agent/result', {
    tarea_id: tarea.id,
    tipo,
    resultado: {
      enviados,
      fallidos,
      total: leads.length,
      mensaje: plantilla,
    },
  });

  console.log(`[Task] ${tipo} completado. Enviados: ${enviados.length}, Fallidos: ${fallidos.length}`);
}

// ─── Poll loop ────────────────────────────────────────────────────────────────
async function poll() {
  if (taskRunning) return; // No tomar otra tarea si ya hay una corriendo

  try {
    const { data } = await api.get('/api/captacion/agent/poll');

    if (!data.task) return; // Sin tareas pendientes

    const tarea = data.task;
    console.log(`[Poll] Tarea recibida: ${tarea.tipo} (id: ${tarea.id})`);

    taskRunning = true;
    try {
      if (tarea.tipo === 'scrape') {
        await handleScrapeTask(tarea);
      } else if (tarea.tipo === 'whatsapp_send' || tarea.tipo === 'whatsapp_followup') {
        await handleWhatsAppTask(tarea);
      } else {
        console.warn('[Poll] Tipo de tarea desconocido:', tarea.tipo);
      }
    } finally {
      taskRunning = false;
    }

  } catch (err) {
    console.warn('[Poll] Error:', err.message);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=================================================');
  console.log('  Captación Agent — Pisalia CRM');
  console.log(`  Backend: ${BACKEND_URL}`);
  console.log('=================================================');

  // 1. Inicializar WhatsApp
  console.log('[WA] Iniciando cliente WhatsApp...');
  initWhatsApp(
    (qrBase64) => {
      // Guardar QR para incluirlo en el próximo heartbeat
      currentQRBase64 = qrBase64;
      console.log('[WA] QR generado y enviado al CRM.');
    },
    () => {
      // WhatsApp listo
      currentQRBase64 = null;
      console.log('[WA] WhatsApp listo para enviar mensajes.');
    }
  );

  // 2. Esperar un poco para que WhatsApp se inicialice antes del primer heartbeat
  await new Promise(r => setTimeout(r, 3000));

  // 3. Heartbeat inicial
  await sendHeartbeat();

  // 4. Iniciar heartbeat periódico
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

  // 5. Iniciar loop de polling
  setInterval(poll, POLL_INTERVAL);

  console.log('[Agent] Agente en funcionamiento. Esperando tareas...');
}

main().catch(err => {
  console.error('[Agent] Error fatal:', err);
  process.exit(1);
});
