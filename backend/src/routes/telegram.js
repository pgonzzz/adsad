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

/** Publica un post: fotos + texto. Si hay fotos usa media group, si no texto solo. */
async function publishPost(chatId, texto, fotos) {
  if (fotos && fotos.length > 0) {
    const result = await sendMediaGroup(chatId, fotos, texto);
    // media group devuelve array de mensajes, retornamos el ID del primero
    return Array.isArray(result) ? String(result[0].message_id) : String(result.message_id);
  }
  const result = await sendMessage(chatId, texto);
  return String(result.message_id);
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
11. Devuelve SOLO el texto de la publicación, sin explicaciones ni markdown.`;

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
