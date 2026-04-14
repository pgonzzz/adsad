/**
 * WhatsApp client usando whatsapp-web.js
 * Gestiona la sesión, el QR code y el envío de mensajes.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');

let client = null;
let connected = false;
let currentQR = null;
let onIncomingMessage = null; // callback para mensajes recibidos
let onMessageAck = null; // callback para actualizaciones de estado (enviado/entregado/leido)

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
  client.on('disconnected', (reason) => {
    connected = false;
    currentQR = null;
    console.error('[WhatsApp] Desconectado:', reason);
    console.error('[WhatsApp] El proceso se va a cerrar en 5s para que launchd reinicie el agente limpio...');
    setTimeout(() => process.exit(1), 5000);
  });

  // Fallo de autenticación — sesión corrupta o inválida
  client.on('auth_failure', (msg) => {
    connected = false;
    currentQR = null;
    console.error('[WhatsApp] Fallo de autenticación:', msg);
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

module.exports = { initWhatsApp, sendMessage, isConnected, getCurrentQR };
