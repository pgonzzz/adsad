import express from 'express';
import supabase from '../db/supabase.js';
import { precioMunicipio } from '../lib/preciosMercado.js';

const router = express.Router();

const LABS69_URL = 'https://69labs.vip';

// Mercados con buen encaje inversor: [poblacion, provincia, slug fotocasa, €/m2 venta respaldo, €/m2 alquiler respaldo]
// Los precios reales se consultan en Fotocasa; los valores numéricos son solo respaldo si falla la consulta.
const MERCADOS = [
  ['Valencia', 'Valencia', 'valencia-capital', 2100, 11.5], ['Torrent', 'Valencia', 'torrent', 1350, 8.5],
  ['Gandia', 'Valencia', 'gandia', 1400, 8.5], ['Sagunto', 'Valencia', 'sagunto-sagunt', 1200, 8],
  ['Alicante', 'Alicante', 'alicante-alacant', 1800, 10], ['Elche', 'Alicante', 'elche-elx', 1350, 8.5],
  ['Alcoy', 'Alicante', 'alcoy-alcoi', 900, 7], ['Elda', 'Alicante', 'elda', 750, 6.5],
  ['Murcia', 'Murcia', 'murcia-capital', 1350, 8.5], ['Cartagena', 'Murcia', 'cartagena', 1150, 8],
  ['Molina de Segura', 'Murcia', 'molina-de-segura', 1100, 7.5], ['Lorca', 'Murcia', 'lorca', 900, 7],
  ['Zaragoza', 'Zaragoza', 'zaragoza-capital', 1750, 10], ['Sevilla', 'Sevilla', 'sevilla-capital', 2000, 10.5],
  ['Dos Hermanas', 'Sevilla', 'dos-hermanas', 1350, 8.5], ['Córdoba', 'Córdoba', 'cordoba-capital', 1400, 8.5],
  ['Jerez de la Frontera', 'Cádiz', 'jerez-de-la-frontera', 1250, 8], ['Málaga', 'Málaga', 'malaga-capital', 2600, 12.5],
  ['Vélez-Málaga', 'Málaga', 'velez-malaga', 1500, 8.5], ['Albacete', 'Albacete', 'albacete-capital', 1300, 8],
  ['Castellón de la Plana', 'Castellón', 'castellon-de-la-plana-castello-de-la-plana', 1200, 8],
  ['Vila-real', 'Castellón', 'vila-real', 1100, 7.5],
  ['Talavera de la Reina', 'Toledo', 'talavera-de-la-reina', 750, 6.5], ['Toledo', 'Toledo', 'toledo-capital', 1500, 9],
  ['Valladolid', 'Valladolid', 'valladolid-capital', 1500, 9], ['Badajoz', 'Badajoz', 'badajoz-capital', 1150, 7.5],
  ['Gijón', 'Asturias', 'gijon', 1550, 9], ['Avilés', 'Asturias', 'aviles', 1150, 7.5],
  ['Santander', 'Cantabria', 'santander', 1900, 10], ['Torrelavega', 'Cantabria', 'torrelavega', 1050, 7.5],
  ['Vigo', 'Pontevedra', 'vigo', 1650, 9.5], ['Ourense', 'Ourense', 'ourense-capital', 1200, 8],
  ['Tarragona', 'Tarragona', 'tarragona-capital', 1550, 9.5], ['Reus', 'Tarragona', 'reus', 1250, 8.5],
  ['Lleida', 'Lleida', 'lleida-capital', 1150, 8], ['Manresa', 'Barcelona', 'manresa', 1350, 9],
];

// Descuento máximo creíble sobre el precio de mercado (piso a reformar / vendedor motivado)
const DESCUENTO_MAX = 0.40;

const rnd = (min, max) => Math.random() * (max - min) + min;
const rndInt = (min, max) => Math.floor(rnd(min, max + 1));
const pick = (arr) => arr[rndInt(0, arr.length - 1)];

async function generarOpcion(targetBruta) {
  const [poblacion, provincia, slug, pm2Fallback, alqM2Fallback] = pick(MERCADOS);
  const mercado = await precioMunicipio(slug, { pm2: pm2Fallback, alqM2: alqM2Fallback });

  const m2 = rndInt(40, 130);
  const habitaciones = m2 < 60 ? rndInt(1, 2) : m2 < 85 ? rndInt(2, 3) : rndInt(3, 4);
  const banos = m2 < 80 ? 1 : rndInt(1, 2);
  const anio = rndInt(1960, 2008);

  // Alquiler según mercado real; el precio se deriva para clavar la rentabilidad objetivo
  const alquiler = Math.round((m2 * mercado.alqM2 * rnd(0.9, 1.05)) / 10) * 10;
  const objetivo = targetBruta + rnd(-0.2, 0.2);
  const precio = Math.round((alquiler * 12) / (objetivo / 100) / 500) * 500;
  const rentBruta = +(((alquiler * 12) / precio) * 100).toFixed(1);
  const rentNeta = +((rentBruta * rnd(0.72, 0.85))).toFixed(1);

  // Guardas de realismo frente al €/m² real de la zona:
  // ni por encima de mercado (no sería un chollo) ni con descuento imposible
  const pm2Implicito = precio / m2;
  if (pm2Implicito > mercado.pm2 * 1.0 || pm2Implicito < mercado.pm2 * (1 - DESCUENTO_MAX)) return null;

  return {
    tipo: 'piso',
    poblacion, provincia, m2, habitaciones, banos,
    planta: rndInt(1, 7),
    anio_construccion: anio,
    precio,
    estimacion_alquiler: alquiler,
    rentabilidad_bruta: rentBruta,
    rentabilidad_neta: rentNeta,
    acepta_financiacion: Math.random() < 0.6,
    pm2_zona: Math.round(mercado.pm2),
    pm2_propiedad: Math.round(pm2Implicito),
    fuente_precios: mercado.fuente,
  };
}

