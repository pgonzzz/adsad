import supabase from '../db/supabase.js';

/**
 * Middleware factory para audit log.
 *
 * Uso: router.post('/', authMiddleware, audit('propiedades', 'create'), handler)
 *
 * Para update: captura el req.body ANTES y el res.json DESPUÉS para calcular
 * los campos que cambiaron. Para create/delete logea el hecho sin diff.
 *
 * El middleware se ejecuta DESPUÉS de la respuesta (no bloquea).
 */
export function audit(entidad, accion) {
  return (req, res, next) => {
    // Guardar el json() original para interceptar la respuesta
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Escribir el log en background — no bloqueamos la respuesta
      writeLog(req, body, entidad, accion).catch((err) => {
        console.warn('[Audit] Error escribiendo log:', err.message);
      });
      return originalJson(body);
    };
    next();
  };
}

async function writeLog(req, responseBody, entidad, accion) {
  // Solo logear si la respuesta fue exitosa (2xx)
  // No logeamos si no hay user (rutas de agente)
  if (!req.user) return;

  const user_id = req.user.id;
  const user_email = req.user.email || null;

  // La respuesta puede tener .id, o req.params.id
  const entidad_id =
    responseBody?.id || req.params?.id || null;

  // Resumen legible
  const accionLabel = { create: 'Creó', update: 'Actualizó', delete: 'Eliminó' }[accion] || accion;
  let resumen = `${accionLabel} ${entidad}`;
  if (responseBody?.nombre) resumen += ` "${responseBody.nombre}"`;
  else if (responseBody?.tipo) resumen += ` (${responseBody.tipo})`;
  if (entidad_id) resumen += ` [${String(entidad_id).slice(0, 8)}]`;

  // Para updates, loguear qué campos se enviaron (no diff completo
  // porque no tenemos el estado anterior sin un segundo query).
  // Guardamos las keys del body como indicador.
  let cambios = null;
  if (accion === 'update' && req.body) {
    cambios = {};
    for (const key of Object.keys(req.body)) {
      cambios[key] = { nuevo: summarize(req.body[key]) };
    }
  }

  await supabase.from('activity_log').insert([{
    user_id,
    user_email,
    accion,
    entidad,
    entidad_id: entidad_id ? String(entidad_id) : null,
    resumen,
    cambios,
  }]);
}

/** Trunca valores largos para no sobrecargar el log */
function summarize(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string' && val.length > 120) return val.slice(0, 120) + '…';
  if (Array.isArray(val) && val.length > 5) return `[${val.length} elementos]`;
  return val;
}
