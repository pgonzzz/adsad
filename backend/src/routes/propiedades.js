import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let query = supabase
    .from('propiedades')
    .select('*, proveedores(id, nombre, tipo)')
    .order('created_at', { ascending: false });

  if (req.query.estado) query = query.eq('estado', req.query.estado);
  if (req.query.tipo) query = query.eq('tipo', req.query.tipo);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data: propiedad, error } = await supabase
    .from('propiedades')
    .select('*, proveedores(id, nombre, tipo, telefono, email, empresa)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Peticiones activas que encajan con esta propiedad
  const { data: todasPeticiones } = await supabase
    .from('peticiones')
    .select('*, inversores(id, nombre, apellidos, pipeline, telefono, email)')
    .eq('estado', 'activa');

  const peticionesMatch = (todasPeticiones || []).filter(p => {
    if (p.tipos_propiedad?.length && !p.tipos_propiedad.includes(propiedad.tipo)) return false;
    if (p.precio_min && propiedad.precio && propiedad.precio < p.precio_min) return false;
    if (p.precio_max && propiedad.precio && propiedad.precio > p.precio_max) return false;
    if (p.provincia && propiedad.provincia && p.provincia !== propiedad.provincia) return false;
    if (p.necesita_financiacion && !propiedad.acepta_financiacion) return false;
    return true;
  });

  res.json({ ...propiedad, peticionesMatch });
});

router.post('/', audit('propiedades', 'create'), async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', audit('propiedades', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('propiedades')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Genera una foto con IA (69labs), la sube al storage y la añade a la propiedad
const LABS69_URL = 'https://69labs.vip';

router.post('/:id/generar-imagen', async (req, res) => {
  const apiKey = process.env.LABS69_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'LABS69_API_KEY no configurada' });

  const { data: propiedad, error: errProp } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (errProp) return res.status(404).json({ error: 'Propiedad no encontrada' });

  const prompt = req.body?.prompt || [
    `Fotografía inmobiliaria profesional de ${propiedad.tipo || 'una vivienda'}`,
    propiedad.poblacion || propiedad.provincia
      ? `en ${[propiedad.poblacion, propiedad.provincia].filter(Boolean).join(', ')}, España`
      : 'en España',
    propiedad.descripcion ? `. ${propiedad.descripcion.slice(0, 500)}` : '',
    '. Foto realista de anuncio inmobiliario, luz natural, gran angular, sin texto ni marcas de agua.',
  ].join(' ');

  const labsHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Crear el job
    const genRes = await fetch(`${LABS69_URL}/api/v1/images/generate`, {
      method: 'POST',
      headers: labsHeaders,
      body: JSON.stringify({ prompt, aspectRatio: req.body?.aspectRatio || '16:9' }),
    });
    const gen = await genRes.json();
    if (!genRes.ok) return res.status(502).json({ error: gen.error || 'Error creando el job en 69labs' });

    // 2. Esperar a que termine (poll cada 3s, máx 3 min)
    let status = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const stRes = await fetch(`${LABS69_URL}/api/v1/images/status/${gen.id}`, { headers: labsHeaders });
      status = await stRes.json();
      if (status.status === 'COMPLETED') break;
      if (['FAILED', 'CANCELLED'].includes(status.status)) {
        return res.status(502).json({ error: `Generación fallida (${status.status})` });
      }
    }
    if (status?.status !== 'COMPLETED') return res.status(504).json({ error: 'Timeout generando la imagen' });

    // 3. Descargar la imagen
    const dlRes = await fetch(`${LABS69_URL}/api/v1/images/download/${gen.id}`, { headers: labsHeaders });
    if (!dlRes.ok) return res.status(502).json({ error: 'Error descargando la imagen' });
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    const format = status.outputMetadata?.format || 'png';

    // 4. Subir al storage y añadir a la propiedad
    const path = `fotos/ia-${Date.now()}-${Math.random().toString(36).slice(2)}.${format}`;
    const { error: errUp } = await supabase.storage
      .from('propiedades')
      .upload(path, buffer, { contentType: `image/${format}` });
    if (errUp) return res.status(500).json({ error: errUp.message });

    const { data: pub } = supabase.storage.from('propiedades').getPublicUrl(path);
    const fotos = [...(propiedad.fotos || []), pub.publicUrl];
    const { data: actualizada, error: errUpd } = await supabase
      .from('propiedades')
      .update({ fotos })
      .eq('id', req.params.id)
      .select()
      .single();
    if (errUpd) return res.status(500).json({ error: errUpd.message });

    res.json({ url: pub.publicUrl, propiedad: actualizada });
  } catch (e) {
    res.status(502).json({ error: `Error con 69labs: ${e.message}` });
  }
});

router.delete('/:id', audit('propiedades', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('propiedades')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
