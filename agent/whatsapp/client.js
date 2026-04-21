/**
 * WhatsApp client usando whatsapp-web.js
 * Gestiona la sesión, el QR code y el envío de mensajes.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

let client = null;
let connected = false;
let currentQR = null;
let onIncomingMessage = null; // callback para mensajes recibidos
let onMessageAck = null; // callback para actualizaciones de estado (enviado/entregado/leido)
// Guardamos los callbacks de init para poder re-inicializar el cliente tras
// un logout manual sin que el caller tenga que volver a pasarlos.
let savedOnQR = null;
let savedOnReady = null;
// Flag para distinguir una desconexión intencional (usuario pulsa "Desconectar"
// en el CRM) de una desconexión inesperada (sesión expirada, móvil desvinculado,
// etc.). En la intencional NO queremos cerrar el proceso.
let intentionalLogout = false;

/**
 * Inicializa el cliente de WhatsApp.
 * @param {(qrBase64: string) => void} onQR — llamado cuando hay un QR nuevo
 * @param {() => void} onReady — llamado cuando WA está listo para enviar mensajes
 * @param {(phone: string) => void} onMessage — llamado cuando se recibe un mensaje de un contacto
 * @param {(messageId: string, ackStatus: string) => void} onAck — llamado cuando cambia el ACK de un mensaje enviado
 */
function initWhatsApp(onQR, onReady, onMessage, onAck) {
  onIncomingMessage = onMessage;
  onMessageAck = onAck;
  savedOnQR = onQR;
  savedOnReady = onReady;
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa_session' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // QR generado — mostrarlo en terminal y enviar al backend como base64
  client.on('qr', async (qr) => {
    currentQR = qr;
    connected = false;
    console.log('[WhatsApp] Escanea el QR:');
    qrcode.generate(qr, { small: true });

    try {
      // Convertir QR a imagen base64 para mostrarlo en el CRM
      const qrBase64 = await QRCode.toDataURL(qr);
      if (onQR) onQR(qrBase64);
    } catch (err) {
      console.error('[WhatsApp] Error generando QR base64:', err.message);
    }
  });

  // WhatsApp autenticado
  client.on('authenticated', () => {
    console.log('[WhatsApp] Sesión autenticada.');
    currentQR = null;
  });

  // WhatsApp listo para usar
  client.on('ready', () => {
    connected = true;
    currentQR = null;
    console.log('[WhatsApp] Cliente listo.');
    if (onReady) onReady();
  });

  // Desconexión — WhatsApp se ha desvinculado del móvil o la sesión expiró.
  // La forma más robusta de recuperarse es salir del proceso y dejar que
  // launchd reinicie el agente limpio. Al arrancar de nuevo, whatsapp-web.js
  // detecta la sesión inválida y genera un QR nuevo que aparece en el CRM.
  //
  // EXCEPCIÓN: si la desconexión la inició el usuario desde el CRM
  // (intentionalLogout=true), logoutWhatsApp() se encarga de borrar la sesión
  // y re-inicializar el cliente in-process, sin matar el proceso.
  client.on('disconnected', (reason) => {
    connected = false;
    currentQR = null;
    console.error('[WhatsApp] Desconectado:', reason);
    if (intentionalLogout) {
      console.log('[WhatsApp] Desconexión intencional — el cliente se re-inicializará en caliente, no reinicio proceso.');
      return;
    }
    console.error('[WhatsApp] El proceso se va a cerrar en 5s para que launchd reinicie el agente limpio...');
    setTimeout(() => process.exit(1), 5000);
  });

  // Fallo de autenticación — sesión corrupta o inválida
  client.on('auth_failure', (msg) => {
    connected = false;
    currentQR = null;
    console.error('[WhatsApp] Fallo de autenticación:', msg);
    if (intentionalLogout) {
      console.log('[WhatsApp] Logout intencional en curso — ignorando auth_failure.');
      return;
    }
    console.error('[WhatsApp] El proceso se va a cerrar en 5s para que launchd reinicie el agente limpio...');
    setTimeout(() => process.exit(1), 5000);
  });

  // Mensajes entrantes — detectar respuestas de leads
  client.on('message', async (msg) => {
    // Ignorar mensajes de grupos y mensajes propios
    if (msg.from.includes('@g.us') || msg.fromMe) return;

    // Extraer número limpio (ej: '34612345678@c.us' → '612345678')
    const rawPhone = msg.from.replace('@c.us', '').replace(/^34/, '');

    console.log(`[WhatsApp] Mensaje recibido de ${rawPhone}: "${msg.body.slice(0, 60)}..."`);

    if (onIncomingMessage) {
      onIncomingMessage(rawPhone, msg.body);
    }
  });

  // ACKs de mensajes enviados
  // Valores: ACK_PENDING=0, ACK_SERVER=1, ACK_DEVICE=2, ACK_READ=3, ACK_PLAYED=4
  client.on('message_ack', (msg, ack) => {
    if (!msg.fromMe || !onMessageAck) return;
    const statusMap = {
      0: 'pendiente',
      1: 'enviado',
      2: 'entregado',
      3: 'leido',
      4: 'leido',
    };
    const status = statusMap[ack] || 'enviado';
    onMessageAck(msg.id?._serialized || msg.id, status);
  });

  client.initialize();
}

