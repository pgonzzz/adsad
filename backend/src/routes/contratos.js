// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS — plantillas .docx con placeholders + contratos firmados
//
// Modelo:
//   Plantilla: un .docx con placeholders {{campo}}. Al subirla detectamos los
//   campos y los guardamos. Al "generar" un contrato, recibimos los valores
//   del formulario, rellenamos el .docx con docxtemplater y lo devolvemos.
//
//   Firmado: cualquier archivo (PDF/DOCX) que el usuario sube ya firmado. Se
//   asocia opcionalmente a un inversor o a un proveedor para verlo desde su
//   ficha.
//
// Ficheros binarios van/vienen en base64 dentro del JSON (express.json tiene
// límite de 15mb, suficiente para contratos; evitamos añadir multer).
//
// Acceso restringido: sólo emails en CONTRATOS_ALLOWED_EMAILS. Default:
// 'carles@pisalia.es'. Añadir más emails con coma en la env var.
// ─────────────────────────────────────────────────────────────────────────────

import express from 'express';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { randomUUID } from 'crypto';
import supabase from '../db/supabase.js';

const router = express.Router();

const BUCKET = 'contratos';
// Allowlist por defecto — los dueños del módulo. Si en algún momento hace
// falta añadir a otro usuario sin tener que redeployar, basta con setear la
// variable CONTRATOS_ALLOWED_EMAILS en Railway y sobrescribe esta lista.
const DEFAULT_ALLOWED = ['carles@pisalia.es', 'paul@pisalia.es'];

