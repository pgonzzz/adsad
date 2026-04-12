import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let query = supabase
    .from('proveedores')
    .select('*, propiedades(id)')
    .order('created_at', { ascending: false });

  if (req.query.tipo) {
    query = query.eq('tipo', req.query.tipo);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('proveedores')
    .select('*, propiedades(*)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', audit('proveedores', 'create'), async (req, res) => {
  const { data, error } = await supabase
    .from('proveedores')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', audit('proveedores', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('proveedores')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', audit('proveedores', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('proveedores')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
