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

/**
 * Genera una imagen con gpt-image-1.
 * Si hay imagen de referencia, usa /v1/images/edits (el modelo VE la imagen).
 * Si no hay referencia, usa /v1/images/generations (solo texto).
 */
async function generateImage(prompt, referenceBuffer) {
  if (referenceBuffer) {
    // El modelo VE la imagen de referencia directamente
    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', new Blob([referenceBuffer], { type: 'image/png' }), 'reference.png');
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('size', '1024x1024');
    formData.append('quality', 'medium');

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY()}` },
      body: formData,
    });
    const data = await res.json();
    if (data.error) {
      console.error('[gpt-image-1 edits] Error:', JSON.stringify(data.error));
      throw new Error(data.error.message || JSON.stringify(data.error));
    }
    if (data.data[0].b64_json) {
      return { type: 'base64', data: data.data[0].b64_json };
    }
    return { type: 'url', data: data.data[0].url };
  }

  // Sin referencia: solo texto
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

// ─── Prompts para fotos (simples, como los del usuario en ChatGPT) ────────

const ROOMS = [
  { key: 'salon', label: 'salón-comedor', prompt: 'un salón-comedor vacío (sin muebles)' },
  { key: 'cocina', label: 'cocina', prompt: 'una cocina (solo muebles de cocina fijos, encimera y fregadero, sin electrodomésticos encima)' },
  { key: 'hab1', label: 'habitación principal', prompt: 'una habitación principal vacía (sin muebles, sin cama)' },
  { key: 'hab2', label: 'habitación 2', prompt: 'una segunda habitación vacía (sin muebles)' },
  { key: 'hab3', label: 'habitación 3', prompt: 'una tercera habitación más pequeña, vacía (sin muebles)' },
  { key: 'bano1', label: 'baño principal', prompt: 'un baño con ducha o bañera, lavabo e inodoro' },
  { key: 'bano2', label: 'baño 2', prompt: 'un segundo baño más pequeño con ducha, lavabo e inodoro' },
];

function buildRoomPrompt(room) {
  return `Crea una foto realista, sin que parezca que se haya hecho con una cámara profesional, ni con luces profesionales, de ${room.prompt} de este piso.`;
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

    // ── Paso 1: Preparar imagen de referencia como buffer ──
    let referenceBuffer = null;
    if (referenceImage) {
      if (referenceImage.startsWith('data:')) {
        const b64 = referenceImage.split(',')[1];
        referenceBuffer = Buffer.from(b64, 'base64');
      } else {
        const imgRes = await fetch(referenceImage);
        referenceBuffer = Buffer.from(await imgRes.arrayBuffer());
      }
      console.log(`[Generate] Referencia cargada: ${referenceBuffer.length} bytes`);
    }

    // ── Paso 2: Generar datos ficticios realistas (en paralelo con fotos) ──
    const dataPromise = openaiChat(
      [
        { role: 'system', content: SYSTEM_PROMPT_DATA },
        { role: 'user', content: 'Genera los datos para un piso de inversión de 3 habitaciones y 2 baños.' },
      ],
      true
    ).then((raw) => JSON.parse(raw));

    // ── Paso 3: Generar 7 fotos con gpt-image-1 (ve la referencia directamente) ──
    console.log('[Generate] Generando 7 fotos con gpt-image-1...');
    const photoUrls = [];

    for (let i = 0; i < ROOMS.length; i += 2) {
      const batch = ROOMS.slice(i, i + 2);
      const results = await Promise.all(
        batch.map(async (room) => {
          try {
            console.log(`[Generate]   Generando ${room.label}...`);
            const prompt = buildRoomPrompt(room);
            const imageResult = await generateImage(prompt, referenceBuffer);
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

    if (validPhotos.length === 0) {
      // Si ninguna foto se generó, hay un problema sistémico — informar al usuario
      const firstError = photoUrls.find(r => r === null);
      throw new Error('No se pudo generar ninguna foto. Revisa los logs de Railway para ver el error de la API de OpenAI.');
    }

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
