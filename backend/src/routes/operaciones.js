import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let query = supabase
    .from('operaciones')
    .select(`
      *,
      matches (
        id, score, estado,
        peticiones (
          id, zona, tipos_propiedad,
          inversores (id, nombre, email)
        ),
        propiedades (id, tipo, zona, precio)
      )
    `)
    .order('created_at', { ascending: false });

  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('operaciones')
    .select(`
      *,
      matches (
        id, score,
        peticiones (*, inversores (id, nombre, email, telefono)),
        propiedades (*, proveedores (id, nombre))
      )
    `)
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', audit('operaciones', 'create'), async (req, res) => {
  const { data, error } = await supabase
    .from('operaciones')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', audit('operaciones', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('operaciones')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', audit('operaciones', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('operaciones')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
