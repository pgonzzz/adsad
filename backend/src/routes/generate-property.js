import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

const OPENAI_KEY = () => process.env.OPENAI_API_KEY;

// ─── Helpers OpenAI ───────────────────────────────────────────────────────────

async function openaiChat(messages, json = false) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY()}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      max_tokens: 1500,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error('[OpenAI Chat] Error:', JSON.stringify(data.error));
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.choices[0].message.content;
}

async function dalleGenerate(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY()}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    }),
  });
  const data = await res.json();
  if (data.error) {
    console.error('[gpt-image-1] Error:', JSON.stringify(data.error));
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  // gpt-image-1 devuelve base64 en vez de URL
  if (data.data[0].b64_json) {
    return { type: 'base64', data: data.data[0].b64_json };
  }
  return { type: 'url', data: data.data[0].url };
}

/** Sube una imagen (base64 o URL) a Supabase storage */
async function downloadAndUpload(imageResult, filename) {
  let buffer;
  if (imageResult.type === 'base64') {
    buffer = Buffer.from(imageResult.data, 'base64');
  } else {
    const res = await fetch(imageResult.data);
    if (!res.ok) throw new Error(`Error descargando imagen: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  const path = `fotos/${Date.now()}-${filename}.png`;
  const { error } = await supabase.storage
    .from('propiedades')
    .upload(path, buffer, { contentType: 'image/png' });
  if (error) throw new Error(`Error subiendo a storage: ${error.message}`);
  const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
  return data.publicUrl;
}

// ─── Zonas periféricas realistas ──────────────────────────────────────────────

const SYSTEM_PROMPT_DATA = `Eres un experto inmobiliario español. Genera datos FICTICIOS pero REALISTAS para un piso de inversión.

REGLAS:
- La ubicación debe ser un municipio PERIFÉRICO de una gran ciudad española (Madrid, Barcelona, Valencia, Sevilla, Málaga, Bilbao, Zaragoza, Alicante, Murcia).
- Elige zonas de clase media / trabajadora (NUNCA barrios conflictivos como Línea de la Concepción, Son Banya, Las 3000, Las Barranquillas etc.)
- Buenos ejemplos: Getafe, Leganés, Alcorcón, Coslada, Cornellà, L'Hospitalet, Badalona, Santa Coloma, Torrent, Paterna, Catarroja, Dos Hermanas, Alcalá de Guadaíra, Torremolinos, Alhaurín, Barakaldo, Sestao, Utebo, San Juan de Alicante, etc.
- El precio debe ser coherente con la zona (60.000-180.000€ para pisos periféricos).
- Rentabilidad bruta entre 7-12% (es una inversión atractiva).
- m² entre 60-110 para un piso de 3 habitaciones.
- Inventa una dirección verosímil (calle real o que suene real).
- Año construcción entre 1965-2005.
- Genera una descripción corta (2-3 frases) como si fuera un anuncio de Idealista.

Devuelve SOLO un JSON con esta estructura exacta:
{
  "provincia": "...",
  "poblacion": "...",
  "direccion": "...",
  "precio": 125000,
  "m2": 85,
  "habitaciones": 3,
  "banos": 2,
  "planta": "2ª",
  "anio_construccion": 1988,
  "rentabilidad_bruta": 9.5,
  "rentabilidad_neta": 7.2,
  "descripcion": "..."
}`;

// ─── Prompts para fotos ───────────────────────────────────────────────────────

const ROOMS = [
  { key: 'salon', label: 'salón-comedor', prompt: 'empty living room and dining area, no furniture at all' },
  { key: 'cocina', label: 'cocina', prompt: 'kitchen with countertop, sink and cabinets only — no appliances on counters, no dishes' },
  { key: 'hab1', label: 'habitación principal', prompt: 'empty main bedroom, no bed, no furniture, just the empty room with window' },
  { key: 'hab2', label: 'habitación 2', prompt: 'empty second bedroom, no furniture, just walls, floor and window' },
  { key: 'hab3', label: 'habitación 3', prompt: 'empty third bedroom, smallest room, no furniture at all' },
  { key: 'bano1', label: 'baño principal', prompt: 'bathroom with toilet, sink and shower/bathtub — these are FIXED elements, not furniture' },
  { key: 'bano2', label: 'baño 2', prompt: 'small secondary bathroom with toilet, sink and shower — fixed elements only' },
];

function buildImagePrompt(room, styleDescription) {
  return `Realistic smartphone photo of the ${room.prompt} in a Spanish apartment.

STYLE TO REPLICATE EXACTLY: ${styleDescription}

CRITICAL RULES:
- REPLICATE the EXACT same style, quality level, and condition as described in the style reference above
- If the reference is a modest apartment, generate a modest apartment. If it's renovated, generate renovated. MATCH IT EXACTLY.
- The rooms must be EMPTY — NO furniture, NO beds, NO sofas, NO tables, NO chairs, NO decorations, NO curtains
- Only FIXED elements: kitchen cabinets, countertop, sink, toilet, shower/bathtub, built-in wardrobes if any
- Same type of floors, walls, doors, and windows as the reference
- Photo taken with a smartphone, natural casual angle
- Clear and sharp image, natural lighting from windows
- Pay special attention to DETAILS: faucets must look realistic and complete, shower screens must be full and proper, tiles must be consistent, doors must have proper handles
- NO artifacts, NO impossible geometry, NO melting objects, NO weird reflections
- NO watermarks, NO text, NO people
- The apartment must look REAL and BELIEVABLE — someone scrolling Idealista should think it's a real listing photo`;
}

// ─── Endpoint principal ───────────────────────────────────────────────────────

router.post('/', audit('propiedades', 'create'), async (req, res) => {
  // Acepta base64 data URL o URL pública
  const referenceImage = req.body.reference_image_data || req.body.reference_image_url;

  if (!OPENAI_KEY()) {
    return res.status(500).json({ error: 'OPENAI_API_KEY no configurada en el backend' });
  }

  try {
    console.log('[Generate] Iniciando generación de propiedad ficticia...');

    // ── Paso 1: Analizar la foto de referencia con GPT-4o vision ──
    let styleDescription = '';
    if (referenceImage) {
      console.log('[Generate] Analizando foto de referencia...');
      styleDescription = await openaiChat([
        {
          role: 'system',
          content: 'Describe the visual style, materials, condition and quality level of this apartment in 3-4 sentences in English. Be VERY specific about: floor type and color (ceramic tile pattern, wood, marble, laminate), wall color and condition (freshly painted, yellowed, cracked), door style (old wood, white lacquered, aluminium), window type (aluminium, PVC, wood), overall condition (new build, recently renovated, old but maintained, deteriorated). Also note: lighting quality, ceiling height, any visible fixtures. The goal is to recreate rooms with the EXACT same quality level and materials — not better, not worse.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe the style of this apartment:' },
            { type: 'image_url', image_url: { url: referenceImage } },
          ],
        },
      ]);
      console.log('[Generate] Estilo detectado:', styleDescription.slice(0, 100) + '...');
    } else {
      styleDescription = 'Typical Spanish apartment with ceramic tile floors, white painted walls, roller shutters, modest furniture. Built in the 1980s-1990s, reasonably maintained.';
    }

    // ── Paso 2: Generar datos ficticios realistas (en paralelo con fotos) ──
    const dataPromise = openaiChat(
      [
        { role: 'system', content: SYSTEM_PROMPT_DATA },
        { role: 'user', content: 'Genera los datos para un piso de inversión de 3 habitaciones y 2 baños.' },
      ],
      true
    ).then((raw) => JSON.parse(raw));

    // ── Paso 3: Generar 7 fotos con DALL-E 3 (en paralelo, batches de 3) ──
    console.log('[Generate] Generando 7 fotos con DALL-E 3...');
    const photoUrls = [];

    // Procesamos en batches de 3 para no saturar la API
    for (let i = 0; i < ROOMS.length; i += 3) {
      const batch = ROOMS.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(async (room) => {
          try {
            console.log(`[Generate]   Generando ${room.label}...`);
            const imageResult = await dalleGenerate(buildImagePrompt(room, styleDescription));
            const storageUrl = await downloadAndUpload(imageResult, room.key);
            console.log(`[Generate]   ✓ ${room.label} subida`);
            return storageUrl;
          } catch (err) {
            console.warn(`[Generate]   ✗ Error generando ${room.label}:`, err.message);
            return null;
          }
        })
      );
      photoUrls.push(...results);
    }

    const validPhotos = photoUrls.filter(Boolean);
    console.log(`[Generate] ${validPhotos.length}/${ROOMS.length} fotos generadas`);

    // ── Paso 4: Esperar datos y crear la propiedad ──
    const propData = await dataPromise;
    console.log('[Generate] Datos generados:', propData.poblacion, propData.provincia);

    const propiedad = {
      tipo: 'piso',
      estado: 'disponible',
      provincia: propData.provincia,
      poblacion: propData.poblacion,
      direccion: propData.direccion,
      precio: propData.precio,
      m2: propData.m2,
      habitaciones: propData.habitaciones || 3,
      banos: propData.banos || 2,
      planta: propData.planta || '2ª',
      anio_construccion: propData.anio_construccion,
      rentabilidad_bruta: propData.rentabilidad_bruta,
      rentabilidad_neta: propData.rentabilidad_neta,
      descripcion: propData.descripcion,
      acepta_financiacion: true,
      fotos: validPhotos,
      tags: ['generada-ia'],
      notas: 'Propiedad generada automáticamente con IA. Los datos y fotos son ficticios.',
    };

    const { data, error } = await supabase
      .from('propiedades')
      .insert([propiedad])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    console.log(`[Generate] ✓ Propiedad creada: ${data.id}`);
    res.status(201).json(data);
  } catch (err) {
    console.error('[Generate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
