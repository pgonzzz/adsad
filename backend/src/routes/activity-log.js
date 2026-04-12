import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

// GET /activity-log — listar últimas entradas del audit log
// Query params: limit (default 50, max 200), offset, entidad, entidad_id
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  let query = supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.entidad) query = query.eq('entidad', req.query.entidad);
  if (req.query.entidad_id) query = query.eq('entidad_id', req.query.entidad_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

export default router;
