import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

router.get('/', async (req, res) => {
  let query = supabase
    .from('peticiones')
    .select('*, inversores(id, nombre, apellidos, pipeline)')
    .order('created_at', { ascending: false });

  if (req.query.inversor_id) {
    query = query.eq('inversor_id', req.query.inversor_id);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('peticiones')
    .select('*, inversores(id, nombre, apellidos, pipeline)')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/', audit('peticiones', 'create'), async (req, res) => {
  const { data, error } = await supabase
    .from('peticiones')
    .insert([req.body])
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/:id', audit('peticiones', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('peticiones')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', audit('peticiones', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('peticiones')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