function getAllowedEmails() {
  const raw = (process.env.CONTRATOS_ALLOWED_EMAILS || '').trim();
  if (!raw) return DEFAULT_ALLOWED;
  return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

// Middleware: sólo emails en la allowlist pueden usar este módulo.
function contratosAuth(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  const allowed = getAllowedEmails();
  if (!email || !allowed.includes(email)) {
    return res.status(403).json({
      error: 'No tienes permiso para acceder al módulo de Contratos.',
      your_email: email || null,
      hint: 'Pide que añadan tu email a la variable CONTRATOS_ALLOWED_EMAILS en Railway.',
    });
  }
  next();
}

// GET /contratos/access — ping ligero para que el frontend sepa si mostrar
// la entrada del menú. Devuelve 200 si el usuario está autorizado, 403 si no.
router.get('/access', contratosAuth, (_req, res) => {
  res.json({ ok: true });
});

// ─── Helpers de Storage ─────────────────────────────────────────────────────
async function uploadBuffer(path, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Error subiendo a Storage: ${error.message}`);
}

async function downloadBuffer(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Error descargando de Storage: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function removeFromStorage(path) {
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn(`[Contratos] No se pudo borrar ${path}:`, error.message);
}

function base64ToBuffer(b64) {
  // Acepta tanto "data:...;base64,XXXX" como el base64 plano
  const clean = b64.includes('base64,') ? b64.split('base64,')[1] : b64;
  return Buffer.from(clean, 'base64');
}

// ─── Detección de campos en la plantilla ────────────────────────────────────
//
// Técnica: compilamos el .docx con docxtemplater y lo "renderizamos" con un
// Proxy que captura cualquier clave a la que el motor acceda. Así obtenemos
// la lista completa de placeholders sin tener que parsear XML a mano
// (y sin romperse cuando Word parte el token {{campo}} entre varios runs).
function detectFields(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  const fields = new Set();
  const proxy = new Proxy({}, {
    get(_target, key) {
      if (typeof key === 'string' && !key.startsWith('__')) fields.add(key);
      return '';
    },
    has() { return true; },
  });

  try {
    doc.render(proxy);
  } catch (err) {
    // Si la plantilla tiene errores de sintaxis los reportamos — el usuario
    // los arregla en Word.
    const details = err?.properties?.errors?.map(e => e.properties?.explanation).filter(Boolean).join('; ');
    throw new Error(`La plantilla tiene errores: ${details || err.message}`);
  }

  return [...fields];
}

// ─── Helper para resolver emails de creadores ───────────────────────────────
async function resolveCreators(rows) {
  const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  if (userIds.length === 0) return rows;
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const map = {};
    for (const u of (data?.users || [])) {
      map[u.id] = u.user_metadata?.full_name || u.email?.split('@')[0] || u.email;
    }
    return rows.map(r => ({ ...r, creado_por: map[r.user_id] || null }));
  } catch {
    return rows;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /contratos/plantillas — listar
router.get('/plantillas', contratosAuth, async (_req, res) => {
  const { data, error } = await supabase
    .from('contratos_plantillas')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const withCreators = await resolveCreators(data || []);
  res.json(withCreators);
});

// POST /contratos/plantillas — subir nueva plantilla
// body: { nombre, descripcion, archivo_base64, archivo_nombre }
router.post('/plantillas', contratosAuth, async (req, res) => {
  const { nombre, descripcion, archivo_base64, archivo_nombre } = req.body;
  if (!nombre || !archivo_base64) {
    return res.status(400).json({ error: 'Faltan nombre o archivo.' });
  }
  const ext = (archivo_nombre || '').toLowerCase().endsWith('.docx') ? 'docx' : 'docx';
  if (!(archivo_nombre || '').toLowerCase().endsWith('.docx')) {
    return res.status(400).json({ error: 'La plantilla debe ser un fichero .docx' });
  }

  let buffer;
  try {
    buffer = base64ToBuffer(archivo_base64);
  } catch {
    return res.status(400).json({ error: 'archivo_base64 inválido.' });
  }

  let campos;
  try {
    campos = detectFields(buffer);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const id = randomUUID();
  const archivo_path = `plantillas/${id}.${ext}`;

  try {
    await uploadBuffer(archivo_path, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { data, error } = await supabase
    .from('contratos_plantillas')
    .insert([{
      id,
      nombre,
      descripcion: descripcion || null,
      archivo_path,
      campos,
      user_id: req.user.id,
    }])
    .select()
    .single();

  if (error) {
    await removeFromStorage(archivo_path);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// GET /contratos/plantillas/:id — detalle
router.get('/plantillas/:id', contratosAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('contratos_plantillas')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Plantilla no encontrada.' });
  res.json(data);
});

// GET /contratos/plantillas/:id/download — descarga original
router.get('/plantillas/:id/download', contratosAuth, async (req, res) => {
  const { data: row } = await supabase
    .from('contratos_plantillas')
    .select('archivo_path, nombre')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!row) return res.status(404).json({ error: 'Plantilla no encontrada.' });

  try {
    const buf = await downloadBuffer(row.archivo_path);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.nombre)}.docx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contratos/plantillas/:id
router.delete('/plantillas/:id', contratosAuth, async (req, res) => {
  const { data: row } = await supabase
    .from('contratos_plantillas')
    .select('archivo_path')
    .eq('id', req.params.id)
    .maybeSingle();

  const { error } = await supabase
    .from('contratos_plantillas')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (row?.archivo_path) await removeFromStorage(row.archivo_path);
  res.json({ ok: true });
});

// POST /contratos/plantillas/:id/generate — genera el .docx relleno
// body: { valores: { campo1: "...", ... } }
// Responde con el .docx como binario (Content-Disposition attachment).
router.post('/plantillas/:id/generate', contratosAuth, async (req, res) => {
  const { valores = {} } = req.body || {};

  const { data: plantilla } = await supabase
    .from('contratos_plantillas')
    .select('archivo_path, nombre')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!plantilla) return res.status(404).json({ error: 'Plantilla no encontrada.' });

  let templateBuf;
  try {
    templateBuf = await downloadBuffer(plantilla.archivo_path);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  try {
    const zip = new PizZip(templateBuf);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    });
    doc.render(valores);
    const generated = zip.generate({ type: 'nodebuffer' });

    const filename = `${plantilla.nombre}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(generated);
  } catch (err) {
    const details = err?.properties?.errors?.map(e => e.properties?.explanation).filter(Boolean).join('; ');
    return res.status(400).json({ error: 'Error generando el contrato.', details: details || err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRATOS FIRMADOS
// ═══════════════════════════════════════════════════════════════════════════

// GET /contratos/firmados?inversor_id=...&proveedor_id=...
router.get('/firmados', contratosAuth, async (req, res) => {
  let query = supabase
    .from('contratos_firmados')
    .select('*, plantilla:contratos_plantillas(id, nombre), inversor:inversores(id, nombre), proveedor:proveedores(id, nombre)')
    .order('created_at', { ascending: false });

  if (req.query.inversor_id) query = query.eq('inversor_id', req.query.inversor_id);
  if (req.query.proveedor_id) query = query.eq('proveedor_id', req.query.proveedor_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const withCreators = await resolveCreators(data || []);
  res.json(withCreators);
});

// POST /contratos/firmados — subir contrato firmado
// body: {
//   nombre, descripcion,
//   archivo_base64, archivo_nombre, archivo_mime,
//   plantilla_id?, valores?, inversor_id?, proveedor_id?
// }
router.post('/firmados', contratosAuth, async (req, res) => {
  const {
    nombre, descripcion, archivo_base64, archivo_nombre, archivo_mime,
    plantilla_id, valores, inversor_id, proveedor_id,
  } = req.body;

  if (!nombre || !archivo_base64 || !archivo_nombre) {
    return res.status(400).json({ error: 'Faltan nombre o archivo.' });
  }

  let buffer;
  try {
    buffer = base64ToBuffer(archivo_base64);
  } catch {
    return res.status(400).json({ error: 'archivo_base64 inválido.' });
  }

  const ext = archivo_nombre.includes('.') ? archivo_nombre.split('.').pop().toLowerCase() : 'bin';
  const id = randomUUID();
  const archivo_path = `firmados/${id}.${ext}`;

  try {
    await uploadBuffer(archivo_path, buffer, archivo_mime || 'application/octet-stream');
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const { data, error } = await supabase
    .from('contratos_firmados')
    .insert([{
      id,
      nombre,
      descripcion: descripcion || null,
      archivo_path,
      archivo_nombre_original: archivo_nombre,
      archivo_mime: archivo_mime || null,
      plantilla_id: plantilla_id || null,
      valores: valores || {},
      inversor_id: inversor_id || null,
      proveedor_id: proveedor_id || null,
      user_id: req.user.id,
    }])
    .select()
    .single();

  if (error) {
    await removeFromStorage(archivo_path);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

// GET /contratos/firmados/:id/download
router.get('/firmados/:id/download', contratosAuth, async (req, res) => {
  const { data: row } = await supabase
    .from('contratos_firmados')
    .select('archivo_path, archivo_nombre_original, archivo_mime, nombre')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!row) return res.status(404).json({ error: 'Contrato no encontrado.' });

  try {
    const buf = await downloadBuffer(row.archivo_path);
    res.setHeader('Content-Type', row.archivo_mime || 'application/octet-stream');
    const fname = row.archivo_nombre_original || `${row.nombre}.bin`;
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /contratos/firmados/:id
router.delete('/firmados/:id', contratosAuth, async (req, res) => {
  const { data: row } = await supabase
    .from('contratos_firmados')
    .select('archivo_path')
    .eq('id', req.params.id)
    .maybeSingle();

  const { error } = await supabase
    .from('contratos_firmados')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });

  if (row?.archivo_path) await removeFromStorage(row.archivo_path);
  res.json({ ok: true });
});

export default router;