function generarDescripcion(o) {
  const estadoPiso = o.anio_construccion < 1980
    ? pick(['para actualizar', 'a reformar parcialmente', 'en estado original bien conservado'])
    : pick(['en buen estado', 'para entrar a vivir con pequeñas mejoras', 'bien conservado']);
  const extras = [];
  if (o.planta >= 4) extras.push('buenas vistas despejadas');
  if (Math.random() < 0.6) extras.push('balcón a calle');
  if (Math.random() < 0.5) extras.push('ascensor');
  if (Math.random() < 0.4) extras.push('galería');
  return `Piso de ${o.m2} m² en ${o.poblacion} (${o.provincia}). ` +
    `${o.habitaciones} habitaciones y ${o.banos} baño${o.banos > 1 ? 's' : ''}, planta ${o.planta}ª. ` +
    `Edificio de ${o.anio_construccion}, piso ${estadoPiso}${extras.length ? ', con ' + extras.join(', ') : ''}. ` +
    `Zona con buena demanda de alquiler. Alquiler estimado: ${o.estimacion_alquiler} €/mes ` +
    `(rentabilidad bruta ${o.rentabilidad_bruta}%).`;
}

// POST /api/generador/opciones { n }
router.post('/opciones', async (req, res) => {
  const n = Math.min(Math.max(parseInt(req.body?.n) || 10, 1), 20);
  // Rentabilidades brutas en escala creciente de 9% a 16%
  const targets = n === 1 ? [13] : Array.from({ length: n }, (_, i) => 9 + (i * 7) / (n - 1));
  const opciones = [];
  const vistas = new Set();
  for (const target of targets) {
    for (let intentos = 0; intentos < 80; intentos++) {
      const o = await generarOpcion(target);
      if (!o) continue; // descartada por las guardas de realismo
      if (o.precio < 25000 || o.precio > 110000) continue; // rango de precio: 25.000-110.000 €
      const key = `${o.poblacion}-${o.m2}-${o.precio}`;
      if (vistas.has(key)) continue;
      vistas.add(key);
      opciones.push(o);
      break;
    }
  }
  res.json(opciones);
});

// --- Generación de imágenes con 69labs (gpt-image-2) ---

const ESTILO_FOTO =
  'Fotografía REAL de anuncio inmobiliario de un portal español tipo Idealista, hecha con la cámara de un móvil por el propietario o un agente con prisa. ' +
  'Encuadre ligeramente torcido e imperfecto, luz natural de ventana con alguna zona quemada o en sombra, balance de blancos casero. ' +
  'Piso VACÍO, recién desalojado, en venta: SIN muebles, SIN objetos, SIN cajas, SIN cortinas, SIN lámparas de pie. Estancias completamente vacías. ' +
  'Se nota que ha estado habitado: paredes con pequeñas marcas, sombras de donde hubo cuadros o muebles, gotelé o pintura envejecida, suelos de terrazo o parquet antiguo con desgaste, rodapiés con roces, algún enchufe o interruptor antiguo. ' +
  'IMPORTANTE: nada de estética de revista, nada de home staging, nada de render ni aspecto de imagen generada por IA. Textura fotográfica real con ligero grano y nitidez media. Sin texto, sin marcas de agua, sin personas.';

function estanciasDe(opcion) {
  const est = [
    'salón comedor vacío, sin ningún mueble',
    'cocina con los muebles de obra y azulejos de la época (armarios de cocina antiguos, bancada), pero sin electrodomésticos sueltos ni utensilios',
  ];
  const nombresDorm = ['dormitorio principal vacío, sin cama ni muebles', 'segundo dormitorio vacío', 'tercer dormitorio vacío', 'cuarto dormitorio vacío'];
  for (let i = 0; i < Math.min(opcion.habitaciones, 4); i++) est.push(nombresDorm[i]);
  est.push('baño completo con los sanitarios y azulejos de la época del edificio, sin objetos de aseo');
  if (opcion.banos > 1) est.push('segundo baño o aseo, también vacío');
  est.push('pasillo y recibidor de entrada, vacíos');
  return est;
}

