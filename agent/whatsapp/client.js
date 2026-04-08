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

/**
 * Inicializa el cliente de WhatsApp.
 * @param {(qrBase64: string) => void} onQR — llamado cuando hay un QR nuevo
 * @param {() => void} onReady — llamado cuando WA está listo para enviar mensajes
 */
function initWhatsApp(onQR, onReady) {
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

  // Desconexión
  client.on('disconnected', (reason) => {
    connected = false;
    console.warn('[WhatsApp] Desconectado:', reason);
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
 * @returns {Promise<boolean>} — true si se envió, false si hubo error
 */
async function sendMessage(phone, message) {
  if (!connected || !client) {
    console.error('[WhatsApp] Cliente no conectado.');
    return false;
  }

  const chatId = formatPhone(phone);
  if (!chatId) {
    console.warn(`[WhatsApp] Número no válido para móvil español: ${phone}`);
    return false;
  }

  try {
    await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] Mensaje enviado a ${chatId}`);
    return true;
  } catch (err) {
    console.error(`[WhatsApp] Error enviando a ${chatId}:`, err.message);
    return false;
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
