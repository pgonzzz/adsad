import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

// GET /recordatorios — listar recordatorios del usuario
router.get('/', async (req, res) => {
  let query = supabase
    .from('recordatorios')
    .select('*')
    .eq('user_id', req.user.id)
    .order('fecha_hora', { ascending: true });

  if (req.query.entidad) query = query.eq('entidad', req.query.entidad);
  if (req.query.entidad_id) query = query.eq('entidad_id', req.query.entidad_id);
  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /recordatorios — crear recordatorio
router.post('/', async (req, res) => {
  const { entidad, entidad_id, titulo, descripcion, fecha_hora } = req.body;
  if (!entidad || !entidad_id || !titulo || !fecha_hora) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const { data, error } = await supabase
    .from('recordatorios')
    .insert([{ user_id: req.user.id, entidad, entidad_id, titulo, descripcion, fecha_hora }])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PUT /recordatorios/:id — actualizar (completar, cancelar, editar)
router.put('/:id', async (req, res) => {
  const updates = { ...req.body };
  if (updates.estado === 'completado') updates.completado_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('recordatorios')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /recordatorios/:id
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('recordatorios')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;

// ─── Scheduler: disparar recordatorios pendientes ─────────────────────────────
export async function processReminders() {
  const now = new Date().toISOString();
  const { data: pendientes } = await supabase
    .from('recordatorios')
    .select('*')
    .eq('estado', 'pendiente')
    .lte('fecha_hora', now)
    .limit(20);

  for (const r of (pendientes || [])) {
    // Marcar como disparado
    await supabase.from('recordatorios').update({
      estado: 'disparado',
      disparado_at: new Date().toISOString(),
    }).eq('id', r.id);

    // Crear notificación in-app
    const urlMap = {
      lead: `/captacion/leads/${r.entidad_id}`,
      propiedad: `/propiedades/${r.entidad_id}`,
      inversor: `/inversores/${r.entidad_id}`,
      proveedor: `/proveedores`,
    };
    const { error: notifErr } = await supabase.from('notificaciones').insert([{
      user_id: r.user_id,
      titulo: `⏰ ${r.titulo}`,
      mensaje: r.descripcion || '',
      url: urlMap[r.entidad] || '/',
      recordatorio_id: r.id,
    }]);

    if (notifErr) {
      console.error(`[Reminders] Error creando notificación para "${r.titulo}":`, notifErr.message);
    } else {
      console.log(`[Reminders] Disparado: "${r.titulo}" → notificación creada`);
    }
  }
}
