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
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { BACKEND_URL, AGENT_KEY, POLL_INTERVAL, HEARTBEAT_INTERVAL } = require('./config');
const { scrapeIdealista } = require('./scraper/idealista');
const { initWhatsApp, sendMessage, isConnected, getCurrentQR } = require('./whatsapp/client');

// ─── Estado local ─────────────────────────────────────────────────────────────
let currentQRBase64 = null;
let taskRunning = false;

// ─── Control de envíos WhatsApp ───────────────────────────────────────────────
const DAILY_LIMIT = 50;
const SEND_HOUR_START = 8;   // 8:00 hora España
const SEND_HOUR_END = 18;    // 18:00 hora España
const DELAY_MIN_MS = 3 * 60 * 1000;  // 3 min mínimo entre mensajes
const DELAY_MAX_MS = 8 * 60 * 1000;  // 8 min máximo entre mensajes
const COUNTER_FILE = path.join(__dirname, '.daily_count.json');

function getSpainHour() {
  // Calcula la hora actual en España (Europe/Madrid)
  const now = new Date();
  const spainStr = now.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false });
  return parseInt(spainStr, 10);
}

function getTodayES() {
  return new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
}

function readDailyCount() {
  try {
    const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    if (data.date === getTodayES()) return data.count;
  } catch (_) {}
  return 0;
}

function writeDailyCount(count) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ date: getTodayES(), count }), 'utf8');
}

function isWithinSendWindow() {
  const hour = getSpainHour();
  return hour >= SEND_HOUR_START && hour < SEND_HOUR_END;
}

function randomDelay() {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

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
      qr_code: currentQRBase64,
    });
  } catch (err) {
    console.warn('[Heartbeat] Error:', err.message);
  }
}

// ─── Chrome on-demand (cross-platform) ──────────────────────────────────────
// Lanza Chrome con el puerto de debugging (9222) solo cuando hay una tarea
// pendiente. Funciona en macOS, Windows y Linux detectando el binario de
// Chrome según el sistema operativo. No depende de scripts .sh ni .bat.

const os = require('os');

function isPort9222Open(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(val);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.connect(9222, '127.0.0.1');
  });
}

/**
 * Localiza el binario de Chrome en el sistema actual.
 * Devuelve la ruta absoluta o null si no lo encuentra.
 */
