import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

// GET /notificaciones — notificaciones del usuario (más recientes primero)
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /notificaciones/no-leidas — conteo de no leídas
router.get('/no-leidas', async (req, res) => {
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .eq('leida', false);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: count || 0 });
});

// PUT /notificaciones/:id/leer — marcar como leída
router.put('/:id/leer', async (req, res) => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PUT /notificaciones/leer-todas — marcar todas como leídas
router.put('/leer-todas', async (req, res) => {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('user_id', req.user.id)
    .eq('leida', false);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

export default router;
