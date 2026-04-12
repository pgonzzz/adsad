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

router.delete('/:id', audit('propiedades', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('propiedades')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

export default router;