async function generarImagenEstancia(apiKey, estancia, opcion, imagenesBase) {
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const prompt =
    `${ESTILO_FOTO}\n\nEstancia a fotografiar: ${estancia}. ` +
    `Es el MISMO piso que el de ${imagenesBase.length > 1 ? 'las imágenes de referencia' : 'la imagen de referencia'}: replica exactamente su estilo, época, materiales, carpintería, tipo de suelo, estado de conservación e iluminación, como si todas las fotos fueran del mismo anuncio. ` +
    `Si en la referencia aparecen muebles u objetos, IGNÓRALOS: usa la referencia solo para la época, materiales y estado del piso — la estancia generada debe estar completamente vacía. ` +
    `La referencia puede llevar marca de agua, logotipo, texto o sello de un portal inmobiliario: NO los reproduzcas bajo ningún concepto. La imagen generada es una foto NUEVA (no una copia ni edición de la referencia) y debe salir totalmente limpia, sin ninguna marca de agua, logo, texto ni sello. ` +
    `Contexto del piso: ${opcion.m2} m², edificio de ${opcion.anio_construccion}, planta ${opcion.planta}ª, en ${opcion.poblacion}, España.`;

  const genRes = await fetch(`${LABS69_URL}/api/v1/images/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      model: 'gpt-image-2',
      aspectRatio: '4:3',
      imageUrls: imagenesBase,
    }),
  });
  const gen = await genRes.json();
  if (!genRes.ok) throw new Error(gen.error || 'Error creando job');

  let status = null;
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const stRes = await fetch(`${LABS69_URL}/api/v1/images/status/${gen.id}`, { headers });
    status = await stRes.json();
    if (status.status === 'COMPLETED') break;
    if (['FAILED', 'CANCELLED'].includes(status.status)) throw new Error(`Job ${status.status}`);
  }
  if (status?.status !== 'COMPLETED') throw new Error('Timeout');

  const dlRes = await fetch(`${LABS69_URL}/api/v1/images/download/${gen.id}`, { headers });
  if (!dlRes.ok) throw new Error('Error descargando');
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  const format = status.outputMetadata?.format || 'png';

  const path = `fotos/ia-${Date.now()}-${Math.random().toString(36).slice(2)}.${format}`;
  const { error } = await supabase.storage.from('propiedades').upload(path, buffer, { contentType: `image/${format}` });
  if (error) throw new Error(error.message);
  return supabase.storage.from('propiedades').getPublicUrl(path).data.publicUrl;
}

// POST /api/generador/crear { opcion, imagenBase }
router.post('/crear', async (req, res) => {
  const apiKey = process.env.LABS69_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LABS69_API_KEY no configurada' });

  const { opcion, imagenBase, imagenesBase } = req.body || {};
  if (!opcion?.poblacion || !opcion?.precio) return res.status(400).json({ error: 'Falta la opción seleccionada' });
  // Acepta una imagen (imagenBase) o varias (imagenesBase, máx 4 — límite de gpt-image-2)
  const bases = (Array.isArray(imagenesBase) ? imagenesBase : [imagenBase]).filter(Boolean).slice(0, 4);
  if (!bases.length) return res.status(400).json({ error: 'Falta al menos una imagen base' });

  // 1. Crear la propiedad con toda la info
  const propiedad = {
    tipo: opcion.tipo || 'piso',
    provincia: opcion.provincia,
    poblacion: opcion.poblacion,
    m2: opcion.m2,
    habitaciones: opcion.habitaciones,
    banos: opcion.banos,
    planta: opcion.planta,
    anio_construccion: opcion.anio_construccion,
    precio: opcion.precio,
    estimacion_alquiler: opcion.estimacion_alquiler,
    rentabilidad_bruta: opcion.rentabilidad_bruta,
    rentabilidad_neta: opcion.rentabilidad_neta,
    acepta_financiacion: opcion.acepta_financiacion ?? false,
    descripcion: generarDescripcion(opcion),
    estado: 'disponible',
    tags: ['ficticia'],
    fotos: [],
  };

  const { data: creada, error: errIns } = await supabase
    .from('propiedades')
    .insert([propiedad])
    .select()
    .single();
  if (errIns) return res.status(500).json({ error: errIns.message });

  // 2. Generar las fotos de todas las estancias en paralelo (gpt-image-2 + imagen base)
  const estancias = estanciasDe(opcion);
  const resultados = await Promise.allSettled(
    estancias.map(e => generarImagenEstancia(apiKey, e, opcion, bases))
  );
  const fotos = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
  const fallidas = resultados
    .map((r, i) => (r.status === 'rejected' ? `${estancias[i]}: ${r.reason.message}` : null))
    .filter(Boolean);

  // 3. Guardar las fotos en la propiedad
  const { data: final, error: errUpd } = await supabase
    .from('propiedades')
    .update({ fotos })
    .eq('id', creada.id)
    .select()
    .single();
  if (errUpd) return res.status(500).json({ error: errUpd.message });

  res.status(201).json({ propiedad: final, fotosGeneradas: fotos.length, fallidas });
});

export default router;
