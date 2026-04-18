import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = () => process.env.TELEGRAM_CHAT_ID;
const OPENAI_KEY = () => process.env.OPENAI_API_KEY;

// ─── Helpers Telegram Bot API ─────────────────────────────────────────────────

async function tgApi(method, body) {
  const token = BOT_TOKEN();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN no configurado en el backend');
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description || 'Error de Telegram');
  return data.result;
}

/** Envía un mensaje de texto (con MarkdownV2 o HTML) */
async function sendMessage(chatId, text) {
  // Usamos HTML para evitar escapes complicados de MarkdownV2
  return tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/** Envía un grupo de fotos (media group) con caption en la primera */
async function sendMediaGroup(chatId, photoUrls, caption) {
  const media = photoUrls.slice(0, 10).map((url, i) => ({
    type: 'photo',
    media: url,
    ...(i === 0 ? { caption, parse_mode: 'HTML' } : {}),
  }));
  return tgApi('sendMediaGroup', { chat_id: chatId, media });
}

/** Publica un post: primero texto, luego fotos. */
async function publishPost(chatId, texto, fotos) {
  const result = await sendMessage(chatId, texto);
  const msgId = String(result.message_id);
  if (fotos && fotos.length > 0) {
    await sendMediaGroup(chatId, fotos, '');
  }
  return msgId;
}

// ─── Generación de texto con IA ───────────────────────────────────────────────

const TELEGRAM_SYSTEM_PROMPT = `Eres un copywriter inmobiliario experto. Generas publicaciones para el canal de Telegram de Pisalia, una empresa de inversión inmobiliaria.

FORMATO DE EJEMPLO (sigue esta estructura EXACTA con emojis):

🔥 IDEA CON CASHFLOW POSITIVO | INVERSIÓN LLAVE EN MANO

📍 Piso en Canovellas Centro
💰 Ingresos activos desde el primer día

━━━━━━━━━━━━━━━
💸 Precio compra: 125.000 €
📈 Ingresos actuales: 1.200 €/mes (14.400 €/año)
🛠 Reforma: No necesaria

👉 Rentabilidad bruta: 11,52%

━━━━━━━━━━━━━━━
🏠 Características del activo
📏 99m²
🛏 4 habitaciones
🛁 1 baño

━━━━━━━━━━━━━━━
💸 Costes fijos
🏛 IBI: 179 €/año (~15 €/mes)
🏢 Comunidad: 35€/mes
👉 Gasto total mensual: ~50 €

━━━━━━━━━━━━━━━
🏦 ESCENARIO HIPOTECARIO (realista)
• Financiación: 80%
• Aportación inicial: ~25.000 €
• Tipo interés: 3,5%
• Plazo: 30 años
👉 Cuota estimada: ~390 €/mes

━━━━━━━━━━━━━━━
📊 CASHFLOW MENSUAL
Ingresos: 1.200 €
 • Hipoteca: 390 €
 • Gastos: 50 €
👉 Beneficio neto estimado: ~760 €/mes
💥 +9.120 €/año antes de impuestos

━━━━━━━━━━━━━━━
🎯 Puntos fuertes del deal
✔️ Alta demanda en alquiler
✔️ Flujo de caja sólido
✔️ Zona en expansión

━━━━━━━━━━━━━━━
🧠 Servicio opcional
✔️ Gestión integral del alquiler
✔️ Compra 100% a distancia
✔️ Acompañamiento completo
✔️ Nos podemos encargar de la financiación

━━━━━━━━━━━━━━━
⚠️ Condiciones de compra
💼 Honorarios: 3.800€ + IVA
📆 Escritura en 2–3 meses
🔒 Reserva con contrato

━━━━━━━━━━━━━━━
📩 Solicita información
✉️ Carles@pisalia.es

⏳ Este tipo de activos con cashflow alto vuelan

REGLAS ESTRICTAS:
1. Usa TODOS los datos disponibles de la propiedad para rellenar la plantilla.
2. El campo "estimacion_alquiler" es el alquiler mensual estimado. Úsalo para calcular rentabilidad e ingresos.
3. Si hay precio + estimacion_alquiler, CALCULA: rentabilidad bruta = (alquiler*12/precio)*100. Muéstrala.
4. Si en las notas/descripción se menciona una reforma (coste de reforma), INCLÚYELO en la inversión total y tenlo en cuenta para la rentabilidad.
5. Si hay IBI, comunidad u otros gastos mencionados en notas/descripción, INCLÚYELOS en costes fijos.
6. Si hay precio y alquiler, incluye escenario hipotecario: financiación 80%, interés 3,5%, plazo 30 años. Calcula cuota y cashflow.
7. OMITE secciones enteras si no hay datos para ellas. NO rellenes con inventos. NO pongas "no disponible" ni "por determinar" — simplemente no incluyas esa sección.
8. PROHIBIDO INVENTAR DATOS. Si un dato no está en la ficha de la propiedad, NO lo pongas. Ni precios, ni alquileres, ni IBI, ni comunidad, ni nada. Solo usa lo que está en los campos de la propiedad que te paso.
9. Si no hay estimacion_alquiler ni alquiler mencionado en notas, NO pongas sección de ingresos, ni rentabilidad, ni cashflow, ni escenario hipotecario. NADA de eso.
10. Los números van con formato español: punto para miles, coma para decimales (125.000 €, 9,5%).
11. Devuelve SOLO el texto de la publicación, sin explicaciones ni markdown.
12. IMPORTANTE: el texto DEBE tener MENOS de 4000 caracteres en total. Sé conciso. Si el mensaje queda largo, reduce secciones o elimina las menos importantes. NUNCA superes los 4000 caracteres.`;

// POST /telegram/generate-text — generar texto inteligente para Telegram
router.post('/generate-text', async (req, res) => {
  const { propiedad } = req.body;
  if (!propiedad) return res.status(400).json({ error: 'Falta propiedad' });
  if (!OPENAI_KEY()) return res.status(500).json({ error: 'OPENAI_API_KEY no configurada' });

  try {
    const propJson = JSON.stringify(propiedad, null, 2);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_KEY()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: TELEGRAM_SYSTEM_PROMPT },
          { role: 'user', content: `Genera la publicación de Telegram para esta propiedad:\n\n${propJson}` },
        ],
        max_tokens: 2000,
      }),
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ text: data.choices[0].message.content });
  } catch (err) {
    console.error('[Telegram/generate-text] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── CRUD + publicación ───────────────────────────────────────────────────────

// GET /telegram/config — devuelve si hay bot token y chat_id configurados
router.get('/config', async (req, res) => {
  res.json({
    configured: !!BOT_TOKEN() && !!DEFAULT_CHAT_ID(),
    has_token: !!BOT_TOKEN(),
    has_chat_id: !!DEFAULT_CHAT_ID(),
  });
});

// GET /telegram/posts — listar publicaciones del usuario
router.get('/posts', async (req, res) => {
  let query = supabase
    .from('telegram_posts')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (req.query.propiedad_id) {
    query = query.eq('propiedad_id', req.query.propiedad_id);
  }
  if (req.query.estado) {
    query = query.eq('estado', req.query.estado);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /telegram/posts — crear borrador o publicar directamente
router.post('/posts', audit('telegram_posts', 'create'), async (req, res) => {
  const { texto, fotos, propiedad_id, programado_para, publicar_ahora } = req.body;

  if (!texto) return res.status(400).json({ error: 'El texto es obligatorio' });

  const chatId = req.body.chat_id || DEFAULT_CHAT_ID();
  const estado = publicar_ahora ? 'publicado' : (programado_para ? 'programado' : 'borrador');

  const post = {
    user_id: req.user.id,
    propiedad_id: propiedad_id || null,
    texto,
    fotos: fotos || [],
    estado,
    chat_id: chatId,
    programado_para: programado_para || null,
  };

  // Si publicar ahora, enviar a Telegram
  if (publicar_ahora) {
    try {
      const msgId = await publishPost(chatId, texto, fotos);
      post.telegram_message_id = msgId;
      post.publicado_at = new Date().toISOString();
    } catch (err) {
      post.estado = 'error';
      post.error_msg = err.message;
    }
  }

  const { data, error } = await supabase
    .from('telegram_posts')
    .insert([post])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// POST /telegram/posts/:id/publish — publicar un borrador o programado manualmente
router.post('/posts/:id/publish', audit('telegram_posts', 'update'), async (req, res) => {
  const { data: post, error: fetchErr } = await supabase
    .from('telegram_posts')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (fetchErr || !post) return res.status(404).json({ error: 'Post no encontrado' });
  if (post.estado === 'publicado') return res.status(400).json({ error: 'Ya publicado' });

  const chatId = post.chat_id || DEFAULT_CHAT_ID();
  try {
    const msgId = await publishPost(chatId, post.texto, post.fotos);
    const { data, error } = await supabase
      .from('telegram_posts')
      .update({
        estado: 'publicado',
        telegram_message_id: msgId,
        publicado_at: new Date().toISOString(),
        error_msg: null,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    await supabase
      .from('telegram_posts')
      .update({ estado: 'error', error_msg: err.message })
      .eq('id', req.params.id);
    res.status(500).json({ error: err.message });
  }
});

// PUT /telegram/posts/:id — editar borrador (texto, fotos, programación)
router.put('/posts/:id', audit('telegram_posts', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('telegram_posts')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /telegram/posts/:id
router.delete('/posts/:id', audit('telegram_posts', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('telegram_posts')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// GET /telegram/propiedad/:id/published — ¿se publicó esta propiedad?
router.get('/propiedad/:id/published', async (req, res) => {
  const { data } = await supabase
    .from('telegram_posts')
    .select('id, estado, publicado_at')
    .eq('propiedad_id', req.params.id)
    .eq('estado', 'publicado')
    .limit(1);
  res.json({ published: (data || []).length > 0, post: data?.[0] || null });
});

// GET /telegram/published-ids — lista de propiedad_ids publicados (para la tabla)
router.get('/published-ids', async (req, res) => {
  const { data } = await supabase
    .from('telegram_posts')
    .select('propiedad_id')
    .eq('estado', 'publicado')
    .not('propiedad_id', 'is', null);
  const ids = [...new Set((data || []).map(d => d.propiedad_id))];
  res.json(ids);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT WEBHOOK — Asistente IA vía mensajes privados al bot
// ═══════════════════════════════════════════════════════════════════════════════

// IDs de chat autorizados (se configura con TELEGRAM_ADMIN_CHATS=id1,id2)
const ADMIN_CHATS = () => (process.env.TELEGRAM_ADMIN_CHATS || '').split(',').filter(Boolean);

// Memoria de conversación por chat (últimos 10 mensajes, expira en 30 min)
const chatMemory = new Map();
function getMemory(chatId) {
  const mem = chatMemory.get(chatId);
  if (!mem) return [];
  // Limpiar mensajes de hace más de 30 min
  const cutoff = Date.now() - 30 * 60 * 1000;
  const fresh = mem.filter(m => m.ts > cutoff);
  if (fresh.length !== mem.length) chatMemory.set(chatId, fresh);
  return fresh.slice(-10); // máximo 10 mensajes de contexto
}
function addToMemory(chatId, role, content) {
  if (!chatMemory.has(chatId)) chatMemory.set(chatId, []);
  chatMemory.get(chatId).push({ role, content, ts: Date.now() });
  // Limitar a 20 mensajes máximo
  const mem = chatMemory.get(chatId);
  if (mem.length > 20) chatMemory.set(chatId, mem.slice(-10));
}

const ASSISTANT_SYSTEM = `Eres el asistente de Pisalia CRM, un CRM inmobiliario.
Ayudas a gestionar campañas de captación, leads, propiedades e inversores.

FUNCIONES (devuelve JSON con "action"):

{"action":"stats"} — Estadísticas generales (campañas, leads, propiedades)
{"action":"count_leads","poblacion":"...","estado":"...","particular":true} — CONTAR leads (todos los filtros opcionales)
{"action":"list_leads","poblacion":"...","estado":"...","particular":true,"limit":5} — LISTAR leads
{"action":"list_campanas"} — Listar campañas
{"action":"create_campana","nombre":"...","poblacion":"...","provincia":"...","tipo":"piso","max_paginas":2}
{"action":"start_scrape","nombre_campana":"..."} — Iniciar scraping
{"action":"send_wa","nombre_campana":"..."} — Enviar WhatsApp a leads nuevos
{"action":"list_propiedades"} — Listar propiedades

REGLAS:
- NUNCA pidas un ID. Buscas por nombre/población internamente.
- "Cuántos leads?" / "cuántos particulares?" / "dime el número" → SIEMPRE usa count_leads (da el número, NO la lista).
- "Muéstrame los leads" / "qué leads hay" / "listame" → usa list_leads con limit:5.
- "De Ciudad Real" / "de Valladolid" → añade poblacion al filtro.
- "Particulares" → añade "particular":true al JSON. "Agencias/profesionales" → "particular":false.
- "Scrapea X" → create_campana + start_scrape.
- "Envía WhatsApp a los de X" → send_wa.
- Si no es una acción del CRM → responde normalmente SIN JSON.
- Devuelve SOLO el JSON, sin texto alrededor.
- Español, breve, directo.`;

async function handleBotMessage(chatId, text) {
  // Verificar que el chat está autorizado
  const admins = ADMIN_CHATS();
  if (admins.length > 0 && !admins.includes(String(chatId))) {
    await tgApi('sendMessage', { chat_id: chatId, text: '❌ No tienes autorización para usar este bot.' });
    return;
  }

  try {
    // ── Comandos slash (gratis, sin IA) ────────────────────────────
    if (text.startsWith('/')) {
      const result = await handleSlashCommand(text);
      await tgApi('sendMessage', { chat_id: chatId, text: result, parse_mode: 'HTML' });
      return;
    }

    // Guardar mensaje del usuario en memoria
    addToMemory(chatId, 'user', text);

    // ── Lenguaje natural (GPT-4o-mini con memoria) ─────────────────
    const history = getMemory(chatId);
    const aiResponse = await callGPT4oMini(history);

    // Intentar parsear como acción JSON
    let action = null;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) action = JSON.parse(jsonMatch[0]);
    } catch {}

    let reply;
    if (action?.action) {
      reply = await executeAction(action);
      await tgApi('sendMessage', { chat_id: chatId, text: reply, parse_mode: 'HTML' });
    } else {
      reply = aiResponse;
      await tgApi('sendMessage', { chat_id: chatId, text: reply });
    }

    // Guardar respuesta en memoria
    addToMemory(chatId, 'assistant', reply);
  } catch (err) {
    console.error('[TgBot] Error:', err.message);
    await tgApi('sendMessage', { chat_id: chatId, text: `❌ Error: ${err.message}` });
  }
}

async function callGPT4oMini(history) {
  const messages = [
    { role: 'system', content: ASSISTANT_SYSTEM },
    ...history.map(m => ({ role: m.role, content: m.content })),
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

// ── Comandos slash ───────────────────────────────────────────────────────────

async function handleSlashCommand(text) {
  const [cmd, ...args] = text.trim().split(/\s+/);
  const arg = args.join(' ');

  switch (cmd) {
    case '/start':
    case '/help':
      return `🏠 <b>Pisalia CRM Bot</b>\n\n` +
        `Comandos disponibles:\n` +
        `/campanas — Listar campañas\n` +
        `/leads [campaña] — Ver leads\n` +
        `/stats — Estadísticas\n` +
        `/propiedades — Propiedades en cartera\n\n` +
        `O escribe en lenguaje natural:\n` +
        `"Scrapea Valladolid pisos hasta 100k"\n` +
        `"Cuántos leads nuevos tengo?"\n` +
        `"Envía WhatsApp a los de Ciudad Real"`;

    case '/campanas': {
      const { data } = await supabase.from('captacion_campanas').select('id, nombre, estado, poblacion, provincia').order('created_at', { ascending: false }).limit(10);
      if (!data?.length) return '📭 No hay campañas.';
      return `📋 <b>Campañas</b>\n\n` + data.map((c, i) =>
        `${i+1}. <b>${c.nombre}</b> · ${c.poblacion || c.provincia || '—'} · ${c.estado}`
      ).join('\n');
    }

    case '/leads': {
      let query = supabase.from('captacion_leads').select('id, nombre_vendedor, telefono, estado, precio, poblacion', { count: 'exact' });
      if (arg) query = query.ilike('poblacion', `%${arg}%`);
      query = query.order('created_at', { ascending: false }).limit(10);
      const { data, count } = await query;
      if (!data?.length) return '📭 No hay leads' + (arg ? ` en "${arg}"` : '') + '.';
      return `👥 <b>Leads</b> (${count} total${arg ? `, filtro: ${arg}` : ''})\n\n` + data.map((l, i) =>
        `${i+1}. ${l.nombre_vendedor || '—'} · ${l.telefono || 'sin tel'} · ${l.precio ? l.precio.toLocaleString('es-ES') + '€' : '—'} · ${l.estado}`
      ).join('\n');
    }

    case '/stats': {
      const [campanas, leads, propiedades, inversores] = await Promise.all([
        supabase.from('captacion_campanas').select('id', { count: 'exact', head: true }),
        supabase.from('captacion_leads').select('id, estado'),
        supabase.from('propiedades').select('id', { count: 'exact', head: true }),
        supabase.from('inversores').select('id', { count: 'exact', head: true }),
      ]);
      const leadsData = leads.data || [];
      const nuevo = leadsData.filter(l => l.estado === 'nuevo').length;
      const enviado = leadsData.filter(l => l.estado === 'enviado').length;
      const respondido = leadsData.filter(l => l.estado === 'respondido').length;
      return `📊 <b>Estadísticas Pisalia</b>\n\n` +
        `📋 Campañas: ${campanas.count || 0}\n` +
        `👥 Leads: ${leadsData.length} (${nuevo} nuevos, ${enviado} enviados, ${respondido} respondidos)\n` +
        `🏠 Propiedades: ${propiedades.count || 0}\n` +
        `💼 Inversores: ${inversores.count || 0}`;
    }

    case '/propiedades': {
      const { data } = await supabase.from('propiedades').select('id, tipo, poblacion, provincia, precio, estado').order('created_at', { ascending: false }).limit(10);
      if (!data?.length) return '📭 No hay propiedades.';
      return `🏠 <b>Propiedades</b>\n\n` + data.map((p, i) =>
        `${i+1}. ${p.tipo} · ${p.poblacion || p.provincia || '—'} · ${p.precio ? p.precio.toLocaleString('es-ES') + '€' : '—'} · ${p.estado}`
      ).join('\n');
    }

    default:
      return `❓ Comando desconocido. Escribe /help para ver los disponibles.`;
  }
}

// ── Ejecutar acción del asistente IA ─────────────────────────────────────────

// Helper: buscar campaña por nombre, población o la más reciente
async function findCampana(hint) {
  if (!hint) {
    // Sin pista → la más reciente
    const { data } = await supabase.from('captacion_campanas').select('*').eq('estado', 'activa').order('created_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }
  const term = hint.toLowerCase();
  const { data } = await supabase.from('captacion_campanas').select('*').eq('estado', 'activa').order('created_at', { ascending: false }).limit(20);
  return (data || []).find(c =>
    (c.nombre || '').toLowerCase().includes(term) ||
    (c.poblacion || '').toLowerCase().includes(term) ||
    (c.provincia || '').toLowerCase().includes(term)
  ) || data?.[0] || null;
}

async function executeAction(action) {
  switch (action.action) {
    case 'list_campanas':
      return handleSlashCommand('/campanas');

    case 'count_leads': {
      let query = supabase.from('captacion_leads').select('id', { count: 'exact', head: true });
      if (action.estado) query = query.eq('estado', action.estado);
      if (action.poblacion) query = query.ilike('poblacion', `%${action.poblacion}%`);
      if (action.particular === true) query = query.eq('es_particular', true);
      if (action.particular === false) query = query.eq('es_particular', false);
      const { count } = await query;
      const filters = [action.estado, action.poblacion, action.particular === true ? 'particulares' : action.particular === false ? 'agencias' : null].filter(Boolean);
      return `📊 <b>${count || 0} leads</b>${filters.length ? ` (${filters.join(', ')})` : ''}.`;
    }

    case 'list_leads': {
      const lim = Math.min(action.limit || 5, 10);
      let query = supabase.from('captacion_leads')
        .select('id, nombre_vendedor, telefono, estado, precio, poblacion', { count: 'exact' });
      if (action.estado) query = query.eq('estado', action.estado);
      if (action.poblacion) query = query.ilike('poblacion', `%${action.poblacion}%`);
      if (action.particular === true) query = query.eq('es_particular', true);
      if (action.particular === false) query = query.eq('es_particular', false);
      query = query.order('created_at', { ascending: false }).limit(lim);
      const { data, count } = await query;
      if (!data?.length) return `📭 No hay leads${action.estado ? ` con estado "${action.estado}"` : ''}${action.poblacion ? ` en ${action.poblacion}` : ''}.`;
      const filters = [action.estado, action.poblacion].filter(Boolean).join(', ');
      return `👥 <b>Leads</b> (${count} total${filters ? `, filtro: ${filters}` : ''})\n\n` + data.map((l, i) =>
        `${i+1}. ${l.nombre_vendedor || '—'} · ${l.telefono || 'sin tel'} · ${l.precio ? l.precio.toLocaleString('es-ES') + '€' : '—'} · ${l.estado}`
      ).join('\n');
    }

    case 'stats':
      return handleSlashCommand('/stats');

    case 'list_propiedades':
      return handleSlashCommand('/propiedades');

    case 'create_campana': {
      const { data, error } = await supabase.from('captacion_campanas').insert([{
        nombre: action.nombre || `Campaña ${action.poblacion || 'nueva'}`,
        portal: 'idealista',
        poblacion: action.poblacion || '',
        provincia: action.provincia || '',
        tipo: action.tipo || 'piso',
        url_inicial: action.url_inicial || '',
        max_paginas: action.max_paginas || 2,
        estado: 'activa',
        plantilla_mensaje: 'Hola {{nombre}}, te contacto en relación a tu anuncio de {{tipo}} en {{poblacion}} por {{precio}}. ¿Sigues teniendo disponible el inmueble?',
      }]).select().single();
      if (error) return `❌ Error creando campaña: ${error.message}`;
      return `✅ Campaña "<b>${data.nombre}</b>" creada.\n\n💡 Escribe "scrapea ${action.poblacion || data.nombre}" para iniciar el scraping.`;
    }

    case 'start_scrape': {
      const campana = await findCampana(action.nombre_campana || action.poblacion);
      if (!campana) return '❌ No hay campañas activas. Crea una primero.';
      const { error } = await supabase.from('captacion_tareas').insert([{
        tipo: 'scrape',
        estado: 'pendiente',
        payload: {
          campana_id: campana.id,
          url_inicial: campana.url_inicial || null,
          poblacion: campana.poblacion,
          provincia: campana.provincia,
          tipo: campana.tipo,
          max_paginas: campana.max_paginas || 2,
        },
      }]);
      if (error) return `❌ Error: ${error.message}`;
      return `🚀 Scraping iniciado para "<b>${campana.nombre}</b>" (${campana.poblacion || '—'}).\n\nEl agente lo ejecutará en breve.`;
    }

    case 'send_wa': {
      const waCampana = await findCampana(action.nombre_campana || action.poblacion);
      if (!waCampana) return '❌ No hay campañas activas.';
      const { data: leads } = await supabase.from('captacion_leads').select('*').eq('campana_id', waCampana.id).eq('estado', 'nuevo');
      const moviles = (leads || []).filter(l => l.telefono && /^[67]/.test(l.telefono.replace(/[\s-+]/g, '').replace(/^34/, '')));
      if (moviles.length === 0) return `📭 No hay leads nuevos con móvil en "${waCampana.nombre}".`;
      const { error } = await supabase.from('captacion_tareas').insert([{
        tipo: 'whatsapp_send',
        estado: 'pendiente',
        payload: {
          campana_id: waCampana.id,
          leads: moviles,
          plantilla_mensaje: waCampana.plantilla_mensaje || 'Hola {{nombre}}, te contacto por tu anuncio de {{tipo}} en {{poblacion}}.',
        },
      }]);
      if (error) return `❌ Error: ${error.message}`;
      return `📱 Envío de WhatsApp programado para <b>${moviles.length} leads</b>.\n\nEl agente empezará a enviar en breve (dentro del horario 8:00-20:00).`;
    }

    default:
      return `❓ Acción "${action.action}" no reconocida.`;
  }
}

// ── Webhook endpoint (Telegram envía mensajes aquí) ──────────────────────────

router.post('/webhook', async (req, res) => {
  // Responder 200 inmediatamente (Telegram lo requiere)
  res.status(200).json({ ok: true });

  const msg = req.body?.message;
  if (!msg?.text || !msg?.chat?.id) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  console.log(`[TgBot] Mensaje de ${msg.from?.first_name || chatId}: "${text.slice(0, 60)}"`);

  // Procesar en background
  handleBotMessage(chatId, text).catch(err => {
    console.error('[TgBot] Error procesando mensaje:', err.message);
  });
});

// ── Endpoint para registrar el webhook en Telegram ───────────────────────────

router.get('/setup-webhook', async (req, res) => {
  const backendUrl = process.env.BACKEND_URL || 'https://crm-pisalia-production.up.railway.app';
  const webhookUrl = `${backendUrl}/api/telegram/webhook`;
  try {
    const result = await tgApi('setWebhook', { url: webhookUrl });
    console.log('[TgBot] Webhook registrado:', webhookUrl);
    res.json({ ok: true, webhook_url: webhookUrl, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { handleBotMessage };
export default router;

// ─── Scheduler para posts programados ─────────────────────────────────────────
// Llamar desde el scheduler principal del backend cada minuto.
export async function processScheduledPosts() {
  const now = new Date().toISOString();
  const { data: posts } = await supabase
    .from('telegram_posts')
    .select('*')
    .eq('estado', 'programado')
    .lte('programado_para', now)
    .limit(10);

  for (const post of (posts || [])) {
    const chatId = post.chat_id || DEFAULT_CHAT_ID();
    try {
      const msgId = await publishPost(chatId, post.texto, post.fotos);
      await supabase.from('telegram_posts').update({
        estado: 'publicado',
        telegram_message_id: msgId,
        publicado_at: new Date().toISOString(),
        error_msg: null,
      }).eq('id', post.id);
      console.log(`[Telegram] Post ${post.id} publicado correctamente`);
    } catch (err) {
      await supabase.from('telegram_posts').update({
        estado: 'error',
        error_msg: err.message,
      }).eq('id', post.id);
      console.warn(`[Telegram] Error publicando post ${post.id}:`, err.message);
    }
  }
}