/**
 * Formatea un número de teléfono español para WhatsApp.
 * Solo acepta móviles (empieza por 6 o 7).
 * @param {string} phone
 * @returns {string|null} — número en formato '346XXXXXXXX@c.us' o null si no es móvil
 */
function formatPhone(phone) {
  if (!phone) return null;

  // Quitar espacios, guiones y paréntesis
  let num = phone.replace(/[\s\-().+]/g, '');

  // Quitar prefijo +34 o 0034 si ya está
  if (num.startsWith('0034')) num = num.slice(4);
  if (num.startsWith('34') && num.length === 11) num = num.slice(2);

  // Solo móviles españoles (9 dígitos empezando por 6 o 7)
  if (num.length !== 9 || !['6', '7'].includes(num[0])) {
    return null;
  }

  return `34${num}@c.us`;
}

/**
 * Envía un mensaje de WhatsApp.
 * @param {string} phone — número en cualquier formato español
 * @param {string} message — texto del mensaje
 * @returns {Promise<{ok: boolean, messageId: string|null}>} — resultado
 */
async function sendMessage(phone, message) {
  if (!connected || !client) {
    console.error('[WhatsApp] Cliente no conectado.');
    return { ok: false, messageId: null };
  }

  const chatId = formatPhone(phone);
  if (!chatId) {
    console.warn(`[WhatsApp] Número no válido para móvil español: ${phone}`);
    return { ok: false, messageId: null };
  }

  try {
    const sent = await client.sendMessage(chatId, message);
    const messageId = sent.id?._serialized || String(sent.id);
    console.log(`[WhatsApp] Mensaje enviado a ${chatId} (id: ${messageId.slice(0, 40)}…)`);
    return { ok: true, messageId };
  } catch (err) {
    console.error(`[WhatsApp] Error enviando a ${chatId}:`, err.message);
    return { ok: false, messageId: null };
  }
}

/**
 * Devuelve si el cliente está conectado y listo.
 */
function isConnected() {
  return connected;
}

/**
 * Devuelve el QR actual en base64 (null si ya está autenticado).
 */
function getCurrentQR() {
  return currentQR;
}

/**
 * Desvincula WhatsApp del número actual y re-inicializa el cliente para que
 * genere un QR nuevo. Se llama desde el loop del heartbeat cuando el backend
 * responde con disconnect_requested:true (el usuario pulsó "Desconectar
 * WhatsApp" en el CRM).
 *
 * Flujo:
 * 1. client.logout() — desvincula del móvil en WhatsApp
 * 2. client.destroy() — cierra el puppeteer
 * 3. Borra ./wa_session — elimina cualquier credencial persistida
 * 4. initWhatsApp() — vuelve a arrancar el cliente con los mismos callbacks
 *    → esto dispara el evento 'qr' y el próximo heartbeat envía el QR nuevo
 *      al CRM, que re-aparece en el banner naranja.
 */