function findChromePath() {
  const platform = process.platform;

  // macOS
  if (platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // Windows
  if (platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['ProgramFiles'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }

  // Linux
  if (platform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  return null;
}

async function ensureChromeRunning() {
  // Ya corre: nada que hacer
  if (await isPort9222Open()) {
    console.log('[Chrome] Ya está corriendo en puerto 9222.');
    return;
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('[Chrome] No se encontró Google Chrome instalado en este sistema.');
    console.error('[Chrome] Instálalo desde https://www.google.com/chrome y reintenta.');
    return;
  }

  // Directorio de perfil dedicado (no toca el Chrome normal del usuario)
  const userDataDir = path.join(os.homedir(), '.chrome-scraper');
  const args = [
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    'https://www.idealista.com',
  ];

  console.log(`[Chrome] No está corriendo. Lanzando: ${chromePath}`);
  try {
    const child = spawn(chromePath, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false, // queremos que la ventana sea visible
    });
    child.unref();
  } catch (err) {
    console.error('[Chrome] Error lanzando Chrome:', err.message);
    return;
  }

  // Esperar a que el puerto esté listo (hasta 30s, poll cada 500ms)
  const maxWaitMs = 30000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isPort9222Open()) {
      console.log(`[Chrome] Listo tras ${Math.round((Date.now() - start) / 1000)}s.`);
      // Pequeño buffer adicional para que idealista.com cargue
      await new Promise(r => setTimeout(r, 2000));
      return;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  console.warn('[Chrome] Timeout esperando a que arranque (30s). El scraper intentará conectarse igualmente.');
}

// ─── Ejecutar tarea de scraping ───────────────────────────────────────────────
async function handleScrapeTask(tarea) {
  const payload = tarea.payload || {};
  console.log('[Task] Iniciando scraping para campaña:', payload.campana_id);

  // Asegurar que Chrome está corriendo antes de lanzar el scraper
  await ensureChromeRunning();

  let leads = [];
  let error = null;

  try {
    // Callback de streaming: enviar cada lead al CRM en cuanto se scrapea
    const onLead = async (lead) => {
      try {
        await api.post('/api/captacion/agent/result', {
          tarea_id: tarea.id,
          tipo: 'scrape',
          partial: true,
          leads: [lead],
        });
      } catch (err) {
        console.warn('[Task] Error enviando lead parcial:', err.message);
      }
    };

    leads = await scrapeIdealista({
      url_inicial: payload.url_inicial,
      poblacion: payload.poblacion,
      provincia: payload.provincia,
      tipo: payload.tipo,
      precio_min: payload.precio_min,
      precio_max: payload.precio_max,
      maxPages: payload.max_paginas || 3,
    }, onLead);
  } catch (err) {
    error = err.message;
    console.error('[Task] Error en scraping:', err.message);
  }

  // Reportar resultado final (marca la tarea como completada).
  // Los leads ya se han ido insertando uno a uno via partial=true,
  // así que NO los re-enviamos aquí para evitar dedupe innecesario.
  await api.post('/api/captacion/agent/result', {
    tarea_id: tarea.id,
    tipo: 'scrape',
    resultado: {
      total: leads.length,
      error: error || null,
    },
    leads: [],
  });

  console.log(`[Task] Scraping completado. ${leads.length} leads enviados al backend en streaming.`);
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
  const omitidos = [];

  let dailyCount = readDailyCount();

  for (const lead of leads) {
    // — Solo follow-up a leads que NO han respondido —
    if (tipo === 'whatsapp_followup' && lead.estado === 'respondido') {
      omitidos.push(lead.id);
      continue;
    }

    if (!lead.telefono) {
      fallidos.push(lead.id);
      continue;
    }

    // — Límite diario —
    if (dailyCount >= DAILY_LIMIT) {
      console.warn(`[WA] Límite diario de ${DAILY_LIMIT} mensajes alcanzado. Parando.`);
      omitidos.push(...leads.slice(leads.indexOf(lead)).map(l => l.id));
      break;
    }

    // — Franja horaria 8:00–18:00 hora España —
    if (!isWithinSendWindow()) {
      console.warn(`[WA] Fuera de horario de envío (8:00–18:00). Hora España: ${getSpainHour()}h. Parando.`);
      omitidos.push(...leads.slice(leads.indexOf(lead)).map(l => l.id));
      break;
    }

    // — Rellenar plantilla con datos del lead —
    const mensaje = plantilla
      .replace(/{{nombre}}/g, lead.nombre_vendedor || 'propietario')
      .replace(/{{precio}}/g, lead.precio ? `${lead.precio.toLocaleString('es-ES')}€` : '')
      .replace(/{{poblacion}}/g, lead.poblacion || '')
      .replace(/{{tipo}}/g, lead.tipo || 'inmueble')
      .replace(/{{url}}/g, lead.url_anuncio || '');

    const ok = await sendMessage(lead.telefono, mensaje);

    if (ok) {
      enviados.push(lead.id);
      dailyCount++;
      writeDailyCount(dailyCount);
      console.log(`[WA] ✓ Enviado a ${lead.telefono} (${dailyCount}/${DAILY_LIMIT} hoy)`);
    } else {
      fallidos.push(lead.id);
    }

    // — Pausa aleatoria entre 3 y 8 minutos —
    if (leads.indexOf(lead) < leads.length - 1) {
      const delay = randomDelay();
      console.log(`[WA] Esperando ${Math.round(delay / 60000)} min antes del siguiente mensaje...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Reportar resultado
  await api.post('/api/captacion/agent/result', {
    tarea_id: tarea.id,
    tipo,
    resultado: {
      enviados,
      fallidos,
      omitidos,
      total: leads.length,
      mensaje: plantilla,
    },
  });

  console.log(`[Task] ${tipo} completado. Enviados: ${enviados.length}, Fallidos: ${fallidos.length}, Omitidos: ${omitidos.length}`);
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
      currentQRBase64 = qrBase64;
      console.log('[WA] QR generado y enviado al CRM.');
    },
    () => {
      currentQRBase64 = null;
      console.log('[WA] WhatsApp listo para enviar mensajes.');
    },
    async (phone, body) => {
      // Alguien ha contestado — notificar al backend para marcar lead como 'respondido'
      try {
        await api.post('/api/captacion/leads/respuesta', { telefono: phone, mensaje: body });
        console.log(`[WA] Lead ${phone} marcado como respondido automáticamente.`);
      } catch (err) {
        console.warn(`[WA] No se pudo marcar lead ${phone} como respondido:`, err.message);
      }
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