async function logoutWhatsApp() {
  if (!client) {
    console.warn('[WhatsApp] logoutWhatsApp llamado sin cliente inicializado.');
    return { ok: false, error: 'no_client' };
  }

  console.log('[WhatsApp] Logout solicitado desde el CRM — desvinculando número...');
  intentionalLogout = true;

  try { await client.logout(); }
  catch (err) { console.warn('[WhatsApp] client.logout() falló (puede que ya estuviera desvinculado):', err.message); }

  try { await client.destroy(); }
  catch (err) { console.warn('[WhatsApp] client.destroy() falló:', err.message); }

  connected = false;
  currentQR = null;
  client = null;

  // Limpiar el directorio de sesión. LocalAuth guarda dentro en
  // session-<clientId>/, pero para asegurar un arranque limpio borramos
  // el directorio entero.
  try {
    const sessionDir = path.join(process.cwd(), 'wa_session');
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log('[WhatsApp] Directorio de sesión borrado:', sessionDir);
    }
  } catch (err) {
    console.warn('[WhatsApp] Error borrando directorio de sesión:', err.message);
  }

  // Re-inicializar el cliente para que genere un nuevo QR
  console.log('[WhatsApp] Re-inicializando cliente para generar un nuevo QR...');
  try {
    initWhatsApp(savedOnQR, savedOnReady, onIncomingMessage, onMessageAck);
  } catch (err) {
    console.error('[WhatsApp] Error re-inicializando el cliente:', err.message);
    intentionalLogout = false;
    return { ok: false, error: err.message };
  }

  intentionalLogout = false;
  return { ok: true };
}

/**
 * Comprueba, leyendo directamente el chat de WhatsApp del contacto, si el
 * lead nos ha escrito algo DESPUÉS de nuestro último mensaje saliente.
 *
 * Se usa antes de enviar un follow-up automatizado: si el cliente ya contestó
 * a nuestro primer mensaje, no queremos spamearle con el segundo.
 *
 * Lee el estado real de la conversación en WhatsApp (no depende de si el
 * webhook /leads/respuesta acertó a marcar el lead como 'respondido' en la
 * DB), así que es más estricto que fiarse del estado en la base de datos.
 *
 * @param {string} phone — número en formato español (se normaliza internamente)
 * @returns {Promise<boolean | null>}
 *   - true  → el lead nos ha escrito después de nuestro último saliente
 *   - false → no ha escrito nada desde entonces, seguro mandar follow-up
 *   - null  → no se pudo comprobar (sin conexión, chat inexistente, error).
 *             El caller debe tratar null como "no enviar" por prudencia.
 */
async function hasRepliedSinceLastOutbound(phone) {
  if (!connected || !client) return null;
  const chatId = formatPhone(phone);
  if (!chatId) return null;
  try {
    const chat = await client.getChatById(chatId);
    // Cargamos los 100 últimos mensajes. Suficiente: un follow-up se dispara
    // 3-7 días después del primer envío, y los leads no suelen tener una
    // conversación tan densa con nosotros como para que el primer saliente
    // salga de ese rango.
    const messages = await chat.fetchMessages({ limit: 100 });
    if (!messages || messages.length === 0) return null;

    // Último mensaje saliente (nuestro último envío a este contacto).
    let lastOutboundTs = 0;
    for (const m of messages) {
      if (m.fromMe && typeof m.timestamp === 'number' && m.timestamp > lastOutboundTs) {
        lastOutboundTs = m.timestamp;
      }
    }
    // Raro — no hay saliente en los últimos 100 mensajes. Puede pasar si el
    // histórico con este contacto es muy denso. Devolvemos null para que el
    // caller decida (política conservadora: no enviar).
    if (lastOutboundTs === 0) return null;

    const hasInboundAfter = messages.some(
      (m) => !m.fromMe && typeof m.timestamp === 'number' && m.timestamp > lastOutboundTs
    );
    return hasInboundAfter;
  } catch (err) {
    console.warn(`[WhatsApp] No pude leer el chat de ${phone}:`, err.message);
    return null;
  }
}

module.exports = { initWhatsApp, sendMessage, isConnected, getCurrentQR, logoutWhatsApp, hasRepliedSinceLastOutbound };
